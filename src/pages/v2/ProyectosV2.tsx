import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, CalendarPlus } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useLedger } from '../../hooks/useLedger';
import { calcRentabilidad } from '../../hooks/useFinancials';
import { supabase } from '../../lib/supabase';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : fmt(v);

const COLORS = ['#a855f7','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899'];

// Donut chart CSS
const Donut = ({ slices }: { slices: { label: string; value: number; color: string }[] }) => {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  return (
    <svg width="120" height="120" viewBox="0 0 100 100">
      {slices.map((s, i) => {
        const pct = s.value / total;
        const dash = pct * circ;
        const gap = circ - dash;
        const rotate = offset * 360;
        offset += pct;
        return (
          <circle key={i} r={r} cx={cx} cy={cy} fill="none"
            stroke={s.color} strokeWidth="18"
            strokeDasharray={`${dash} ${gap}`}
            strokeDashoffset={circ * 0.25}
            transform={`rotate(${rotate} ${cx} ${cy})`}
            opacity={0.9}
          >
            <title>{s.label}: {fmt(s.value)}</title>
          </circle>
        );
      })}
      <circle r={28} cx={cx} cy={cy} fill="#111" />
    </svg>
  );
};

const statusLabel: Record<string, { label: string; color: string }> = {
  active:    { label: 'Activo', color: '#10b981' },
  pending:   { label: 'Pendiente', color: '#f59e0b' },
  completed: { label: 'Completado', color: '#71717a' },
  cancelled: { label: 'Cancelado', color: '#ef4444' },
};

export const ProyectosV2: React.FC = () => {
  const { clients, projects, payments, loading, refetch } = useSupabaseData();
  const { movements } = useLedger();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState<any>(null);
  const [confirmAmount, setConfirmAmount] = useState('');

  const rentabilidad = useMemo(() => calcRentabilidad(movements, projects, clients), [movements, projects, clients]);
  const rentMap = useMemo(() => Object.fromEntries(rentabilidad.map(r => [r.projectId, r])), [rentabilidad]);

  const activeProjects = projects.filter(p => p.status !== 'cancelled');
  const mrr = projects.filter(p => p.isRecurring && p.status === 'active').reduce((s, p) => s + p.totalAmount, 0);
  const totalContratado = activeProjects.reduce((s, p) => s + p.totalAmount, 0);
  const cobradoTotal = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.actualAmount ?? p.amount), 0);
  const pendienteTotal = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);

  const getClient = (id: string) => clients.find(c => c.id === id);
  const fmtDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  // Donut data — ingresos por proyecto
  const donutData = rentabilidad.slice(0, 6).map((r, i) => ({
    label: r.nombre, value: r.ingresos, color: COLORS[i % COLORS.length],
  }));

  const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const markAsPaid = async (paymentId: string, amount: number, projectId: string) => {
    setMarkingId(paymentId);
    try {
      await supabase.from('payments').update({ status: 'paid', actual_amount: amount }).eq('id', paymentId);
      // Auto-create ledger movement
      const { data: boldAcc } = await supabase.from('real_accounts').select('id').ilike('nombre', '%bold%').limit(1);
      const proj = projects.find(p => p.id === projectId);
      await supabase.from('ledger_movements').insert({
        fecha: new Date().toISOString().split('T')[0],
        tipo_movimiento: 'ingreso_operativo', naturaleza: 'ingreso',
        descripcion: `Cobro: ${proj?.name || 'Proyecto'}`,
        valor: amount, categoria: 'Cobro de Cliente', estado: 'confirmado',
        cuenta_real_id: boldAcc?.[0]?.id || null,
        project_id: projectId,
        mes: new Date().toLocaleDateString('es-CO', { month: 'long' }),
        personal_flag: false, updated_at: new Date().toISOString(),
      });
      setConfirmingPayment(null);
      refetch();
    } finally { setMarkingId(null); }
  };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
        {[
          { label: 'MRR',            value: fmtK(mrr),           color: '#a855f7' },
          { label: 'Total Contratado', value: fmtK(totalContratado), color: '#fff' },
          { label: 'Cobrado',         value: fmtK(cobradoTotal),  color: '#10b981' },
          { label: 'Por Cobrar',      value: fmtK(pendienteTotal), color: '#06b6d4' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Lista de proyectos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {activeProjects.map(proj => {
            const client = getClient(proj.clientId);
            const projPayments = payments.filter(p => p.projectId === proj.id);
            const paid = projPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.actualAmount ?? p.amount), 0);
            const pending = projPayments.filter(p => p.status === 'pending' || p.status === 'overdue');
            const nextPayment = pending.sort((a, b) => a.date.localeCompare(b.date))[0];
            const pct = proj.totalAmount > 0 ? (paid / proj.totalAmount) * 100 : 0;
            const ren = rentMap[proj.id];
            const st = statusLabel[proj.status] || { label: proj.status, color: '#71717a' };
            const isOpen = expanded === proj.id;

            return (
              <div key={proj.id} className="card" style={{ padding: '1.1rem 1.25rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : proj.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#fff', fontWeight: 700 }}>{proj.name}</span>
                      <span style={{ fontSize: '0.7rem', background: `${st.color}18`, color: st.color, padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>{st.label}</span>
                      {proj.isRecurring && <span style={{ fontSize: '0.7rem', background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600 }}>MRR</span>}
                    </div>
                    <div style={{ color: '#71717a', fontSize: '0.8rem', marginTop: '0.15rem' }}>{client?.name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: '#fff', fontWeight: 700 }}>{fmtK(proj.totalAmount)}</div>
                      {nextPayment && (
                        <div style={{ fontSize: '0.72rem', color: nextPayment.status === 'overdue' ? '#ef4444' : '#06b6d4' }}>
                          Próx: {fmt(nextPayment.amount)} · {fmtDate(nextPayment.date)}
                        </div>
                      )}
                    </div>
                    {ren && (
                      <div style={{ textAlign: 'right', minWidth: '60px' }}>
                        <div style={{ fontSize: '0.7rem', color: '#71717a' }}>Margen</div>
                        <div style={{ fontWeight: 800, color: (ren.margen || 0) >= 0.3 ? '#10b981' : (ren.margen || 0) >= 0.1 ? '#f59e0b' : '#ef4444' }}>
                          {ren.margen != null ? (ren.margen * 100).toFixed(0) + '%' : '—'}
                        </div>
                      </div>
                    )}
                    {isOpen ? <ChevronUp size={16} style={{ color: '#52525b' }} /> : <ChevronDown size={16} style={{ color: '#52525b' }} />}
                  </div>
                </div>

                {/* Barra de cobro */}
                <div style={{ height: '3px', background: '#222', borderRadius: '999px', overflow: 'hidden', marginTop: '0.75rem' }}>
                  <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: '#10b981', borderRadius: '999px', transition: 'width 0.4s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#52525b', marginTop: '0.25rem' }}>
                  <span>Cobrado: {fmt(paid)}</span>
                  <span>{pct.toFixed(0)}%</span>
                  <span>Total: {fmt(proj.totalAmount)}</span>
                </div>

                {/* Detalle expandido */}
                {isOpen && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #1a1a1a' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                      {ren && (
                        <>
                          <div style={{ background: '#0a0a0a', borderRadius: '10px', padding: '0.875rem' }}>
                            <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>P&L del Proyecto</div>
                            {[
                              { l: 'Ingresos', v: ren.ingresos, c: '#10b981' },
                              { l: 'Gastos', v: ren.gastos, c: '#ef4444' },
                              { l: 'Utilidad', v: ren.utilidad, c: ren.utilidad >= 0 ? '#10b981' : '#ef4444' },
                            ].map(r => (
                              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                                <span style={{ fontSize: '0.8rem', color: '#71717a' }}>{r.l}</span>
                                <span style={{ fontSize: '0.8rem', color: r.c, fontWeight: 700 }}>{fmt(r.v)}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ background: '#0a0a0a', borderRadius: '10px', padding: '0.875rem' }}>
                            <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Info</div>
                            <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Plan: {proj.plan}</div>
                            <div style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.25rem' }}>Email: {client?.email || '—'}</div>
                            <div style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.25rem' }}>Movs ledger: {ren.movimientos}</div>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Cuotas */}
                    <div style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Cuotas</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {projPayments.sort((a, b) => a.date.localeCompare(b.date)).map(p => (
                        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 600,
                              color: p.status === 'paid' ? '#10b981' : p.status === 'overdue' ? '#ef4444' : '#f59e0b',
                              background: p.status === 'paid' ? 'rgba(16,185,129,0.1)' : p.status === 'overdue' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                              padding: '0.15rem 0.5rem', borderRadius: '999px',
                            }}>
                              {p.status === 'paid' ? 'Pagado' : p.status === 'overdue' ? 'Atrasado' : 'Pendiente'}
                            </span>
                            <span style={{ fontSize: '0.78rem', color: '#71717a' }}>{fmtDate(p.date)}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontWeight: 700, color: p.status === 'paid' ? '#10b981' : '#fff', fontSize: '0.85rem' }}>
                              {fmt(p.actualAmount ?? p.amount)}
                            </span>
                            {p.status !== 'paid' && (
                              <button
                                onClick={() => { setConfirmingPayment({ ...p, projectId: proj.id }); setConfirmAmount(String(Math.round(p.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')); }}
                                disabled={markingId === p.id}
                                style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                {markingId === p.id ? '...' : '✓ Cobrado'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {activeProjects.length === 0 && (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#52525b', border: '1px dashed #222', borderRadius: '12px' }}>
              Sin proyectos activos. Crea uno desde la sección Proyectos.
            </div>
          )}
        </div>

        {/* Panel derecho — Donut */}
        <div className="card" style={{ padding: '1.25rem', position: 'sticky', top: '1.5rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem', fontSize: '0.85rem' }}>Ingresos por proyecto</h3>
          {donutData.length > 0 ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <Donut slices={donutData} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {donutData.map(d => (
                  <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '999px', background: d.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{d.label.slice(0, 18)}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: d.color, fontWeight: 700 }}>{fmtK(d.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1rem 0' }}>
              Registra movimientos con proyecto asignado para ver distribución.
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmar pago */}
      {confirmingPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '340px', border: '1px solid #333' }}>
            <h3 style={{ color: '#fff', fontWeight: 800, textAlign: 'center', marginBottom: '1rem' }}>Confirmar cobro</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Monto real recibido (COP)</label>
              <input type="text" inputMode="numeric" autoFocus
                value={confirmAmount}
                onChange={e => setConfirmAmount(fmtInput(e.target.value))}
                style={{ width: '100%', background: '#111', border: '1px solid #fff', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setConfirmingPayment(null)} className="btn btn-outline" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={() => markAsPaid(confirmingPayment.id, Number(confirmAmount.replace(/\./g, '')), confirmingPayment.projectId)} className="btn btn-primary" style={{ flex: 1 }}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
