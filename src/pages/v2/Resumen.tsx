import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLedger } from '../../hooks/useLedger';
import { calcKPIs, calcSemaforos } from '../../hooks/useFinancials';
import { MESES_ES } from '../../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => v >= 1_000_000 ? '$' + (v / 1_000_000).toFixed(1) + 'M' : v >= 1_000 ? '$' + (v / 1_000).toFixed(0) + 'K' : fmt(v);
const year = new Date().getFullYear();

const SEM_COLORS: Record<string, string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
const SEM_ICONS: Record<string, string>  = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };

const BarChart = ({ data, maxVal }: { data: { nombre: string; ing: number; gas: number; active: boolean }[]; maxVal: number }) => {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '160px', padding: '0 0.5rem' }}>
      {data.map(d => (
        <div key={d.nombre} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', position: 'relative' }}
          onMouseEnter={() => d.active && setHovered(d.nombre)} onMouseLeave={() => setHovered(null)}>
          {hovered === d.nombre && (
            <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '0.4rem 0.6rem', zIndex: 10, whiteSpace: 'nowrap', fontSize: '0.68rem', marginBottom: '4px', pointerEvents: 'none' }}>
              <div style={{ color: '#fff', fontWeight: 700, marginBottom: '2px' }}>{d.nombre}</div>
              <div style={{ color: '#10b981' }}>↑ {fmt(d.ing)}</div>
              <div style={{ color: '#ef4444' }}>↓ {fmt(d.gas)}</div>
              <div style={{ color: d.ing - d.gas >= 0 ? '#10b981' : '#ef4444', borderTop: '1px solid #333', marginTop: '2px', paddingTop: '2px', fontWeight: 700 }}>= {fmt(d.ing - d.gas)}</div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '130px', width: '100%', justifyContent: 'center' }}>
            <div style={{ width: '45%', background: '#10b981', height: `${Math.max((d.ing / maxVal) * 100, d.ing > 0 ? 2 : 0)}%`, borderRadius: '3px 3px 0 0', opacity: d.active ? 1 : 0.35, transition: 'height 0.4s' }} />
            <div style={{ width: '45%', background: '#ef4444', height: `${Math.max((d.gas / maxVal) * 100, d.gas > 0 ? 2 : 0)}%`, borderRadius: '3px 3px 0 0', opacity: d.active ? 0.8 : 0.25, transition: 'height 0.4s' }} />
          </div>
          <div style={{ fontSize: '0.58rem', color: hovered === d.nombre ? '#fff' : d.active ? '#a0aec0' : '#3f3f46', textAlign: 'center', marginTop: '4px' }}>{d.nombre.slice(0, 3)}</div>
        </div>
      ))}
    </div>
  );
};

export const Resumen: React.FC = () => {
  const { movements, realAccounts, debts, loading } = useLedger();
  const navigate = useNavigate();

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Calculando...</div>;

  const safeMovements   = movements   ?? [];
  const safeAccounts    = realAccounts ?? [];
  const safeDebts       = debts        ?? [];

  const kpis = calcKPIs(safeMovements, safeAccounts, safeDebts);
  const sems = calcSemaforos(kpis, safeMovements);

  const saldoInicial = safeAccounts.reduce((s, a) => s + (a.saldoInicial ?? 0), 0);

  let caja = saldoInicial;
  const meses = MESES_ES.map((nombre, idx) => {
    const ms   = `${year}-${String(idx + 1).padStart(2, '0')}`;
    const conf = safeMovements.filter(m => m.fecha.startsWith(ms) && m.estado === 'confirmado');
    const ing  = conf.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
    const gas  = conf.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
    const movs = safeMovements.filter(m => m.fecha.startsWith(ms)).length;
    caja += ing - gas;
    return { nombre, ms, ing, gas, bal: ing - gas, caja, movs, active: ing > 0 || gas > 0 };
  });

  const maxVal    = Math.max(...meses.map(m => Math.max(m.ing, m.gas)), 1);
  const totalIng  = meses.reduce((s, m) => s + m.ing, 0);
  const totalGas  = meses.reduce((s, m) => s + m.gas, 0);
  const totalUtil = totalIng - totalGas;

  // Top gastos por categoría
  const catMap: Record<string, number> = {};
  safeMovements.filter(m => m.naturaleza === 'egreso' && m.estado === 'confirmado' && m.categoria)
    .forEach(m => { catMap[m.categoria!] = (catMap[m.categoria!] || 0) + m.valor; });
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Alertas activas
  const hoy = new Date().toISOString().split('T')[0];
  const alertas: { nivel: 'rojo' | 'amarillo'; msg: string }[] = [];
  if (kpis.runway < 1) alertas.push({ nivel: 'rojo', msg: `Runway crítico: ${kpis.runway.toFixed(1)} meses` });
  const vencidos = safeMovements.filter(m => m.naturaleza === 'ingreso' && m.estado === 'esperado' && m.fechaVencimiento && m.fechaVencimiento < hoy);
  if (vencidos.length) alertas.push({ nivel: 'rojo', msg: `${vencidos.length} cobro(s) vencido(s) sin recibir` });
  if (kpis.margenYTD < 0.1 && totalIng > 0) alertas.push({ nivel: kpis.margenYTD < 0 ? 'rojo' : 'amarillo', msg: `Margen bajo: ${(kpis.margenYTD * 100).toFixed(1)}%` });
  if (kpis.runway < 3 && kpis.runway >= 1) alertas.push({ nivel: 'amarillo', msg: `Runway bajo: ${kpis.runway.toFixed(1)} meses` });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Resumen {year}</h1>
          <p style={{ color: '#52525b', marginTop: '0.2rem', fontSize: '0.85rem' }}>Click en un mes para ver sus movimientos.</p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.82rem' }}>
          <div><div style={{ color: '#52525b', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Ingresos YTD</div><div style={{ color: '#10b981', fontWeight: 800, fontSize: '1.1rem' }}>{fmtK(totalIng)}</div></div>
          <div><div style={{ color: '#52525b', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Gastos YTD</div><div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.1rem' }}>{fmtK(totalGas)}</div></div>
          <div><div style={{ color: '#52525b', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Utilidad YTD</div><div style={{ color: totalUtil >= 0 ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: '1.1rem' }}>{fmtK(totalUtil)}</div></div>
        </div>
      </header>

      {/* Gráfico anual */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Ingresos vs Gastos {year}</h3>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: '#71717a' }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#10b981', borderRadius: '2px', marginRight: '4px' }} />Ingresos</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: '#ef4444', borderRadius: '2px', marginRight: '4px', opacity: 0.8 }} />Gastos</span>
          </div>
        </div>
        <BarChart data={meses} maxVal={maxVal} />
      </div>

      {/* Grid meses + alertas + categorías */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Grid de meses */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.625rem' }}>
          {meses.map(m => (
            <div
              key={m.ms}
              onClick={() => m.active && navigate(`/finanzas?tab=movimientos&mes=${m.ms}`)}
              className="card"
              style={{
                padding: '0.875rem 1rem', cursor: m.active ? 'pointer' : 'default',
                opacity: m.active ? 1 : 0.35, minHeight: 'auto',
                borderTop: m.active ? `2px solid ${m.bal >= 0 ? '#10b98155' : '#ef444433'}` : '2px solid #111',
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px', color: m.active ? '#fff' : '#3f3f46', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{m.nombre}</div>
              <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>{m.ing > 0 ? fmtK(m.ing) : '—'}</div>
              <div style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>{m.gas > 0 ? fmtK(m.gas) : '—'}</div>
              <div style={{ fontSize: '0.75rem', color: m.bal >= 0 ? '#a0aec0' : '#ef4444', fontWeight: 700, marginTop: '0.25rem' }}>{fmt(m.bal)}</div>
              {m.active && <div style={{ fontSize: '0.62rem', color: '#3f3f46', marginTop: '0.4rem' }}>{m.movs} movs →</div>}
            </div>
          ))}
        </div>

        {/* Panel derecho */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Alertas */}
          {alertas.length > 0 && (
            <div className="card" style={{ padding: '1rem' }}>
              <h4 style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem' }}>⚠️ Alertas</h4>
              {alertas.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <span>{a.nivel === 'rojo' ? '🔴' : '🟡'}</span>
                  <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>{a.msg}</span>
                </div>
              ))}
            </div>
          )}

          {/* Semáforos compactos */}
          <div className="card" style={{ padding: '1rem' }}>
            <h4 style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem' }}>Estado financiero</h4>
            {sems.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.3rem 0', borderBottom: '1px solid #111' }}>
                <span style={{ fontSize: '0.78rem', color: '#71717a' }}>{s.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: SEM_COLORS[s.estado] }}>{s.valor}</span>
                  <span style={{ fontSize: '0.7rem' }}>{SEM_ICONS[s.estado]}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Top categorías de gasto */}
          {topCats.length > 0 && (
            <div className="card" style={{ padding: '1rem' }}>
              <h4 style={{ color: '#fff', fontWeight: 700, fontSize: '0.82rem', marginBottom: '0.75rem' }}>Top gastos</h4>
              {topCats.map(([cat, val]) => (
                <div key={cat} style={{ marginBottom: '0.625rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{cat}</span>
                    <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 700 }}>{fmtK(val)}</span>
                  </div>
                  <div style={{ height: '3px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(val / (topCats[0]?.[1] || 1)) * 100}%`, background: '#ef444466', borderRadius: '999px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
