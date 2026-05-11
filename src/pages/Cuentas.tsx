import React, { useState } from 'react';
import { Plus, X, Pencil, Trash2, Check, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useLedger } from '../hooks/useLedger';
import { supabase } from '../lib/supabase';
import { RealAccount, Pocket, MESES_ES } from '../types';

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
  const [editForm, setEditForm] = useState({ nombre: '', tipo: 'bancaria', targetBalance: '' });
  const [editSaldoInicialId, setEditSaldoInicialId] = useState<string | null>(null);
  const [editSaldoInicialVal, setEditSaldoInicialVal] = useState('');
  const [desgloseId, setDesgloseId] = useState<string | null>(null);
  const [showSinCuentaPanel, setShowSinCuentaPanel] = useState(false);
  // cuentaRealId seleccionada por movimiento: { [movId]: cuentaRealId }
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});
  const [bulkAccount, setBulkAccount] = useState('');
  const [savingAssign, setSavingAssign] = useState<Set<string>>(new Set());

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

  // Fórmula global — idéntica a calcKPIs y Movimientos.saldoActual
  // No filtra por cuentaRealId: todos los confirmados cuentan, asignados o no
  const confirmed = movements.filter(m => m.estado === 'confirmado');
  const totalCaja =
    realAccounts.reduce((s, a) => s + a.saldoInicial, 0) +
    confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0) -
    confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  // Comprometida limitada a 3 meses (consistente con el panel de Inicio)
  const horizonDate = new Date();
  horizonDate.setMonth(horizonDate.getMonth() + 3);
  const horizonMs = `${horizonDate.getFullYear()}-${String(horizonDate.getMonth() + 1).padStart(2, '0')}`;
  const cajaComprometida = movements
    .filter(m => m.naturaleza === 'egreso' && (m.estado === 'esperado' || m.estado === 'facturado') && m.fecha.slice(0, 7) <= horizonMs)
    .reduce((s, m) => s + m.valor, 0);

  // Detecta AMBOS casos: sin cuenta (null) Y con ID apuntando a cuenta inactiva/eliminada
  const activeAccountIds = new Set(realAccounts.map(a => a.id));
  const sinCuenta = movements.filter(m =>
    m.estado === 'confirmado' &&
    (!m.cuentaRealId || !activeAccountIds.has(m.cuentaRealId))
  );
  const sinCuentaIng = sinCuenta.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const sinCuentaEgr = sinCuenta.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);

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
      // Pre-fill with current COMPUTED balance so user sees what the system thinks
      targetBalance: String(Math.round(saldoCuenta(acc))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'),
    });
  };

  const handleEdit = async (acc: RealAccount) => {
    setSaving(true);
    try {
      const targetBalance = Number(editForm.targetBalance.replace(/\./g, '')) || 0;
      const currentBalance = saldoCuenta(acc);
      const diff = targetBalance - currentBalance;

      // Always update nombre/tipo
      await supabase.from('real_accounts').update({
        nombre: editForm.nombre.trim(),
        tipo: editForm.tipo,
      }).eq('id', acc.id);

      // Create adjustment movement if balance differs
      if (diff !== 0) {
        await supabase.from('ledger_movements').insert({
          fecha: new Date().toISOString().split('T')[0],
          tipo_movimiento: 'ajuste',
          naturaleza: diff > 0 ? 'ingreso' : 'egreso',
          descripcion: `Ajuste de conciliación — ${editForm.nombre.trim()}`,
          valor: Math.abs(diff),
          categoria: 'Otro',
          estado: 'confirmado',
          cuenta_real_id: acc.id,
          mes: MESES_ES[new Date().getMonth()],
          personal_flag: false,
        });
      }

      setEditingId(null);
      refetch();
    } finally { setSaving(false); }
  };

  const handleFixSaldoInicial = async (acc: RealAccount) => {
    const nuevo = Number(editSaldoInicialVal.replace(/\./g, '')) || 0;
    if (!confirm(`¿Corregir el saldo inicial de "${acc.nombre}" a ${fmt(nuevo)}?\n\nEsto NO crea ningún movimiento — solo corrige el valor de apertura. Asegúrate de haber eliminado primero cualquier movimiento de ajuste incorrecto.`)) return;
    setSaving(true);
    try {
      await supabase.from('real_accounts').update({ saldo_inicial: nuevo }).eq('id', acc.id);
      setEditSaldoInicialId(null);
      setEditSaldoInicialVal('');
      refetch();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar esta cuenta? Los movimientos asociados quedarán sin cuenta asignada.')) return;
    await supabase.from('real_accounts').update({ activa: false }).eq('id', id);
    refetch();
  };

  // Asignar un movimiento huérfano a una cuenta
  const handleAssign = async (movId: string) => {
    const cuentaId = assignMap[movId];
    if (!cuentaId) { alert('Selecciona una cuenta primero.'); return; }
    setSavingAssign(prev => new Set(prev).add(movId));
    try {
      await supabase.from('ledger_movements').update({ cuenta_real_id: cuentaId }).eq('id', movId);
      setAssignMap(prev => { const n = { ...prev }; delete n[movId]; return n; });
      refetch();
    } finally {
      setSavingAssign(prev => { const n = new Set(prev); n.delete(movId); return n; });
    }
  };

  // Asignar todos los movimientos sin cuenta a la misma cuenta
  const handleBulkAssign = async (sinCuentaList: { id: string }[]) => {
    if (!bulkAccount) { alert('Selecciona una cuenta para asignar todos.'); return; }
    if (!confirm(`¿Asignar ${sinCuentaList.length} movimiento(s) a la cuenta seleccionada?`)) return;
    setSaving(true);
    try {
      const ids = sinCuentaList.map(m => m.id);
      await supabase.from('ledger_movements').update({ cuenta_real_id: bulkAccount }).in('id', ids);
      setAssignMap({});
      setBulkAccount('');
      setShowSinCuentaPanel(false);
      refetch();
    } finally { setSaving(false); }
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
          { label: 'Comprometida (3 m)', value: fmt(cajaComprometida),            color: '#f59e0b' },
          { label: 'Caja Libre',   value: fmt(totalCaja - cajaComprometida),     color: totalCaja - cajaComprometida >= 0 ? '#10b981' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.5rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Movimientos confirmados sin cuenta válida — alerta + panel inline */}
      {sinCuenta.length > 0 && (
        <div style={{ border: '1px solid #f59e0b44', borderRadius: '12px', overflow: 'hidden' }}>

          {/* Cabecera de la alerta */}
          <div style={{ background: '#111', padding: '1rem 1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem' }}>
                ⚠️ {sinCuenta.length} movimiento(s) sin cuenta válida
              </div>
              <div style={{ fontSize: '0.78rem', color: '#71717a' }}>
                Sin cuenta asignada o apuntan a una cuenta eliminada. Reasígnalos para que el saldo concuerde.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexShrink: 0 }}>
              {sinCuentaIng > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Ingresos</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#10b981' }}>{fmt(sinCuentaIng)}</div>
                </div>
              )}
              {sinCuentaEgr > 0 && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Egresos</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#ef4444' }}>{fmt(sinCuentaEgr)}</div>
                </div>
              )}
              <button
                onClick={() => setShowSinCuentaPanel(v => !v)}
                style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, border: '1px solid #f59e0b55', background: showSinCuentaPanel ? '#f59e0b' : 'transparent', color: showSinCuentaPanel ? '#000' : '#f59e0b', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.35rem', transition: 'all 0.15s' }}>
                {showSinCuentaPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                {showSinCuentaPanel ? 'Ocultar' : 'Ver y reasignar'}
              </button>
            </div>
          </div>

          {/* Panel expandible con tabla y controles de asignación */}
          {showSinCuentaPanel && (
            <div style={{ background: '#0a0a0a', borderTop: '1px solid #f59e0b22' }}>

              {/* Bulk assign */}
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #1a1a1a', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#52525b', fontWeight: 700 }}>Asignar todos a:</span>
                <select
                  value={bulkAccount}
                  onChange={e => setBulkAccount(e.target.value)}
                  style={{ ...inp, width: 'auto', minWidth: '180px', padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}>
                  <option value="">— Seleccionar cuenta —</option>
                  {realAccounts.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
                <button
                  onClick={() => handleBulkAssign(sinCuenta)}
                  disabled={saving || !bulkAccount}
                  style={{ padding: '0.35rem 0.875rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 700, border: 'none', background: bulkAccount ? '#f59e0b' : '#2a2a2a', color: bulkAccount ? '#000' : '#52525b', cursor: bulkAccount ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                  {saving ? 'Guardando...' : `Asignar ${sinCuenta.length} movimientos`}
                </button>
                <span style={{ fontSize: '0.68rem', color: '#3f3f46', marginLeft: 'auto' }}>
                  O reasigna fila por fila ↓
                </span>
              </div>

              {/* Tabla de movimientos huérfanos */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <th style={{ padding: '0.5rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Fecha</th>
                      <th style={{ padding: '0.5rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Descripción</th>
                      <th style={{ padding: '0.5rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Tipo</th>
                      <th style={{ padding: '0.5rem 1rem', textAlign: 'right', color: '#52525b', fontWeight: 600 }}>Valor</th>
                      <th style={{ padding: '0.5rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Asignar cuenta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinCuenta
                      .slice()
                      .sort((a, b) => b.fecha.localeCompare(a.fecha))
                      .map(m => {
                        const isSaving = savingAssign.has(m.id);
                        const selectedCuenta = assignMap[m.id] ?? '';
                        return (
                          <tr key={m.id} style={{ borderBottom: '1px solid #141414' }}>
                            <td style={{ padding: '0.5rem 1rem', color: '#a0aec0', whiteSpace: 'nowrap' }}>
                              {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </td>
                            <td style={{ padding: '0.5rem 1rem' }}>
                              <div style={{ color: '#fff' }}>{m.descripcion}</div>
                              {m.cuentaRealId && (
                                <div style={{ fontSize: '0.65rem', color: '#f59e0b', marginTop: '0.1rem' }}>
                                  ⚠ Cuenta eliminada
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '0.75rem', color: m.naturaleza === 'ingreso' ? '#10b981' : m.naturaleza === 'egreso' ? '#ef4444' : '#a1a1aa' }}>
                                {m.naturaleza === 'ingreso' ? '↑' : m.naturaleza === 'egreso' ? '↓' : '⇄'} {m.tipoMovimiento.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: m.naturaleza === 'ingreso' ? '#10b981' : m.naturaleza === 'egreso' ? '#ef4444' : '#a1a1aa' }}>
                              {m.naturaleza === 'egreso' ? '-' : ''}{fmt(m.valor)}
                            </td>
                            <td style={{ padding: '0.5rem 1rem' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <select
                                  value={selectedCuenta}
                                  onChange={e => setAssignMap(prev => ({ ...prev, [m.id]: e.target.value }))}
                                  style={{ ...inp, width: 'auto', minWidth: '150px', padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}>
                                  <option value="">— Cuenta —</option>
                                  {realAccounts.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                </select>
                                <button
                                  onClick={() => handleAssign(m.id)}
                                  disabled={isSaving || !selectedCuenta}
                                  style={{ padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, border: 'none', background: selectedCuenta ? '#10b981' : '#2a2a2a', color: selectedCuenta ? '#000' : '#52525b', cursor: selectedCuenta ? 'pointer' : 'not-allowed', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                  {isSaving ? '...' : <Check size={13} />}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

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
            const targetVal = isEditing ? (Number(editForm.targetBalance.replace(/\./g, '')) || 0) : 0;
            const diff = isEditing ? targetVal - saldo : 0;
            const diffColor = diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : '#52525b';
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
                      <label style={lbl}>Saldo real actual (lo que muestra tu banco/app)</label>
                      <input style={inp} type="text" inputMode="numeric"
                        value={editForm.targetBalance}
                        onChange={e => setEditForm(f => ({ ...f, targetBalance: fmtInput(e.target.value) }))}
                        placeholder={fmt(saldo)} />
                    </div>
                    <div style={{ background: '#0d0d0d', border: `1px solid ${diff !== 0 ? diffColor + '44' : '#222'}`, borderRadius: '8px', padding: '0.6rem 0.75rem', fontSize: '0.78rem' }}>
                      <div style={{ color: '#52525b', marginBottom: '0.2rem' }}>Sistema actual: <span style={{ color: '#fff' }}>{fmt(saldo)}</span></div>
                      {diff !== 0 ? (
                        <div style={{ color: diffColor, fontWeight: 700 }}>
                          Se registrará un ajuste de {diff > 0 ? '+' : ''}{fmt(diff)}
                        </div>
                      ) : (
                        <div style={{ color: '#52525b' }}>Sin cambios en el saldo</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                      <button className="btn btn-primary" onClick={() => handleEdit(acc)} disabled={saving} style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}>
                        <Check size={13} /> {saving ? '...' : 'Guardar'}
                      </button>
                      <button className="btn btn-outline" onClick={() => setEditingId(null)} style={{ flex: 1, padding: '0.45rem', fontSize: '0.8rem' }}>
                        Cancelar
                      </button>
                    </div>
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
                    <button
                      onClick={() => setDesgloseId(desgloseId === acc.id ? null : acc.id)}
                      style={{ marginTop: '0.6rem', background: 'none', border: '1px solid #2a2a2a', color: '#71717a', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontFamily: 'inherit', width: '100%', justifyContent: 'center' }}>
                      {desgloseId === acc.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {desgloseId === acc.id ? 'Ocultar desglose' : `Ver desglose (${movements.filter(m => m.cuentaRealId === acc.id && m.estado === 'confirmado').length} mov)`}
                    </button>
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

        {/* Panel de desglose */}
        {desgloseId && (() => {
          const acc = realAccounts.find(a => a.id === desgloseId);
          if (!acc) return null;
          const accMovs = movements
            .filter(m => m.cuentaRealId === acc.id && m.estado === 'confirmado')
            .sort((a, b) => a.fecha.localeCompare(b.fecha));
          const ing = accMovs.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
          const egr = accMovs.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
          const saldo = acc.saldoInicial + ing - egr;
          let running = acc.saldoInicial;
          return (
            <div style={{ marginTop: '1rem', background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Desglose: {acc.nombre}</span>
                  <span style={{ color: '#52525b', fontSize: '0.78rem', marginLeft: '0.75rem' }}>¿De dónde sale el saldo?</span>
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#10b981' }}>+{fmt(ing)} ingresos</span>
                  <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>{fmt(egr)} egresos</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff' }}>= {fmt(saldo)}</span>
                  <button onClick={() => setDesgloseId(null)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer' }}><X size={16} /></button>
                </div>
              </div>
              {/* Corrección de saldo inicial */}
              <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.72rem', color: '#52525b' }}>
                  <span style={{ color: '#71717a', fontWeight: 600 }}>Saldo inicial registrado:</span> {fmt(acc.saldoInicial)}
                  <span style={{ marginLeft: '0.5rem', color: '#3f3f46' }}>— Solo para corregir errores de configuración, sin crear movimiento</span>
                </div>
                {editSaldoInicialId === acc.id ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: 'auto' }}>
                    <input
                      type="text" inputMode="numeric"
                      value={editSaldoInicialVal}
                      onChange={e => setEditSaldoInicialVal(fmtInput(e.target.value))}
                      placeholder="ej: 2.344.000"
                      style={{ ...inp, width: '140px', padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                      autoFocus
                    />
                    <button onClick={() => handleFixSaldoInicial(acc)} disabled={saving}
                      style={{ background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {saving ? '...' : 'Corregir'}
                    </button>
                    <button onClick={() => { setEditSaldoInicialId(null); setEditSaldoInicialVal(''); }}
                      style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditSaldoInicialId(acc.id); setEditSaldoInicialVal(String(Math.round(acc.saldoInicial)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')); }}
                    style={{ marginLeft: 'auto', background: 'none', border: '1px solid #f59e0b44', color: '#f59e0b', borderRadius: '6px', padding: '0.3rem 0.75rem', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✏ Corregir saldo inicial
                  </button>
                )}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Fecha</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Descripción</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'left', color: '#52525b', fontWeight: 600 }}>Tipo</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'right', color: '#52525b', fontWeight: 600 }}>Valor</th>
                      <th style={{ padding: '0.6rem 1rem', textAlign: 'right', color: '#52525b', fontWeight: 600 }}>Saldo acumulado</th>
                      <th style={{ padding: '0.6rem 0.5rem' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Saldo inicial row */}
                    <tr style={{ borderBottom: '1px solid #141414', background: '#111' }}>
                      <td style={{ padding: '0.5rem 1rem', color: '#52525b' }}>—</td>
                      <td style={{ padding: '0.5rem 1rem', color: '#71717a', fontStyle: 'italic' }}>Saldo inicial registrado</td>
                      <td style={{ padding: '0.5rem 1rem', color: '#52525b' }}>—</td>
                      <td style={{ padding: '0.5rem 1rem', textAlign: 'right', color: '#71717a' }}>{fmt(acc.saldoInicial)}</td>
                      <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 700, color: '#71717a' }}>{fmt(acc.saldoInicial)}</td>
                      <td></td>
                    </tr>
                    {accMovs.map(m => {
                      running += m.naturaleza === 'ingreso' ? m.valor : -m.valor;
                      const isAjuste = m.tipoMovimiento === 'ajuste';
                      return (
                        <tr key={m.id} style={{ borderBottom: '1px solid #141414', background: isAjuste ? 'rgba(245,158,11,0.04)' : undefined }}>
                          <td style={{ padding: '0.5rem 1rem', color: '#a0aec0', whiteSpace: 'nowrap' }}>
                            {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '0.5rem 1rem' }}>
                            <div style={{ color: '#fff' }}>{m.descripcion}</div>
                            {isAjuste && <div style={{ fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}><AlertTriangle size={10} /> Movimiento de ajuste</div>}
                          </td>
                          <td style={{ padding: '0.5rem 1rem', color: m.naturaleza === 'ingreso' ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                            {m.naturaleza === 'ingreso' ? '↑' : '↓'} {m.tipoMovimiento.replace(/_/g, ' ')}
                          </td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 700, color: m.naturaleza === 'ingreso' ? '#10b981' : '#ef4444', whiteSpace: 'nowrap' }}>
                            {m.naturaleza === 'ingreso' ? '+' : '-'}{fmt(m.valor)}
                          </td>
                          <td style={{ padding: '0.5rem 1rem', textAlign: 'right', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                            {fmt(running)}
                          </td>
                          <td style={{ padding: '0.5rem 0.5rem' }}>
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Eliminar "${m.descripcion}"?\nEsto ajustará el saldo de la cuenta.`)) return;
                                await supabase.from('ledger_movements').delete().eq('id', m.id);
                                refetch();
                              }}
                              title="Eliminar este movimiento"
                              style={{ background: 'none', border: '1px solid #2a2a2a', color: '#ef444488', borderRadius: '4px', padding: '0.2rem 0.4rem', cursor: 'pointer' }}>
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {accMovs.length === 0 && (
                      <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: '#52525b' }}>
                        Sin movimientos confirmados — el saldo es solo el saldo inicial.
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
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
