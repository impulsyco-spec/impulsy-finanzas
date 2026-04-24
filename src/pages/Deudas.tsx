import React, { useState } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { useLedger } from '../hooks/useLedger';
import { supabase } from '../lib/supabase';
import { Debt } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtPct = (v: number) => (v * 100).toFixed(2) + '%';

const empty: Omit<Debt,'id'|'activa'> = {
  acreedor: '', tipo: 'prestamo', montoOriginal: 0, saldoActual: 0,
  cuotaMinima: 0, tasaMensual: undefined, fechaProximoPago: undefined, notas: undefined,
};

export const Deudas: React.FC = () => {
  const { debts, loading, refetch } = useLedger();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [form, setForm] = useState({ ...empty, tipo: 'prestamo' as Debt['tipo'] });
  const [saving, setSaving] = useState(false);

  const totalDeuda    = debts.reduce((s, d) => s + d.saldoActual, 0);
  const totalCuotas   = debts.reduce((s, d) => s + d.cuotaMinima, 0);

  const openAdd = () => {
    setEditing(null);
    setForm({ acreedor: '', tipo: 'prestamo', montoOriginal: 0, saldoActual: 0, cuotaMinima: 0, tasaMensual: undefined, fechaProximoPago: undefined, notas: undefined });
    setModal(true);
  };

  const openEdit = (d: Debt) => {
    setEditing(d);
    setForm({ acreedor: d.acreedor, tipo: d.tipo, montoOriginal: d.montoOriginal, saldoActual: d.saldoActual, cuotaMinima: d.cuotaMinima, tasaMensual: d.tasaMensual, fechaProximoPago: d.fechaProximoPago, notas: d.notas });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.acreedor.trim()) { alert('Ingresa el nombre del acreedor'); return; }
    setSaving(true);
    try {
      const payload = {
        acreedor: form.acreedor.trim(),
        tipo: form.tipo,
        monto_original: Number(form.montoOriginal) || 0,
        saldo_actual: Number(form.saldoActual) || 0,
        cuota_minima: Number(form.cuotaMinima) || 0,
        tasa_mensual: form.tasaMensual || null,
        fecha_proximo_pago: form.fechaProximoPago || null,
        notas: form.notas?.trim() || null,
        activa: true,
      };
      if (editing) {
        await supabase.from('debts').update(payload).eq('id', editing.id);
      } else {
        await supabase.from('debts').insert(payload);
      }
      refetch(); setModal(false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta deuda?')) return;
    await supabase.from('debts').update({ activa: false }).eq('id', id);
    refetch();
  };

  const today = new Date().toISOString().split('T')[0];

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#1a1a1a', border: '1px solid #333', color: '#fff',
    padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit',
  };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Deudas</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Obligaciones financieras. No confundas con gastos operativos.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Nueva Deuda</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
        {[
          { label: 'Total Adeudado',    value: fmt(totalDeuda),   color: '#ef4444' },
          { label: 'Cuota Total/Mes',   value: fmt(totalCuotas),  color: '#f59e0b' },
          { label: 'Obligaciones',      value: String(debts.length), color: '#fff' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {debts.map(d => {
          const pct = d.montoOriginal > 0 ? d.saldoActual / d.montoOriginal : 0;
          const vence = d.fechaProximoPago ? d.fechaProximoPago < today : false;
          return (
            <div key={d.id} className="card" style={{ padding: '1.25rem', borderColor: vence ? 'rgba(239,68,68,0.3)' : '#222' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem' }}>{d.acreedor}</span>
                    <span style={{ fontSize: '0.7rem', background: '#222', padding: '0.15rem 0.5rem', borderRadius: '999px', color: '#a0aec0' }}>{d.tipo}</span>
                    {vence && <span style={{ fontSize: '0.7rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', padding: '0.15rem 0.5rem', borderRadius: '999px' }}>Vence pronto</span>}
                  </div>
                  {d.notas && <p style={{ fontSize: '0.8rem', color: '#71717a', marginTop: '0.25rem' }}>{d.notas}</p>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.25rem' }}>{fmt(d.saldoActual)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#71717a' }}>Cuota: {fmt(d.cuotaMinima)}/mes</div>
                  </div>
                  <button onClick={() => openEdit(d)} style={{ background: 'none', border: '1px solid #333', color: '#a0aec0', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}><Pencil size={13} /></button>
                  <button onClick={() => handleDelete(d.id)} style={{ background: 'none', border: '1px solid #333', color: '#ef4444', padding: '0.35rem', borderRadius: '6px', cursor: 'pointer' }}><X size={13} /></button>
                </div>
              </div>
              <div style={{ marginTop: '1rem', height: '6px', background: '#222', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, background: pct > 0.5 ? '#ef4444' : '#f59e0b', borderRadius: '999px', transition: 'width 0.4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#71717a', marginTop: '0.4rem' }}>
                <span>{fmt(d.saldoActual)} restante</span>
                <span>Original: {fmt(d.montoOriginal)}</span>
                {d.fechaProximoPago && <span>Próximo pago: {new Date(d.fechaProximoPago + 'T12:00:00').toLocaleDateString('es-CO')}</span>}
              </div>
            </div>
          );
        })}
        {debts.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a', border: '1px dashed #333', borderRadius: '12px' }}>
            🎉 Sin deudas registradas
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '520px', maxWidth: '100%', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ color: '#fff', fontWeight: 800 }}>{editing ? 'Editar Deuda' : 'Nueva Deuda'}</h2>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              {[
                { label: 'Acreedor *', key: 'acreedor', type: 'text', full: true },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? '1/-1' : undefined }}>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>{f.label}</label>
                  <input type={f.type} style={inputStyle} value={(form as any)[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Tipo</label>
                <select style={inputStyle} value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as Debt['tipo'] }))}>
                  <option value="prestamo">Préstamo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="credito_proveedor">Crédito Proveedor</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Monto Original</label>
                <input type="number" style={inputStyle} value={form.montoOriginal} onChange={e => setForm(f => ({ ...f, montoOriginal: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Saldo Actual</label>
                <input type="number" style={inputStyle} value={form.saldoActual} onChange={e => setForm(f => ({ ...f, saldoActual: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Cuota Mínima/Mes</label>
                <input type="number" style={inputStyle} value={form.cuotaMinima} onChange={e => setForm(f => ({ ...f, cuotaMinima: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Próximo Pago</label>
                <input type="date" style={inputStyle} value={form.fechaProximoPago || ''} onChange={e => setForm(f => ({ ...f, fechaProximoPago: e.target.value }))} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ display: 'block', fontSize: '0.7rem', color: '#71717a', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.3rem' }}>Notas</label>
                <input type="text" style={inputStyle} value={form.notas || ''} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Ej. Banco Bogotá, cuota 5 de 24" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #222' }}>
              <button onClick={() => setModal(false)} className="btn btn-outline">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">{saving ? '...' : editing ? 'Actualizar' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
