import React from 'react';
import { useLedger } from '../hooks/useLedger';
import { AddLedgerModal } from '../components/AddLedgerModal';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { useState } from 'react';
import { Plus } from 'lucide-react';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';

const RETIRO_LABELS: Record<string, string> = {
  sueldo_aprobado:       'Sueldo Aprobado',
  anticipo_sueldo:       'Anticipo de Sueldo',
  retiro_extraordinario: 'Retiro Extraordinario',
  gasto_personal_empresa:'Gasto Personal (Empresa)',
};

const RETIRO_COLORS: Record<string, string> = {
  sueldo_aprobado:       '#10b981',
  anticipo_sueldo:       '#f59e0b',
  retiro_extraordinario: '#ef4444',
  gasto_personal_empresa:'#f97316',
};

export const Retiros: React.FC = () => {
  const { movements, realAccounts, pockets, loading, refetch } = useLedger();
  const { clients, projects } = useSupabaseData();
  const [modalOpen, setModalOpen] = useState(false);

  const retiros = movements.filter(m => m.tipoMovimiento === 'retiro_fundador' && m.estado === 'confirmado');
  const personales = movements.filter(m => m.personalFlag && m.estado === 'confirmado');

  const hoy = new Date();
  const mesActual = `${String(hoy.getFullYear())}-${String(hoy.getMonth() + 1).padStart(2,'0')}`;
  const retirosDelMes = retiros.filter(m => m.fecha.startsWith(mesActual));

  const totalRetiros   = retiros.reduce((s, m) => s + m.valor, 0);
  const totalMes       = retirosDelMes.reduce((s, m) => s + m.valor, 0);
  const totalPersonales = personales.reduce((s, m) => s + m.valor, 0);

  // Ingresos YTD para calcular porcentaje
  const yearStart = `${hoy.getFullYear()}-01-01`;
  const ingresosYTD = movements
    .filter(m => m.naturaleza === 'ingreso' && m.estado === 'confirmado' && m.fecha >= yearStart)
    .reduce((s, m) => s + m.valor, 0);
  const pctRetiros = ingresosYTD > 0 ? totalRetiros / ingresosYTD : 0;

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;

  const semColor = pctRetiros === 0 ? '#10b981' : pctRetiros < 0.15 ? '#f59e0b' : '#ef4444';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Retiros del Fundador</h1>
          <p style={{ color: '#71717a', marginTop: '0.25rem' }}>Control de dinero que sale hacia el fundador. No debe confundirse con gastos operativos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Registrar Retiro
        </button>
      </header>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem' }}>
        {[
          { label: 'Total Retiros YTD',     value: fmt(totalRetiros),     color: semColor },
          { label: 'Retiros Este Mes',       value: fmt(totalMes),         color: '#f59e0b' },
          { label: 'Gastos Personales YTD',  value: fmt(totalPersonales),  color: '#f97316' },
          { label: '% vs Ingresos YTD',      value: fmtPct(pctRetiros),    color: semColor },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Alerta si hay gastos personales */}
      {personales.length > 0 && (
        <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: '12px', padding: '1rem 1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <div style={{ color: '#f97316', fontWeight: 700 }}>Gastos personales detectados en caja empresa</div>
            <div style={{ color: '#a0aec0', fontSize: '0.85rem', marginTop: '0.2rem' }}>
              {personales.length} movimiento(s) marcados como personal. Total: {fmt(totalPersonales)}.
              Revísalos y reclasifícalos si corresponde.
            </div>
          </div>
        </div>
      )}

      {/* Retiros del fundador */}
      <div>
        <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Retiros Registrados</h2>
        {retiros.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#71717a', border: '1px dashed #333', borderRadius: '12px' }}>
            Sin retiros registrados
          </div>
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Descripción</th><th>Tipo Retiro</th><th>Mes</th><th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {retiros.map(m => (
                  <tr key={m.id}>
                    <td style={{ color: '#a0aec0', fontSize: '0.8rem' }}>
                      {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={{ color: '#fff' }}>{m.descripcion}</td>
                    <td>
                      {m.tipoRetiro ? (
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: RETIRO_COLORS[m.tipoRetiro] || '#fff', background: `${RETIRO_COLORS[m.tipoRetiro] || '#fff'}18`, padding: '0.2rem 0.6rem', borderRadius: '999px' }}>
                          {RETIRO_LABELS[m.tipoRetiro] || m.tipoRetiro}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ color: '#a0aec0', fontSize: '0.8rem' }}>{m.mes || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#ef4444' }}>{fmt(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gastos personales */}
      {personales.length > 0 && (
        <div>
          <h2 style={{ color: '#f97316', fontWeight: 700, marginBottom: '1rem' }}>⚠️ Gastos Personales en Caja Empresa</h2>
          <div className="card" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Mes</th><th>Valor</th></tr>
              </thead>
              <tbody>
                {personales.map(m => (
                  <tr key={m.id} style={{ background: 'rgba(249,115,22,0.04)' }}>
                    <td style={{ color: '#a0aec0', fontSize: '0.8rem' }}>
                      {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}
                    </td>
                    <td style={{ color: '#f97316' }}>⚠️ {m.descripcion}</td>
                    <td style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{m.categoria || '—'}</td>
                    <td style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{m.mes || '—'}</td>
                    <td style={{ fontWeight: 700, color: '#f97316' }}>{fmt(m.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddLedgerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => { refetch(); setModalOpen(false); }}
        realAccounts={realAccounts} pockets={pockets}
        projects={projects} clients={clients}
        editing={null}
      />
    </div>
  );
};
