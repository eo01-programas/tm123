(() => {
    const state = {
        records: [],
        filteredRecords: [],
        currentQuery: '',
        selectedIds: new Set(),
        toastTimer: null,
        syncing: false,
        lastObservationKey: null,
        lastAuditorKey: null,
        remoteSearchToken: 0,
        auditChoiceQuery: '',
        activeAudit: null,
        // id_registro -> { rows, ancho, densidad, remoteKey, dirty } del cuadro "4 Puntos".
        puntosByRecordId: new Map(),
        lastPuntosRenderKey: null,
        defectoPicker: null
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
            historyPicker: document.getElementById('auditoria-mobile-history-picker'),
            historyList: document.getElementById('auditoria-mobile-history-list'),
            historyClose: document.getElementById('auditoria-mobile-history-close'),
            puntosContainer: document.getElementById('auditoria-mobile-puntos'),
            defectoPicker: document.getElementById('auditoria-mobile-defecto-picker'),
            defectoContext: document.getElementById('auditoria-mobile-defecto-context'),
            defectoSearch: document.getElementById('auditoria-mobile-defecto-search'),
            defectoList: document.getElementById('auditoria-mobile-defecto-list'),
            defectoClose: document.getElementById('auditoria-mobile-defecto-close'),
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

    const AUDIT_DATA_FIELDS = [
        'calidad_auditor',
        'calidad_turno',
        'calidad_inicio',
        'observacion_calidad',
        'aud_4_puntos_rollos',
        'aud_4_puntos_puntos',
        'aud_4_puntos_cantidad',
        'aud_4_puntos_ancho',
        'aud_4_puntos_densidad'
    ];

    function legacyAuditFromRecord(record) {
        const fecha = String(record && record.calidad_inicio ? record.calidad_inicio : '').trim();
        if (!fecha) return null;

        const data = {};
        AUDIT_DATA_FIELDS.forEach((field) => { data[field] = record[field] || ''; });
        return { id: 'legacy-aud-1', numero: 1, fecha, data };
    }

    function getRecordAudits(record) {
        const raw = String(record && record.calidad_auditorias ? record.calidad_auditorias : '').trim();
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.filter((audit) => audit && audit.id);
            } catch (error) {
                console.warn('No se pudo leer el historial de auditorias.', error);
            }
        }

        const legacy = legacyAuditFromRecord(record);
        return legacy ? [legacy] : [];
    }

    function findRecordAudit(record, auditId) {
        return getRecordAudits(record).find((audit) => String(audit.id) === String(auditId)) || null;
    }

    // La observacion se arrastra de una auditoria a la siguiente: es el unico
    // campo acumulable del formulario. El resto arranca vacio.
    const NEW_AUDIT_KEPT_FIELDS = ['observacion_calidad'];

    // Las columnas planas del Sheet siempre guardan la ultima auditoria, asi
    // que una auditoria nueva las tiene que ignorar: sin esto el cuadro de 4
    // puntos naceria con los rollos y defectos de la auditoria anterior.
    function blankRecordForNewAudit(record) {
        const blanks = {};
        AUDIT_DATA_FIELDS.forEach((field) => {
            if (!NEW_AUDIT_KEPT_FIELDS.includes(field)) blanks[field] = '';
        });
        return { ...record, ...blanks };
    }

    function projectRecordForActiveAudit(record) {
        // Sin auditoria elegida se guarda como nueva (ver buildAuditSaveChanges),
        // asi que la pantalla tiene que verse como nueva.
        if (!state.activeAudit || state.activeAudit.isNew) return blankRecordForNewAudit(record);
        const audit = findRecordAudit(record, state.activeAudit.id);
        return audit && audit.data ? { ...record, ...audit.data } : record;
    }

    function getSelectedRecords() {
        return state.filteredRecords
            .filter((record) => state.selectedIds.has(String(record.id_registro || '')))
            .map(projectRecordForActiveAudit);
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

    // --- Cuadro "4 Puntos" -------------------------------------------------
    // Una fila del Sheet puede tener varios rollos con defecto, por eso las
    // columnas aud_4_puntos_* guardan listas separadas por coma que se
    // emparejan por posicion: rollos[i] <-> ancho[i] <-> densidad[i] <->
    // puntos[i] <-> cantidad[i].
    //
    // Un mismo rollo puede tener varios defectos: en el Sheet eso son varias
    // filas repitiendo el #rollo, y en pantalla una sola tarjeta con la lista
    // de defectos adentro. parse* agrupa por #rollo y flatten* vuelve a
    // repetir el #rollo por cada defecto, asi el formato del Sheet no cambia.

    const PUNTOS_SEPARATOR = (window.TintoreriaConfig && TintoreriaConfig.AUD_4_PUNTOS_SEPARATOR) || ', ';

    function splitPuntosCell(value) {
        return String(value === undefined || value === null ? '' : value)
            .split(/[\n;,]+/)
            .map((part) => part.trim());
    }

    // Ancho y Dens arrancan con lo que cargo Rama Tenido, pero el auditor los
    // corrige por rollo: se guardan aparte y nunca pisan rama_tenido_*.
    function createEmptyRollo(record) {
        return {
            rollo: '',
            ancho: sanitizeMedidaValue(record && record.rama_tenido_ancho),
            densidad: sanitizeMedidaValue(record && record.rama_tenido_densidad),
            defectos: []
        };
    }

    function createEmptyDefecto() {
        return { defecto: '', cantidad: '', porcentaje: false };
    }

    // Algunos defectos se cuentan por unidad y otros se estiman como parte del
    // rollo. En el Sheet ambos viven en la misma celda ("3" o "3%"), pero en
    // pantalla el input solo tiene digitos y el % es un boton: asi al tipear no
    // hay que esquivar el simbolo con el cursor.
    function parseCantidadValue(value) {
        const raw = String(value === undefined || value === null ? '' : value).trim();
        return {
            numero: raw.replace(/\D/g, ''),
            porcentaje: raw.includes('%')
        };
    }

    // Sin numero no se guarda nada: un "%" suelto no dice nada.
    function composeCantidadValue(numero, porcentaje) {
        const digits = String(numero === undefined || numero === null ? '' : numero).replace(/\D/g, '');
        if (!digits) {
            return '';
        }

        return porcentaje ? `${digits}%` : digits;
    }

    // Una fila cuenta como vacia por sus datos propios: el Ancho/Dens
    // pre-cargado no debe hacer que se guarde una fila sin auditar.
    function isEmptyPuntoRow(row) {
        return !row
            || (!String(row.rollo || '').trim()
                && !String(row.defecto || '').trim()
                && !String(row.cantidad || '').trim());
    }

    function parsePuntosRollos(record) {
        const rollos = splitPuntosCell(record && record.aud_4_puntos_rollos);
        const anchos = splitPuntosCell(record && record.aud_4_puntos_ancho);
        const densidades = splitPuntosCell(record && record.aud_4_puntos_densidad);
        const defectos = splitPuntosCell(record && record.aud_4_puntos_puntos);
        const cantidades = splitPuntosCell(record && record.aud_4_puntos_cantidad);
        const total = Math.max(
            rollos.length,
            anchos.length,
            densidades.length,
            defectos.length,
            cantidades.length
        );
        const base = createEmptyRollo(record);
        const cards = [];
        const cardsByNumero = new Map();

        for (let index = 0; index < total; index += 1) {
            const numero = String(rollos[index] || '').trim();
            const defecto = String(defectos[index] || '').trim();
            const cantidad = String(cantidades[index] || '').trim();

            if (!numero && !defecto && !cantidad) {
                continue;
            }

            // Las filas que repiten el mismo #rollo son defectos del mismo
            // rollo: van todas a la misma tarjeta. Sin #rollo no hay con que
            // agrupar, asi que cada una queda en su propia tarjeta.
            let card = numero ? cardsByNumero.get(numero) : null;

            if (!card) {
                card = {
                    rollo: numero,
                    ancho: sanitizeMedidaValue(anchos[index]) || base.ancho,
                    densidad: sanitizeMedidaValue(densidades[index]) || base.densidad,
                    defectos: []
                };
                cards.push(card);
                if (numero) {
                    cardsByNumero.set(numero, card);
                }
            }

            if (defecto || cantidad) {
                const parsed = parseCantidadValue(cantidad);
                card.defectos.push({
                    defecto,
                    cantidad: parsed.numero,
                    porcentaje: parsed.porcentaje
                });
            }
        }

        if (!cards.length) {
            cards.push(createEmptyRollo(record));
        }

        return cards;
    }

    // Vuelve al formato del Sheet: una fila por defecto, repitiendo #rollo,
    // Ancho y Dens. El rollo sin defectos igual deja su fila para no perder
    // el numero ya tipeado.
    function flattenPuntosRollos(rollos) {
        const rows = [];

        (rollos || []).forEach((card) => {
            if (!card) {
                return;
            }

            const numero = String(card.rollo || '').trim();
            const defectos = Array.isArray(card.defectos) ? card.defectos : [];

            if (!defectos.length) {
                rows.push({
                    rollo: numero,
                    ancho: card.ancho,
                    densidad: card.densidad,
                    defecto: '',
                    cantidad: ''
                });
                return;
            }

            defectos.forEach((item) => {
                rows.push({
                    rollo: numero,
                    ancho: card.ancho,
                    densidad: card.densidad,
                    defecto: item && item.defecto,
                    cantidad: composeCantidadValue(item && item.cantidad, item && item.porcentaje)
                });
            });
        });

        return rows;
    }

    function serializePuntosRollos(rollos) {
        const filled = flattenPuntosRollos(rollos).filter((row) => !isEmptyPuntoRow(row));

        return {
            aud_4_puntos_rollos: filled.map((row) => String(row.rollo || '').trim()).join(PUNTOS_SEPARATOR),
            aud_4_puntos_puntos: filled.map((row) => String(row.defecto || '').trim()).join(PUNTOS_SEPARATOR),
            aud_4_puntos_cantidad: filled.map((row) => String(row.cantidad || '').trim()).join(PUNTOS_SEPARATOR),
            aud_4_puntos_ancho: filled.map((row) => String(row.ancho || '').trim()).join(PUNTOS_SEPARATOR),
            aud_4_puntos_densidad: filled.map((row) => String(row.densidad || '').trim()).join(PUNTOS_SEPARATOR)
        };
    }

    // Ancho y Dens son medidas de 2 a 3 digitos, igual que en Rama Tenido.
    function sanitizeMedidaValue(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/\D/g, '')
            .slice(0, 3);
    }

    // El #Rollo es la clave del registro: parsePuntosRollos agrupa por el, asi
    // que dos tarjetas con el mismo numero se fusionan al releer del Sheet y se
    // pierde el Ancho/Dens de la segunda. Por eso no se permite repetirlo.
    // "05", " 5 " y "5" son el mismo rollo.
    function normalizeRolloNumero(value) {
        return String(value === undefined || value === null ? '' : value)
            .trim()
            .toUpperCase()
            .replace(/^0+(?=.)/, '');
    }

    // Indices de las tarjetas que repiten un #Rollo ya usado antes en el mismo
    // articulo. La primera aparicion no se marca: esa es la valida. El rollo
    // vacio nunca es duplicado, si no marcaria mientras se tipea.
    function findDuplicateRolloIndexes(rollos) {
        const seen = new Set();
        const duplicates = new Set();

        (rollos || []).forEach((card, index) => {
            const numero = normalizeRolloNumero(card && card.rollo);
            if (!numero) {
                return;
            }

            if (seen.has(numero)) {
                duplicates.add(index);
                return;
            }

            seen.add(numero);
        });

        return duplicates;
    }

    // Primer duplicado de toda la seleccion, para avisar y enfocarlo al guardar.
    function findFirstDuplicateRollo(recordIds) {
        let found = null;

        (recordIds || []).some((recordId) => {
            const rollos = getPuntosRollos(recordId);
            const duplicates = findDuplicateRolloIndexes(rollos);
            if (!duplicates.size) {
                return false;
            }

            const rolloIndex = Math.min(...duplicates);
            found = {
                recordId,
                rolloIndex,
                numero: String((rollos[rolloIndex] && rollos[rolloIndex].rollo) || '').trim()
            };
            return true;
        });

        return found;
    }

    function buildPuntosEntry(record) {
        return {
            rollos: parsePuntosRollos(record),
            remoteKey: buildPuntosRemoteKey(record),
            dirty: false
        };
    }

    function buildPuntosRemoteKey(record) {
        return [
            record && record.aud_4_puntos_rollos,
            record && record.aud_4_puntos_puntos,
            record && record.aud_4_puntos_cantidad,
            record && record.aud_4_puntos_ancho,
            record && record.aud_4_puntos_densidad,
            record && record.rama_tenido_ancho,
            record && record.rama_tenido_densidad
        ].map((value) => String(value === undefined || value === null ? '' : value).trim()).join('||');
    }

    function getPuntosEntry(recordId) {
        return state.puntosByRecordId.get(String(recordId || '')) || null;
    }

    function getPuntosRollos(recordId) {
        const entry = getPuntosEntry(recordId);
        return entry ? entry.rollos : [];
    }

    // Carga lo que ya esta en el Sheet para las filas seleccionadas y descarta
    // lo de las filas que se deseleccionaron. Si el auditor ya escribio en el
    // cuadro (dirty), un refresh en segundo plano no le pisa lo tipeado.
    function syncPuntosState(selectedRecords) {
        const validIds = new Set();

        (selectedRecords || []).forEach((record) => {
            const recordId = String(record.id_registro || '');
            if (!recordId) {
                return;
            }

            validIds.add(recordId);
            const remoteKey = buildPuntosRemoteKey(record);
            const entry = state.puntosByRecordId.get(recordId);

            if (!entry) {
                state.puntosByRecordId.set(recordId, buildPuntosEntry(record));
                return;
            }

            if (!entry.dirty && entry.remoteKey !== remoteKey) {
                state.puntosByRecordId.set(recordId, buildPuntosEntry(record));
            }
        });

        Array.from(state.puntosByRecordId.keys()).forEach((recordId) => {
            if (!validIds.has(recordId)) {
                state.puntosByRecordId.delete(recordId);
            }
        });
    }

    // La estructura (cuantas tarjetas y cuantos defectos tiene cada una) entra
    // en la clave: si cambia hay que re-dibujar, si solo se tipeo adentro no.
    function buildPuntosStructureKey(entry) {
        if (!entry) {
            return '0';
        }

        return entry.rollos
            .map((card) => (card && Array.isArray(card.defectos) ? card.defectos.length : 0))
            .join('.') || '0';
    }

    // El articulo RIB (rib/puno) se audita al final, asi que su bloque va
    // ultimo aunque en Resultados aparezca antes. Solo cambia el orden del
    // cuadro: la seleccion y el guardado no se tocan.
    function isRibRecord(record) {
        return String((record && record.articulo) || '').toUpperCase().includes('RIB');
    }

    function sortPuntosRecords(selectedRecords) {
        const records = Array.isArray(selectedRecords) ? selectedRecords.slice() : [];
        return records.sort((a, b) => Number(isRibRecord(a)) - Number(isRibRecord(b)));
    }

    function buildPuntosRenderKey(selectedRecords) {
        return (selectedRecords || [])
            .map((record) => {
                const recordId = String(record.id_registro || '');
                const entry = state.puntosByRecordId.get(recordId);
                return `${recordId}:${buildPuntosStructureKey(entry)}:${buildPuntosRemoteKey(record)}`;
            })
            .join('~');
    }

    function buildRolloFieldHtml(field, label, value, isMedida, isInvalid) {
        return `
            <label class="rollo-field">
                <span class="rollo-field-label">${label}</span>
                <input
                    class="puntos-input${isMedida ? ' puntos-input-medida' : ''}${isInvalid ? ' puntos-input-error' : ''}"
                    type="text"
                    inputmode="numeric"
                    ${isMedida ? 'maxlength="3"' : ''}
                    ${isInvalid ? 'aria-invalid="true"' : ''}
                    data-field="${field}"
                    aria-label="${label}"
                    value="${TintoreriaUtils.escapeHtml(value || '')}">
            </label>
        `;
    }

    // El boton dice en que unidad esta la cantidad: apagado "und" (unidades),
    // encendido "%" (porcentaje del rollo). Antes decia "%" en los dos estados
    // y solo cambiaba de color, asi que no se leia que apagado eran unidades.
    function porcentajeButtonLabel(porcentaje) {
        return porcentaje ? '%' : 'und';
    }

    // El toggle ocupa el lugar de la vieja X: quitar el defecto ya se hace desde
    // el selector ("Quitar defecto"), y dos X seguidas se confundian con la de la
    // tarjeta, que borra el rollo entero.
    function buildDefectoLineHtml(item, defectoIndex) {
        const defecto = String((item && item.defecto) || '').trim();
        const porcentaje = Boolean(item && item.porcentaje);

        return `
            <div class="rollo-defecto-row" data-defecto-index="${defectoIndex}">
                <button
                    type="button"
                    class="puntos-defecto-button${defecto ? '' : ' puntos-defecto-button-empty'}"
                    data-action="pick-defecto">${TintoreriaUtils.escapeHtml(defecto || 'Elegir defecto')}</button>
                <input
                    class="puntos-input rollo-defecto-cantidad"
                    type="text"
                    inputmode="numeric"
                    data-field="cantidad"
                    aria-label="Cantidad de puntos"
                    placeholder="Ctdad"
                    value="${TintoreriaUtils.escapeHtml((item && item.cantidad) || '')}">
                <button
                    type="button"
                    class="rollo-defecto-porcentaje${porcentaje ? ' rollo-defecto-porcentaje-on' : ''}"
                    data-action="toggle-porcentaje"
                    aria-pressed="${porcentaje ? 'true' : 'false'}"
                    aria-label="Medir en porcentaje"
                    title="Medir en porcentaje">${porcentajeButtonLabel(porcentaje)}</button>
            </div>
        `;
    }

    // Una tarjeta por rollo: arriba sus datos, adentro la lista de defectos.
    // Dens no se muestra ni se edita, pero se sigue guardando: viaja en el
    // estado con lo que cargo Rama Tenido y se serializa igual que antes.
    function buildRolloCardHtml(card, rolloIndex, isDuplicate) {
        const defectos = Array.isArray(card.defectos) ? card.defectos : [];
        const defectosHtml = defectos.length
            ? defectos.map((item, defectoIndex) => buildDefectoLineHtml(item, defectoIndex)).join('')
            : '<p class="rollo-defecto-empty">Sin defectos en este rollo.</p>';

        return `
            <div class="rollo-card" data-rollo-index="${rolloIndex}">
                <div class="rollo-card-head">
                    ${buildRolloFieldHtml('rollo', '#Rollo', card.rollo, false, isDuplicate)}
                    ${buildRolloFieldHtml('ancho', 'Ancho', card.ancho, true, false)}
                    <button type="button" class="puntos-row-remove rollo-card-remove" data-action="remove-rollo" aria-label="Quitar rollo">&times;</button>
                </div>
                <div class="rollo-defecto-list">
                    ${defectosHtml}
                </div>
                <button type="button" class="ghost-button rollo-add-defecto" data-action="add-defecto">+ Defecto</button>
            </div>
        `;
    }

    function buildPuntosBlockHtml(record) {
        const recordId = String(record.id_registro || '');
        const entry = getPuntosEntry(recordId);

        if (!entry) {
            return '';
        }

        const articulo = String(record.articulo || '').trim() || 'Sin articulo';
        const duplicates = findDuplicateRolloIndexes(entry.rollos);

        return `
            <div class="puntos-block" data-record-id="${TintoreriaUtils.escapeHtml(recordId)}">
                <div class="puntos-block-title">${TintoreriaUtils.escapeHtml(articulo)}</div>
                <div class="rollo-card-list">
                    ${entry.rollos.map((card, rolloIndex) => buildRolloCardHtml(card, rolloIndex, duplicates.has(rolloIndex))).join('')}
                </div>
                <button type="button" class="ghost-button puntos-add-row" data-action="add-rollo">+ Rollo</button>
            </div>
        `;
    }

    // El cuadro solo se re-dibuja cuando cambia la seleccion, la estructura de
    // tarjetas o el dato remoto: re-dibujarlo en cada tecla cerraria el teclado.
    function renderPuntos(force = false) {
        const els = getElements();
        if (!els.puntosContainer) {
            return;
        }

        const selectedRecords = getSelectedRecords();
        syncPuntosState(selectedRecords);

        if (!selectedRecords.length) {
            if (els.puntosContainer.innerHTML !== '') {
                els.puntosContainer.innerHTML = '';
            }
            state.lastPuntosRenderKey = null;
            return;
        }

        const orderedRecords = sortPuntosRecords(selectedRecords);
        const renderKey = buildPuntosRenderKey(orderedRecords);
        if (!force && renderKey === state.lastPuntosRenderKey) {
            return;
        }

        state.lastPuntosRenderKey = renderKey;
        els.puntosContainer.innerHTML = orderedRecords.map(buildPuntosBlockHtml).join('');
    }

    function findRolloContext(target) {
        if (!(target instanceof Element)) {
            return null;
        }

        const block = target.closest('.puntos-block');
        const cardElement = target.closest('.rollo-card');
        if (!block || !cardElement) {
            return null;
        }

        const recordId = block.getAttribute('data-record-id') || '';
        const rolloIndex = Number(cardElement.getAttribute('data-rollo-index'));
        const entry = getPuntosEntry(recordId);

        if (!entry || !Number.isInteger(rolloIndex) || !entry.rollos[rolloIndex]) {
            return null;
        }

        return { recordId, rolloIndex, entry, rollo: entry.rollos[rolloIndex] };
    }

    function findDefectoContext(target) {
        const context = findRolloContext(target);
        if (!context) {
            return null;
        }

        const rowElement = target.closest('.rollo-defecto-row');
        if (!rowElement) {
            return null;
        }

        const defectoIndex = Number(rowElement.getAttribute('data-defecto-index'));
        if (!Number.isInteger(defectoIndex) || !context.rollo.defectos[defectoIndex]) {
            return null;
        }

        context.defectoIndex = defectoIndex;
        return context;
    }

    function handlePuntosInput(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || !target.classList.contains('puntos-input')) {
            return;
        }

        const field = target.dataset.field;

        // La cantidad vive en la linea de defecto; el resto en la tarjeta.
        if (field === 'cantidad') {
            const context = findDefectoContext(target);
            if (!context) {
                return;
            }

            // Solo digitos: el % lo pone el boton, si no saldrian cosas como
            // "3%5%" desde un teclado de PC.
            const sanitized = String(target.value).replace(/\D/g, '');
            if (sanitized !== target.value) {
                target.value = sanitized;
            }

            context.rollo.defectos[context.defectoIndex].cantidad = sanitized;
            context.entry.dirty = true;
            return;
        }

        if (field !== 'rollo' && field !== 'ancho') {
            return;
        }

        const context = findRolloContext(target);
        if (!context) {
            return;
        }

        if (field === 'ancho') {
            const sanitized = sanitizeMedidaValue(target.value);
            if (sanitized !== target.value) {
                target.value = sanitized;
            }

            context.rollo[field] = sanitized;
            context.entry.dirty = true;
            return;
        }

        // Solo se actualiza el estado: el DOM ya muestra lo que se tipeo.
        context.rollo[field] = target.value;
        context.entry.dirty = true;
    }

    // El duplicado se avisa al salir del campo, no en cada tecla: si ya existe
    // el rollo 1, tipear "12" marcaria error al primer digito.
    function handlePuntosBlur(event) {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.dataset.field !== 'rollo') {
            return;
        }

        const context = findRolloContext(target);
        if (!context) {
            return;
        }

        refreshRolloDuplicateMarks(context.recordId);

        if (findDuplicateRolloIndexes(context.entry.rollos).has(context.rolloIndex)) {
            showToast(`El rollo ${String(context.rollo.rollo).trim()} ya esta cargado en este articulo.`, 'error');
        }
    }

    // --- Selector de defectos ----------------------------------------------
    // Son 33 defectos: en vez de una lista larga se abre un panel con buscador
    // que filtra mientras se escribe, por codigo ("2.4") o por texto ("manch").

    // Tildes combinantes (U+0300 a U+036F). Se arma con fromCharCode para que
    // el archivo quede en ASCII y buscar "maquina" encuentre "MAQUINA".
    const DEFECTO_DIACRITICS_PATTERN = new RegExp(
        '[' + String.fromCharCode(768) + '-' + String.fromCharCode(879) + ']',
        'g'
    );

    function getDefectoOptions() {
        return (window.TintoreriaConfig && TintoreriaConfig.AUD_4_PUNTOS_DEFECTO_OPTIONS) || [];
    }

    function normalizeDefectoText(value) {
        return String(value === undefined || value === null ? '' : value)
            .normalize('NFD')
            .replace(DEFECTO_DIACRITICS_PATTERN, '')
            .toUpperCase()
            .trim();
    }

    function filterDefectoOptions(query) {
        const tokens = normalizeDefectoText(query).split(/\s+/).filter(Boolean);
        if (!tokens.length) {
            return getDefectoOptions();
        }

        return getDefectoOptions().filter((option) => {
            const normalizedOption = normalizeDefectoText(option);
            return tokens.every((token) => normalizedOption.includes(token));
        });
    }

    function renderDefectoList() {
        const els = getElements();
        if (!els.defectoList) {
            return;
        }

        const query = els.defectoSearch ? els.defectoSearch.value : '';
        const matches = filterDefectoOptions(query);
        const currentValue = getCurrentDefectoValue();

        const optionsHtml = matches
            .map((option) => {
                const selected = normalizeDefectoText(option) === normalizeDefectoText(currentValue);
                return `
                    <button
                        type="button"
                        class="defecto-option${selected ? ' defecto-option-selected' : ''}"
                        data-defecto-value="${TintoreriaUtils.escapeHtml(option)}">${TintoreriaUtils.escapeHtml(option)}</button>
                `;
            })
            .join('');

        const emptyHtml = matches.length
            ? ''
            : '<div class="defecto-empty">Sin coincidencias. Prueba con menos letras.</div>';

        // Siempre disponible: es la unica forma de borrar la linea desde que el
        // % reemplazo a la X, incluso si el defecto todavia no fue elegido.
        const clearHtml = '<button type="button" class="defecto-option defecto-option-clear" data-defecto-value="">Quitar defecto</button>';

        els.defectoList.innerHTML = clearHtml + optionsHtml + emptyHtml;
    }

    function findDefectoItem(picker) {
        if (!picker) {
            return null;
        }

        const entry = getPuntosEntry(picker.recordId);
        const card = entry && entry.rollos[picker.rolloIndex];
        return (card && card.defectos[picker.defectoIndex]) || null;
    }

    function getCurrentDefectoValue() {
        const item = findDefectoItem(state.defectoPicker);
        return item ? String(item.defecto || '') : '';
    }

    function openDefectoPicker(recordId, rolloIndex, defectoIndex, isNew) {
        const els = getElements();
        if (!els.defectoPicker) {
            return;
        }

        // isNew marca las lineas creadas por "+ Defecto": si el auditor cierra
        // el selector sin elegir nada, la linea vacia se descarta sola.
        state.defectoPicker = { recordId, rolloIndex, defectoIndex, isNew: Boolean(isNew) };

        if (els.defectoSearch) {
            els.defectoSearch.value = '';
        }

        if (els.defectoContext) {
            const record = findRecordById(recordId);
            const card = getPuntosRollos(recordId)[rolloIndex];
            const rolloLabel = card && String(card.rollo || '').trim()
                ? `Rollo ${String(card.rollo).trim()}`
                : `Rollo ${rolloIndex + 1}`;
            els.defectoContext.textContent = record
                ? `${rolloLabel} - ${String(record.articulo || '').trim() || 'Sin articulo'}`
                : rolloLabel;
        }

        renderDefectoList();
        els.defectoPicker.classList.remove('hidden');

        if (els.defectoSearch) {
            els.defectoSearch.focus();
        }
    }

    function hideDefectoPicker() {
        const els = getElements();
        state.defectoPicker = null;

        if (els.defectoPicker) {
            els.defectoPicker.classList.add('hidden');
        }
    }

    // Cerrar sin elegir (X, fondo o Escape) no deja lineas "Elegir defecto"
    // colgadas cuando se venia de "+ Defecto".
    function closeDefectoPicker() {
        const picker = state.defectoPicker;
        hideDefectoPicker();

        if (!picker || !picker.isNew) {
            return;
        }

        const item = findDefectoItem(picker);
        if (!item || String(item.defecto || '').trim() || String(item.cantidad || '').trim()) {
            return;
        }

        const entry = getPuntosEntry(picker.recordId);
        entry.rollos[picker.rolloIndex].defectos.splice(picker.defectoIndex, 1);
        renderPuntos(true);
    }

    function applyDefectoSelection(value) {
        const picker = state.defectoPicker;
        if (!picker) {
            return;
        }

        // Se limpia antes de tocar el modelo para que el descarte de linea
        // nueva no corra sobre el indice que se acaba de mover.
        hideDefectoPicker();

        const entry = getPuntosEntry(picker.recordId);
        const card = entry && entry.rollos[picker.rolloIndex];
        const item = card && card.defectos[picker.defectoIndex];

        if (!item) {
            return;
        }

        const selected = String(value || '').trim();

        if (selected) {
            item.defecto = selected;
        } else {
            // "Quitar defecto" saca la linea entera: la cantidad sin defecto
            // no significa nada.
            card.defectos.splice(picker.defectoIndex, 1);
        }

        entry.dirty = true;
        renderPuntos(true);

        if (selected) {
            focusDefectoCantidad(picker.recordId, picker.rolloIndex, picker.defectoIndex);
        }
    }

    function bindDefectoPickerEvents() {
        const els = getElements();
        if (!els.defectoPicker) {
            return;
        }

        if (els.defectoSearch) {
            els.defectoSearch.addEventListener('input', renderDefectoList);
        }

        if (els.defectoClose) {
            els.defectoClose.addEventListener('click', closeDefectoPicker);
        }

        els.defectoPicker.addEventListener('click', (event) => {
            if (event.target === els.defectoPicker) {
                closeDefectoPicker();
            }
        });

        if (els.defectoList) {
            els.defectoList.addEventListener('click', (event) => {
                const target = event.target instanceof Element
                    ? event.target.closest('[data-defecto-value]')
                    : null;
                if (!target) {
                    return;
                }

                applyDefectoSelection(target.getAttribute('data-defecto-value') || '');
            });
        }

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && state.defectoPicker) {
                closeDefectoPicker();
            }
        });
    }

    function findPuntosBlockElement(recordId) {
        const els = getElements();
        if (!els.puntosContainer) {
            return null;
        }

        return Array.from(els.puntosContainer.querySelectorAll('.puntos-block'))
            .find((candidate) => candidate.getAttribute('data-record-id') === String(recordId || '')) || null;
    }

    function findRolloCardElement(recordId, rolloIndex) {
        const block = findPuntosBlockElement(recordId);
        return block ? block.querySelector(`.rollo-card[data-rollo-index="${rolloIndex}"]`) : null;
    }

    // Solo se repintan las marcas de duplicado, no se re-dibuja el cuadro: un
    // re-render mientras se tipea cerraria el teclado del celular. Repasa todo
    // el bloque para que corregir un numero tambien apague la marca de otro.
    function refreshRolloDuplicateMarks(recordId) {
        const block = findPuntosBlockElement(recordId);
        const entry = getPuntosEntry(recordId);
        if (!block || !entry) {
            return;
        }

        const duplicates = findDuplicateRolloIndexes(entry.rollos);

        Array.from(block.querySelectorAll('.rollo-card')).forEach((cardElement) => {
            const rolloIndex = Number(cardElement.getAttribute('data-rollo-index'));
            const input = cardElement.querySelector('.puntos-input[data-field="rollo"]');
            if (!(input instanceof HTMLInputElement)) {
                return;
            }

            const isDuplicate = duplicates.has(rolloIndex);
            input.classList.toggle('puntos-input-error', isDuplicate);

            if (isDuplicate) {
                input.setAttribute('aria-invalid', 'true');
            } else {
                input.removeAttribute('aria-invalid');
            }
        });
    }

    function focusRolloNumero(recordId, rolloIndex) {
        const card = findRolloCardElement(recordId, rolloIndex);
        const input = card && card.querySelector('.puntos-input[data-field="rollo"]');
        if (input instanceof HTMLInputElement) {
            input.focus();
        }
    }

    // Elegido el defecto, el siguiente dato es la cantidad: se enfoca sola.
    function focusDefectoCantidad(recordId, rolloIndex, defectoIndex) {
        const card = findRolloCardElement(recordId, rolloIndex);
        const input = card
            && card.querySelector(`.rollo-defecto-row[data-defecto-index="${defectoIndex}"] .puntos-input`);
        if (input instanceof HTMLInputElement) {
            input.focus();
        }
    }

    function handlePuntosClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const actionButton = target.closest('[data-action]');
        if (!actionButton) {
            return;
        }

        const action = actionButton.getAttribute('data-action');
        const block = actionButton.closest('.puntos-block');
        const recordId = block ? block.getAttribute('data-record-id') || '' : '';
        const entry = getPuntosEntry(recordId);

        if (!entry) {
            return;
        }

        if (action === 'add-rollo') {
            // La tarjeta nueva hereda el Ancho/Dens de la anterior: casi
            // siempre se repiten y ahorra tipear.
            const previousCard = entry.rollos[entry.rollos.length - 1];
            const newCard = createEmptyRollo(findRecordById(recordId));
            if (previousCard) {
                newCard.ancho = previousCard.ancho || newCard.ancho;
                newCard.densidad = previousCard.densidad || newCard.densidad;
            }

            entry.rollos.push(newCard);
            entry.dirty = true;
            renderPuntos(true);
            focusRolloNumero(recordId, entry.rollos.length - 1);
            return;
        }

        if (action === 'remove-rollo') {
            const context = findRolloContext(actionButton);
            if (!context) {
                return;
            }

            // La X de la tarjeta se lleva todos los defectos del rollo: si hay
            // algo cargado se pregunta, porque no hay como deshacer.
            const cargados = context.rollo.defectos.filter(
                (item) => String(item.defecto || '').trim() || String(item.cantidad || '').trim()
            ).length;

            if (cargados && !window.confirm(`Quitar el rollo con sus ${cargados} defecto(s)?`)) {
                return;
            }

            entry.rollos.splice(context.rolloIndex, 1);
            if (!entry.rollos.length) {
                entry.rollos.push(createEmptyRollo(findRecordById(recordId)));
            }
            entry.dirty = true;
            renderPuntos(true);
            return;
        }

        if (action === 'add-defecto') {
            const context = findRolloContext(actionButton);
            if (!context) {
                return;
            }

            // Se abre el selector de una: la linea vacia sin defecto no le
            // sirve a nadie y era un toque de mas.
            context.rollo.defectos.push(createEmptyDefecto());
            entry.dirty = true;
            renderPuntos(true);
            openDefectoPicker(recordId, context.rolloIndex, context.rollo.defectos.length - 1, true);
            return;
        }

        if (action === 'pick-defecto') {
            const context = findDefectoContext(actionButton);
            if (!context) {
                return;
            }

            openDefectoPicker(context.recordId, context.rolloIndex, context.defectoIndex, false);
            return;
        }

        if (action === 'toggle-porcentaje') {
            const context = findDefectoContext(actionButton);
            if (!context) {
                return;
            }

            const item = context.rollo.defectos[context.defectoIndex];
            item.porcentaje = !item.porcentaje;
            entry.dirty = true;

            // Se repinta solo el boton: re-dibujar el cuadro cerraria el
            // teclado si el auditor esta cargando la cantidad.
            actionButton.classList.toggle('rollo-defecto-porcentaje-on', item.porcentaje);
            actionButton.setAttribute('aria-pressed', item.porcentaje ? 'true' : 'false');
            actionButton.textContent = porcentajeButtonLabel(item.porcentaje);

            // Si todavia no hay numero, el % solo no sirve: se abre el teclado.
            const row = actionButton.closest('.rollo-defecto-row');
            const input = row && row.querySelector('.rollo-defecto-cantidad');
            if (input instanceof HTMLInputElement && !input.value.trim()) {
                input.focus();
            }
        }
    }

    function setSyncStatus(message, isError = false) {
        const { syncStatus } = getElements();
        if (!syncStatus) return;
        syncStatus.textContent = message;
        syncStatus.style.color = isError ? 'var(--danger-text)' : 'var(--muted)';
    }

    // variant 'error' pinta el aviso en rojo con la X en circulo: se lee como
    // "algo salio mal" antes de leer el texto.
    function showToast(message, variant = '') {
        const { toast } = getElements();
        if (!toast) return;

        const isError = variant === 'error';

        toast.innerHTML = isError
            ? '<span class="toast-icon" aria-hidden="true">&times;</span>'
            : '';
        toast.appendChild(document.createTextNode(message));
        toast.classList.toggle('toast-error', isError);
        toast.classList.remove('hidden');

        if (state.toastTimer) {
            clearTimeout(state.toastTimer);
        }

        state.toastTimer = window.setTimeout(() => {
            toast.classList.add('hidden');
        }, isError ? 4800 : 3200);
    }

    function setRecords(records) {
        state.records = TintoreriaUtils.sortRecords(
            (records || []).map((record) => TintoreriaUtils.defaultRecord(record))
        );
    }

    function mergeRecords(records) {
        const recordsById = new Map();

        state.records.forEach((record) => {
            recordsById.set(String(record.id_registro || ''), record);
        });

        (records || []).forEach((record) => {
            const normalized = TintoreriaUtils.defaultRecord(record);
            const recordId = String(normalized.id_registro || '');
            if (!recordId) {
                return;
            }

            recordsById.set(recordId, normalized);
        });

        state.records = TintoreriaUtils.sortRecords(Array.from(recordsById.values()));
    }

    // La clave de busqueda de cada registro se calcula una sola vez:
    // normalizar miles de filas en cada tecla retrasaba la escritura.
    function getRecordOpPartidaKey(record) {
        if (record._opPartidaKey === undefined) {
            record._opPartidaKey = TintoreriaUtils.normalizeOpPartidaSearchValue(
                TintoreriaUtils.formatOpPartida(record.op_tela, record.partida)
            );
        }
        return record._opPartidaKey;
    }

    function filterByExactOpPartida(query) {
        const normalizedQuery = TintoreriaUtils.normalizeOpPartidaSearchValue(query);
        if (!normalizedQuery) {
            return [];
        }

        return state.records.filter((record) => getRecordOpPartidaKey(record) === normalizedQuery);
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

    function getAvailableAudits(records) {
        const byId = new Map();
        (records || []).forEach((record) => {
            getRecordAudits(record).forEach((audit) => {
                const id = String(audit.id || '');
                if (!id || byId.has(id)) return;
                byId.set(id, audit);
            });
        });
        return Array.from(byId.values()).sort((left, right) => Number(left.numero || 0) - Number(right.numero || 0));
    }

    function formatAuditDate(value) {
        const raw = String(value || '').trim();
        if (!raw) return 'Sin fecha';
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('es-PE');
    }

    function closeAuditHistoryPicker() {
        const els = getElements();
        if (els.historyPicker) els.historyPicker.classList.add('hidden');
    }

    function chooseAudit(audit) {
        const els = getElements();
        state.activeAudit = audit;
        state.selectedIds.clear();
        state.puntosByRecordId.clear();
        state.lastObservationKey = null;
        state.lastAuditorKey = null;
        state.lastPuntosRenderKey = null;

        if (!audit.isNew) {
            state.filteredRecords.forEach((record) => {
                if (findRecordAudit(record, audit.id) && !hasFinalApproval(record)) {
                    state.selectedIds.add(String(record.id_registro || ''));
                }
            });
        } else {
            if (els.auditorInput) els.auditorInput.value = '';
            if (els.observationInput) els.observationInput.value = '';
        }

        closeAuditHistoryPicker();
        renderResults();
    }

    function promptForAuditChoice() {
        const els = getElements();
        const query = state.currentQuery.trim();
        const records = filterByExactOpPartida(query);
        if (!query || !records.length || state.auditChoiceQuery === query) return;

        state.auditChoiceQuery = query;
        const audits = getAvailableAudits(records);
        const nextNumber = audits.reduce((max, audit) => Math.max(max, Number(audit.numero || 0)), 0) + 1;
        const newAudit = {
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            numero: nextNumber,
            fecha: '',
            isNew: true
        };

        if (!audits.length) {
            state.activeAudit = newAudit;
            return;
        }

        if (!els.historyPicker || !els.historyList) return;
        els.historyList.innerHTML = [
            `<button type="button" class="audit-history-option audit-history-option-new" data-audit-action="new">Nueva auditoria</button>`,
            ...audits.map((audit) => `
                <button type="button" class="audit-history-option" data-audit-id="${TintoreriaUtils.escapeHtml(audit.id)}">
                    Editar AUD${Number(audit.numero || 1)} - ${TintoreriaUtils.escapeHtml(formatAuditDate(audit.fecha))}
                </button>
            `)
        ].join('');
        els.historyPicker._newAudit = newAudit;
        els.historyPicker._audits = audits;
        els.historyPicker.classList.remove('hidden');
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
            renderPuntos();
            return;
        }

        state.filteredRecords = filterByExactOpPartida(query);
        pruneSelection();

        if (!state.filteredRecords.length) {
            els.resultSummary.textContent = 'No se encontraron filas para esa OP-PTDA.';
            els.resultList.innerHTML = '<div class="empty-state">No se encontraron coincidencias exactas para la OP-PTDA ingresada.</div>';
            els.formCard.classList.add('hidden');
            els.selectAllBtn.classList.add('hidden');
            renderPuntos();
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
        const selectedRecords = getSelectedRecords();
        if (els.auditorInput && state.activeAudit && !state.activeAudit.isNew) {
            const sharedAuditor = selectedCount > 0
                ? getSharedFieldValue(selectedRecords, 'calidad_auditor')
                : '';
            const auditorKey = `${state.activeAudit ? state.activeAudit.id : ''}::${Array.from(state.selectedIds).sort().join('|')}::${sharedAuditor}`;
            if (auditorKey !== state.lastAuditorKey) {
                state.lastAuditorKey = auditorKey;
                els.auditorInput.value = sharedAuditor;
            }
        }
        if (els.turnoInput) {
            const savedTurno = selectedCount > 0 && state.activeAudit && !state.activeAudit.isNew
                ? getSharedFieldValue(selectedRecords, 'calidad_turno')
                : '';
            els.turnoInput.value = savedTurno || calculateTurno();
        }
        if (els.observationInput) {
            // La observacion solo se re-carga cuando cambia la seleccion o el dato
            // remoto: un refresh en segundo plano no debe pisar lo escrito.
            const sharedObservation = selectedCount > 0
                ? getSharedFieldValue(selectedRecords, 'observacion_calidad')
                : '';
            const observationKey = `${Array.from(state.selectedIds).sort().join('|')}::${sharedObservation}`;
            if (observationKey !== state.lastObservationKey) {
                state.lastObservationKey = observationKey;
                els.observationInput.value = sharedObservation;
            }
        }

        renderPuntos();
    }

    function syncSupervisorFabVisibility() {
        const els = getElements();
        if (!els.supervisorFab || !els.searchInput) {
            return;
        }

        const hasSearchValue = String(els.searchInput.value || '').trim() !== '';
        els.supervisorFab.classList.toggle('hidden', hasSearchValue);
    }

    function resetSearchToInitialScreen() {
        const els = getElements();

        state.currentQuery = '';
        state.auditChoiceQuery = '';
        state.activeAudit = null;
        state.filteredRecords = [];
        state.selectedIds.clear();
        state.puntosByRecordId.clear();
        state.lastObservationKey = null;
        state.lastAuditorKey = null;
        state.lastPuntosRenderKey = null;
        state.remoteSearchToken += 1;

        if (autoRefreshQueryTimer) {
            clearTimeout(autoRefreshQueryTimer);
            autoRefreshQueryTimer = null;
        }

        if (els.searchInput) {
            els.searchInput.value = '';
        }

        if (els.auditorInput) {
            els.auditorInput.value = '';
        }

        if (els.observationInput) {
            els.observationInput.value = '';
        }

        if (els.turnoInput) {
            els.turnoInput.value = calculateTurno();
        }

        syncSupervisorFabVisibility();
        renderResults();
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
        const nextQuery = String(query || '').trim().toUpperCase();
        if (nextQuery !== state.currentQuery) {
            state.auditChoiceQuery = '';
            state.activeAudit = null;
            closeAuditHistoryPicker();
        }
        state.currentQuery = nextQuery;
        const searchToken = state.remoteSearchToken + 1;
        state.remoteSearchToken = searchToken;
        // Re-sincroniza en segundo plano: otra tablet o la PC pudieron
        // actualizar esta misma OP-PTDA (o estar por agregarla al Sheet).
        if (state.currentQuery) {
            scheduleAutoRefreshOnQuery();
        }
        renderResults();

        if (
            state.currentQuery
            && !filterByExactOpPartida(state.currentQuery).length
            && window.TintoreriaAPI
            && typeof TintoreriaAPI.findRecordsByOpPartida === 'function'
        ) {
            try {
                const response = await TintoreriaAPI.findRecordsByOpPartida(state.currentQuery);
                if (searchToken !== state.remoteSearchToken || !state.currentQuery) {
                    return;
                }

                if (response && Array.isArray(response.records) && response.records.length) {
                    mergeRecords(response.records);
                    renderResults();
                }
            } catch (error) {
                // La busqueda remota es un respaldo para registros fuera de la
                // ventana inicial. Si falla, queda visible el resultado local.
                console.warn('No se pudo buscar la OP-PTDA en el historial completo.', error);
            }
        }

        if (searchToken === state.remoteSearchToken) {
            promptForAuditChoice();
        }
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

    // La identidad de la auditoria se resuelve una sola vez por guardado. Al
    // calcularla dentro del bucle de filas, una auditoria nueva sobre varias
    // filas nacia con un id distinto en cada una y el historial la repetia.
    function resolveAuditForSave() {
        return state.activeAudit || {
            id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            numero: getAvailableAudits(state.filteredRecords).length + 1,
            isNew: true
        };
    }

    function buildAuditSaveChanges(record, recordId, auditor, observacion, turno, active) {
        const existing = findRecordAudit(record, active.id);
        const fecha = existing && existing.fecha
            ? existing.fecha
            : TintoreriaUtils.formatProcessDateTime(new Date());
        const data = {
            calidad_turno: turno,
            calidad_auditor: auditor,
            calidad_inicio: fecha,
            observacion_calidad: observacion,
            ...serializePuntosRollos(getPuntosRollos(recordId))
        };
        const auditEntry = {
            id: active.id,
            numero: Number(active.numero || 1),
            fecha,
            data
        };
        const history = getRecordAudits(record);
        const existingIndex = history.findIndex((audit) => String(audit.id) === String(active.id));
        if (existingIndex >= 0) history[existingIndex] = auditEntry;
        else history.push(auditEntry);

        history.sort((left, right) => Number(left.numero || 0) - Number(right.numero || 0));
        const latest = history[history.length - 1] || auditEntry;
        return {
            ...buildEstadoUpdatesByRuta(record && record.ruta),
            ...(latest.data || data),
            calidad_auditorias: JSON.stringify(history)
        };
    }

    async function handleSave() {
        const els = getElements();
        const selectedIds = Array.from(state.selectedIds);
        const auditor = TintoreriaUtils.sanitizePersonName(els.auditorInput.value || '');
        const observacion = String(els.observationInput && els.observationInput.value ? els.observationInput.value : '').trim();
        const selectedRecords = getSelectedRecords();
        const savedTurno = state.activeAudit && !state.activeAudit.isNew
            ? getSharedFieldValue(selectedRecords, 'calidad_turno')
            : '';
        const turno = savedTurno || calculateTurno();
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

        // Red de seguridad: el aviso del focusout puede no llegar si se toca
        // Guardar directo desde el campo del #Rollo.
        const duplicado = findFirstDuplicateRollo(selectedIds);
        if (duplicado) {
            selectedIds.forEach(refreshRolloDuplicateMarks);
            showToast(
                `Rollo ${duplicado.numero} duplicado en el mismo articulo. Corrige el marcado en rojo para guardar.`,
                'error'
            );
            focusRolloNumero(duplicado.recordId, duplicado.rolloIndex);
            return;
        }

        els.saveBtn.disabled = true;
        els.saveBtn.textContent = 'Guardando...';

        try {
            const activeAudit = resolveAuditForSave();
            const updatesList = [];

            selectedIds.forEach((recordId) => {
                const record = findRecordById(recordId);
                if (!record) {
                    return;
                }

                updatesList.push({
                    id_registro: recordId,
                    changes: buildAuditSaveChanges(record, recordId, auditor, observacion, turno, activeAudit)
                });
            });

            if (!updatesList.length) {
                showToast('No se encontraron las filas seleccionadas.', 'error');
                return;
            }

            // Un solo envio para todas las filas: el Web App abre la hoja una
            // vez y escribe por rangos. Con una llamada por fila, cada guardado
            // repetia la lectura completa de la hoja y se hacia muy lento.
            const response = await TintoreriaAPI.updateRecords(updatesList);
            (response.records || []).forEach((record) => {
                mergeUpdatedRecord(record);
            });

            resetSearchToInitialScreen();
            showToast(`Auditoria guardada en ${updatesList.length} fila(s).`);
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

        if (els.historyList && els.historyPicker) {
            els.historyList.addEventListener('click', (event) => {
                const button = event.target.closest('[data-audit-action], [data-audit-id]');
                if (!button) return;
                if (button.dataset.auditAction === 'new') {
                    chooseAudit(els.historyPicker._newAudit);
                    return;
                }
                const audit = (els.historyPicker._audits || [])
                    .find((item) => String(item.id) === String(button.dataset.auditId));
                if (audit) chooseAudit({ ...audit, isNew: false });
            });
        }

        if (els.historyClose) {
            els.historyClose.addEventListener('click', closeAuditHistoryPicker);
        }

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

        if (els.puntosContainer) {
            els.puntosContainer.addEventListener('input', handlePuntosInput);
            els.puntosContainer.addEventListener('change', handlePuntosInput);
            els.puntosContainer.addEventListener('click', handlePuntosClick);
            // focusout y no blur: blur no burbujea hasta el contenedor.
            els.puntosContainer.addEventListener('focusout', handlePuntosBlur);
        }

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
            // Si el Sheet no cambio, no se reprocesa ni se re-renderiza nada.
            if (!response.unchanged) {
                setRecords(response.records || []);
                renderResults();
            }
            setSyncStatus('');
        } catch (error) {
            setSyncStatus(error && error.message ? error.message : 'No se pudo sincronizar la informacion.', true);
        } finally {
            state.syncing = false;
            // Cualquier sincronizacion completada cuenta para el intervalo minimo.
            lastAutoRefreshAt = Date.now();
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

    // Toda busqueda re-sincroniza con el Sheet al dejar de escribir: otra
    // tablet o la PC pudieron actualizar la misma OP-PTDA (p. ej. un registro
    // hecho en otro equipo). Si el Sheet ya se consulto hace poco, la
    // verificacion se reprograma para cuando se cumpla el intervalo minimo en
    // vez de descartarse, y mientras la consulta siga "sin resultados" en
    // pantalla se vuelve a verificar sola.
    const AUTO_REFRESH_QUERY_DEBOUNCE_MS = 1200;
    let autoRefreshQueryTimer = null;

    function scheduleAutoRefreshOnQuery() {
        if (autoRefreshQueryTimer) {
            clearTimeout(autoRefreshQueryTimer);
        }

        const sinceLastRefresh = Date.now() - lastAutoRefreshAt;
        const delay = Math.max(AUTO_REFRESH_QUERY_DEBOUNCE_MS, AUTO_REFRESH_MIN_INTERVAL_MS - sinceLastRefresh);

        autoRefreshQueryTimer = window.setTimeout(async () => {
            autoRefreshQueryTimer = null;
            if (document.visibilityState === 'hidden') {
                return;
            }

            if (!state.currentQuery) {
                return;
            }

            await requestAutoRefresh();

            // Si la OP-PTDA sigue sin aparecer (esta por registrarse en el
            // Sheet), se vuelve a verificar de forma automatica.
            if (state.currentQuery && !filterByExactOpPartida(state.currentQuery).length) {
                scheduleAutoRefreshOnQuery();
            }
        }, delay);
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
        bindDefectoPickerEvents();
        bindAutoRefreshEvents();
        await hydrateFromCache();
        await refreshRemoteRecords();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
