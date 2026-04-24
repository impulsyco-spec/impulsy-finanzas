import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLedger } from '../hooks/useLedger';
import { calcKPIs } from '../hooks/useFinancials';
import { MESES_ES } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtPct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
const year = new Date().getFullYear();

export const ResumenAnual: React.FC = () => {
  const { movements, realAccounts, debts, loading } = useLedger();
  const navigate = useNavigate();

  const kpis = useMemo(() => calcKPIs(movements, realAccounts, debts), [movements, realAccounts, debts]);

  // Build per-month data
  const meses = useMemo(() => {
    return MESES_ES.map((nombre, idx) => {
      const mesStr = `${year}-${String(idx + 1).padStart(2, '0')}`;
      const movs = movements.filter(m => m.fecha.startsWith(mesStr));
      const confirmed = movs.filter(m => m.estado === 'confirmado');
      const ingresos = confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
      const gastos   = confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
      const balance  = ingresos - gastos;
      return { nombre, mesStr, movs: movs.length, ingresos, gastos, balance };
    });
  }, [movements]);

  // Running caja (saldo_inicial + ingresos acum - gastos acum)
  const saldoInicial = realAccounts.reduce((s, a) => s + a.saldoInicial, 0);
  const mesesConCaja = useMemo(() => {
    let caja = saldoInicial;
    return meses.map(m => {
      caja += m.balance;
      return { ...m, caja };
    });
  }, [meses, saldoInicial]);

  // Global stats
  const totalIng  = meses.reduce((s, m) => s + m.ingresos, 0);
  const totalGas  = meses.reduce((s, m) => s + m.gastos, 0);
  const totalUtil = totalIng - totalGas;
  const margenYTD = totalIng > 0 ? totalUtil / totalIng : 0;

  const mesesActivos = meses.filter(m => m.ingresos > 0 || m.gastos > 0);
  const mejorMes = meses.reduce((best, m) => m.balance > best.balance ? m : best, meses[0]);
  const peorMes  = mesesActivos.length > 0
    ? mesesActivos.reduce((worst, m) => m.balance < worst.balance ? m : worst, mesesActivos[0])
    : null;

  const maxIngresos = Math.max(...meses.map(m => m.ingresos), 1);

  // Top categorías de egreso (confirmed)
  const catMap: Record<string, number> = {};
  movements
    .filter(m => m.naturaleza === 'egreso' && m.estado === 'confirmado' && m.categoria)
    .forEach(m => { catMap[m.categoria!] = (catMap[m.categoria!] || 0) + m.valor; });
  const topCats = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Calculando...</div>;

  const goToMes = (mesStr: string) => navigate(`/movimientos?mes=${mesStr}`);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Resumen Anual {year}</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Click en cualquier mes para ver sus movimientos.</p>
      </header>

      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.75rem' }}>
        {[
          { label: 'Ingresos YTD',  value: fmt(totalIng),  color: '#10b981' },
          { label: 'Gastos YTD',    value: fmt(totalGas),  color: '#ef4444' },
          { label: 'Utilidad YTD',  value: fmt(totalUtil), color: totalUtil >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Margen YTD',    value: (margenYTD * 100).toFixed(1) + '%', color: margenYTD >= 0.3 ? '#10b981' : margenYTD >= 0.1 ? '#f59e0b' : '#ef4444' },
          { label: 'Mejor Mes',     value: mejorMes.ingresos > 0 ? mejorMes.nombre : '—', color: '#a855f7' },
          { label: 'Runway',        value: kpis.runway.toFixed(1) + ' meses', color: kpis.runway >= 3 ? '#10b981' : kpis.runway >= 1 ? '#f59e0b' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Grid de meses */}
      <div>
        <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Vista Mensual {year}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.875rem' }}>
          {mesesConCaja.map((m) => {
            const hasData = m.ingresos > 0 || m.gastos > 0;
            const barPct = Math.min(100, (m.ingresos / maxIngresos) * 100);
            const prevIdx = mesesConCaja.indexOf(m) - 1;
            const prevIng = prevIdx >= 0 ? mesesConCaja[prevIdx].ingresos : 0;
            const growthPct = prevIng > 0 && m.ingresos > 0 ? (m.ingresos - prevIng) / prevIng : null;

            return (
              <div
                key={m.mesStr}
                onClick={() => hasData && goToMes(m.mesStr)}
                className="card"
                style={{
                  padding: '1.1rem 1.25rem',
                  cursor: hasData ? 'pointer' : 'default',
                  opacity: hasData ? 1 : 0.45,
                  borderColor: hasData ? '#2a2a2a' : '#1a1a1a',
                  transition: 'border-color 0.2s, transform 0.15s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (hasData) (e.currentTarget as HTMLDivElement).style.borderColor = '#444'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = hasData ? '#2a2a2a' : '#1a1a1a'; }}
              >
                {/* Barra de progreso de ingresos */}
                {hasData && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: '#1a1a1a', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${barPct}%`, background: '#10b981', transition: 'width 0.5s' }} />
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px', color: hasData ? '#fff' : '#555', textTransform: 'uppercase' }}>
                    {m.nombre}
                  </span>
                  {growthPct !== null && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: growthPct >= 0 ? '#10b981' : '#ef4444' }}>
                      {fmtPct(growthPct)}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem 0.75rem', fontSize: '0.78rem' }}>
                  <span style={{ color: '#71717a' }}>Ingresos</span>
                  <span style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{m.ingresos > 0 ? fmt(m.ingresos) : '$0'}</span>
                  <span style={{ color: '#71717a' }}>Gastos</span>
                  <span style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{m.gastos > 0 ? fmt(m.gastos) : '$0'}</span>
                  <span style={{ color: '#71717a' }}>Balance</span>
                  <span style={{ textAlign: 'right', color: m.balance >= 0 ? '#fff' : '#ef4444', fontWeight: 700 }}>{fmt(m.balance)}</span>
                  <span style={{ color: '#71717a' }}>Caja</span>
                  <span style={{ textAlign: 'right', color: '#a855f7', fontWeight: 700 }}>{fmt(m.caja)}</span>
                </div>

                {hasData && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.7rem', color: '#52525b', textAlign: 'right' }}>
                    {m.movs} movimiento{m.movs !== 1 ? 's' : ''} →
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabla Anual + Top Categorías */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '1.5rem', alignItems: 'start' }}>

        {/* Tabla */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #222' }}>
            <h3 style={{ color: '#fff', fontWeight: 700 }}>Tabla Anual</h3>
          </div>
          <div className="table-wrapper">
            <table style={{ minWidth: '600px' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Mes</th>
                  <th style={{ textAlign: 'right', color: '#10b981' }}>Ingresos</th>
                  <th style={{ textAlign: 'right', color: '#ef4444' }}>Gastos</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                  <th style={{ textAlign: 'right' }}>Saldo Inicial</th>
                  <th style={{ textAlign: 'right' }}>Saldo Final</th>
                </tr>
              </thead>
              <tbody>
                {mesesConCaja.map((m, i) => {
                  const saldoIni = i === 0 ? saldoInicial : mesesConCaja[i - 1].caja;
                  return (
                    <tr
                      key={m.mesStr}
                      style={{ cursor: m.movs > 0 ? 'pointer' : 'default', opacity: m.movs > 0 ? 1 : 0.4 }}
                      onClick={() => m.movs > 0 && goToMes(m.mesStr)}
                    >
                      <td style={{ color: '#fff', fontWeight: 600 }}>{m.nombre}</td>
                      <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{m.ingresos > 0 ? fmt(m.ingresos) : '$0'}</td>
                      <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{m.gastos > 0 ? fmt(m.gastos) : '$0'}</td>
                      <td style={{ textAlign: 'right', color: m.balance >= 0 ? '#fff' : '#ef4444', fontWeight: 700 }}>{fmt(m.balance)}</td>
                      <td style={{ textAlign: 'right', color: '#71717a', fontSize: '0.85rem' }}>{fmt(saldoIni)}</td>
                      <td style={{ textAlign: 'right', color: '#a855f7', fontWeight: 700 }}>{fmt(m.caja)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#0a0a0a', borderTop: '2px solid #333' }}>
                  <td style={{ color: '#fff', fontWeight: 800 }}>TOTAL</td>
                  <td style={{ textAlign: 'right', color: '#10b981', fontWeight: 800 }}>{fmt(totalIng)}</td>
                  <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: 800 }}>{fmt(totalGas)}</td>
                  <td style={{ textAlign: 'right', color: totalUtil >= 0 ? '#fff' : '#ef4444', fontWeight: 800 }}>{fmt(totalUtil)}</td>
                  <td style={{ textAlign: 'right', color: '#71717a' }}>{fmt(saldoInicial)}</td>
                  <td style={{ textAlign: 'right', color: '#a855f7', fontWeight: 800 }}>{fmt(mesesConCaja[11]?.caja ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Top Categorías de gasto */}
        <div className="card" style={{ minWidth: '260px' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Top Categorías de Gasto</h3>
          {topCats.length === 0 ? (
            <p style={{ color: '#71717a', fontSize: '0.85rem' }}>Sin categorías registradas.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {topCats.map(([cat, val]) => (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{cat}</span>
                    <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700 }}>{fmt(val)}</span>
                  </div>
                  <div style={{ height: '4px', background: '#222', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(val / (topCats[0]?.[1] || 1)) * 100}%`, background: '#ef4444', opacity: 0.7, borderRadius: '999px' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Mejor y peor mes */}
          {mesesActivos.length > 0 && (
            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '10px', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.65rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Mejor Mes</div>
                <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.95rem', marginTop: '0.2rem' }}>{mejorMes.nombre}</div>
                <div style={{ color: '#a0aec0', fontSize: '0.8rem' }}>{fmt(mejorMes.balance)} balance</div>
              </div>
              {peorMes && peorMes.mesStr !== mejorMes.mesStr && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.65rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Mes Más Ajustado</div>
                  <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.95rem', marginTop: '0.2rem' }}>{peorMes.nombre}</div>
                  <div style={{ color: '#a0aec0', fontSize: '0.8rem' }}>{fmt(peorMes.balance)} balance</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
