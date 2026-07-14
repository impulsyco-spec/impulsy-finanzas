// ── Motor de bola de nieve (avalancha) con presupuesto fijo ──────────────
// Fuente ÚNICA de verdad: la usan el engine (para escribir los movimientos
// proyectados) y la pantalla de Deudas (para mostrar el plan). Given un
// presupuesto mensual fijo, reparte cada mes: mínimos a todas + el excedente
// a la de mayor interés; cuando una muere, su cuota rueda a la siguiente.

export interface DeudaSim {
  id: string;
  acreedor: string;
  saldoActual: number;
  tasaMensual?: number;   // % mensual (ej. 2.13)
  cuotaMinima: number;    // mínimo del banco
  fechaProximoPago?: string; // 'YYYY-MM-DD'
}

export interface MovProyectado {
  deudaId: string;
  acreedor: string;
  fecha: string;   // 'YYYY-MM-DD'
  valor: number;
}

export interface PlanSnowball {
  movimientos: MovProyectado[];
  meses: number;                 // meses hasta quedar libre
  libreLabel: string;            // 'abr 2027'
  interesTotal: number;          // interés que se pagaría en el camino
  orden: { id: string; acreedor: string; fecha: string; label: string }[]; // orden de muerte
  targetId?: string;             // deuda que recibe el excedente ahora
}

const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number) => String(n).padStart(2, '0');
const label = (fecha: string) => {
  const d = new Date(fecha + 'T12:00:00');
  return `${MESES_ES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
};

export function simularSnowball(deudas: DeudaSim[], presupuestoMes: number, hoy: Date = new Date()): PlanSnowball {
  const activos = deudas.filter(d => d.saldoActual > 1 && d.fechaProximoPago && d.cuotaMinima > 0);
  const vacío: PlanSnowball = { movimientos: [], meses: 0, libreLabel: '', interesTotal: 0, orden: [], targetId: undefined };
  if (activos.length === 0 || presupuestoMes <= 0) return vacío;

  // Mayor interés primero; empate → saldo menor (para cerrar deudas antes)
  const prio = (a: { tasa: number; saldo: number }, b: { tasa: number; saldo: number }) =>
    (b.tasa - a.tasa) || (a.saldo - b.saldo);

  // Cada deuda lleva su propio "próximo pago" (avanza mes a mes por su cuenta).
  const ds = activos.map(d => {
    const nd = new Date(d.fechaProximoPago! + 'T12:00:00');
    return {
      id: d.id, acreedor: d.acreedor, saldo: d.saldoActual, tasa: (d.tasaMensual ?? 2) / 100,
      min: d.cuotaMinima, nextY: nd.getFullYear(), nextM: nd.getMonth(), dia: nd.getDate(),
    };
  });
  const ym = (d: { nextY: number; nextM: number }) => d.nextY * 12 + d.nextM;

  const targetId = ds.slice().sort(prio)[0]?.id;
  const movimientos: MovProyectado[] = [];
  let interesTotal = 0;

  // Simulación por MES CALENDARIO: cada mes tiene el presupuesto completo, y todos
  // los pagos de ese mes caen en ese mes → nunca se desborda ni se acumula en otro.
  const startAbs = Math.min(...ds.map(ym));
  let mes = 0;
  while (ds.some(d => d.saldo > 1) && mes < 240) {
    const cmAbs = startAbs + mes;
    const cmY = Math.floor(cmAbs / 12), cmM = cmAbs % 12;

    // 1) interés del mes en todas las deudas vivas
    ds.forEach(d => { if (d.saldo > 0) { const it = d.saldo * d.tasa; interesTotal += it; d.saldo += it; } });

    // 2) deudas que VENCEN este mes calendario
    const dueList = ds.filter(d => d.saldo > 1 && ym(d) <= cmAbs);
    const dueSet = new Set(dueList.map(d => d.id));

    // 3) reparte: mínimos a las que vencen + excedente al objetivo (si vence este mes)
    let budget = presupuestoMes;
    const pagos: Record<string, number> = {};
    for (const d of [...dueList].sort(prio)) {
      const pay = Math.min(d.min, d.saldo, Math.max(0, budget));
      if (pay > 0) { pagos[d.id] = (pagos[d.id] || 0) + pay; d.saldo -= pay; budget -= pay; }
    }
    let guard = 0;
    while (budget > 1 && guard++ < 40) {
      const alive = ds.filter(d => d.saldo > 1).sort(prio);
      if (alive.length === 0) break;
      const t = alive[0];
      if (!dueSet.has(t.id)) break; // el objetivo aún no vence → no se gasta (se paga cuando venza)
      const extra = Math.min(budget, t.saldo);
      pagos[t.id] = (pagos[t.id] || 0) + extra; t.saldo -= extra; budget -= extra;
    }

    // 4) escribe el pago de cada deuda vencida y avanza su próximo pago un mes
    const last = new Date(cmY, cmM + 1, 0).getDate();
    for (const d of dueList) {
      if (pagos[d.id] > 0) {
        const fecha = `${cmY}-${pad(cmM + 1)}-${pad(Math.min(d.dia, last))}`;
        movimientos.push({ deudaId: d.id, acreedor: d.acreedor, fecha, valor: Math.round(pagos[d.id]) });
      }
      d.nextM += 1; if (d.nextM > 11) { d.nextM = 0; d.nextY += 1; }
    }
    mes++;
  }

  // Orden de muerte = último pago de cada deuda
  const ultimoPorDeuda: Record<string, MovProyectado> = {};
  movimientos.forEach(m => {
    if (!ultimoPorDeuda[m.deudaId] || m.fecha > ultimoPorDeuda[m.deudaId].fecha) ultimoPorDeuda[m.deudaId] = m;
  });
  const orden = Object.values(ultimoPorDeuda)
    .map(m => ({ id: m.deudaId, acreedor: m.acreedor, fecha: m.fecha, label: label(m.fecha) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const ultimaFecha = movimientos.reduce((mx, m) => (m.fecha > mx ? m.fecha : mx), '0000-00-00');
  const fl = ultimaFecha !== '0000-00-00' ? new Date(ultimaFecha + 'T12:00:00') : hoy;
  const meses = Math.max(1, (fl.getFullYear() - hoy.getFullYear()) * 12 + (fl.getMonth() - hoy.getMonth()) + 1);

  return { movimientos, meses, libreLabel: label(ultimaFecha), interesTotal, orden, targetId };
}
