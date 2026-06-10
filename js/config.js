const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxEFPaj9h7Reot611VpXxDleCtD9YZyV70Fw-mOb3_UTIToiBLZ7-3Fs0Ypg6zTfKmb/exec';
const SHEET_ID = '1xyHNMesThJLbYFSizH6xNjJcj2F_gy9lnlCDqwejFN0';
const DATA_SHEET_NAME = 'Hoja 1';

const MASTER_HEADERS = [
    'F_ing_crudo',
    'cliente',
    'tipo_tela',
    'op_tela',
    'partida',
    'cod_art',
    'articulo',
    'cod_color',
    'color',
    'peso_kg_crudo',
    'cantidad_crudo',
    'tipo_guia',
    'motivo_guia',
    'reserva',
    'certificado',
    'ruta',
    'ancho_crudo',
    'densidad_crudo',
    'maestro_confirmado',
    'id_registro',
    'fecha_registro',
    'plegado_p',
    'plegado_turno',
    'plegado_equipo',
    'plegado_estado',
    'plegado_fecha',
    'rama_crudo_p',
    'rama_crudo_turno',
    'rama_crudo_operario',
    'rama_crudo_maquina',
    'rama_crudo_proceso',
    'rama_crudo_inspector',
    'rama_crudo_supervisor',
    'rama_crudo_ancho',
    'rama_crudo_densidad',
    'rama_crudo_temperatura',
    'rama_crudo_velocidad',
    'rama_crudo_alimentacion',
    'rama_crudo_ancho_de_cadena',
    'rama_crudo_orillo_derecho',
    'rama_crudo_orillo_izquierdo',
    'rama_crudo_observaciones',
    'rama_crudo_inicio',
    'rama_crudo_fin',
    'rama_crudo_estado',
    'preparado_p',
    'preparado_turno',
    'preparado_equipo',
    'preparado_tipo',
    'preparado_inicio',
    'preparado_fin',
    'preparado_estado',
    'tenido_p',
    'tenido_turno',
    'tenido_operario',
    'tenido_maquina',
    'tenido_proceso',
    'tenido_tipo_proceso',
    'tenido_kg',
    'tenido_kg_pre_tratamiento',
    'tenido_kg_post_tratamiento',
    'tenido_kg_reproceso',
    'tenido_rb',
    'tenido_volumen',
    'tenido_observaciones',
    'tenido_controlador',
    'tenido_supervisor',
    'tenido_inicio',
    'tenido_fin',
    'tenido_estado',
    'abridora_p',
    'abridora_turno',
    'abridora_operario',
    'abridora_inicio',
    'abridora_fin',
    'abridora_estado',
    'rama_tenido_p',
    'rama_tenido_turno',
    'rama_tenido_operario',
    'rama_tenido_maquina',
    'rama_tenido_proceso',
    'rama_tenido_inspector',
    'rama_tenido_supervisor',
    'rama_tenido_ancho',
    'rama_tenido_densidad',
    'rama_tenido_temperatura',
    'rama_tenido_velocidad',
    'rama_tenido_alimentacion',
    'rama_tenido_ancho_de_cadena',
    'rama_tenido_orillo_derecho',
    'rama_tenido_orillo_izquierdo',
    'rama_tenido_observaciones',
    'rama_tenido_inicio',
    'rama_tenido_fin',
    'rama_tenido_estado',
    'acabado_especial_p',
    'acabado_especial_tipo',
    'acabado_especial_turno',
    'acabado_especial_maquina',
    'acabado_especial_estado',
    'acabado_especial_fecha',
    'acab_espec_estado',
    'calidad_p',
    'calidad_auditor',
    'calidad_turno',
    'calidad_inicio',
    'calidad_fin',
    'calidad_estado',
    'motivo_rechazo_1',
    'turno_rechazo_1',
    'supervisor_rechazo_1',
    'motivo_rechazo_2',
    'turno_rechazo_2',
    'supervisor_rechazo_2',
    'motivo_rechazo_3',
    'turno_rechazo_3',
    'supervisor_rechazo_3',
    'motivo_rechazo_4',
    'turno_rechazo_4',
    'supervisor_rechazo_4',
    'motivo_rechazo_5',
    'supervisor_rechazo_5',
    'turno_rechazo_5',
    'motivo_rechazo_6',
    'supervisor_rechazo_6',
    'turno_rechazo_6',
    'motivo_rechazo_7',
    'supervisor_rechazo_7',
    'turno_rechazo_7',
    'observacion_calidad',
    'cantidad_rechazos',
    'tipo_aprobacion',
    'quien_aprobo',
    'supervisor_aprobacion',
    'turno_aprobacion',
    'fecha_rechazo_1',
    'fecha_rechazo_2',
    'fecha_rechazo_3',
    'fecha_rechazo_4',
    'fecha_rechazo_5',
    'fecha_rechazo_6',
    'fecha_rechazo_7',
    'fecha_aprobacion',
    'embalaje_p',
    'embalaje_fecha',
    'embalaje_estado'
];

const ROUTE_OPTIONS = ['', 'Termoficado', 'Humectado', 'Directo'];
const PLEGADO_TURNO_OPTIONS = ['', '1T', '2T'];
const PLEGADO_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const RAMA_CRUDO_TURNO_OPTIONS = ['', '1T', '2T'];
const RAMA_CRUDO_MAQUINA_OPTIONS = ['', 'K20', 'K30', 'Unitech'];
const RAMA_CRUDO_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const PREPARADO_TURNO_OPTIONS = ['', '1T', '2T'];
const PREPARADO_TIPO_OPTIONS = ['', 'Descosido', 'Desc+Costura', 'Volteado'];
const PREPARADO_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const TENIDO_TURNO_OPTIONS = ['', '1T', '2T'];
const TENIDO_MAQUINA_OPTIONS = [
    '',
    'THI5',
    'SCH7',
    'SCH9',
    'SCH10',
    'SCH12',
    'BNG1',
    'BNG2',
    'BNG3',
    'BNG4',
    'BNG5',
    'FNGS',
    'LAB-P',
    'BRZZ'
];
const TENIDO_PROCESO_OPTIONS = ['', 'Pre-tratamiento', 'Tenido', 'Post-tratamiento', 'Matizado'];
const TENIDO_TIPO_PROCESO_OPTIONS = [
    '',
    'blanqCatalitico',
    'blanqOptico',
    'blanqQuimico',
    'Descrude',
    'Enjuague Caliente',
    'Enzimatico',
    'Fijado',
    'Jabonado',
    'Lavado',
    'lavMaq',
    'Rebaje',
    'TnReactivo',
    'TnDisperso'
];
const TENIDO_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const ABRIDORA_TURNO_OPTIONS = ['', '1T', '2T'];
const ABRIDORA_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const RAMA_TENIDO_TURNO_OPTIONS = ['', '1T', '2T'];
const RAMA_TENIDO_MAQUINA_OPTIONS = ['', 'K20', 'K30', 'Unitech'];
const RAMA_TENIDO_PROCESO_OPTIONS = ['', 'ACABADO', 'CHANCADO', 'CURADO', 'LAVADO', 'MATIZADO', 'REPROCESO', 'RESINADO', 'RE-TERMOFIJADO', 'SECADO', 'TERMO-ACABADO'];
const RAMA_TENIDO_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const ACABADO_ESPECIAL_TIPO_OPTIONS = ['', 'NO LLEVA', 'HIDRO-EXTRACTORA', 'SANTEX', 'SECADO', 'ESMERILADO', 'COMPACTADO', 'PERCHADO'];
const ACABADO_ESPECIAL_TURNO_OPTIONS = ['', '1T', '2T'];
const ACABADO_ESPECIAL_MAQUINA_OPTIONS = ['', 'SANTEX', 'HIDRO-EXTRACTORA', 'ESMERILADORA', 'BIANCALANI', 'PERCHA'];
const ACABADO_ESPECIAL_ESTADO_OPTIONS = ['X PROG', 'PROG', 'OK'];
const CALIDAD_TURNO_OPTIONS = ['', '1T', '2T', '3T'];
const CALIDAD_ESTADO_OPTIONS = ['', 'AUDITANDO', '1er RECHAZO', 'OK'];
const CALIDAD_ESTADO_RECHAZADAS_OPTIONS = ['1er RECHAZO', '2do RECHAZO', '3er RECHAZO', '4to RECHAZO', 'OK'];
const MOTIVOS_RECHAZO_OPTIONS = [
    '',
    'CONTAMINACION',
    'DEGRAD\u00C9',
    'DENSIDAD BAJA/ELEVADA',
    'ESTABILIDAD DIMENSIONAL',
    'FIBRA MUERTA (NEPS)',
    'FUERA DE MEDIDAS',
    'MALA IGUALACI\u00D3N',
    'MANCHAS',
    'LINEAS VERTICALES',
    'PILLING',
    'QUEBRADURAS',
    'RASPADURAS',
    'RESISTENCIA',
    'SOLIDEZ',
    'TACTO',
    'TONO',
    'OTROS'
];
const TIPO_APROBACION_OPTIONS = [
    '',
    'APROBADO',
    'APROBADO C/TOLERANCIA',
    'APROBADO C/AUTORIZACION'
];
const QUIEN_APROBO_OPTIONS = [
    '',
    'G. OPERACIONES',
    'G. COMERCIAL',
    'DT TINTORERIA',
    'DT CONFECCIONES',
    'ASEG. CAL. CONFECC',
    'JEFATURA TINTO',
    'EJECUTIVO COM.'
];
const SUPERVISOR_APROBACION_OPTIONS = [
    '',
    'ALEX FLORES',
    'RONALD JARAMILLO',
    'MIGUEL MAMANI',
    'OTRO'
];
const EMBALAJE_ESTADO_OPTIONS = ['', 'OK'];
const LOCAL_STORAGE_KEY = 'tintoreria-records-mobile-calidad';

const PROCESS_TABS = [
    { id: 'plegado', label: 'Plegado' },
    { id: 'rama-crudo', label: 'Rama Crudo' },
    { id: 'preparado', label: 'Preparado' },
    { id: 'tenido', label: 'Tenido' },
    { id: 'abridora', label: 'Abridora' },
    { id: 'rama-tenido', label: 'Rama Tenido' },
    { id: 'acab-espec', label: 'Acab Espec.' },
    { id: 'calidad', label: 'Calidad' },
    { id: 'embalaje', label: 'Embalaje' }
];

window.TintoreriaConfig = {
    WEB_APP_URL,
    SHEET_ID,
    DATA_SHEET_NAME,
    MASTER_HEADERS,
    ROUTE_OPTIONS,
    PLEGADO_TURNO_OPTIONS,
    PLEGADO_ESTADO_OPTIONS,
    RAMA_CRUDO_TURNO_OPTIONS,
    RAMA_CRUDO_MAQUINA_OPTIONS,
    RAMA_CRUDO_ESTADO_OPTIONS,
    PREPARADO_TURNO_OPTIONS,
    PREPARADO_TIPO_OPTIONS,
    PREPARADO_ESTADO_OPTIONS,
    TENIDO_TURNO_OPTIONS,
    TENIDO_MAQUINA_OPTIONS,
    TENIDO_PROCESO_OPTIONS,
    TENIDO_TIPO_PROCESO_OPTIONS,
    TENIDO_ESTADO_OPTIONS,
    ABRIDORA_TURNO_OPTIONS,
    ABRIDORA_ESTADO_OPTIONS,
    RAMA_TENIDO_TURNO_OPTIONS,
    RAMA_TENIDO_MAQUINA_OPTIONS,
    RAMA_TENIDO_PROCESO_OPTIONS,
    RAMA_TENIDO_ESTADO_OPTIONS,
    ACABADO_ESPECIAL_TIPO_OPTIONS,
    ACABADO_ESPECIAL_TURNO_OPTIONS,
    ACABADO_ESPECIAL_MAQUINA_OPTIONS,
    ACABADO_ESPECIAL_ESTADO_OPTIONS,
    CALIDAD_TURNO_OPTIONS,
    CALIDAD_ESTADO_OPTIONS,
    CALIDAD_ESTADO_RECHAZADAS_OPTIONS,
    MOTIVOS_RECHAZO_OPTIONS,
    TIPO_APROBACION_OPTIONS,
    QUIEN_APROBO_OPTIONS,
    SUPERVISOR_APROBACION_OPTIONS,
    EMBALAJE_ESTADO_OPTIONS,
    LOCAL_STORAGE_KEY,
    PROCESS_TABS
};
