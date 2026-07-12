import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { usePersonal, CATS_PERSONAL_EGRESO } from '../../../hooks/usePersonal';
import { useLedger } from '../../../hooks/useLedger';
import { calcFounderStatus, FOUNDER_RULES } from '../../../lib/founderRules';
import { hoyISO } from '../../../lib/dates';
import { GOLD, CAT_COLORS, fmt, fmtK, inp, lbl, fmtInput, PersonalHeader, Setup2Banner } from './comunes';

const SALARIO_MES = FOUNDER_RULES.salarioQuincenal * 2;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pad = (n: number) => String(n).padStart(2, '0');

export const PersonalProyeccion: React.FC = () => {
  const { movements, recurring, budgets, loading, setupError, setup2Error, refetch, addRecurring, toggleRecurring, removeRecurring, setBudget, removeBudget } = usePersonal();
  const { movements: ledgerMovs } = useLedger();
  const [showAddRec, setShowAddRec] = useState(false);
  const [showFijos, setShowFijos] = useState(true);
  const [budgetCat, setBudgetCat] = useState('Ocio');
  const [budgetTope, setBudgetTope] = useState('');

  const hoyStr = hoyISO();
  const now = new Date();
  const mesActual = hoyStr.slice(0, 7);
  const finMes = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())}`;

  const founder = useMemo(() => calcFounderStatus(ledgerMovs), [ledgerMovs]);

  const conf = movements.filter(m => m.estado === 'confirmado');
  const movsMes = conf.filter(m => m.fecha.startsWith(mesActual));
  const gastadoMes = movsMes.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  const ingresosMes = movsMes.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const pendientes = movements.filter(m => m.estado === 'esperado');
  const porPagarMes = pendientes.filter(m => m.naturaleza === 'egreso' && m.fecha <= finMes && m.fecha >= hoyStr).reduce((s, m) => s + m.valor, 0);
  const salarioViene = founder.proximoPago.fecha <= finMes && !founder.proximoPago.pagado ? founder.proximoPago.monto : 0;
  const balanceMes = ingresosMes + salarioViene - gastadoMes - porPagarMes;

  // Runway: mes actual (real) + próximos 2 (proyectado con salario base)
  const runway = useMemo(() => [0, 1, 2].map(k => {
    const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
    const ms = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    const espIn = pendientes.filter(m => m.naturaleza === 'ingreso' && m.fecha.startsWith(ms)).reduce((s, m) => s + m.valor, 0);
    const espOut = pendientes.filter(m => m.naturaleza === 'egreso' && m.fecha.startsWith(ms)).reduce((s, m) => s + m.valor, 0);
    let entra: number, sale: number;
    if (k === 0) { entra = ingresosMes + salarioViene; sale = gastadoMes + porPagarMes; }
    else { entra = SALARIO_MES + espIn; sale = espOut; }
    return { label: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, entra, sale, queda: entra - sale, esActual: k === 0 };
  }), [pendientes, ingresosMes, salarioViene, gastadoMes, porPagarMes]);

  const gastoPorCat = useMemo(() => {
    const map: Record<string, number> = {};
    movsMes.filter(m => m.naturaleza === 'egreso').forEach(m => { map[m.categoria || 'Otro'] = (map[m.categoria || 'Otro'] || 0) + m.valor; });
    return map;
  }, [movsMes]);

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      <PersonalHeader titulo="🧭 ¿Me alcanza?" sub="Mira hacia adelante: cuánto te queda este mes y los que vienen." />

      {/* Hero — ¿te alcanza este mes? */}
      <div className="card" style={{ padding: '1.5rem', borderTop: `3px solid ${balanceMes >= 0 ? '#10b98155' : '#ef444455'}` }}>
        <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Te queda este mes (proyectado)</div>
        <div style={{ fontSize: '2.6rem', fontWeight: 900, color: balanceMes >= 0 ? '#10b981' : '#ef4444', lineHeight: 1.05 }}>{fmtK(balanceMes)}</div>
        <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '0.2rem' }}>
          {balanceMes >= 0 ? 'El mes te alcanza ✓ — esto queda tras cubrir todo lo proyectado.' : 'Ojo: el mes va en rojo. Baja Ahorro o aplaza algo no urgente.'}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginTop: '1rem', fontSize: '0.78rem' }}>
          <div><div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Recibido</div><div style={{ color: '#10b981', fontWeight: 800 }}>{fmtK(ingresosMes)}</div></div>
          {salarioViene > 0 && <div><div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Salario por venir</div><div style={{ color: '#10b981', fontWeight: 800 }}>+{fmtK(salarioViene)}</div></div>}
          <div><div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Gastado</div><div style={{ color: '#ef4444', fontWeight: 800 }}>−{fmtK(gastadoMes)}</div></div>
          <div><div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Por pagar</div><div style={{ color: GOLD, fontWeight: 800 }}>−{fmtK(porPagarMes)}</div></div>
        </div>
      </div>

      {/* Runway 3 meses */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.3rem' }}>Los próximos 3 meses</h3>
        <p style={{ fontSize: '0.7rem', color: '#52525b', marginBottom: '1rem' }}>Con tu salario base ({fmtK(SALARIO_MES)}/mes) contra tus fijos y cuotas proyectadas. Así ves si el plan de deuda te deja respirar.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem' }}>
          {runway.map(r => (
            <div key={r.label} style={{ padding: '1rem', borderRadius: '12px', background: '#0d0d0d', border: `1px solid ${r.queda >= 0 ? '#10b98133' : '#ef444433'}` }}>
              <div style={{ fontSize: '0.72rem', color: r.esActual ? GOLD : '#a0aec0', fontWeight: 700, textTransform: 'capitalize' }}>{r.label}{r.esActual && ' · ahora'}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: r.queda >= 0 ? '#10b981' : '#ef4444', marginTop: '0.3rem' }}>{fmtK(r.queda)}</div>
              <div style={{ fontSize: '0.62rem', color: '#52525b', marginTop: '0.35rem', lineHeight: 1.5 }}>
                entra {fmtK(r.entra)}<br />sale −{fmtK(r.sale)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gastos fijos personales */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div onClick={() => setShowFijos(v => !v)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
            {showFijos ? '▾' : '▸'} Gastos fijos personales <span style={{ fontSize: '0.72rem', color: '#52525b' }}>({recurring.filter(r => r.activo).length} activos)</span>
          </h3>
          <span style={{ color: GOLD, fontWeight: 800, fontSize: '0.9rem' }}>{fmt(recurring.filter(r => r.activo).reduce((s, r) => s + r.valor, 0))}/mes</span>
        </div>
        {showFijos && (
          <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {recurring.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: '#0d0d0d', borderRadius: '8px', opacity: r.activo ? 1 : 0.5 }}>
                <input type="checkbox" checked={r.activo} onChange={() => toggleRecurring(r.id, !r.activo)} style={{ width: '14px', height: '14px', accentColor: GOLD, cursor: 'pointer' }} />
                <span style={{ flex: 1, color: '#a0aec0', fontSize: '0.82rem' }}>{r.nombre}</span>
                <span style={{ fontSize: '0.7rem', color: '#52525b' }}>{r.categoria}</span>
                <span style={{ fontSize: '0.68rem', color: '#52525b' }}>{r.duracionMeses} cuotas</span>
                <span style={{ fontWeight: 700, color: GOLD, fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>{fmt(r.valor)}</span>
                <button onClick={() => removeRecurring(r.id)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }} title="Eliminar"><Trash2 size={13} /></button>
              </div>
            ))}
            {showAddRec ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.75rem', background: '#0a0a0a', borderRadius: '10px' }}>
                <AddRecForm onSave={async item => { await addRecurring(item); setShowAddRec(false); }} onCancel={() => setShowAddRec(false)} />
              </div>
            ) : (
              <button onClick={() => setShowAddRec(true)} className="btn btn-outline" style={{ width: '100%', padding: '0.5rem', fontSize: '0.82rem' }}>
                <Plus size={14} /> Agregar gasto fijo personal
              </button>
            )}
          </div>
        )}
      </div>

      {/* Presupuesto por categoría */}
      {setup2Error ? <Setup2Banner onRetry={refetch} /> : (
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>Topes de gasto por categoría</h3>
          <p style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>Define un tope por categoría. El semáforo aparece en Hoy: 🟢 vas bien · 🟡 +70% · 🔴 tope superado.</p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '160px' }}>
              <label style={lbl}>Categoría</label>
              <select style={inp} value={budgetCat} onChange={e => setBudgetCat(e.target.value)}>
                {CATS_PERSONAL_EGRESO.filter(c => c !== 'Ahorro').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ minWidth: '140px' }}>
              <label style={lbl}>Tope mensual COP</label>
              <input style={inp} inputMode="numeric" value={budgetTope} onChange={e => setBudgetTope(fmtInput(e.target.value))} placeholder="300.000" />
            </div>
            <button className="btn btn-primary" style={{ padding: '0.55rem 1rem' }}
              onClick={async () => {
                const tope = Number(budgetTope.replace(/\./g, ''));
                if (tope <= 0) { alert('Define el tope.'); return; }
                await setBudget(budgetCat, tope);
                setBudgetTope('');
              }}>Guardar tope</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {budgets.filter(b => b.activo).map((b, i) => {
              const gastado = gastoPorCat[b.categoria] || 0;
              const pct = b.topeMensual > 0 ? (gastado / b.topeMensual) * 100 : 0;
              const color = pct >= 100 ? '#ef4444' : pct >= 70 ? GOLD : '#10b981';
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: '#0d0d0d', borderRadius: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: CAT_COLORS[i % CAT_COLORS.length], flexShrink: 0 }} />
                  <span style={{ minWidth: '110px', color: '#a0aec0', fontSize: '0.82rem' }}>{b.categoria}</span>
                  <div style={{ flex: 1, height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: '999px' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', color, fontWeight: 700, minWidth: '150px', textAlign: 'right' }}>{fmtK(gastado)} / {fmtK(b.topeMensual)} ({pct.toFixed(0)}%)</span>
                  <button onClick={() => removeBudget(b.id)} style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer' }} title="Quitar tope"><Trash2 size={12} /></button>
                </div>
              );
            })}
            {budgets.filter(b => b.activo).length === 0 && (
              <div style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', padding: '0.75rem' }}>
                Sin topes definidos. Arranca con Ocio y Comida fuera — donde más se escapa la plata.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const AddRecForm: React.FC<{
  onSave: (item: { nombre: string; valor: number; categoria?: string; activo: boolean; duracionMeses: number; fechaInicio: string }) => Promise<void>;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [f, setF] = useState({ nombre: '', valor: '', categoria: 'Hogar', duracionMeses: 6, fechaInicio: hoyISO() });
  const [saving, setSaving] = useState(false);
  return (
    <>
      <div className="resp-form" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div><label style={lbl}>Nombre</label><input style={inp} value={f.nombre} onChange={e => setF(x => ({ ...x, nombre: e.target.value }))} placeholder="Ej. Arriendo" autoFocus /></div>
        <div><label style={lbl}>Valor COP</label><input style={inp} inputMode="numeric" value={f.valor} onChange={e => setF(x => ({ ...x, valor: fmtInput(e.target.value) }))} placeholder="0" /></div>
        <div><label style={lbl}>Categoría</label>
          <select style={inp} value={f.categoria} onChange={e => setF(x => ({ ...x, categoria: e.target.value }))}>
            {CATS_PERSONAL_EGRESO.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Primer pago</label><input style={inp} type="date" value={f.fechaInicio} onChange={e => setF(x => ({ ...x, fechaInicio: e.target.value }))} /></div>
        <div><label style={lbl}>Cuotas</label><input style={inp} type="number" min={1} max={60} value={f.duracionMeses} onChange={e => setF(x => ({ ...x, duracionMeses: Number(e.target.value) }))} /></div>
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" disabled={saving} style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}
          onClick={async () => {
            const valor = Number(f.valor.replace(/\./g, ''));
            if (!f.nombre.trim() || valor <= 0) { alert('Completa nombre y valor.'); return; }
            setSaving(true);
            try { await onSave({ nombre: f.nombre.trim(), valor, categoria: f.categoria, activo: true, duracionMeses: f.duracionMeses, fechaInicio: f.fechaInicio }); }
            catch (err: any) { alert('Error: ' + err.message); }
            finally { setSaving(false); }
          }}>
          {saving ? '...' : 'Guardar'}
        </button>
        <button className="btn btn-outline" onClick={onCancel} style={{ padding: '0.45rem 0.75rem', fontSize: '0.8rem' }}><X size={13} /></button>
      </div>
    </>
  );
};
