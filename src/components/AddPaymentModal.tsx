import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Project, Client, MESES_ES } from '../types';
import { sendGHLWebhook } from '../lib/ghl';
import { createCalendarEvents, isGCalConnected } from '../hooks/useGoogleCalendar';
import { useTRM } from '../hooks/useTRM';

interface Props {
  projects: Project[];
  clients: Client[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddPaymentModal: React.FC<Props> = ({ projects, clients, isOpen, onClose, onSuccess }) => {
  const { trm, loadingTRM } = useTRM();
  const [currency, setCurrency] = useState('COP');
  const [customTrm, setCustomTrm] = useState(4000);

  useEffect(() => {
    if (!loadingTRM && trm) setCustomTrm(trm);
  }, [trm, loadingTRM]);

  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [actualAmount, setActualAmount] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('paid');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const selectedProject = projects.find(p => p.id === projectId);
  const originalAmount = Number(amount) || 0;
  const finalAmountCOP = currency === 'USD' ? originalAmount * customTrm : originalAmount;

  useEffect(() => {
    // If user hasn't typed a custom actual amount, default it to the calculated total
    if (!actualAmount || actualAmount === '0') {
      setActualAmount(finalAmountCOP.toString());
    }
  }, [finalAmountCOP]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

      // 1. Guardar el pago actual
      const { data: pagoCreado, error } = await supabase.from('payments').insert([{
        project_id: projectId,
        amount: finalAmountCOP,
        actual_amount: status === 'paid' ? Number(actualAmount) : null,
        date,
        status
      }]).select().single();

      if (error) {
        setLoading(false);
        return alert('Error guardando el pago: ' + error.message);
      }

      // 1b. Reflejarlo SIEMPRE en ledger_movements (la fuente de verdad de
      // todos los gráficos y proyecciones) y dejar ambos lados vinculados.
      const valorMov = status === 'paid' ? (Number(actualAmount) || finalAmountCOP) : finalAmountCOP;
      const { data: movCreado, error: errMov } = await supabase.from('ledger_movements').insert({
        fecha: date,
        tipo_movimiento: 'ingreso_operativo',
        naturaleza: 'ingreso',
        descripcion: `Pago ${selectedProject?.name || 'proyecto'}`,
        valor: valorMov,
        estado: status === 'paid' ? 'confirmado' : 'esperado',
        project_id: projectId,
        client_id: selectedProject?.clientId || null,
        payment_id: pagoCreado.id,
        mes: MESES_ES[new Date(date + 'T12:00:00').getMonth()],
        personal_flag: false,
      }).select().single();
      if (!errMov && movCreado) {
        await supabase.from('payments').update({ ledger_movement_id: movCreado.id }).eq('id', pagoCreado.id);
      }
      
      const clientEmail = clients.find(c => c.id === selectedProject?.clientId)?.email || '';
      const clientName = clients.find(c => c.id === selectedProject?.clientId)?.name || 'Cliente';
      const clientPhone = clients.find(c => c.id === selectedProject?.clientId)?.phone || '';
      
      const pendingCalendarPayloads: { projectName: string; clientName: string; clientEmail: string; clientPhone: string; amount: number; date: string }[] = [];
      const webhookPayloads: { projectName: string; clientName: string; clientEmail: string; clientPhone: string; amount: number; dueDate: string }[] = [{
        projectName: selectedProject?.name || '',
        clientName,
        clientEmail,
        clientPhone,
        amount: finalAmountCOP,
        dueDate: date
      }];
  
      // 2. Si fue un pago "ya pagado", generar automáticamente las cuotas pendientes restantes
      if (status === 'paid' && selectedProject && selectedProject.installments > 1) {
        // Obtener cuántos pagos ya existen para este proyecto
        const { data: existingPayments } = await supabase
          .from('payments')
          .select('id, date')
          .eq('project_id', projectId)
          .order('date', { ascending: true });
  
        const totalExisting = existingPayments?.length || 1;
        const remaining = selectedProject.installments - totalExisting;
  
        if (remaining > 0) {
          // Calcular el monto de cada cuota restante
          const installmentAmt = selectedProject.totalAmount / selectedProject.installments;
          const baseDate = new Date(date + 'T12:00:00');
          const pendingPayments = [];
  
          for (let i = 1; i <= remaining; i++) {
          const nextDate = new Date(baseDate);
          nextDate.setMonth(nextDate.getMonth() + i);
          const dateStr = nextDate.toISOString().split('T')[0];
          
          pendingPayments.push({
            project_id: projectId,
            amount: installmentAmt,
            date: dateStr,
            status: 'pending'
          });
          
          pendingCalendarPayloads.push({
            projectName: selectedProject.name,
            clientName,
            clientEmail,
            clientPhone,
            amount: installmentAmt,
            date: dateStr
          });
          
          webhookPayloads.push({
            projectName: selectedProject.name,
            clientName,
            clientEmail,
            clientPhone,
            amount: installmentAmt,
            dueDate: dateStr
          });
        }
        const { data: cuotasCreadas } = await supabase.from('payments').insert(pendingPayments).select();

        // Las cuotas futuras también van al ledger como esperadas, vinculadas
        if (cuotasCreadas && cuotasCreadas.length > 0) {
          const movsCuotas = cuotasCreadas.map((c: any) => ({
            fecha: c.date,
            tipo_movimiento: 'ingreso_operativo',
            naturaleza: 'ingreso',
            descripcion: `Cuota ${selectedProject?.name || 'proyecto'}`,
            valor: Number(c.amount),
            estado: 'esperado',
            project_id: projectId,
            client_id: selectedProject?.clientId || null,
            payment_id: c.id,
            mes: MESES_ES[new Date(c.date + 'T12:00:00').getMonth()],
            personal_flag: false,
          }));
          const { data: movsCreados } = await supabase.from('ledger_movements').insert(movsCuotas).select();
          if (movsCreados) {
            for (const mv of movsCreados) {
              await supabase.from('payments').update({ ledger_movement_id: mv.id }).eq('id', mv.payment_id);
            }
          }
        }

        if (isGCalConnected() && pendingCalendarPayloads.length > 0) {
          await createCalendarEvents(pendingCalendarPayloads);
        }
      }
    }

    // SIEMPRE disparar el webhook con los pagos de esta transacción (el creado + futuros si aplica)
    if (webhookPayloads.length > 0) {
      await sendGHLWebhook(webhookPayloads.map(p => ({ ...p, clientPhone: p.clientPhone })));
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div className="card" style={{ width: '400px', backgroundColor: 'var(--bg-color)', border: '1px solid var(--panel-border)' }}>
        <h2 className="text-2xl font-bold text-highlight mb-4">Registrar Abono / Cobro</h2>
        <form onSubmit={handleSubmit} className="flex-col gap-4" style={{ display: 'flex', flexDirection: 'column' }}>
          <div>
            <label className="text-sm mb-1 block text-main">Proyecto</label>
            <select required value={projectId} onChange={e => setProjectId(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', backgroundColor: 'var(--secondary-accent)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }}>
              <option value="">Selecciona un proyecto</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {selectedProject && (
              <div className="mt-2 p-2 rounded" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--panel-border)' }}>
                <p className="text-xs font-bold text-highlight uppercase">{selectedProject.plan}</p>
                <p className="text-xs mt-1" style={{ color: '#9aa5b4' }}>
                  {selectedProject.installments} cuota(s) — ${(selectedProject.totalAmount / selectedProject.installments).toLocaleString()} COP c/u
                </p>
              </div>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
             <div style={{ width: '35%' }}>
              <label className="text-sm mb-1 block text-main">Moneda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', backgroundColor: 'var(--secondary-accent)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }}>
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="text-sm mb-1 block text-main">Monto (en {currency})</label>
              <input required type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', backgroundColor: 'var(--secondary-accent)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
            </div>
          </div>

          {currency === 'USD' && (
            <div className="flex-col gap-2 p-2 rounded" style={{ display: 'flex', backgroundColor: 'rgba(102, 252, 241, 0.1)' }}>
              <div>
                <label className="text-xs text-primary mb-1 block font-bold">Tasa de Cambio (TRM)</label>
                <input type="number" value={customTrm} onChange={e => setCustomTrm(Number(e.target.value))} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', backgroundColor: 'var(--bg-color)', color: 'white', border: '1px solid var(--primary-accent)', fontSize: '0.875rem', outline: 'none' }} />
              </div>
              <div className="text-sm text-highlight font-semibold">
                Suma Total a Cuenta: ${finalAmountCOP.toLocaleString()} COP
              </div>
            </div>
          )}

          <div>
            <label className="text-sm mb-1 block text-main">Fecha de este Cobro</label>
            <input required type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', backgroundColor: 'var(--secondary-accent)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }} />
          </div>

          {status === 'paid' && (
            <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.03)', borderRadius: '8px', border: '1px dashed var(--panel-border)' }}>
              <label className="text-sm mb-1 block text-primary font-bold">Monto Real Recibido (Neto en COP)</label>
              <input 
                type="number" 
                step="0.01" 
                value={actualAmount} 
                onChange={e => setActualAmount(e.target.value)} 
                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', backgroundColor: '#111', color: '#66fcf1', border: '1px solid #66fcf1', fontWeight: 'bold' }} 
                placeholder="Ej: Monto tras comisiones"
              />
              <p className="text-[10px] mt-1 text-main">Úsalo si hubo comisiones o cambio de tasa para que el Dashboard sea exacto.</p>
            </div>
          )}
          <div>
            <label className="text-sm mb-1 block text-main">Estado</label>
            <select required value={status} onChange={e => setStatus(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', backgroundColor: 'var(--secondary-accent)', color: 'white', border: '1px solid var(--panel-border)', outline: 'none' }}>
              <option value="paid">✅ Ya Pagado — genera los cobros pendientes</option>
              <option value="pending">⏳ Pendiente — solo agenda este cobro</option>
            </select>
          </div>

          {status === 'paid' && selectedProject && selectedProject.installments > 1 && (
            <div className="text-xs p-2 rounded" style={{ backgroundColor: 'rgba(102, 252, 241, 0.07)', color: '#9aa5b4' }}>
              💡 Al guardar, se agendarán automáticamente las cuotas pendientes restantes del proyecto con fechas mensuales.
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
            <button type="button" onClick={onClose} className="btn btn-outline">Cancelar</button>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Guardando...' : 'Guardar Pago'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

