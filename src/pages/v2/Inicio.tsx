import React, { useState, useMemo } from 'react';
import { Plus, TrendingUp, TrendingDown, CalendarPlus } from 'lucide-react';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useRecurring } from '../../hooks/useRecurring';
import { calcKPIs, calcSemaforos } from '../../hooks/useFinancials';
import { AddLedgerModal } from '../../components/AddLedgerModal';
import { MESES_ES } from '../../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => {
  if (v >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 1_000) return '$' + (v / 1_000).toFixed(0) + 'K';
  return fmt(v);
};

const SEM_COLOR: Record<string, string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
const SEM_ICON: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };

// Simple bar chart — no library
const MiniBar = ({ data }: { data: { label: string; ing: number; gas: number }[] }) => {
  const max = Math.max(...data.flatMap(d => [d.ing, d.gas]), 1);
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: '100px' }}>
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '84px' }}>
            <div title={`Ingresos: ${fmt(d.ing)}`}
              style={{ width: '12px', background: '#10b981', height: `${Math.max((d.ing / max) * 100, d.ing > 0 ? 2 : 0)}%`, borderRadius: '3px 3px 0 0', transition: 'height 0.4s' }} />
            <div title={`Gastos: ${fmt(d.gas)}`}
              style={{ width: '12px', background: '#ef4444', height: `${Math.max((d.gas / max) * 100, d.gas > 0 ? 2 : 0)}%`, borderRadius: '3px 3px 0 0', opacity: 0.7, transition: 'height 0.4s' }} />
          </div>
          <div style={{ fontSize: '0.6rem', color: '#52525b', marginTop: '4px' }}>{d.label}</div>
        </div>
      ))}
    </div>
  );
};

export const Inicio: React.FC = () => {
  const { movements, realAccounts, pockets, debts, loading: loadLedger, refetch } = useLedger();
  const { clients, projects, payments } = useSupabaseData();
  const { items: recurring, totalMensual: totalRecurring } = useRecurring();
  const [modalOpen, setModalOpen] = useState(false);

  const kpis = useMemo(() => calcKPIs(movements, realAccounts, debts), [movements, realAccounts, debts]);
  const sems = useMemo(() => calcSemaforos(kpis, movements), [kpis, movements]);

  const hoy = new Date();
  const hoyStr = hoy.toISOString().split('T')[0];
  const en7 = new Date(hoy); en7.setDate(en7.getDate() + 7);
  const en7Str = en7.toISOString().split('T')[0];

  // Cobros próximos 7 días (payments pendientes)
  const cobrosProximos = payments.filter(p =>
    (p.status === 'pending' || p.status === 'overdue') &&
    p.date >= hoyStr && p.date <= en7Str
  ).sort((a, b) => a.date.localeCompare(b.date));

  // Gastos comprometidos próximos 7 días (movimientos esperado)
  const gastosProximos = movements.filter(m =>
    m.naturaleza === 'egreso' && m.estado === 'esperado' &&
    m.fechaVencimiento && m.fechaVencimiento >= hoyStr && m.fechaVencimiento <= en7Str
  ).sort((a, b) => (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || ''));

  // Proyección próximo mes
  const nextMonth = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  const ingresosProxMes = payments
    .filter(p => p.status === 'pending' && p.date.startsWith(nextMonthStr))
    .reduce((s, p) => s + p.amount, 0);
  const gastosRecurrentesProxMes = totalRecurring + debts.filter(d => d.activa).reduce((s, d) => s + d.cuotaMinima, 0);
  const balanceProyectado = ingresosProxMes - gastosRecurrentesProxMes;

  // Últimos 6 meses para el gráfico
  const last6 = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (5 - i), 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const conf = movements.filter(m => m.fecha.startsWith(ms) && m.estado === 'confirmado');
    return {
      label: MESES_ES[d.getMonth()].slice(0, 3),
      ing: conf.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0),
      gas: conf.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0),
    };
  }), [movements]);

  const getProjectName = (projectId: string) => projects.find(p => p.id === projectId)?.name || 'Proyecto';
  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  if (loadLedger) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '5rem' }}>

      {/* Hero: Caja Libre + Runway */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
              <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 600 }}>Comprometida</div>
              <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '0.9rem' }}>{fmtK(kpis.cajaComprometida)}</div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.25rem', minHeight: 'auto' }}>
            <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Runway</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: kpis.runway >= 3 ? '#10b981' : kpis.runway >= 1 ? '#f59e0b' : '#ef4444', marginTop: '0.2rem' }}>
              {kpis.runway > 99 ? '∞' : kpis.runway.toFixed(1)}
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: '#52525b' }}> meses</span>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: '0.5rem' }}>
        {sems.map(s => (
          <div key={s.id} className="card" style={{ padding: '0.75rem', minHeight: 'auto', borderColor: `${SEM_COLOR[s.estado]}22`, background: `${SEM_COLOR[s.estado]}06` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: '#52525b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</span>
              <span style={{ fontSize: '0.8rem' }}>{SEM_ICON[s.estado]}</span>
            </div>
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: SEM_COLOR[s.estado], marginTop: '0.25rem' }}>{s.valor}</div>
            <div style={{ fontSize: '0.62rem', color: '#52525b', marginTop: '0.1rem' }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Esta semana + Proyección próximo mes */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>

        {/* Esta semana */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem' }}>📅 Próximos 7 días</h3>

          {cobrosProximos.length > 0 && (
            <div style={{ marginBottom: '0.875rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
                <TrendingUp size={10} style={{ display: 'inline', marginRight: '4px' }} />Cobros esperados
              </div>
              {cobrosProximos.map(p => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #1a1a1a' }}>
                  <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{getProjectName(p.projectId)}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700 }}>{fmt(p.amount)}</div>
                    <div style={{ fontSize: '0.65rem', color: '#52525b' }}>{formatDate(p.date)}</div>
                  </div>
                </div>
              ))}
              <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700, marginTop: '0.4rem', textAlign: 'right' }}>
                Total: {fmt(cobrosProximos.reduce((s, p) => s + p.amount, 0))}
              </div>
            </div>
          )}

          {gastosProximos.length > 0 && (
            <div>
              <div style={{ fontSize: '0.65rem', color: '#ef4444', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
                <TrendingDown size={10} style={{ display: 'inline', marginRight: '4px' }} />Gastos comprometidos
              </div>
              {gastosProximos.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid #1a1a1a' }}>
                  <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{m.descripcion}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700 }}>{fmt(m.valor)}</div>
                    <div style={{ fontSize: '0.65rem', color: '#52525b' }}>{m.fechaVencimiento ? formatDate(m.fechaVencimiento) : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {cobrosProximos.length === 0 && gastosProximos.length === 0 && (
            <div style={{ color: '#52525b', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
              Sin movimientos urgentes esta semana 🎉
            </div>
          )}
        </div>

        {/* Proyección próximo mes */}
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem', fontSize: '0.9rem' }}>
            🔮 Proyección — {MESES_ES[nextMonth.getMonth()]}
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.07)', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>Cobros acordados</span>
              <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.82rem' }}>{fmt(ingresosProxMes)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.07)', borderRadius: '8px' }}>
              <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>Gastos fijos + deudas</span>
              <span style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.82rem' }}>{fmt(gastosRecurrentesProxMes)}</span>
            </div>
            {totalRecurring > 0 && (
              <div style={{ paddingLeft: '0.75rem', fontSize: '0.72rem', color: '#52525b' }}>
                Recurrentes: {fmt(totalRecurring)} · Cuotas deuda: {fmt(debts.filter(d => d.activa).reduce((s, d) => s + d.cuotaMinima, 0))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0.75rem', background: balanceProyectado >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: '8px', borderLeft: `3px solid ${balanceProyectado >= 0 ? '#10b981' : '#ef4444'}` }}>
              <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 700 }}>Balance proyectado</span>
              <span style={{ color: balanceProyectado >= 0 ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: '0.95rem' }}>{fmt(balanceProyectado)}</span>
            </div>
          </div>

          {ingresosProxMes === 0 && (
            <div style={{ fontSize: '0.72rem', color: '#52525b', background: '#111', borderRadius: '8px', padding: '0.5rem 0.75rem' }}>
              💡 No hay cobros registrados como acordados para {MESES_ES[nextMonth.getMonth()]}. Registra los pagos esperados de tus proyectos.
            </div>
          )}
        </div>
      </div>

      {/* Gráfico últimos 6 meses */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Ingresos vs Gastos — últimos 6 meses</h3>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', color: '#71717a' }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', marginRight: '4px' }} />Ingresos</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', marginRight: '4px', opacity: 0.7 }} />Gastos</span>
          </div>
        </div>
        <MiniBar data={last6} />
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', fontSize: '0.75rem' }}>
          <span style={{ color: '#10b981' }}>
            Prom. ingresos: {fmtK(last6.filter(d => d.ing > 0).reduce((s, d) => s + d.ing, 0) / Math.max(last6.filter(d => d.ing > 0).length, 1))}
          </span>
          <span style={{ color: '#ef4444' }}>
            Prom. gastos: {fmtK(last6.filter(d => d.gas > 0).reduce((s, d) => s + d.gas, 0) / Math.max(last6.filter(d => d.gas > 0).length, 1))}
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
          zIndex: 50,
          fontFamily: 'inherit',
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
        editing={null}
      />
    </div>
  );
};
