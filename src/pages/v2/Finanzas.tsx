import React, { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Movimientos } from '../Movimientos';
import { Cuentas } from '../Cuentas';
import { Deudas } from '../Deudas';
import { useLedger } from '../../hooks/useLedger';
import { useRecurring, RecurringExpense } from '../../hooks/useRecurring';
import { hoyISO } from '../../lib/dates';
import { MESES_ES, CATS_EGRESO } from '../../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : fmt(v);

type Tab = 'movimientos' | 'proyeccion' | 'cuentas' | 'deudas';

const TABS: { id: Tab; label: string }[] = [
  { id: 'movimientos', label: '📒 Movimientos' },
  { id: 'proyeccion',  label: '🔮 Proyección' },
  { id: 'cuentas',     label: '🏦 Cuentas & Bolsillos' },
  { id: 'deudas',      label: '🔗 Deudas' },
];

const ESCENARIOS = [
  { label: '1 mes',  value: 1 },
  { label: '3 meses', value: 3 },
  { label: '6 meses', value: 6 },
  { label: '1 año',  value: 12 },
];

// fechaInicio se inicializa dinámicamente en el componente
const mkEmpty = (): Omit<RecurringExpense, 'id'> => ({
  nombre: '', valor: 0, categoria: 'Infraestructura', activo: true,
  duracionMeses: 6, fechaInicio: hoyISO(),
});

const inp: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #333', color: '#fff',
  padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'inherit', width: '100%',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem',
};

const Proyeccion: React.FC = () => {
  const { movements, realAccounts, debts, refetch } = useLedger();
  const { items: recurring, add, remove, update, updateAndSync, totalMensual } = useRecurring();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [numMeses, setNumMeses] = useState(3);
  const [modoVista, setModoVista] = useState<'delta' | 'total'>('delta');
  const [form, setForm] = useState<Omit<RecurringExpense, 'id'>>(mkEmpty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RecurringExpense>>({});

  const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const totalDeudas = debts.filter(d => d.activa).reduce((s, d) => s + d.cuotaMinima, 0);
  const totalFijos = totalMensual + totalDeudas;

  const confirmed = movements.filter(m => m.estado === 'confirmado');
  const cajaActual =
    realAccounts.reduce((s, a) => s + a.saldoInicial, 0) +
    confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0) -
    confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);

  const today = new Date();
  // La proyección siempre arranca desde el PRÓXIMO mes — proyectar es mirar hacia adelante
  const mesesProyectados = Array.from({ length: numMeses }, (_, offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + 1 + offset, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    // Fuente única: ledger_movements con estado esperado o facturado
    const movIngreso = movements.filter(m =>
      m.naturaleza === 'ingreso' &&
      (m.estado === 'esperado' || m.estado === 'facturado') &&
      m.fecha.startsWith(ms)
    );
    const movEgreso = movements.filter(m =>
      m.naturaleza === 'egreso' &&
      (m.estado === 'esperado' || m.estado === 'facturado') &&
      m.fecha.startsWith(ms) &&
      !m.notas?.startsWith('recurring:')
    );

    const ingresosProyectados = movIngreso.reduce((s, m) => s + m.valor, 0);
    const gastosComprometidos = movEgreso.reduce((s, m) => s + m.valor, 0);
    const totalEgresos = totalMensual + totalDeudas + gastosComprometidos;
    const balance = ingresosProyectados - totalEgresos;

    return {
      mes: MESES_ES[d.getMonth()],
      año: d.getFullYear(),
      ms, ingresosProyectados, gastosComprometidos,
      gastosRecurrentes: totalMensual, cuotasDeuda: totalDeudas,
      totalEgresos, balance,
      isCurrentMonth: false,
      movIngreso, movEgreso,
    };
  });

  const handleAdd = async () => {
    if (!form.nombre.trim()) { alert('Ingresa el nombre del gasto'); return; }
    if (!form.fechaInicio)   { alert('Selecciona la fecha del primer pago'); return; }
    const valor = Number(String(form.valor).replace(/\./g, ''));
    if (valor <= 0) { alert('Ingresa un valor mayor a 0'); return; }
    setSaving(true);
    try {
      await add({ ...form, valor });
      setForm(mkEmpty());
      setShowAdd(false);
      refetch(); // sincronizar movements después de crear recurrentes en DB
    } finally { setSaving(false); }
  };

  // Cumulative totals for selected period
  const totalIngProyectado = mesesProyectados.reduce((s, m) => s + m.ingresosProyectados, 0);
  const totalGasFijos      = totalMensual * numMeses;
  const totalCuotas        = totalDeudas * numMeses;
  const totalComprometido  = mesesProyectados.reduce((s, m) => s + m.gastosComprometidos, 0);
  const totalEgresosPeriodo = totalGasFijos + totalCuotas + totalComprometido;
  const balancePeriodo     = totalIngProyectado - totalEgresosPeriodo;

  // Running balance per month for mini sparkline
  const runningBase = modoVista === 'total' ? cajaActual : 0;
  let runningBal = runningBase;
  const runningBals = mesesProyectados.map(m => {
    runningBal += m.ingresosProyectados - m.totalEgresos;
    return runningBal;
  });
  const minBal = Math.min(runningBase, ...runningBals);
  const maxBal = Math.max(runningBase + 1, ...runningBals);
  const balRange = maxBal - minBal || 1;

  const [showDetail, setShowDetail] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Gastos fijos */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 700 }}>Gastos Fijos Mensuales</h3>
            <p style={{ color: '#52525b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
              Al registrar un gasto fijo se crean automáticamente los movimientos planificados en la tabla.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Total mensual</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{fmt(totalFijos)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.875rem' }}>
          {recurring.map(r => editingId === r.id ? (
            /* ── Fila de edición inline ── */
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#111', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'flex-end' }}>
                <div>
                  <label style={lbl}>Nombre</label>
                  <input style={inp} value={editForm.nombre ?? ''} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Valor COP</label>
                  <input style={inp} type="text" inputMode="numeric"
                    value={editForm.valor !== undefined ? String(editForm.valor).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''}
                    onChange={e => setEditForm(f => ({ ...f, valor: Number(e.target.value.replace(/\./g, '')) || 0 }))} />
                </div>
                <div>
                  <label style={lbl}>Categoría</label>
                  <select style={inp} value={editForm.categoria ?? ''} onChange={e => setEditForm(f => ({ ...f, categoria: e.target.value }))}>
                    {CATS_EGRESO.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Primer pago</label>
                  <input style={inp} type="date" value={editForm.fechaInicio ?? r.fechaInicio}
                    onChange={e => setEditForm(f => ({ ...f, fechaInicio: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Cuotas (meses)</label>
                  <input style={inp} type="number" min={1} max={60} value={editForm.duracionMeses ?? r.duracionMeses}
                    onChange={e => setEditForm(f => ({ ...f, duracionMeses: Number(e.target.value) }))} />
                </div>
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  <button className="btn btn-primary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={async () => { await updateAndSync(r.id, editForm); setEditingId(null); setEditForm({}); refetch(); }}>
                    <Check size={13} />
                  </button>
                  <button className="btn btn-outline" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => { setEditingId(null); setEditForm({}); }}>
                    <X size={13} />
                  </button>
                </div>
              </div>
              {(editForm.fechaInicio || editForm.duracionMeses) && (
                <div style={{ fontSize: '0.65rem', color: '#f59e0b', paddingLeft: '0.25rem' }}>
                  ⚠️ Cambiar fecha o cuotas eliminará los movimientos actuales y los recreará desde la nueva fecha.
                </div>
              )}
            </div>
          ) : (
            /* ── Fila de visualización ── */
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: r.activo ? '#0d0d0d' : '#0a0a0a', borderRadius: '8px', opacity: r.activo ? 1 : 0.5 }}>
              <input type="checkbox" checked={r.activo} onChange={() => update(r.id, { activo: !r.activo })}
                style={{ width: '14px', height: '14px', accentColor: '#10b981', flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#a0aec0', fontSize: '0.82rem' }}>{r.nombre}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>{r.categoria}</span>
              {r.fechaInicio && (
                <span style={{ fontSize: '0.68rem', color: '#52525b' }}>
                  {new Date(r.fechaInicio + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })}
                </span>
              )}
              {r.duracionMeses > 0 && (
                <span style={{ fontSize: '0.68rem', color: '#52525b' }}>{r.duracionMeses} cuotas</span>
              )}
              <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>{fmt(r.valor)}</span>
              <button onClick={() => { setEditingId(r.id); setEditForm({ nombre: r.nombre, valor: r.valor, categoria: r.categoria, fechaInicio: r.fechaInicio, duracionMeses: r.duracionMeses }); }}
                style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Editar">
                <Pencil size={13} />
              </button>
              <button onClick={async () => { await remove(r.id); refetch(); }} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Eliminar">
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {debts.filter(d => d.activa).map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: '#0d0d0d', borderRadius: '8px', opacity: 0.7 }}>
              <span style={{ width: '14px', flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#a0aec0', fontSize: '0.82rem' }}>{d.acreedor} <span style={{ fontSize: '0.68rem', color: '#52525b' }}>(deuda)</span></span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>Deudas</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>—</span>
              <span style={{ fontWeight: 700, color: '#f97316', fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>{fmt(d.cuotaMinima)}/mes</span>
              <span style={{ width: '29px' }} />
            </div>
          ))}

          {recurring.length === 0 && debts.length === 0 && (
            <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '0.75rem' }}>
              Sin gastos fijos registrados.
            </div>
          )}
        </div>

        {showAdd ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#0a0a0a', borderRadius: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div>
                <label style={lbl}>Nombre del gasto</label>
                <input style={inp} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Arriendo oficina" />
              </div>
              <div>
                <label style={lbl}>Valor COP</label>
                <input style={inp} type="text" inputMode="numeric"
                  value={typeof form.valor === 'number' && form.valor === 0 ? '' : String(form.valor)}
                  onChange={e => setForm(f => ({ ...f, valor: fmtInput(e.target.value) as any }))}
                  placeholder="0" />
              </div>
              <div>
                <label style={lbl}>Categoría</label>
                <select style={inp} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                  {CATS_EGRESO.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Fecha primer pago</label>
                <input style={inp} type="date" value={form.fechaInicio}
                  onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Cuotas (núm. de meses)</label>
                <input style={inp} type="number" min={1} max={60} value={form.duracionMeses}
                  onChange={e => setForm(f => ({ ...f, duracionMeses: Number(e.target.value) }))}
                  placeholder="6" />
              </div>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#52525b', paddingLeft: '0.1rem' }}>
              El día del mes se toma automáticamente de la fecha seleccionada y se repite en cada cuota.
            </div>
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleAdd} disabled={saving} style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>
                {saving ? '...' : 'Guardar'}
              </button>
              <button className="btn btn-outline" onClick={() => setShowAdd(false)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="btn btn-outline" style={{ width: '100%', padding: '0.5rem', fontSize: '0.82rem' }}>
            <Plus size={14} /> Agregar gasto fijo recurrente
          </button>
        )}
      </div>

      {/* Distribución por categorías */}
      {recurring.filter(r => r.activo).length > 0 && (() => {
        const catMap: Record<string, number> = {};
        recurring.filter(r => r.activo).forEach(r => {
          catMap[r.categoria] = (catMap[r.categoria] || 0) + r.valor;
        });
        const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        const maxVal = catData[0]?.[1] || 1;
        const CAT_COLORS = ['#a855f7','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899','#14b8a6','#84cc16'];
        return (
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Distribución por Categoría</h3>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              {/* Donut */}
              <div style={{ flexShrink: 0 }}>
                {(() => {
                  const total = catData.reduce((s, [, v]) => s + v, 0) || 1;
                  const r = 40, cx = 50, cy = 50, circ = 2 * Math.PI * r;
                  let offset = 0;
                  return (
                    <svg width="110" height="110" viewBox="0 0 100 100">
                      {catData.map(([cat, val], i) => {
                        const pct = val / total;
                        const dash = pct * circ;
                        const rotate = offset * 360;
                        offset += pct;
                        return (
                          <circle key={cat} r={r} cx={cx} cy={cy} fill="none"
                            stroke={CAT_COLORS[i % CAT_COLORS.length]} strokeWidth="18"
                            strokeDasharray={`${dash} ${circ - dash}`}
                            strokeDashoffset={circ * 0.25}
                            transform={`rotate(${rotate} ${cx} ${cy})`} opacity={0.9}>
                            <title>{cat}: {fmt(val)}/mes</title>
                          </circle>
                        );
                      })}
                      <circle r={28} cx={cx} cy={cy} fill="#111" />
                      <text x="50" y="47" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700">{fmt(catData.reduce((s,[,v])=>s+v,0))}</text>
                      <text x="50" y="56" textAnchor="middle" fill="#52525b" fontSize="5">/mes</text>
                    </svg>
                  );
                })()}
              </div>
              {/* Barras horizontales */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                {catData.map(([cat, val], i) => (
                  <div key={cat}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#a0aec0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CAT_COLORS[i % CAT_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                        {cat}
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: CAT_COLORS[i % CAT_COLORS.length] }}>{fmt(val)}</span>
                    </div>
                    <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(val / maxVal) * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: '999px', transition: 'width 0.4s', opacity: 0.85 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Selector de escenario + proyección acumulada */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700 }}>Proyección acumulada</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {/* Toggle: solo período vs + caja actual */}
            <div style={{ display: 'flex', gap: '0.3rem', background: '#111', padding: '0.2rem', borderRadius: '10px' }}>
              <button onClick={() => setModoVista('delta')}
                style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: modoVista === 'delta' ? '#fff' : 'transparent', color: modoVista === 'delta' ? '#000' : '#71717a', transition: 'all 0.15s' }}>
                Solo período
              </button>
              <button onClick={() => setModoVista('total')}
                style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: modoVista === 'total' ? '#10b981' : 'transparent', color: modoVista === 'total' ? '#fff' : '#71717a', transition: 'all 0.15s' }}>
                + Caja actual
              </button>
            </div>
            {/* Selector de escenario */}
            <div style={{ display: 'flex', gap: '0.3rem', background: '#111', padding: '0.2rem', borderRadius: '10px' }}>
              {ESCENARIOS.map(e => (
                <button key={e.value} onClick={() => setNumMeses(e.value)}
                  style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: numMeses === e.value ? '#fff' : 'transparent', color: numMeses === e.value ? '#000' : '#71717a', transition: 'all 0.15s' }}>
                  {e.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tarjeta resumen acumulado */}
        {(() => {
          const displayBalance = modoVista === 'total' ? cajaActual + balancePeriodo : balancePeriodo;
          const balColor = displayBalance >= 0 ? '#10b981' : '#ef4444';
          return (
        <div className="card" style={{ padding: '1.5rem', borderTop: `3px solid ${displayBalance >= 0 ? '#10b98155' : '#ef444433'}`, marginBottom: '1rem' }}>
          {modoVista === 'total' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#10b98111', borderRadius: '8px', border: '1px solid #10b98133' }}>
              <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>Caja actual</span>
              <span style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 800 }}>{fmtK(cajaActual)}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>+</span>
              <span style={{ fontSize: '0.7rem', color: '#71717a', fontWeight: 700 }}>Período</span>
              <span style={{ fontSize: '0.85rem', color: balancePeriodo >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>{balancePeriodo >= 0 ? '+' : ''}{fmtK(balancePeriodo)}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>=</span>
              <span style={{ fontSize: '0.85rem', color: balColor, fontWeight: 800 }}>{fmtK(displayBalance)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                {modoVista === 'total' ? 'Posición total esperada' : 'Balance proyectado'} · {MESES_ES[new Date(today.getFullYear(), today.getMonth() + 1).getMonth()]}
                {numMeses > 1 && ` → ${MESES_ES[new Date(today.getFullYear(), today.getMonth() + numMeses).getMonth()]}`}
                {' '}({numMeses} {numMeses === 1 ? 'mes' : 'meses'})
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: balColor, lineHeight: 1.1, marginTop: '0.25rem' }}>
                {fmtK(displayBalance)}
              </div>
              {modoVista === 'total' && (
                <div style={{ fontSize: '0.68rem', color: '#52525b', marginTop: '0.2rem' }}>
                  Solo el período: <span style={{ color: balancePeriodo >= 0 ? '#10b981' : '#ef4444' }}>{fmtK(balancePeriodo)}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '2rem' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Ingresos proyectados</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#10b981' }}>{fmtK(totalIngProyectado)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Total egresos</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ef4444' }}>{fmtK(totalEgresosPeriodo)}</div>
              </div>
            </div>
          </div>

          {/* Desglose de egresos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div style={{ background: '#0d0d0d', borderRadius: '10px', padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Gastos fijos</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>{fmtK(totalGasFijos)}</div>
              <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>{fmt(totalMensual)}/mes × {numMeses}</div>
            </div>
            {totalCuotas > 0 && (
              <div style={{ background: '#0d0d0d', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Cuotas deuda</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f97316' }}>{fmtK(totalCuotas)}</div>
                <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>{fmt(totalDeudas)}/mes × {numMeses}</div>
              </div>
            )}
            {totalComprometido > 0 && (
              <div style={{ background: '#0d0d0d', borderRadius: '10px', padding: '0.75rem 1rem' }}>
                <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem' }}>Comprometidos</div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f59e0b' }}>{fmtK(totalComprometido)}</div>
                <div style={{ fontSize: '0.65rem', color: '#3f3f46', marginTop: '0.2rem' }}>Gastos esperados</div>
              </div>
            )}
          </div>

          {/* Barra de cobertura */}
          {totalIngProyectado > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.65rem', color: '#52525b' }}>Cobertura de egresos</span>
                <span style={{ fontSize: '0.65rem', color: balancePeriodo >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                  {Math.round((totalEgresosPeriodo / totalIngProyectado) * 100)}%
                </span>
              </div>
              <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (totalEgresosPeriodo / totalIngProyectado) * 100)}%`, background: balancePeriodo >= 0 ? '#10b981' : '#ef4444', borderRadius: '999px', transition: 'width 0.4s' }} />
              </div>
            </div>
          )}

          {/* Mini sparkline de balance acumulado mes a mes */}
          {numMeses > 1 && (
            <div>
              <div style={{ fontSize: '0.62rem', color: '#3f3f46', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: 700 }}>
                {modoVista === 'total' ? 'Posición total esperada mes a mes' : 'Evolución del balance acumulado'}
              </div>
              <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '50px' }}>
                {runningBals.map((bal, i) => {
                  const heightPct = Math.max(4, ((bal - minBal) / balRange) * 100);
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                      <div style={{ width: '100%', height: `${heightPct}%`, background: bal >= 0 ? '#10b98166' : '#ef444466', borderRadius: '3px 3px 0 0', transition: 'height 0.4s' }} />
                      <div style={{ fontSize: '0.52rem', color: '#3f3f46' }}>{mesesProyectados[i].mes.slice(0, 3)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
          );
        })()}

        {/* Desglose por mes (expandible) */}
        <button
          onClick={() => setShowDetail(v => !v)}
          style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0', fontFamily: 'inherit' }}>
          {showDetail ? '▾' : '▸'} Ver desglose mensual
        </button>

        {showDetail && (
          <div style={{ display: 'grid', gridTemplateColumns: numMeses <= 3 ? `repeat(${numMeses},1fr)` : numMeses <= 6 ? 'repeat(3,1fr)' : 'repeat(4,1fr)', gap: '0.875rem', marginTop: '0.75rem' }}>
            {mesesProyectados.map((m, i) => (
              <div key={m.ms} className="card" style={{ padding: '1rem', borderColor: m.isCurrentMonth ? '#2a2a2a' : '#1a1a1a' }}>
                <div style={{ fontSize: '0.62rem', color: m.isCurrentMonth ? '#a0aec0' : '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.6rem' }}>
                  {m.mes} {m.año !== today.getFullYear() ? m.año : ''} {m.isCurrentMonth ? '· actual' : ''}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Cobros esperados</span>
                    <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.75rem' }}>{fmtK(m.ingresosProyectados)}</span>
                  </div>
                  {/* Desglose de ingresos */}
                  {m.movIngreso.map(mov => (
                    <div key={mov.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '0.75rem', borderLeft: '2px solid #10b98133' }}>
                      <span style={{ fontSize: '0.68rem', color: '#52525b' }} title={mov.descripcion}>
                        {mov.descripcion.length > 22 ? mov.descripcion.slice(0, 22) + '…' : mov.descripcion}
                        {mov.estado === 'facturado' && <span style={{ color: '#60a5fa', marginLeft: '0.3rem' }}>· facturado</span>}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#10b98188' }}>{fmtK(mov.valor)}</span>
                    </div>
                  ))}
                  {m.movIngreso.length === 0 && (
                    <div style={{ paddingLeft: '0.75rem', fontSize: '0.65rem', color: '#3f3f46' }}>Sin cobros registrados</div>
                  )}
                  <div style={{ height: '1px', background: '#1a1a1a', margin: '0.2rem 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Egresos comprometidos</span>
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>−{fmtK(m.totalEgresos)}</span>
                  </div>
                  {/* Desglose de egresos variables */}
                  {m.movEgreso.map(mov => (
                    <div key={mov.id} style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: '0.75rem', borderLeft: '2px solid #ef444433' }}>
                      <span style={{ fontSize: '0.68rem', color: '#52525b' }} title={mov.descripcion}>
                        {mov.descripcion.length > 22 ? mov.descripcion.slice(0, 22) + '…' : mov.descripcion}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#ef444488' }}>−{fmtK(mov.valor)}</span>
                    </div>
                  ))}
                  <div style={{ height: '1px', background: '#1a1a1a' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>Balance</span>
                    <span style={{ fontWeight: 800, color: m.balance >= 0 ? '#10b981' : '#ef4444', fontSize: '0.82rem' }}>{fmtK(m.balance)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.65rem', color: '#52525b' }}>{modoVista === 'total' ? 'Posición total' : 'Acumulado'}</span>
                    <span style={{ fontSize: '0.65rem', color: runningBals[i] >= 0 ? '#10b981' : '#ef4444' }}>{fmtK(runningBals[i])}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const Finanzas: React.FC = () => {
  const [tab, setTab] = useState<Tab>('movimientos');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Finanzas</h1>
      </header>

      <div style={{ display: 'flex', gap: '0.375rem', background: '#111', padding: '0.25rem', borderRadius: '12px', width: 'fit-content' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '0.5rem 1rem', borderRadius: '9px', fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#000' : '#71717a', transition: 'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'movimientos' && <Movimientos />}
      {tab === 'proyeccion'  && <Proyeccion />}
      {tab === 'cuentas'     && <Cuentas />}
      {tab === 'deudas'      && <Deudas />}
    </div>
  );
};
