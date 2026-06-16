import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Trophy, Clock, AlertTriangle } from 'lucide-react';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useLedger } from '../../hooks/useLedger';
import { calcRentabilidad } from '../../hooks/useFinancials';
import { AddProjectModal } from '../../components/AddProjectModal';
import { EditProjectModal } from '../../components/EditProjectModal';
import { ClientesSection } from './Clientes';
import { supabase } from '../../lib/supabase';
import { hoyISO } from '../../lib/dates';
import { MESES_ES, ORIGEN_LABELS } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : fmt(v);

const COLORS = ['#a855f7','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899'];

const Donut = ({ slices }: { slices: { label: string; value: number; color: string }[] }) => {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
  return (
    <svg width="120" height="120" viewBox="0 0 100 100">
      {slices.map((s, i) => {
        const pct = s.value / total;
        const dash = pct * circ;
        const rotate = offset * 360;
        offset += pct;
        return (
          <circle key={i} r={r} cx={cx} cy={cy} fill="none"
            stroke={s.color} strokeWidth="18"
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={circ * 0.25}
            transform={`rotate(${rotate} ${cx} ${cy})`} opacity={0.9}>
            <title>{s.label}: {fmt(s.value)}</title>
          </circle>
        );
      })}
      <circle r={28} cx={cx} cy={cy} fill="#111" />
    </svg>
  );
};

const statusLabel: Record<string, { label: string; color: string }> = {
  active:    { label: 'Activo',     color: '#10b981' },
  pending:   { label: 'Pendiente',  color: '#f59e0b' },
  completed: { label: 'Completado', color: '#71717a' },
  cancelled: { label: 'Cancelado',  color: '#ef4444' },
};

// ── Vigencia helpers ────────────────────────────────────────
const getEndDate = (startDate: string, durationMonths: number) => {
  if (!startDate) return null;
  const d = new Date(startDate + 'T12:00:00');
  d.setMonth(d.getMonth() + (durationMonths || 1));
  return d;
};

const getVigenciaPct = (startDate: string, durationMonths: number) => {
  const end = getEndDate(startDate, durationMonths);
  if (!end) return 0;
  const start = new Date(startDate + 'T12:00:00').getTime();
  const total = end.getTime() - start;
  if (total <= 0) return 100;
  return Math.min(100, Math.max(0, ((Date.now() - start) / total) * 100));
};

const getVigencia = (startDate: string, durationMonths: number) => {
  const end = getEndDate(startDate, durationMonths);
  if (!end) return null;
  const today = new Date();
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
  if (daysLeft < 0)  return { label: `Vencido hace ${Math.abs(daysLeft)}d`, color: '#ef4444', icon: 'expired', daysLeft };
  if (daysLeft <= 15) return { label: `Vence en ${daysLeft}d`, color: '#ef4444', icon: 'urgent', daysLeft };
  if (daysLeft <= 45) return { label: `Vence en ${daysLeft}d`, color: '#f59e0b', icon: 'warning', daysLeft };
  return { label: `${daysLeft}d restantes`, color: '#10b981', icon: 'ok', daysLeft };
};

type Tab = 'proyectos' | 'clientes' | 'metricas';
type StatusFilter = 'todos' | 'activos' | 'porVencer' | 'vencidos' | 'pendientesPago' | 'completados';

export const ProyectosV2: React.FC = () => {
  const { clients, projects, loading, refetch } = useSupabaseData();
  const { movements } = useLedger();
  const [tab, setTab] = useState<Tab>('proyectos');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState<{ movId: string; projectId: string } | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [showAddProject, setShowAddProject] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('todos');
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rentabilidad = useMemo(() => calcRentabilidad(movements, projects, clients), [movements, projects, clients]);
  const rentMap = useMemo(() => Object.fromEntries(rentabilidad.map(r => [r.projectId, r])), [rentabilidad]);

  const activeProjects  = projects.filter(p => p.status !== 'cancelled');
  // MRR = suma de la cuota mensual de cada proyecto recurrente activo (totalAmount ÷ installments)
  const mrr             = projects
    .filter(p => p.isRecurring && p.status === 'active')
    .reduce((s, p) => s + p.totalAmount / Math.max(p.installments, 1), 0);

  // Cobrado y por cobrar POR PROYECTO desde ledger_movements — fuente única de verdad.
  // 'vencido' = pago no recibido a tiempo, sigue siendo por cobrar. 'anulado' = excluido intencionalmente.
  const projTotals = useMemo(() => {
    const map: Record<string, { pagado: number; porPagar: number }> = {};
    for (const m of movements) {
      if (!m.projectId || m.naturaleza !== 'ingreso') continue;
      const t = map[m.projectId] || (map[m.projectId] = { pagado: 0, porPagar: 0 });
      if (m.estado === 'confirmado') t.pagado += m.valor;
      else if (m.estado === 'esperado' || m.estado === 'facturado' || m.estado === 'vencido') t.porPagar += m.valor;
    }
    return map;
  }, [movements]);

  const tienePendiente = (projId: string) => (projTotals[projId]?.porPagar || 0) > 0;

  const matchesFilter = (p: typeof projects[number], filtro: StatusFilter) => {
    if (filtro === 'todos')          return true;
    if (filtro === 'completados')    return p.status === 'completed';
    if (filtro === 'pendientesPago') return tienePendiente(p.id);
    const v = getVigencia(p.startDate, p.durationMonths);
    if (filtro === 'activos')        return p.status === 'active' && (!v || v.daysLeft > 30);
    if (filtro === 'porVencer')      return v != null && v.daysLeft >= 0 && v.daysLeft <= 30;
    if (filtro === 'vencidos')       return v != null && v.daysLeft < 0;
    return true;
  };

  const visibleProjects = activeProjects.filter(p => matchesFilter(p, filterStatus));

  // ── KPIs de la vista: cambian según el filtro seleccionado ──
  const vista = useMemo(() => {
    const pagado   = visibleProjects.reduce((s, p) => s + (projTotals[p.id]?.pagado || 0), 0);
    const porPagar = visibleProjects.reduce((s, p) => s + (projTotals[p.id]?.porPagar || 0), 0);
    const conIngresos = visibleProjects
      .map(p => rentMap[p.id])
      .filter(r => r && r.ingresos > 0);
    const rentProm = conIngresos.length
      ? conIngresos.reduce((s, r) => s + (r!.margen ?? 0), 0) / conIngresos.length
      : 0;
    return { pagado, porPagar, esperado: pagado + porPagar, rentProm };
  }, [visibleProjects, projTotals, rentMap]);

  const getClient = (id: string) => clients.find(c => c.id === id);
  const fmtDate   = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtShort  = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  const donutData = rentabilidad.slice(0, 6).map((r, i) => ({
    label: r.nombre, value: r.ingresos, color: COLORS[i % COLORS.length],
  }));

  const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingProjectId(projectId);
  };

  const confirmDeleteProject = async () => {
    if (!deletingProjectId) return;
    setDeleting(true);
    try {
      // 0a. Desligar payments → ledger (payments.ledger_movement_id)
      const { error: e0a } = await supabase
        .from('payments')
        .update({ ledger_movement_id: null })
        .eq('project_id', deletingProjectId);
      if (e0a) throw new Error('Desligar payments→ledger: ' + e0a.message);

      // 0b. Desligar ledger → payments (ledger_movements.payment_id)
      const { error: e0b } = await supabase
        .from('ledger_movements')
        .update({ payment_id: null })
        .eq('project_id', deletingProjectId);
      if (e0b) throw new Error('Desligar ledger→payments: ' + e0b.message);

      // 1. Borrar movimientos no confirmados
      const { error: e1 } = await supabase
        .from('ledger_movements')
        .delete()
        .eq('project_id', deletingProjectId)
        .in('estado', ['esperado', 'facturado', 'vencido']);
      if (e1) throw new Error('Movimientos proyectados: ' + e1.message);

      // 2. Desasociar movimientos confirmados (mantienen el ingreso pero sin proyecto)
      const { error: e2 } = await supabase
        .from('ledger_movements')
        .update({ project_id: null, client_id: null })
        .eq('project_id', deletingProjectId);
      if (e2) throw new Error('Desasociar confirmados: ' + e2.message);

      // 3. Borrar pagos del proyecto
      const { error: e3 } = await supabase
        .from('payments')
        .delete()
        .eq('project_id', deletingProjectId);
      if (e3) throw new Error('Pagos: ' + e3.message);

      // 4. Borrar el proyecto
      const { error: e4 } = await supabase
        .from('projects')
        .delete()
        .eq('id', deletingProjectId);
      if (e4) throw new Error('Proyecto: ' + e4.message);

      setDeletingProjectId(null);
      refetch();
    } catch (err: unknown) {
      alert('Error al eliminar: ' + (err instanceof Error ? err.message : String(err)));
      setDeletingProjectId(null);
    } finally {
      setDeleting(false);
    }
  };

  const setOrigenProyecto = async (projectId: string, origen: string) => {
    const { error } = await supabase.from('projects').update({ origen: origen || null }).eq('id', projectId);
    if (error) {
      alert(error.code === '42703'
        ? 'Falta la columna origen en proyectos: ejecuta supabase-origen-proyectos.sql en Supabase.'
        : 'Error: ' + error.message);
      return;
    }
    refetch();
  };

  const markAsPaid = async (movId: string, amount: number) => {
    setMarkingId(movId);
    try {
      const today = hoyISO();
      const mesActual = MESES_ES[new Date().getMonth()];
      // Actualizar el movimiento directamente
      await supabase.from('ledger_movements').update({
        estado: 'confirmado', valor: amount, fecha: today, mes: mesActual,
      }).eq('id', movId);
      // Sincronizar payment vinculado si existe
      const mov = movements.find(m => m.id === movId);
      if (mov?.paymentId) {
        await supabase.from('payments').update({ status: 'paid', actual_amount: amount }).eq('id', mov.paymentId);
      }
      setConfirmingPayment(null);
      refetch();
    } finally { setMarkingId(null); }
  };

  // ── Métricas globales ────────────────────────────────────
  const topByMargen = [...rentabilidad]
    .filter(r => r.ingresos > 0)
    .sort((a, b) => (b.margen ?? 0) - (a.margen ?? 0));

  const avgMargen = topByMargen.length
    ? topByMargen.reduce((s, r) => s + (r.margen ?? 0), 0) / topByMargen.length
    : 0;

  const totalUtilidad = rentabilidad.reduce((s, r) => s + r.utilidad, 0);
  const totalGastos   = rentabilidad.reduce((s, r) => s + r.gastos, 0);

  // Proyectos por vencer en 30 días
  const porVencer = activeProjects.filter(p => {
    const v = getVigencia(p.startDate, p.durationMonths);
    return v && v.daysLeft >= 0 && v.daysLeft <= 30;
  });

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header — el botón de crear proyecto solo aplica en la pestaña Proyectos */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Proyectos y Clientes</h1>
        {tab === 'proyectos' && (
          <button className="btn btn-primary" onClick={() => setShowAddProject(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.2rem' }}>
            <Plus size={16} /> Nuevo Proyecto
          </button>
        )}
      </div>

      {/* KPIs — reaccionan al filtro seleccionado */}
      {tab !== 'clientes' && (
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.875rem' }}>
        {[
          { label: 'Rentabilidad Prom.', value: (vista.rentProm * 100).toFixed(0) + '%', color: vista.rentProm >= 0.3 ? '#10b981' : vista.rentProm >= 0.1 ? '#f59e0b' : '#ef4444', hint: `${visibleProjects.length} proyecto(s) en vista` },
          { label: 'Total Recibido',     value: fmtK(vista.pagado),   color: '#10b981', hint: undefined },
          { label: 'Por Pagar',          value: fmtK(vista.porPagar), color: '#06b6d4', hint: undefined },
          { label: 'Total Esperado',     value: fmtK(vista.esperado), color: '#fff',    hint: 'recibido + por pagar' },
          { label: 'MRR',                value: fmtK(mrr),            color: '#a855f7', hint: '/mes' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
            {s.hint && <span style={{ fontSize: '0.62rem', color: '#52525b', marginTop: '0.1rem', display: 'block' }}>{s.hint}</span>}
          </div>
        ))}
      </div>
      )}

      {/* Alerta proyectos por vencer */}
      {porVencer.length > 0 && (
        <div style={{ background: '#111', border: '1px solid #f59e0b44', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertTriangle size={16} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span style={{ fontSize: '0.82rem', color: '#f59e0b' }}>
            {porVencer.length} proyecto(s) vencen en los próximos 30 días: {porVencer.map(p => p.name).join(', ')}
          </span>
        </div>
      )}

      {/* Filtros de estado */}
      {tab === 'proyectos' && (
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {([
            { id: 'todos',          label: '📋 Todos',              count: activeProjects.length },
            { id: 'activos',        label: '🟢 Activos',            count: activeProjects.filter(p => matchesFilter(p, 'activos')).length },
            { id: 'porVencer',      label: '⚠️ Por vencer',         count: activeProjects.filter(p => matchesFilter(p, 'porVencer')).length },
            { id: 'vencidos',       label: '🔴 Vencidos',           count: activeProjects.filter(p => matchesFilter(p, 'vencidos')).length },
            { id: 'pendientesPago', label: '💰 Pendientes de Pago', count: activeProjects.filter(p => matchesFilter(p, 'pendientesPago')).length },
            { id: 'completados',    label: '✅ Completados',        count: activeProjects.filter(p => p.status === 'completed').length },
          ] as { id: StatusFilter; label: string; count: number }[]).map(f => (
            <button key={f.id} onClick={() => setFilterStatus(f.id)}
              style={{ padding: '0.35rem 0.875rem', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 600, border: `1px solid ${filterStatus === f.id ? '#fff' : '#2a2a2a'}`, background: filterStatus === f.id ? '#fff' : 'transparent', color: filterStatus === f.id ? '#000' : '#71717a', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
              {f.label} {f.count > 0 && <span style={{ fontSize: '0.7rem' }}>({f.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.375rem', background: '#111', padding: '0.25rem', borderRadius: '10px', width: 'fit-content' }}>
        {(['proyectos', 'clientes', 'metricas'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#000' : '#71717a', transition: 'all 0.15s' }}>
            {t === 'proyectos' ? '📂 Proyectos' : t === 'clientes' ? '👥 Clientes' : '📊 Métricas & Rentabilidad'}
          </button>
        ))}
      </div>

      {/* ── TAB: CLIENTES ──────────────────────────────── */}
      {tab === 'clientes' && <ClientesSection />}

      {/* ── TAB: PROYECTOS ─────────────────────────────── */}
      {tab === 'proyectos' && (
        <div className="resp-grid-proj-main" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: '1.5rem', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {visibleProjects.map(proj => {
              const client       = getClient(proj.clientId);
              const paid           = movements.filter(m => m.projectId === proj.id && m.naturaleza === 'ingreso' && m.estado === 'confirmado').reduce((s, m) => s + m.valor, 0);
              const projMovements  = movements.filter(m => m.projectId === proj.id && m.naturaleza === 'ingreso').sort((a, b) => a.fecha.localeCompare(b.fecha));
              const projGastos     = movements.filter(m => m.projectId === proj.id && m.naturaleza === 'egreso').sort((a, b) => b.fecha.localeCompare(a.fecha));
              const nextMovement   = projMovements.find(m => m.estado === 'esperado');
              const pct          = proj.totalAmount > 0 ? (paid / proj.totalAmount) * 100 : 0;
              const ren          = rentMap[proj.id];
              const st           = statusLabel[proj.status] || { label: proj.status, color: '#71717a' };
              const isOpen       = expanded === proj.id;
              const vigencia     = getVigencia(proj.startDate, proj.durationMonths);
              const endDate      = getEndDate(proj.startDate, proj.durationMonths);

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
                        {vigencia && (
                          <span style={{ fontSize: '0.68rem', background: `${vigencia.color}15`, color: vigencia.color, padding: '0.15rem 0.5rem', borderRadius: '999px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={9} />
                            {vigencia.label}
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#71717a', fontSize: '0.8rem', marginTop: '0.15rem' }}>{client?.name}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <button onClick={e => { e.stopPropagation(); setEditingProject(proj); }}
                        style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.3rem' }} title="Editar">
                        <Pencil size={14} />
                      </button>
                      <button onClick={e => handleDeleteProject(proj.id, e)}
                        style={{ background: 'none', border: 'none', color: '#ef444455', cursor: 'pointer', padding: '0.3rem' }} title="Eliminar proyecto">
                        <Trash2 size={14} />
                      </button>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{fmtK(proj.totalAmount)}</div>
                        {nextMovement && (
                          <div style={{ fontSize: '0.72rem', color: '#06b6d4' }}>
                            Próx: {fmt(nextMovement.valor)} · {fmtShort(nextMovement.fecha)}
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

                  {/* Barra de vigencia */}
                  {proj.startDate && proj.durationMonths > 0 && (() => {
                    const vigPct  = getVigenciaPct(proj.startDate, proj.durationMonths);
                    const vigColor = vigencia?.color || '#10b981';
                    const endD    = endDate ? endDate.toISOString().split('T')[0] : null;
                    return (
                      <>
                        <div style={{ height: '3px', background: '#222', borderRadius: '999px', overflow: 'hidden', marginTop: '0.5rem' }}>
                          <div style={{ height: '100%', width: `${vigPct}%`, background: vigColor, borderRadius: '999px', opacity: 0.7, transition: 'width 0.4s' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#52525b', marginTop: '0.2rem' }}>
                          <span>Inicio: {fmtShort(proj.startDate)}</span>
                          <span style={{ color: vigColor }}>Vigencia: {vigPct.toFixed(0)}%</span>
                          <span>Fin: {endD ? fmtShort(endD) : '—'}</span>
                        </div>
                      </>
                    );
                  })()}

                  {/* Detalle expandido */}
                  {isOpen && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #1a1a1a' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

                        {/* P&L */}
                        {ren && (
                          <div style={{ background: '#0a0a0a', borderRadius: '10px', padding: '0.875rem' }}>
                            <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>P&L del Proyecto</div>
                            {[
                              { l: 'Ingresos', v: ren.ingresos, c: '#10b981' },
                              { l: 'Gastos',   v: ren.gastos,   c: '#ef4444' },
                              { l: 'Utilidad', v: ren.utilidad, c: ren.utilidad >= 0 ? '#10b981' : '#ef4444' },
                            ].map(r => (
                              <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}>
                                <span style={{ fontSize: '0.8rem', color: '#71717a' }}>{r.l}</span>
                                <span style={{ fontSize: '0.8rem', color: r.c, fontWeight: 700 }}>{fmt(r.v)}</span>
                              </div>
                            ))}
                            {ren.margen != null && (
                              <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Margen</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 800, color: ren.margen >= 0.3 ? '#10b981' : ren.margen >= 0.1 ? '#f59e0b' : '#ef4444' }}>
                                  {(ren.margen * 100).toFixed(1)}%
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Info + Vigencia */}
                        <div style={{ background: '#0a0a0a', borderRadius: '10px', padding: '0.875rem' }}>
                          <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Info & Vigencia</div>
                          <div style={{ fontSize: '0.8rem', color: '#a0aec0' }}>Plan: {proj.plan}</div>
                          <div style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.25rem' }}>Email: {client?.email || '—'}</div>
                          <div style={{ height: '1px', background: '#1a1a1a', margin: '0.5rem 0' }} />
                          <div style={{ fontSize: '0.75rem', color: '#71717a' }}>
                            Inicio: <span style={{ color: '#fff' }}>{proj.startDate ? fmtDate(proj.startDate) : '—'}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.2rem' }}>
                            Fin vigencia: <span style={{ color: '#fff' }}>{endDate ? fmtDate(endDate.toISOString().split('T')[0]) : '—'}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.2rem' }}>
                            Duración: <span style={{ color: '#fff' }}>{proj.durationMonths} {proj.durationMonths === 1 ? 'mes' : 'meses'}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Origen:</span>
                            <select value={proj.origen || ''} onChange={e => setOrigenProyecto(proj.id, e.target.value)}
                              style={{ background: '#1a1a1a', border: '1px solid #333', color: proj.origen ? ORIGEN_LABELS[proj.origen].color : '#71717a', padding: '0.25rem 0.4rem', borderRadius: '6px', fontSize: '0.72rem', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                              <option value="">❔ Sin asignar</option>
                              <option value="campanas">📣 Campañas</option>
                              <option value="referido">🤝 Referido</option>
                              <option value="organico">🌱 Orgánico</option>
                            </select>
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#3f3f46', marginTop: '0.2rem' }}>
                            Si es renovación, márcala distinto del origen del cliente para no inflar el ROAS.
                          </div>
                          {vigencia && (
                            <div style={{ marginTop: '0.5rem', padding: '0.35rem 0.6rem', background: `${vigencia.color}15`, borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, color: vigencia.color }}>
                              {vigencia.label}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Cuotas — fuente de verdad: movimientos */}
                      <div style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
                        Cuotas ({projMovements.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {projMovements.length === 0 && (
                          <div style={{ fontSize: '0.8rem', color: '#52525b', padding: '0.75rem', textAlign: 'center' }}>
                            Sin movimientos vinculados. Crea el proyecto con cuotas para generarlos automáticamente.
                          </div>
                        )}
                        {projMovements.map((m, idx) => {
                          const isPaid    = m.estado === 'confirmado';
                          const isWaiting = m.estado === 'esperado';
                          const statusColor = isPaid ? '#10b981' : '#f59e0b';
                          const statusBg    = isPaid ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)';
                          const statusText  = isPaid ? 'Cobrado' : 'Esperado';
                          return (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#52525b', minWidth: '18px' }}>#{idx + 1}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color: statusColor, background: statusBg, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                                  {statusText}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#71717a' }}>{fmtShort(m.fecha)}</span>
                                {m.descripcion && (
                                  <span style={{ fontSize: '0.72rem', color: '#52525b', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion}>
                                    {m.descripcion}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontWeight: 700, color: isPaid ? '#10b981' : '#fff', fontSize: '0.85rem' }}>
                                  {fmt(m.valor)}
                                </span>
                                {isWaiting && (
                                  <button
                                    onClick={() => { setConfirmingPayment({ movId: m.id, projectId: proj.id }); setConfirmAmount(String(Math.round(m.valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')); }}
                                    disabled={markingId === m.id}
                                    style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '6px', padding: '0.25rem 0.6rem', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                                    {markingId === m.id ? '...' : '✓ Cobrado'}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Gastos del proyecto — fuente de verdad: movimientos */}
                      <div style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, margin: '1rem 0 0.5rem' }}>
                        Gastos relacionados ({projGastos.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {projGastos.length === 0 && (
                          <div style={{ fontSize: '0.8rem', color: '#52525b', padding: '0.5rem', textAlign: 'center' }}>
                            Sin gastos asignados. Regístralos desde Movimientos eligiendo este proyecto.
                          </div>
                        )}
                        {projGastos.map(g => (
                          <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#0a0a0a', borderRadius: '8px', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: g.estado === 'confirmado' ? '#ef4444' : '#f59e0b', background: g.estado === 'confirmado' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', padding: '0.15rem 0.5rem', borderRadius: '999px', flexShrink: 0 }}>
                                {g.estado === 'confirmado' ? 'Pagado' : 'Por pagar'}
                              </span>
                              <span style={{ fontSize: '0.78rem', color: '#71717a', flexShrink: 0 }}>{fmtShort(g.fecha)}</span>
                              <span style={{ fontSize: '0.78rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.descripcion}>
                                {g.descripcion}
                              </span>
                              {g.categoria && (
                                <span style={{ fontSize: '0.68rem', color: '#52525b', flexShrink: 0 }}>· {g.categoria}</span>
                              )}
                            </div>
                            <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.85rem', flexShrink: 0 }}>−{fmt(g.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {visibleProjects.length === 0 && (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#52525b', border: '1px dashed #222', borderRadius: '12px' }}>
                {activeProjects.length === 0 ? 'Sin proyectos. Crea uno usando el botón de arriba.' : 'Sin proyectos con el filtro seleccionado.'}
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
      )}

      {/* ── TAB: MÉTRICAS ──────────────────────────────── */}
      {tab === 'metricas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* KPIs globales */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
            {[
              { label: 'Utilidad Total',   value: fmtK(totalUtilidad), color: totalUtilidad >= 0 ? '#10b981' : '#ef4444' },
              { label: 'Gastos Asignados', value: fmtK(totalGastos),   color: '#ef4444' },
              { label: 'Margen Promedio',  value: (avgMargen * 100).toFixed(1) + '%', color: avgMargen >= 0.3 ? '#10b981' : avgMargen >= 0.1 ? '#f59e0b' : '#ef4444' },
            ].map(s => (
              <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Ranking de proyectos por margen */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Trophy size={16} style={{ color: '#f59e0b' }} />
              <h3 style={{ color: '#fff', fontWeight: 700 }}>Ranking por Rentabilidad</h3>
            </div>
            {topByMargen.length === 0 ? (
              <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1rem' }}>
                Sin datos. Registra movimientos vinculados a proyectos para ver rentabilidad.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {topByMargen.map((r, i) => {
                  const proj    = projects.find(p => p.id === r.projectId);
                  const margenPct = (r.margen ?? 0) * 100;
                  const color   = margenPct >= 30 ? '#10b981' : margenPct >= 10 ? '#f59e0b' : '#ef4444';
                  const vigencia = proj ? getVigencia(proj.startDate, proj.durationMonths) : null;
                  return (
                    <div key={r.projectId} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.875rem 1rem', background: '#0a0a0a', borderRadius: '10px' }}>
                      {/* Posición */}
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: i < 3 ? ['#f59e0b22','#71717a22','#f97316222'][i] : '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.85rem', color: i < 3 ? ['#f59e0b','#71717a','#f97316'][i] : '#52525b', flexShrink: 0 }}>
                        {i + 1}
                      </div>
                      {/* Info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.88rem' }}>{r.nombre}</span>
                          <span style={{ fontSize: '0.7rem', color: '#71717a' }}>{r.cliente}</span>
                          {vigencia && (
                            <span style={{ fontSize: '0.65rem', color: vigencia.color }}>{vigencia.label}</span>
                          )}
                        </div>
                        {/* Barra de margen */}
                        <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, Math.max(0, margenPct))}%`, background: color, borderRadius: '999px' }} />
                        </div>
                      </div>
                      {/* Números */}
                      <div style={{ textAlign: 'right', minWidth: '120px' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 800, color }}>
                          {margenPct.toFixed(1)}% margen
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#52525b' }}>
                          Ing: {fmtK(r.ingresos)} · Gas: {fmtK(r.gastos)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: r.utilidad >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                          Util: {fmtK(r.utilidad)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Vigencias */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Clock size={16} style={{ color: '#06b6d4' }} />
              <h3 style={{ color: '#fff', fontWeight: 700 }}>Estado de Vigencias</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {activeProjects.map(proj => {
                const vigencia = getVigencia(proj.startDate, proj.durationMonths);
                const endDate  = getEndDate(proj.startDate, proj.durationMonths);
                const client   = getClient(proj.clientId);
                if (!vigencia) return null;
                return (
                  <div key={proj.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.875rem', background: '#0a0a0a', borderRadius: '8px' }}>
                    <div>
                      <div style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{proj.name}</div>
                      <div style={{ color: '#71717a', fontSize: '0.72rem' }}>{client?.name} · {proj.durationMonths}m</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.72rem', color: '#71717a' }}>
                        {proj.startDate ? fmtShort(proj.startDate) : '—'} → {endDate ? fmtShort(endDate.toISOString().split('T')[0]) : '—'}
                      </div>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: vigencia.color }}>{vigencia.label}</div>
                    </div>
                  </div>
                );
              })}
              {activeProjects.length === 0 && (
                <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1rem' }}>Sin proyectos activos.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modales */}
      <AddProjectModal clients={clients} isOpen={showAddProject}
        onClose={() => setShowAddProject(false)}
        onSuccess={() => { setShowAddProject(false); refetch(); }} />

      {editingProject && (
        <EditProjectModal project={editingProject} clients={clients} isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          onSuccess={() => { setEditingProject(null); refetch(); }} />
      )}

      {/* Modal confirmación eliminar proyecto */}
      {deletingProjectId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '360px', border: '1px solid #ef444444', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Trash2 size={20} color="#ef4444" />
              <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>Eliminar proyecto</span>
            </div>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
              Se borrarán todos los cobros pendientes y movimientos proyectados.<br />
              Los ingresos ya <strong style={{ color: '#10b981' }}>confirmados</strong> quedarán en el registro sin proyecto asignado.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => setDeletingProjectId(null)}
                disabled={deleting}
                style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: '1px solid #333', background: 'transparent', color: '#a1a1aa', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, fontSize: '0.85rem' }}>
                Cancelar
              </button>
              <button
                onClick={confirmDeleteProject}
                disabled={deleting}
                style={{ flex: 1, padding: '0.65rem', borderRadius: '8px', border: 'none', background: '#ef4444', color: '#fff', cursor: deleting ? 'default' : 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmingPayment && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '340px', border: '1px solid #333' }}>
            <h3 style={{ color: '#fff', fontWeight: 800, textAlign: 'center', marginBottom: '1rem' }}>Confirmar cobro</h3>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Monto real recibido (COP)</label>
              <input type="text" inputMode="numeric" autoFocus
                value={confirmAmount}
                onChange={e => setConfirmAmount(fmtInput(e.target.value))}
                style={{ width: '100%', background: '#111', border: '1px solid #fff', color: '#fff', padding: '0.75rem', borderRadius: '8px', fontSize: '1.2rem', fontWeight: 700, fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setConfirmingPayment(null)} className="btn btn-outline" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={() => markAsPaid(confirmingPayment.movId, Number(confirmAmount.replace(/\./g, '')))}
                className="btn btn-primary" style={{ flex: 1 }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
