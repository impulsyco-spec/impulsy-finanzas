import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, CreditCard, Zap, Target } from 'lucide-react';
import { usePersonal, PersonalDebt, PERSONAL_CONFIG } from '../../../hooks/usePersonal';
import { simularSnowball, PlanSnowball, DeudaSim } from '../../../lib/snowball';
import { hoyISO } from '../../../lib/dates';
import { GOLD, fmt, fmtK, inp, lbl, fmtInput, PersonalHeader, Setup2Banner } from './comunes';

const TIPOS: Record<PersonalDebt['tipo'], string> = {
  tarjeta: '💳 Tarjeta', prestamo: '🏦 Préstamo', credito: '📄 Crédito', otro: '📌 Otro',
};

const PRESU_QUINCENA = PERSONAL_CONFIG.presupuestoDeudaQuincena; // fijo e inviolable
const PRESU_MES = PRESU_QUINCENA * 2;
const toSim = (d: PersonalDebt): DeudaSim => ({
  id: d.id, acreedor: d.acreedor, saldoActual: d.saldoActual,
  tasaMensual: d.tasaMensual, cuotaMinima: d.cuotaMinima, fechaProximoPago: d.fechaProximoPago,
});

// ── Resumen del plan (bola de nieve con presupuesto FIJO e inviolable) ──
// Solo lectura: los montos exactos por mes viven en los movimientos proyectados.
const PlanResumen: React.FC<{ plan: PlanSnowball; target?: PersonalDebt }> = ({ plan, target }) => {
  if (plan.movimientos.length === 0) return null;
  return (
    <div className="card" style={{ padding: '1.25rem', border: `1px solid ${GOLD}44`, background: `linear-gradient(135deg, ${GOLD}0c, transparent)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
        <Target size={18} style={{ color: GOLD }} />
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>Plan bola de nieve</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.66rem', color: GOLD, fontWeight: 700, background: `${GOLD}14`, padding: '0.2rem 0.55rem', borderRadius: '999px' }}>
          {fmtK(PRESU_QUINCENA)}/quincena fijo · {fmtK(PRESU_MES)}/mes
        </span>
      </div>

      <div>
        <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Deuda libre en</div>
        <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', lineHeight: 1.05 }}>
          {plan.meses} <span style={{ fontSize: '1rem', fontWeight: 700 }}>meses</span>
          <span style={{ fontSize: '0.85rem', color: '#52525b', fontWeight: 600 }}> · {plan.libreLabel}</span>
        </div>
      </div>

      {/* Ataca ahora */}
      {target && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.75rem', padding: '0.7rem 0.85rem', borderRadius: '10px', background: '#0d0d0d', border: '1px solid #7f1d1d55' }}>
          <Zap size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ fontSize: '0.78rem', color: '#e4e4e7', lineHeight: 1.45 }}>
            <b style={{ color: '#fff' }}>Ataca ahora: {target.acreedor}.</b> El excedente de tus $700k va a esta ({target.tasaMensual}%/mes — la que más te sangra). Cuando muera, rueda solo a la siguiente. Los <b style={{ color: '#fff' }}>montos exactos por mes</b> ya están en tus movimientos proyectados.
          </div>
        </div>
      )}

      {/* Orden de muerte */}
      <div style={{ marginTop: '0.85rem' }}>
        <div style={{ fontSize: '0.64rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem' }}>Orden en que caen 💀</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {plan.orden.map((o, i) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.76rem' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: i === 0 ? '#ef444422' : '#18181b', color: i === 0 ? '#ef4444' : '#71717a', fontWeight: 800, fontSize: '0.66rem', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, color: '#a0aec0' }}>{o.acreedor}</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>{o.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: '0.66rem', color: '#52525b', marginTop: '0.7rem', lineHeight: 1.5 }}>
        Interés total en el camino: <b style={{ color: '#a0aec0' }}>{fmt(Math.round(plan.interesTotal))}</b>. Cada mes pagas los mínimos + el excedente a la de arriba, y las cuotas se recalculan solas al abonar.
      </div>
    </div>
  );
};

export const PersonalDeudas: React.FC = () => {
  const { debts, loading, setupError, setup2Error, refetch, addDebt, removeDebt, pagarDeuda } = usePersonal();
  const [showAdd, setShowAdd] = useState(false);
  const [pagando, setPagando] = useState<PersonalDebt | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Orden del plan: lo que se paga primero arriba (por fecha de próximo pago)
  const activas = debts.filter(d => d.activa && d.saldoActual > 0)
    .sort((a, b) => (a.fechaProximoPago || '9999').localeCompare(b.fechaProximoPago || '9999'));
  const saldadas = debts.filter(d => d.activa && d.saldoActual <= 0);
  const totalDeuda = activas.reduce((s, d) => s + d.saldoActual, 0);

  // Plan bola de nieve (misma lógica que el motor que escribe los proyectados)
  const plan = useMemo(() => simularSnowball(activas.map(toSim), PRESU_MES), [activas]);
  const target = useMemo(() =>
    activas.slice().sort((a, b) => ((b.tasaMensual ?? 2) - (a.tasaMensual ?? 2)) || (a.saldoActual - b.saldoActual))[0],
    [activas]);
  // Próximo pago (según bola de nieve) y mes de muerte, por deuda
  const proximoDe = (id: string) => plan.movimientos.filter(m => m.deudaId === id).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  const muereDe = (id: string) => plan.orden.find(o => o.id === id);
  // Cuánto pide el plan este mes en curso (suma de los proyectados de este mes)
  const mesEnCurso = hoyISO().slice(0, 7);
  const aPagarEsteMes = plan.movimientos.filter(m => m.fecha.startsWith(mesEnCurso)).reduce((s, m) => s + m.valor, 0);

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      <PersonalHeader titulo="💳 Deudas" sub="Tarjetas y préstamos personales — cada pago queda en Movimientos."
        extra={!setup2Error ? (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={16} /> Nueva Deuda
          </button>
        ) : undefined} />

      {setup2Error ? <Setup2Banner onRetry={refetch} /> : (
        <>
          {/* KPIs */}
          <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.875rem' }}>
            {[
              { label: 'Deuda total', value: fmtK(totalDeuda), color: totalDeuda > 0 ? '#ef4444' : '#10b981' },
              { label: 'Plan: pagar este mes', value: fmtK(aPagarEsteMes), color: GOLD },
              { label: 'Deudas activas', value: String(activas.length), color: '#fff' },
            ].map(s => (
              <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', borderColor: `${GOLD}22` }}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {/* Resumen del plan (bola de nieve) */}
          <PlanResumen plan={plan} target={target} />

          {/* Cómo pagar */}
          {activas.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#52525b', lineHeight: 1.5, padding: '0 0.25rem' }}>
              💸 Paga cada deuda con su botón <b style={{ color: '#a0aec0' }}>Pagar</b> (viene pre-cargado con el monto exacto de la bola de nieve). Si abonas de más, sales antes y todo se recalcula solo.
            </div>
          )}

          {showAdd && <NuevaDeudaForm onSave={async d => { await addDebt(d); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />}

          {activas.length === 0 && !showAdd && (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#10b981', border: '1px dashed #10b98133', borderRadius: '12px', fontWeight: 600 }}>
              Sin deudas personales activas — libertad total 🎉
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activas.map(d => {
              const pagado = d.montoOriginal > 0 ? Math.min(100, ((d.montoOriginal - d.saldoActual) / d.montoOriginal) * 100) : 0;
              const prox = proximoDe(d.id);           // próximo pago según bola de nieve
              const muere = muereDe(d.id);             // mes en que se salda
              const esObjetivo = target?.id === d.id;
              return (
                <div key={d.id} className="card" style={{ padding: '1.1rem 1.25rem', border: esObjetivo ? '1px solid #ef444455' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <CreditCard size={18} style={{ color: '#ef4444' }} />
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>
                          {d.acreedor} <span style={{ fontSize: '0.7rem', color: '#52525b', fontWeight: 500 }}>{TIPOS[d.tipo]}</span>
                          {esObjetivo && <span style={{ fontSize: '0.6rem', color: '#ef4444', fontWeight: 800, background: '#ef444418', padding: '0.1rem 0.4rem', borderRadius: '999px', marginLeft: '0.4rem' }}>ATACAR</span>}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#52525b' }}>
                          Próximo pago <b style={{ color: '#a0aec0' }}>{fmt(prox ? prox.valor : d.cuotaMinima)}</b>
                          {prox && ` · ${new Date(prox.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`}
                          {d.tasaMensual != null && ` · ${d.tasaMensual}%/mes`}
                        </div>
                        {muere && (
                          <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, marginTop: '0.15rem' }}>
                            💀 Se salda en {muere.label}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Saldo</div>
                        <div style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.05rem' }}>{fmt(d.saldoActual)}</div>
                      </div>
                      <button onClick={() => setPagando(d)}
                        style={{ padding: '0.45rem 0.875rem', borderRadius: '8px', border: 'none', background: '#10b981', color: '#000', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        💸 Pagar
                      </button>
                      {deletingId === d.id ? (
                        <button onClick={async () => { await removeDebt(d.id); setDeletingId(null); }}
                          style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.25rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ¿Seguro?
                        </button>
                      ) : (
                        <button onClick={() => setDeletingId(d.id)} style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer' }} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {d.montoOriginal > 0 && (
                    <>
                      <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', marginTop: '0.75rem' }}>
                        <div style={{ height: '100%', width: `${pagado}%`, background: '#10b981', borderRadius: '999px' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#52525b', marginTop: '0.25rem' }}>
                        <span>Pagado: {fmt(d.montoOriginal - d.saldoActual)} ({pagado.toFixed(0)}%)</span>
                        <span>Original: {fmt(d.montoOriginal)}</span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {saldadas.length > 0 && (
            <div className="card" style={{ padding: '1rem', border: '1px solid #10b98133' }}>
              <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700, marginBottom: '0.4rem' }}>✅ Saldadas ({saldadas.length})</div>
              {saldadas.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#52525b', padding: '0.25rem 0' }}>
                  <span>{d.acreedor}</span><span>{fmt(d.montoOriginal)} pagados 💪</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal pagar */}
      {pagando && (
        <PagarModal debt={pagando} sugerido={proximoDe(pagando.id)?.valor ?? pagando.cuotaMinima} onClose={() => setPagando(null)}
          onSave={async valor => { await pagarDeuda(pagando, valor, hoyISO()); setPagando(null); }} />
      )}
    </div>
  );
};

const NuevaDeudaForm: React.FC<{
  onSave: (d: { acreedor: string; tipo: PersonalDebt['tipo']; montoOriginal: number; saldoActual: number; cuotaMinima: number; tasaMensual?: number; fechaProximoPago?: string; notas?: string }) => Promise<void>;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [f, setF] = useState({ acreedor: '', tipo: 'tarjeta' as PersonalDebt['tipo'], saldo: '', cuota: '', fecha: '' });
  const [saving, setSaving] = useState(false);
  return (
    <div className="card" style={{ padding: '1rem', border: `1px solid ${GOLD}44` }}>
      <div className="resp-form" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div><label style={lbl}>Acreedor</label><input style={inp} value={f.acreedor} onChange={e => setF(x => ({ ...x, acreedor: e.target.value }))} placeholder="Ej. Tarjeta Bancolombia" autoFocus /></div>
        <div><label style={lbl}>Tipo</label>
          <select style={inp} value={f.tipo} onChange={e => setF(x => ({ ...x, tipo: e.target.value as PersonalDebt['tipo'] }))}>
            <option value="tarjeta">Tarjeta</option><option value="prestamo">Préstamo</option>
            <option value="credito">Crédito</option><option value="otro">Otro</option>
          </select>
        </div>
        <div><label style={lbl}>Saldo actual</label><input style={inp} inputMode="numeric" value={f.saldo} onChange={e => setF(x => ({ ...x, saldo: fmtInput(e.target.value) }))} placeholder="0" /></div>
        <div><label style={lbl}>Cuota mínima</label><input style={inp} inputMode="numeric" value={f.cuota} onChange={e => setF(x => ({ ...x, cuota: fmtInput(e.target.value) }))} placeholder="0" /></div>
        <div><label style={lbl}>Próximo pago</label><input style={inp} type="date" value={f.fecha} onChange={e => setF(x => ({ ...x, fecha: e.target.value }))} /></div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button className="btn btn-primary" disabled={saving} style={{ padding: '0.55rem 0.875rem' }}
            onClick={async () => {
              const saldo = Number(f.saldo.replace(/\./g, ''));
              const cuota = Number(f.cuota.replace(/\./g, ''));
              if (!f.acreedor.trim() || saldo <= 0) { alert('Completa acreedor y saldo.'); return; }
              setSaving(true);
              try { await onSave({ acreedor: f.acreedor.trim(), tipo: f.tipo, montoOriginal: saldo, saldoActual: saldo, cuotaMinima: cuota, fechaProximoPago: f.fecha || undefined }); }
              catch (err: any) { alert('Error: ' + err.message); }
              finally { setSaving(false); }
            }}>
            {saving ? '...' : 'Crear'}
          </button>
          <button className="btn btn-outline" onClick={onCancel} style={{ padding: '0.55rem 0.875rem' }}><X size={14} /></button>
        </div>
      </div>
    </div>
  );
};

const PagarModal: React.FC<{ debt: PersonalDebt; sugerido: number; onClose: () => void; onSave: (valor: number) => Promise<void> }> = ({ debt, sugerido, onClose, onSave }) => {
  const [valor, setValor] = useState(String(Math.round(sugerido)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  const [saving, setSaving] = useState(false);
  const num = Number(valor.replace(/\./g, '')) || 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div className="card" style={{ width: '360px', maxWidth: '100%', border: `1px solid ${GOLD}44` }}>
        <h3 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.25rem' }}>💸 Pagar {debt.acreedor}</h3>
        <div style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>
          Saldo actual: {fmt(debt.saldoActual)} · Viene pre-cargado con el monto exacto de la bola de nieve. Pagar de más = sales antes; todo se recalcula solo. Se registra automático en Movimientos.
        </div>
        <label style={lbl}>Valor del pago COP</label>
        <input style={{ ...inp, fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }} inputMode="numeric" autoFocus
          value={valor} onChange={e => setValor(fmtInput(e.target.value))} />
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button className="btn btn-primary" disabled={saving || num <= 0}
            onClick={async () => {
              setSaving(true);
              try { await onSave(num); } catch (err: any) { alert('Error: ' + err.message); }
              finally { setSaving(false); }
            }}>
            {saving ? '...' : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  );
};
