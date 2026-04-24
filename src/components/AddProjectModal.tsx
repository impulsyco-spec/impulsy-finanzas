import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Client } from '../types';
import { useTRM } from '../hooks/useTRM';
import { Plus, Trash2 } from 'lucide-react';
import { createCalendarEvents, isGCalConnected } from '../hooks/useGoogleCalendar';
import { sendGHLWebhook } from '../lib/ghl';

interface PaymentRow {
  amount: number;
  date: string;
  status: 'paid' | 'pending';
}

interface Props {
  clients: Client[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: '4px',
  backgroundColor: '#1f2833', color: 'white', border: '1px solid #2d3748'
};

export const AddProjectModal: React.FC<Props> = ({ clients, isOpen, onClose, onSuccess }) => {
  const { trm, loadingTRM } = useTRM();
  const [currency, setCurrency] = useState('COP');
  const [customTrm, setCustomTrm] = useState(4000);
  const [scheduleType, setScheduleType] = useState<'equal' | 'custom'>('equal');
  const [isMRR, setIsMRR] = useState(false);

  useEffect(() => {
    if (!loadingTRM && trm) setCustomTrm(trm);
  }, [trm, loadingTRM]);

  const [isNewClient, setIsNewClient] = useState(false);
  const [clientId, setClientId] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');

  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [total, setTotal] = useState('');
  // Equal schedule fields
  const [installments, setInstallments] = useState('1');
  const [durationMonths, setDurationMonths] = useState('1');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');

  // Auto-sync duration with installments if equal schedule is used
  useEffect(() => {
    if (scheduleType === 'equal') {
      setDurationMonths(installments);
    }
  }, [installments, scheduleType]);

  // Custom schedule rows
  const [customRows, setCustomRows] = useState<PaymentRow[]>([
    { amount: 0, date: '', status: 'paid' },
    { amount: 0, date: '', status: 'pending' },
  ]);

  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const originalAmount = Number(total) || 0;
  const baseTotal = isMRR ? originalAmount * Number(installments || 12) : originalAmount;
  const finalAmountCOP = currency === 'USD' ? baseTotal * customTrm : baseTotal;
  const installmentAmount = Number(installments) > 0 ? finalAmountCOP / Number(installments) : finalAmountCOP;
  const totalScheduled = customRows.reduce((acc, r) => acc + Number(r.amount || 0), 0);

  const updateRow = (i: number, field: keyof PaymentRow, value: string | number) => {
    setCustomRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  };

  const addRow = () => setCustomRows(prev => [...prev, { amount: 0, date: '', status: 'pending' }]);
  const removeRow = (i: number) => setCustomRows(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (scheduleType === 'custom' && Math.abs(totalScheduled - originalAmount) > 0.01) {
      return alert(`La suma de las cuotas ($${totalScheduled.toLocaleString()} ${currency}) no coincide con el total del proyecto ($${originalAmount.toLocaleString()} ${currency}). Alústalo para continuar.`);
    }

    setLoading(true);

    let finalClientId = clientId;
    if (isNewClient) {
      const { data: newClientData, error: clientError } = await supabase
        .from('clients')
        .insert([{ name: newClientName, company: newClientCompany || newClientName, email: newClientEmail || null, phone: newClientPhone || null }])
        .select().single();
      if (clientError) {
        setLoading(false);
        return alert('Error guardando el cliente: ' + clientError.message);
      }
      finalClientId = newClientData.id;
    }

    const numInstallments = scheduleType === 'custom' ? customRows.length : Number(installments);
    const calculatedStartDate = scheduleType === 'custom' ? customRows[0]?.date : firstPaymentDate;

    const { data: projectData, error: projectError } = await supabase.from('projects').insert([{
      client_id: finalClientId,
      name,
      plan,
      total_amount: finalAmountCOP,
      installments: numInstallments,
      duration_months: Number(durationMonths) || numInstallments,
      start_date: calculatedStartDate || new Date().toISOString().split('T')[0],
      status: 'active',
      is_recurring: isMRR
    }]).select().single();

    if (projectError) {
      setLoading(false);
      return alert('Error guardando el proyecto: ' + projectError.message);
    }

    // Generate payment schedule
    const pendingCalendarPayloads: { projectName: string; clientName: string; clientEmail: string; clientPhone: string; amount: number; date: string }[] = [];

    const clientName = isNewClient ? newClientName : (clients.find(c => c.id === clientId)?.name || '');
    const clientEmail = isNewClient ? newClientEmail : (clients.find(c => c.id === clientId)?.email || '');
    const clientPhone = isNewClient ? newClientPhone : (clients.find(c => c.id === clientId)?.phone || '');
    
    const webhookPayloads: { clientName: string; clientEmail: string; clientPhone: string; projectName: string; amount: number; dueDate: string }[] = [];

    if (scheduleType === 'custom') {
      const paymentsToInsert = customRows.map(row => ({
        project_id: projectData.id,
        amount: currency === 'USD' ? row.amount * customTrm : row.amount,
        date: row.date,
        status: row.status
      }));
      await supabase.from('payments').insert(paymentsToInsert);

      // Collect pending ones for Calendar
      customRows.filter(r => r.status === 'pending').forEach(r => {
        pendingCalendarPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: currency === 'USD' ? r.amount * customTrm : r.amount, date: r.date });
      });
      
      // Collect ALL for webhooks
      customRows.forEach(r => {
        webhookPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: currency === 'USD' ? r.amount * customTrm : r.amount, dueDate: r.date });
      });

    } else if (firstPaymentDate && Number(installments) > 0) {
      const paymentsToInsert = [];
      const baseDate = new Date(firstPaymentDate + 'T12:00:00');
      for (let i = 0; i < Number(installments); i++) {
        const payDate = new Date(baseDate);
        payDate.setMonth(payDate.getMonth() + i);
        const dateStr = payDate.toISOString().split('T')[0];
        paymentsToInsert.push({ project_id: projectData.id, amount: installmentAmount, date: dateStr, status: 'pending' });
        pendingCalendarPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: installmentAmount, date: dateStr });
        webhookPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: installmentAmount, dueDate: dateStr });
      }
      await supabase.from('payments').insert(paymentsToInsert);
    }

    // Auto-create Google Calendar events for pending payments (if connected)
    if (isGCalConnected() && pendingCalendarPayloads.length > 0) {
      const created = await createCalendarEvents(pendingCalendarPayloads);
      if (created > 0) {
        alert(`✅ Se crearon ${created} evento(s) en Google Calendar automáticamente.`);
      }
    }

    // Enviar Webhooks a GoHighLevel
    if (webhookPayloads.length > 0) {
      await sendGHLWebhook(webhookPayloads);
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div className="card" style={{ width: '480px', backgroundColor: '#0b0c10', maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 className="text-2xl font-bold text-highlight mb-4">Nuevo Proyecto</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* CLIENTE */}
          <div style={{ borderBottom: '1px solid #2d3748', paddingBottom: '1rem' }}>
            <label className="text-sm font-bold text-highlight block mb-2">Cliente del Proyecto</label>
            <div style={{ display: 'flex', backgroundColor: '#1f2833', borderRadius: '6px', padding: '0.2rem', marginBottom: '1rem' }}>
              <button 
                type="button"
                onClick={() => setIsNewClient(false)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', color: !isNewClient ? '#000' : '#c5c6c7', backgroundColor: !isNewClient ? '#66fcf1' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: !isNewClient ? 600 : 400, transition: 'all 0.2s' }}
              >
                Elegir Existente
              </button>
              <button 
                type="button"
                onClick={() => setIsNewClient(true)}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', fontSize: '0.85rem', color: isNewClient ? '#000' : '#c5c6c7', backgroundColor: isNewClient ? '#66fcf1' : 'transparent', border: 'none', cursor: 'pointer', fontWeight: isNewClient ? 600 : 400, transition: 'all 0.2s' }}
              >
                + Crear Nuevo
              </button>
            </div>
            {isNewClient ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input required={isNewClient} placeholder="Nombre del Cliente" type="text" value={newClientName} onChange={e => setNewClientName(e.target.value)} style={inputStyle} />
                <input placeholder="Teléfono / WhatsApp (Opcional - Para recordatorios)" type="tel" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} style={inputStyle} />
                <input placeholder="Empresa (Opcional)" type="text" value={newClientCompany} onChange={e => setNewClientCompany(e.target.value)} style={inputStyle} />
                <input placeholder="Correo electrónico (Opcional - Para Google Calendar)" type="email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} style={inputStyle} />
              </div>
            ) : (
              <select required={!isNewClient} value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
                <option value="">Selecciona un cliente</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.company})</option>)}
              </select>
            )}
          </div>

          {/* PROYECTO */}
          <div>
            <label className="text-sm mb-1 block text-main">Nombre del Proyecto</label>
            <input required type="text" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label className="text-sm mb-1 block text-main">Plan / Servicio Vendido</label>
            <input required type="text" value={plan} onChange={e => setPlan(e.target.value)} placeholder="Ej. Plan 3 Meses, Retainer Premium" style={inputStyle} />
          </div>

          {/* MONEDA + VALOR */}
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="text-sm mb-1 block text-main">Moneda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle}>
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label className="text-sm mb-1 block text-main">
                {isMRR ? `Valor Mensual (en ${currency})` : `Valor Total (en ${currency})`}
              </label>
              <input required type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {(currency === 'USD' || isMRR) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>
              {currency === 'USD' && (
                <>
                  <label className="text-xs text-primary">TRM (editable)</label>
                  <input type="number" value={customTrm} onChange={e => setCustomTrm(Number(e.target.value))} style={{ ...inputStyle, border: '1px solid var(--panel-border)', backgroundColor: 'black' }} />
                </>
              )}
              {isMRR && (
                <span className="text-xs text-main">
                  Cálculo del plan: {originalAmount.toLocaleString()} {currency} × {installments || 12} cuotas
                </span>
              )}
              <span className="text-sm text-highlight font-semibold">Valor Total de Póliza/Contrato: ${finalAmountCOP.toLocaleString()} COP</span>
            </div>
          )}

          {/* TIPO DE PROYECTO (MRR) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem', backgroundColor: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--panel-border)' }}>
            <input 
              type="checkbox" 
              id="mrr-check"
              checked={isMRR}
              onChange={e => {
                const checked = e.target.checked;
                setIsMRR(checked);
                if (checked) {
                  setScheduleType('equal');
                  setInstallments('12');
                }
              }}
              style={{ width: '18px', height: '18px', accentColor: 'white', cursor: 'pointer' }}
            />
            <label htmlFor="mrr-check" style={{ fontSize: '0.9rem', color: 'var(--text-main)', cursor: 'pointer' }}>
              <span className="text-highlight font-semibold">Proyecto MRR (Pagos Recurrentes)</span><br/>
              <span style={{ fontSize: '0.75rem', color: '#71717a' }}>Facturación continua. Por defecto 12 cuotas (1 año).</span>
            </label>
          </div>

          {/* PLAN DE PAGOS */}
          <div style={{ borderTop: '1px solid #2d3748', paddingTop: '1rem' }}>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-bold text-highlight">
                {isMRR ? 'Periodicidad (Cuotas mensuales)' : 'Plan de Pagos'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label className="text-[10px] text-main uppercase font-bold">Meses Vigencia:</label>
                <input required type="number" min="1" value={durationMonths} onChange={e => setDurationMonths(e.target.value)} style={{ ...inputStyle, width: '60px', padding: '0.2rem' }} />
              </div>
            </div>
            {!isMRR && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                <button type="button" onClick={() => setScheduleType('equal')}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '2px solid', borderColor: scheduleType === 'equal' ? '#66fcf1' : '#2d3748', backgroundColor: scheduleType === 'equal' ? 'rgba(102,252,241,0.1)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                  ⚖️ Cuotas iguales
                </button>
                <button type="button" onClick={() => setScheduleType('custom')}
                  style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '2px solid', borderColor: scheduleType === 'custom' ? '#66fcf1' : '#2d3748', backgroundColor: scheduleType === 'custom' ? 'rgba(102,252,241,0.1)' : 'transparent', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>
                  ✏️ Personalizado (Monto)
                </button>
              </div>
            )}

            {scheduleType === 'equal' ? (
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <label className="text-sm mb-1 block text-main">Nº Cuotas</label>
                  <input required type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ flex: 2 }}>
                  <label className="text-sm mb-1 block text-main">Fecha del Primer Cobro</label>
                  <input required type="date" value={firstPaymentDate} onChange={e => setFirstPaymentDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 28px', gap: '0.4rem', paddingBottom: '0.3rem' }}>
                  <span className="text-xs text-main">Valor ({currency})</span>
                  <span className="text-xs text-main">Fecha</span>
                  <span className="text-xs text-main">Estado</span>
                  <span></span>
                </div>
                {customRows.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 115px 28px', gap: '0.4rem', alignItems: 'center' }}>
                    <input type="number" step="0.01" value={row.amount} onChange={e => updateRow(i, 'amount', Number(e.target.value))} style={{ ...inputStyle, padding: '0.3rem 0.4rem' }} />
                    <input required type="date" value={row.date} onChange={e => updateRow(i, 'date', e.target.value)} style={{ ...inputStyle, padding: '0.3rem 0.4rem' }} />
                    <select value={row.status} onChange={e => updateRow(i, 'status', e.target.value)} style={{ ...inputStyle, padding: '0.3rem 0.4rem', fontSize: '0.75rem' }}>
                      <option value="paid">✅ Pagado</option>
                      <option value="pending">⏳ Pendiente</option>
                    </select>
                    <button type="button" onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <button type="button" onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#66fcf1', cursor: 'pointer', fontSize: '0.8rem' }}>
                    <Plus size={13} /> Agregar cuota
                  </button>
                  <span style={{ fontSize: '0.8rem', color: Math.abs(totalScheduled - originalAmount) < 0.01 ? '#68d391' : '#fc8181', fontWeight: 'bold' }}>
                    Suma: ${totalScheduled.toLocaleString()} / ${originalAmount.toLocaleString()} {currency}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" onClick={onClose} className="btn btn-outline">Cancelar</button>
            <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Guardando...' : 'Crear Proyecto'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
