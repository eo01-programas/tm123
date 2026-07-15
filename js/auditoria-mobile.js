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
            scanButton: document.getElementById('auditoria-mobile-scan-button'),
            syncStatus: document.getElementById('auditoria-mobile-sync-status'),
            resultSummary: document.getElementById('auditoria-mobile-result-summary'),
            resultList: document.getElementById('auditoria-mobile-results'),
            selectAllBtn: document.getElementById('auditoria-mobile-select-all'),
            formCard: document.getElementById('auditoria-mobile-form-card'),
            selectionSummary: document.getElementById('auditoria-mobile-selection-summary'),
            turnoInput: document.getElementById('auditoria-mobile-turno'),
            auditorInput: document.getElementById('auditoria-mobile-auditor'),
            observationInput: document.getElementById('auditoria-mobile-observacion-calidad'),
            saveBtn: document.getElementById('auditoria-mobile-save'),
            toast: document.getElementById('auditoria-mobile-toast'),
            supervisorFab: document.getElementById('auditoria-mobile-supervisor-fab')
        };
    }

    function calculateTurno() {
        const now = new Date();
        const hours = now.getHours();
        if (hours >= 6 && hours < 14) return '1T';
        if (hours >= 14 && hours < 23) return '2T';
        return '3T';
    }

    function normalizeCalidadState(record) {
        return String(record && record.calidad_estado ? record.calidad_estado : '')
            .trim()
            .toUpperCase();
    }

    function getLatestRejectNumber(record) {
        const rawCount = String(record && record.cantidad_rechazos ? record.cantidad_rechazos : '').trim();
        const parsedCount = Number.parseInt(rawCount, 10);
        if (parsedCount >= 1 && parsedCount <= 4) {
            return parsedCount;
        }

        for (let index = 4; index >= 1; index -= 1) {
            const motivo = String(record && record[`motivo_rechazo_${index}`] ? record[`motivo_rechazo_${index}`] : '').trim();
            const supervisor = String(record && record[`supervisor_rechazo_${index}`] ? record[`supervisor_rechazo_${index}`] : '').trim();
            const turno = String(record && record[`turno_rechazo_${index}`] ? record[`turno_rechazo_${index}`] : '').trim();
            if (motivo || supervisor || turno) {
                return index;
            }
        }

        return 0;
    }

    function getDisplayCalidadState(record) {
        const normalizedState = normalizeCalidadState(record);
        if (!normalizedState) {
            const rejectNumber = getLatestRejectNumber(record);
            if (rejectNumber === 1) return '1er Rechazo';
            if (rejectNumber === 2) return '2do Rechazo';
            if (rejectNumber === 3) return '3er Rechazo';
            if (rejectNumber === 4) return '4to Rechazo';
            return '';
        }

        if (normalizedState === 'OK') {
            return 'OK';
        }

        if (normalizedState === '1ER RECHAZO') return '1er RECHAZO';
        if (normalizedState === '2DO RECHAZO') return '2do RECHAZO';
        if (normalizedState === '3ER RECHAZO') return '3er RECHAZO';
        if (normalizedState === '4TO RECHAZO') return '4to RECHAZO';
        if (normalizedState === 'RECHAZADO') return '1er RECHAZO';
        return record.calidad_estado || normalizedState;
    }

    function isRejectedRecord(record) {
        const normalizedState = normalizeCalidadState(record);
        return /RECHAZO/.test(normalizedState)
            || normalizedState === 'RECHAZADO'
            || getLatestRejectNumber(record) > 0;
    }

    function normalizeApprovalType(record) {
        return String(record && record.tipo_aprobacion ? record.tipo_aprobacion : '')
            .trim()
            .toUpperCase();
    }

    function hasFinalApproval(record) {
        const approvalType = normalizeApprovalType(record);
        return approvalType === 'APROBADO'
            || approvalType === 'APROBADO C/TOLERANCIA'
            || approvalType === 'APROBADO C/TOLERACIA'
            || approvalType === 'APROBADO C/AUTORIZACION';
    }

    function isAuditoriaAlreadyRegistered(record) {
        return Boolean(record && String(record.calidad_inicio || '').trim());
    }

    function getRegisteredObservationLines(record) {
        if (!isAuditoriaAlreadyRegistered(record) && !hasFinalApproval(record) && !isRejectedRecord(record)) {
            return [];
        }

        const rejectionLabels = {
            1: '1er Rechazo',
            2: '2do Rechazo',
            3: '3er Rechazo',
            4: '4to Rechazo'
        };

        const rejectionLines = [1, 2, 3, 4]
            .map((index) => {
                const reason = String(record && record[`motivo_rechazo_${index}`] ? record[`motivo_rechazo_${index}`] : '').trim();
                const supervisor = String(record && record[`supervisor_rechazo_${index}`] ? record[`supervisor_rechazo_${index}`] : '').trim();
                const parts = [rejectionLabels[index], reason, supervisor].filter(Boolean);
                return parts.length > 1
                    ? { text: parts.join(' - '), type: 'rejection' }
                    : null;
            })
            .filter(Boolean);

        const approvalType = String(record && record.tipo_aprobacion ? record.tipo_aprobacion : '').trim();
        const approvedBy = String(record && record.quien_aprobo ? record.quien_aprobo : '').trim();
        const approvalLine = [approvalType, approvedBy].filter(Boolean).join(' - ');

        return approvalLine
            ? [...rejectionLines, { text: approvalLine, type: 'approval' }]
            : rejectionLines;
    }

    function getAuditoriaRegisteredStatus(record) {
        if (hasFinalApproval(record)) {
            return normalizeApprovalType(record);
        }

        if (isRejectedRecord(record)) {
            return `Tiene ${getDisplayCalidadState(record)}`;
        }

        if (!isAuditoriaAlreadyRegistered(record)) {
            return 'Pendiente';
        }

        if (normalizeCalidadState(record) === 'OK') {
            return 'Ya fue registrado';
        }

        return 'Ya fue registrado: AUDITANDO';
    }

    function buildEstadoUpdatesByRuta(ruta) {
        const normalizedRuta = String(ruta || '').toUpperCase();
        if (!normalizedRuta || normalizedRuta.includes('HUMECT') || normalizedRuta.includes('TERMOFI')) {
            return {
                plegado_estado: 'OK',
                rama_crudo_estado: 'OK',
                preparado_estado: 'OK',
                tenido_estado: 'OK',
                abridora_estado: 'OK',
                secado_estado: 'OK',
                rama_tenido_estado: 'OK',
                acabado_especial_estado: 'OK',
                acab_espec_estado: 'OK'
            };
        }
        if (normalizedRuta.includes('DIRECTO')) {
            return {
                preparado_estado: 'OK',
                tenido_estado: 'OK',
                abridora_estado: 'OK',
                secado_estado: 'OK',
                rama_tenido_estado: 'OK',
                acabado_especial_estado: 'OK',
                acab_espec_estado: 'OK'
            };
        }
        return {};
    }

    function formatRecordTitle(record) {
        return `${record.cliente || 'Sin cliente'} - ${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)}`;
    }

    function findRecordById(recordId) {
        return state.records.find((record) => String(record.id_registro || '') === String(recordId || '')) || null;
    }

    function getSelectedRecords() {
        return state.filteredRecords.filter((record) => state.selectedIds.has(String(record.id_registro || '')));
    }

    function getSharedFieldValue(records, fieldName) {
        if (!Array.isArray(records) || !records.length || !fieldName) {
            return '';
        }

        const values = records
            .map((record) => String(record && record[fieldName] ? record[fieldName] : ''))
            .map((value) => value.trim());

        if (values.length === 1) {
            return values[0];
        }

        const firstValue = values[0];
        return values.every((value) => value === firstValue) ? firstValue : '';
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
            .filter((record) => !hasFinalApproval(record))
            .map((record) => String(record.id_registro || ''))
            .filter(Boolean);
    }

    function pruneSelection() {
        const validIds = new Set(getSelectableVisibleIds());
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
            // Puede ser un registro recien agregado al Sheet: re-sincroniza sin recargar la pagina.
            requestAutoRefresh();
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
            const disabled = hasFinalApproval(record);
            const approved = hasFinalApproval(record);
            const rejected = !approved && isRejectedRecord(record);
            const selectedClass = !disabled && checked ? ' record-card-selected' : '';
            const approvedClass = approved ? ' record-card-approved' : '';
            const rejectedClass = rejected ? ' record-card-rejected' : '';
            const color = TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color || 'Sin color'));
            const article = TintoreriaUtils.escapeHtml(record.articulo || 'Sin articulo');
            const statusText = TintoreriaUtils.escapeHtml(getAuditoriaRegisteredStatus(record));
            const observationLines = getRegisteredObservationLines(record);
            const reasonText = observationLines.length
                ? `<div class="record-reason">${observationLines.map((line) => `<div class="record-line record-line-${TintoreriaUtils.escapeHtml(line.type || 'note')}">${TintoreriaUtils.escapeHtml(line.text || '')}</div>`).join('')}</div>`
                : '';
            const disabledFooter = disabled && !observationLines.length
                ? `<span class="meta-line">${statusText}</span>`
                : '';
            const selectRow = disabled
                ? (disabledFooter ? `<div class="select-row">${disabledFooter}</div>` : '')
                : `<div class="select-row"><label class="checkbox-label"><input type="checkbox" class="auditoria-mobile-checkbox" data-record-id="${TintoreriaUtils.escapeHtml(recordId)}" ${checked}>Seleccionar</label></div>`;

            return `
                <article
                    class="record-card${disabled ? ' record-card-disabled' : ' record-card-selectable'}${approvedClass}${rejectedClass}${selectedClass}"
                    ${disabled ? '' : `data-record-id="${TintoreriaUtils.escapeHtml(recordId)}"`}
                >
                    <div class="record-head">
                        <div class="record-title">${TintoreriaUtils.escapeHtml(formatRecordTitle(record))}</div>
                        <span class="status-pill ${disabled ? 'status-registered' : 'status-pending'}">
                            ${statusText}
                        </span>
                    </div>

                    <div class="record-detail-line"><strong>${color}</strong> <span>${article}</span></div>

                    <div class="record-meta">
                        <div class="meta-line"><strong>Kg(crudo):</strong> ${TintoreriaUtils.escapeHtml(record.peso_kg_crudo || '0')} <span class="meta-separator">|</span> <strong>#rollos/cntd:</strong> ${TintoreriaUtils.escapeHtml(record.cantidad_crudo || '0')}</div>
                    </div>

                    ${reasonText}

                    ${selectRow}
                </article>
            `;
        }).join('');

        els.selectionSummary.textContent = '';
        els.formCard.classList.toggle('hidden', selectedCount === 0);
        if (els.observationInput) {
            els.observationInput.value = selectedCount > 0
                ? getSharedFieldValue(getSelectedRecords(), 'observacion_calidad')
                : '';
        }
    }

    function syncSupervisorFabVisibility() {
        const els = getElements();
        if (!els.supervisorFab || !els.searchInput) {
            return;
        }

        const hasSearchValue = String(els.searchInput.value || '').trim() !== '';
        els.supervisorFab.classList.toggle('hidden', hasSearchValue);
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

    async function handleScan() {
        const els = getElements();
        if (!window.TintoreriaQR || typeof TintoreriaQR.scanQrCode !== 'function') {
            showToast('No se encontro el lector QR.');
            return;
        }

        if (els.scanButton) {
            els.scanButton.disabled = true;
        }

        try {
            const rawValue = await TintoreriaQR.scanQrCode();
            const opPartida = TintoreriaQR.normalizeScannedOpPartida(rawValue);
            els.searchInput.value = opPartida;
            syncSupervisorFabVisibility();
            await search(opPartida);
        } catch (error) {
            const message = error && error.message ? error.message : 'No se pudo escanear el QR.';
            if (message !== 'Escaneo cancelado.') {
                showToast(message);
            }
        } finally {
            if (els.scanButton) {
                els.scanButton.disabled = false;
            }
        }
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
        const observacion = String(els.observationInput && els.observationInput.value ? els.observationInput.value : '').trim();
        const turno = calculateTurno();
        els.turnoInput.value = turno;

        if (!selectedIds.length) {
            showToast('Selecciona al menos una fila.');
            return;
        }

        if (!auditor) {
            showToast('Ingresa el nombre del auditor.');
            els.auditorInput.focus();
            return;
        }

        if (!TintoreriaUtils.isValidAuditorName(auditor)) {
            showToast('En Auditor solo va el nombre. Escribe el detalle en Observacion de Calidad.');
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
                    ...buildEstadoUpdatesByRuta(record && record.ruta),
                    calidad_turno: turno,
                    calidad_auditor: auditor,
                    calidad_inicio: TintoreriaUtils.formatProcessDateTime(new Date()),
                    observacion_calidad: observacion
                };

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
            if (els.observationInput) {
                els.observationInput.value = '';
            }
            renderResults();
            showToast(`Auditoria guardada en ${selectedIds.length} fila(s).`);
        } catch (error) {
            showToast(error && error.message ? error.message : 'No se pudo guardar la auditoria.');
        } finally {
            els.saveBtn.disabled = false;
            els.saveBtn.textContent = 'Guardar Auditoria';
        }
    }

    function isEditableTarget(target) {
        return target instanceof Element
            && Boolean(target.closest('input, textarea, select, [contenteditable="true"], label'));
    }

    function dismissKeyboardIfNeeded(target) {
        if (isEditableTarget(target)) {
            return;
        }

        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) {
            return;
        }

        if (!activeElement.matches('input, textarea, select, [contenteditable="true"]')) {
            return;
        }

        activeElement.blur();
    }

    function bindEvents() {
        const els = getElements();
        if (!els.form || !els.searchInput || !els.resultList || !els.saveBtn || !els.selectAllBtn) {
            return;
        }

        document.addEventListener('pointerdown', (event) => {
            dismissKeyboardIfNeeded(event.target);
        });

        els.form.addEventListener('submit', (event) => {
            event.preventDefault();
            search(els.searchInput.value);
        });

        els.searchInput.addEventListener('input', () => {
            syncSupervisorFabVisibility();
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
        if (els.scanButton) {
            els.scanButton.addEventListener('click', handleScan);
        }
        els.turnoInput.value = calculateTurno();
        syncSupervisorFabVisibility();
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

    // --- Auto-refresh: vuelve a consultar el Sheet sin recargar la pagina ---

    const AUTO_REFRESH_MIN_INTERVAL_MS = 15000;
    let lastAutoRefreshAt = 0;
    let autoRefreshInFlight = false;

    async function requestAutoRefresh() {
        const now = Date.now();
        if (autoRefreshInFlight || now - lastAutoRefreshAt < AUTO_REFRESH_MIN_INTERVAL_MS) {
            return;
        }

        autoRefreshInFlight = true;
        lastAutoRefreshAt = now;

        try {
            await refreshRemoteRecords();
        } finally {
            autoRefreshInFlight = false;
        }
    }

    function bindAutoRefreshEvents() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                requestAutoRefresh();
            }
        });

        window.addEventListener('pageshow', (event) => {
            if (event.persisted) {
                requestAutoRefresh();
            }
        });
    }

    async function init() {
        bindEvents();
        bindAutoRefreshEvents();
        await hydrateFromCache();
        await refreshRemoteRecords();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
