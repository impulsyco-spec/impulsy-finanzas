import React, { useState, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useRecurring } from '../../hooks/useRecurring';
import { useTeam } from '../../hooks/useTeam';
import { calcKPIs, calcSemaforos, cuentaEnPL } from '../../hooks/useFinancials';
import { hoyISO, fechaISO } from '../../lib/dates';
import { AddLedgerModal } from '../../components/AddLedgerModal';
import { FounderPanel } from '../../components/FounderPanel';
import { MESES_ES } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'K';
  return fmt(v);
};
const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

const SEM_COLOR: Record<string, string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
const SEM_ICON:  Record<string, string> = { verde: '🟢',      amarillo: '🟡',      rojo: '🔴' };

const PERIODOS = [
  { label: '15 días', days: 15,  meses: 1,  diasExactos: 15  },
  { label: '1 mes',   days: 30,  meses: 1,  diasExactos: undefined },
  { label: '3 meses', days: 90,  meses: 3,  diasExactos: undefined },
  { label: '6 meses', days: 180, meses: 6,  diasExactos: undefined },
  { label: '12 meses',days: 365, meses: 12, diasExactos: undefined },
] as const;

// ── Mini bar chart con tooltips ──────────────────────────────
const MiniBar = ({ data }: { data: { label: string; ing: number; gas: number }[] }) => {
  const max = Math.max(...data.flatMap(d => [d.ing, d.gas]), 1);
  const [hov, setHov] = React.useState<string | null>(null);
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '130px' }}>
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', position: 'relative' }}
          onMouseEnter={() => setHov(d.label)} onMouseLeave={() => setHov(null)}>
          {hov === d.label && (d.ing > 0 || d.gas > 0) && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '0.4rem 0.6rem', zIndex: 10, whiteSpace: 'nowrap', fontSize: '0.68rem', marginBottom: '4px', pointerEvents: 'none' }}>
              {d.ing > 0 && <div style={{ color: '#10b981' }}>↑ {fmt(d.ing)}</div>}
              {d.gas > 0 && <div style={{ color: '#ef4444' }}>↓ {fmt(d.gas)}</div>}
              {d.ing > 0 && d.gas > 0 && <div style={{ color: d.ing - d.gas >= 0 ? '#10b981' : '#ef4444', borderTop: '1px solid #333', marginTop: '2px', paddingTop: '2px', fontWeight: 700 }}>= {fmt(d.ing - d.gas)}</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '100px' }}>
            <div style={{ width: '12px', background: '#10b981', height: `${Math.max((d.ing / max) * 100, d.ing > 0 ? 2 : 0)}%`, borderRadius: '3px 3px 0 0', transition: 'height 0.4s' }} />
            <div style={{ width: '12px', background: '#ef4444', height: `${Math.max((d.gas / max) * 100, d.gas > 0 ? 2 : 0)}%`, borderRadius: '3px 3px 0 0', opacity: 0.8, transition: 'height 0.4s' }} />
          </div>
          <div style={{ fontSize: '0.6rem', color: hov === d.label ? '#a0aec0' : '#52525b', marginTop: '4px' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
};

export const Inicio: React.FC = () => {
  const { movements, realAccounts, pockets, debts, loading: loadLedger, refetch } = useLedger();
  const { clients, projects } = useSupabaseData();
  const { totalMensual: totalRecurring } = useRecurring();
  const { members: teamMembers } = useTeam();
  const [modalOpen, setModalOpen]   = useState(false);
  const [periodoIdx, setPeriodoIdx] = useState(1); // default: 1 mes
  const [showInsights, setShowInsights] = useState(false);

  const periodo  = PERIODOS[periodoIdx];
  // horizonte = el período seleccionado: la comprometida solo cuenta egresos dentro de esos meses
  const kpis     = useMemo(() => calcKPIs(movements, realAccounts, debts, periodo.meses, periodo.diasExactos), [movements, realAccounts, debts, periodo.meses, periodo.diasExactos]);
  const sems     = useMemo(() => calcSemaforos(kpis, movements), [kpis, movements]);

  const hoy    = new Date();
  const hoyStr = hoyISO();

  // Fecha límite del período seleccionado
  const endDate = new Date(hoy);
  endDate.setDate(endDate.getDate() + periodo.days);
  const endDateStr = fechaISO(endDate);

  // ── Cobros en el período — fuente única: ledger_movements ───
  const cobrosEnPeriodo = useMemo(() =>
    movements
      .filter(m =>
        m.naturaleza === 'ingreso' &&
        (m.estado === 'esperado' || m.estado === 'facturado') &&
        m.fecha >= hoyStr && m.fecha <= endDateStr
      )
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [movements, hoyStr, endDateStr]
  );

  // ── Gastos comprometidos en el período (no recurring) — usados en el cálculo de proyección ───
  const gastosEnPeriodo = useMemo(() =>
    movements
      .filter(m =>
        m.naturaleza === 'egreso' &&
        (m.estado === 'esperado' || m.estado === 'facturado') &&
        m.fecha >= hoyStr && m.fecha <= endDateStr &&
        !m.notas?.startsWith('recurring:')
      )
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [movements, hoyStr, endDateStr]
  );

  // ── Todos los gastos del período (incluye recurrentes) — para la tabla visual ──
  const todosGastosEnPeriodo = useMemo(() =>
    movements
      .filter(m =>
        m.naturaleza === 'egreso' &&
        (m.estado === 'esperado' || m.estado === 'facturado') &&
        m.fecha >= hoyStr && m.fecha <= endDateStr
      )
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [movements, hoyStr, endDateStr]
  );

  // ── Proyección acumulada del período ────────────────────────
  const totalCobros = cobrosEnPeriodo.reduce((s, m) => s + m.valor, 0);

  // Gastos fijos y cuotas: para 15 días se usan los movimientos recurrentes reales
  // dentro del rango; para períodos en meses se usa totalRecurring * meses (estimación)
  const esDiasExactos = periodo.diasExactos !== undefined;

  const totalGasFijos = esDiasExactos
    ? movements.filter(m =>
        m.estado === 'esperado' &&
        m.naturaleza === 'egreso' &&
        m.notas?.startsWith('recurring:') &&
        m.fecha >= hoyStr &&
        m.fecha <= endDateStr
      ).reduce((s, m) => s + m.valor, 0)
    : totalRecurring * periodo.meses;

  const totalDeudaMinima = debts.filter(d => d.activa).reduce((s, d) => s + d.cuotaMinima, 0);
  const totalCuotas = esDiasExactos
    ? totalDeudaMinima * (periodo.diasExactos! / 30)
    : totalDeudaMinima * periodo.meses;

  const totalComprometido= gastosEnPeriodo.reduce((s, m) => s + m.valor, 0);
  const totalEgresos     = totalGasFijos + totalCuotas + totalComprometido;
  const balanceProyectado= totalCobros - totalEgresos;

  // ── Gráfico: N meses según período ──────────────────────────
  const barCount = Math.min(periodo.meses, 12);
  const chartData = useMemo(() =>
    Array.from({ length: barCount }, (_, i) => {
      const d  = new Date(hoy.getFullYear(), hoy.getMonth() - (barCount - 1) + i, 1);
      const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const conf = movements.filter(m => m.fecha.startsWith(ms) && m.estado === 'confirmado' && cuentaEnPL(m));
      return {
        label: MESES_ES[d.getMonth()].slice(0, 3),
        ing:   conf.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0),
        gas:   conf.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0),
      };
    }),
    [movements, barCount]
  );

  const getProjectName = (pid: string) => projects.find(p => p.id === pid)?.name || 'Proyecto';

  // Ingresos esperados del próximo mes (desde ledger_movements — fuente de verdad)
  const nextMonthMs = (() => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  })();
  const ingresosProximoMes = movements
    .filter(m => m.naturaleza === 'ingreso' && (m.estado === 'esperado' || m.estado === 'facturado') && m.fecha.startsWith(nextMonthMs))
    .reduce((s, m) => s + m.valor, 0);

  const fmtRunway = (r: number) => r < 1 ? `${Math.round(r * 30)} días` : `${r.toFixed(1)} meses`;
  const nextMonthLabel = MESES_ES[new Date(hoy.getFullYear(), hoy.getMonth() + 1).getMonth()];

  const liquidezContexto = ingresosProximoMes > 0
    ? `Tienes ${fmt(ingresosProximoMes)} proyectados para ${nextMonthLabel} — si cobras a tiempo, la operación está cubierta.`
    : `No hay cobros registrados para ${nextMonthLabel}. Agrega las cuotas pendientes en Movimientos.`;

  const INSIGHTS: Record<string, Record<string, string>> = {
    liquidez: {
      verde:    `Tienes caja para operar ${fmtRunway(kpis.runway)} sin necesitar cobrar nada más. Estás bien cubierto.`,
      amarillo: `Con la caja actual aguantas ${fmtRunway(kpis.runway)} sin cobrar. ${liquidezContexto}`,
      rojo:     `La caja actual cubre solo ${fmtRunway(kpis.runway)} de gastos (peor caso sin cobros). ${liquidezContexto}`,
    },
    cobranza: {
      verde:    'Todos los cobros están al día. No hay facturas vencidas sin recibir — bien.',
      amarillo: 'Hay cobros vencidos. Contacta hoy a los clientes que deben para no afectar tu liquidez.',
      rojo:     'Más del 30% de lo que te deben está vencido. Esto es un riesgo de caja inminente — actúa ya.',
    },
    margen: {
      verde:    `Margen saludable: por cada $100 que entra, quedan $${(kpis.margenYTD * 100).toFixed(0)} de utilidad este año.`,
      amarillo: `Margen bajo la meta (${(kpis.margenYTD * 100).toFixed(1)}%). Revisa si hay gastos que puedes optimizar o servicios que no son rentables.`,
      rojo:     `Margen crítico (${(kpis.margenYTD * 100).toFixed(1)}%). Estás gastando casi todo lo que entra. Revisa la estructura de costos urgente.`,
    },
    caja: {
      verde:    'La caja cubre todos los compromisos del período. El negocio está operando con holgura.',
      amarillo: 'La caja se está ajustando frente a los compromisos. Monitorea los egresos de cerca.',
      rojo:     `Los egresos comprometidos superan la caja disponible en ${periodo.label}. Necesitas cobrar o diferir gastos.`,
    },
    deuda: {
      verde:    'Sin deudas activas. La empresa opera 100% con capital propio — máxima flexibilidad.',
      amarillo: 'El nivel de deuda es manejable, pero considera el impacto de las cuotas en tu flujo mensual.',
      rojo:     'La deuda representa una parte alta del ingreso anual. Prioriza amortizarla antes de adquirir nuevas obligaciones.',
    },
    higiene: {
      verde:    'Sin retiros del fundador este mes. El capital de trabajo está intacto y disponible.',
      amarillo: `Retiros de ${kpis.retirosFounderMes > 0 ? '$' + Math.round(kpis.retirosFounderMes).toLocaleString('es-CO') : '0'} este mes. Verifica que no afecten la liquidez operativa.`,
      rojo:     'Los retiros del fundador son altos este mes. Esto puede comprometer el capital de trabajo y el runway.',
    },
  };

  if (loadLedger) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '5rem' }}>

      {/* Reglas del Fundador */}
      <FounderPanel movements={movements} realAccounts={realAccounts} kpis={kpis} onRefetch={refetch} />

      {/* Hero: Caja Libre + KPIs */}
      <div className="resp-grid-hero" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.75rem', background: 'linear-gradient(135deg,#111 0%,#0a0a0a 100%)' }}>
          <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>Caja Libre Ahora</div>
          <div style={{ fontSize: '2.8rem', fontWeight: 900, color: kpis.cajaLibre >= 0 ? '#fff' : '#ef4444', lineHeight: 1.1, marginTop: '0.4rem' }}>
            {fmtK(kpis.cajaLibre)}
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 600 }}>Caja Total</div>
              <div style={{ color: '#a0aec0', fontWeight: 700, fontSize: '0.9rem' }}>{fmtK(kpis.cajaTotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 600 }}>
                Comprometida · {periodo.label}
              </div>
              <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem' }}>{fmtK(kpis.cajaComprometida)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.25rem', minHeight: 'auto' }}>
            <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Runway</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: kpis.runway >= 3 ? '#10b981' : kpis.runway >= 1 ? '#f59e0b' : '#ef4444', marginTop: '0.2rem' }}>
              {kpis.runway > 99
                ? '∞'
                : kpis.runway < 1
                  ? Math.round(kpis.runway * 30).toString()
                  : kpis.runway.toFixed(1)}
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#52525b' }}>
                {' '}{kpis.runway > 99 ? '' : kpis.runway < 1 ? 'días' : 'm'}
              </span>
            </div>
          </div>
          <div className="card" style={{ padding: '1.25rem', minHeight: 'auto' }}>
            <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Margen YTD</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: kpis.margenYTD >= 0.3 ? '#10b981' : kpis.margenYTD >= 0.1 ? '#f59e0b' : '#ef4444', marginTop: '0.2rem' }}>
              {(kpis.margenYTD * 100).toFixed(0)}%
            </div>
          </div>
          <div className="card" style={{ padding: '1.25rem', minHeight: 'auto' }}>
            <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Por Cobrar</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#06b6d4', marginTop: '0.2rem' }}>{fmtK(kpis.porCobrar)}</div>
          </div>
          <div className="card" style={{ padding: '1.25rem', minHeight: 'auto' }}>
            <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Deuda Total</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', marginTop: '0.2rem' }}>{fmtK(kpis.totalDeudas)}</div>
          </div>
        </div>
      </div>

      {/* Semáforos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowInsights(v => !v)}
            style={{
              padding: '0.3rem 0.875rem', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700,
              border: `1px solid ${showInsights ? '#a855f7' : '#2a2a2a'}`,
              background: showInsights ? '#a855f714' : 'transparent',
              color: showInsights ? '#a855f7' : '#52525b',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}>
            {showInsights ? '◉' : '○'} {showInsights ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}
          </button>
        </div>
        <div className="resp-grid-sem" style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '0.5rem' }}>
          {sems.map(s => (
            <div key={s.id} className="card" style={{
              padding: '0.75rem', minHeight: 'auto',
              borderColor: `${SEM_COLOR[s.estado]}22`,
              background: `${SEM_COLOR[s.estado]}06`,
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', color: '#52525b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</span>
                <span style={{ fontSize: '0.8rem' }}>{SEM_ICON[s.estado]}</span>
              </div>
              <div style={{ fontSize: '0.8rem', fontWeight: 800, color: SEM_COLOR[s.estado], marginTop: '0.25rem' }}>{s.valor}</div>
              <div style={{ fontSize: '0.62rem', color: '#52525b', marginTop: '0.1rem' }}>{s.desc}</div>
              {showInsights && INSIGHTS[s.id]?.[s.estado] && (
                <div style={{
                  marginTop: '0.5rem', paddingTop: '0.5rem',
                  borderTop: `1px solid ${SEM_COLOR[s.estado]}22`,
                  fontSize: '0.65rem', color: SEM_COLOR[s.estado],
                  lineHeight: 1.45, opacity: 0.9,
                }}>
                  {INSIGHTS[s.id][s.estado]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── SELECTOR DE PERÍODO ─────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
            Vista proyectada
          </span>
          <span style={{ fontSize: '0.65rem', color: '#3f3f46', marginLeft: '0.5rem' }}>
            · hasta {fmtDate(endDateStr)}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.3rem', background: '#111', padding: '0.2rem', borderRadius: '10px' }}>
          {PERIODOS.map((p, idx) => (
            <button key={p.label} onClick={() => setPeriodoIdx(idx)}
              style={{
                padding: '0.35rem 0.875rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600,
                border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: periodoIdx === idx ? '#fff' : 'transparent',
                color:      periodoIdx === idx ? '#000' : '#71717a',
                transition: 'all 0.15s',
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── COBROS ESPERADOS + PRÓXIMOS GASTOS ──────────────────── */}
      <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Cobros esperados */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingUp size={14} style={{ color: '#10b981' }} />
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
              Cobros esperados — {periodo.label}
            </h3>
            {cobrosEnPeriodo.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#52525b', fontWeight: 600 }}>
                ({cobrosEnPeriodo.length})
              </span>
            )}
          </div>

          {cobrosEnPeriodo.length > 0 ? (
            <>
              <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {cobrosEnPeriodo.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid #1a1a1a' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</div>
                      <div style={{ fontSize: '0.65rem', color: '#52525b', marginTop: '0.1rem' }}>
                        {m.projectId ? getProjectName(m.projectId) : (clients.find(c => c.id === m.clientId)?.name || '')}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                      <div style={{ fontSize: '0.82rem', color: '#10b981', fontWeight: 700 }}>{fmt(m.valor)}</div>
                      <div style={{ fontSize: '0.62rem', color: '#52525b' }}>
                        {fmtDate(m.fecha)}
                        {m.estado === 'facturado' && <span style={{ color: '#60a5fa', marginLeft: '4px' }}>· facturado</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #1a1a1a' }}>
                <span style={{ fontSize: '0.7rem', color: '#52525b' }}>Total esperado</span>
                <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 800 }}>{fmtK(totalCobros)}</span>
              </div>
            </>
          ) : (
            <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '2.5rem 0' }}>
              Sin cobros registrados para los próximos {periodo.label}.
            </div>
          )}
        </div>

        {/* Próximos gastos */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <TrendingDown size={14} style={{ color: '#ef4444' }} />
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
              Próximos gastos — {periodo.label}
            </h3>
            {todosGastosEnPeriodo.length > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#52525b', fontWeight: 600 }}>
                ({todosGastosEnPeriodo.length})
              </span>
            )}
          </div>

          {todosGastosEnPeriodo.length > 0 ? (
            <>
              <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                {todosGastosEnPeriodo.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid #1a1a1a' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</div>
                      <div style={{ fontSize: '0.65rem', color: '#52525b', marginTop: '0.1rem' }}>
                        {m.tercero || (m.projectId ? getProjectName(m.projectId) : '')}
                        {m.notas?.startsWith('recurring:') && (
                          <span style={{ color: '#a855f7', marginLeft: '4px' }}>· recurrente</span>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '0.75rem' }}>
                      <div style={{ fontSize: '0.82rem', color: '#ef4444', fontWeight: 700 }}>−{fmt(m.valor)}</div>
                      <div style={{ fontSize: '0.62rem', color: '#52525b' }}>
                        {fmtDate(m.fecha)}
                        {m.estado === 'facturado' && <span style={{ color: '#60a5fa', marginLeft: '4px' }}>· facturado</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid #1a1a1a' }}>
                <span style={{ fontSize: '0.7rem', color: '#52525b' }}>Total proyectado</span>
                <span style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 800 }}>
                  −{fmtK(todosGastosEnPeriodo.reduce((s, m) => s + m.valor, 0))}
                </span>
              </div>
            </>
          ) : (
            <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '2.5rem 0' }}>
              Sin gastos registrados para los próximos {periodo.label}.
            </div>
          )}
        </div>
      </div>

      {/* ── PROYECCIÓN ACUMULADA ─────────────────────────────────── */}
      <div className="card" style={{ padding: '1.25rem', borderTop: `3px solid ${balanceProyectado >= 0 ? '#10b98155' : '#ef444433'}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* Balance */}
          <div>
            <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem' }}>
              🔮 Proyección acumulada — {periodo.label}
            </h3>
            <div style={{ padding: '1rem', background: '#0d0d0d', borderRadius: '10px', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>
                Balance neto proyectado
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: balanceProyectado >= 0 ? '#10b981' : '#ef4444', lineHeight: 1 }}>
                {fmtK(balanceProyectado)}
              </div>
            </div>
            {totalCobros > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.65rem', color: '#52525b' }}>Egresos vs ingresos</span>
                  <span style={{ fontSize: '0.65rem', color: balanceProyectado >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                    {Math.round((totalEgresos / totalCobros) * 100)}%
                  </span>
                </div>
                <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (totalEgresos / totalCobros) * 100)}%`, background: balanceProyectado >= 0 ? '#10b981' : '#ef4444', borderRadius: '999px', transition: 'width 0.4s' }} />
                </div>
              </>
            )}
            {totalCobros === 0 && (
              <div style={{ fontSize: '0.72rem', color: '#52525b', background: '#111', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
                💡 Sin cobros registrados para este período. Agrega movimientos con estado "Esperado" o "Facturado".
              </div>
            )}
          </div>

          {/* Desglose */}
          <div>
            <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem', letterSpacing: '0.5px' }}>Desglose</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: 'rgba(16,185,129,0.07)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>Cobros acordados</span>
                <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.82rem' }}>{fmtK(totalCobros)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: 'rgba(239,68,68,0.07)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>
                  Gastos fijos ({esDiasExactos ? `${periodo.diasExactos} d` : `${periodo.meses} m`})
                </span>
                <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.82rem' }}>−{fmtK(totalGasFijos)}</span>
              </div>
              {totalCuotas > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: 'rgba(249,115,22,0.07)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>
                    Cuotas deuda ({esDiasExactos ? `${periodo.diasExactos} d` : `${periodo.meses} m`})
                  </span>
                  <span style={{ color: '#f97316', fontWeight: 700, fontSize: '0.82rem' }}>−{fmtK(totalCuotas)}</span>
                </div>
              )}
              {totalComprometido > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: 'rgba(245,158,11,0.07)', borderRadius: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>Gastos comprometidos</span>
                  <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.82rem' }}>−{fmtK(totalComprometido)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: '#0d0d0d', borderRadius: '8px', marginTop: '0.25rem', borderTop: '1px solid #1a1a1a' }}>
                <span style={{ fontSize: '0.82rem', color: '#a0aec0', fontWeight: 700 }}>Balance neto</span>
                <span style={{ color: balanceProyectado >= 0 ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: '0.85rem' }}>
                  {balanceProyectado >= 0 ? '+' : ''}{fmtK(balanceProyectado)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── GRÁFICO histórico adaptado al período ───────────────── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
            Ingresos vs Gastos — últimos {barCount} {barCount === 1 ? 'mes' : 'meses'}
          </h3>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: '#71717a' }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', marginRight: '4px' }} />Ingresos</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', marginRight: '4px', opacity: 0.7 }} />Gastos</span>
          </div>
        </div>
        <MiniBar data={chartData} />
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
          <span style={{ color: '#10b981' }}>
            Prom. ingresos: {fmtK(chartData.filter(d => d.ing > 0).reduce((s, d) => s + d.ing, 0) / Math.max(chartData.filter(d => d.ing > 0).length, 1))}
          </span>
          <span style={{ color: '#ef4444' }}>
            Prom. gastos: {fmtK(chartData.filter(d => d.gas > 0).reduce((s, d) => s + d.gas, 0) / Math.max(chartData.filter(d => d.gas > 0).length, 1))}
          </span>
          <span style={{ color: '#52525b' }}>
            Prom. balance: {fmtK(chartData.reduce((s, d) => s + (d.ing - d.gas), 0) / Math.max(chartData.length, 1))}
          </span>
        </div>
      </div>

      {/* FAB — Registrar movimiento */}
      <button
        onClick={() => setModalOpen(true)}
        style={{
          position: 'fixed', bottom: '2rem', right: '2rem',
          background: '#fff', color: '#000',
          border: 'none', borderRadius: '999px',
          padding: '0.875rem 1.5rem',
          fontWeight: 800, fontSize: '0.9rem',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          zIndex: 50, fontFamily: 'inherit',
        }}
      >
        <Plus size={18} /> Registrar movimiento
      </button>

      <AddLedgerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        realAccounts={realAccounts} pockets={pockets}
        projects={projects} clients={clients}
        teamMembers={teamMembers}
        movements={movements}
        editing={null}
      />
    </div>
  );
};
