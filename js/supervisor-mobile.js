(() => {
    const state = {
        records: [],
        filteredRecords: [],
        currentQuery: '',
        selectedIds: new Set(),
        toastTimer: null
    };

    function getElements() {
        return {
            form: document.getElementById('supervisor-mobile-search-form'),
            searchInput: document.getElementById('supervisor-mobile-search'),
            scanButton: document.getElementById('supervisor-mobile-scan-button'),
            syncStatus: document.getElementById('supervisor-mobile-sync-status'),
            resultSummary: document.getElementById('supervisor-mobile-result-summary'),
            resultList: document.getElementById('supervisor-mobile-results'),
            actionRow: document.getElementById('supervisor-mobile-actions'),
            approveBtn: document.getElementById('supervisor-mobile-approve-btn'),
            rejectBtn: document.getElementById('supervisor-mobile-reject-btn'),
            rejectModal: document.getElementById('supervisor-mobile-reject-modal'),
            rejectModalTitle: document.getElementById('supervisor-mobile-reject-title'),
            rejectModalSubtitle: document.getElementById('supervisor-mobile-reject-subtitle'),
            rejectModalClose: document.getElementById('supervisor-mobile-reject-close'),
            rejectForm: document.getElementById('supervisor-mobile-reject-form'),
            rejectClearBtn: document.getElementById('supervisor-mobile-reject-clear'),
            rejectSaveBtn: document.getElementById('supervisor-mobile-reject-save'),
            rejectMotivoInput: document.getElementById('supervisor-mobile-motivo-rechazo'),
            rejectMotivoList: document.getElementById('supervisor-mobile-motivo-rechazo-list'),
            rejectSupervisorInput: document.getElementById('supervisor-mobile-supervisor-rechazo'),
            rejectObservationInput: document.getElementById('supervisor-mobile-observacion-rechazo'),
            approveModal: document.getElementById('supervisor-mobile-approve-modal'),
            approveModalTitle: document.getElementById('supervisor-mobile-approve-title'),
            approveModalSubtitle: document.getElementById('supervisor-mobile-approve-subtitle'),
            approveModalClose: document.getElementById('supervisor-mobile-approve-close'),
            approveForm: document.getElementById('supervisor-mobile-approve-form'),
            approveClearBtn: document.getElementById('supervisor-mobile-approve-clear'),
            approveSaveBtn: document.getElementById('supervisor-mobile-approve-save'),
            approveTipoSelect: document.getElementById('supervisor-mobile-tipo-aprobacion'),
            approveQuienGroup: document.getElementById('supervisor-mobile-quien-aprobo-group'),
            approveQuienSelect: document.getElementById('supervisor-mobile-quien-aprobo'),
            approveSupervisorInput: document.getElementById('supervisor-mobile-supervisor-aprobacion'),
            approveObservationInput: document.getElementById('supervisor-mobile-observacion-aprobacion'),
            toast: document.getElementById('supervisor-mobile-toast')
        };
    }

    function optionMarkup(selectedValue, options, defaultLabel) {
        const values = Array.isArray(options) ? [...options] : [];
        if (selectedValue && !values.includes(selectedValue)) {
            values.push(selectedValue);
        }

        return values.map((optionValue) => {
            const label = optionValue || defaultLabel;
            const selected = selectedValue === optionValue ? 'selected' : '';
            return `<option value="${TintoreriaUtils.escapeHtml(optionValue)}" ${selected}>${TintoreriaUtils.escapeHtml(label)}</option>`;
        }).join('');
    }

    function datalistOptionMarkup(options) {
        return (options || [])
            .filter((optionValue) => String(optionValue || '').trim() !== '')
            .map((optionValue) => `<option value="${TintoreriaUtils.escapeHtml(optionValue)}"></option>`)
            .join('');
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

    function approvalTypeRequiresApprovedBy(approvalType) {
        return String(approvalType || '').trim().toUpperCase() === 'APROBADO C/AUTORIZACION';
    }

    function hasFinalApproval(record) {
        const approvalType = normalizeApprovalType(record);
        return approvalType === 'APROBADO'
            || approvalType === 'APROBADO C/TOLERANCIA'
            || approvalType === 'APROBADO C/TOLERACIA'
            || approvalType === 'APROBADO C/AUTORIZACION';
    }

    function isSupervisorDecisionLocked(record) {
        return hasFinalApproval(record) || normalizeCalidadState(record) === 'OK';
    }

    function isAuditoriaAlreadyRegistered(record) {
        return Boolean(record && String(record.calidad_inicio || '').trim());
    }

    function getRegisteredObservationLines(record) {
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
        const approvalSupervisor = String(record && record.supervisor_aprobacion ? record.supervisor_aprobacion : '').trim();
        const approvalLine = [approvalType, approvedBy, approvalSupervisor].filter(Boolean).join(' - ');

        return approvalLine
            ? [...rejectionLines, { text: approvalLine, type: 'approval' }]
            : rejectionLines;
    }

    function getAuditoriaRegisteredStatus(record) {
        if (hasFinalApproval(record)) {
            return normalizeApprovalType(record);
        }

        if (normalizeCalidadState(record) === 'OK') {
            return 'Aprobado';
        }

        if (isRejectedRecord(record)) {
            return `Tiene ${getDisplayCalidadState(record)}`;
        }

        if (!isAuditoriaAlreadyRegistered(record)) {
            return 'Pendiente';
        }

        return 'Auditado';
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
            .filter((record) => !isSupervisorDecisionLocked(record))
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

    function getSelectedRecords() {
        return state.filteredRecords.filter((record) => state.selectedIds.has(String(record.id_registro || '')));
    }

    function updateActionVisibility() {
        const { actionRow } = getElements();
        const hasSelection = getSelectedRecords().length > 0;

        if (!actionRow) {
            return;
        }

        actionRow.classList.toggle('hidden', !hasSelection);

        if (!hasSelection) {
            closeRejectModal();
            closeApproveModal();
        }
    }

    function buildSelectionSummary(records) {
        if (!records.length) {
            return 'No hay partidas seleccionadas.';
        }

        if (records.length === 1) {
            const record = records[0];
            return `${TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)} - ${record.articulo || 'Sin articulo'}`;
        }

        return `${records.length} partidas seleccionadas listas para procesar.`;
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

    function getCurrentRejectNumber(record) {
        const currentState = normalizeCalidadState(record);
        if (currentState === 'RECHAZADO' || currentState === '1ER RECHAZO') return 1;
        if (currentState === '2DO RECHAZO') return 2;
        if (currentState === '3ER RECHAZO') return 3;
        if (currentState === '4TO RECHAZO') return 4;
        return 0;
    }

    function getRejectStatusByNumber(rejectNumber) {
        if (rejectNumber === 1) return 'RECHAZADO';
        if (rejectNumber === 2) return '2do RECHAZO';
        if (rejectNumber === 3) return '3er RECHAZO';
        if (rejectNumber === 4) return '4to RECHAZO';
        return '';
    }

    function getNextRejectConfig(record) {
        const currentRejectNumber = getCurrentRejectNumber(record);
        const nextRejectNumber = currentRejectNumber + 1;
        if (nextRejectNumber < 1 || nextRejectNumber > 4) {
            return null;
        }

        return {
            rejectNumber: nextRejectNumber,
            finalStatus: getRejectStatusByNumber(nextRejectNumber)
        };
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

    function updateApproveQuienVisibility() {
        const els = getElements();
        const requiresApprovedBy = approvalTypeRequiresApprovedBy(
            els.approveTipoSelect && els.approveTipoSelect.value
                ? els.approveTipoSelect.value
                : ''
        );

        if (els.approveQuienGroup) {
            els.approveQuienGroup.classList.toggle('hidden', !requiresApprovedBy);
        }

        if (els.approveQuienSelect) {
            els.approveQuienSelect.disabled = !requiresApprovedBy;
            if (!requiresApprovedBy) {
                els.approveQuienSelect.value = '';
            }
        }
    }

    function openRejectModal() {
        const els = getElements();
        const selectedRecords = getSelectedRecords();
        if (!els.rejectModal || !selectedRecords.length) {
            return;
        }

        if (els.rejectForm instanceof HTMLFormElement) {
            els.rejectForm.reset();
        }

        if (els.rejectMotivoList) {
            els.rejectMotivoList.innerHTML = datalistOptionMarkup(TintoreriaConfig.MOTIVOS_RECHAZO_OPTIONS || []);
        }

        if (els.rejectObservationInput) {
            els.rejectObservationInput.value = getSharedFieldValue(selectedRecords, 'observacion_calidad');
        }

        if (els.rejectModalTitle) {
            els.rejectModalTitle.textContent = selectedRecords.length === 1
                ? 'Rechazar partida seleccionada'
                : 'Rechazar partidas seleccionadas';
        }

        if (els.rejectModalSubtitle) {
            els.rejectModalSubtitle.textContent = buildSelectionSummary(selectedRecords);
        }

        els.rejectModal.classList.remove('hidden');
    }

    function closeRejectModal() {
        const els = getElements();
        if (els.rejectModal) {
            els.rejectModal.classList.add('hidden');
        }

        if (els.rejectForm instanceof HTMLFormElement) {
            els.rejectForm.reset();
        }
    }

    function openApproveModal() {
        const els = getElements();
        const selectedRecords = getSelectedRecords();
        if (!els.approveModal || !selectedRecords.length) {
            return;
        }

        if (els.approveForm instanceof HTMLFormElement) {
            els.approveForm.reset();
        }

        if (els.approveTipoSelect) {
            els.approveTipoSelect.innerHTML = optionMarkup('', TintoreriaConfig.TIPO_APROBACION_OPTIONS || [], 'Seleccionar tipo...');
        }

        if (els.approveQuienSelect) {
            els.approveQuienSelect.innerHTML = optionMarkup('', TintoreriaConfig.QUIEN_APROBO_OPTIONS || [], 'Seleccionar quien...');
        }

        if (els.approveSupervisorInput) {
            els.approveSupervisorInput.innerHTML = optionMarkup('', TintoreriaConfig.SUPERVISOR_APROBACION_OPTIONS || [], 'Seleccionar supervisor...');
        }

        updateApproveQuienVisibility();

        if (els.approveObservationInput) {
            els.approveObservationInput.value = getSharedFieldValue(selectedRecords, 'observacion_calidad');
        }

        if (els.approveModalTitle) {
            els.approveModalTitle.textContent = selectedRecords.length === 1
                ? 'Aprobar partida seleccionada'
                : 'Aprobar partidas seleccionadas';
        }

        if (els.approveModalSubtitle) {
            els.approveModalSubtitle.textContent = buildSelectionSummary(selectedRecords);
        }

        els.approveModal.classList.remove('hidden');
    }

    function closeApproveModal() {
        const els = getElements();
        if (els.approveModal) {
            els.approveModal.classList.add('hidden');
        }

        if (els.approveForm instanceof HTMLFormElement) {
            els.approveForm.reset();
        }
    }

    async function handleRejectSave() {
        const els = getElements();
        const selectedRecords = getSelectedRecords();
        const motivo = String(els.rejectMotivoInput && els.rejectMotivoInput.value ? els.rejectMotivoInput.value : '').trim().toUpperCase();
        const supervisor = TintoreriaUtils.sanitizePersonName(els.rejectSupervisorInput && els.rejectSupervisorInput.value ? els.rejectSupervisorInput.value : '');
        const observacion = String(els.rejectObservationInput && els.rejectObservationInput.value ? els.rejectObservationInput.value : '').trim();

        if (!selectedRecords.length) {
            showToast('Selecciona al menos una fila.');
            return;
        }

        if (!motivo) {
            showToast('Ingresa el motivo de rechazo.');
            if (els.rejectMotivoInput) els.rejectMotivoInput.focus();
            return;
        }

        if (!supervisor) {
            showToast('Ingresa el nombre del supervisor.');
            if (els.rejectSupervisorInput) els.rejectSupervisorInput.focus();
            return;
        }

        const validSelections = selectedRecords
            .map((record) => ({
                record,
                rejectConfig: getNextRejectConfig(record)
            }))
            .filter((entry) => entry.rejectConfig);

        const skippedCount = selectedRecords.length - validSelections.length;

        if (!validSelections.length) {
            showToast('Las filas seleccionadas ya llegaron a 4to rechazo.');
            return;
        }

        if (els.rejectSaveBtn) {
            els.rejectSaveBtn.disabled = true;
            els.rejectSaveBtn.textContent = 'Guardando...';
        }

        try {
            const turno = TintoreriaUtils.calculateProductionTurno();
            const rejectionDate = TintoreriaUtils.formatProcessDateTime(new Date());
            const updatesList = validSelections.map(({ record, rejectConfig }) => {
                const rejectNumber = rejectConfig.rejectNumber;
                const updates = {
                    calidad_turno: turno,
                    calidad_estado: rejectConfig.finalStatus,
                    cantidad_rechazos: String(rejectNumber),
                    observacion_calidad: observacion,
                    [`motivo_rechazo_${rejectNumber}`]: motivo,
                    [`supervisor_rechazo_${rejectNumber}`]: supervisor,
                    [`turno_rechazo_${rejectNumber}`]: turno,
                    [`fecha_rechazo_${rejectNumber}`]: rejectionDate
                };

                return {
                    id_registro: record.id_registro,
                    changes: updates
                };
            });

            const response = await TintoreriaAPI.updateRecords(updatesList);
            (response.records || []).forEach((record) => {
                mergeUpdatedRecord(record);
            });

            state.selectedIds.clear();
            closeRejectModal();
            renderResults();

            const savedCount = validSelections.length;
            showToast(
                skippedCount
                    ? `Rechazo guardado en ${savedCount} fila(s). Se omitieron ${skippedCount}.`
                    : `Rechazo guardado en ${savedCount} fila(s).`
            );
        } catch (error) {
            showToast(error && error.message ? error.message : 'No se pudo guardar el rechazo.');
        } finally {
            if (els.rejectSaveBtn) {
                els.rejectSaveBtn.disabled = false;
                els.rejectSaveBtn.textContent = 'Guardar y Rechazar';
            }
        }
    }

    async function handleApproveSave() {
        const els = getElements();
        const selectedRecords = getSelectedRecords().filter((record) => !isSupervisorDecisionLocked(record));
        const tipoAprobacion = String(els.approveTipoSelect && els.approveTipoSelect.value ? els.approveTipoSelect.value : '').trim();
        const requiresApprovedBy = approvalTypeRequiresApprovedBy(tipoAprobacion);
        const quienAprobo = requiresApprovedBy
            ? String(els.approveQuienSelect && els.approveQuienSelect.value ? els.approveQuienSelect.value : '').trim()
            : '';
        const supervisor = String(els.approveSupervisorInput && els.approveSupervisorInput.value ? els.approveSupervisorInput.value : '').trim();
        const observacion = String(els.approveObservationInput && els.approveObservationInput.value ? els.approveObservationInput.value : '').trim();

        if (!selectedRecords.length) {
            showToast('Selecciona al menos una fila.');
            return;
        }

        if (!tipoAprobacion) {
            showToast('Selecciona el tipo de aprobacion.');
            if (els.approveTipoSelect) els.approveTipoSelect.focus();
            return;
        }

        if (requiresApprovedBy && !quienAprobo) {
            showToast('Selecciona quien aprobo.');
            if (els.approveQuienSelect) els.approveQuienSelect.focus();
            return;
        }

        if (!supervisor) {
            showToast('Ingresa el nombre del supervisor.');
            if (els.approveSupervisorInput) els.approveSupervisorInput.focus();
            return;
        }

        if (els.approveSaveBtn) {
            els.approveSaveBtn.disabled = true;
            els.approveSaveBtn.textContent = 'Guardando...';
        }

        try {
            const turno = TintoreriaUtils.calculateProductionTurno();
            const calidadFin = TintoreriaUtils.formatProcessDateTime(new Date());
            const approvalDate = calidadFin;
            const updatesList = selectedRecords.map((record) => {
                const calidadInicio = String(record && record.calidad_inicio ? record.calidad_inicio : '').trim() || calidadFin;
                const updates = {
                    calidad_turno: turno,
                    calidad_estado: 'OK',
                    calidad_inicio: calidadInicio,
                    calidad_fin: calidadFin,
                    tipo_aprobacion: tipoAprobacion,
                    quien_aprobo: quienAprobo,
                    supervisor_aprobacion: supervisor,
                    turno_aprobacion: turno,
                    fecha_aprobacion: approvalDate,
                    observacion_calidad: observacion
                };

                return {
                    id_registro: record.id_registro,
                    changes: updates
                };
            });

            const response = await TintoreriaAPI.updateRecords(updatesList);
            (response.records || []).forEach((record) => {
                mergeUpdatedRecord(record);
            });

            state.selectedIds.clear();
            closeApproveModal();
            renderResults();
            showToast(`Aprobacion guardada en ${selectedRecords.length} fila(s).`);
        } catch (error) {
            showToast(error && error.message ? error.message : 'No se pudo guardar la aprobacion.');
        } finally {
            if (els.approveSaveBtn) {
                els.approveSaveBtn.disabled = false;
                els.approveSaveBtn.textContent = 'Aprobar';
            }
        }
    }

    function renderResults() {
        const els = getElements();
        if (!els.resultList || !els.resultSummary) {
            return;
        }

        const query = state.currentQuery.trim();

        if (!query) {
            state.filteredRecords = [];
            state.selectedIds.clear();
            els.resultSummary.textContent = 'Ingresa una OP-PTDA para comenzar.';
            els.resultList.innerHTML = '<div class="empty-state">Ingresa una OP-PTDA para ver coincidencias exactas.</div>';
            updateActionVisibility();
            return;
        }

        state.filteredRecords = filterByExactOpPartida(query);
        pruneSelection();

        if (!state.filteredRecords.length) {
            els.resultSummary.textContent = 'No se encontraron filas para esa OP-PTDA.';
            els.resultList.innerHTML = '<div class="empty-state">No se encontraron coincidencias exactas para la OP-PTDA ingresada.</div>';
            updateActionVisibility();
            return;
        }

        els.resultSummary.textContent = `${state.filteredRecords.length} resultado(s) encontrado(s).`;
        els.resultList.innerHTML = state.filteredRecords.map((record) => {
            const recordId = String(record.id_registro || '');
            const checked = state.selectedIds.has(recordId) ? 'checked' : '';
            const disabled = isSupervisorDecisionLocked(record);
            const approved = hasFinalApproval(record);
            const rejected = !approved && isRejectedRecord(record);
            const selectedClass = !disabled && checked ? ' record-card-selected' : '';
            const approvedClass = approved ? ' record-card-approved' : '';
            const rejectedClass = rejected ? ' record-card-rejected' : '';
            const color = TintoreriaUtils.escapeHtml(TintoreriaUtils.formatColorLabel(record.color || 'Sin color'));
            const article = TintoreriaUtils.escapeHtml(record.articulo || 'Sin articulo');
            const statusText = TintoreriaUtils.escapeHtml(getAuditoriaRegisteredStatus(record));
            const observationLines = getRegisteredObservationLines(record);
            const pillLabel = statusText;
            const reasonText = observationLines.length
                ? `<div class="record-reason">${observationLines.map((line) => `<div class="record-line record-line-${TintoreriaUtils.escapeHtml(line.type || 'note')}">${TintoreriaUtils.escapeHtml(line.text || '')}</div>`).join('')}</div>`
                : '';
            const footerText = disabled
                ? (observationLines.length ? '' : `<div class="select-row"><span class="meta-line">${statusText}</span></div>`)
                : `<div class="select-row"><label class="checkbox-label"><input type="checkbox" class="supervisor-mobile-checkbox" data-record-id="${TintoreriaUtils.escapeHtml(recordId)}" ${checked}>Seleccionar</label></div>`;

            return `
                <article
                    class="record-card${disabled ? ' record-card-disabled' : ' record-card-selectable'}${approvedClass}${rejectedClass}${selectedClass}"
                    ${disabled ? '' : `data-record-id="${TintoreriaUtils.escapeHtml(recordId)}"`}
                >
                    <div class="record-head">
                        <div class="record-title">${TintoreriaUtils.escapeHtml(formatRecordTitle(record))}</div>
                        <span class="status-pill ${disabled ? 'status-registered' : 'status-pending'}">
                            ${pillLabel}
                        </span>
                    </div>

                    <div class="record-detail-line"><strong>${color}</strong> <span>${article}</span></div>

                    <div class="record-meta">
                        <div class="meta-line"><strong>Kg(crudo):</strong> ${TintoreriaUtils.escapeHtml(record.peso_kg_crudo || '0')} <span class="meta-separator">|</span> <strong>#rollos/cntd:</strong> ${TintoreriaUtils.escapeHtml(record.cantidad_crudo || '0')}</div>
                    </div>

                    ${reasonText}
                    ${footerText}
                </article>
            `;
        }).join('');
        updateActionVisibility();
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
        if (!els.form || !els.searchInput || !els.resultList) {
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
            search(els.searchInput.value);
        });

        if (els.scanButton) {
            els.scanButton.addEventListener('click', handleScan);
        }

        if (els.approveBtn) {
            els.approveBtn.addEventListener('click', openApproveModal);
        }

        if (els.rejectBtn) {
            els.rejectBtn.addEventListener('click', openRejectModal);
        }

        if (els.rejectModalClose) {
            els.rejectModalClose.addEventListener('click', closeRejectModal);
        }

        if (els.approveModalClose) {
            els.approveModalClose.addEventListener('click', closeApproveModal);
        }

        if (els.rejectClearBtn) {
            els.rejectClearBtn.addEventListener('click', () => {
                if (els.rejectForm instanceof HTMLFormElement) {
                    els.rejectForm.reset();
                }
            });
        }

        if (els.rejectSaveBtn) {
            els.rejectSaveBtn.addEventListener('click', handleRejectSave);
        }

        if (els.approveClearBtn) {
            els.approveClearBtn.addEventListener('click', () => {
                if (els.approveForm instanceof HTMLFormElement) {
                    els.approveForm.reset();
                }

                updateApproveQuienVisibility();
            });
        }

        if (els.approveTipoSelect) {
            els.approveTipoSelect.addEventListener('change', updateApproveQuienVisibility);
        }

        if (els.approveSaveBtn) {
            els.approveSaveBtn.addEventListener('click', handleApproveSave);
        }

        els.resultList.addEventListener('change', (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement)) {
                return;
            }

            if (!target.classList.contains('supervisor-mobile-checkbox')) {
                return;
            }

            updateSelected(target.dataset.recordId || '', target.checked);
        });

        els.resultList.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            if (target.closest('.checkbox-label') || target.closest('.supervisor-mobile-checkbox')) {
                return;
            }

            const card = target.closest('.record-card-selectable');
            if (!card) {
                return;
            }

            toggleSelected(card.getAttribute('data-record-id') || '');
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            closeRejectModal();
            closeApproveModal();
        });

        if (els.rejectModal) {
            els.rejectModal.addEventListener('click', (event) => {
                if (event.target === els.rejectModal) {
                    closeRejectModal();
                }
            });
        }

        if (els.approveModal) {
            els.approveModal.addEventListener('click', (event) => {
                if (event.target === els.approveModal) {
                    closeApproveModal();
                }
            });
        }
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

        setSyncStatus('Sincronizando datos con la web...');

        try {
            const response = await TintoreriaAPI.listRecords();
            setRecords(response.records || []);
            renderResults();
            setSyncStatus('');
        } catch (error) {
            setSyncStatus(error && error.message ? error.message : 'No se pudo sincronizar la informacion.', true);
        }
    }

    async function init() {
        bindEvents();
        await hydrateFromCache();
        await refreshRemoteRecords();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
