import React, { useState } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Movimientos } from '../Movimientos';
import { Cuentas } from '../Cuentas';
import { Deudas } from '../Deudas';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { useRecurring, RecurringExpense } from '../../hooks/useRecurring';
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

const emptyRecurring: Omit<RecurringExpense, 'id'> = {
  nombre: '', valor: 0, categoria: 'Infraestructura', diaCobro: 1, activo: true, duracionMeses: 0, fechaInicio: '',
};

const inp: React.CSSProperties = {
  background: '#1a1a1a', border: '1px solid #333', color: '#fff',
  padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'inherit', width: '100%',
};
const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem',
};

const Proyeccion: React.FC = () => {
  const { movements, debts } = useLedger();
  const { payments } = useSupabaseData();
  const { items: recurring, add, remove, update, updateAndSync, totalMensual } = useRecurring();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [numMeses, setNumMeses] = useState(3);
  const [form, setForm] = useState<Omit<RecurringExpense, 'id'>>({ ...emptyRecurring });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RecurringExpense>>({});

  const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const totalDeudas = debts.filter(d => d.activa).reduce((s, d) => s + d.cuotaMinima, 0);
  const totalFijos = totalMensual + totalDeudas;

  const today = new Date();
  const mesesProyectados = Array.from({ length: numMeses }, (_, offset) => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const ingresosProyectados = payments
      .filter(p => p.status === 'pending' && p.date.startsWith(ms))
      .reduce((s, p) => s + p.amount, 0);

    // Excluir movimientos recurring (ya contados en gastos fijos)
    const gastosComprometidos = movements
      .filter(m => m.naturaleza === 'egreso' && m.estado === 'esperado' && m.fecha.startsWith(ms) && !m.notas?.startsWith('recurring:'))
      .reduce((s, m) => s + m.valor, 0);

    const totalEgresos = totalMensual + totalDeudas + gastosComprometidos;
    const balance = ingresosProyectados - totalEgresos;

    return {
      mes: MESES_ES[d.getMonth()],
      año: d.getFullYear(),
      ms, ingresosProyectados, gastosComprometidos,
      gastosRecurrentes: totalMensual, cuotasDeuda: totalDeudas,
      totalEgresos, balance,
      isCurrentMonth: offset === 0,
    };
  });

  const handleAdd = async () => {
    if (!form.nombre.trim() || !form.valor || Number(String(form.valor).replace(/\./g, '')) <= 0) {
      alert('Ingresa nombre y valor'); return;
    }
    setSaving(true);
    try {
      await add({ ...form, valor: Number(String(form.valor).replace(/\./g, '')) });
      setForm({ ...emptyRecurring });
      setShowAdd(false);
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
  let runningBal = 0;
  const runningBals = mesesProyectados.map(m => {
    runningBal += m.ingresosProyectados - m.totalEgresos;
    return runningBal;
  });
  const minBal = Math.min(0, ...runningBals);
  const maxBal = Math.max(1, ...runningBals);
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
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '0.4rem', alignItems: 'flex-end', padding: '0.6rem 0.75rem', background: '#111', borderRadius: '8px', border: '1px solid #2a2a2a' }}>
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
                <label style={lbl}>Día cobro</label>
                <input style={inp} type="number" min={1} max={31} value={editForm.diaCobro ?? 1}
                  onChange={e => setEditForm(f => ({ ...f, diaCobro: Number(e.target.value) }))} />
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button className="btn btn-primary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={async () => { await updateAndSync(r.id, editForm); setEditingId(null); }}>
                  <Check size={13} />
                </button>
                <button className="btn btn-outline" style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => setEditingId(null)}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            /* ── Fila de visualización ── */
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: r.activo ? '#0d0d0d' : '#0a0a0a', borderRadius: '8px', opacity: r.activo ? 1 : 0.5 }}>
              <input type="checkbox" checked={r.activo} onChange={() => update(r.id, { activo: !r.activo })}
                style={{ width: '14px', height: '14px', accentColor: '#10b981', flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#a0aec0', fontSize: '0.82rem' }}>{r.nombre}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>{r.categoria}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>Día {r.diaCobro}</span>
              {r.duracionMeses > 0 && <span style={{ fontSize: '0.68rem', color: '#52525b' }}>{r.duracionMeses} m</span>}
              {r.fechaInicio && <span style={{ fontSize: '0.65rem', color: '#3f3f46' }}>desde {r.fechaInicio.slice(0, 7)}</span>}
              <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>{fmt(r.valor)}</span>
              <button onClick={() => { setEditingId(r.id); setEditForm({ nombre: r.nombre, valor: r.valor, categoria: r.categoria, diaCobro: r.diaCobro }); }}
                style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Editar">
                <Pencil size={13} />
              </button>
              <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Eliminar">
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
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div>
                <label style={lbl}>Nombre</label>
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
                <label style={lbl}>Día de cobro</label>
                <input style={inp} type="number" min={1} max={31} value={form.diaCobro}
                  onChange={e => setForm(f => ({ ...f, diaCobro: Number(e.target.value) }))} />
              </div>
              <div>
                <label style={lbl}>Primer pago (fecha)</label>
                <input style={inp} type="date" value={form.fechaInicio ?? ''}
                  onChange={e => setForm(f => ({ ...f, fechaInicio: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Plazo (meses, 0=indefinido)</label>
                <input style={inp} type="number" min={0} max={60} value={form.duracionMeses}
                  onChange={e => setForm(f => ({ ...f, duracionMeses: Number(e.target.value) }))}
                  placeholder="0" />
              </div>
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

      {/* Selector de escenario + proyección acumulada */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700 }}>Proyección acumulada</h3>
          <div style={{ display: 'flex', gap: '0.3rem', background: '#111', padding: '0.2rem', borderRadius: '10px' }}>
            {ESCENARIOS.map(e => (
              <button key={e.value} onClick={() => setNumMeses(e.value)}
                style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: numMeses === e.value ? '#fff' : 'transparent', color: numMeses === e.value ? '#000' : '#71717a', transition: 'all 0.15s' }}>
                {e.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tarjeta resumen acumulado */}
        <div className="card" style={{ padding: '1.5rem', borderTop: `3px solid ${balancePeriodo >= 0 ? '#10b98155' : '#ef444433'}`, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                Balance acumulado · próximos {numMeses} {numMeses === 1 ? 'mes' : 'meses'}
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: 900, color: balancePeriodo >= 0 ? '#10b981' : '#ef4444', lineHeight: 1.1, marginTop: '0.25rem' }}>
                {fmtK(balancePeriodo)}
              </div>
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
              <div style={{ fontSize: '0.62rem', color: '#3f3f46', marginBottom: '0.4rem', textTransform: 'uppercase', fontWeight: 700 }}>Evolución del balance acumulado</div>
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
                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Cobros</span>
                    <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.75rem' }}>{fmtK(m.ingresosProyectados)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.72rem', color: '#71717a' }}>Egresos</span>
                    <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>−{fmtK(m.totalEgresos)}</span>
                  </div>
                  <div style={{ height: '1px', background: '#1a1a1a' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 700 }}>Balance</span>
                    <span style={{ fontWeight: 800, color: m.balance >= 0 ? '#10b981' : '#ef4444', fontSize: '0.82rem' }}>{fmtK(m.balance)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.65rem', color: '#52525b' }}>Acumulado</span>
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
