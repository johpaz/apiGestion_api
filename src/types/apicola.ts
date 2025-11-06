import { TipoProducto } from '../generated/prisma/client';

export interface Apiario {
  id: string;
  nombre: string;
  ciudad: string;
  pais: string;
  direccion: string;
  comoLlegar: string | null;
  imagenApiario: string | null;
  fechaCreacion: Date;
  fechaActualizacion: Date;
}

export interface Colmena {
   id: string;
   nombre: string;
   estado: EstadoColmena;
   fechaInstalacion: Date;
   fechaCreacion: Date;
   fechaActualizacion: Date;
   cuadros: number | null;
   reyna: boolean | null;
   tipoReyna: string | null;
   fechaReyna: Date | null;
   // Campos para alertas recurrentes
   alertasRecurrentesActivadas: boolean;
   ultimaAlertaControl: Date | null;
   usuarioId: string;
   apiarioId: string;
}

export interface InspeccionSanitaria {
  id: string;
  fecha: string;
  colmenaId: string;
  visita: number;
  cuadros: {
    conCria: number;
    ceraNueva: number;
    ceraVieja: number;
  };
  reyna: {
    presente: boolean;
    posibleEnfermedad: string;
    tipoAlza: string;
    cantidadAlimentadas: number;
    tipoAlimento: string;
  };
  patologias: PatologiaDetectada[];
  tratamientos: TratamientoAplicado[];
  observaciones: string;
  usuarioId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PatologiaDetectada {
  id: string;
  tipo: 'nosemosis' | 'varroasis' | 'cria_yeso' | 'loque_e' | 'loque_a' | 'polilla' | 'insectos' | 'arañas' | 'cria_cal' | 'otros';
  severidad: 'bajo' | 'medio' | 'alto' | 'muy_alto';
  tratamiento: string;
  observaciones?: string;
}

export interface TratamientoAplicado {
  id: string;
  tipo: 'quimico' | 'organico' | 'biologico';
  producto: string;
  dosis: string;
  fechaAplicacion: string;
  proximaAplicacion?: string;
}

export interface Enjambre {
  id: string;
  nombre: string;
  estado: EstadoEnjambre;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  notas: string | null;
  // Campos para alertas recurrentes
  alertasRecurrentesActivadas: boolean;
  ultimaAlertaControl: Date | null;
  colmenaId: string;
  usuarioId: string;
}

export interface Nucleo {
  id: string;
  numero: number;
  tipo: string;
  estado: string;
  fechaInstalacion: Date;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  // Campos para alertas recurrentes
  alertasRecurrentesActivadas: boolean;
  ultimaAlertaControl: Date | null;
  colmenaId: string;
  colmena: Colmena;
}

export interface ProduccionColmena {
  id: string;
  nombre: string;
  tipo: TipoProducto;
  cantidad: number;
  unidad: string;
  precioUnitario: number | null;
  fechaProduccion: Date | null;
  fechaVencimiento: Date | null;
  lote: string | null;
  notas: string | null;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  usuarioId: string;
}

export enum Moneda {
  COP = 'COP',
  EUR = 'EUR',
  USD = 'USD'
}

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  password: string;
  rol: 'apicultor' | 'administrador';
  activo: boolean;
  colmenasAsignadas: string[];
  fechaRegistro: Date;
  ultimoAcceso?: Date;
  moneda: Moneda;
  alertasActivadas: boolean;
  notificacionesEmail: boolean;
  idioma: string;
}

export type EstadoColmena = 'activa' | 'inactiva' | 'abandonada';

export type EstadoEnjambre = 'activo' | 'inactivo' | 'dividido' | 'fusionado';

export interface RegistroFinanciero {
  id: string;
  fecha: string;
  tipo: 'ingreso' | 'egreso';
  categoria: 'venta_miel' | 'venta_cera' | 'venta_polen' | 'material' | 'tratamientos' | 'combustible' | 'otros';
  descripcion: string;
  monto: number;
  comprobante?: string;
  usuarioId: string;
  createdAt: Date;
  updatedAt: Date;
}

// Request/Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  nombre: string;
  email: string;
  password: string;
  rol?: 'apicultor' | 'administrador';
}

export interface AuthResponse {
  user: Omit<Usuario, 'password'>;
  token: string;
}

export interface InsumoApicola {
  id: string;
  nombre: string;
  categoria: CategoriaInsumo;
  descripcion?: string;
  cantidadActual: number;
  cantidadMinima: number;
  unidad: string;
  precioUnitario?: number;
  ubicacion?: string;
  estadoStock: EstadoStock;
  porcentajeStock?: number;
  fechaCaducidad?: Date;
  lote?: string;
  proveedor?: string;
  notas?: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  usuarioId: string;
}

export type CategoriaInsumo =
  | 'marcos'
  | 'alzas'
  | 'techos'
  | 'pisos'
  | 'excluidores_reina'
  | 'alimentadores'
  | 'tratamientos'
  | 'equipos_proteccion'
  | 'herramientas'
  | 'materiales_construccion'
  | 'otros';

export interface Produccion {
  id: string;
  fecha: Date;
  tipoProducto: TipoProducto;
  cantidad: number;
  unidad: string;
  calidad?: string;
  lote?: string;
  destino?: string;
  observaciones?: string;
  fechaCreacion: Date;
  fechaActualizacion: Date;
  usuarioId: string;
  colmenaId: string;
  apiarioId: string;
}
export type EstadoStock = 'stock_bajo' | 'stock_medio' | 'stock_bueno' | 'agotado';
