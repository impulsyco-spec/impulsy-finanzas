import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Mail, Phone, FolderKanban, X } from 'lucide-react';
import { useLedger } from '../../hooks/useLedger';
import { calcRentabilidad } from '../../hooks/useFinancials';
import { AddProjectModal } from '../../components/AddProjectModal';
import { supabase } from '../../lib/supabase';
import { Client, Project, ORIGEN_LABELS, OrigenCliente } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : fmt(v);

const AVATAR_COLORS = ['#a855f7','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899','#14b8a6'];

const statusLabel: Record<string, { label: string; color: string }> = {
  active:    { label: 'Activo',     color: '#10b981' },
  completed: { label: 'Completado', color: '#71717a' },
  'on-hold': { label: 'Pausado',    color: '#f59e0b' },
  cancelled: { label: 'Cancelado',  color: '#ef4444' },
};

const emptyForm = { name: '', company: '', email: '', phone: '', origen: '' };

const inp: React.CSSProperties = {
  width: '100%', background: '#1a1a1a', border: '1px solid #333',
  color: '#fff', padding: '0.6rem 0.75rem', borderRadius: '8px',
  fontSize: '0.875rem', fontFamily: 'inherit',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.3rem',
};

// Sección embebida en la página "Proyectos y Clientes" (tab Clientes).
// Recibe los datos del padre (ProyectosV2) para compartir UNA sola fuente:
// así, crear un cliente aquí refresca también el selector del modal de proyecto.
export const ClientesSection: React.FC<{
  clients: Client[]; projects: Project[]; loading: boolean; refetch: () => void;
}> = ({ clients, projects, loading, refetch }) => {
  const { movements } = useLedger();
  const navigate = useNavigate();

  const [expanded, setExpanded]   = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<Client | null>(null);
  const [form, setForm]           = useState({ ...emptyForm });
  const [saving, setSaving]       = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);

  const rentabilidad = useMemo(() => calcRentabilidad(movements, projects, clients), [movements, projects, clients]);
  const rentMap = useMemo(() => Object.fromEntries(rentabilidad.map(r => [r.projectId, r])), [rentabilidad]);

  // Desglose por cliente: utilidad por proyecto + global (incluye movimientos
  // ligados directo al cliente aunque no tengan proyecto)
  const clientStats = useMemo(() =>
    clients.map(c => {
      const projs   = projects.filter(p => p.clientId === c.id);
      const projIds = new Set(projs.map(p => p.id));
      const esDelCliente = (m: typeof movements[number]) =>
        m.clientId === c.id || (m.projectId ? projIds.has(m.projectId) : false);

      const conf     = movements.filter(m => m.estado === 'confirmado' && esDelCliente(m));
      const ingresos = conf.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
      const gastos   = conf.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
      const porCobrar = movements
        .filter(m => m.naturaleza === 'ingreso' && (m.estado === 'esperado' || m.estado === 'facturado' || m.estado === 'vencido') && esDelCliente(m))
        .reduce((s, m) => s + m.valor, 0);
      const utilidad = ingresos - gastos;
      // Movimientos ligados al cliente directo, sin proyecto — se muestran
      // como fila aparte para que el global siempre cuadre con el desglose
      const sueltos = conf.filter(m => m.clientId === c.id && !m.projectId);
      const sinProyecto = {
        ingresos: sueltos.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0),
        gastos:   sueltos.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0),
        n: sueltos.length,
      };
      return {
        client: c, projs,
        activos: projs.filter(p => p.status === 'active').length,
        ingresos, gastos, utilidad, porCobrar, sinProyecto,
        margen: ingresos > 0 ? utilidad / ingresos : null,
      };
    }).sort((a, b) => b.ingresos - a.ingresos),
  [clients, projects, movements]);

  const totIngresos  = clientStats.reduce((s, c) => s + c.ingresos, 0);
  const totUtilidad  = clientStats.reduce((s, c) => s + c.utilidad, 0);
  const totPorCobrar = clientStats.reduce((s, c) => s + c.porCobrar, 0);

  // Ingresos por origen de adquisición (alimenta la sección Adquisición)
  const porOrigen = useMemo(() => {
    const map: Record<string, { ingresos: number; clientes: number }> = {
      campanas: { ingresos: 0, clientes: 0 }, referido: { ingresos: 0, clientes: 0 },
      organico: { ingresos: 0, clientes: 0 }, sin: { ingresos: 0, clientes: 0 },
    };
    clientStats.forEach(cs => {
      const key = cs.client.origen || 'sin';
      map[key].ingresos += cs.ingresos;
      map[key].clientes += 1;
    });
    return map;
  }, [clientStats]);

  const setOrigen = async (clientId: string, origen: string) => {
    const { error } = await supabase.from('clients').update({ origen: origen || null }).eq('id', clientId);
    if (error) {
      alert(error.message.includes('origen') && error.code === '42703'
        ? 'Falta la columna origen: ejecuta supabase-origen-clientes.sql en Supabase.'
        : 'Error: ' + error.message);
      return;
    }
    refetch();
  };

  const openNew  = () => { setEditing(null); setForm({ ...emptyForm }); setShowForm(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ name: c.name, company: c.company || '', email: c.email || '', phone: c.phone || '', origen: c.origen || '' });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { alert('El nombre del cliente es obligatorio.'); return; }
    setSaving(true);
    try {
      const datos = {
        name: form.name.trim(),
        company: form.company.trim() || form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        origen: form.origen || null,
      };
      const { error } = editing
        ? await supabase.from('clients').update(datos).eq('id', editing.id)
        : await supabase.from('clients').insert([datos]);
      if (error) throw error;
      setShowForm(false);
      refetch();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally { setSaving(false); }
  };

  const handleDelete = async (c: Client) => {
    const tieneProyectos   = projects.some(p => p.clientId === c.id);
    const tieneMovimientos = movements.some(m => m.clientId === c.id);
    if (tieneProyectos || tieneMovimientos) {
      alert(`No se puede eliminar a ${c.name}: tiene ${tieneProyectos ? 'proyectos' : 'movimientos'} asociados. Elimina o reasigna primero.`);
      setDeletingId(null);
      return;
    }
    const { error } = await supabase.from('clients').delete().eq('id', c.id);
    if (error) alert('Error: ' + error.message);
    setDeletingId(null);
    refetch();
  };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Acciones */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" onClick={openNew}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.2rem' }}>
          <Plus size={16} /> Nuevo Cliente
        </button>
      </div>

      {/* KPIs */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
        {[
          { label: 'Clientes',        value: String(clients.length),  color: '#a855f7' },
          { label: 'Ingresos Totales',value: fmtK(totIngresos),       color: '#10b981' },
          { label: 'Utilidad Total',  value: fmtK(totUtilidad),       color: totUtilidad >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Por Cobrar',      value: fmtK(totPorCobrar),      color: '#06b6d4' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Ingresos por origen de adquisición */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: porOrigen.sin.clientes > 0 ? 'repeat(4,1fr)' : 'repeat(3,1fr)', gap: '0.875rem' }}>
        {(Object.entries(ORIGEN_LABELS) as [OrigenCliente, typeof ORIGEN_LABELS[OrigenCliente]][]).map(([key, o]) => (
          <div key={key} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', border: `1px solid ${o.color}33` }}>
            <span className="stat-label" style={{ color: o.color }}>{o.emoji} {o.label}</span>
            <span className="stat-value" style={{ color: o.color, fontSize: '1.15rem' }}>{fmtK(porOrigen[key].ingresos)}</span>
            <span style={{ fontSize: '0.62rem', color: '#52525b' }}>{porOrigen[key].clientes} cliente(s)</span>
          </div>
        ))}
        {porOrigen.sin.clientes > 0 && (
          <div className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', border: '1px dashed #52525b55' }}>
            <span className="stat-label">❔ Sin clasificar</span>
            <span className="stat-value" style={{ color: '#71717a', fontSize: '1.15rem' }}>{fmtK(porOrigen.sin.ingresos)}</span>
            <span style={{ fontSize: '0.62rem', color: '#52525b' }}>{porOrigen.sin.clientes} cliente(s) — abre cada uno y asigna su origen</span>
          </div>
        )}
      </div>

      {/* Lista de clientes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {clientStats.map(({ client: c, projs, activos, ingresos, gastos, utilidad, porCobrar, sinProyecto, margen }, idx) => {
          const isOpen = expanded === c.id;
          const color  = AVATAR_COLORS[idx % AVATAR_COLORS.length];
          return (
            <div key={c.id} className="card" style={{ padding: '1.1rem 1.25rem' }}>

              {/* Fila principal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', gap: '0.75rem', flexWrap: 'wrap' }}
                onClick={() => setExpanded(isOpen ? null : c.id)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: '220px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: `${color}22`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.05rem', flexShrink: 0 }}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#fff', fontWeight: 700 }}>{c.name}</span>
                      {c.company && c.company !== c.name && (
                        <span style={{ fontSize: '0.75rem', color: '#71717a' }}>· {c.company}</span>
                      )}
                      {c.origen ? (
                        <span style={{ fontSize: '0.62rem', background: `${ORIGEN_LABELS[c.origen].color}18`, color: ORIGEN_LABELS[c.origen].color, padding: '0.12rem 0.45rem', borderRadius: '999px', fontWeight: 700 }}>
                          {ORIGEN_LABELS[c.origen].emoji} {ORIGEN_LABELS[c.origen].label}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.62rem', background: 'rgba(82,82,91,0.15)', color: '#71717a', padding: '0.12rem 0.45rem', borderRadius: '999px', fontWeight: 600 }}>
                          ❔ sin origen
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '0.15rem' }}>
                      {projs.length} proyecto{projs.length !== 1 ? 's' : ''}{activos > 0 ? ` · ${activos} activo${activos !== 1 ? 's' : ''}` : ''}
                      {porCobrar > 0 && <span style={{ color: '#06b6d4' }}> · por cobrar {fmtK(porCobrar)}</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Ingresos</div>
                    <div style={{ color: '#10b981', fontWeight: 800 }}>{fmtK(ingresos)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Gastos</div>
                    <div style={{ color: '#ef4444', fontWeight: 800 }}>{fmtK(gastos)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Utilidad</div>
                    <div style={{ color: utilidad >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>{fmtK(utilidad)}</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '52px' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Margen</div>
                    <div style={{ fontWeight: 800, color: margen == null ? '#52525b' : margen >= 0.3 ? '#10b981' : margen >= 0.1 ? '#f59e0b' : '#ef4444' }}>
                      {margen != null ? (margen * 100).toFixed(0) + '%' : '—'}
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={16} style={{ color: '#52525b' }} /> : <ChevronDown size={16} style={{ color: '#52525b' }} />}
                </div>
              </div>

              {/* Detalle expandido */}
              {isOpen && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #1a1a1a' }}>

                  {/* Contacto + acciones */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.8rem', color: '#a0aec0' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Mail size={13} style={{ color: '#52525b' }} />{c.email || 'Sin email'}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Phone size={13} style={{ color: '#52525b' }} />{c.phone || 'Sin teléfono'}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <select value={c.origen || ''} onChange={e => setOrigen(c.id, e.target.value)}
                        style={{ background: '#1a1a1a', border: '1px solid #333', color: c.origen ? ORIGEN_LABELS[c.origen].color : '#71717a', padding: '0.35rem 0.5rem', borderRadius: '8px', fontSize: '0.72rem', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                        <option value="">❔ Origen…</option>
                        <option value="campanas">📣 Campañas</option>
                        <option value="referido">🤝 Referido</option>
                        <option value="organico">🌱 Orgánico</option>
                      </select>
                      <button onClick={() => openEdit(c)} className="btn btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button onClick={() => setDeletingId(c.id)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', background: 'transparent', border: '1px solid #ef444433', color: '#ef4444', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                        <Trash2 size={12} /> Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Confirmación de borrado */}
                  {deletingId === c.id && (
                    <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.82rem', color: '#ef4444' }}>¿Eliminar a {c.name}? Solo es posible si no tiene proyectos ni movimientos.</span>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setDeletingId(null)} className="btn btn-outline" style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem' }}>Cancelar</button>
                        <button onClick={() => handleDelete(c)} style={{ padding: '0.3rem 0.7rem', fontSize: '0.72rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}>Sí, eliminar</button>
                      </div>
                    </div>
                  )}

                  {/* Proyectos del cliente con utilidad */}
                  <div style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
                    Utilidad por proyecto ({projs.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {projs.length === 0 && (
                      <div style={{ fontSize: '0.8rem', color: '#52525b', padding: '0.75rem', textAlign: 'center' }}>
                        Sin proyectos aún. Créale uno con el botón de abajo.
                      </div>
                    )}
                    {projs.map(p => {
                      const r  = rentMap[p.id];
                      const st = statusLabel[p.status] || { label: p.status, color: '#71717a' };
                      return (
                        <div key={p.id}
                          onClick={() => navigate('/proyectos')}
                          title="Ver en Proyectos"
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.875rem', background: '#0a0a0a', borderRadius: '8px', cursor: 'pointer', gap: '0.75rem', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <FolderKanban size={13} style={{ color: '#52525b' }} />
                            <span style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</span>
                            <span style={{ fontSize: '0.65rem', background: `${st.color}18`, color: st.color, padding: '0.12rem 0.45rem', borderRadius: '999px', fontWeight: 600 }}>{st.label}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', alignItems: 'center' }}>
                            <span style={{ color: '#10b981' }}>↑ {fmtK(r?.ingresos || 0)}</span>
                            <span style={{ color: '#ef4444' }}>↓ {fmtK(r?.gastos || 0)}</span>
                            <span style={{ color: (r?.utilidad || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>= {fmtK(r?.utilidad || 0)}</span>
                            <span style={{ fontWeight: 800, minWidth: '40px', textAlign: 'right', color: r?.margen == null ? '#52525b' : r.margen >= 0.3 ? '#10b981' : r.margen >= 0.1 ? '#f59e0b' : '#ef4444' }}>
                              {r?.margen != null ? (r.margen * 100).toFixed(0) + '%' : '—'}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Movimientos ligados al cliente sin proyecto — para que el global cuadre */}
                    {sinProyecto.n > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.875rem', background: '#0a0a0a', borderRadius: '8px', gap: '0.75rem', flexWrap: 'wrap', border: '1px dashed #2a2a2a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ color: '#71717a', fontSize: '0.82rem', fontStyle: 'italic' }}>Sin proyecto asignado ({sinProyecto.n})</span>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', alignItems: 'center' }}>
                          <span style={{ color: '#10b981' }}>↑ {fmtK(sinProyecto.ingresos)}</span>
                          <span style={{ color: '#ef4444' }}>↓ {fmtK(sinProyecto.gastos)}</span>
                          <span style={{ color: (sinProyecto.ingresos - sinProyecto.gastos) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>= {fmtK(sinProyecto.ingresos - sinProyecto.gastos)}</span>
                          <span style={{ minWidth: '40px' }} />
                        </div>
                      </div>
                    )}

                    {/* Global del cliente */}
                    {projs.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.875rem', background: '#111', borderRadius: '8px', borderTop: '1px solid #222', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ color: '#a0aec0', fontSize: '0.8rem', fontWeight: 700 }}>GLOBAL DEL CLIENTE</span>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem', alignItems: 'center' }}>
                          <span style={{ color: '#10b981' }}>↑ {fmtK(ingresos)}</span>
                          <span style={{ color: '#ef4444' }}>↓ {fmtK(gastos)}</span>
                          <span style={{ color: utilidad >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>= {fmtK(utilidad)}</span>
                          <span style={{ fontWeight: 800, minWidth: '40px', textAlign: 'right', color: margen == null ? '#52525b' : margen >= 0.3 ? '#10b981' : margen >= 0.1 ? '#f59e0b' : '#ef4444' }}>
                            {margen != null ? (margen * 100).toFixed(0) + '%' : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <button onClick={() => setShowAddProject(true)}
                    style={{ marginTop: '0.75rem', padding: '0.5rem 0.875rem', fontSize: '0.78rem', background: 'transparent', border: '1px dashed #333', color: '#71717a', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, width: '100%' }}>
                    + Nuevo proyecto para este cliente
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {clients.length === 0 && (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#52525b', border: '1px dashed #222', borderRadius: '12px' }}>
            Sin clientes. Crea el primero con el botón de arriba.
          </div>
        )}
      </div>

      {/* Modal crear/editar cliente */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
          <div className="card" style={{ width: '440px', maxWidth: '100%', border: '1px solid #333' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>
                {editing ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label style={lbl}>Nombre *</label>
                <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Camila Trujillo" autoFocus />
              </div>
              <div>
                <label style={lbl}>¿De dónde viene?</label>
                <select style={inp} value={form.origen} onChange={e => setForm(f => ({ ...f, origen: e.target.value }))}>
                  <option value="">Sin clasificar</option>
                  <option value="campanas">📣 Campañas (pauta/ads)</option>
                  <option value="referido">🤝 Referido</option>
                  <option value="organico">🌱 Orgánico</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Empresa</label>
                <input style={inp} value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="Ej. Luxury Spa" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={inp} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="correo@..." />
                </div>
                <div>
                  <label style={lbl}>Teléfono</label>
                  <input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+57..." />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #222' }}>
              <button onClick={() => setShowForm(false)} className="btn btn-outline">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? 'Guardando...' : editing ? 'Actualizar' : 'Crear Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo proyecto (elige el cliente adentro) */}
      <AddProjectModal clients={clients} isOpen={showAddProject}
        onClose={() => setShowAddProject(false)}
        onSuccess={() => { setShowAddProject(false); refetch(); }} />
    </div>
  );
};
