// Enums de la base de datos (espejo de los tipos ENUM de PostgreSQL en db/migrations)
export const Rol = {
  apicultor: 'apicultor',
  administrador: 'administrador'
} as const

export type Rol = (typeof Rol)[keyof typeof Rol]


export const EstadoColmena = {
  activa: 'activa',
  inactiva: 'inactiva',
  abandonada: 'abandonada',
  destruida: 'destruida'
} as const

export type EstadoColmena = (typeof EstadoColmena)[keyof typeof EstadoColmena]


export const EstadoNucleo = {
  en_formacion: 'en_formacion',
  en_desarrollo: 'en_desarrollo',
  listo: 'listo',
  convertido: 'convertido',
  vendido: 'vendido',
  destruido: 'destruido',
  anulado: 'anulado'
} as const

export type EstadoNucleo = (typeof EstadoNucleo)[keyof typeof EstadoNucleo]


export const OrigenReina = {
  criada: 'criada',
  comprada: 'comprada',
  capturada: 'capturada',
  desconocida: 'desconocida'
} as const

export type OrigenReina = (typeof OrigenReina)[keyof typeof OrigenReina]


export const EstadoCasoSanitario = {
  abierto: 'abierto',
  en_seguimiento: 'en_seguimiento',
  cerrado_recuperado: 'cerrado_recuperado',
  cerrado_sacrificio: 'cerrado_sacrificio',
  anulado: 'anulado'
} as const

export type EstadoCasoSanitario = (typeof EstadoCasoSanitario)[keyof typeof EstadoCasoSanitario]


export const GravedadCasoSanitario = {
  baja: 'baja',
  media: 'media',
  alta: 'alta',
  critica: 'critica'
} as const

export type GravedadCasoSanitario = (typeof GravedadCasoSanitario)[keyof typeof GravedadCasoSanitario]


export const TipoAccionSanitaria = {
  aislamiento: 'aislamiento',
  toma_muestra: 'toma_muestra',
  diagnostico: 'diagnostico',
  notificacion_ica: 'notificacion_ica',
  control_fisico: 'control_fisico',
  control_biologico: 'control_biologico',
  control_autorizado_ica: 'control_autorizado_ica',
  limpieza_desinfeccion: 'limpieza_desinfeccion',
  seguimiento: 'seguimiento',
  recuperacion: 'recuperacion',
  sacrificio_destruccion: 'sacrificio_destruccion',
  disposicion_final: 'disposicion_final'
} as const

export type TipoAccionSanitaria = (typeof TipoAccionSanitaria)[keyof typeof TipoAccionSanitaria]


export const TipoEventoNucleo = {
  creado: 'creado',
  actualizado: 'actualizado',
  cambio_estado: 'cambio_estado',
  traslado: 'traslado',
  convertido: 'convertido',
  vendido: 'vendido',
  destruido: 'destruido',
  anulado: 'anulado'
} as const

export type TipoEventoNucleo = (typeof TipoEventoNucleo)[keyof typeof TipoEventoNucleo]


export const TipoProducto = {
  miel: 'miel',
  cera: 'cera',
  propoleo: 'propoleo',
  polen: 'polen',
  jalea_real: 'jalea_real',
  otros: 'otros'
} as const

export type TipoProducto = (typeof TipoProducto)[keyof typeof TipoProducto]


export const CategoriaInsumo = {
  cajas_colmena: 'cajas_colmena',
  cajas_nucleo: 'cajas_nucleo',
  marcos: 'marcos',
  alzas: 'alzas',
  techos: 'techos',
  bases: 'bases',
  pisos: 'pisos',
  excluidores_reina: 'excluidores_reina',
  alimentadores: 'alimentadores',
  tratamientos: 'tratamientos',
  equipos_proteccion: 'equipos_proteccion',
  herramientas: 'herramientas',
  equipos_extraccion: 'equipos_extraccion',
  envases: 'envases',
  alimentacion: 'alimentacion',
  cria_reinas: 'cria_reinas',
  sanidad_bioseguridad: 'sanidad_bioseguridad',
  medicion: 'medicion',
  transporte: 'transporte',
  procesamiento_cera: 'procesamiento_cera',
  procesamiento_polen: 'procesamiento_polen',
  procesamiento_propoleo: 'procesamiento_propoleo',
  materiales_construccion: 'materiales_construccion',
  otros: 'otros'
} as const

export type CategoriaInsumo = (typeof CategoriaInsumo)[keyof typeof CategoriaInsumo]


export const TipoItemInventario = {
  insumo: 'insumo',
  activo: 'activo'
} as const

export type TipoItemInventario = (typeof TipoItemInventario)[keyof typeof TipoItemInventario]


export const EstadoActivoInventario = {
  disponible: 'disponible',
  en_uso: 'en_uso',
  mantenimiento: 'mantenimiento',
  retirado: 'retirado'
} as const

export type EstadoActivoInventario = (typeof EstadoActivoInventario)[keyof typeof EstadoActivoInventario]


export const TipoMovimientoInventario = {
  entrada: 'entrada',
  salida: 'salida',
  ajuste: 'ajuste'
} as const

export type TipoMovimientoInventario = (typeof TipoMovimientoInventario)[keyof typeof TipoMovimientoInventario]


export const EstadoStock = {
  stock_bajo: 'stock_bajo',
  stock_medio: 'stock_medio',
  stock_bueno: 'stock_bueno',
  agotado: 'agotado'
} as const

export type EstadoStock = (typeof EstadoStock)[keyof typeof EstadoStock]


export const EstadoSanidad = {
  saludable: 'saludable',
  enferma: 'enferma',
  tratada: 'tratada',
  cuarentena: 'cuarentena'
} as const

export type EstadoSanidad = (typeof EstadoSanidad)[keyof typeof EstadoSanidad]


export const TipoTransaccion = {
  ingreso: 'ingreso',
  egreso: 'egreso'
} as const

export type TipoTransaccion = (typeof TipoTransaccion)[keyof typeof TipoTransaccion]


export const EstadoPago = {
  pagado: 'pagado',
  parcial: 'parcial',
  pendiente: 'pendiente'
} as const

export type EstadoPago = (typeof EstadoPago)[keyof typeof EstadoPago]


export const EstadoEnjambre = {
  activo: 'activo',
  inactivo: 'inactivo',
  dividido: 'dividido',
  fusionado: 'fusionado'
} as const

export type EstadoEnjambre = (typeof EstadoEnjambre)[keyof typeof EstadoEnjambre]


export const Moneda = {
  COP: 'COP',
  EUR: 'EUR',
  USD: 'USD'
} as const

export type Moneda = (typeof Moneda)[keyof typeof Moneda]


export const TipoAlerta = {
  inspeccion: 'inspeccion',
  produccion: 'produccion',
  sanidad: 'sanidad',
  mantenimiento: 'mantenimiento',
  control_rutinario: 'control_rutinario',
  otros: 'otros'
} as const

export type TipoAlerta = (typeof TipoAlerta)[keyof typeof TipoAlerta]


export const TipoActividad = {
  inspeccion: 'inspeccion',
  produccion: 'produccion',
  alerta: 'alerta',
  mantenimiento: 'mantenimiento',
  control_rutinario: 'control_rutinario',
  otros: 'otros'
} as const

export type TipoActividad = (typeof TipoActividad)[keyof typeof TipoActividad]


export const PrioridadAlerta = {
  baja: 'baja',
  media: 'media',
  alta: 'alta',
  critica: 'critica'
} as const

export type PrioridadAlerta = (typeof PrioridadAlerta)[keyof typeof PrioridadAlerta]
