(() => {
    const STORAGE_KEY = LOCAL_STORAGE_KEY;
    const STORAGE_META_KEY = `${STORAGE_KEY}-meta`;
    let memoryRecords = [];
    let lastListResponseText = null;
    let localWriteDisabled = false;
    let persistTimer = null;

    function cloneRecords(records) {
        return (records || []).map((record) => TintoreriaUtils.defaultRecord(record));
    }

    function loadLocalRecords() {
        if (memoryRecords.length) {
            return cloneRecords(memoryRecords);
        }

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            const records = Array.isArray(parsed)
                ? parsed.map((record) => TintoreriaUtils.defaultRecord(record))
                : [];
            memoryRecords = cloneRecords(records);
            return records;
        } catch (error) {
            console.error('No se pudo leer el cache local', error);
            return [];
        }
    }

    function writeLocalStorageRecords(records) {
        // Si la hoja completa no entra en la cuota de localStorage no vale la
        // pena reintentarlo: serializar miles de filas para volver a fallar
        // costaba segundos en cada guardado. Desde ahi la cache vive en memoria.
        if (localWriteDisabled) {
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
        } catch (error) {
            localWriteDisabled = true;
            console.warn('No se pudo guardar el cache local, se usara solo memoria.', error);
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (removeError) {
                console.warn('No se pudo limpiar el cache local.', removeError);
            }
        }
    }

    function saveLocalRecords(records) {
        memoryRecords = cloneRecords(records);
        writeLocalStorageRecords(records);
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
        try {
            localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
        } catch (error) {
            console.warn('No se pudo guardar la metadata del cache.', error);
            try {
                localStorage.removeItem(STORAGE_META_KEY);
            } catch (removeError) {
                console.warn('No se pudo limpiar la metadata del cache.', removeError);
            }
        }
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

    function updateRemoteCache(records) {
        return saveRecordsSnapshot(records, 'remote');
    }

    function updateLocalCache(records) {
        return saveRecordsSnapshot(records, 'local');
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

    function parseGvizPayload(text) {
        const source = String(text || '').trim();
        const prefix = 'google.visualization.Query.setResponse(';
        const suffix = ');';
        const start = source.indexOf(prefix);

        if (start === -1) {
            throw new Error('La respuesta del Sheet no tiene el formato esperado.');
        }

        const jsonStart = start + prefix.length;
        const jsonEnd = source.lastIndexOf(suffix);
        if (jsonEnd === -1 || jsonEnd <= jsonStart) {
            throw new Error('No se pudo extraer el JSON del Sheet.');
        }

        return JSON.parse(source.slice(jsonStart, jsonEnd));
    }

    function normalizeGvizCell(cell) {
        if (!cell || cell.v === null || cell.v === undefined) {
            return '';
        }

        if (typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
            return String(cell.f || '').trim();
        }

        if (cell.f !== undefined && cell.f !== null && String(cell.f).trim() !== '') {
            return String(cell.f).trim();
        }

        return String(cell.v).trim();
    }

    function buildRecordsFromGvizTable(table) {
        const cols = Array.isArray(table && table.cols) ? table.cols : [];
        const rows = Array.isArray(table && table.rows) ? table.rows : [];
        const headers = cols.map((column) => String(column && column.label ? column.label : '').trim());

        return rows.map((row) => {
            const cells = Array.isArray(row && row.c) ? row.c : [];
            const record = {};

            headers.forEach((header, index) => {
                if (!header) {
                    return;
                }

                const value = normalizeGvizCell(cells[index]);
                if (Object.prototype.hasOwnProperty.call(record, header)) {
                    if (!String(record[header] || '').trim() && String(value || '').trim()) {
                        record[header] = value;
                    }
                    return;
                }

                record[header] = value;
            });

            return TintoreriaUtils.defaultRecord(record);
        });
    }

    async function listRemoteRecords() {
        const url = new URL(`https://docs.google.com/spreadsheets/d/${encodeURIComponent(SHEET_ID)}/gviz/tq`);
        url.searchParams.set('tqx', 'out:json');
        url.searchParams.set('sheet', DATA_SHEET_NAME);

        const response = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Accept: 'application/json, text/javascript, */*;q=0.1'
            }
        });

        if (!response.ok) {
            throw new Error(`El Sheet respondio con HTTP ${response.status}.`);
        }

        const text = await response.text();

        // Si el Sheet devolvio exactamente lo mismo que la ultima vez, no se
        // reprocesa nada: parsear, normalizar y guardar toda la hoja es
        // costoso y congelaba un instante la interfaz en los celulares.
        if (lastListResponseText !== null && text === lastListResponseText && memoryRecords.length) {
            return null;
        }

        const payload = parseGvizPayload(text);
        if (payload.status !== 'ok') {
            throw new Error('El Sheet no devolvio datos validos.');
        }

        const records = buildRecordsFromGvizTable(payload.table || {});
        lastListResponseText = text;
        return records;
    }

    async function fetchJson(url) {
        const response = await fetch(url.toString(), {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Accept: 'application/json, text/javascript, */*;q=0.1'
            }
        });

        if (!response.ok) {
            throw new Error(`El servidor respondio con HTTP ${response.status}.`);
        }

        const payload = await response.json();
        if (!payload || payload.success === false) {
            throw new Error(payload && payload.message ? payload.message : 'El servidor no devolvio datos validos.');
        }

        return payload;
    }

    async function searchRemoteRecordsByOpPartida(query) {
        const normalizedQuery = TintoreriaUtils.normalizeOpPartidaSearchValue(query);

        if (!normalizedQuery) {
            return [];
        }

        if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
            return [];
        }

        const url = new URL(WEB_APP_URL);
        url.searchParams.set('action', 'searchOpPartida');
        url.searchParams.set('query', query);

        const payload = await fetchJson(url);
        return TintoreriaUtils.sortRecords(
            (payload.records || []).map((record) => TintoreriaUtils.defaultRecord(record))
        );
    }

    async function postPayloadNoCors(payload) {
        const formData = new URLSearchParams();
        formData.set('payload', JSON.stringify(payload));
        if (payload && payload.action) {
            formData.set('action', String(payload.action));
        }

        await fetch(WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: formData
        });
    }

    // Campos que deciden el orden de la cache (ver TintoreriaUtils.sortRecords).
    const CACHE_SORT_FIELDS = ['F_ing_crudo', 'fecha_registro'];

    // La copia en disco se deja para despues del guardado: es solo respaldo y
    // serializar la hoja entera bloqueaba la interfaz justo al tocar Guardar.
    function scheduleLocalStoragePersist() {
        if (localWriteDisabled || persistTimer) {
            return;
        }

        persistTimer = setTimeout(() => {
            persistTimer = null;
            writeLocalStorageRecords(memoryRecords);
            saveStorageMeta({
                mode: 'remote',
                updatedAt: new Date().toISOString(),
                recordCount: memoryRecords.length
            });
        }, 1500);
    }

    // Aplica los cambios sobre la cache tocando solo los registros afectados.
    // Antes cada guardado clonaba, normalizaba y ordenaba la hoja entera (miles
    // de filas x ~160 columnas) varias veces, y en eso se iba casi toda la
    // demora que se sentia al guardar una auditoria de varias filas.
    function applyOptimisticChanges(updates) {
        const meta = loadStorageMeta();
        if (!meta || meta.mode !== 'remote') {
            return [];
        }

        if (!memoryRecords.length) {
            loadLocalRecords();
        }

        if (!memoryRecords.length) {
            return [];
        }

        // memoryRecords es interno: loadLocalRecords clona al leer y
        // saveLocalRecords clona al escribir, asi que nadie de fuera comparte
        // estos objetos y se pueden reutilizar los que no cambian.
        const records = memoryRecords.slice();
        const indexById = new Map();
        records.forEach((record, index) => {
            indexById.set(String(record.id_registro || '').trim(), index);
        });

        const touched = [];
        let needsSort = false;

        (updates || []).forEach((update) => {
            const recordId = String(update && update.id_registro ? update.id_registro : '').trim();
            if (!recordId) {
                return;
            }

            const changes = update && update.changes ? update.changes : {};
            const index = indexById.has(recordId) ? indexById.get(recordId) : -1;
            const nextRecord = TintoreriaUtils.defaultRecord({
                ...(index >= 0 ? records[index] : {}),
                id_registro: recordId,
                ...changes
            });

            if (index >= 0) {
                records[index] = nextRecord;
            } else {
                indexById.set(recordId, records.length);
                records.push(nextRecord);
                needsSort = true;
            }

            if (CACHE_SORT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(changes, field))) {
                needsSort = true;
            }

            touched.push(nextRecord);
        });

        if (!touched.length) {
            return [];
        }

        // Reordenar solo si cambio algo que afecta al orden: sortRecords parsea
        // dos fechas por comparacion y con miles de filas se nota.
        memoryRecords = needsSort ? TintoreriaUtils.sortRecords(records) : records;
        scheduleLocalStoragePersist();

        return touched.map((record) => TintoreriaUtils.defaultRecord(record));
    }

    function updateLocalRecord(recordId, changes) {
        const current = loadLocalRecords();
        const index = current.findIndex((record) => String(record.id_registro || '').trim() === String(recordId || '').trim());

        if (index === -1) {
            throw new Error('No se encontro el registro a actualizar.');
        }

        current[index] = TintoreriaUtils.defaultRecord({
            ...current[index],
            ...changes
        });

        updateLocalCache(current);
        return current[index];
    }

    function updateLocalRecords(updates) {
        const current = loadLocalRecords();
        const records = [];

        (updates || []).forEach((update) => {
            const recordId = update && update.id_registro ? update.id_registro : '';
            const changes = update && update.changes ? update.changes : {};
            const index = current.findIndex((record) => String(record.id_registro || '').trim() === String(recordId || '').trim());

            if (index === -1) {
                return;
            }

            current[index] = TintoreriaUtils.defaultRecord({
                ...current[index],
                ...changes
            });
            records.push(current[index]);
        });

        updateLocalCache(current);
        return records;
    }

    window.TintoreriaAPI = {
        getCachedRecords() {
            return loadRemoteCachedRecords();
        },

        async listRecords() {
            const remoteRecords = await listRemoteRecords();

            // null: el Sheet no cambio desde la ultima consulta.
            if (remoteRecords === null) {
                return {
                    success: true,
                    source: 'remote',
                    unchanged: true,
                    records: []
                };
            }

            const records = updateRemoteCache(remoteRecords);
            return {
                success: true,
                source: 'remote',
                records
            };
        },

        async findRecordsByOpPartida(query) {
            const remoteRecords = await searchRemoteRecordsByOpPartida(query);

            if (remoteRecords.length) {
                const cached = loadRemoteCachedRecords();
                const baseRecords = cached && Array.isArray(cached.records) ? cached.records : loadLocalRecords();
                updateRemoteCache(mergeRecordsById(baseRecords, remoteRecords));
            }

            return {
                success: true,
                source: 'remote',
                records: remoteRecords
            };
        },

        async updateRecord(recordId, changes) {
            if (!recordId) {
                throw new Error('El registro no tiene id_registro.');
            }

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                return {
                    success: true,
                    source: 'local',
                    record: updateLocalRecord(recordId, changes)
                };
            }

            const optimisticRecords = applyOptimisticChanges([{ id_registro: recordId, changes }]);

            await postPayloadNoCors({
                action: 'updateRecord',
                id_registro: recordId,
                changes
            });

            return {
                success: true,
                source: 'remote',
                record: optimisticRecords.length ? optimisticRecords[0] : null
            };
        },

        async updateRecords(updates) {
            if (!Array.isArray(updates) || updates.length === 0) {
                return {
                    success: true,
                    source: TintoreriaUtils.hasConfiguredWebAppUrl() ? 'remote' : 'local',
                    records: []
                };
            }

            if (!TintoreriaUtils.hasConfiguredWebAppUrl()) {
                return {
                    success: true,
                    source: 'local',
                    records: updateLocalRecords(updates)
                };
            }

            const optimisticRecords = applyOptimisticChanges(updates);

            await postPayloadNoCors({
                action: 'updateRecords',
                updates
            });

            return {
                success: true,
                source: 'remote',
                records: optimisticRecords
            };
        }
    };
})();
