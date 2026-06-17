import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Wallet, Target, ShieldCheck, Lock } from 'lucide-react';
import { usePersonal, PERSONAL_CONFIG } from '../../../hooks/usePersonal';
import { useLedger } from '../../../hooks/useLedger';
import { calcFounderStatus } from '../../../lib/founderRules';
import { hoyISO } from '../../../lib/dates';
import { AddPersonalModal } from '../../../components/AddPersonalModal';
import { GOLD, CAT_COLORS, fmt, fmtK, fmtFecha, PersonalHeader } from './comunes';

export const PersonalHoy: React.FC = () => {
  const navigate = useNavigate();
  const personal = usePersonal();
  const { movements, pockets, budgets, loading, setupError, refetch, sincronizarSalarios, addMovement, updateMovement } = personal;
  const { movements: ledgerMovs, loading: loadingLedger } = useLedger();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  // Puente del salario: corre una vez al cargar, idempotente
  const syncDone = useRef(false);
  useEffect(() => {
    if (loading || loadingLedger || setupError || syncDone.current) return;
    syncDone.current = true;
    sincronizarSalarios(ledgerMovs);
  }, [loading, loadingLedger, setupError, ledgerMovs, sincronizarSalarios]);

  const hoyStr = hoyISO();
  const mesActual = hoyStr.slice(0, 7);

  const conf = movements.filter(m => m.estado === 'confirmado');
  const saldo = conf.reduce((s, m) => s + (m.naturaleza === 'ingreso' ? m.valor : -m.valor), 0);
  const enBolsillos = pockets.filter(p => p.activo).reduce((s, p) => s + p.saldo, 0);
  const libre = saldo - enBolsillos;

  const movsMes = conf.filter(m => m.fecha.startsWith(mesActual));
  const ingresosMes = movsMes.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const gastadoMes  = movsMes.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  const ahorroMes   = ingresosMes - gastadoMes;
  const pctAhorro   = ingresosMes > 0 ? ahorroMes / ingresosMes : 0;
  const metaAhorro  = ingresosMes * PERSONAL_CONFIG.metaAhorroPct;

  const founder = useMemo(() => calcFounderStatus(ledgerMovs), [ledgerMovs]);

  // Presupuesto: gastado del mes por categoría vs tope
  const gastoPorCat = useMemo(() => {
    const map: Record<string, number> = {};
    movsMes.filter(m => m.naturaleza === 'egreso').forEach(m => {
      map[m.categoria || 'Sin categoría'] = (map[m.categoria || 'Sin categoría'] || 0) + m.valor;
    });
    return map;
  }, [movsMes]);

  const presupuestos = budgets.filter(b => b.activo).map(b => {
    const gastado = gastoPorCat[b.categoria] || 0;
    const pct = b.topeMensual > 0 ? (gastado / b.topeMensual) * 100 : 0;
    return { ...b, gastado, pct, color: pct >= 100 ? '#ef4444' : pct >= 70 ? GOLD : '#10b981' };
  }).sort((a, b) => b.pct - a.pct);

  const pendientes = movements.filter(m => m.estado === 'esperado');
  const atrasados = pendientes.filter(m => m.fecha < hoyStr).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const en7 = new Date(); en7.setDate(en7.getDate() + 7);
  const fin7 = `${en7.getFullYear()}-${String(en7.getMonth() + 1).padStart(2, '0')}-${String(en7.getDate()).padStart(2, '0')}`;
  const proximos7 = pendientes.filter(m => m.fecha >= hoyStr && m.fecha <= fin7).sort((a, b) => a.fecha.localeCompare(b.fecha));

  const catData = Object.entries(gastoPorCat).sort((a, b) => b[1] - a[1]);
  const maxCat = catData[0]?.[1] || 1;

  const confirmar = async (id: string) => {
    setConfirmandoId(id);
    try { await updateMovement(id, { estado: 'confirmado', fecha: hoyStr }); }
    finally { setConfirmandoId(null); }
  };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando tu mundo personal...</div>;

  if (setupError) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PersonalHeader titulo="🏠 Hoy" sub="¿Cómo estoy?" />
      <div className="card" style={{ padding: '2rem', border: `1px solid ${GOLD}44`, textAlign: 'center' }}>
        <h2 style={{ color: GOLD, fontWeight: 800, marginBottom: '0.75rem' }}>Falta activar el modo Personal</h2>
        <p style={{ color: '#a0aec0', fontSize: '0.85rem' }}>Ejecuta <b>supabase-modo-personal.sql</b> en el SQL Editor de Supabase y vuelve.</p>
        <button onClick={refetch} className="btn btn-primary" style={{ marginTop: '1rem' }}>Ya lo ejecuté</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', paddingBottom: '5rem' }}>
      <PersonalHeader titulo="🏠 Hoy" sub={`Tu cuenta ${PERSONAL_CONFIG.cuenta} — separada de Impulsy.`} />

      {/* KPIs — el protagonista es el DISPONIBLE LIBRE */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr', gap: '0.875rem' }}>
        <div className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', border: `1px solid ${GOLD}55`, background: `linear-gradient(135deg, ${GOLD}0e, transparent)` }}>
          <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: GOLD }}><Wallet size={13} /> DISPONIBLE LIBRE</span>
          <span className="stat-value" style={{ color: libre >= 0 ? GOLD : '#ef4444', fontSize: '1.6rem' }}>{fmtK(libre)}</span>
          <span style={{ fontSize: '0.62rem', color: '#52525b' }}>
            Saldo {fmtK(saldo)} − apartado {fmtK(enBolsillos)} <Lock size={9} style={{ display: 'inline' }} />
          </span>
        </div>
        {[
          { label: 'Ingresos del mes', value: fmtK(ingresosMes), color: '#10b981' },
          { label: 'Gastado del mes',  value: fmtK(gastadoMes),  color: '#ef4444' },
          { label: 'Ahorro del mes',   value: `${fmtK(ahorroMes)} · ${(pctAhorro * 100).toFixed(0)}%`, color: ahorroMes >= metaAhorro ? '#10b981' : ahorroMes >= 0 ? GOLD : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', borderColor: `${GOLD}22` }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.25rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Presupuesto por categoría — semáforos */}
      {presupuestos.length > 0 && (
        <div className="card" style={{ padding: '1.1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Presupuesto del mes</h3>
            <button onClick={() => navigate('/personal/proyeccion')} style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>Configurar →</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem' }}>
            {presupuestos.map(p => (
              <div key={p.id} style={{ background: '#0d0d0d', borderRadius: '10px', padding: '0.7rem 0.875rem', border: `1px solid ${p.color}22` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: '#a0aec0', fontWeight: 600 }}>{p.categoria}</span>
                  <span style={{ fontSize: '0.7rem' }}>{p.pct >= 100 ? '🔴' : p.pct >= 70 ? '🟡' : '🟢'}</span>
                </div>
                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: p.color, marginTop: '0.2rem' }}>
                  {fmtK(p.gastado)} <span style={{ color: '#52525b', fontWeight: 500 }}>de {fmtK(p.topeMensual)}</span>
                </div>
                <div style={{ height: '4px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', marginTop: '0.4rem' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, p.pct)}%`, background: p.color, borderRadius: '999px' }} />
                </div>
                {p.pct >= 100 && <div style={{ fontSize: '0.62rem', color: '#ef4444', marginTop: '0.3rem', fontWeight: 700 }}>Tope superado en {fmt(p.gastado - p.topeMensual)}</div>}
                {p.pct >= 70 && p.pct < 100 && <div style={{ fontSize: '0.62rem', color: GOLD, marginTop: '0.3rem' }}>Te queda {fmt(p.topeMensual - p.gastado)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metas + Conexión con Impulsy */}
      <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
        {/* Meta de ahorro */}
        <div className="card" style={{ padding: '1.1rem', borderColor: `${GOLD}22` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <Target size={13} style={{ color: GOLD }} />
            <span style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Meta de ahorro · {(PERSONAL_CONFIG.metaAhorroPct * 100).toFixed(0)}% del ingreso</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: ahorroMes >= metaAhorro ? '#10b981' : '#fff' }}>
            {fmtK(Math.max(0, ahorroMes))} <span style={{ fontSize: '0.75rem', color: '#52525b', fontWeight: 600 }}>de {fmtK(metaAhorro)}</span>
          </div>
          <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', marginTop: '0.5rem' }}>
            <div style={{ height: '100%', width: `${metaAhorro > 0 ? Math.min(100, (ahorroMes / metaAhorro) * 100) : 0}%`, background: ahorroMes >= metaAhorro ? '#10b981' : GOLD, borderRadius: '999px' }} />
          </div>
        </div>

        {/* Bolsillos resumen */}
        <div className="card" style={{ padding: '1.1rem', borderColor: `${GOLD}22`, cursor: 'pointer' }} onClick={() => navigate('/personal/bolsillos')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <Lock size={13} style={{ color: '#06b6d4' }} />
            <span style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Apartado en bolsillos ({pockets.filter(p => p.activo).length})</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#06b6d4' }}>{fmtK(enBolsillos)}</div>
          <div style={{ fontSize: '0.68rem', color: '#52525b', marginTop: '0.4rem' }}>
            {pockets.filter(p => p.activo).slice(0, 3).map(p => `${p.emoji} ${p.nombre}`).join(' · ') || 'Crea tu primera meta →'}
          </div>
        </div>

        {/* Conexión con Impulsy */}
        <div className="card" style={{ padding: '1.1rem', borderColor: founder.disponible < 0 ? '#ef444433' : `${GOLD}22` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <ShieldCheck size={13} style={{ color: founder.disponible < 0 ? '#ef4444' : '#10b981' }} />
            <span style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Conexión con Impulsy</span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#a0aec0', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Quincena disponible</span>
              <b style={{ color: founder.disponible >= 0 ? '#10b981' : '#ef4444' }}>{fmtK(founder.disponible)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Próximo salario</span>
              <b style={{ color: '#fff' }}>{fmtK(founder.proximoPago.monto)} · {fmtFecha(founder.proximoPago.fecha)}</b>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Deuda con Impulsy</span>
              <b style={{ color: founder.deudaArrastrada > 0 ? '#ef4444' : '#10b981' }}>{founder.deudaArrastrada > 0 ? fmt(founder.deudaArrastrada) : '$0 ✓'}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Atrasados */}
      {atrasados.length > 0 && (
        <div className="card" style={{ padding: '1.1rem', border: '1px solid #ef444433' }}>
          <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.6rem' }}>
            ⏰ Atrasados ({atrasados.length}) — {fmt(atrasados.reduce((s, m) => s + m.valor, 0))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {atrasados.map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#0a0a0a', borderRadius: '8px', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <span style={{ fontSize: '0.72rem', color: '#71717a' }}>{fmtFecha(m.fecha)}</span>
                  <span style={{ fontSize: '0.8rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                  <span style={{ fontWeight: 700, color: '#ef4444', fontSize: '0.82rem' }}>{fmt(m.valor)}</span>
                  <button onClick={() => confirmar(m.id)} disabled={confirmandoId === m.id}
                    style={{ background: '#fff', color: '#000', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {confirmandoId === m.id ? '...' : '✓ Pagado'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gasto por categoría + próximos 7 días */}
      <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Gasto del mes por categoría</h3>
          {catData.length === 0 ? (
            <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '2rem 0' }}>Sin gastos este mes.</div>
          ) : (
            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', height: '150px' }}>
              {catData.map(([cat, val], i) => (
                <div key={cat} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', minWidth: 0 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: CAT_COLORS[i % CAT_COLORS.length], marginBottom: '0.2rem' }}>{fmtK(val)}</span>
                  <div style={{ width: '70%', maxWidth: '46px', height: `${Math.max(6, (val / maxCat) * 100)}px`, background: CAT_COLORS[i % CAT_COLORS.length], borderRadius: '5px 5px 0 0', opacity: 0.85 }} title={`${cat}: ${fmt(val)}`} />
                  <span style={{ fontSize: '0.6rem', color: '#71717a', marginTop: '0.3rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }} title={cat}>{cat}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Próximos 7 días</h3>
          {proximos7.length === 0 ? (
            <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '2rem 0' }}>Semana despejada ✓</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {proximos7.map(m => (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#0a0a0a', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                    <span style={{ fontSize: '0.72rem', color: '#71717a', flexShrink: 0 }}>{fmtFecha(m.fecha)}</span>
                    <span style={{ fontSize: '0.78rem', color: '#a0aec0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</span>
                  </div>
                  <span style={{ fontWeight: 700, color: GOLD, fontSize: '0.8rem', flexShrink: 0 }}>{fmt(m.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <button onClick={() => setModalOpen(true)}
        className="fab"
        style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: GOLD, color: '#000', border: 'none', borderRadius: '999px', padding: '0.875rem 1.5rem', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 24px rgba(245,158,11,0.35)', zIndex: 50, fontFamily: 'inherit' }}>
        <Plus size={18} /> Registrar
      </button>

      {modalOpen && (
        <AddPersonalModal onClose={() => setModalOpen(false)}
          pockets={pockets.filter(p => p.activo).map(p => ({ id: p.id, nombre: p.nombre, emoji: p.emoji }))}
          onSave={async m => { await addMovement(m); setModalOpen(false); }} />
      )}
    </div>
  );
};
