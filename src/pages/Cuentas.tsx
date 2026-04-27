import React, { useState } from 'react';
import { Plus, X, Pencil, Trash2, Check } from 'lucide-react';
import { useLedger } from '../hooks/useLedger';
import { supabase } from '../lib/supabase';
import { RealAccount, Pocket } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

const POCKET_COLORS: Record<string, string> = {
  'Operación': '#a855f7', 'Sueldo': '#06b6d4', 'Reserva': '#f59e0b',
  'Impuestos': '#f97316', 'Inversión': '#10b981', 'Deuda': '#ef4444',
};

const inp: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #333', color: '#fff',
  padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem',
  fontFamily: 'inherit', width: '100%',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem',
};

export const Cuentas: React.FC = () => {
  const { movements, realAccounts, pockets, loading, refetch } = useLedger();
  const [showAdd, setShowAdd] = useState(false);
  const [newAcc, setNewAcc] = useState({ nombre: '', tipo: 'bancaria', saldo_inicial: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nombre: '', tipo: 'bancaria', saldo_inicial: '' });

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  const saldoCuenta = (acc: RealAccount) => {
    const confirmed = movements.filter(m => m.cuentaRealId === acc.id && m.estado === 'confirmado');
    const ing = confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
    const egr = confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
    return acc.saldoInicial + ing - egr;
  };

  const saldoPocket = (pocket: Pocket) => {
    const confirmed = movements.filter(m => m.pocketId === pocket.id && m.estado === 'confirmado');
    const ing = confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
    const egr = confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
    return ing - egr;
  };

  const totalCaja = realAccounts.reduce((s, a) => s + saldoCuenta(a), 0);
  const cajaComprometida = movements
    .filter(m => m.naturaleza === 'egreso' && (m.estado === 'esperado' || m.estado === 'facturado'))
    .reduce((s, m) => s + m.valor, 0);

  const handleAdd = async () => {
    if (!newAcc.nombre.trim()) return;
    setSaving(true);
    try {
      await supabase.from('real_accounts').insert({
        nombre: newAcc.nombre.trim(),
        tipo: newAcc.tipo,
        saldo_inicial: Number(newAcc.saldo_inicial.replace(/\./g, '')) || 0,
        activa: true,
      });
      setNewAcc({ nombre: '', tipo: 'bancaria', saldo_inicial: '' });
      setShowAdd(false);
      refetch();
    } finally { setSaving(false); }
  };

  const startEdit = (acc: RealAccount) => {
    setEditingId(acc.id);
    setEditForm({
      nombre: acc.nombre,
      tipo: acc.tipo,
      saldo_inicial: String(Math.round(acc.saldoInicial)),
    });
  };

  const handleEdit = async (acc: RealAccount) => {
    setSaving(true);
    try {
      const nuevoSaldo = Number(editForm.saldo_inicial.replace(/\./g, '')) || 0;
      await supabase.from('real_accounts').update({
        nombre: editForm.nombre.trim(),
        tipo: editForm.tipo,
        saldo_inicial: nuevoSaldo,
      }).eq('id', acc.id);

      // Auto-crear movimiento de ajuste si cambió el saldo inicial
      const diff = nuevoSaldo - acc.saldoInicial;
      if (diff !== 0) {
        await supabase.from('ledger_movements').insert({
          fecha: new Date().toISOString().split('T')[0],
          tipo_movimiento: 'ajuste',
          naturaleza: diff > 0 ? 'ingreso' : 'egreso',
          descripcion: `Reposición de saldo — ${editForm.nombre.trim()}`,
          valor: Math.abs(diff),
          categoria: 'Otro',
          estado: 'confirmado',
          cuenta_real_id: acc.id,
          mes: new Date().toLocaleDateString('es-CO', { month: 'long' }),
          personal_flag: false,
        });
      }

      setEditingId(null);
      refetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta asignada.')) return;
    await supabase.from('real_accounts').update({ activa: false }).eq('id', id);
    refetch();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Cuentas & Distribución</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Cuentas reales (dónde está) y bolsillos (para qué es).</p>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
        {[
          { label: 'Caja Total',   value: fmt(totalCaja),                       color: '#fff' },
          { label: 'Comprometida', value: fmt(cajaComprometida),                 color: '#f59e0b' },
          { label: 'Caja Libre',   value: fmt(totalCaja - cajaComprometida),     color: totalCaja - cajaComprometida >= 0 ? '#10b981' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.5rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Cuentas reales */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ color: '#fff', fontWeight: 700 }}>
            Cuentas Reales <span style={{ color: '#71717a', fontWeight: 400, fontSize: '0.9rem' }}>(dónde está el dinero)</span>
          </h2>
          <button className="btn btn-outline" style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }} onClick={() => setShowAdd(!showAdd)}>
            <Plus size={14} /> Agregar Cuenta
          </button>
        </div>

        {showAdd && (
          <div className="card" style={{ marginBottom: '1rem', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'flex-end', padding: '1rem' }}>
            <div>
              <label style={lbl}>Nombre</label>
              <input style={inp} value={newAcc.nombre} onChange={e => setNewAcc(n => ({ ...n, nombre: e.target.value }))} placeholder="Bancolombia, Hapi..." />
            </div>
            <div>
              <label style={lbl}>Tipo</label>
              <select style={inp} value={newAcc.tipo} onChange={e => setNewAcc(n => ({ ...n, tipo: e.target.value }))}>
                <option value="bancaria">Bancaria</option>
                <option value="digital">Digital</option>
                <option value="efectivo">Efectivo</option>
                <option value="tarjeta">Tarjeta</option>
                <option value="personal">Personal</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Saldo Inicial</label>
              <input style={inp} type="text" inputMode="numeric" value={newAcc.saldo_inicial}
                onChange={e => setNewAcc(n => ({ ...n, saldo_inicial: fmtInput(e.target.value) }))} placeholder="0" />
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ padding: '0.5rem 0.8rem', fontSize: '0.82rem' }}>
                {saving ? '...' : 'Guardar'}
              </button>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', color: '#71717a', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px,1fr))', gap: '1rem' }}>
          {realAccounts.map(acc => {
            const saldo = saldoCuenta(acc);
            const isEditing = editingId === acc.id;
            return (
              <div key={acc.id} className="card" style={{ padding: '1.25rem' }}>
                {isEditing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    <div>
                      <label style={lbl}>Nombre</label>
                      <input style={inp} value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
                    </div>
                    <div>
                      <label style={lbl}>Tipo</label>
                      <select style={inp} value={editForm.tipo} onChange={e => setEditForm(f => ({ ...f, tipo: e.target.value }))}>
                        <option value="bancaria">Bancaria</option>
                        <option value="digital">Digital</option>
                        <option value="efectivo">Efectivo</option>
                        <option value="tarjeta">Tarjeta</option>
                        <option value="personal">Personal</option>
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Saldo inicial (ajusta el balance)</label>
                      <input style={inp} type="text" inputMode="numeric"
                        value={editForm.saldo_inicial}
                        onChange={e => setEditForm(f => ({ ...f, saldo_inicial: fmtInput(e.target.value) }))} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                      <button className="btn btn-primary" onClick={() => handleEdit(acc)} disabled={saving} style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}>
                        <Check size={13} /> {saving ? '...' : 'Guardar'}
                      </button>
                      <button className="btn btn-outline" onClick={() => setEditingId(null)} style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}>
                        Cancelar
                      </button>
                    </div>
                    <p style={{ fontSize: '0.65rem', color: '#52525b', textAlign: 'center' }}>
                      Si cambias el saldo inicial se registrará un movimiento de ajuste automáticamente.
                    </p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{acc.nombre}</div>
                        <div style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '0.2rem' }}>{acc.tipo}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => startEdit(acc)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Editar">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(acc.id)} style={{ background: 'none', border: 'none', color: '#ef444488', cursor: 'pointer', padding: '0.25rem' }} title="Eliminar">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: saldo >= 0 ? '#fff' : '#ef4444' }}>{fmt(saldo)}</div>
                    <div style={{ height: '4px', background: '#222', borderRadius: '2px', marginTop: '0.75rem' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, Math.abs(saldo) / Math.max(totalCaja, 1) * 100)}%`, background: '#fff', borderRadius: '2px' }} />
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '0.5rem' }}>Saldo inicial: {fmt(acc.saldoInicial)}</div>
                  </>
                )}
              </div>
            );
          })}
          {realAccounts.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: '2rem', textAlign: 'center', color: '#71717a', border: '1px dashed #333', borderRadius: '12px' }}>
              No hay cuentas. Agrega tu primera cuenta ↑
            </div>
          )}
        </div>
      </div>

      {/* Bolsillos */}
      <div>
        <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>
          Bolsillos <span style={{ color: '#71717a', fontWeight: 400, fontSize: '0.9rem' }}>(para qué es el dinero)</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '1rem' }}>
          {pockets.map(pocket => {
            const saldo = saldoPocket(pocket);
            const color = POCKET_COLORS[pocket.nombre] || '#a855f7';
            return (
              <div key={pocket.id} className="card" style={{ padding: '1.25rem', borderColor: `${color}33` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, color: '#fff' }}>{pocket.nombre}</span>
                  {pocket.porcentajeDefault && (
                    <span style={{ fontSize: '0.7rem', color, background: `${color}18`, padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                      {pocket.porcentajeDefault}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color }}>{fmt(saldo)}</div>
                <div style={{ height: '3px', background: '#222', borderRadius: '2px', marginTop: '0.75rem' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, Math.abs(saldo) / Math.max(totalCaja || 1, 1) * 100)}%`, background: color, borderRadius: '2px' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
