import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Filter } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useLedger } from '../hooks/useLedger';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { AddLedgerModal } from '../components/AddLedgerModal';
import { supabase } from '../lib/supabase';
import { LedgerMovement, TIPO_MOV_LABELS, MESES_ES } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');

const estadoColor: Record<string, string> = {
  confirmado: '#10b981', esperado: '#f59e0b',
  facturado: '#60a5fa', vencido: '#ef4444', anulado: '#71717a',
};

const naturalezaColor = (n: string) =>
  n === 'ingreso' ? '#10b981' : n === 'egreso' ? '#ef4444' : '#a1a1aa';

export const Movimientos: React.FC = () => {
  const { movements, realAccounts, pockets, loading, refetch } = useLedger();
  const { clients, projects } = useSupabaseData();
  const [searchParams] = useSearchParams();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerMovement | null>(null);
  const [filters, setFilters] = useState({ tipo: '', naturaleza: '', mes: '', estado: '', project: '', search: '' });

  // Pre-fill mes filter from URL ?mes=YYYY-MM
  useEffect(() => {
    const mes = searchParams.get('mes');
    if (mes) setFilters(f => ({ ...f, mes }));
  }, [searchParams]);

  const filtered = useMemo(() => {
    return movements.filter(m => {
      if (filters.tipo      && m.tipoMovimiento !== filters.tipo)        return false;
      if (filters.naturaleza && m.naturaleza    !== filters.naturaleza)  return false;
      if (filters.mes       && m.mes            !== filters.mes)         return false;
      if (filters.estado    && m.estado         !== filters.estado)      return false;
      if (filters.project   && m.projectId      !== filters.project)     return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!m.descripcion.toLowerCase().includes(q) &&
            !(m.tercero || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [movements, filters]);

  const totIng = filtered.filter(m => m.naturaleza === 'ingreso' && m.estado === 'confirmado').reduce((s, m) => s + m.valor, 0);
  const totEgr = filtered.filter(m => m.naturaleza === 'egreso'  && m.estado === 'confirmado').reduce((s, m) => s + m.valor, 0);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return;
    await supabase.from('ledger_movements').delete().eq('id', id);
    refetch();
  };

  const openAdd  = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (m: LedgerMovement) => { setEditing(m); setModalOpen(true); };

  const sel: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'inherit' };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando movimientos...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Movimientos</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Libro maestro — fuente única de verdad financiera.</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Nuevo Movimiento
        </button>
      </header>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
        {[
          { label: 'Ingresos confirmados', value: fmt(totIng), color: '#10b981' },
          { label: 'Egresos confirmados',  value: fmt(totEgr), color: '#ef4444' },
          { label: 'Balance',              value: fmt(totIng - totEgr), color: totIng - totEgr >= 0 ? '#10b981' : '#ef4444' },
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
        <select style={sel} value={filters.mes} onChange={e => setFilters(f => ({ ...f, mes: e.target.value }))}>
          <option value="">Todos los meses</option>
          {MESES_ES.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select style={sel} value={filters.estado} onChange={e => setFilters(f => ({ ...f, estado: e.target.value }))}>
          <option value="">Todos los estados</option>
          {['confirmado','esperado','facturado','vencido','anulado'].map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select style={sel} value={filters.project} onChange={e => setFilters(f => ({ ...f, project: e.target.value }))}>
          <option value="">Todos los proyectos</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setFilters({ tipo: '', naturaleza: '', mes: '', estado: '', project: '', search: '' })}
          className="btn btn-outline" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}>
          Limpiar
        </button>
        <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '0.8rem' }}>{filtered.length} movimientos</span>
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
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
                return (
                  <tr key={m.id}>
                    <td style={{ color: '#a0aec0', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </td>
                    <td>
                      <div style={{ color: '#fff', fontWeight: 500 }}>{m.descripcion}</div>
                      {m.tercero && <div style={{ fontSize: '0.75rem', color: '#71717a' }}>{m.tercero}</div>}
                      {m.personalFlag && <span style={{ fontSize: '0.7rem', color: '#f59e0b' }}>⚠️ personal</span>}
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
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#71717a', padding: '3rem' }}>
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
        editing={editing}
      />
    </div>
  );
};
