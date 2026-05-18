(() => {
    const STORAGE_META_KEY = `${LOCAL_STORAGE_KEY}-meta`;

    function loadLocalRecords() {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed)
                ? parsed.map((record) => TintoreriaUtils.defaultRecord(record))
                : [];
        } catch (error) {
            console.error('No se pudo leer localStorage', error);
            return [];
        }
    }

    function saveLocalRecords(records) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
    }

    function loadStorageMeta() {
        try {
            const raw = localStorage.getItem(STORAGE_META_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
                ? parsed
                : null;
        } catch (error) {
            console.error('No se pudo leer la metadata del cache', error);
            return null;
        }
    }

    function saveStorageMeta(meta = {}) {
        localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
    }

    function saveRecordsSnapshot(records, mode) {
        const normalizedRecords = TintoreriaUtils.sortRecords(
            (records || []).map((record) => TintoreriaUtils.defaultRecord(record))
        );
        saveLocalRecords(normalizedRecords);
        saveStorageMeta({
            mode,
            updatedAt: new Date().toISOString(),
            recordCount: normalizedRecords.length
        });
        return normalizedRecords;
    }

    function loadRemoteCachedRecords() {
        const meta = loadStorageMeta();
        if (!meta || meta.mode !== 'remote') {
            return null;
        }

        return {
            success: true,
            source: 'cache',
            cachedAt: meta.updatedAt || '',
            records: TintoreriaUtils.sortRecords(loadLocalRecords())
        };
    }

    function mergeRecordsById(baseRecords, nextRecords) {
        const mergedById = new Map();

        (baseRecords || []).forEach((record) => {
            const normalized = TintoreriaUtils.defaultRecord(record);
            mergedById.set(String(normalized.id_registro || ''), normalized);
        });

        (nextRecords || []).forEach((record) => {
            const normalized = TintoreriaUtils.defaultRecord(record);
            mergedById.set(String(normalized.id_registro || ''), normalized);
        });

        return Array.from(mergedById.values());
    }

    function updateRemoteCache(records) {
        return saveRecordsSnapshot(records, 'remote');
    }

    function updateLocalModeSnapshot(records) {
        return saveRecordsSnapshot(records, 'local');
    }

    function matchesRecord(record, recordId, match = null) {
        if (!record || String(record.id_registro || '').trim() !== String(recordId || '').trim()) {
            return false;
        }

        const recordKey = match && match.record_key
            ? String(match.record_key).trim()
            : '';

        if (!recordKey) {
            return true;
        }

        return TintoreriaUtils.buildRecordMatchKey(record) === recordKey;
    }

    function buildLocalRecord(record) {
        return TintoreriaUtils.defaultRecord({
            ...record,
            id_registro: record.id_registro || `LOCAL-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
            fecha_registro: record.fecha_registro || TintoreriaUtils.formatDateTimeShort(new Date()),
            plegado_estado: record.plegado_estado || 'X PROG'
        });
    }

    async function parseJsonResponse(response) {
        if (!response.ok) {
            throw new Error(`La API respondio con HTTP ${response.status}.`);
        }

        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new Error('La respuesta del Apps Script no es JSON valido.');
        }

        if (!data.success) {
            throw new Error(data.message || 'La API devolvio un error.');
        }

        return data;
    }

    async function postPayload(payload) {
        const formData = new URLSearchParams();
        formData.set('payload', JSON.stringify(payload));
        if (payload && payload.action) {
            formData.set('action', String(payload.action));
        }

        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: formData
        });

        return parseJsonResponse(response);
    }

    async function listRemoteRecords() {
        const url = new URL(WEB_APP_URL);
        url.searchParams.set('action', 'list');

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });

        return parseJsonResponse(response);
    }

    window.TintoreriaAPI = {
        getCachedRecords() {
            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                return null;
            }

            return loadRemoteCachedRecords();
        },

        async listRecords() {
            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                return {
                    success: true,
                    source: 'local',
                    records: TintoreriaUtils.sortRecords(loadLocalRecords())
                };
            }

            const data = await listRemoteRecords();
            const records = updateRemoteCache(data.records || []);
            return {
                success: true,
                source: 'remote',
                records
            };
        },

        async appendRecords(records) {
            if (!Array.isArray(records) || records.length === 0) {
                return {
                    success: true,
                    source: TintoreriaUtils.hasConfiguredWebAppUrl() ? 'remote' : 'local',
                    records: []
                };
            }

            const prepared = records.map((record) => TintoreriaUtils.defaultRecord(record));

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                const current = loadLocalRecords();
                const existingKeys = new Set(
                    current
                        .map((record) => TintoreriaUtils.buildMaestroDuplicateKey(record.op_tela, record.partida, record.cod_art, record.color))
                        .filter(Boolean)
                );
                const appended = [];

                prepared.forEach((record) => {
                    const duplicateKey = TintoreriaUtils.buildMaestroDuplicateKey(record.op_tela, record.partida, record.cod_art, record.color);
                    if (duplicateKey && existingKeys.has(duplicateKey)) {
                        return;
                    }

                    const builtRecord = buildLocalRecord(record);
                    appended.push(builtRecord);

                    if (duplicateKey) {
                        existingKeys.add(duplicateKey);
                    }
                });

                const merged = TintoreriaUtils.sortRecords(current.concat(appended));
                updateLocalModeSnapshot(merged);
                return {
                    success: true,
                    source: 'local',
                    records: appended
                };
            }

            const data = await postPayload({
                action: 'appendRecords',
                records: prepared
            });
            const appended = (data.records || []).map((record) => TintoreriaUtils.defaultRecord(record));
            const cached = loadRemoteCachedRecords();
            if (cached) {
                updateRemoteCache(mergeRecordsById(cached.records, appended));
            }

            return {
                success: true,
                source: 'remote',
                records: appended
            };
        },

        async updateRecord(recordId, changes, options = {}) {
            if (!recordId) {
                throw new Error('El registro no tiene id_registro.');
            }

            const match = options && options.match ? options.match : null;

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                const current = loadLocalRecords();
                const index = current.findIndex((record) => matchesRecord(record, recordId, match));

                if (index === -1) {
                    throw new Error('No se encontro el registro a actualizar.');
                }

                current[index] = TintoreriaUtils.defaultRecord({
                    ...current[index],
                    ...changes
                });
                updateLocalModeSnapshot(current);

                return {
                    success: true,
                    source: 'local',
                    record: current[index]
                };
            }

            const data = await postPayload({
                action: 'updateRecord',
                id_registro: recordId,
                changes,
                match
            });
            const updatedRecord = data.record ? TintoreriaUtils.defaultRecord(data.record) : null;
            const cached = loadRemoteCachedRecords();

            if (updatedRecord && cached) {
                const merged = mergeRecordsById(cached.records, [updatedRecord]);
                updateRemoteCache(merged);
            }

            return {
                success: true,
                source: 'remote',
                record: updatedRecord
            };
        }
    };
})();
