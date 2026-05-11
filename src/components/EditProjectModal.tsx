import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Project } from '../types';

interface Props {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  clients: any[]; // Added clients prop to easily get/update client info
}

export const EditProjectModal: React.FC<Props> = ({ project, isOpen, onClose, onSuccess, clients }) => {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [total, setTotal] = useState('');
  const [installments, setInstallments] = useState('1');
  const [durationMonths, setDurationMonths] = useState('1');
  const [status, setStatus] = useState('active');
  const [startDate, setStartDate] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (project) {
      setName(project.name);
      setPlan(project.plan);
      setTotal(String(project.totalAmount));
      setInstallments(String(project.installments));
      setDurationMonths(String(project.durationMonths || 1));
      setStatus(project.status);
      setStartDate(project.startDate ? project.startDate.split('T')[0] : '');
      const client = clients.find(c => c.id === project.clientId);
      if (client) setEmail(client.email || '');
    }
  }, [project, clients]);

  const endDate = (() => {
    if (!startDate || !durationMonths) return null;
    const d = new Date(startDate + 'T12:00:00');
    d.setMonth(d.getMonth() + Number(durationMonths));
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  })();

  if (!isOpen || !project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // 1. Update Project
      const { error: projectError } = await supabase
        .from('projects')
        .update({
          name,
          plan,
          total_amount: Number(total),
          installments: Number(installments),
          duration_months: Number(durationMonths) || 1,
          status,
          start_date: startDate
        })
        .eq('id', project.id);

      if (projectError) throw projectError;

      // 2. Update Client Email
      if (email.trim()) {
        const { error: clientError } = await supabase
          .from('clients')
          .update({ email: email.trim() })
          .eq('id', project.clientId);
        if (clientError) throw clientError;
      }

      // 3. Sync movements when total amount changed
      if (Number(total) !== project.totalAmount && project.totalAmount > 0) {
        const factor = Number(total) / project.totalAmount;
        const { data: projPayments } = await supabase
          .from('payments')
          .select('id, amount, ledger_movement_id, status')
          .eq('project_id', project.id)
          .neq('status', 'paid');
        if (projPayments) {
          for (const pay of projPayments) {
            const newAmount = Math.round(Number(pay.amount) * factor);
            await supabase.from('payments').update({ amount: newAmount }).eq('id', pay.id);
            if (pay.ledger_movement_id) {
              await supabase.from('ledger_movements')
                .update({ valor: newAmount })
                .eq('id', pay.ledger_movement_id)
                .eq('estado', 'esperado');
            }
          }
        }
      }

      setLoading(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setLoading(false);
      alert('Error guardando cambios: ' + (err.message || 'Error desconocido'));
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div className="card" style={{ width: '420px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--panel-border)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 className="text-2xl font-bold text-highlight mb-4">Editar Proyecto</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label className="text-sm mb-1 block text-main">Nombre del Proyecto</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
          </div>
          <div>
            <label className="text-sm mb-1 block text-main">Email del Cliente (Recordatorios)</label>
            <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@correo.com" style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
          </div>
          <div>
            <label className="text-sm mb-1 block text-main">Plan Vendido / Servicio</label>
            <input required type="text" value={plan} onChange={e => setPlan(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="text-sm mb-1 block text-main">Monto Total (COP)</label>
              <input required type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="text-sm mb-1 block text-main">Nº Cuotas</label>
              <input required type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
            </div>
          </div>
          <div>
            <label className="text-sm mb-1 block text-main">Estado del Proyecto</label>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }}>
              <option value="active">Activo</option>
              <option value="completed">Completado</option>
              <option value="paused">Pausado</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 2 }}>
              <label className="text-sm mb-1 block text-main">Fecha de Inicio del Plan (Primer Pago)</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="text-sm mb-1 block text-main">Meses vigencia</label>
              <input type="number" min="1" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', backgroundColor: 'var(--panel-bg)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
            </div>
          </div>
          {endDate && (
            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '8px', padding: '0.6rem 0.875rem', fontSize: '0.8rem', color: '#10b981' }}>
              Fin del plan: <strong>{endDate}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" onClick={onClose} className="btn btn-outline">Cancelar</button>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Guardando...' : 'Guardar Cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
