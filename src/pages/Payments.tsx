import React, { useState } from 'react';
import { CheckCircle2, History, AlertCircle, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { AddPaymentModal } from '../components/AddPaymentModal';

export const Payments: React.FC = () => {
  const { clients, projects, payments, loading, refetch } = useSupabaseData();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState<any>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [markingId, setMarkingId] = useState<string | null>(null);

  const handleDeletePayment = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este registro de pago?')) return;
    setDeletingId(id);
    const { error } = await supabase.from('payments').delete().eq('id', id);
    if (error) alert('Error: ' + error.message);
    setDeletingId(null);
    refetch();
  };

  const formatCOP = (val: string) => {
    const numeric = val.replace(/\D/g, "");
    return numeric.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handleConfirmAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmAmount(formatCOP(e.target.value));
  };

  const markAsPaid = async (paymentId: string, actualAmount: number) => {
    setMarkingId(paymentId);
    try {
      const { error } = await supabase.from('payments').update({ 
        status: 'paid',
        actual_amount: actualAmount
      }).eq('id', paymentId);

      if (error) throw error;

      setConfirmingPayment(null);
      refetch();
    } catch (err: any) {
      console.error('Error marking payment as paid:', err);
      alert(`Error al registrar pago: ${err.message || 'Verifica la conexión con la base de datos'}`);
    } finally {
      setMarkingId(null);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('⚠️ ATENCIÓN: ¿Seguro que quieres borrar todo este PROYECTO? Se perderá todo su historial de pagos para siempre.')) return;
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) {
      alert('Error eliminando proyecto: ' + error.message);
    } else {
      setSelectedProject(null);
      refetch();
    }
  };

  if (loading) return <div className="p-8 flex justify-center text-main">Consultando base de datos...</div>;

  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Desconocido';

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const activeProject = projects.find(p => p.id === selectedProject);
  const activePayments = payments.filter(p => p.projectId === selectedProject);
  const activePaid = activePayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.actualAmount || p.amount), 0);
  const activePending = activePayments.filter(p => p.status !== 'paid').reduce((acc, p) => acc + p.amount, 0);

  return (
    <div className="flex-col gap-6" style={{ display: 'flex' }}>
      <header className="flex justify-between items-center mb-6">
        <div className={selectedProject ? 'mobile-hide' : ''}>
          <h1 className="text-4xl font-bold text-highlight">Pagos y Cobranzas</h1>
          <p className="text-main mt-1">Gestión de cuotas y balances financieros.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className={`btn btn-primary ${selectedProject ? 'mobile-hide' : ''}`}>
          Registrar Abono
        </button>
      </header>
      
      <AddPaymentModal 
        isOpen={isModalOpen} 
        onClose={() => setModalOpen(false)} 
        onSuccess={refetch} 
        projects={projects} 
        clients={clients}
      />

      <div className="grid grid-cols-2 gap-8">
        {/* Left Column: Projects Selection */}
        <div className={`flex-col gap-4 ${selectedProject ? 'mobile-hide' : 'flex'}`}>
          <h2 className="text-xl font-bold text-primary px-2 mb-2">Seleccionar Proyecto</h2>
          <div className="flex-col gap-3" style={{ display: 'flex' }}>
            {projects.map(project => {
              const projectPayments = payments.filter(p => p.projectId === project.id);
              const totalPaid = projectPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.actualAmount || p.amount), 0);
              const progress = Math.min(100, (totalPaid / project.totalAmount) * 100);
              const isSelected = selectedProject === project.id;
              
              return (
                <div 
                  key={project.id} 
                  className={`project-card card ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedProject(project.id)}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="font-bold text-highlight text-lg">{project.name}</div>
                      <div className="text-xs text-main uppercase tracking-wider">{getClientName(project.clientId)}</div>
                    </div>
                    <button 
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="text-danger opacity-50 hover:opacity-100 p-1"
                      title="Eliminar Proyecto"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-main">Progreso de Pago</span>
                    <span className="text-primary font-bold">{Math.round(progress)}%</span>
                  </div>
                  <div className="progress-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Detail View */}
        <div className={`flex-col ${selectedProject ? 'flex' : 'mobile-hide'}`}>
          {selectedProject && activeProject ? (
            <div className="flex-col gap-6" style={{ display: 'flex' }}>
              <div className="flex items-center gap-4 mb-4">
                <button 
                  onClick={() => setSelectedProject(null)} 
                  className="mobile-show btn btn-outline"
                  style={{ padding: '0.4rem 0.8rem' }}
                >
                  ← Volver
                </button>
                <div>
                  <h2 className="text-2xl font-bold text-highlight">{activeProject.name}</h2>
                  <span className="badge badge-success mt-1">Proyecto Activo</span>
                </div>
              </div>

              {/* Financial Quick Summary */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="p-3 bg-panel-bg rounded-lg border border-panel-border text-center">
                  <div className="text-[10px] text-main uppercase">Total</div>
                  <div className="font-bold text-highlight text-sm">${Math.round(activeProject.totalAmount).toLocaleString('es-CO')}</div>
                </div>
                <div className="p-3 bg-panel-bg rounded-lg border border-panel-border text-center">
                  <div className="text-[10px] text-success uppercase">Pagado</div>
                  <div className="font-bold text-success text-sm">${Math.round(activePaid).toLocaleString('es-CO')}</div>
                </div>
                <div className="p-3 bg-panel-bg rounded-lg border border-panel-border text-center">
                  <div className="text-[10px] text-warning uppercase">Pendiente</div>
                  <div className="font-bold text-warning text-sm">${Math.round(activePending).toLocaleString('es-CO')}</div>
                </div>
              </div>
              
              <div className="flex-col gap-3" style={{ display: 'flex' }}>
                <h3 className="font-bold text-primary flex items-center gap-2 mb-2">
                  <History size={18}/> Historial de Cuotas
                </h3>
                {activePayments.map((payment, index) => (
                  <div key={payment.id} className="installment-card">
                    <div className="flex items-center gap-4">
                      {payment.status === 'paid' ? (
                        <CheckCircle2 className="text-success" size={24} />
                      ) : payment.status === 'overdue' ? (
                        <AlertCircle className="text-danger" size={24} />
                      ) : (
                        <div className="w-6 h-6 rounded-full border-2 border-primary"></div>
                      )}
                      <div>
                        <div className="font-bold text-highlight">Cuota {index + 1}</div>
                        <div className="text-xs text-main">{formatDate(payment.date)}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="font-bold text-highlight text-sm">${payment.amount.toLocaleString('es-CO')}</div>
                        <div className={`text-[10px] uppercase font-bold ${payment.status === 'paid' ? 'text-success' : 'text-primary'}`}>
                          {payment.status === 'paid' ? 'Pagado' : 'Pendiente'}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        {payment.status !== 'paid' && (
                          <button 
                            onClick={() => {
                              setConfirmingPayment(payment);
                              setConfirmAmount(formatCOP(Math.round(payment.amount).toString()));
                            }} 
                            disabled={markingId === payment.id}
                            className="btn btn-primary"
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.7rem' }}
                          >
                            {markingId === payment.id ? '...' : 'Pagar'}
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeletePayment(payment.id)} 
                          disabled={deletingId === payment.id}
                          className="text-danger opacity-50 hover:opacity-100"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={`flex justify-center items-center h-full min-h-[400px] card text-main text-center opacity-50 ${selectedProject ? 'flex' : 'mobile-hide'}`}>
              <div className="flex flex-col items-center gap-4">
                <History size={48} />
                <p>Selecciona un proyecto de la lista <br/> para gestionar sus pagos.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Confirmation Modal */}
      {confirmingPayment && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '380px', border: '1px solid var(--primary-accent)' }}>
            <h3 className="text-2xl font-bold text-highlight mb-1 text-center">Confirmar Pago</h3>
            <div className="text-center mb-6">
              <p className="text-sm font-bold text-primary uppercase">{projects.find(p => p.id === confirmingPayment.projectId)?.name}</p>
              <p className="text-xs text-main">{projects.find(p => p.id === confirmingPayment.projectId)?.plan}</p>
            </div>
            <p className="text-sm text-main mb-6 text-center">Ingresa el monto neto recibido (COP).</p>
            
            <div className="mb-6">
              <input 
                type="text" 
                inputMode="numeric"
                value={confirmAmount} 
                onChange={handleConfirmAmountChange}
                autoFocus
                style={{ width: '100%', padding: '1rem', borderRadius: '12px', backgroundColor: '#000', color: '#66fcf1', border: '2px solid #66fcf1', fontSize: '1.5rem', fontWeight: 'bold', textAlign: 'center' }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button onClick={() => setConfirmingPayment(null)} className="btn btn-outline" style={{ flex: 1 }}>Cancelar</button>
              <button onClick={() => markAsPaid(confirmingPayment.id, Number(confirmAmount.replace(/\./g, "")))} className="btn btn-primary" style={{ flex: 1 }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
