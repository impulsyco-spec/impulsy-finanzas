// ── Entidades existentes ───────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  company: string;
  email?: string;
  phone?: string;
}

export interface Project {
  id: string;
  clientId: string;
  name: string;
  plan: string;
  totalAmount: number;
  installments: number;
  durationMonths: number;
  startDate: string;
  status: 'active' | 'completed' | 'on-hold' | 'cancelled';
  isRecurring?: boolean;
  // Nuevos campos financieros
  tipoAcuerdo?: 'pago_unico' | 'pagos_divididos' | 'retainer' | 'hibrido';
  valorTotalAcuerdo?: number;
  estadoProyecto?: 'activo' | 'vencido' | 'pausado' | 'finalizado';
}

export interface Payment {
  id: string;
  projectId: string;
  amount: number;
  actualAmount?: number;
  date: string;
  status: 'paid' | 'pending' | 'overdue';
  // Nuevos campos
  ledgerMovementId?: string;
  notas?: string;
  fechaCobro?: string;
}

// ── Nuevas entidades financieras ───────────────────────────────

export interface RealAccount {
  id: string;
  nombre: string;
  tipo: 'bancaria' | 'digital' | 'efectivo' | 'tarjeta' | 'personal';
  saldoInicial: number;
  activa: boolean;
}

export interface Pocket {
  id: string;
  nombre: string;
  porcentajeDefault?: number;
  orden: number;
  activo: boolean;
}

export type TipoMovimiento =
  | 'ingreso_operativo'
  | 'egreso_operativo'
  | 'transferencia'
  | 'retiro_fundador'
  | 'aporte_capital'
  | 'deuda_recibida'
  | 'pago_deuda'
  | 'impuesto'
  | 'ajuste';

export type NaturalezaMovimiento = 'ingreso' | 'egreso' | 'neutro';

export type EstadoMovimiento = 'esperado' | 'facturado' | 'confirmado' | 'vencido' | 'anulado';

export interface LedgerMovement {
  id: string;
  fecha: string;
  tipoMovimiento: TipoMovimiento;
  naturaleza: NaturalezaMovimiento;
  descripcion: string;
  valor: number;
  categoria?: string;
  estado: EstadoMovimiento;
  cuentaRealId?: string;
  pocketId?: string;
  projectId?: string;
  clientId?: string;
  paymentId?: string;
  teamMemberId?: string;
  tercero?: string;
  fechaVencimiento?: string;
  notas?: string;
  personalFlag: boolean;
  tipoRetiro?: 'sueldo_aprobado' | 'anticipo_sueldo' | 'retiro_extraordinario' | 'gasto_personal_empresa';
  mes?: string;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  nombre: string;
  rol: string;
  email?: string;
  telefono?: string;
  tarifaMensual: number;
  activo: boolean;
  notas?: string;
  avatarColor: string;
  createdAt: string;
}

export interface Debt {
  id: string;
  acreedor: string;
  tipo: 'prestamo' | 'tarjeta' | 'credito_proveedor' | 'otro';
  montoOriginal: number;
  saldoActual: number;
  cuotaMinima: number;
  tasaMensual?: number;
  fechaProximoPago?: string;
  activa: boolean;
  notas?: string;
}

export interface FinancialKPIs {
  cajaTotal: number;
  cajaComprometida: number;
  cajaLibre: number;
  porCobrar: number;
  porPagar: number;
  totalDeudas: number;
  ingresosYTD: number;
  gastosYTD: number;
  utilidadYTD: number;
  margenYTD: number;
  retirosFounderMes: number;
  runway: number;
}

export interface Semaforo {
  id: string;
  label: string;
  estado: 'verde' | 'amarillo' | 'rojo';
  valor: string;
  desc: string;
  detalle: string;
}

export interface ProjectRentabilidad {
  projectId: string;
  nombre: string;
  cliente: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
  margen: number | null;
  movimientos: number;
}

// ── Labels y mappings ──────────────────────────────────────────

export const TIPO_MOV_LABELS: Record<TipoMovimiento, string> = {
  ingreso_operativo: 'Ingreso Operativo',
  egreso_operativo:  'Egreso Operativo',
  transferencia:     'Transferencia',
  retiro_fundador:   'Retiro Fundador',
  aporte_capital:    'Aporte de Capital',
  deuda_recibida:    'Deuda Recibida',
  pago_deuda:        'Pago de Deuda',
  impuesto:          'Impuesto',
  ajuste:            'Ajuste',
};

export const NATURALEZA_POR_TIPO: Record<TipoMovimiento, NaturalezaMovimiento> = {
  ingreso_operativo: 'ingreso',
  egreso_operativo:  'egreso',
  transferencia:     'neutro',
  retiro_fundador:   'egreso',
  aporte_capital:    'ingreso',
  deuda_recibida:    'neutro',
  pago_deuda:        'egreso',
  impuesto:          'egreso',
  ajuste:            'neutro',
};

export const MESES_ES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

export const CATS_INGRESO = [
  'Ads Management','Social Media Management','GHL','Marketing','Automatizaciones',
  'Diseño Web','Consultoría','Paquetes Personalizados','Otro',
];

export const CATS_EGRESO = [
  'Ads Paid Media','Producción de Contenido','Fullfillment Trafficker',
  'Fullfillment Edición','Fullfillment Programadores','Fullfillment tecnológico',
  'Software y Suscripciones','Salario','Bienestar Fundador','Infraestructura','Educación','Viáticos','Impuestos','Deudas','Personal','Otro',
];

export const ROLES_EQUIPO = [
  'Trafficker','Programador','Diseñador','Community Manager','Editor',
  'Copywriter','Estratega','Consultor','Coordinador','Otro',
];
