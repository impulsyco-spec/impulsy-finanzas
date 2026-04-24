import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, TrendingUp, CalendarPlus, Clock } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useLedger } from '../hooks/useLedger';
import { calcKPIs, calcSemaforos } from '../hooks/useFinancials';
import { AddPaymentModal } from '../components/AddPaymentModal';
import { supabase } from '../lib/supabase';
import { GoogleCalendarButton } from '../components/GoogleCalendarButton';
import { MESES_ES } from '../types';

const MONTHS: { value: string; label: string }[] = [
  { value: '', label: 'Todos los meses' },
  { value: '2026-01', label: 'Enero 2026' },
  { value: '2026-02', label: 'Febrero 2026' },
  { value: '2026-03', label: 'Marzo 2026' },
  { value: '2026-04', label: 'Abril 2026' },
  { value: '2026-05', label: 'Mayo 2026' },
  { value: '2026-06', label: 'Junio 2026' },
  { value: '2026-07', label: 'Julio 2026' },
  { value: '2026-08', label: 'Agosto 2026' },
  { value: '2026-09', label: 'Septiembre 2026' },
  { value: '2026-10', label: 'Octubre 2026' },
  { value: '2026-11', label: 'Noviembre 2026' },
  { value: '2026-12', label: 'Diciembre 2026' },
];

const fmtCOP = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const SEM_COLORS: Record<string, string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
const SEM_ICONS: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };

export const Dashboard: React.FC = () => {
  const { clients, projects, payments, loading, refetch } = useSupabaseData();
  const { movements, realAccounts, debts, loading: loadingLedger } = useLedger();
  const [isModalOpen, setModalOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState<any>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [projectTypeFilter, setProjectTypeFilter] = useState<'all' | 'fixed' | 'mrr'>('all');

  if (loading || loadingLedger) return <div className="p-8 flex justify-center text-main">Consultando base de datos...</div>;

  const kpis = calcKPIs(movements, realAccounts, debts);
  const semaforos = calcSemaforos(kpis, movements);

  // Filter projects by type first
  const filteredProjects = projects.filter(p => {
    if (projectTypeFilter === 'all') return true;
    if (projectTypeFilter === 'mrr') return p.isRecurring;
    if (projectTypeFilter === 'fixed') return !p.isRecurring;
    return true;
  });

  const validProjectIds = new Set(filteredProjects.map(p => p.id));
  const paymentsByProjectType = payments.filter(p => validProjectIds.has(p.projectId));

  // Base payments - filter by month if selected
  const basePayments = selectedMonth
    ? paymentsByProjectType.filter(p => p.date.startsWith(selectedMonth))
    : paymentsByProjectType;

  const totalRevenue = selectedMonth
    ? basePayments.reduce((acc, p) => acc + p.amount, 0)
    : filteredProjects.reduce((acc, p) => acc + p.totalAmount, 0);
  const paidAmount = basePayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.actualAmount ?? p.amount), 0);
  const overdueAmount = basePayments.filter(p => p.status === 'overdue').reduce((acc, p) => acc + p.amount, 0);
  const pendingAmount = basePayments.filter(p => p.status === 'pending').reduce((acc, p) => acc + p.amount, 0);

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Desconocido';

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    // Use T12:00:00 to prevent timezone shift when parsing YYYY-MM-DD
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const markAsPaid = async (paymentId: string, actualAmount: number) => {
    setMarkingId(paymentId);
    try {
      const payment = payments.find(p => p.id === paymentId);
      const project = projects.find(p => p.id === payment?.projectId);

      // 1. Mark payment as paid
      const { error } = await supabase.from('payments').update({
        status: 'paid',
        actual_amount: actualAmount,
      }).eq('id', paymentId);
      if (error) throw error;

      // 2. Auto-create ledger movement (ingreso_operativo confirmado)
      const boldAccount = realAccounts.find(a =>
        a.nombre.toLowerCase().includes('bold') || a.nombre.toLowerCase().includes('impulsy')
      );
      const fechaPago = payment?.date || new Date().toISOString().split('T')[0];
      const mesIdx = new Date(fechaPago + 'T12:00:00').getMonth();

      await supabase.from('ledger_movements').insert({
        fecha: fechaPago,
        tipo_movimiento: 'ingreso_operativo',
        naturaleza: 'ingreso',
        descripcion: `Cobro: ${project?.name || 'Proyecto'}`,
        valor: actualAmount,
        categoria: 'Cobro de Cliente',
        estado: 'confirmado',
        cuenta_real_id: boldAccount?.id || null,
        project_id: payment?.projectId || null,
        mes: MESES_ES[mesIdx] || '',
        personal_flag: false,
        updated_at: new Date().toISOString(),
      });

      setConfirmingPayment(null);
      refetch();
    } catch (err: any) {
      console.error('Error marking payment as paid:', err);
      alert(`Error al registrar pago: ${err.message || 'Verifica la conexión con la base de datos'}`);
    } finally {
      setMarkingId(null);
    }
  };

  const getCalendarLink = (paymentDate: string, projectName: string, amount: number, clientEmail?: string) => {
    const dateFormatted = paymentDate.replace(/-/g, '');
    // For all-day events, the end date must be the next day
    const nextDay = new Date(paymentDate + 'T12:00:00');
    nextDay.setDate(nextDay.getDate() + 1);
    const endDateFormatted = nextDay.toISOString().split('T')[0].replace(/-/g, '');

    const title = encodeURIComponent(`Cobrar Anticipo/Cuota: ${projectName}`);
    const details = encodeURIComponent(`Recordatorio de cobro gestionado desde la App Impulsy.\nMonto a cobrar: $${amount.toLocaleString()}`);
    let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dateFormatted}/${endDateFormatted}&details=${details}`;
    if (clientEmail) {
      url += `&add=${encodeURIComponent(clientEmail)}`;
    }
    return url;
  };

  // Quick Confirmation Modal Utils
  const formatCOP = (val: string) => {
    const numeric = val.replace(/\D/g, "");
    return numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handleConfirmAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmAmount(formatCOP(e.target.value));
  };

  // Payments for the table: unpaid ones from basePayments
  const filteredPayments = basePayments.filter(p => p.status !== 'paid');
  const filteredPendingTotal = filteredPayments.reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="flex-col gap-6" style={{ display: 'flex' }}>
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-bold text-highlight">Dashboard</h1>
          <p className="text-main mt-4">Resumen financiero y pagos recientes.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <GoogleCalendarButton />
            <button onClick={() => setModalOpen(true)} className="btn btn-primary">Nuevo Abono</button>
          </div>
          {/* Project Type Filter */}
          <div style={{ display: 'flex', backgroundColor: 'var(--secondary-accent)', borderRadius: '12px', padding: '0.2rem' }}>
            <button 
              onClick={() => setProjectTypeFilter('all')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: projectTypeFilter === 'all' ? '#000' : 'var(--text-main)', backgroundColor: projectTypeFilter === 'all' ? 'var(--primary-accent)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: projectTypeFilter === 'all' ? 600 : 400 }}
            >
              Todos
            </button>
            <button 
              onClick={() => setProjectTypeFilter('fixed')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: projectTypeFilter === 'fixed' ? '#000' : 'var(--text-main)', backgroundColor: projectTypeFilter === 'fixed' ? 'var(--primary-accent)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: projectTypeFilter === 'fixed' ? 600 : 400 }}
            >
              Normales
            </button>
            <button 
              onClick={() => setProjectTypeFilter('mrr')}
              style={{ padding: '0.4rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', color: projectTypeFilter === 'mrr' ? '#000' : 'var(--text-main)', backgroundColor: projectTypeFilter === 'mrr' ? 'var(--primary-accent)' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: projectTypeFilter === 'mrr' ? 600 : 400 }}
            >
              MRR
            </button>
          </div>
        </div>
      </header>
      
      {/* Quick Confirmation Modal */}
      {confirmingPayment && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
          <div className="card" style={{ width: '350px', border: '1px solid var(--primary-accent)' }}>
            <h3 className="text-xl font-bold text-highlight mb-1 text-center">Confirmar Monto Real</h3>
            <div className="text-center mb-4">
              <p className="text-sm font-bold text-primary uppercase">{projects.find(p => p.id === confirmingPayment.projectId)?.name}</p>
              <p className="text-xs text-main">{projects.find(p => p.id === confirmingPayment.projectId)?.plan}</p>
            </div>
            <p className="text-xs text-main mb-4 text-center">Ingresa el monto neto recibido (tras comisiones o ajustes de TRM).</p>
            
            <div className="mb-4">
              <label className="text-xs text-primary font-bold mb-1 block">Monto en COP</label>
              <input 
                type="text" 
                inputMode="numeric"
                value={confirmAmount} 
                onChange={handleConfirmAmountChange}
                autoFocus
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: '#111', color: '#66fcf1', border: '1px solid #66fcf1', fontSize: '1.25rem', fontWeight: 'bold' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setConfirmingPayment(null)} 
                className="btn btn-outline"
                style={{ flex: 1 }}
              >
                Cancelar
              </button>
              <button 
                onClick={() => markAsPaid(confirmingPayment.id, Number(confirmAmount.replace(/\./g, "")))}
                className="btn btn-primary"
                style={{ flex: 1 }}
              >
                Confirmar Pago
              </button>
            </div>
          </div>
        </div>
      )}

      <AddPaymentModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} onSuccess={refetch} projects={projects} clients={clients} />

      {/* Financial semaphores strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.625rem' }}>
        {semaforos.map(s => (
          <div key={s.id} className="card" style={{ padding: '0.75rem 1rem', borderColor: `${SEM_COLORS[s.estado]}33`, background: `${SEM_COLORS[s.estado]}08`, minHeight: 'auto' }}>
            <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.6rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.4px', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: '0.85rem' }}>{SEM_ICONS[s.estado]}</span>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: SEM_COLORS[s.estado] }}>{s.valor}</div>
            <div style={{ fontSize: '0.65rem', color: '#71717a', marginTop: '0.15rem' }}>{s.desc}</div>
          </div>
        ))}
      </div>

      {/* Caja KPIs mini-strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.625rem' }}>
        {[
          { label: 'Caja Total',    value: fmtCOP(kpis.cajaTotal),    color: '#fff' },
          { label: 'Caja Libre',    value: fmtCOP(kpis.cajaLibre),    color: kpis.cajaLibre >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Por Cobrar',    value: fmtCOP(kpis.porCobrar),    color: '#06b6d4' },
          { label: 'Utilidad YTD',  value: fmtCOP(kpis.utilidadYTD), color: kpis.utilidadYTD >= 0 ? '#10b981' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '0.875rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.1rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Stat cards — 4 columns */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="card stat-card">
          <TrendingUp size={24} className="text-primary mb-2" />
          <span className="stat-label">Ingresos Totales</span>
          <span className="stat-value">${Math.round(totalRevenue).toLocaleString('es-CO')}</span>
        </div>

        <div className="card stat-card success">
          <CheckCircle2 size={24} className="text-success mb-2" />
          <span className="stat-label" style={{ color: 'var(--success)' }}>Pagos Recibidos</span>
          <span className="stat-value text-success">${Math.round(paidAmount).toLocaleString('es-CO')}</span>
        </div>

        <div className="card stat-card">
          <Clock size={24} style={{ color: '#f59e0b', marginBottom: '0.5rem' }} />
          <span className="stat-label" style={{ color: '#f59e0b' }}>Pagos Faltantes</span>
          <span className="stat-value" style={{ color: '#f59e0b' }}>${Math.round(pendingAmount).toLocaleString('es-CO')}</span>
          <div style={{ fontSize: '0.65rem', color: '#71717a', marginTop: '0.2rem', fontWeight: 'bold' }}>
            {payments.filter(p => p.status === 'pending').length} CUOTA(S) PENDIENTE(S)
          </div>
        </div>

        <div className="card stat-card">
          <AlertCircle size={24} className="text-danger mb-2" />
          <span className="stat-label" style={{ color: 'var(--danger)' }}>Pagos Atrasados</span>
          <span className="stat-value text-danger">${Math.round(overdueAmount).toLocaleString('es-CO')}</span>
        </div>
      </div>

      {/* Payments section */}
      <div className="card" style={{ padding: 0 }}>
        {/* Header + filter */}
        <div style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid #2d3748' }}>
          <div>
            <h2 className="text-2xl font-semibold text-highlight">Próximos Cobros y Atrasos</h2>
            {selectedMonth && (
              <p style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.2rem' }}>
                Total filtrado: <strong style={{ color: '#f6ad55' }}>${filteredPendingTotal.toLocaleString()}</strong>
              </p>
            )}
          </div>
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            style={{
              background: 'var(--secondary-accent)', color: 'white', border: '1px solid var(--panel-border)',
              borderRadius: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem', cursor: 'pointer'
            }}
          >
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>

        {/* MOBILE: Card list */}
        <div className="payment-cards-mobile">
          {filteredPayments.map(payment => {
            const project = projects.find(p => p.id === payment.projectId);
            const client = clients.find(c => c.id === project?.clientId);
            return (
              <div key={payment.id} style={{ borderTop: '1px solid #2d3748', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="font-semibold text-highlight" style={{ fontSize: '0.95rem' }}>{project?.name}</span>
                  {payment.status === 'overdue'
                    ? <span className="badge badge-danger">Atrasado</span>
                    : <span className="badge badge-warning">Pendiente</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: '#a0aec0' }}>{project ? getClientName(project.clientId) : ''}</span>
                  <span style={{ color: '#a0aec0' }}>📅 {formatDate(payment.date)}</span>
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'white' }}>
                  ${payment.amount.toLocaleString()} COP
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    onClick={() => {
                      setConfirmingPayment(payment);
                      setConfirmAmount(formatCOP(Math.round(payment.amount).toString()));
                    }} 
                    disabled={markingId === payment.id} 
                    className="btn btn-primary" 
                    style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                  >
                    {markingId === payment.id ? '...' : '✅ Marcar Pagado'}
                  </button>
                  <a href={getCalendarLink(payment.date, project?.name || 'Proyecto', payment.amount, client?.email)} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                    <CalendarPlus size={14} />
                  </a>
                </div>
              </div>
            );
          })}
          {filteredPayments.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#a0aec0' }}>
              {selectedMonth ? 'No hay cobros para este mes 🎉' : 'No hay cobros pendientes 🎉'}
            </div>
          )}
        </div>

        {/* DESKTOP: Table */}
        <div className="payment-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Estado</th>
                <th>Proyecto / Cliente</th>
                <th>Fecha de Cobro</th>
                <th>Monto</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map(payment => {
                const project = projects.find(p => p.id === payment.projectId);
                const client = clients.find(c => c.id === project?.clientId);
                return (
                  <tr key={payment.id}>
                    <td>
                      {payment.status === 'overdue'
                        ? <span className="badge badge-danger">Atrasado</span>
                        : <span className="badge badge-warning">Pendiente</span>}
                    </td>
                    <td>
                      <div className="font-semibold text-highlight">{project?.name}</div>
                      <div className="text-sm">{project ? getClientName(project.clientId) : ''}</div>
                    </td>
                    <td>{formatDate(payment.date)}</td>
                    <td className="font-bold">${payment.amount.toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                          onClick={() => {
                            setConfirmingPayment(payment);
                            setConfirmAmount(formatCOP(Math.round(payment.amount).toString()));
                          }} 
                          disabled={markingId === payment.id} 
                          className="btn btn-primary" 
                          style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                        >
                          {markingId === payment.id ? '...' : '✅ Marcar Pagado'}
                        </button>
                        <a href={getCalendarLink(payment.date, project?.name || 'Proyecto', payment.amount, client?.email)} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          <CalendarPlus size={14} /> Calendar
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: '#a0aec0', padding: '2rem' }}>
                    {selectedMonth ? 'No hay cobros para este mes 🎉' : 'No hay cobros pendientes 🎉'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
