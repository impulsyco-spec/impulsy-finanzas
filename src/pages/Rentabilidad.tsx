import React from 'react';
import { useLedger } from '../hooks/useLedger';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { calcRentabilidad } from '../hooks/useFinancials';

const fmt    = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtPct = (v: number | null) => v != null ? (v * 100).toFixed(1) + '%' : '—';

const semaforo = (margen: number | null) => {
  if (margen == null) return { color: '#71717a', icon: '⬜' };
  if (margen >= 0.3)  return { color: '#10b981', icon: '🟢' };
  if (margen >= 0.1)  return { color: '#f59e0b', icon: '🟡' };
  return { color: '#ef4444', icon: '🔴' };
};

export const Rentabilidad: React.FC = () => {
  const { movements, loading: loadLedger } = useLedger();
  const { clients, projects, loading: loadSupabase } = useSupabaseData();

  if (loadLedger || loadSupabase) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Calculando rentabilidad...</div>;

  const datos = calcRentabilidad(movements, projects, clients);

  const totIng  = datos.reduce((s, p) => s + p.ingresos, 0);
  const totEgr  = datos.reduce((s, p) => s + p.gastos, 0);
  const totUtil = totIng - totEgr;
  const margenGlobal = totIng > 0 ? totUtil / totIng : 0;

  // Proyectos sin gastos registrados (solo cobros de payments)
  const projectsWithData = new Set(datos.map(d => d.projectId));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Rentabilidad por Proyecto</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>
          Calculada desde movimientos del ledger vinculados a proyectos.
          {datos.length === 0 && ' Registra movimientos con proyecto asignado para ver datos.'}
        </p>
      </header>

      {/* Totales globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
        {[
          { label: 'Ingresos Totales', value: fmt(totIng),  color: '#10b981' },
          { label: 'Gastos Totales',   value: fmt(totEgr),  color: '#ef4444' },
          { label: 'Utilidad Neta',    value: fmt(totUtil), color: totUtil >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Margen Global',    value: fmtPct(margenGlobal), color: semaforo(margenGlobal).color },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Tabla de proyectos */}
      <div className="card" style={{ padding: 0 }}>
        {datos.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#71717a' }}>
            Sin datos de rentabilidad aún.<br />
            <span style={{ fontSize: '0.85rem' }}>Registra movimientos en <strong>Movimientos</strong> y asígnales un proyecto.</span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Salud</th>
                  <th>Proyecto</th>
                  <th>Cliente</th>
                  <th>Ingresos</th>
                  <th>Gastos</th>
                  <th>Utilidad</th>
                  <th>Margen</th>
                  <th>Movs</th>
                </tr>
              </thead>
              <tbody>
                {datos.map(p => {
                  const sem = semaforo(p.margen);
                  return (
                    <tr key={p.projectId}>
                      <td style={{ fontSize: '1.1rem' }}>{sem.icon}</td>
                      <td>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{p.nombre}</div>
                      </td>
                      <td style={{ color: '#a0aec0', fontSize: '0.85rem' }}>{p.cliente}</td>
                      <td style={{ color: '#10b981', fontWeight: 700 }}>{fmt(p.ingresos)}</td>
                      <td style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(p.gastos)}</td>
                      <td style={{ color: p.utilidad >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>{fmt(p.utilidad)}</td>
                      <td style={{ color: sem.color, fontWeight: 700 }}>{fmtPct(p.margen)}</td>
                      <td style={{ color: '#71717a', fontSize: '0.85rem' }}>{p.movimientos}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Proyectos sin movimientos en ledger */}
      {projects.filter(p => !projectsWithData.has(p.id)).length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
          <div style={{ color: '#f59e0b', fontWeight: 700, marginBottom: '0.5rem' }}>Proyectos sin movimientos en ledger</div>
          <div style={{ color: '#a0aec0', fontSize: '0.85rem' }}>
            Estos proyectos tienen cobros registrados pero no tienen movimientos financieros asignados:{' '}
            {projects.filter(p => !projectsWithData.has(p.id)).map(p => p.name).join(', ')}.
          </div>
        </div>
      )}
    </div>
  );
};
