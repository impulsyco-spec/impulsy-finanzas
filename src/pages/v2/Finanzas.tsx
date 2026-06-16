import React, { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Movimientos } from '../Movimientos';
import { Cuentas } from '../Cuentas';
import { Deudas } from '../Deudas';
import { useLedger } from '../../hooks/useLedger';
import { useRecurring, RecurringExpense } from '../../hooks/useRecurring';
import { hoyISO, fechaISO } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { MESES_ES, CATS_EGRESO, LedgerMovement } from '../../types';

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

  // ── Próximos ingresos/gastos según el filtro + atrasados ──────
  const [showProxIng, setShowProxIng] = useState(false);
  const [showProxGas, setShowProxGas] = useState(false);
  const [showFijos, setShowFijos]     = useState(false);
  const [expandedRec, setExpandedRec] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  const hoyStr = hoyISO();
  // La ventana de listados termina donde termina la proyección (mes actual + numMeses)
  const finVentana = fechaISO(new Date(today.getFullYear(), today.getMonth() + numMeses + 1, 0));
  const esPendiente = (m: LedgerMovement) => m.estado === 'esperado' || m.estado === 'facturado' || m.estado === 'vencido';

  const proximosIngresos = movements
    .filter(m => m.naturaleza === 'ingreso' && esPendiente(m) && m.fecha >= hoyStr && m.fecha <= finVentana)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const proximosGastos = movements
    .filter(m => m.naturaleza === 'egreso' && esPendiente(m) && m.fecha >= hoyStr && m.fecha <= finVentana)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  // Atrasados: lo que ya debió entrar o salir y nadie ha confirmado
  const atrasadosIng = movements
    .filter(m => m.naturaleza === 'ingreso' && esPendiente(m) && m.fecha < hoyStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const atrasadosGas = movements
    .filter(m => m.naturaleza === 'egreso' && esPendiente(m) && m.fecha < hoyStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totalAtrasadoIng = atrasadosIng.reduce((s, m) => s + m.valor, 0);
  const totalAtrasadoGas = atrasadosGas.reduce((s, m) => s + m.valor, 0);

  // Confirmar un atrasado: se marca recibido/pagado HOY y se sincroniza el pago vinculado
  const confirmarAtrasado = async (m: LedgerMovement) => {
    setConfirmandoId(m.id);
    try {
      const { error } = await supabase.from('ledger_movements').update({
        estado: 'confirmado', fecha: hoyStr, mes: MESES_ES[new Date().getMonth()],
        updated_at: new Date().toISOString(),
      }).eq('id', m.id);
      if (error) throw error;
      if (m.paymentId) {
        await supabase.from('payments').update({ status: 'paid', actual_amount: m.valor }).eq('id', m.paymentId);
      }
      refetch();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally { setConfirmandoId(null); }
  };

  const fmtFechaCorta = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Gastos fijos — desplegable para no abarcar la pantalla (order 4) */}
      <div className="card" style={{ padding: '1.25rem', order: 4 }}>
        <div onClick={() => setShowFijos(v => !v)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showFijos ? '1rem' : 0, cursor: 'pointer' }}>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 700 }}>{showFijos ? '▾' : '▸'} Gastos Fijos Mensuales <span style={{ fontSize: '0.75rem', color: '#52525b', fontWeight: 600 }}>({recurring.filter(r => r.activo).length} activos)</span></h3>
            <p style={{ color: '#52525b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
              Toca para {showFijos ? 'ocultar' : 'ver'} el detalle. Cada gasto muestra sus pagos proyectados y realizados.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Total mensual</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{fmt(totalFijos)}</div>
          </div>
        </div>

        {showFijos && (<>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.875rem' }}>
          {recurring.map(r => editingId === r.id ? (
            /* ── Fila de edición inline ── */
            <div key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#111', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
              <div className="resp-form" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'flex-end' }}>
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
            /* ── Fila de visualización (clic = ver sus pagos) ── */
            <React.Fragment key={r.id}>
              <div onClick={() => setExpandedRec(expandedRec === r.id ? null : r.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: r.activo ? '#0d0d0d' : '#0a0a0a', borderRadius: '8px', opacity: r.activo ? 1 : 0.5, cursor: 'pointer' }}>
                <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" checked={r.activo} onChange={() => update(r.id, { activo: !r.activo })}
                    style={{ width: '14px', height: '14px', accentColor: '#10b981', flexShrink: 0, cursor: 'pointer' }} />
                </span>
                <span style={{ color: '#52525b', fontSize: '0.7rem', flexShrink: 0 }}>{expandedRec === r.id ? '▾' : '▸'}</span>
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
                <button onClick={e => { e.stopPropagation(); setEditingId(r.id); setEditForm({ nombre: r.nombre, valor: r.valor, categoria: r.categoria, fechaInicio: r.fechaInicio, duracionMeses: r.duracionMeses }); }}
                  style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Editar">
                  <Pencil size={13} />
                </button>
                <button onClick={async e => { e.stopPropagation(); await remove(r.id); refetch(); }} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Eliminar">
                  <Trash2 size={13} />
                </button>
              </div>

              {/* Pagos del gasto fijo — proyectados, pagados y atrasados, en orden */}
              {expandedRec === r.id && (() => {
                const pagos = movements
                  .filter(m => m.notas === `recurring:${r.id}`)
                  .sort((a, b) => a.fecha.localeCompare(b.fecha));
                return (
                  <div style={{ marginLeft: '2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.25rem 0 0.5rem' }}>
                    {pagos.length === 0 && (
                      <div style={{ fontSize: '0.75rem', color: '#52525b', padding: '0.4rem' }}>Sin movimientos vinculados.</div>
                    )}
                    {pagos.map(m => {
                      const pagado   = m.estado === 'confirmado';
                      const atrasado = !pagado && m.fecha < hoyStr;
                      const chip = pagado
                        ? { t: 'Pagado',     c: '#10b981' }
                        : atrasado
                        ? { t: 'Atrasado',   c: '#ef4444' }
                        : { t: 'Proyectado', c: '#f59e0b' };
                      return (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0.6rem', background: '#0a0a0a', borderRadius: '6px', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: chip.c, background: `${chip.c}18`, padding: '0.1rem 0.45rem', borderRadius: '999px' }}>{chip.t}</span>
                            <span style={{ fontSize: '0.74rem', color: '#71717a' }}>{fmtFechaCorta(m.fecha)}</span>
                          </div>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: pagado ? '#10b981' : '#a0aec0' }}>{fmt(m.valor)}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </React.Fragment>
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
            <div className="resp-form" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.5rem', alignItems: 'flex-end' }}>
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
        </>)}
      </div>

      {/* Distribución por categorías — barras verticales (order 5) */}
      {recurring.filter(r => r.activo).length > 0 && (() => {
        const catMap: Record<string, number> = {};
        recurring.filter(r => r.activo).forEach(r => {
          catMap[r.categoria] = (catMap[r.categoria] || 0) + r.valor;
        });
        const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        const maxVal = catData[0]?.[1] || 1;
        const totalCat = catData.reduce((s, [, v]) => s + v, 0);
        const CAT_COLORS = ['#a855f7','#10b981','#06b6d4','#f59e0b','#ef4444','#f97316','#8b5cf6','#ec4899','#14b8a6','#84cc16'];
        return (
          <div className="card" style={{ padding: '1.25rem', order: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700 }}>Distribución por Categoría</h3>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginRight: '0.5rem' }}>Total</span>
                <span style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>{fmt(totalCat)}/mes</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', height: '180px' }}>
              {catData.map(([cat, val], i) => {
                const color = CAT_COLORS[i % CAT_COLORS.length];
                const hPct = Math.max(6, (val / maxVal) * 100);
                return (
                  <div key={cat} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color, marginBottom: '0.25rem' }}>{fmtK(val)}</span>
                    <div style={{ width: '70%', maxWidth: '54px', height: `${hPct * 1.2}px`, background: color, borderRadius: '6px 6px 0 0', opacity: 0.85, transition: 'height 0.4s' }}
                      title={`${cat}: ${fmt(val)}/mes (${((val / totalCat) * 100).toFixed(0)}%)`} />
                    <span style={{ fontSize: '0.62rem', color: '#71717a', marginTop: '0.35rem', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={cat}>
                      {cat}
                    </span>
                    <span style={{ fontSize: '0.58rem', color: '#52525b' }}>{((val / totalCat) * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Selector de escenario + proyección acumulada — SIEMPRE de primero (order 1) */}
      <div style={{ order: 1 }}>
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
          <div className="resp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
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

      {/* ── PRÓXIMOS INGRESOS / PRÓXIMOS GASTOS (según el filtro) — order 2 ── */}
      <div style={{ order: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }} className="resp-grid-panel">
        {[
          { titulo: 'Próximos ingresos', items: proximosIngresos, color: '#10b981', open: showProxIng, toggle: () => setShowProxIng(v => !v), signo: '' },
          { titulo: 'Próximos gastos',   items: proximosGastos,   color: '#ef4444', open: showProxGas, toggle: () => setShowProxGas(v => !v), signo: '−' },
        ].map(sec => (
          <div key={sec.titulo} className="card" style={{ padding: '1rem 1.25rem' }}>
            <div onClick={sec.toggle} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>{sec.titulo}</h3>
                <span style={{ fontSize: '0.7rem', color: '#52525b' }}>({sec.items.length}) · hasta {fmtFechaCorta(finVentana)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: sec.color, fontWeight: 800, fontSize: '0.9rem' }}>
                  {sec.signo}{fmtK(sec.items.reduce((s, m) => s + m.valor, 0))}
                </span>
                <span style={{ color: '#52525b', fontSize: '0.8rem' }}>{sec.open ? '▾' : '▸'}</span>
              </div>
            </div>
            {sec.open && (
              <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #1a1a1a', maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {sec.items.length === 0 && (
                  <div style={{ fontSize: '0.8rem', color: '#52525b', textAlign: 'center', padding: '0.75rem' }}>
                    Nada proyectado en este período.
                  </div>
                )}
                {sec.items.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#0a0a0a', borderRadius: '8px', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.72rem', color: '#71717a', flexShrink: 0, minWidth: '52px' }}>{fmtFechaCorta(m.fecha)}</span>
                      <span style={{ fontSize: '0.78rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion}>
                        {m.descripcion}
                      </span>
                      {m.notas?.startsWith('recurring:') && (
                        <span style={{ fontSize: '0.62rem', color: '#a855f7', flexShrink: 0 }}>· recurrente</span>
                      )}
                    </div>
                    <span style={{ fontWeight: 700, color: sec.color, fontSize: '0.8rem', flexShrink: 0 }}>{sec.signo}{fmt(m.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── ATRASADOS — order 3 ── */}
      {(atrasadosIng.length > 0 || atrasadosGas.length > 0) && (
        <div className="card" style={{ order: 3, padding: '1.25rem', border: '1px solid #ef444433' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ color: '#ef4444', fontWeight: 700 }}>⏰ Atrasados</h3>
            <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.78rem' }}>
              {totalAtrasadoIng > 0 && <span style={{ color: '#10b981', fontWeight: 700 }}>Por recibir: {fmt(totalAtrasadoIng)}</span>}
              {totalAtrasadoGas > 0 && <span style={{ color: '#ef4444', fontWeight: 700 }}>Por pagar: {fmt(totalAtrasadoGas)}</span>}
            </div>
          </div>
          <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: atrasadosIng.length > 0 && atrasadosGas.length > 0 ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            {[
              { titulo: 'Cobros de clientes atrasados', items: atrasadosIng, color: '#10b981', accion: '✓ Recibido' },
              { titulo: 'Pagos atrasados', items: atrasadosGas, color: '#ef4444', accion: '✓ Pagado' },
            ].filter(s => s.items.length > 0).map(sec => (
              <div key={sec.titulo}>
                <div style={{ fontSize: '0.68rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>{sec.titulo} ({sec.items.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '240px', overflowY: 'auto' }}>
                  {sec.items.map(m => {
                    const diasAtraso = Math.floor((new Date(hoyStr + 'T12:00:00').getTime() - new Date(m.fecha + 'T12:00:00').getTime()) / 86_400_000);
                    return (
                      <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.6rem', background: '#0a0a0a', borderRadius: '8px', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                          <span style={{ fontSize: '0.62rem', color: '#ef4444', background: 'rgba(239,68,68,0.1)', padding: '0.12rem 0.4rem', borderRadius: '999px', fontWeight: 700, flexShrink: 0 }}>
                            {diasAtraso}d
                          </span>
                          <span style={{ fontSize: '0.78rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.descripcion}>
                            {m.descripcion}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <span style={{ fontWeight: 700, color: sec.color, fontSize: '0.8rem' }}>{fmt(m.valor)}</span>
                          <button onClick={() => confirmarAtrasado(m)} disabled={confirmandoId === m.id}
                            style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {confirmandoId === m.id ? '...' : sec.accion}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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
