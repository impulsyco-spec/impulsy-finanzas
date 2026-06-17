import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Filter, Check, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLedger } from '../hooks/useLedger';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useTeam } from '../hooks/useTeam';
import { AddLedgerModal } from '../components/AddLedgerModal';
import { supabase } from '../lib/supabase';
import { hoyISO } from '../lib/dates';
import { LedgerMovement, TIPO_MOV_LABELS, CATS_EGRESO, CATS_INGRESO } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');

const estadoColor: Record<string, string> = {
  confirmado: '#10b981', esperado: '#f59e0b',
  facturado: '#60a5fa', vencido: '#ef4444', anulado: '#71717a',
};

const naturalezaColor = (n: string) =>
  n === 'ingreso' ? '#10b981' : n === 'egreso' ? '#ef4444' : '#a1a1aa';

const emptyBulk = { estado: '', categoria: '', cuenta: '', proyecto: '' };

export const Movimientos: React.FC = () => {
  const { movements, realAccounts, pockets, loading, refetch } = useLedger();
  const { clients, projects } = useSupabaseData();
  const { members: teamMembers } = useTeam();
  const [searchParams] = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerMovement | null>(null);
  const [defaultNaturaleza, setDefaultNaturaleza] = useState<'ingreso' | 'egreso' | 'neutro' | undefined>(undefined);
  const currentMonth = hoyISO().slice(0, 7); // YYYY-MM
  const [filters, setFilters] = useState({ tipo: '', naturaleza: '', mes: currentMonth, estado: '', project: '', search: '', categoria: '', orden: 'desc' as 'asc' | 'desc' });

  // Bulk edit
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkForm, setBulkForm] = useState(emptyBulk);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Pre-fill mes filter from URL ?mes=YYYY-MM
  useEffect(() => {
    const mes = searchParams.get('mes');
    if (mes) setFilters(f => ({ ...f, mes }));
  }, [searchParams]);

  const filtered = useMemo(() => {
    const base = movements.filter(m => {
      if (filters.tipo      && m.tipoMovimiento !== filters.tipo)        return false;
      if (filters.naturaleza && m.naturaleza    !== filters.naturaleza)  return false;
      if (filters.mes       && !m.fecha.startsWith(filters.mes))          return false;
      if (filters.estado    && m.estado         !== filters.estado)      return false;
      if (filters.project   && m.projectId      !== filters.project)     return false;
      if (filters.categoria && m.categoria      !== filters.categoria)   return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!m.descripcion.toLowerCase().includes(q) &&
            !(m.tercero || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return [...base].sort((a, b) =>
      filters.orden === 'asc' ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha)
    );
  }, [movements, filters]);

  const totIng = filtered.filter(m => m.naturaleza === 'ingreso' && m.estado === 'confirmado').reduce((s, m) => s + m.valor, 0);
  const totEgr = filtered.filter(m => m.naturaleza === 'egreso'  && m.estado === 'confirmado').reduce((s, m) => s + m.valor, 0);

  // Set de IDs de cuentas activas — para detectar movimientos huérfanos (ID inválido)
  const activeAccountIds = useMemo(() => new Set(realAccounts.map(a => a.id)), [realAccounts]);

  // Caja total = base inicial de cuentas + todos los ingresos confirmados - todos los egresos confirmados
  const saldoActual = useMemo(() => {
    const base = realAccounts.reduce((s, a) => s + a.saldoInicial, 0);
    const ing  = movements.filter(m => m.estado === 'confirmado' && m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
    const egr  = movements.filter(m => m.estado === 'confirmado' && m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
    return base + ing - egr;
  }, [movements, realAccounts]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    const mov = movements.find(m => m.id === id);
    await supabase.from('ledger_movements').delete().eq('id', id);
    // Si era un salario del fundador, borrar también su espejo en el mundo Personal
    await supabase.from('personal_movements').delete().eq('fuente', `salario:${id}`);
    // Si estaba vinculado a un pago, resetear el pago a pendiente
    if (mov?.paymentId) {
      await supabase.from('payments').update({ status: 'pending', actual_amount: null, ledger_movement_id: null }).eq('id', mov.paymentId);
    }
    setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
    refetch();
  };

  const toggleSelect = (id: string) => setSelected(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  const toggleAll = () => {
    if (selected.size === filtered.length) { setSelected(new Set()); }
    else { setSelected(new Set(filtered.map(m => m.id))); }
  };

  const handleBulkSave = async () => {
    if (!selected.size) return;
    setBulkSaving(true);
    try {
      const patch: Record<string, any> = {};
      if (bulkForm.estado)    patch.estado         = bulkForm.estado;
      if (bulkForm.categoria) patch.categoria      = bulkForm.categoria;
      if (bulkForm.cuenta)    patch.cuenta_real_id = bulkForm.cuenta;
      if (bulkForm.proyecto)  patch.project_id     = bulkForm.proyecto;
      if (!Object.keys(patch).length) { setBulkOpen(false); return; }
      patch.updated_at = new Date().toISOString();
      const ids = Array.from(selected);
      await supabase.from('ledger_movements').update(patch).in('id', ids);
      // Si se cambió a confirmado y hay payment vinculado, sincronizar
      if (bulkForm.estado === 'confirmado') {
        for (const id of ids) {
          const mov = movements.find(m => m.id === id);
          if (mov?.paymentId) {
            await supabase.from('payments').update({ status: 'paid', actual_amount: mov.valor }).eq('id', mov.paymentId);
          }
        }
      }
      setSelected(new Set()); setBulkForm(emptyBulk); setBulkOpen(false);
      refetch();
    } finally { setBulkSaving(false); }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar ${selected.size} movimiento(s)?`)) return;
    setBulkSaving(true);
    try {
      const ids = Array.from(selected);
      for (const id of ids) {
        const mov = movements.find(m => m.id === id);
        if (mov?.paymentId) {
          await supabase.from('payments').update({ status: 'pending', actual_amount: null, ledger_movement_id: null }).eq('id', mov.paymentId);
        }
      }
      await supabase.from('ledger_movements').delete().in('id', ids);
      // Borrar espejos de salario en el mundo Personal para los ids eliminados
      await supabase.from('personal_movements').delete().in('fuente', ids.map(i => `salario:${i}`));
      setSelected(new Set());
      refetch();
    } finally { setBulkSaving(false); }
  };

  const openAdd  = (nat?: 'ingreso' | 'egreso' | 'neutro') => { setEditing(null); setDefaultNaturaleza(nat); setModalOpen(true); };
  const openEdit = (m: LedgerMovement) => { setEditing(m); setDefaultNaturaleza(undefined); setModalOpen(true); };

  const sel: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'inherit' };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando movimientos...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Movimientos</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Libro maestro — fuente única de verdad financiera.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => openAdd('ingreso')}
            style={{ background: '#10b981', color: '#000', border: 'none', fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit', fontSize: '0.875rem' }}>
            <Plus size={15} /> Ingreso
          </button>
          <button onClick={() => openAdd('egreso')}
            style={{ background: '#ef4444', color: '#fff', border: 'none', fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit', fontSize: '0.875rem' }}>
            <Plus size={15} /> Egreso
          </button>
          <button onClick={() => openAdd('neutro')}
            style={{ background: '#3f3f46', color: '#fff', border: 'none', fontWeight: 700, padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'inherit', fontSize: '0.875rem' }}>
            <Plus size={15} /> Otro
          </button>
        </div>
      </header>

      {/* Resumen */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
        {[
          { label: 'Ingresos confirmados', value: fmt(totIng),          color: '#10b981' },
          { label: 'Egresos confirmados',  value: fmt(totEgr),          color: '#ef4444' },
          { label: 'Balance del período',  value: fmt(totIng - totEgr), color: totIng - totEgr >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Caja total',            value: fmt(saldoActual),     color: saldoActual >= 0 ? '#06b6d4' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '0.875rem 1rem' }}>
        <Filter size={14} style={{ color: '#71717a' }} />
        <input type="text" placeholder="Buscar..." value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          style={{ ...sel, minWidth: '160px' }} />
        <select style={sel} value={filters.naturaleza} onChange={e => setFilters(f => ({ ...f, naturaleza: e.target.value }))}>
          <option value="">Ingreso / Egreso</option>
          <option value="ingreso">Ingreso</option>
          <option value="egreso">Egreso</option>
          <option value="neutro">Neutro</option>
        </select>
        <select style={sel} value={filters.tipo} onChange={e => setFilters(f => ({ ...f, tipo: e.target.value }))}>
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_MOV_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          type="month"
          style={{ ...sel, colorScheme: 'dark' }}
          value={filters.mes}
          onChange={e => setFilters(f => ({ ...f, mes: e.target.value }))}
          title="Filtrar por mes y año"
        />
        <select style={sel} value={filters.estado} onChange={e => setFilters(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {['confirmado','esperado','facturado','vencido','anulado'].map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select style={sel} value={filters.project} onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}>
          <option value="">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select style={sel} value={filters.categoria} onChange={e => setFilters(f => ({ ...f, categoria: e.target.value }))}>
          <option value="">Todas las categorías</option>
          {[...CATS_INGRESO, ...CATS_EGRESO].filter((v, i, a) => a.indexOf(v) === i).sort().map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button
          onClick={() => setFilters(f => ({ ...f, orden: f.orden === 'desc' ? 'asc' : 'desc' }))}
          style={{ ...sel, cursor: 'pointer', whiteSpace: 'nowrap', background: 'none' }}>
          {filters.orden === 'desc' ? '↓ Más nuevos' : '↑ Más antiguos'}
        </button>
        <button onClick={() => setFilters({ tipo: '', naturaleza: '', mes: currentMonth, estado: '', project: '', search: '', categoria: '', orden: 'desc' })}
          className="btn btn-outline" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}>
          Limpiar
        </button>
        <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '0.8rem' }}>{filtered.length} movimientos</span>
      </div>

      {/* Panel bulk edit */}
      {selected.size > 0 && (
        <div style={{ background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>{selected.size} seleccionado(s)</span>
            <button onClick={() => setBulkOpen(o => !o)} className="btn btn-primary" style={{ padding: '0.35rem 0.875rem', fontSize: '0.8rem' }}>
              {bulkOpen ? 'Cerrar edición' : 'Editar selección'}
            </button>
            <button onClick={handleBulkDelete} disabled={bulkSaving} style={{ background: 'none', border: '1px solid #ef444455', color: '#ef4444', padding: '0.35rem 0.875rem', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              Eliminar selección
            </button>
            <button onClick={() => { setSelected(new Set()); setBulkOpen(false); setBulkForm(emptyBulk); }} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', marginLeft: 'auto' }}>
              <X size={16} />
            </button>
          </div>
          {bulkOpen && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#71717a', marginBottom: '0.2rem', textTransform: 'uppercase', fontWeight: 700 }}>Estado</div>
                <select value={bulkForm.estado} onChange={e => setBulkForm(f => ({ ...f, estado: e.target.value }))} style={sel}>
                  <option value="">— sin cambio —</option>
                  {['confirmado','esperado','facturado','vencido','anulado'].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#71717a', marginBottom: '0.2rem', textTransform: 'uppercase', fontWeight: 700 }}>Categoría</div>
                <select value={bulkForm.categoria} onChange={e => setBulkForm(f => ({ ...f, categoria: e.target.value }))} style={sel}>
                  <option value="">— sin cambio —</option>
                  {[...CATS_INGRESO, ...CATS_EGRESO].filter((v,i,a) => a.indexOf(v) === i).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#71717a', marginBottom: '0.2rem', textTransform: 'uppercase', fontWeight: 700 }}>Cuenta</div>
                <select value={bulkForm.cuenta} onChange={e => setBulkForm(f => ({ ...f, cuenta: e.target.value }))} style={sel}>
                  <option value="">— sin cambio —</option>
                  {realAccounts.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: '0.65rem', color: '#71717a', marginBottom: '0.2rem', textTransform: 'uppercase', fontWeight: 700 }}>Proyecto</div>
                <select value={bulkForm.proyecto} onChange={e => setBulkForm(f => ({ ...f, proyecto: e.target.value }))} style={sel}>
                  <option value="">— sin cambio —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <button onClick={handleBulkSave} disabled={bulkSaving} className="btn btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Check size={14} /> {bulkSaving ? 'Guardando...' : 'Aplicar a todos'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: '36px' }}>
                  <input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#10b981' }} />
                </th>
                <th>Fecha</th>
                <th>Descripción</th>
                <th>Tipo</th>
                <th>Categoría</th>
                <th>Proyecto</th>
                <th>Estado</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => {
                const proj = projects.find(p => p.id === m.projectId);
                // Huérfano: sin cuenta (null) O con ID apuntando a cuenta inactiva/eliminada
                const sinCuenta = m.estado === 'confirmado' && (!m.cuentaRealId || !activeAccountIds.has(m.cuentaRealId));
                return (
                  <tr key={m.id} style={{
                    background: selected.has(m.id) ? 'rgba(16,185,129,0.05)' : sinCuenta ? 'rgba(245,158,11,0.04)' : undefined,
                    borderLeft: sinCuenta ? '3px solid #f59e0b' : undefined,
                  }}>
                    <td>
                      <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)}
                        style={{ cursor: 'pointer', accentColor: '#10b981' }} />
                    </td>
                    <td style={{ color: '#a0aec0', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td>
                      <div style={{ color: '#fff', fontWeight: 500 }}>{m.descripcion}</div>
                      {m.tercero && <div style={{ fontSize: '0.75rem', color: '#71717a' }}>{m.tercero}</div>}
                      {m.personalFlag && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>⚠️ personal</span>}
                      {sinCuenta && (
                        <span title={m.cuentaRealId ? 'Cuenta asignada ya no existe — reasigna este movimiento a una cuenta activa' : 'Sin cuenta asignada — este movimiento no se refleja en ningún saldo de cuenta'} style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.1rem' }}>
                          ⚠ {m.cuentaRealId ? 'Cuenta eliminada' : 'Sin cuenta asignada'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: naturalezaColor(m.naturaleza) }}>
                        {m.naturaleza === 'ingreso' ? '↑' : m.naturaleza === 'egreso' ? '↓' : '⇄'} {TIPO_MOV_LABELS[m.tipoMovimiento]}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{m.categoria || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{proj?.name || '—'}</td>
                    <td>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: estadoColor[m.estado] || '#fff', background: `${estadoColor[m.estado] || '#666'}18`, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                        {m.estado}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700, color: naturalezaColor(m.naturaleza), whiteSpace: 'nowrap' }}>
                      {m.naturaleza === 'egreso' ? '-' : ''}{fmt(m.valor)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button onClick={() => openEdit(m)} style={{ background: 'none', border: '1px solid #333', color: '#a0aec0', padding: '0.3rem 0.5rem', borderRadius: '6px', cursor: 'pointer' }}>
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(m.id)} style={{ background: 'none', border: '1px solid #333', color: '#ef4444', padding: '0.3rem 0.5rem', borderRadius: '6px', cursor: 'pointer' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ textAlign: 'center', color: '#71717a', padding: '3rem' }}>
                  Sin movimientos con los filtros actuales
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddLedgerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        realAccounts={realAccounts}
        pockets={pockets}
        projects={projects}
        clients={clients}
        teamMembers={teamMembers}
        movements={movements}
        editing={editing}
        defaultNaturaleza={editing ? undefined : defaultNaturaleza}
      />
    </div>
  );
};
