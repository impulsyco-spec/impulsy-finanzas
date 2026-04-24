import React from 'react';
import { useLedger } from '../hooks/useLedger';
import { MESES_ES } from '../types';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');

export const Cortes: React.FC = () => {
  const { movements, pockets, loading } = useLedger();

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  const year = new Date().getFullYear();

  const pocketsCfg = pockets.filter(p => p.porcentajeDefault != null);

  // Calcular ingresos por mes y corte
  const data = MESES_ES.map((mes, idx) => {
    const monthStr = `${year}-${String(idx + 1).padStart(2,'0')}`;
    const movsMes = movements.filter(
      m => m.fecha.startsWith(monthStr) &&
           m.naturaleza === 'ingreso' &&
           m.estado === 'confirmado'
    );

    const c1 = movsMes.filter(m => parseInt(m.fecha.split('-')[2] || '0') <= 15).reduce((s, m) => s + m.valor, 0);
    const c2 = movsMes.filter(m => parseInt(m.fecha.split('-')[2] || '0') > 15).reduce((s, m) => s + m.valor, 0);
    const total = c1 + c2;

    return { mes, c1, c2, total };
  }).filter(m => m.total > 0);

  const totalAnual = data.reduce((s, m) => s + m.total, 0);

  const thStyle: React.CSSProperties = { color: '#71717a', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '0.75rem 1rem', borderBottom: '1px solid #222', textAlign: 'right' };
  const tdStyle: React.CSSProperties = { padding: '0.875rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.9rem' };

  const POCKET_COLORS: Record<string,string> = { 'Operación':'#a855f7','Sueldo':'#06b6d4','Reserva':'#f59e0b','Impuestos':'#f97316','Inversión':'#10b981','Deuda':'#ef4444' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Cortes Quincenales</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Distribución de ingresos cobrados por corte. Corte 1: días 1–15 · Corte 2: días 16–fin.</p>
      </header>

      {/* Regla de distribución */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        {pocketsCfg.map(p => (
          <div key={p.id} style={{ background: `${POCKET_COLORS[p.nombre] || '#a855f7'}18`, border: `1px solid ${POCKET_COLORS[p.nombre] || '#a855f7'}33`, borderRadius: '10px', padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ color: POCKET_COLORS[p.nombre] || '#a855f7', fontWeight: 800 }}>{p.porcentajeDefault}%</span>
            <span style={{ color: '#a0aec0', fontSize: '0.875rem' }}>{p.nombre}</span>
          </div>
        ))}
        {pocketsCfg.length === 0 && <span style={{ color: '#71717a', fontSize: '0.85rem' }}>Sin bolsillos con porcentaje configurado. Configúralos en Cuentas.</span>}
      </div>

      {data.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a', border: '1px dashed #333', borderRadius: '12px' }}>
          Sin ingresos confirmados registrados aún.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ minWidth: '900px' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', width: '100px' }}>Mes</th>
                {/* Corte 1 */}
                <th style={{ ...thStyle, borderLeft: '2px solid #333' }}>Cobrado C1</th>
                {pocketsCfg.map(p => <th key={`c1-${p.id}`} style={{ ...thStyle, color: POCKET_COLORS[p.nombre] || '#a855f7' }}>{p.nombre}</th>)}
                {/* Corte 2 */}
                <th style={{ ...thStyle, borderLeft: '2px solid #333' }}>Cobrado C2</th>
                {pocketsCfg.map(p => <th key={`c2-${p.id}`} style={{ ...thStyle, color: POCKET_COLORS[p.nombre] || '#a855f7' }}>{p.nombre}</th>)}
                {/* Total */}
                <th style={{ ...thStyle, borderLeft: '2px solid #333' }}>Total Mes</th>
              </tr>
            </thead>
            <tbody>
              {data.map(m => (
                <tr key={m.mes}>
                  <td style={{ ...tdStyle, textAlign: 'left', color: '#fff', fontWeight: 700 }}>{m.mes}</td>
                  {/* Corte 1 */}
                  <td style={{ ...tdStyle, borderLeft: '2px solid #222', color: '#10b981' }}>{m.c1 > 0 ? fmt(m.c1) : '—'}</td>
                  {pocketsCfg.map(p => (
                    <td key={`c1-${p.id}`} style={{ ...tdStyle, color: POCKET_COLORS[p.nombre] || '#a855f7' }}>
                      {m.c1 > 0 ? fmt(m.c1 * (p.porcentajeDefault! / 100)) : '—'}
                    </td>
                  ))}
                  {/* Corte 2 */}
                  <td style={{ ...tdStyle, borderLeft: '2px solid #222', color: '#10b981' }}>{m.c2 > 0 ? fmt(m.c2) : '—'}</td>
                  {pocketsCfg.map(p => (
                    <td key={`c2-${p.id}`} style={{ ...tdStyle, color: POCKET_COLORS[p.nombre] || '#a855f7' }}>
                      {m.c2 > 0 ? fmt(m.c2 * (p.porcentajeDefault! / 100)) : '—'}
                    </td>
                  ))}
                  {/* Total */}
                  <td style={{ ...tdStyle, borderLeft: '2px solid #222', color: '#fff', fontWeight: 800 }}>{fmt(m.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#0a0a0a', borderTop: '2px solid #333' }}>
                <td style={{ ...tdStyle, textAlign: 'left', color: '#fff', fontWeight: 800 }}>TOTAL AÑO</td>
                <td style={{ ...tdStyle, borderLeft: '2px solid #222', color: '#10b981', fontWeight: 800 }}>
                  {fmt(data.reduce((s, m) => s + m.c1, 0))}
                </td>
                {pocketsCfg.map(p => (
                  <td key={`tot-c1-${p.id}`} style={{ ...tdStyle, color: POCKET_COLORS[p.nombre] || '#a855f7', fontWeight: 800 }}>
                    {fmt(data.reduce((s, m) => s + m.c1 * (p.porcentajeDefault! / 100), 0))}
                  </td>
                ))}
                <td style={{ ...tdStyle, borderLeft: '2px solid #222', color: '#10b981', fontWeight: 800 }}>
                  {fmt(data.reduce((s, m) => s + m.c2, 0))}
                </td>
                {pocketsCfg.map(p => (
                  <td key={`tot-c2-${p.id}`} style={{ ...tdStyle, color: POCKET_COLORS[p.nombre] || '#a855f7', fontWeight: 800 }}>
                    {fmt(data.reduce((s, m) => s + m.c2 * (p.porcentajeDefault! / 100), 0))}
                  </td>
                ))}
                <td style={{ ...tdStyle, borderLeft: '2px solid #222', color: '#fff', fontWeight: 800 }}>{fmt(totalAnual)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
