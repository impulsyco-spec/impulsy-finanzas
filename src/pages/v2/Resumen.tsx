import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { calcKPIs, calcSemaforos, calcRentabilidad, cuentaEnPL } from '../../hooks/useFinancials';
import { hoyISO, fechaISO } from '../../lib/dates';
import { MESES_ES } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v/1_000_000).toFixed(1)+'M' : v >= 1_000 ? '$'+(v/1_000).toFixed(0)+'K' : fmt(v);
const fmtDate = (d: string) => new Date(d+'T12:00:00').toLocaleDateString('es-CO', { day:'2-digit', month:'short' });

const SEM_COLORS: Record<string, string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
const SEM_ICONS:  Record<string, string>  = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };

// ── Barra vertical clásica con hover (Vista Mensual) ─────────────
const BarChart = ({ data, maxVal }: { data: { nombre: string; ing: number; gas: number; active: boolean }[]; maxVal: number }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '160px', padding: '0 0.5rem' }}>
      {data.map(d => (
        <div key={d.nombre} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', position: 'relative' }}
          onMouseEnter={() => d.active && setHovered(d.nombre)} onMouseLeave={() => setHovered(null)}>
          {hovered === d.nombre && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '0.4rem 0.6rem', zIndex: 10, whiteSpace: 'nowrap', fontSize: '0.68rem', marginBottom: '4px', pointerEvents: 'none' }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: '2px' }}>{d.nombre}</div>
              <div style={{ color: '#10b981' }}>↑ {fmt(d.ing)}</div>
              <div style={{ color: '#ef4444' }}>↓ {fmt(d.gas)}</div>
              <div style={{ color: d.ing-d.gas >= 0 ? '#10b981' : '#ef4444', borderTop: '1px solid #333', marginTop: '2px', paddingTop: '2px', fontWeight: 700 }}>= {fmt(d.ing-d.gas)}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '130px', width: '100%', justifyContent: 'center' }}>
            <div style={{ width: '45%', background: '#10b981', height: `${Math.max((d.ing/maxVal)*100, d.ing>0?2:0)}%`, borderRadius: '3px 3px 0 0', opacity: d.active?1:0.35, transition: 'height 0.4s' }} />
            <div style={{ width: '45%', background: '#ef4444', height: `${Math.max((d.gas/maxVal)*100, d.gas>0?2:0)}%`, borderRadius: '3px 3px 0 0', opacity: d.active?0.8:0.25, transition: 'height 0.4s' }} />
          </div>
          <div style={{ fontSize: '0.58rem', color: hovered===d.nombre ? '#fff' : d.active ? '#a0aec0' : '#3f3f46', textAlign: 'center', marginTop: '4px' }}>{d.nombre.slice(0,3)}</div>
        </div>
      ))}
    </div>
  );
};

// ── Barra horizontal con valor visible ───────────────────────────
const HBar = ({ label, value, max, color, pct, sub }: {
  label: string; value: number; max: number; color: string; pct?: number; sub?: string;
}) => (
  <div style={{ marginBottom: '0.7rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', gap: '0.5rem' }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.78rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={label}>{label}</span>
        {sub && <span style={{ fontSize: '0.65rem', color: '#52525b' }}>{sub}</span>}
      </div>
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color, flexShrink: 0 }}>
        {fmtK(value)}{pct !== undefined ? <span style={{ fontSize: '0.65rem', color: '#52525b', marginLeft: '0.3rem' }}>({pct.toFixed(0)}%)</span> : null}
      </span>
    </div>
    <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${max > 0 ? Math.min(100,(value/max)*100) : 0}%`, background: color, borderRadius: '999px', opacity: 0.75, transition: 'width 0.4s' }} />
    </div>
  </div>
);

// ── KPI card con semáforo y target ───────────────────────────────
const KpiCard = ({ label, value, sub, color, target }: {
  label: string; value: string; sub?: string; color: string; target?: string;
}) => (
  <div className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', borderTop: `2px solid ${color}44` }}>
    <span className="stat-label">{label}</span>
    <span className="stat-value" style={{ color, fontSize: '1.25rem', marginTop: '0.25rem' }}>{value}</span>
    {sub    && <span style={{ fontSize: '0.7rem', color: '#52525b', marginTop: '0.2rem' }}>{sub}</span>}
    {target && <span style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.15rem' }}>Meta: {target}</span>}
  </div>
);

type Tab = 'mensual' | 'ejecutivo' | 'analisis';

// ── Helpers ───────────────────────────────────────────────────────
const getMesesEnRango = (start: string, end: string) => {
  const result: { ms: string; label: string }[] = [];
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const ms = `${y}-${String(m).padStart(2,'0')}`;
    result.push({ ms, label: MESES_ES[m-1].slice(0,3) + " '" + String(y).slice(2) });
    m++; if (m > 12) { m = 1; y++; }
  }
  return result;
};

const margenColor = (pct: number) => pct >= 40 ? '#10b981' : pct >= 25 ? '#f59e0b' : '#ef4444';
const teamColor   = (pct: number) => pct <= 30 ? '#10b981' : pct <= 42 ? '#f59e0b' : '#ef4444';
const runwayColor = (m: number)   => m >= 6    ? '#10b981' : m >= 3    ? '#f59e0b' : '#ef4444';

export const Resumen: React.FC = () => {
  const { movements, realAccounts, debts, loading: loadingLedger } = useLedger();
  const { projects, clients, loading: loadingData } = useSupabaseData();
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();

  // ── Tabs & range state ────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('ejecutivo');
  const [analYear, setAnalYear] = useState(currentYear);

  const defaultStart = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 2);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }, []);
  const [metStart, setMetStart] = useState(defaultStart);
  const [metEnd,   setMetEnd]   = useState(hoyISO().slice(0,7));

  // ── Datos base (todos los hooks antes de cualquier return) ────
  const safeMovements = useMemo(() => movements   ?? [], [movements]);
  const safeAccounts  = useMemo(() => realAccounts ?? [], [realAccounts]);
  const safeDebts     = useMemo(() => debts        ?? [], [debts]);

  // Horizonte = mismo número de meses que el período seleccionado (mín 1, máx 12)
  // Así un solo selector controla tanto la vista histórica como los compromisos futuros
  const mesesEnRango = useMemo(() => getMesesEnRango(metStart, metEnd), [metStart, metEnd]);
  const horizonte    = Math.min(Math.max(mesesEnRango.length, 1), 12);

  const kpis = useMemo(() => calcKPIs(safeMovements, safeAccounts, safeDebts, horizonte), [safeMovements, safeAccounts, safeDebts, horizonte]);
  const sems = useMemo(() => calcSemaforos(kpis, safeMovements), [kpis, safeMovements]);

  // ── Vista Mensual ─────────────────────────────────────────────
  const meses = useMemo(() => {
    const saldoInicial = safeAccounts.reduce((s, a) => s + (a.saldoInicial ?? 0), 0);
    let caja = saldoInicial;
    return MESES_ES.map((nombre, idx) => {
      const ms   = `${currentYear}-${String(idx+1).padStart(2,'0')}`;
      const conf = safeMovements.filter(m => m.fecha.startsWith(ms) && m.estado === 'confirmado');
      // P&L: aportes de capital y ajustes no cuentan como ingreso/gasto del negocio
      const pl   = conf.filter(cuentaEnPL);
      const ing  = pl.filter(m => m.naturaleza === 'ingreso').reduce((s,m) => s+m.valor, 0);
      const gas  = pl.filter(m => m.naturaleza === 'egreso').reduce((s,m) => s+m.valor, 0);
      // Caja: aquí sí entra todo el dinero que se movió de verdad
      const cajaIng = conf.filter(m => m.naturaleza === 'ingreso').reduce((s,m) => s+m.valor, 0);
      const cajaGas = conf.filter(m => m.naturaleza === 'egreso').reduce((s,m) => s+m.valor, 0);
      const movs = safeMovements.filter(m => m.fecha.startsWith(ms)).length;
      caja += cajaIng - cajaGas;
      return { nombre, ms, ing, gas, bal: ing-gas, caja, movs, active: ing>0||gas>0 };
    });
  }, [safeMovements, safeAccounts, currentYear]);

  const maxVal    = useMemo(() => Math.max(...meses.map(m => Math.max(m.ing, m.gas)), 1), [meses]);
  const totalIng  = useMemo(() => meses.reduce((s,m) => s+m.ing, 0), [meses]);
  const totalGas  = useMemo(() => meses.reduce((s,m) => s+m.gas, 0), [meses]);
  const totalUtil = totalIng - totalGas;

  const topCats = useMemo(() => {
    const catMap: Record<string,number> = {};
    safeMovements.filter(m => m.naturaleza==='egreso' && m.estado==='confirmado' && m.categoria)
      .forEach(m => { catMap[m.categoria!] = (catMap[m.categoria!]||0) + m.valor; });
    return Object.entries(catMap).sort((a,b) => b[1]-a[1]).slice(0,5);
  }, [safeMovements]);

  const alertasMensual = useMemo(() => {
    const hoy = hoyISO();
    const list: { nivel: 'rojo'|'amarillo'; msg: string }[] = [];
    if (kpis.runway < 1) list.push({ nivel: 'rojo', msg: `Runway crítico: ${kpis.runway.toFixed(1)} meses` });
    const venc = safeMovements.filter(m => m.naturaleza==='ingreso' && m.estado==='esperado' && m.fechaVencimiento && m.fechaVencimiento < hoy);
    if (venc.length) list.push({ nivel: 'rojo', msg: `${venc.length} cobro(s) vencido(s) sin recibir` });
    if (kpis.margenYTD < 0.1 && totalIng > 0) list.push({ nivel: kpis.margenYTD<0?'rojo':'amarillo', msg: `Margen bajo: ${(kpis.margenYTD*100).toFixed(1)}%` });
    if (kpis.runway < 3 && kpis.runway >= 1) list.push({ nivel: 'amarillo', msg: `Runway bajo: ${kpis.runway.toFixed(1)} meses` });
    return list;
  }, [kpis, safeMovements, totalIng]);

  // ── Dashboard Ejecutivo — datos del período ───────────────────

  const periodMovs = useMemo(() =>
    safeMovements.filter(m => {
      const mo = m.fecha.slice(0,7);
      return mo >= metStart && mo <= metEnd && m.estado === 'confirmado' && cuentaEnPL(m);
    }),
    [safeMovements, metStart, metEnd]
  );

  const periodIng  = useMemo(() => periodMovs.filter(m => m.naturaleza==='ingreso').reduce((s,m) => s+m.valor, 0), [periodMovs]);
  const periodEgr  = useMemo(() => periodMovs.filter(m => m.naturaleza==='egreso').reduce((s,m) => s+m.valor, 0), [periodMovs]);
  const periodUtil = periodIng - periodEgr;
  const periodMargenPct = periodIng > 0 ? (periodUtil / periodIng) * 100 : 0;

  const teamCostPeriod = useMemo(() =>
    periodMovs.filter(m => m.naturaleza==='egreso' && m.teamMemberId).reduce((s,m) => s+m.valor, 0),
    [periodMovs]
  );
  const teamCostPct = periodIng > 0 ? (teamCostPeriod / periodIng) * 100 : 0;

  const saldoActual = useMemo(() => {
    const base = safeAccounts.reduce((s,a) => s+(a.saldoInicial??0), 0);
    const ing  = safeMovements.filter(m => m.estado==='confirmado' && m.naturaleza==='ingreso').reduce((s,m) => s+m.valor, 0);
    const egr  = safeMovements.filter(m => m.estado==='confirmado' && m.naturaleza==='egreso').reduce((s,m) => s+m.valor, 0);
    return base + ing - egr;
  }, [safeMovements, safeAccounts]);

  const runway = useMemo(() => {
    // Runway = caja real (cajaTotal) / promedio gasto mensual confirmado (últimos 3 meses)
    // Usa kpis.cajaTotal para consistencia con calcKPIs
    const hoy = new Date();
    const meses3 = Array.from({length:3}, (_,i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth()-1-i, 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    });
    const burn = safeMovements
      .filter(m => m.estado==='confirmado' && m.naturaleza==='egreso' && meses3.some(ms => m.fecha.startsWith(ms)))
      .reduce((s,m) => s+m.valor, 0);
    const avgBurn = burn / 3;
    return avgBurn > 0 ? kpis.cajaTotal / avgBurn : 99;
  }, [safeMovements, kpis.cajaTotal]);

  const mrr = useMemo(() =>
    projects.filter(p => p.isRecurring && p.status==='active').reduce((s,p) => s+p.totalAmount, 0),
    [projects]
  );

  // Barras mensuales en el rango
  const monthlyInRange = useMemo(() =>
    mesesEnRango.map(({ms, label}) => {
      const movs = periodMovs.filter(m => m.fecha.startsWith(ms));
      const ing  = movs.filter(m => m.naturaleza==='ingreso').reduce((s,m) => s+m.valor, 0);
      const gas  = movs.filter(m => m.naturaleza==='egreso').reduce((s,m) => s+m.valor, 0);
      const margen = ing > 0 ? ((ing-gas)/ing)*100 : null;
      return { ms, label, ing, gas, bal: ing-gas, margen, active: ing>0||gas>0 };
    }),
    [mesesEnRango, periodMovs]
  );
  const maxMonthly = useMemo(() => Math.max(1, ...monthlyInRange.map(m => Math.max(m.ing, m.gas))), [monthlyInRange]);

  // Rentabilidad por proyecto en el período
  const projRentPeriod = useMemo(() =>
    calcRentabilidad(periodMovs, projects, clients)
      .filter(r => r.ingresos > 0)
      .sort((a,b) => (b.margen??0)-(a.margen??0)),
    [periodMovs, projects, clients]
  );

  // Gastos por categoría en período
  const catEgrPeriod = useMemo(() => {
    const map: Record<string,number> = {};
    periodMovs.filter(m => m.naturaleza==='egreso' && m.categoria).forEach(m => { map[m.categoria!] = (map[m.categoria!]||0)+m.valor; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [periodMovs]);

  // Ingresos por categoría en período
  const catIngPeriod = useMemo(() => {
    const map: Record<string,number> = {};
    periodMovs.filter(m => m.naturaleza==='ingreso' && m.categoria).forEach(m => { map[m.categoria!] = (map[m.categoria!]||0)+m.valor; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [periodMovs]);

  // Cobros esperados próximos 30 días
  const upcomingCobros = useMemo(() => {
    const hoy   = hoyISO();
    const futuro = new Date(); futuro.setDate(futuro.getDate()+30);
    const futStr = fechaISO(futuro);
    return safeMovements
      .filter(m => m.naturaleza==='ingreso' && m.estado==='esperado' && m.fecha >= hoy && m.fecha <= futStr)
      .sort((a,b) => a.fecha.localeCompare(b.fecha));
  }, [safeMovements]);

  // Análisis por año (pestaña Categorías)
  const availableYears = useMemo(() => {
    const yrs = new Set<number>([currentYear]);
    safeMovements.forEach(m => yrs.add(Number(m.fecha.slice(0,4))));
    return [...yrs].sort((a,b) => b-a);
  }, [safeMovements, currentYear]);

  const analMovs = useMemo(() =>
    safeMovements.filter(m => m.fecha.startsWith(String(analYear)) && m.estado==='confirmado' && cuentaEnPL(m)),
    [safeMovements, analYear]
  );

  const analIng = useMemo(() => analMovs.filter(m => m.naturaleza==='ingreso').reduce((s,m) => s+m.valor, 0), [analMovs]);
  const analEgr = useMemo(() => analMovs.filter(m => m.naturaleza==='egreso').reduce((s,m) => s+m.valor, 0), [analMovs]);

  const catIngAnual = useMemo(() => {
    const map: Record<string,number> = {};
    analMovs.filter(m => m.naturaleza==='ingreso' && m.categoria).forEach(m => { map[m.categoria!]=(map[m.categoria!]||0)+m.valor; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [analMovs]);

  const catEgrAnual = useMemo(() => {
    const map: Record<string,number> = {};
    analMovs.filter(m => m.naturaleza==='egreso' && m.categoria).forEach(m => { map[m.categoria!]=(map[m.categoria!]||0)+m.valor; });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [analMovs]);

  const margenMeses = useMemo(() =>
    MESES_ES.map((nombre, idx) => {
      const ms   = `${analYear}-${String(idx+1).padStart(2,'0')}`;
      const movs = analMovs.filter(m => m.fecha.startsWith(ms));
      const ing  = movs.filter(m => m.naturaleza==='ingreso').reduce((s,m) => s+m.valor, 0);
      const gas  = movs.filter(m => m.naturaleza==='egreso').reduce((s,m) => s+m.valor, 0);
      const margen = ing > 0 ? ((ing-gas)/ing)*100 : null;
      return { nombre: nombre.slice(0,3), ms, ing, gas, margen, active: ing>0||gas>0 };
    }),
    [analMovs, analYear]
  );

  // ─────────────────────────────────────────────────────────────
  const loading = loadingLedger || loadingData;
  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Calculando...</div>;

  // Helpers UI
  const setPreset = (months: number) => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth()-(months-1), 1);
    setMetEnd(`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}`);
    setMetStart(`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`);
  };

  const sel: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'inherit', colorScheme: 'dark' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Panel Financiero</h1>
          <p style={{ color: '#52525b', marginTop: '0.2rem', fontSize: '0.85rem' }}>
            Impulsy · {fmtK(mrr)} MRR · Saldo {fmtK(saldoActual)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem' }}>
          <div><div style={{ color: '#52525b', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Ingresos {currentYear}</div><div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.1rem' }}>{fmtK(totalIng)}</div></div>
          <div><div style={{ color: '#52525b', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Gastos {currentYear}</div><div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.1rem' }}>{fmtK(totalGas)}</div></div>
          <div><div style={{ color: '#52525b', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Utilidad {currentYear}</div><div style={{ color: totalUtil>=0?'#10b981':'#ef4444', fontWeight: 800, fontSize: '1.1rem' }}>{fmtK(totalUtil)}</div></div>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.375rem', background: '#111', padding: '0.25rem', borderRadius: '10px', width: 'fit-content' }}>
        {([
          { id: 'ejecutivo', label: '⚡ Dashboard Ejecutivo' },
          { id: 'mensual',   label: '📅 Vista Mensual' },
          { id: 'analisis',  label: '📊 Análisis por Categoría' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab===t.id?'#fff':'transparent', color: tab===t.id?'#000':'#71717a', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: DASHBOARD EJECUTIVO                              */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'ejecutivo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Control de período — único selector que controla historial Y compromisos futuros */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '0.75rem 1rem' }}>
            <div style={{ display: 'flex', gap: '0.375rem' }}>
              {[
                { label: '1 mes',  months: 1 },
                { label: '3 meses', months: 3 },
                { label: '6 meses', months: 6 },
                { label: '1 año',  months: 12 },
              ].map(p => {
                const isActive = mesesEnRango.length === p.months;
                return (
                  <button key={p.label} onClick={() => setPreset(p.months)}
                    style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: isActive ? '#fff' : 'transparent', color: isActive ? '#000' : '#71717a', transition: 'all 0.15s' }}>
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div style={{ width: '1px', height: '24px', background: '#2a2a2a', margin: '0 0.25rem' }} />
            <span style={{ fontSize: '0.72rem', color: '#52525b', fontWeight: 600 }}>Personalizado:</span>
            <input type="month" style={{ ...sel, fontSize: '0.78rem' }} value={metStart} onChange={e => setMetStart(e.target.value)} />
            <span style={{ color: '#3f3f46' }}>→</span>
            <input type="month" style={{ ...sel, fontSize: '0.78rem' }} value={metEnd}   onChange={e => setMetEnd(e.target.value)} />
            <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', fontWeight: 700 }}>
                {mesesEnRango.length} {mesesEnRango.length===1?'mes':'meses'} · {periodMovs.length} movimientos
              </div>
              <div style={{ fontSize: '0.65rem', color: '#3f3f46' }}>
                Compromisos calculados a {horizonte} {horizonte===1?'mes':'meses'} vista
              </div>
            </div>
          </div>

          {/* KPIs con semáforo */}
          <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.875rem' }}>
            <KpiCard
              label="Margen operativo"
              value={periodIng > 0 ? periodMargenPct.toFixed(1)+'%' : '—'}
              sub={periodIng > 0 ? (periodMargenPct>=40?'✓ En meta':'↓ Bajo meta') : 'Sin ingresos'}
              color={periodIng > 0 ? margenColor(periodMargenPct) : '#52525b'}
              target="40%"
            />
            <KpiCard
              label="Costo equipo / ingreso"
              value={periodIng > 0 ? teamCostPct.toFixed(1)+'%' : '—'}
              sub={periodIng > 0 ? (teamCostPct<=30?'✓ Bajo límite':'⚠ Sobre límite') : '—'}
              color={periodIng > 0 ? teamColor(teamCostPct) : '#52525b'}
              target="≤ 30%"
            />
            <KpiCard
              label="Saldo en cuentas"
              value={fmtK(saldoActual)}
              sub="Todas las cuentas reales"
              color={saldoActual >= 0 ? '#06b6d4' : '#ef4444'}
            />
            <KpiCard
              label="MRR (recurrente)"
              value={fmtK(mrr)}
              sub={`${projects.filter(p=>p.isRecurring&&p.status==='active').length} proyectos activos`}
              color="#a855f7"
            />
            <KpiCard
              label="Runway"
              value={runway >= 99 ? '∞' : runway.toFixed(1)+' m'}
              sub={runway>=6?'Sólido':runway>=3?'Vigilar':'¡Alerta!'}
              color={runwayColor(Math.min(runway,99))}
              target="≥ 6 meses"
            />
          </div>

          {/* Barras mensuales en el rango */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                Ingresos vs Gastos — {mesesEnRango[0]?.label} → {mesesEnRango[mesesEnRango.length-1]?.label}
              </h3>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: '#71717a' }}>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#10b981', borderRadius: '2px', marginRight: '4px' }}/>Ingresos</span>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#ef4444', borderRadius: '2px', marginRight: '4px', opacity: 0.8 }}/>Gastos</span>
                <span><span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#f59e0b', borderRadius: '2px', marginRight: '4px' }}/>Margen %</span>
              </div>
            </div>
            {monthlyInRange.length === 0 ? (
              <div style={{ color: '#52525b', textAlign: 'center', padding: '2rem' }}>Sin datos en el período seleccionado.</div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '180px' }}>
                {monthlyInRange.map(d => {
                  const hI = d.ing > 0 ? Math.max(6, (d.ing/maxMonthly)*130) : 0;
                  const hG = d.gas > 0 ? Math.max(6, (d.gas/maxMonthly)*130) : 0;
                  const mc = d.margen !== null ? margenColor(d.margen) : '#3f3f46';
                  return (
                    <div key={d.ms} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px', justifyContent: 'flex-end' }}>
                      {d.active && d.margen !== null && (
                        <span style={{ fontSize: '0.52rem', color: mc, fontWeight: 700 }}>{d.margen.toFixed(0)}%</span>
                      )}
                      {d.active && (
                        <span style={{ fontSize: '0.5rem', color: d.bal>=0?'#10b981':'#ef4444' }}>
                          {d.bal>=0?'+':''}{fmtK(d.bal)}
                        </span>
                      )}
                      <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
                        <div style={{ width: '44%', height: `${hI}px`, background: '#10b981', borderRadius: '2px 2px 0 0', opacity: d.active?0.9:0.15, transition: 'height 0.4s' }}/>
                        <div style={{ width: '44%', height: `${hG}px`, background: '#ef4444', borderRadius: '2px 2px 0 0', opacity: d.active?0.8:0.15, transition: 'height 0.4s' }}/>
                      </div>
                      <span style={{ fontSize: '0.54rem', color: d.active?'#71717a':'#3f3f46', marginTop: '3px', textAlign: 'center' }}>{d.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Línea de meta 40% */}
            <div style={{ marginTop: '0.75rem', fontSize: '0.68rem', color: '#52525b', display: 'flex', gap: '1rem' }}>
              <span style={{ color: '#10b981' }}>■ ≥40% — En meta</span>
              <span style={{ color: '#f59e0b' }}>■ 25–39% — Bajo</span>
              <span style={{ color: '#ef4444' }}>■ &lt;25% — Crítico</span>
            </div>
          </div>

          {/* Fila: Proyectos más rentables + Breakdown gastos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

            {/* Rentabilidad por proyecto */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>
                🏆 Proyectos más rentables en el período
              </h3>
              {projRentPeriod.length === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                  Sin movimientos vinculados a proyectos en este período.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {projRentPeriod.slice(0,6).map((r, i) => {
                    const mg = (r.margen??0)*100;
                    const mc = margenColor(mg);
                    const medals = ['🥇','🥈','🥉'];
                    return (
                      <div key={r.projectId}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                            <span style={{ fontSize: '0.82rem' }}>{medals[i] || `#${i+1}`}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
                              <div style={{ fontSize: '0.65rem', color: '#52525b' }}>{r.cliente}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: mc }}>{mg.toFixed(0)}%</div>
                            <div style={{ fontSize: '0.65rem', color: '#52525b' }}>{fmtK(r.ingresos)}</div>
                          </div>
                        </div>
                        <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100,Math.max(0,mg))}%`, background: mc, borderRadius: '999px', opacity: 0.75 }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Breakdown de gastos */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>
                ↓ ¿Dónde va el dinero? — Gastos por categoría
              </h3>
              {catEgrPeriod.length === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                  Sin gastos categorizados en este período.
                </div>
              ) : (
                <>
                  {catEgrPeriod.map(([cat, val]) => (
                    <HBar key={cat} label={cat} value={val}
                      max={catEgrPeriod[0]?.[1]||1} color="#ef4444"
                      pct={periodEgr > 0 ? (val/periodEgr)*100 : 0} />
                  ))}
                  {periodEgr > catEgrPeriod.reduce((s,[,v]) => s+v, 0) && (
                    <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: '0.4rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.72rem', color: '#52525b' }}>Sin categoría</span>
                      <span style={{ fontSize: '0.72rem', color: '#52525b', fontWeight: 700 }}>
                        {fmtK(periodEgr - catEgrPeriod.reduce((s,[,v]) => s+v, 0))}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Fila: Ingresos por servicio + Cobros próximos */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

            {/* Ingresos por categoría/servicio */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#10b981', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>
                ↑ Ingresos por tipo de servicio
              </h3>
              {catIngPeriod.length === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                  Sin ingresos categorizados en este período.
                </div>
              ) : (
                catIngPeriod.map(([cat, val]) => (
                  <HBar key={cat} label={cat} value={val}
                    max={catIngPeriod[0]?.[1]||1} color="#10b981"
                    pct={periodIng > 0 ? (val/periodIng)*100 : 0} />
                ))
              )}
            </div>

            {/* Cobros esperados próximos 30 días */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>
                ⏳ Cobros esperados — próximos 30 días
              </h3>
              {upcomingCobros.length === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>
                  Sin cobros programados en los próximos 30 días.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', paddingBottom: '0.25rem', borderBottom: '1px solid #1a1a1a' }}>
                    <span style={{ fontSize: '0.65rem', color: '#52525b', fontWeight: 700, textTransform: 'uppercase' }}>Total esperado</span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#f59e0b' }}>
                      {fmtK(upcomingCobros.reduce((s,m) => s+m.valor, 0))}
                    </span>
                  </div>
                  {upcomingCobros.slice(0,8).map(m => {
                    const proj = projects.find(p => p.id === m.projectId);
                    const daysLeft = Math.ceil((new Date(m.fecha+'T12:00:00').getTime() - Date.now()) / 86_400_000);
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#0a0a0a', borderRadius: '6px' }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.78rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {proj?.name || m.descripcion}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#52525b' }}>
                            {fmtDate(m.fecha)} · {daysLeft === 0 ? 'Hoy' : `en ${daysLeft}d`}
                          </div>
                        </div>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b', flexShrink: 0, marginLeft: '0.5rem' }}>
                          {fmtK(m.valor)}
                        </span>
                      </div>
                    );
                  })}
                  {upcomingCobros.length > 8 && (
                    <div style={{ fontSize: '0.72rem', color: '#52525b', textAlign: 'center' }}>+{upcomingCobros.length-8} más</div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: VISTA MENSUAL                                    */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'mensual' && (
        <>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Ingresos vs Gastos {currentYear}</h3>
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: '#71717a' }}>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', marginRight: '4px' }}/>Ingresos</span>
                <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', marginRight: '4px', opacity: 0.8 }}/>Gastos</span>
              </div>
            </div>
            <BarChart data={meses} maxVal={maxVal} />
          </div>

          <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.5rem', alignItems: 'start' }}>
            <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.625rem' }}>
              {meses.map(m => (
                <div key={m.ms} onClick={() => m.active && navigate(`/finanzas?tab=movimientos&mes=${m.ms}`)} className="card"
                  style={{ padding: '0.875rem 1rem', cursor: m.active?'pointer':'default', opacity: m.active?1:0.35, minHeight: 'auto', borderTop: m.active?`2px solid ${m.bal>=0?'#10b98155':'#ef444433'}`:'2px solid #111' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px', color: m.active?'#fff':'#3f3f46', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{m.nombre}</div>
                  <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>{m.ing>0?fmtK(m.ing):'—'}</div>
                  <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>{m.gas>0?fmtK(m.gas):'—'}</div>
                  <div style={{ fontSize: '0.75rem', color: m.bal>=0?'#a0aec0':'#ef4444', fontWeight: 700, marginTop: '0.25rem' }}>{fmt(m.bal)}</div>
                  {m.active && <div style={{ fontSize: '0.62rem', color: '#3f3f46', marginTop: '0.4rem' }}>{m.movs} movs →</div>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {alertasMensual.length > 0 && (
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem' }}>⚠️ Alertas</h4>
                  {alertasMensual.map((a, i) => (
                    <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <span>{a.nivel==='rojo'?'🔴':'🟡'}</span>
                      <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>{a.msg}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="card" style={{ padding: '1rem' }}>
                <h4 style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem' }}>Estado financiero</h4>
                {sems.map(s => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid #111' }}>
                    <span style={{ fontSize: '0.78rem', color: '#71717a' }}>{s.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: SEM_COLORS[s.estado] }}>{s.valor}</span>
                      <span style={{ fontSize: '0.7rem' }}>{SEM_ICONS[s.estado]}</span>
                    </div>
                  </div>
                ))}
              </div>
              {topCats.length > 0 && (
                <div className="card" style={{ padding: '1rem' }}>
                  <h4 style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem' }}>Top gastos {currentYear}</h4>
                  {topCats.map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: '0.625rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{cat}</span>
                        <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>{fmtK(val)}</span>
                      </div>
                      <div style={{ height: '3px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(val/(topCats[0]?.[1]||1))*100}%`, background: '#ef444466', borderRadius: '999px' }}/>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════ */}
      {/* TAB: ANÁLISIS POR CATEGORÍA                          */}
      {/* ══════════════════════════════════════════════════════ */}
      {tab === 'analisis' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Selector de año */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 700 }}>Año:</span>
            <select value={analYear} onChange={e => setAnalYear(Number(e.target.value))}
              style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.4rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'inherit' }}>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* KPIs del año */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
            {[
              { label: `Ingresos ${analYear}`,  value: fmtK(analIng),          color: '#10b981' },
              { label: `Gastos ${analYear}`,    value: fmtK(analEgr),          color: '#ef4444' },
              { label: `Utilidad ${analYear}`,  value: fmtK(analIng-analEgr),  color: analIng-analEgr>=0?'#10b981':'#ef4444' },
              { label: `Margen ${analYear}`,    value: analIng>0?((analIng-analEgr)/analIng*100).toFixed(1)+'%':'—',
                color: analIng>0?margenColor((analIng-analEgr)/analIng*100):'#52525b' },
            ].map(s => (
              <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Margen % por mes */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>
              Margen % por mes — {analYear} <span style={{ fontSize: '0.72rem', color: '#52525b', fontWeight: 400 }}>(meta: 40%)</span>
            </h3>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '140px' }}>
              {margenMeses.map(d => {
                const val = d.margen;
                const h = val !== null ? Math.max(4, Math.min(100, Math.abs(val)) / 100 * 100) : 0;
                const color = val===null?'#3f3f46':margenColor(val);
                return (
                  <div key={d.nombre} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                    {d.active && val !== null && (
                      <span style={{ fontSize: '0.54rem', color, fontWeight: 700 }}>{val.toFixed(0)}%</span>
                    )}
                    <div style={{ width: '100%', height: d.active&&h>0?`${h}px`:'3px', background: color, borderRadius: '3px 3px 0 0', opacity: d.active?1:0.15, transition: 'height 0.4s', minHeight: '3px' }}/>
                    <span style={{ fontSize: '0.56rem', color: d.active?'#a0aec0':'#3f3f46', marginTop: '3px' }}>{d.nombre}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.68rem' }}>
              {[{c:'#10b981',l:'≥ 40% — En meta'},{c:'#f59e0b',l:'25–39% — Bajo'},{c:'#ef4444',l:'< 25% — Crítico'}].map(x=>(
                <span key={x.l} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#52525b' }}>
                  <span style={{ width:'8px',height:'8px',background:x.c,borderRadius:'2px',display:'inline-block' }}/>
                  {x.l}
                </span>
              ))}
            </div>
          </div>

          {/* Categorías */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#10b981', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>↑ Ingresos por Servicio</h3>
              {catIngAnual.length === 0
                ? <div style={{ color:'#52525b', fontSize:'0.8rem', textAlign:'center', padding:'1rem' }}>Sin ingresos categorizados en {analYear}</div>
                : catIngAnual.map(([cat,val]) => (
                    <HBar key={cat} label={cat} value={val} max={catIngAnual[0]?.[1]||1} color="#10b981"
                      pct={analIng>0?(val/analIng)*100:0} />
                  ))
              }
            </div>
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>↓ Gastos por Categoría</h3>
              {catEgrAnual.length === 0
                ? <div style={{ color:'#52525b', fontSize:'0.8rem', textAlign:'center', padding:'1rem' }}>Sin gastos categorizados en {analYear}</div>
                : catEgrAnual.map(([cat,val]) => (
                    <HBar key={cat} label={cat} value={val} max={catEgrAnual[0]?.[1]||1} color="#ef4444"
                      pct={analEgr>0?(val/analEgr)*100:0} />
                  ))
              }
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
