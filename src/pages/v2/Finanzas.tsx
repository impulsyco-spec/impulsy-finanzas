import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
  { id: 'proyeccion',  label: '🔮 Proyección 3 meses' },
  { id: 'cuentas',     label: '🏦 Cuentas & Bolsillos' },
  { id: 'deudas',      label: '🔗 Deudas' },
];

const emptyRecurring: Omit<RecurringExpense, 'id'> = {
  nombre: '', valor: 0, categoria: 'Infraestructura', diaCobro: 1, activo: true,
};

const Proyeccion: React.FC = () => {
  const { movements, debts } = useLedger();
  const { payments, projects } = useSupabaseData();
  const { items: recurring, add, remove, update, totalMensual } = useRecurring();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyRecurring });

  const inp: React.CSSProperties = {
    background: '#1a1a1a', border: '1px solid #333', color: '#fff',
    padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'inherit', width: '100%',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontSize: '0.65rem', fontWeight: 700, color: '#71717a',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.2rem',
  };
  const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const totalDeudas = debts.filter(d => d.activa).reduce((s, d) => s + d.cuotaMinima, 0);
  const totalFijos = totalMensual + totalDeudas;

  // 3-month projection
  const today = new Date();
  const months3 = [0, 1, 2].map(offset => {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    const ingresosProyectados = payments
      .filter(p => p.status === 'pending' && p.date.startsWith(ms))
      .reduce((s, p) => s + p.amount, 0);

    const gastosComprometidos = movements
      .filter(m => m.naturaleza === 'egreso' && m.estado === 'esperado' && m.fecha.startsWith(ms))
      .reduce((s, m) => s + m.valor, 0);

    const gastosRecurrentes = totalMensual;
    const cuotasDeuda = totalDeudas;
    const totalEgresos = gastosRecurrentes + cuotasDeuda + gastosComprometidos;
    const balance = ingresosProyectados - totalEgresos;

    return {
      mes: MESES_ES[d.getMonth()],
      ms, ingresosProyectados, gastosComprometidos,
      gastosRecurrentes, cuotasDeuda, totalEgresos, balance,
    };
  });

  const handleAdd = () => {
    if (!form.nombre.trim() || form.valor <= 0) { alert('Ingresa nombre y valor'); return; }
    add({ ...form, valor: Number(String(form.valor).replace(/\./g, '')) });
    setForm({ ...emptyRecurring });
    setShowAdd(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Gastos fijos recurrentes */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 700 }}>Gastos Fijos Mensuales</h3>
            <p style={{ color: '#52525b', fontSize: '0.78rem', marginTop: '0.2rem' }}>
              Oficina, apps, plataformas y servicios que se cobran todos los meses.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Total mensual</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#ef4444' }}>{fmt(totalFijos)}</div>
          </div>
        </div>

        {/* Lista */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.875rem' }}>
          {recurring.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: r.activo ? '#0d0d0d' : '#0a0a0a', borderRadius: '8px', opacity: r.activo ? 1 : 0.5 }}>
              <input type="checkbox" checked={r.activo} onChange={() => update(r.id, { activo: !r.activo })}
                style={{ width: '14px', height: '14px', accentColor: '#10b981', flexShrink: 0 }} />
              <span style={{ flex: 1, color: '#a0aec0', fontSize: '0.82rem' }}>{r.nombre}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>{r.categoria}</span>
              <span style={{ fontSize: '0.7rem', color: '#52525b' }}>Día {r.diaCobro}</span>
              <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.85rem', minWidth: '80px', textAlign: 'right' }}>{fmt(r.valor)}</span>
              <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.25rem' }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {/* Deudas como fijos */}
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

        {/* Agregar */}
        {showAdd ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'flex-end', padding: '0.75rem', background: '#0a0a0a', borderRadius: '10px' }}>
            <div>
              <label style={lbl}>Nombre</label>
              <input style={inp} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Arriendo oficina" />
            </div>
            <div>
              <label style={lbl}>Valor COP</label>
              <input style={inp} type="text" inputMode="numeric"
                value={typeof form.valor === 'number' ? String(form.valor) : form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value.replace(/\D/g,'') as any }))}
                placeholder="0" />
            </div>
            <div>
              <label style={lbl}>Categoría</label>
              <select style={inp} value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {CATS_EGRESO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Día cobro</label>
              <input style={inp} type="number" min={1} max={31} value={form.diaCobro}
                onChange={e => setForm(f => ({ ...f, diaCobro: Number(e.target.value) }))} />
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button className="btn btn-primary" onClick={handleAdd} style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>Guardar</button>
              <button className="btn btn-outline" onClick={() => setShowAdd(false)} style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="btn btn-outline" style={{ width: '100%', padding: '0.5rem', fontSize: '0.82rem' }}>
            <Plus size={14} /> Agregar gasto fijo
          </button>
        )}
      </div>

      {/* Proyección 3 meses */}
      <div>
        <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Proyección de caja — próximos 3 meses</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
          {months3.map((m, i) => (
            <div key={m.ms} className="card" style={{ padding: '1.25rem', borderColor: i === 0 ? '#2a2a2a' : '#1a1a1a' }}>
              <div style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '0.875rem' }}>
                {i === 0 ? '← Este mes' : i === 1 ? 'Próximo mes' : 'En 2 meses'} · {m.mes}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', color: '#71717a' }}>Cobros acordados</span>
                  <span style={{ fontWeight: 700, color: '#10b981', fontSize: '0.85rem' }}>{fmtK(m.ingresosProyectados)}</span>
                </div>
                <div style={{ height: '1px', background: '#1a1a1a' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: '#71717a' }}>Gastos fijos</span>
                  <span style={{ color: '#ef4444', fontSize: '0.78rem' }}>−{fmtK(m.gastosRecurrentes)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.78rem', color: '#71717a' }}>Cuotas deuda</span>
                  <span style={{ color: '#f97316', fontSize: '0.78rem' }}>−{fmtK(m.cuotasDeuda)}</span>
                </div>
                {m.gastosComprometidos > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.78rem', color: '#71717a' }}>Gastos comprometidos</span>
                    <span style={{ color: '#f59e0b', fontSize: '0.78rem' }}>−{fmtK(m.gastosComprometidos)}</span>
                  </div>
                )}
                <div style={{ height: '1px', background: '#1a1a1a' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 700 }}>Balance</span>
                  <span style={{ fontWeight: 800, color: m.balance >= 0 ? '#10b981' : '#ef4444', fontSize: '1rem' }}>{fmtK(m.balance)}</span>
                </div>
              </div>

              {/* Mini barra visual */}
              {m.ingresosProyectados > 0 && (
                <div style={{ marginTop: '0.75rem', height: '6px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (m.totalEgresos / m.ingresosProyectados) * 100)}%`,
                    background: m.balance >= 0 ? '#10b981' : '#ef4444',
                    borderRadius: '999px',
                  }} />
                </div>
              )}
              {m.ingresosProyectados === 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: '#52525b' }}>
                  Sin cobros registrados para este mes.
                </div>
              )}
            </div>
          ))}
        </div>
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

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.375rem', background: '#111', padding: '0.25rem', borderRadius: '12px', width: 'fit-content' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '9px', fontSize: '0.82rem', fontWeight: 600,
              border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#000' : '#71717a',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'movimientos' && <Movimientos />}
      {tab === 'proyeccion'  && <Proyeccion />}
      {tab === 'cuentas'     && <Cuentas />}
      {tab === 'deudas'      && <Deudas />}
    </div>
  );
};
