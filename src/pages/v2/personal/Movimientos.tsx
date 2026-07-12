import React, { useState, useMemo } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { usePersonal, CATS_PERSONAL_EGRESO, CATS_PERSONAL_INGRESO, PersonalMovement } from '../../../hooks/usePersonal';
import { hoyISO } from '../../../lib/dates';
import { AddPersonalModal } from '../../../components/AddPersonalModal';
import { GOLD, fmt, fmtFecha, inp, PersonalHeader } from './comunes';

export const PersonalMovimientos: React.FC = () => {
  const { movements, pockets, loading, setupError, addMovement, updateMovement, removeMovement } = usePersonal();
  const bolsillosActivos = pockets.filter(p => p.activo).map(p => ({ id: p.id, nombre: p.nombre, emoji: p.emoji }));
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PersonalMovement | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const hoyStr = hoyISO();
  const [filtros, setFiltros] = useState({ mes: hoyStr.slice(0, 7), categoria: '', naturaleza: '', estado: '', busqueda: '' });

  const filtrados = useMemo(() =>
    movements.filter(m => {
      if (filtros.mes && !m.fecha.startsWith(filtros.mes)) return false;
      if (filtros.categoria && m.categoria !== filtros.categoria) return false;
      if (filtros.naturaleza && m.naturaleza !== filtros.naturaleza) return false;
      if (filtros.estado && m.estado !== filtros.estado) return false;
      if (filtros.busqueda && !m.descripcion.toLowerCase().includes(filtros.busqueda.toLowerCase())) return false;
      return true;
    }).sort((a, b) => b.fecha.localeCompare(a.fecha)),
  [movements, filtros]);

  const totIng = filtrados.filter(m => m.naturaleza === 'ingreso' && m.estado === 'confirmado' && m.categoria !== 'Ajuste').reduce((s, m) => s + m.valor, 0);
  const totEgr = filtrados.filter(m => m.naturaleza === 'egreso' && m.estado === 'confirmado' && m.categoria !== 'Ajuste').reduce((s, m) => s + m.valor, 0);
  // Saldo personal acumulado (todos los confirmados, no solo el período filtrado)
  const saldoPersonal = useMemo(() =>
    movements.filter(m => m.estado === 'confirmado').reduce((s, m) => s + (m.naturaleza === 'ingreso' ? m.valor : -m.valor), 0),
    [movements]);

  const confirmar = async (id: string) => {
    setConfirmandoId(id);
    try { await updateMovement(id, { estado: 'confirmado', fecha: hoyStr }); }
    finally { setConfirmandoId(null); }
  };

  const guardarEdicion = async (m: { fecha: string; naturaleza: 'ingreso' | 'egreso'; descripcion: string; valor: number; categoria?: string; estado: 'confirmado' | 'esperado'; notas?: string }) => {
    if (editing) { await updateMovement(editing.id, m); setEditing(null); }
    else { await addMovement(m); }
    setModalOpen(false);
  };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

  const todasCats = [...new Set([...CATS_PERSONAL_EGRESO, ...CATS_PERSONAL_INGRESO])];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '5rem' }}>
      <PersonalHeader titulo="📒 Movimientos" sub="El registro madre — todo tu mundo personal conecta aquí." />

      {/* Resumen grande — mismo esqueleto que Impulsy */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
        {[
          { label: 'Ingresos confirmados', value: fmt(totIng),          color: '#10b981' },
          { label: 'Gastos confirmados',   value: fmt(totEgr),          color: '#ef4444' },
          { label: 'Balance del período',  value: fmt(totIng - totEgr), color: totIng - totEgr >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Saldo personal',        value: fmt(saldoPersonal),   color: saldoPersonal >= 0 ? GOLD : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.4rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: '0.875rem 1rem' }}>
        <div className="resp-form" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1.4fr', gap: '0.5rem' }}>
          <input type="month" style={inp} value={filtros.mes} onChange={e => setFiltros(f => ({ ...f, mes: e.target.value }))} />
          <select style={inp} value={filtros.naturaleza} onChange={e => setFiltros(f => ({ ...f, naturaleza: e.target.value }))}>
            <option value="">Ingresos y gastos</option>
            <option value="ingreso">Solo ingresos</option>
            <option value="egreso">Solo gastos</option>
          </select>
          <select style={inp} value={filtros.categoria} onChange={e => setFiltros(f => ({ ...f, categoria: e.target.value }))}>
            <option value="">Todas las categorías</option>
            {todasCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select style={inp} value={filtros.estado} onChange={e => setFiltros(f => ({ ...f, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option value="confirmado">Confirmados</option>
            <option value="esperado">Proyectados</option>
          </select>
          <input style={inp} placeholder="Buscar descripción..." value={filtros.busqueda} onChange={e => setFiltros(f => ({ ...f, busqueda: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: '1.25rem', marginTop: '0.6rem', fontSize: '0.75rem' }}>
          <span style={{ color: '#52525b' }}>{filtrados.length} movimiento(s) en este filtro</span>
        </div>
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {filtrados.length === 0 && (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#52525b', border: '1px dashed #222', borderRadius: '12px' }}>
            Sin movimientos con estos filtros.
          </div>
        )}
        {filtrados.map(m => (
          <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.875rem', background: '#0d0d0d', borderRadius: '10px', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', minWidth: 0 }}>
              <span style={{ fontSize: '0.72rem', color: '#71717a', flexShrink: 0, minWidth: '52px' }}>{fmtFecha(m.fecha)}</span>
              <span style={{ fontSize: '0.82rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion}>{m.descripcion}</span>
              {m.categoria && <span style={{ fontSize: '0.65rem', color: '#52525b', flexShrink: 0 }}>· {m.categoria}</span>}
              {m.estado === 'esperado' && <span style={{ fontSize: '0.62rem', color: GOLD, background: `${GOLD}18`, padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: 700, flexShrink: 0 }}>proyectado</span>}
              {m.fuente.startsWith('salario:') && <span style={{ fontSize: '0.62rem', color: '#10b981', flexShrink: 0 }}>· desde Impulsy</span>}
              {m.fuente.startsWith('recurring:') && <span style={{ fontSize: '0.62rem', color: '#a855f7', flexShrink: 0 }}>· fijo</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: m.naturaleza === 'ingreso' ? '#10b981' : '#ef4444' }}>
                {m.naturaleza === 'ingreso' ? '+' : '−'}{fmt(m.valor)}
              </span>
              {m.estado === 'esperado' && (
                <button onClick={() => confirmar(m.id)} disabled={confirmandoId === m.id}
                  style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {confirmandoId === m.id ? '...' : '✓'}
                </button>
              )}
              {m.fuente === 'manual' && (
                <button onClick={() => { setEditing(m); setModalOpen(true); }} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.2rem' }} title="Editar">
                  <Pencil size={13} />
                </button>
              )}
              {deletingId === m.id ? (
                <button onClick={async () => { await removeMovement(m.id); setDeletingId(null); }}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.2rem 0.45rem', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ¿Seguro?
                </button>
              ) : (
                <button onClick={() => setDeletingId(m.id)} style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer', padding: '0.15rem' }} title="Eliminar">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button onClick={() => { setEditing(null); setModalOpen(true); }}
        className="fab"
        style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: GOLD, color: '#000', border: 'none', borderRadius: '999px', padding: '0.875rem 1.5rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 24px rgba(245,158,11,0.35)', zIndex: 50, fontFamily: 'inherit' }}>
        <Plus size={18} /> Registrar
      </button>

      {modalOpen && (
        <AddPersonalModal onClose={() => { setModalOpen(false); setEditing(null); }} onSave={guardarEdicion} editing={editing} pockets={bolsillosActivos} />
      )}
    </div>
  );
};
