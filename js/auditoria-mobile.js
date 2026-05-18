(() => {
    const state = {
        records: [],
        filteredRecords: [],
        currentQuery: '',
        selectedIds: new Set(),
        toastTimer: null,
        syncing: false
    };

    function getElements() {
        return {
            form: document.getElementById('auditoria-mobile-search-form'),
            searchInput: document.getElementById('auditoria-mobile-search'),
            syncStatus: document.getElementById('auditoria-mobile-sync-status'),
            resultSummary: document.getElementById('auditoria-mobile-result-summary'),
            resultList: document.getElementById('auditoria-mobile-results'),
            selectAllBtn: document.getElementById('auditoria-mobile-select-all'),
            formCard: document.getElementById('auditoria-mobile-form-card'),
            selectionSummary: document.getElementById('auditoria-mobile-selection-summary'),
            turnoInput: document.getElementById('auditoria-mobile-turno'),
            auditorInput: document.getElementById('auditoria-mobile-auditor'),
            saveBtn: document.getElementById('auditoria-mobile-save'),
            toast: document.getElementById('auditoria-mobile-toast')
        };
    }

    function calculateTurno() {
        const now = new Date();
        const hours = now.getHours();
        if (hours >= 7 && hours < 15) return '1T';
        if (hours >= 15 && hours < 23) return '2T';
        return '3T';
    }

    function normalizeCalidadState(record) {
        return String(record && record.calidad_estado ? record.calidad_estado : '')
            .trim()
            .toUpperCase();
    }

    function getDisplayCalidadState(record) {
        const normalizedState = normalizeCalidadState(record);
        if (!normalizedState) {
            return '';
        }

        if (normalizedState === 'OK') {
            return 'OK';
        }

        if (normalizedState === '1ER RECHAZO') return '1er RECHAZO';
        if (normalizedState === '2DO RECHAZO') return '2do RECHAZO';
        if (normalizedState === '3ER RECHAZO') return '3er RECHAZO';
        if (normalizedState === '4TO RECHAZO') return '4to RECHAZO';
        return record.calidad_estado || normalizedState;
    }

    function isRejectedRecord(record) {
        return /RECHAZO/.test(normalizeCalidadState(record));
    }

    function isAuditoriaAlreadyRegistered(record) {
        return Boolean(record && String(record.calidad_inicio || '').trim());
    }

    function getRejectReasonEntries(record) {
        return [1, 2, 3, 4]
            .map((index) => {
                const value = String(record && record[`motivo_rechazo_${index}`] ? record[`motivo_rechazo_${index}`] : '').trim();
                return value
                    ? {
                        label: `Motivo ${index}`,
                        value
                    }
                    : null;
            })
            .filter(Boolean);
    }

    function getAuditoriaRegisteredStatus(record) {
        if (!isAuditoriaAlreadyRegistered(record)) {
            return 'Pendiente';
        }

        if (normalizeCalidadState(record) === 'OK') {
            return 'Ya fue registrado: APROBADO';
        }

        if (isRejectedRecord(record)) {
            const reasons = getRejectReasonEntries(record);
            const reasonLabel = reasons.length
                ? ` - ${reasons.map((entry) => `${entry.label}: ${entry.value}`).join(' | ')}`
                : '';
            return `Ya fue registrado: ${getDisplayCalidadState(record).toUpperCase()}${reasonLabel}`;
        }

        return 'Ya fue registrado: AUDITANDO';
    }

    function formatRecordTitle(record) {
        return `${record.cliente || 'Sin cliente'} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)}`;
    }

    function findRecordById(recordId) {
        return state.records.find((record) => String(record.id_registro || '') === String(recordId || '')) || null;
    }

    function setSyncStatus(message, isError = false) {
        const { syncStatus } = getElements();
        if (!syncStatus) return;
        syncStatus.textContent = message;
        syncStatus.style.color = isError ? 'var(--danger-text)' : 'var(--muted)';
    }

    function showToast(message) {
        const { toast } = getElements();
        if (!toast) return;

        toast.textContent = message;
        toast.classList.remove('hidden');

        if (state.toastTimer) {
            clearTimeout(state.toastTimer);
        }

        state.toastTimer = window.setTimeout(() => {
            toast.classList.add('hidden');
        }, 3200);
    }

    function setRecords(records) {
        state.records = TintoreriaUtils.sortRecords(
            (records || []).map((record) => TintoreriaUtils.defaultRecord(record))
        );
    }

    function filterByExactOpPartida(query) {
        const normalizedQuery = TintoreriaUtils.normalizeOpPartidaSearchValue(query);
        if (!normalizedQuery) {
            return [];
        }

        return state.records.filter((record) => {
            const opPartida = TintoreriaUtils.formatOpPartida(record.op_tela, record.partida);
            return TintoreriaUtils.normalizeOpPartidaSearchValue(opPartida) === normalizedQuery;
        });
    }

    function getSelectableVisibleIds() {
        return state.filteredRecords
            .filter((record) => !isAuditoriaAlreadyRegistered(record))
            .map((record) => String(record.id_registro || ''))
            .filter(Boolean);
    }

    function pruneSelection() {
        const validIds = new Set(state.filteredRecords.map((record) => String(record.id_registro || '')));
        const nextSelection = new Set();

        state.selectedIds.forEach((recordId) => {
            if (validIds.has(recordId)) {
                nextSelection.add(recordId);
            }
        });

        state.selectedIds = nextSelection;
    }

    function renderResults() {
        const els = getElements();
        if (!els.resultList || !els.resultSummary || !els.formCard || !els.selectionSummary || !els.selectAllBtn) {
            return;
        }

        const query = state.currentQuery.trim();

        if (!query) {
            state.filteredRecords = [];
            state.selectedIds.clear();
            els.resultSummary.textContent = 'Ingresa una OP-PTDA para comenzar.';
            els.resultList.innerHTML = '<div class="empty-state">Ingresa una OP-PTDA para ver coincidencias exactas.</div>';
            els.formCard.classList.add('hidden');
            els.selectAllBtn.classList.add('hidden');
            return;
        }

        state.filteredRecords = filterByExactOpPartida(query);
        pruneSelection();

        if (!state.filteredRecords.length) {
            els.resultSummary.textContent = 'No se encontraron filas para esa OP-PTDA.';
            els.resultList.innerHTML = '<div class="empty-state">No se encontraron coincidencias exactas para la OP-PTDA ingresada.</div>';
            els.formCard.classList.add('hidden');
            els.selectAllBtn.classList.add('hidden');
            return;
        }

        const selectableIds = getSelectableVisibleIds();
        const selectedCount = selectableIds.filter((recordId) => state.selectedIds.has(recordId)).length;

        els.resultSummary.textContent = '';
        els.selectAllBtn.classList.toggle('hidden', selectableIds.length === 0);
        els.selectAllBtn.textContent =
            selectableIds.length > 0 && selectedCount === selectableIds.length
                ? 'Limpiar seleccion'
                : 'Seleccionar todo';

        els.resultList.innerHTML = state.filteredRecords.map((record) => {
            const recordId = String(record.id_registro || '');
            const checked = state.selectedIds.has(recordId) ? 'checked' : '';
            const disabled = isAuditoriaAlreadyRegistered(record);
            const selectedClass = !disabled && checked ? ' record-card-selected' : '';
            const article = TintoreriaUtils.escapeHtml(record.articulo || '');
            const statusText = TintoreriaUtils.escapeHtml(getAuditoriaRegisteredStatus(record));
            const reasonText = disabled && isRejectedRecord(record)
                ? `<div class="record-reason">${TintoreriaUtils.escapeHtml(statusText)}</div>`
                : '';

            return `
                <article
                    class="record-card${disabled ? ' record-card-disabled' : ' record-card-selectable'}${selectedClass}"
                    ${disabled ? '' : `data-record-id="${TintoreriaUtils.escapeHtml(recordId)}"`}
                >
                    <div class="record-head">
                        <div class="record-title">${TintoreriaUtils.escapeHtml(formatRecordTitle(record))}</div>
                        <span class="status-pill ${disabled ? 'status-registered' : 'status-pending'}">
                            ${disabled ? 'Registrado' : 'Pendiente'}
                        </span>
                    </div>

                    <div class="record-subtitle">${article}</div>

                    <div class="record-meta">
                        <div class="meta-line"><strong>Kg(crudo):</strong> ${TintoreriaUtils.escapeHtml(record.peso_kg_crudo || '0')} <span class="meta-separator">|</span> <strong>#rollos/cntd:</strong> ${TintoreriaUtils.escapeHtml(record.cantidad_crudo || '0')}</div>
                    </div>

                    ${reasonText}

                    <div class="select-row">
                        ${disabled
                            ? `<span class="meta-line">${statusText}</span>`
                            : `<label class="checkbox-label"><input type="checkbox" class="auditoria-mobile-checkbox" data-record-id="${TintoreriaUtils.escapeHtml(recordId)}" ${checked}>Seleccionar</label>`
                        }
                    </div>
                </article>
            `;
        }).join('');

        els.selectionSummary.textContent = '';
        els.formCard.classList.toggle('hidden', selectedCount === 0);
    }

    function updateSelected(recordId, checked) {
        if (!recordId) {
            return;
        }

        if (checked) {
            state.selectedIds.add(recordId);
        } else {
            state.selectedIds.delete(recordId);
        }

        renderResults();
    }

    function toggleSelected(recordId) {
        if (!recordId) {
            return;
        }

        updateSelected(recordId, !state.selectedIds.has(recordId));
    }

    function toggleSelectAll() {
        const selectableIds = getSelectableVisibleIds();
        if (!selectableIds.length) {
            return;
        }

        const allSelected = selectableIds.every((recordId) => state.selectedIds.has(recordId));
        if (allSelected) {
            selectableIds.forEach((recordId) => state.selectedIds.delete(recordId));
        } else {
            selectableIds.forEach((recordId) => state.selectedIds.add(recordId));
        }

        renderResults();
    }

    async function search(query) {
        state.currentQuery = String(query || '').trim().toUpperCase();
        renderResults();
    }

    function mergeUpdatedRecord(updatedRecord) {
        if (!updatedRecord || !updatedRecord.id_registro) {
            return;
        }

        const targetId = String(updatedRecord.id_registro);
        state.records = state.records.map((record) => {
            if (String(record.id_registro || '') !== targetId) {
                return record;
            }

            return TintoreriaUtils.defaultRecord({
                ...record,
                ...updatedRecord
            });
        });
    }

    async function handleSave() {
        const els = getElements();
        const selectedIds = Array.from(state.selectedIds);
        const auditor = TintoreriaUtils.sanitizePersonName(els.auditorInput.value || '');
        const turno = String(els.turnoInput.value || calculateTurno()).trim() || calculateTurno();

        if (!selectedIds.length) {
            showToast('Selecciona al menos una fila.');
            return;
        }

        if (!auditor) {
            showToast('Ingresa el nombre del auditor.');
            els.auditorInput.focus();
            return;
        }

        els.saveBtn.disabled = true;
        els.saveBtn.textContent = 'Guardando...';

        try {
            const updatesList = selectedIds.map((recordId) => {
                const record = findRecordById(recordId);
                if (!record) {
                    return Promise.resolve(null);
                }

                const updates = {
                    calidad_turno: turno,
                    calidad_auditor: auditor,
                    calidad_inicio: TintoreriaUtils.formatProcessDateTime(new Date())
                };

                const ruta = String(record.ruta || '').toUpperCase();
                if (ruta.includes('HUMECT') || ruta.includes('TERMOFI')) {
                    updates.plegado_estado = 'OK';
                    updates.rama_crudo_estado = 'OK';
                    updates.preparado_estado = 'OK';
                    updates.tenido_estado = 'OK';
                    updates.abridora_estado = 'OK';
                    updates.rama_tenido_estado = 'OK';
                    updates.acabado_especial_estado = 'OK';
                    updates.acab_espec_estado = 'OK';
                } else if (ruta.includes('DIRECTO')) {
                    updates.preparado_estado = 'OK';
                    updates.tenido_estado = 'OK';
                    updates.abridora_estado = 'OK';
                    updates.rama_tenido_estado = 'OK';
                    updates.acabado_especial_estado = 'OK';
                    updates.acab_espec_estado = 'OK';
                }

                return TintoreriaAPI.updateRecord(recordId, updates);
            });

            const responses = await Promise.all(updatesList);
            responses.forEach((response) => {
                if (response && response.record) {
                    mergeUpdatedRecord(response.record);
                }
            });

            state.selectedIds.clear();
            els.auditorInput.value = '';
            renderResults();
            showToast(`Auditoria guardada en ${selectedIds.length} fila(s).`);
        } catch (error) {
            showToast(error && error.message ? error.message : 'No se pudo guardar la auditoria.');
        } finally {
            els.saveBtn.disabled = false;
            els.saveBtn.textContent = 'Guardar Auditoria';
        }
    }

    function bindEvents() {
        const els = getElements();
        if (!els.form || !els.searchInput || !els.resultList || !els.saveBtn || !els.selectAllBtn) {
            return;
        }

        els.form.addEventListener('submit', (event) => {
            event.preventDefault();
            search(els.searchInput.value);
        });

        els.searchInput.addEventListener('input', () => {
            search(els.searchInput.value);
        });

        els.resultList.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) {
                return;
            }

            if (!target.classList.contains('auditoria-mobile-checkbox')) {
                return;
            }

            updateSelected(target.dataset.recordId || '', target.checked);
        });

        els.resultList.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            if (target.closest('.checkbox-label') || target.closest('.auditoria-mobile-checkbox')) {
                return;
            }

            const card = target.closest('.record-card-selectable');
            if (!card) {
                return;
            }

            toggleSelected(card.getAttribute('data-record-id') || '');
        });

        els.selectAllBtn.addEventListener('click', toggleSelectAll);
        els.saveBtn.addEventListener('click', handleSave);
        els.turnoInput.value = calculateTurno();
    }

    async function hydrateFromCache() {
        if (!window.TintoreriaAPI || typeof TintoreriaAPI.getCachedRecords !== 'function') {
            return false;
        }

        const cached = TintoreriaAPI.getCachedRecords();
        if (!cached || !Array.isArray(cached.records) || !cached.records.length) {
            return false;
        }

        setRecords(cached.records);
        setSyncStatus(`Mostrando cache local (${cached.records.length} registros). Sincronizando...`);
        renderResults();
        return true;
    }

    async function refreshRemoteRecords() {
        if (!window.TintoreriaAPI || typeof TintoreriaAPI.listRecords !== 'function') {
            setSyncStatus('No se encontro la API configurada.', true);
            return;
        }

        state.syncing = true;
        setSyncStatus('Sincronizando datos con la web...');

        try {
            const response = await TintoreriaAPI.listRecords();
            setRecords(response.records || []);
            renderResults();
            setSyncStatus('');
        } catch (error) {
            setSyncStatus(error && error.message ? error.message : 'No se pudo sincronizar la informacion.', true);
        } finally {
            state.syncing = false;
        }
    }

    async function init() {
        bindEvents();
        await hydrateFromCache();
        await refreshRemoteRecords();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
