import React, { useMemo, useState } from 'react';
import { usePersonal, PERSONAL_CONFIG } from '../../../hooks/usePersonal';
import { GOLD, CAT_COLORS, fmt, fmtK, PersonalHeader } from './comunes';

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

export const PersonalResumen: React.FC = () => {
  const { movements, loading, setupError } = usePersonal();
  const añoActual = new Date().getFullYear();
  const [año, setAño] = useState(añoActual);

  const conf = useMemo(() => movements.filter(m => m.estado === 'confirmado' && m.categoria !== 'Ajuste' && m.fecha.startsWith(String(año))), [movements, año]);

  const meses = useMemo(() => MESES.map((nombre, idx) => {
    const ms = `${año}-${String(idx + 1).padStart(2, '0')}`;
    const movs = conf.filter(m => m.fecha.startsWith(ms));
    const ing = movs.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
    const gas = movs.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
    const ahorro = ing - gas;
    const pct = ing > 0 ? ahorro / ing : 0;
    return { nombre, ing, gas, ahorro, pct, activo: ing > 0 || gas > 0, cumplió: ing > 0 && ahorro >= ing * PERSONAL_CONFIG.metaAhorroPct };
  }), [conf, año]);

  const totIng = meses.reduce((s, m) => s + m.ing, 0);
  const totGas = meses.reduce((s, m) => s + m.gas, 0);
  const totAhorro = totIng - totGas;

  // Racha de meses (hacia atrás desde el último mes activo) cumpliendo la meta de ahorro
  const racha = useMemo(() => {
    let r = 0;
    const activos = meses.filter(m => m.activo);
    for (let i = activos.length - 1; i >= 0; i--) {
      if (activos[i].cumplió) r++; else break;
    }
    return r;
  }, [meses]);

  const catAnual = useMemo(() => {
    const map: Record<string, number> = {};
    conf.filter(m => m.naturaleza === 'egreso').forEach(m => { map[m.categoria || 'Sin categoría'] = (map[m.categoria || 'Sin categoría'] || 0) + m.valor; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [conf]);
  const maxCat = catAnual[0]?.[1] || 1;
  const maxMes = Math.max(...meses.map(m => Math.max(m.ing, m.gas)), 1);

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      <PersonalHeader titulo="📊 Resumen" sub="Tu año personal, mes a mes."
        extra={
          <div style={{ display: 'flex', gap: '0.3rem', background: '#111', padding: '0.2rem', borderRadius: '10px' }}>
            {[añoActual - 1, añoActual].map(a => (
              <button key={a} onClick={() => setAño(a)}
                style={{ padding: '0.35rem 0.875rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: año === a ? GOLD : 'transparent', color: año === a ? '#000' : '#71717a' }}>
                {a}
              </button>
            ))}
          </div>
        } />

      {/* KPIs del año */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
        {[
          { label: `Ingresos ${año}`, value: fmtK(totIng), color: '#10b981' },
          { label: `Gastos ${año}`,   value: fmtK(totGas), color: '#ef4444' },
          { label: `Ahorro ${año}`,   value: `${fmtK(totAhorro)} · ${totIng > 0 ? ((totAhorro / totIng) * 100).toFixed(0) : 0}%`, color: totAhorro >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Racha de meses cumpliendo', value: racha > 0 ? `🔥 ${racha}` : '—', color: GOLD },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', borderColor: `${GOLD}22` }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.25rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Mes a mes */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Ingresos vs Gastos — mes a mes</h3>
        <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'flex-end', height: '160px' }}>
          {meses.map(m => (
            <div key={m.nombre} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', gap: '2px', alignItems: 'flex-end', height: '120px' }}>
                <div style={{ width: '10px', height: `${Math.max(m.ing > 0 ? 4 : 0, (m.ing / maxMes) * 100)}%`, background: '#10b981', borderRadius: '3px 3px 0 0' }} title={`Ingresos: ${fmt(m.ing)}`} />
                <div style={{ width: '10px', height: `${Math.max(m.gas > 0 ? 4 : 0, (m.gas / maxMes) * 100)}%`, background: '#ef4444', borderRadius: '3px 3px 0 0', opacity: 0.8 }} title={`Gastos: ${fmt(m.gas)}`} />
              </div>
              <span style={{ fontSize: '0.6rem', color: m.activo ? '#a0aec0' : '#3f3f46', marginTop: '0.3rem' }}>{m.nombre}</span>
              {m.activo && <span style={{ fontSize: '0.58rem', color: m.cumplió ? '#10b981' : '#52525b' }}>{m.cumplió ? '✓' : `${(m.pct * 100).toFixed(0)}%`}</span>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', fontSize: '0.7rem', color: '#71717a' }}>
          <span><span style={{ display: 'inline-block', width: '9px', height: '9px', background: '#10b981', borderRadius: '2px', marginRight: '4px' }} />Ingresos</span>
          <span><span style={{ display: 'inline-block', width: '9px', height: '9px', background: '#ef4444', borderRadius: '2px', marginRight: '4px', opacity: 0.8 }} />Gastos</span>
          <span>✓ = cumplió la meta de ahorro del {(PERSONAL_CONFIG.metaAhorroPct * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Categorías del año */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>¿En qué se fue la plata en {año}?</h3>
        {catAnual.length === 0 ? (
          <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1.5rem 0' }}>Sin gastos registrados en {año}.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {catAnual.map(([cat, val], i) => (
              <div key={cat}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#a0aec0' }}>
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: CAT_COLORS[i % CAT_COLORS.length], marginRight: '0.4rem' }} />
                    {cat}
                  </span>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: CAT_COLORS[i % CAT_COLORS.length] }}>
                    {fmt(val)} <span style={{ color: '#52525b', fontWeight: 500 }}>({totGas > 0 ? ((val / totGas) * 100).toFixed(0) : 0}%)</span>
                  </span>
                </div>
                <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(val / maxCat) * 100}%`, background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: '999px', opacity: 0.85 }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
