import React, { useState } from 'react';
import { FolderKanban, Trash2, Pencil, CalendarClock } from 'lucide-react';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { AddProjectModal } from '../components/AddProjectModal';
import { EditProjectModal } from '../components/EditProjectModal';
import { supabase } from '../lib/supabase';
import { Project } from '../types';
import { sendGHLWebhook } from '../lib/ghl';
import { createCalendarEvents, isGCalConnected } from '../hooks/useGoogleCalendar';

export const Projects: React.FC = () => {
  const { clients, projects, payments, loading, refetch } = useSupabaseData();
  const [isModalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  if (loading) return <div className="p-8 flex justify-center text-main">Consultando base de datos...</div>;
  const getClientName = (clientId: string) => clients.find(c => c.id === clientId)?.name || 'Desconocido';

  const handleDelete = async (projectId: string, projectName: string) => {
    const confirm = window.confirm(`¿Estás seguro que quieres cancelar/eliminar el proyecto "${projectName}"?\n\nLos pagos que ya tengan estado "Pagado" se conservarán en el historial. Las cuotas pendientes futuras se eliminarán.`);
    if (!confirm) return;
    setDeletingId(projectId);
    
    // 1. Delete all unpaid payments
    await supabase.from('payments').delete().eq('project_id', projectId).neq('status', 'paid');
    
    // 2. Mark project as cancelled
    await supabase.from('projects').update({ status: 'cancelled' }).eq('id', projectId);
    
    setDeletingId(null);
    refetch();
  };

  const handleGenerateInstallments = async (project: Project) => {
    // Obtener los pagos existentes de este proyecto ordenados por fecha
    const { data: existingPayments } = await supabase
      .from('payments')
      .select('id, date, status')
      .eq('project_id', project.id)
      .order('date', { ascending: false });

    const totalExisting = existingPayments?.length || 0;
    const remaining = project.installments - totalExisting;

    if (remaining <= 0) {
      alert(`Este proyecto ya tiene las ${project.installments} cuotas registradas.`);
      return;
    }

    const confirmed = window.confirm(
      `Faltan ${remaining} cuota(s) de ${project.installments} en total.\n\nSe crearán ${remaining} cobros "Pendientes" a partir de la fecha del último pago registrado.\n\n¿Continuar?`
    );
    if (!confirmed) return;

    setGeneratingId(project.id);

    // Usar la última fecha conocida como base para generar las siguientes
    const lastDateStr = existingPayments?.[0]?.date || new Date().toISOString().split('T')[0];
    const baseDate = new Date(lastDateStr + 'T12:00:00');
    const installmentAmt = project.totalAmount / project.installments;
    const newPayments = [];

    const clientEmail = clients.find(c => c.id === project.clientId)?.email || '';
    const pendingCalendarPayloads: { projectName: string; clientName: string; clientEmail: string; amount: number; date: string }[] = [];

    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(baseDate);
      nextDate.setMonth(nextDate.getMonth() + i);
      const dateStr = nextDate.toISOString().split('T')[0];

      newPayments.push({
        project_id: project.id,
        amount: installmentAmt,
        date: dateStr,
        status: 'pending'
      });
      
      pendingCalendarPayloads.push({
        projectName: project.name,
        clientName: getClientName(project.clientId),
        clientEmail,
        amount: installmentAmt,
        date: dateStr
      });
    }

    await supabase.from('payments').insert(newPayments);

    // Auto-create Google Calendar events for pending payments
    if (isGCalConnected() && pendingCalendarPayloads.length > 0) {
      await createCalendarEvents(pendingCalendarPayloads);
    }

    // Enviar Webhooks a GoHighLevel
    if (pendingCalendarPayloads.length > 0) {
      await sendGHLWebhook(pendingCalendarPayloads.map(p => ({
        clientName: p.clientName,
        clientEmail: p.clientEmail,
        projectName: p.projectName,
        amount: p.amount,
        dueDate: p.date
      })));
    }

    setGeneratingId(null);
    refetch();
  };

  return (
    <div className="flex-col gap-6" style={{ display: 'flex' }}>
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-4xl font-bold text-highlight">Proyectos</h1>
          <p className="text-main mt-4">Gestión de proyectos y planes de clientes.</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn btn-primary">Nuevo Proyecto</button>
      </header>

      <AddProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setModalOpen(false)} 
        onSuccess={refetch} 
        clients={clients} 
      />

      <EditProjectModal
        project={editingProject}
        isOpen={editingProject !== null}
        onClose={() => setEditingProject(null)}
        onSuccess={() => { setEditingProject(null); refetch(); }}
        clients={clients}
      />

      <div className="grid grid-cols-2 gap-6">
        {projects.filter(p => p.status !== 'cancelled').map(project => {
          const projectPayments = payments.filter(p => p.projectId === project.id);
          const paidCount = projectPayments.filter(p => p.status === 'paid').length;
          const missingCount = project.installments - projectPayments.length;
          return (
            <div key={project.id} className="card flex-col gap-4" style={{ display: 'flex' }}>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <FolderKanban className="text-primary" />
                  <h3 className="text-xl font-bold text-highlight">{project.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge ${project.status === 'active' ? 'badge-success' : ''}`}>
                    {project.status === 'active' ? 'Activo' : project.status}
                  </span>
                  <button onClick={() => setEditingProject(project)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#66fcf1', padding: '4px' }}>
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(project.id, project.name)} disabled={deletingId === project.id} title="Eliminar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', padding: '4px', opacity: deletingId === project.id ? 0.5 : 1 }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              
              <div className="flex-col gap-2 mt-2">
                <div className="flex justify-between border-b pb-2" style={{ borderColor: '#2d3748' }}>
                  <span className="text-sm">Cliente</span>
                  <span className="font-semibold text-highlight">{getClientName(project.clientId)}</span>
                </div>
                <div className="flex justify-between border-b pb-2 pt-2" style={{ borderColor: '#2d3748' }}>
                  <span className="text-sm">Plan</span>
                  <span className="font-semibold text-highlight">{project.plan}</span>
                </div>
                <div className="flex justify-between border-b pb-2 pt-2" style={{ borderColor: '#2d3748' }}>
                  <span className="text-sm">Monto Total</span>
                  <span className="font-semibold text-highlight">${project.totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-sm">Pagos</span>
                  <span className="font-semibold text-highlight">{paidCount} pagados / {project.installments} cuotas</span>
                </div>
              </div>

              {missingCount > 0 && (
                <button
                  onClick={() => handleGenerateInstallments(project)}
                  disabled={generatingId === project.id}
                  className="btn btn-outline mt-2 w-full justify-center"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', padding: '0.5rem' }}
                >
                  <CalendarClock size={14} />
                  {generatingId === project.id ? 'Generando...' : `Generar ${missingCount} cuota(s) pendiente(s)`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};



