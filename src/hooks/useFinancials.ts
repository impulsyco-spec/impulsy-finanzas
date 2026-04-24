import { LedgerMovement, RealAccount, Debt, FinancialKPIs, Semaforo, ProjectRentabilidad, Project, Client } from '../types';

const today = () => new Date().toISOString().split('T')[0];
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const yearEnd   = () => `${new Date().getFullYear()}-12-31`;
const monthStart = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-01`;
};

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';

function avgMonthlyExpenses(confirmed: LedgerMovement[]): number {
  const byMonth: Record<string, number> = {};
  confirmed
    .filter(m => m.naturaleza === 'egreso')
    .forEach(m => {
      const key = m.fecha.slice(0, 7);
      byMonth[key] = (byMonth[key] || 0) + m.valor;
    });
  const vals = Object.values(byMonth).filter(v => v > 0);
  return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 1;
}

export function calcKPIs(
  movements: LedgerMovement[],
  realAccounts: RealAccount[],
  debts: Debt[]
): FinancialKPIs {
  const confirmed = movements.filter(m => m.estado === 'confirmado');
  const pending   = movements.filter(m => m.estado === 'esperado' || m.estado === 'facturado');

  const saldoInicial   = realAccounts.reduce((s, a) => s + a.saldoInicial, 0);
  const ingresosReales = confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const egresosReales  = confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  const cajaTotal      = saldoInicial + ingresosReales - egresosReales;

  const cajaComprometida = pending.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  const cajaLibre        = cajaTotal - cajaComprometida;
  const porCobrar        = pending.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const totalDeudas      = debts.filter(d => d.activa).reduce((s, d) => s + d.saldoActual, 0);

  const ytd = confirmed.filter(m => m.fecha >= yearStart() && m.fecha <= yearEnd());
  const ingresosYTD = ytd.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const gastosYTD   = ytd.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  const utilidadYTD = ingresosYTD - gastosYTD;
  const margenYTD   = ingresosYTD > 0 ? utilidadYTD / ingresosYTD : 0;

  const retirosFounderMes = confirmed
    .filter(m => m.tipoMovimiento === 'retiro_fundador' && m.fecha >= monthStart())
    .reduce((s, m) => s + m.valor, 0);

  const avgGasto = avgMonthlyExpenses(confirmed);
  const runway   = avgGasto > 0 ? cajaLibre / avgGasto : 99;

  return {
    cajaTotal, cajaComprometida, cajaLibre,
    porCobrar, porPagar: cajaComprometida, totalDeudas,
    ingresosYTD, gastosYTD, utilidadYTD, margenYTD,
    retirosFounderMes, runway,
  };
}

export function calcSemaforos(
  kpis: FinancialKPIs,
  movements: LedgerMovement[]
): Semaforo[] {
  const hoy = today();

  const cobrarVencido = movements
    .filter(m =>
      m.naturaleza === 'ingreso' &&
      (m.estado === 'esperado' || m.estado === 'facturado') &&
      m.fechaVencimiento && m.fechaVencimiento < hoy
    )
    .reduce((s, m) => s + m.valor, 0);

  const pctCobrarVencido = kpis.porCobrar > 0 ? cobrarVencido / kpis.porCobrar : 0;
  const pctDeuda = kpis.ingresosYTD > 0 ? kpis.totalDeudas / kpis.ingresosYTD : 0;

  return [
    {
      id: 'liquidez',
      label: 'Liquidez',
      valor: fmt(kpis.cajaLibre),
      desc: `${kpis.runway.toFixed(1)} meses runway`,
      estado: kpis.runway >= 3 ? 'verde' : kpis.runway >= 1 ? 'amarillo' : 'rojo',
      detalle: 'Caja libre vs. gasto mensual promedio',
    },
    {
      id: 'cobranza',
      label: 'Cobranza',
      valor: fmt(kpis.porCobrar),
      desc: cobrarVencido > 0 ? `${fmt(cobrarVencido)} vencidos` : 'Al día',
      estado: pctCobrarVencido > 0.3 ? 'rojo' : pctCobrarVencido > 0 ? 'amarillo' : 'verde',
      detalle: 'Facturas por cobrar pendientes',
    },
    {
      id: 'margen',
      label: 'Margen',
      valor: fmt(kpis.utilidadYTD),
      desc: fmtPct(kpis.margenYTD),
      estado: kpis.margenYTD >= 0.3 ? 'verde' : kpis.margenYTD >= 0.1 ? 'amarillo' : 'rojo',
      detalle: 'Utilidad / Ingresos YTD',
    },
    {
      id: 'caja',
      label: 'Caja Operativa',
      valor: fmt(kpis.cajaTotal),
      desc: kpis.cajaLibre >= 0 ? 'Positiva' : 'Negativa',
      estado: kpis.cajaLibre > 0 ? 'verde' : 'rojo',
      detalle: 'Caja total menos compromisos pendientes',
    },
    {
      id: 'deuda',
      label: 'Deuda',
      valor: fmt(kpis.totalDeudas),
      desc: fmtPct(pctDeuda) + ' de ingresos',
      estado: pctDeuda < 0.1 ? 'verde' : pctDeuda < 0.3 ? 'amarillo' : 'rojo',
      detalle: 'Obligaciones vs. ingresos anuales',
    },
    {
      id: 'higiene',
      label: 'Higiene Fundador',
      valor: fmt(kpis.retirosFounderMes),
      desc: 'Retiros este mes',
      estado: kpis.retirosFounderMes === 0 ? 'verde' : kpis.retirosFounderMes < kpis.ingresosYTD * 0.05 ? 'amarillo' : 'rojo',
      detalle: 'Retiros del fundador en el mes actual',
    },
  ];
}

export function calcRentabilidad(
  movements: LedgerMovement[],
  projects: Project[],
  clients: Client[]
): ProjectRentabilidad[] {
  const map: Record<string, ProjectRentabilidad> = {};

  movements
    .filter(m => m.estado === 'confirmado' && m.projectId)
    .forEach(m => {
      const pid = m.projectId!;
      if (!map[pid]) {
        const proj   = projects.find(p => p.id === pid);
        const client = proj ? clients.find(c => c.id === proj.clientId) : null;
        map[pid] = {
          projectId: pid,
          nombre: proj?.name || 'Desconocido',
          cliente: client?.name || '—',
          ingresos: 0, gastos: 0, utilidad: 0, margen: null, movimientos: 0,
        };
      }
      if (m.naturaleza === 'ingreso') map[pid].ingresos += m.valor;
      if (m.naturaleza === 'egreso')  map[pid].gastos  += m.valor;
      map[pid].movimientos++;
    });

  return Object.values(map)
    .map(p => ({
      ...p,
      utilidad: p.ingresos - p.gastos,
      margen: p.ingresos > 0 ? (p.ingresos - p.gastos) / p.ingresos : null,
    }))
    .sort((a, b) => b.ingresos - a.ingresos);
}
