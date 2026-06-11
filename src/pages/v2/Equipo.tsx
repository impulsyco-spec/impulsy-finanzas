import React, { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Check, X, Users, TrendingDown, Calendar } from 'lucide-react';
import { useTeam } from '../../hooks/useTeam';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { hoyISO } from '../../lib/dates';
import { TeamMember, MESES_ES, ROLES_EQUIPO } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v/1_000_000).toFixed(1)+'M' : v >= 1_000 ? '$'+(v/1_000).toFixed(0)+'K' : fmt(v);

const AVATAR_COLORS = ['#a855f7','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899','#14b8a6'];

const inp: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #333', color: '#fff',
  padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'inherit', width: '100%',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem',
};

const fmtInput = (v: string) => v.replace(/\D/g,'').replace(/\B(?=(\d{3})+(?!\d))/g,'.');

const emptyForm = (): Omit<TeamMember, 'id'|'createdAt'> => ({
  nombre: '', rol: '', email: '', telefono: '',
  tarifaMensual: 0, activo: true, notas: '', avatarColor: AVATAR_COLORS[0],
});

type Tab = 'equipo' | 'pagos' | 'metricas';

export const Equipo: React.FC = () => {
  const { members, loading, add, update, remove } = useTeam();
  const { movements } = useLedger();
  const { projects } = useSupabaseData();

  const [tab, setTab]             = useState<Tab>('equipo');
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm]   = useState<Partial<Omit<TeamMember,'id'|'createdAt'>>>({});
  const [filterMember, setFilterMember] = useState('');
  const [filterMonth, setFilterMonth]   = useState(hoyISO().slice(0,7));

  // Métricas range controls
  const defaultRangeStart = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 4);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  })();
  const [metStart, setMetStart]     = useState(defaultRangeStart);
  const [metEnd, setMetEnd]         = useState(hoyISO().slice(0,7));
  const [metMember, setMetMember]   = useState('');

  // Movimientos asociados a miembros del equipo
  const teamMovements = useMemo(() =>
    movements.filter(m => m.teamMemberId && m.naturaleza === 'egreso'),
  [movements]);

  // Total pagado por miembro (todo el tiempo)
  const totalPorMiembro = (memberId: string) =>
    teamMovements.filter(m => m.teamMemberId === memberId && m.estado === 'confirmado')
      .reduce((s, m) => s + m.valor, 0);

  // Total pagado por miembro en el mes seleccionado
  const totalMesPorMiembro = (memberId: string) =>
    teamMovements.filter(m => m.teamMemberId === memberId && m.estado === 'confirmado' && m.fecha.startsWith(filterMonth))
      .reduce((s, m) => s + m.valor, 0);

  // KPIs globales
  const totalEquipoMes = members
    .filter(m => m.activo)
    .reduce((s, m) => s + totalMesPorMiembro(m.id), 0);
  const totalEquipoYTD = members
    .filter(m => m.activo)
    .reduce((s, m) => s + totalPorMiembro(m.id), 0);

  // Movimientos filtrados para el tab de pagos
  const pagosFiltrados = useMemo(() => {
    return teamMovements.filter(m => {
      if (filterMember && m.teamMemberId !== filterMember) return false;
      if (filterMonth  && !m.fecha.startsWith(filterMonth))  return false;
      return true;
    }).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [teamMovements, filterMember, filterMonth]);

  // Métricas: costo por proyecto
  const costosPorProyecto = useMemo(() => {
    const map: Record<string, number> = {};
    teamMovements.filter(m => m.estado === 'confirmado' && m.projectId).forEach(m => {
      map[m.projectId!] = (map[m.projectId!] || 0) + m.valor;
    });
    return Object.entries(map)
      .map(([pid, total]) => ({ proj: projects.find(p => p.id === pid), total }))
      .filter(x => x.proj)
      .sort((a, b) => b.total - a.total);
  }, [teamMovements, projects]);

  // Métricas: meses en el rango seleccionado
  const mesesEnRango = useMemo(() => {
    const result: { ms: string; label: string }[] = [];
    const [sy, sm] = metStart.split('-').map(Number);
    const [ey, em] = metEnd.split('-').map(Number);
    let y = sy, m = sm;
    while (y < ey || (y === ey && m <= em)) {
      const ms = `${y}-${String(m).padStart(2,'0')}`;
      result.push({ ms, label: MESES_ES[m-1].slice(0,3) + " '" + String(y).slice(2) });
      m++; if (m > 12) { m = 1; y++; }
    }
    return result;
  }, [metStart, metEnd]);

  // Movimientos en rango (confirmados)
  const movsEnRango = useMemo(() =>
    teamMovements.filter(m => m.estado === 'confirmado' && m.fecha >= metStart && m.fecha <= metEnd + '-31'),
    [teamMovements, metStart, metEnd]
  );

  // Movimientos filtrados por miembro en rango
  const movsRangoFiltrado = useMemo(() =>
    metMember ? movsEnRango.filter(m => m.teamMemberId === metMember) : movsEnRango,
    [movsEnRango, metMember]
  );

  // Gasto mensual en rango
  const gastoMensualRango = useMemo(() =>
    mesesEnRango.map(({ ms, label }) => ({
      ms, label,
      total: movsRangoFiltrado.filter(m => m.fecha.startsWith(ms)).reduce((s,m) => s+m.valor, 0),
    })),
    [mesesEnRango, movsRangoFiltrado]
  );
  const maxRangoBar = Math.max(1, ...gastoMensualRango.map(m => m.total));

  // Total en rango por miembro
  const totalRangoPorMiembro = (memberId: string) =>
    movsEnRango.filter(m => m.teamMemberId === memberId).reduce((s, m) => s + m.valor, 0);

  // Ranking en rango
  const rankingRango = useMemo(() =>
    [...members]
      .map(m => ({ member: m, total: totalRangoPorMiembro(m.id) }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total),
    [members, movsEnRango]
  );

  // Gasto por rol en rango
  const costosPorRol = useMemo(() => {
    const map: Record<string, number> = {};
    movsEnRango.forEach(m => {
      const mem = members.find(mb => mb.id === m.teamMemberId);
      if (!mem) return;
      map[mem.rol] = (map[mem.rol] || 0) + m.valor;
    });
    return Object.entries(map).sort((a,b) => b[1]-a[1]);
  }, [movsEnRango, members]);

  // Detalle mensual del miembro seleccionado
  const detalleMembroPorMes = useMemo(() => {
    if (!metMember) return [];
    return mesesEnRango.map(({ ms, label }) => ({
      ms, label,
      total: movsEnRango.filter(m => m.teamMemberId === metMember && m.fecha.startsWith(ms)).reduce((s,m) => s+m.valor, 0),
    }));
  }, [metMember, mesesEnRango, movsEnRango]);

  const totalEnRango     = movsRangoFiltrado.reduce((s,m) => s+m.valor, 0);
  const promedioMensual  = mesesEnRango.length > 0 ? totalEnRango / mesesEnRango.length : 0;

  // Gasto mensual del equipo últimos 6 meses (para KPI card)
  const today = new Date();

  const handleAdd = async () => {
    if (!form.nombre.trim() || !form.rol.trim()) { alert('Nombre y rol son obligatorios.'); return; }
    setSaving(true);
    try {
      await add({ ...form, tarifaMensual: Number(String(form.tarifaMensual).replace(/\./g,'')) || 0 });
      setForm(emptyForm()); setShowAdd(false);
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const handleUpdate = async (id: string) => {
    setSaving(true);
    try {
      const patch = { ...editForm };
      if (patch.tarifaMensual !== undefined)
        patch.tarifaMensual = Number(String(patch.tarifaMensual).replace(/\./g,'')) || 0;
      await update(id, patch);
      setEditingId(null); setEditForm({});
    } catch (e: any) { alert('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const sel: React.CSSProperties = { background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.45rem 0.75rem', borderRadius: '8px', fontSize: '0.8rem', fontFamily: 'inherit' };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando equipo...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Equipo & Proveedores</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem', fontSize: '0.85rem' }}>
            Gestiona freelancers, colaboradores y proveedores. Trackea todo lo que pagas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1.2rem' }}>
          <Plus size={16} /> Agregar miembro
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.875rem' }}>
        {[
          { label: 'Miembros activos',    value: String(members.filter(m => m.activo).length), color: '#a855f7' },
          { label: `Pagado ${MESES_ES[new Date(filterMonth + '-15').getMonth()]} ${new Date(filterMonth + '-15').getFullYear()}`, value: fmtK(totalEquipoMes), color: '#ef4444' },
          { label: 'Total histórico',     value: fmtK(totalEquipoYTD), color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.375rem', background: '#111', padding: '0.25rem', borderRadius: '10px', width: 'fit-content' }}>
        {([
          { id: 'equipo',   label: '👥 Equipo' },
          { id: 'pagos',    label: '💸 Registro de Pagos' },
          { id: 'metricas', label: '📊 Métricas' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '0.45rem 1rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#000' : '#71717a', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: EQUIPO ──────────────────────────────────── */}
      {tab === 'equipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

          {/* Formulario agregar */}
          {showAdd && (
            <div className="card" style={{ padding: '1.25rem', border: '1px solid #333' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Nuevo miembro / proveedor</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <div>
                  <label style={lbl}>Nombre *</label>
                  <input style={inp} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Leo Moreno" />
                </div>
                <div>
                  <label style={lbl}>Rol / Servicio *</label>
                  <select style={inp} value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}>
                    <option value="">Selecciona un rol…</option>
                    {ROLES_EQUIPO.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input style={inp} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Teléfono / WhatsApp</label>
                  <input style={inp} type="tel" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Tarifa mensual (COP)</label>
                  <input style={inp} type="text" inputMode="numeric"
                    value={typeof form.tarifaMensual === 'number' && form.tarifaMensual === 0 ? '' : String(form.tarifaMensual)}
                    onChange={e => setForm(f => ({ ...f, tarifaMensual: fmtInput(e.target.value) as any }))}
                    placeholder="0" />
                </div>
                <div>
                  <label style={lbl}>Color de avatar</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    {AVATAR_COLORS.map(c => (
                      <button key={c} type="button" onClick={() => setForm(f => ({ ...f, avatarColor: c }))}
                        style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, border: form.avatarColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }} />
                    ))}
                  </div>
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={lbl}>Notas</label>
                  <input style={inp} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Especialidad, condiciones, etc." />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline" onClick={() => { setShowAdd(false); setForm(emptyForm()); }}>Cancelar</button>
                <button className="btn btn-primary" onClick={handleAdd} disabled={saving}>
                  {saving ? '...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}

          {/* Cards de miembros */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: '1rem' }}>
            {members.map(m => {
              const totalPagado = totalPorMiembro(m.id);
              const mesPagado   = totalMesPorMiembro(m.id);
              const isEditing   = editingId === m.id;

              return (
                <div key={m.id} className="card" style={{ padding: '1.25rem', opacity: m.activo ? 1 : 0.5 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div><label style={lbl}>Nombre</label><input style={inp} value={editForm.nombre ?? m.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} /></div>
                        <div><label style={lbl}>Rol</label>
                          <select style={inp} value={editForm.rol ?? m.rol} onChange={e => setEditForm(f => ({ ...f, rol: e.target.value }))}>
                            <option value="">Selecciona un rol…</option>
                            {ROLES_EQUIPO.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <div><label style={lbl}>Email</label><input style={inp} value={editForm.email ?? m.email ?? ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                        <div><label style={lbl}>Teléfono</label><input style={inp} value={editForm.telefono ?? m.telefono ?? ''} onChange={e => setEditForm(f => ({ ...f, telefono: e.target.value }))} /></div>
                        <div style={{ gridColumn: '1/-1' }}>
                          <label style={lbl}>Tarifa mensual</label>
                          <input style={inp} type="text" inputMode="numeric"
                            value={editForm.tarifaMensual !== undefined ? String(editForm.tarifaMensual) : String(m.tarifaMensual)}
                            onChange={e => setEditForm(f => ({ ...f, tarifaMensual: Number(e.target.value.replace(/\./g,'')) || 0 }))} />
                        </div>
                        <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Notas</label><input style={inp} value={editForm.notas ?? m.notas ?? ''} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <button className="btn btn-primary" style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => handleUpdate(m.id)} disabled={saving}>
                          <Check size={13} /> {saving ? '...' : 'Guardar'}
                        </button>
                        <button className="btn btn-outline" style={{ padding: '0.4rem 0.7rem', fontSize: '0.78rem' }}
                          onClick={() => { setEditingId(null); setEditForm({}); }}>
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Avatar + nombre */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: m.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', color: '#000', flexShrink: 0 }}>
                            {m.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ color: '#fff', fontWeight: 700 }}>{m.nombre}</div>
                            <div style={{ fontSize: '0.75rem', color: m.avatarColor, fontWeight: 600 }}>{m.rol}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button onClick={() => { setEditingId(m.id); setEditForm({}); }}
                            style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { if (confirm(`¿Desactivar a ${m.nombre}?`)) remove(m.id); }}
                            style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Info de contacto */}
                      {(m.email || m.telefono) && (
                        <div style={{ fontSize: '0.75rem', color: '#71717a', marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          {m.email    && <span>✉ {m.email}</span>}
                          {m.telefono && <span>📱 {m.telefono}</span>}
                        </div>
                      )}

                      {/* Métricas */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <div style={{ background: '#0a0a0a', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                          <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Este mes</div>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>{fmtK(mesPagado)}</div>
                        </div>
                        <div style={{ background: '#0a0a0a', borderRadius: '8px', padding: '0.6rem 0.75rem' }}>
                          <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Total histórico</div>
                          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>{fmtK(totalPagado)}</div>
                        </div>
                      </div>
                      {m.tarifaMensual > 0 && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#52525b' }}>
                          Tarifa acordada: <span style={{ color: '#a0aec0', fontWeight: 600 }}>{fmt(m.tarifaMensual)}/mes</span>
                        </div>
                      )}
                      {m.notas && <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#52525b', fontStyle: 'italic' }}>{m.notas}</div>}
                    </>
                  )}
                </div>
              );
            })}

            {members.length === 0 && !showAdd && (
              <div style={{ gridColumn: '1/-1', padding: '3rem', textAlign: 'center', color: '#52525b', border: '1px dashed #222', borderRadius: '12px' }}>
                <Users size={32} style={{ color: '#333', margin: '0 auto 0.75rem' }} />
                <div>Sin miembros. Agrega a tu primer colaborador.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: PAGOS ───────────────────────────────────── */}
      {tab === 'pagos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filtros */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '0.75rem 1rem' }}>
            <select style={sel} value={filterMember} onChange={e => setFilterMember(e.target.value)}>
              <option value="">Todos los miembros</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <input type="month" style={{ ...sel, colorScheme: 'dark' }} value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)} />
            <button onClick={() => { setFilterMember(''); setFilterMonth(hoyISO().slice(0,7)); }}
              className="btn btn-outline" style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}>
              Limpiar
            </button>
            <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '0.8rem' }}>
              {pagosFiltrados.length} pago(s) · {fmt(pagosFiltrados.filter(m=>m.estado==='confirmado').reduce((s,m)=>s+m.valor,0))} confirmado
            </span>
          </div>

          {/* Tabla */}
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Miembro</th>
                    <th>Descripción</th>
                    <th>Proyecto</th>
                    <th>Estado</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosFiltrados.map(m => {
                    const member  = members.find(mb => mb.id === m.teamMemberId);
                    const project = projects.find(p => p.id === m.projectId);
                    return (
                      <tr key={m.id}>
                        <td style={{ color: '#a0aec0', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {new Date(m.fecha+'T12:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})}
                        </td>
                        <td>
                          {member ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: member.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#000', flexShrink: 0 }}>
                                {member.nombre.charAt(0)}
                              </div>
                              <div>
                                <div style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 600 }}>{member.nombre}</div>
                                <div style={{ color: '#71717a', fontSize: '0.7rem' }}>{member.rol}</div>
                              </div>
                            </div>
                          ) : <span style={{ color: '#52525b' }}>—</span>}
                        </td>
                        <td style={{ color: '#a0aec0', fontSize: '0.8rem' }}>{m.descripcion}</td>
                        <td style={{ fontSize: '0.8rem', color: '#71717a' }}>{project?.name || '—'}</td>
                        <td>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600,
                            color: m.estado === 'confirmado' ? '#10b981' : '#f59e0b',
                            background: m.estado === 'confirmado' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                            padding: '0.15rem 0.5rem', borderRadius: '999px' }}>
                            {m.estado}
                          </span>
                        </td>
                        <td style={{ fontWeight: 700, color: '#ef4444', whiteSpace: 'nowrap' }}>
                          -{fmt(m.valor)}
                        </td>
                      </tr>
                    );
                  })}
                  {pagosFiltrados.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', color: '#71717a', padding: '3rem' }}>
                      Sin pagos con los filtros actuales
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: MÉTRICAS ────────────────────────────────── */}
      {tab === 'metricas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Controles de rango */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', background: '#111', border: '1px solid #222', borderRadius: '12px', padding: '0.875rem 1rem' }}>
            <Calendar size={14} style={{ color: '#a855f7' }} />
            <span style={{ fontSize: '0.75rem', color: '#71717a', fontWeight: 600 }}>Rango:</span>
            <input type="month" style={{ ...sel, colorScheme: 'dark' }} value={metStart} onChange={e => setMetStart(e.target.value)} />
            <span style={{ color: '#52525b', fontSize: '0.8rem' }}>→</span>
            <input type="month" style={{ ...sel, colorScheme: 'dark' }} value={metEnd} onChange={e => setMetEnd(e.target.value)} />
            <select style={sel} value={metMember} onChange={e => setMetMember(e.target.value)}>
              <option value="">Todo el equipo</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.nombre} · {m.rol}</option>)}
            </select>
            <button onClick={() => { setMetStart(defaultRangeStart); setMetEnd(hoyISO().slice(0,7)); setMetMember(''); }}
              className="btn btn-outline" style={{ padding: '0.4rem 0.75rem', fontSize: '0.78rem' }}>
              Resetear
            </button>
            <span style={{ marginLeft: 'auto', color: '#71717a', fontSize: '0.78rem' }}>
              {mesesEnRango.length} {mesesEnRango.length === 1 ? 'mes' : 'meses'}
            </span>
          </div>

          {/* KPIs del rango */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.875rem' }}>
            {[
              { label: metMember ? `Total ${members.find(m=>m.id===metMember)?.nombre || ''}` : 'Total equipo en rango', value: fmtK(totalEnRango), color: '#ef4444' },
              { label: 'Promedio mensual', value: fmtK(promedioMensual), color: '#f59e0b' },
              { label: 'Meses analizados', value: String(mesesEnRango.length), color: '#a855f7' },
            ].map(s => (
              <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Gasto mensual en el rango */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Calendar size={16} style={{ color: '#a855f7' }} />
              <h3 style={{ color: '#fff', fontWeight: 700 }}>
                Gasto mensual — {metMember ? members.find(m=>m.id===metMember)?.nombre : 'Todo el equipo'}
              </h3>
            </div>
            {gastoMensualRango.length === 0 ? (
              <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>Sin datos en el rango.</div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '150px' }}>
                {gastoMensualRango.map(m => {
                  const h = m.total > 0 ? Math.max(6, (m.total / maxRangoBar) * 110) : 3;
                  return (
                    <div key={m.ms} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                      {m.total > 0 && (
                        <span style={{ fontSize: '0.54rem', color: '#a855f7', fontWeight: 700, textAlign: 'center' }}>{fmtK(m.total)}</span>
                      )}
                      <div style={{ width: '100%', height: `${h}px`, background: m.total > 0 ? '#a855f7' : '#1a1a1a', borderRadius: '3px 3px 0 0', opacity: m.total > 0 ? 0.75 : 0.3, transition: 'height 0.4s' }} />
                      <span style={{ fontSize: '0.54rem', color: m.total > 0 ? '#71717a' : '#3f3f46', textAlign: 'center', marginTop: '2px' }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grid: Ranking en rango + Costo por rol */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

            {/* Ranking en rango */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <TrendingDown size={15} style={{ color: '#ef4444' }} />
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem' }}>Ranking en el rango</h3>
              </div>
              {rankingRango.length === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>Sin pagos en este rango.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {rankingRango.map(({ member: m, total }, i) => {
                    const maxT = rankingRango[0]?.total || 1;
                    const tarifa = m.tarifaMensual * mesesEnRango.length;
                    const desv   = tarifa > 0 ? ((total - tarifa) / tarifa) * 100 : null;
                    return (
                      <div key={m.id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#52525b', minWidth: '16px' }}>#{i+1}</span>
                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: m.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.62rem', fontWeight: 800, color: '#000', flexShrink: 0 }}>
                              {m.nombre.charAt(0)}
                            </div>
                            <div>
                              <div style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600 }}>{m.nombre}</div>
                              <div style={{ fontSize: '0.65rem', color: '#52525b' }}>{m.rol}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ef4444' }}>{fmtK(total)}</div>
                            {desv !== null && (
                              <div style={{ fontSize: '0.65rem', color: desv > 10 ? '#ef4444' : desv < -10 ? '#10b981' : '#71717a' }}>
                                {desv >= 0 ? '+' : ''}{desv.toFixed(0)}% vs tarifa
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(total/maxT)*100}%`, background: m.avatarColor, borderRadius: '999px', opacity: 0.7 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Costo por rol en rango */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.88rem', marginBottom: '1rem' }}>Gasto por Rol en el rango</h3>
              {costosPorRol.length === 0 ? (
                <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '1rem' }}>Sin datos en este rango.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {costosPorRol.map(([rol, total]) => {
                    const maxR = costosPorRol[0]?.[1] || 1;
                    const pct  = totalEnRango > 0 ? (total / totalEnRango) * 100 : 0;
                    return (
                      <div key={rol}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{rol}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b' }}>{fmtK(total)}</span>
                            <span style={{ fontSize: '0.65rem', color: '#52525b', marginLeft: '0.4rem' }}>{pct.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(total/maxR)*100}%`, background: '#f59e0b', borderRadius: '999px', opacity: 0.6 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Detalle mensual del miembro seleccionado */}
          {metMember && detalleMembroPorMes.length > 0 && (() => {
            const m = members.find(mb => mb.id === metMember);
            if (!m) return null;
            const maxD = Math.max(1, ...detalleMembroPorMes.map(x => x.total));
            const tarifaTotal = m.tarifaMensual * mesesEnRango.length;
            return (
              <div className="card" style={{ padding: '1.25rem', border: `1px solid ${m.avatarColor}33` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: m.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', color: '#000' }}>
                      {m.nombre.charAt(0)}
                    </div>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 700 }}>{m.nombre}</div>
                      <div style={{ fontSize: '0.72rem', color: m.avatarColor }}>{m.rol}</div>
                    </div>
                  </div>
                  {m.tarifaMensual > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Tarifa esperada en rango</div>
                      <div style={{ fontWeight: 800, color: '#71717a' }}>{fmt(tarifaTotal)}</div>
                      <div style={{ fontSize: '0.68rem', color: totalEnRango > tarifaTotal ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                        Real: {fmt(totalEnRango)} ({totalEnRango > tarifaTotal ? '+' : ''}{fmt(totalEnRango - tarifaTotal)})
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: '130px' }}>
                  {detalleMembroPorMes.map(x => {
                    const h = x.total > 0 ? Math.max(6, (x.total / maxD) * 100) : 3;
                    return (
                      <div key={x.ms} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        {x.total > 0 && (
                          <span style={{ fontSize: '0.54rem', color: m.avatarColor, fontWeight: 700, textAlign: 'center' }}>{fmtK(x.total)}</span>
                        )}
                        {m.tarifaMensual > 0 && x.total > 0 && (
                          <div style={{ width: '100%', height: '2px', background: '#ffffff22', borderRadius: '999px', position: 'relative' }}>
                            <div style={{ position: 'absolute', top: '-1px', left: 0, width: `${Math.min(100, (m.tarifaMensual / maxD) * 100 * (100/h))}%`, height: '2px', background: '#ffffff44', borderRadius: '999px' }} />
                          </div>
                        )}
                        <div style={{ width: '100%', height: `${h}px`, background: m.avatarColor, borderRadius: '3px 3px 0 0', opacity: x.total > 0 ? 0.75 : 0.15, transition: 'height 0.4s' }} />
                        <span style={{ fontSize: '0.54rem', color: x.total > 0 ? '#71717a' : '#3f3f46', textAlign: 'center', marginTop: '2px' }}>{x.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Costo por proyecto (histórico) */}
          {costosPorProyecto.length > 0 && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem', fontSize: '0.88rem' }}>Costo de Equipo por Proyecto (histórico)</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {costosPorProyecto.map(({ proj, total }) => {
                  const maxC = costosPorProyecto[0]?.total || 1;
                  return (
                    <div key={proj!.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.82rem', color: '#a0aec0' }}>{proj!.name}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>{fmtK(total)}</span>
                      </div>
                      <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(total/maxC)*100}%`, background: '#f59e0b', borderRadius: '999px', opacity: 0.6 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
