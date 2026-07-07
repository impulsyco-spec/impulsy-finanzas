import { LedgerMovement } from '../types';
import { fechaISO } from './dates';

// ── Reglas Inviolables del Fundador ──────────────────────────────
// Modelo BASE + BONO (decidido con Agustín, 16 jun 2026):
//  • Base garantizada $800k/quincena ($1.6M/mes) — se paga pase lo que pase.
//  • Bono = 30% de la utilidad del mes, solo si la empresa rindió (candados).
//  • La empresa SOLO paga salario; ningún otro retiro. Lo personal va aparte.
export const FOUNDER_RULES = {
  salarioQuincenal: 800_000,   // BASE quincenal garantizada
  bonoPctUtilidad: 0.30,       // 30% de la utilidad mensual como bono
  reservaMeta: 24_000_000,     // Core Capital Target: 2 meses de operación
  inicioRegimen: '2026-07-06', // borrón y cuenta nueva: deuda con la empresa = 0 desde hoy
};

const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const pad = (n: number) => String(n).padStart(2, '0');

// Movimientos que cuentan en la utilidad del mes (P&L): se excluyen ajustes
// de conciliación y aportes de capital (no son desempeño operativo).
const cuentaEnPL = (m: LedgerMovement) =>
  m.tipoMovimiento !== 'ajuste' && m.tipoMovimiento !== 'aporte_capital';

export interface Quincena {
  id: string;        // '2026-06-Q2' — usado como marcador en notas del pago
  inicio: string;
  fin: string;
  fechaPago: string; // día 15 o último día del mes
  label: string;     // '16–30 jun'
}

export function getQuincena(d: Date): Quincena {
  const y = d.getFullYear(), m = d.getMonth();
  const ms = `${y}-${pad(m + 1)}`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  if (d.getDate() <= 15) {
    return { id: `${ms}-Q1`, inicio: `${ms}-01`, fin: `${ms}-15`, fechaPago: `${ms}-15`, label: `1–15 ${MESES_CORTOS[m]}` };
  }
  return { id: `${ms}-Q2`, inicio: `${ms}-16`, fin: `${ms}-${pad(lastDay)}`, fechaPago: `${ms}-${pad(lastDay)}`, label: `16–${lastDay} ${MESES_CORTOS[m]}` };
}

function quincenaSiguiente(q: Quincena): Quincena {
  const next = new Date(q.fin + 'T12:00:00');
  next.setDate(next.getDate() + 1);
  return getQuincena(next);
}

// El salario formal del nuevo régimen lleva marcador en notas; también se
// reconoce el retiro_fundador marcado como sueldo aprobado.
export const esSalarioFundador = (m: LedgerMovement) =>
  m.notas?.startsWith('founder:salario') === true ||
  (m.tipoMovimiento === 'retiro_fundador' && m.tipoRetiro === 'sueldo_aprobado');

// Gasto personal = todo dinero que sale hacia Agustín por fuera del salario,
// sin importar cómo se marque (checkbox, categoría o retiro no-salario).
export const esGastoPersonal = (m: LedgerMovement) =>
  m.naturaleza === 'egreso' &&
  m.estado === 'confirmado' &&
  !esSalarioFundador(m) &&
  (m.personalFlag || m.categoria === 'Personal' || m.tipoMovimiento === 'retiro_fundador');

const sumaEntre = (movs: LedgerMovement[], filtro: (m: LedgerMovement) => boolean, desde: string, hasta: string) =>
  movs.filter(m => filtro(m) && m.fecha >= desde && m.fecha <= hasta).reduce((s, m) => s + m.valor, 0);

const salarioPagadoEn = (movs: LedgerMovement[], q: Quincena) =>
  movs
    .filter(m => m.estado === 'confirmado' && esSalarioFundador(m) &&
      (m.notas === `founder:salario:${q.id}` || (!m.notas?.startsWith('founder:salario') && m.fecha >= q.inicio && m.fecha <= q.fin)))
    .reduce((s, m) => s + m.valor, 0);

export interface FounderStatus {
  activo: boolean;            // ya arrancó el régimen
  quincena: Quincena;         // quincena en curso
  gastoQuincena: number;      // gasto personal confirmado en la quincena en curso
  salarioPagadoQuincena: number;
  deudaArrastrada: number;    // excesos de quincenas cerradas, pendientes de descontar
  disponible: number;         // lo que queda de la quincena (puede ser negativo)
  proximoPago: { fecha: string; monto: number; pagado: boolean };
  racha: number;              // quincenas cerradas consecutivas dentro del presupuesto
  quincenasCerradas: number;
}

// ── Bono mensual: 30% de la utilidad del mes, con candados ────────
export interface BonoMes {
  mes: string;              // '2026-06'
  mesLabel: string;
  ingresos: number;         // ingresos confirmados del mes (P&L)
  egresos: number;          // egresos confirmados del mes (P&L, incluye base ya pagada)
  utilidad: number;         // ingresos − egresos
  califica: boolean;        // candado: utilidad positiva
  bono: number;             // 30% de la utilidad si califica
  pagado: number;           // bono ya pagado este mes
  pendiente: number;        // bono por cobrar
  cierreMes: string;        // último día del mes (cuándo se paga el bono)
}

export function calcBonoMes(movements: LedgerMovement[], hoy: Date = new Date()): BonoMes {
  const y = hoy.getFullYear(), m = hoy.getMonth();
  const ms = `${y}-${pad(m + 1)}`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const conf = movements.filter(mv => mv.estado === 'confirmado' && mv.fecha.startsWith(ms) && cuentaEnPL(mv));
  const ingresos = conf.filter(mv => mv.naturaleza === 'ingreso').reduce((s, mv) => s + mv.valor, 0);
  const egresos  = conf.filter(mv => mv.naturaleza === 'egreso').reduce((s, mv) => s + mv.valor, 0);
  const utilidad = ingresos - egresos;
  const califica = utilidad > 0;
  const bono = califica ? Math.round(utilidad * FOUNDER_RULES.bonoPctUtilidad) : 0;
  const pagado = movements
    .filter(mv => mv.estado === 'confirmado' && mv.notas === `founder:bono:${ms}`)
    .reduce((s, mv) => s + mv.valor, 0);
  return {
    mes: ms, mesLabel: `${MESES_CORTOS[m]} ${y}`,
    ingresos, egresos, utilidad, califica, bono, pagado,
    pendiente: Math.max(0, bono - pagado),
    cierreMes: `${ms}-${pad(lastDay)}`,
  };
}

export function calcFounderStatus(movements: LedgerMovement[], hoy: Date = new Date()): FounderStatus {
  const { salarioQuincenal, inicioRegimen } = FOUNDER_RULES;
  const hoyStr = fechaISO(hoy);
  const actual = getQuincena(hoy);
  const activo = hoyStr >= inicioRegimen;

  // Recorrer quincenas cerradas desde el inicio del régimen acumulando deuda:
  // lo retirado (gasto directo + salario pagado) por encima del derecho quincenal arrastra.
  let deuda = 0;
  let racha = 0;
  let quincenasCerradas = 0;
  let q = getQuincena(new Date(inicioRegimen + 'T12:00:00'));
  while (activo && q.fin < actual.inicio) {
    const retirado = sumaEntre(movements, esGastoPersonal, q.inicio, q.fin) + salarioPagadoEn(movements, q);
    deuda = Math.max(0, deuda + retirado - salarioQuincenal);
    racha = retirado <= salarioQuincenal ? racha + 1 : 0;
    quincenasCerradas++;
    q = quincenaSiguiente(q);
  }

  const enRegimen = activo && actual.fin >= inicioRegimen;
  const desde = enRegimen ? (actual.inicio < inicioRegimen ? inicioRegimen : actual.inicio) : actual.inicio;
  const gastoQuincena = sumaEntre(movements, esGastoPersonal, desde, actual.fin);
  const salarioPagadoQuincena = salarioPagadoEn(movements, actual);
  const disponible = salarioQuincenal - gastoQuincena - salarioPagadoQuincena - deuda;

  // Puedes pagarte en VARIOS pedazos dentro de la quincena, cualquier día.
  // El monto sugerido es lo que te FALTA de tu base (base − ya pagado − gasto − arrastre).
  // "pagado" (completa) solo cuando ya tomaste toda tu base; hasta entonces puedes seguir.
  const montoPago = Math.max(0, salarioQuincenal - gastoQuincena - salarioPagadoQuincena - deuda);
  const pagado = montoPago <= 0;

  // Si el régimen aún no arranca, el primer pago es el de la primera quincena del régimen
  const primeraQ = getQuincena(new Date(inicioRegimen + 'T12:00:00'));
  const fechaPago = activo ? actual.fechaPago : primeraQ.fechaPago;

  return {
    activo,
    quincena: actual,
    gastoQuincena,
    salarioPagadoQuincena,
    deudaArrastrada: deuda,
    disponible,
    proximoPago: { fecha: fechaPago, monto: activo ? montoPago : salarioQuincenal, pagado },
    racha,
    quincenasCerradas,
  };
}
