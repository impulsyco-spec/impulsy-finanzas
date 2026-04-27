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

const inp: React.CSSProperties = {
  width: '100%', padding: '0.5rem', borderRadius: '6px',
  backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #333',
  fontSize: '0.85rem', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '0.25rem',
};
const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtDate = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });

export const AddProjectModal: React.FC<Props> = ({ clients, isOpen, onClose, onSuccess }) => {
  const { trm, loadingTRM } = useTRM();
  const [currency, setCurrency]       = useState('COP');
  const [customTrm, setCustomTrm]     = useState(4000);
  const [scheduleType, setScheduleType] = useState<'equal' | 'custom'>('equal');
  const [isMRR, setIsMRR]             = useState(false);
  const [isQuincenal, setIsQuincenal] = useState(false);

  useEffect(() => { if (!loadingTRM && trm) setCustomTrm(trm); }, [trm, loadingTRM]);

  const [isNewClient, setIsNewClient]         = useState(false);
  const [clientId, setClientId]               = useState('');
  const [newClientName, setNewClientName]     = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientEmail, setNewClientEmail]   = useState('');
  const [newClientPhone, setNewClientPhone]   = useState('');

  const [name, setName]                       = useState('');
  const [plan, setPlan]                       = useState('');
  const [total, setTotal]                     = useState('');
  const [installments, setInstallments]       = useState('1');
  const [durationMonths, setDurationMonths]   = useState('1');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  const [customRows, setCustomRows]           = useState<PaymentRow[]>([
    { amount: 0, date: '', status: 'paid' },
    { amount: 0, date: '', status: 'pending' },
  ]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (scheduleType === 'equal') setDurationMonths(installments);
  }, [installments, scheduleType]);

  if (!isOpen) return null;

  const originalAmount    = Number(total) || 0;
  const baseTotal         = isMRR ? originalAmount * Number(installments || 12) : originalAmount;
  const finalAmountCOP    = currency === 'USD' ? baseTotal * customTrm : baseTotal;
  const numMonths         = Number(installments) || 1;
  const installmentAmount = finalAmountCOP / numMonths;
  const halfAmount        = Math.round(installmentAmount / 2);
  const totalScheduled    = customRows.reduce((s, r) => s + Number(r.amount || 0), 0);

  // Preview de cuotas (solo para equal schedule)
  const previewPayments: { date: string; amount: number }[] = [];
  if (scheduleType === 'equal' && firstPaymentDate && numMonths > 0 && installmentAmount > 0) {
    const base = new Date(firstPaymentDate + 'T12:00:00');
    for (let i = 0; i < Math.min(numMonths, 6); i++) {
      const d1 = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
      const d1Str = d1.toISOString().split('T')[0];
      if (isQuincenal) {
        const d2 = new Date(d1); d2.setDate(d2.getDate() + 15);
        previewPayments.push({ date: d1Str, amount: halfAmount });
        previewPayments.push({ date: d2.toISOString().split('T')[0], amount: installmentAmount - halfAmount });
      } else {
        previewPayments.push({ date: d1Str, amount: installmentAmount });
      }
    }
  }

  const updateRow = (i: number, field: keyof PaymentRow, value: string | number) =>
    setCustomRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  const addRow    = () => setCustomRows(prev => [...prev, { amount: 0, date: '', status: 'pending' }]);
  const removeRow = (i: number) => setCustomRows(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!isNewClient && !clientId) {
      return alert('Selecciona un cliente o crea uno nuevo.');
    }
    if (scheduleType === 'equal' && !firstPaymentDate) {
      return alert('Ingresa la fecha del primer cobro.');
    }
    if (scheduleType === 'custom' && Math.abs(totalScheduled - originalAmount) > 0.01) {
      return alert(`La suma (${totalScheduled.toLocaleString()}) no coincide con el total (${originalAmount.toLocaleString()}).`);
    }

    setLoading(true);

    // ── 1. Cliente ────────────────────────────────────────────
    let finalClientId = clientId;
    if (isNewClient) {
      const { data: newClient, error: ce } = await supabase
        .from('clients')
        .insert([{
          name: newClientName,
          company: newClientCompany || newClientName,
          email: newClientEmail || null,
          phone: newClientPhone || null,
        }])
        .select().single();
      if (ce) { setLoading(false); return alert('Error al crear cliente: ' + ce.message); }
      finalClientId = newClient.id;
    }

    // ── 2. Proyecto ───────────────────────────────────────────
    const actualInstallments = scheduleType === 'custom'
      ? customRows.length
      : isQuincenal ? numMonths * 2 : numMonths;

    const startDate = scheduleType === 'custom'
      ? customRows[0]?.date
      : firstPaymentDate;

    const { data: project, error: pe } = await supabase.from('projects').insert([{
      client_id:       finalClientId,
      name,
      plan,
      total_amount:    finalAmountCOP,
      installments:    actualInstallments,
      duration_months: Number(durationMonths) || numMonths,
      start_date:      startDate || new Date().toISOString().split('T')[0],
      status:          'active',
      is_recurring:    isMRR,
    }]).select().single();

    if (pe) { setLoading(false); return alert('Error al crear proyecto: ' + pe.message); }

    // ── 3. Pagos ──────────────────────────────────────────────
    const clientName  = isNewClient ? newClientName  : (clients.find(c => c.id === clientId)?.name  || '');
    const clientEmail = isNewClient ? newClientEmail : (clients.find(c => c.id === clientId)?.email || '');
    const clientPhone = isNewClient ? newClientPhone : (clients.find(c => c.id === clientId)?.phone || '');

    const paymentsToInsert: { project_id: string; amount: number; date: string; status: string }[] = [];
    const calendarPayloads: { projectName: string; clientName: string; clientEmail: string; clientPhone: string; amount: number; date: string }[] = [];
    const webhookPayloads:  { projectName: string; clientName: string; clientEmail: string; clientPhone: string; amount: number; dueDate: string }[] = [];

    if (scheduleType === 'custom') {
      customRows.forEach(r => {
        const amt = currency === 'USD' ? r.amount * customTrm : r.amount;
        paymentsToInsert.push({ project_id: project.id, amount: amt, date: r.date, status: r.status });
        if (r.status === 'pending') calendarPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: amt, date: r.date });
        webhookPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: amt, dueDate: r.date });
      });

    } else {
      const base = new Date(firstPaymentDate + 'T12:00:00');
      for (let i = 0; i < numMonths; i++) {
        const d1 = new Date(base.getFullYear(), base.getMonth() + i, base.getDate());
        const d1Str = d1.toISOString().split('T')[0];

        if (isQuincenal) {
          const d2 = new Date(d1); d2.setDate(d2.getDate() + 15);
          const d2Str = d2.toISOString().split('T')[0];
          paymentsToInsert.push(
            { project_id: project.id, amount: halfAmount, date: d1Str, status: 'pending' },
            { project_id: project.id, amount: installmentAmount - halfAmount, date: d2Str, status: 'pending' },
          );
          calendarPayloads.push(
            { projectName: name, clientName, clientEmail, clientPhone, amount: halfAmount, date: d1Str },
            { projectName: name, clientName, clientEmail, clientPhone, amount: installmentAmount - halfAmount, date: d2Str },
          );
          webhookPayloads.push(
            { projectName: name, clientName, clientEmail, clientPhone, amount: halfAmount, dueDate: d1Str },
            { projectName: name, clientName, clientEmail, clientPhone, amount: installmentAmount - halfAmount, dueDate: d2Str },
          );
        } else {
          paymentsToInsert.push({ project_id: project.id, amount: installmentAmount, date: d1Str, status: 'pending' });
          calendarPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: installmentAmount, date: d1Str });
          webhookPayloads.push({ projectName: name, clientName, clientEmail, clientPhone, amount: installmentAmount, dueDate: d1Str });
        }
      }
    }

    const { error: payErr } = await supabase.from('payments').insert(paymentsToInsert);
    if (payErr) console.error('Error insertando pagos:', payErr.message);

    // ── 4. Google Calendar ────────────────────────────────────
    if (isGCalConnected() && calendarPayloads.length > 0) {
      const created = await createCalendarEvents(calendarPayloads);
      if (created > 0) alert(`✅ ${created} evento(s) creados en Google Calendar.`);
    }

    // ── 5. GoHighLevel webhook ────────────────────────────────
    if (webhookPayloads.length > 0) await sendGHLWebhook(webhookPayloads);

    setLoading(false);
    onSuccess();
    onClose();
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '1rem' }}>
      <div className="card" style={{ width: '520px', maxHeight: '92vh', overflowY: 'auto', backgroundColor: '#0b0b0b' }}>
        <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.4rem', marginBottom: '1.25rem' }}>Nuevo Proyecto</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* ── CLIENTE ─────────────────────────────────────── */}
          <div style={{ borderBottom: '1px solid #1f1f1f', paddingBottom: '1rem' }}>
            <label style={lbl}>Cliente</label>
            <div style={{ display: 'flex', background: '#111', borderRadius: '8px', padding: '0.2rem', marginBottom: '0.75rem' }}>
              {(['Existente', 'Nuevo'] as const).map((opt, i) => (
                <button key={opt} type="button"
                  onClick={() => setIsNewClient(i === 1)}
                  style={{ flex: 1, padding: '0.45rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.15s', background: isNewClient === (i === 1) ? '#fff' : 'transparent', color: isNewClient === (i === 1) ? '#000' : '#71717a' }}>
                  {i === 0 ? 'Elegir existente' : '+ Crear nuevo'}
                </button>
              ))}
            </div>
            {isNewClient ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div><label style={lbl}>Nombre *</label><input required style={inp} value={newClientName} onChange={e => setNewClientName(e.target.value)} placeholder="Nombre del cliente" /></div>
                <div><label style={lbl}>Teléfono / WhatsApp</label><input style={inp} type="tel" value={newClientPhone} onChange={e => setNewClientPhone(e.target.value)} placeholder="Para recordatorios" /></div>
                <div><label style={lbl}>Empresa</label><input style={inp} value={newClientCompany} onChange={e => setNewClientCompany(e.target.value)} /></div>
                <div><label style={lbl}>Email</label><input style={inp} type="email" value={newClientEmail} onChange={e => setNewClientEmail(e.target.value)} placeholder="Para Google Calendar" /></div>
              </div>
            ) : (
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={inp}>
                <option value="">Selecciona un cliente…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name} {c.company && c.company !== c.name ? `(${c.company})` : ''}</option>)}
              </select>
            )}
          </div>

          {/* ── PROYECTO ─────────────────────────────────────── */}
          <div><label style={lbl}>Nombre del proyecto *</label><input required style={inp} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label style={lbl}>Plan / servicio vendido *</label><input required style={inp} value={plan} onChange={e => setPlan(e.target.value)} placeholder="Ej. Retainer Premium 3 meses" /></div>

          {/* ── MONEDA + VALOR ───────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
            <div>
              <label style={lbl}>Moneda</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={inp}>
                <option value="COP">COP</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div>
              <label style={lbl}>{isMRR ? `Valor mensual (${currency})` : `Valor total (${currency})`} *</label>
              <input required type="number" step="0.01" value={total} onChange={e => setTotal(e.target.value)} style={inp} />
            </div>
          </div>

          {(currency === 'USD' || isMRR) && (
            <div style={{ background: '#111', borderRadius: '8px', padding: '0.75rem', fontSize: '0.82rem' }}>
              {currency === 'USD' && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={lbl}>TRM (editable)</label>
                  <input type="number" value={customTrm} onChange={e => setCustomTrm(Number(e.target.value))} style={inp} />
                </div>
              )}
              {isMRR && <div style={{ color: '#71717a' }}>{originalAmount.toLocaleString()} {currency} × {installments || 12} cuotas</div>}
              <div style={{ color: '#10b981', fontWeight: 700, marginTop: '0.25rem' }}>Total COP: {fmt(finalAmountCOP)}</div>
            </div>
          )}

          {/* ── MRR toggle ───────────────────────────────────── */}
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', background: '#111', borderRadius: '8px', padding: '0.75rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={isMRR} onChange={e => { setIsMRR(e.target.checked); if (e.target.checked) { setScheduleType('equal'); setInstallments('12'); } }}
              style={{ width: '16px', height: '16px', accentColor: '#10b981', flexShrink: 0 }} />
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>Proyecto MRR (pagos recurrentes)</div>
              <div style={{ color: '#52525b', fontSize: '0.72rem' }}>Facturación continua. Por defecto 12 cuotas (1 año).</div>
            </div>
          </label>

          {/* ── PLAN DE PAGOS ────────────────────────────────── */}
          <div style={{ borderTop: '1px solid #1f1f1f', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ ...lbl, marginBottom: 0 }}>Plan de Pagos</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.68rem', color: '#52525b' }}>Meses vigencia:</span>
                <input type="number" min="1" value={durationMonths} onChange={e => setDurationMonths(e.target.value)}
                  style={{ ...inp, width: '60px', padding: '0.3rem' }} />
              </div>
            </div>

            {!isMRR && (
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.875rem' }}>
                {(['equal','custom'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setScheduleType(t)}
                    style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: `2px solid ${scheduleType === t ? '#10b981' : '#2a2a2a'}`, background: scheduleType === t ? 'rgba(16,185,129,0.08)' : 'transparent', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                    {t === 'equal' ? '⚖️ Cuotas iguales' : '✏️ Personalizado'}
                  </button>
                ))}
              </div>
            )}

            {scheduleType === 'equal' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                  <div>
                    <label style={lbl}>Nº meses</label>
                    <input required type="number" min="1" value={installments} onChange={e => setInstallments(e.target.value)} style={inp} />
                  </div>
                  <div>
                    <label style={lbl}>Fecha primer cobro *</label>
                    <input required type="date" value={firstPaymentDate} onChange={e => setFirstPaymentDate(e.target.value)} style={inp} />
                  </div>
                </div>

                {/* ── QUINCENAL toggle ─────────────────────── */}
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem', background: '#0d0d0d', borderRadius: '8px', padding: '0.75rem', cursor: 'pointer', border: isQuincenal ? '1px solid #10b98133' : '1px solid #1f1f1f' }}>
                  <input type="checkbox" checked={isQuincenal} onChange={e => setIsQuincenal(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#10b981', flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>Cobro quincenal</div>
                    {installmentAmount > 0 ? (
                      <div style={{ color: '#52525b', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        Cada mes se divide en 2 pagos de {fmt(halfAmount)} — se crea el doble de cuotas automáticamente.
                      </div>
                    ) : (
                      <div style={{ color: '#52525b', fontSize: '0.72rem', marginTop: '0.15rem' }}>
                        Divide cada cuota mensual en dos pagos quincenales.
                      </div>
                    )}
                  </div>
                </label>

                {/* ── Preview de cuotas ────────────────────── */}
                {previewPayments.length > 0 && (
                  <div style={{ background: '#0a0a0a', borderRadius: '8px', padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
                      Vista previa {isQuincenal ? `(${numMonths * 2} cobros quinc.)` : `(${numMonths} cobros mensuales)`}
                    </div>
                    {previewPayments.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.2rem 0', borderBottom: '1px solid #111' }}>
                        <span style={{ fontSize: '0.78rem', color: '#71717a' }}>{fmtDate(p.date)}</span>
                        <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>{fmt(p.amount)}</span>
                      </div>
                    ))}
                    {numMonths > 6 && (
                      <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.35rem', textAlign: 'center' }}>
                        + {(isQuincenal ? numMonths * 2 : numMonths) - previewPayments.length} cobro(s) más…
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid #1f1f1f' }}>
                      <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>Total</span>
                      <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>{fmt(finalAmountCOP)}</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── CUSTOM schedule ─────────────────────────── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 28px', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Valor ({currency})</span>
                  <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Fecha</span>
                  <span style={{ fontSize: '0.7rem', color: '#71717a' }}>Estado</span>
                  <span />
                </div>
                {customRows.map((row, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 115px 28px', gap: '0.4rem', alignItems: 'center' }}>
                    <input type="number" step="0.01" value={row.amount} onChange={e => updateRow(i, 'amount', Number(e.target.value))} style={{ ...inp, padding: '0.35rem 0.5rem' }} />
                    <input required type="date" value={row.date} onChange={e => updateRow(i, 'date', e.target.value)} style={{ ...inp, padding: '0.35rem 0.5rem' }} />
                    <select value={row.status} onChange={e => updateRow(i, 'status', e.target.value)} style={{ ...inp, padding: '0.35rem 0.5rem', fontSize: '0.75rem' }}>
                      <option value="paid">✅ Pagado</option>
                      <option value="pending">⏳ Pendiente</option>
                    </select>
                    <button type="button" onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" onClick={addRow} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit' }}>
                    <Plus size={13} /> Agregar cuota
                  </button>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: Math.abs(totalScheduled - originalAmount) < 0.01 ? '#10b981' : '#ef4444' }}>
                    {fmt(totalScheduled)} / {fmt(originalAmount)} {currency}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* ── BOTONES ──────────────────────────────────────── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
            <button type="button" onClick={onClose} className="btn btn-outline">Cancelar</button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Guardando…' : 'Crear Proyecto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
