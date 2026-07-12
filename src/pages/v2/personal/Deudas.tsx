import React, { useState, useMemo } from 'react';
import { Plus, Trash2, X, CreditCard, Zap, Target } from 'lucide-react';
import { usePersonal, PersonalDebt, PERSONAL_CONFIG } from '../../../hooks/usePersonal';
import { FOUNDER_RULES } from '../../../lib/founderRules';
import { hoyISO } from '../../../lib/dates';
import { GOLD, fmt, fmtK, inp, lbl, fmtInput, PersonalHeader, Setup2Banner } from './comunes';

const TIPOS: Record<PersonalDebt['tipo'], string> = {
  tarjeta: '💳 Tarjeta', prestamo: '🏦 Préstamo', credito: '📄 Crédito', otro: '📌 Otro',
};

// ── Plan de salida (bola de nieve con presupuesto fijo) ───────────────
const SALARIO_MES = FOUNDER_RULES.salarioQuincenal * 2;      // base mensual garantizada
const SURVIVAL_MES = PERSONAL_CONFIG.supervivenciaQuincena * 2; // mínimo para vivir/mes
const MESES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

interface SimSalida {
  meses: number;
  alcanza: boolean;
  libreLabel: string;
  interesTotal: number;
  orden: { acreedor: string; muere: number; muereLabel: string; saldo: number; tasa: number }[];
}

// Simula la avalancha: paga mínimos de todas + tira el excedente a la de mayor
// interés; cuando una muere, su cuota rueda sola a la siguiente. Devuelve el
// tiempo total, el orden de muerte y el interés que pagarías en el camino.
function simularSalida(deudas: PersonalDebt[], presupuestoMes: number): SimSalida {
  const prio = (a: { tasa: number; saldo: number }, b: { tasa: number; saldo: number }) =>
    (b.tasa - a.tasa) || (a.saldo - b.saldo); // mayor interés primero; empate → saldo menor
  const ds = deudas.map(d => ({
    acreedor: d.acreedor, saldo: d.saldoActual, tasa: (d.tasaMensual ?? 2) / 100,
    min: Math.min(d.cuotaMinima || 0, d.saldoActual), muere: 0,
  }));
  const hoy = new Date();
  let interesTotal = 0, meses = 0;
  while (ds.some(d => d.saldo > 1) && meses < 180) {
    meses++;
    ds.forEach(d => { if (d.saldo > 0) { const it = d.saldo * d.tasa; interesTotal += it; d.saldo += it; } });
    let left = presupuestoMes;
    const vivos = () => ds.filter(d => d.saldo > 1).sort(prio);
    for (const d of vivos()) { const pay = Math.min(d.min, d.saldo, Math.max(0, left)); d.saldo -= pay; left -= pay; }
    let guard = 0;
    while (left > 1 && ds.some(d => d.saldo > 1) && guard++ < 20) {
      const t = vivos()[0]; const pay = Math.min(left, t.saldo); t.saldo -= pay; left -= pay;
    }
    ds.forEach(d => { if (d.saldo <= 1 && d.muere === 0) d.muere = meses; });
  }
  const alcanza = ds.every(d => d.saldo <= 1);
  const fl = new Date(hoy.getFullYear(), hoy.getMonth() + meses, 1);
  const orden = ds.slice().sort((a, b) => (a.muere || 999) - (b.muere || 999)).map(d => {
    const fm = new Date(hoy.getFullYear(), hoy.getMonth() + d.muere, 1);
    return { acreedor: d.acreedor, muere: d.muere, muereLabel: `${MESES_ES[fm.getMonth()]} ${String(fm.getFullYear()).slice(2)}`, saldo: d.saldo, tasa: d.tasa };
  });
  return { meses, alcanza, libreLabel: `${MESES_ES[fl.getMonth()]} ${fl.getFullYear()}`, interesTotal, orden };
}

const PlanSalida: React.FC<{ deudas: PersonalDebt[] }> = ({ deudas }) => {
  const [presuStr, setPresuStr] = useState(() => localStorage.getItem('planDeudaQ') || '300.000');
  const presuQ = Number(presuStr.replace(/\./g, '')) || 0;
  const presuMes = presuQ * 2;
  const sim = useMemo(() => simularSalida(deudas, presuMes), [deudas, presuMes]);
  const setPresu = (v: string) => { const f = fmtInput(v); setPresuStr(f); localStorage.setItem('planDeudaQ', f); };

  // Deuda que hay que atacar AHORA con el excedente (mayor interés, saldo > mínimo)
  const target = useMemo(() =>
    deudas.slice().sort((a, b) => ((b.tasaMensual ?? 2) - (a.tasaMensual ?? 2)) || (a.saldoActual - b.saldoActual))
      .find(d => d.saldoActual > (d.cuotaMinima || 0)),
    [deudas]);

  const paraVivir = SALARIO_MES - SURVIVAL_MES - presuMes; // extra/mes tras deuda + supervivencia
  const preset = (q: number) => simularSalida(deudas, q * 2).meses;

  if (deudas.length === 0) return null;
  return (
    <div className="card" style={{ padding: '1.25rem', border: `1px solid ${GOLD}44`, background: `linear-gradient(135deg, ${GOLD}0c, transparent)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.9rem' }}>
        <Target size={18} style={{ color: GOLD }} />
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>Plan de salida de deudas</span>
      </div>

      {/* Presupuesto fijo por quincena */}
      <label style={lbl}>Destino fijo cada quincena a deudas</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
        <span style={{ fontSize: '1.3rem', fontWeight: 800, color: GOLD }}>$</span>
        <input style={{ ...inp, fontSize: '1.3rem', fontWeight: 800, color: GOLD, marginTop: 0 }} inputMode="numeric"
          value={presuStr} onChange={e => setPresu(e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
        {[250000, 300000, 400000].map(q => (
          <button key={q} onClick={() => setPresu(String(q))}
            style={{ flex: 1, minWidth: '90px', padding: '0.5rem', borderRadius: '9px', cursor: 'pointer', fontFamily: 'inherit',
              border: presuQ === q ? `1px solid ${GOLD}` : '1px solid #262626', background: presuQ === q ? `${GOLD}18` : '#0d0d0d' }}>
            <div style={{ color: presuQ === q ? GOLD : '#a0aec0', fontWeight: 800, fontSize: '0.82rem' }}>{fmtK(q)}/q</div>
            <div style={{ color: '#52525b', fontSize: '0.64rem' }}>libre en {preset(q)}m</div>
          </button>
        ))}
      </div>

      {/* Resultado */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Deuda libre en</div>
          {sim.alcanza ? (
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#10b981', lineHeight: 1.05 }}>
              {sim.meses} <span style={{ fontSize: '1rem', fontWeight: 700 }}>meses</span>
              <span style={{ fontSize: '0.85rem', color: '#52525b', fontWeight: 600 }}> · {sim.libreLabel}</span>
            </div>
          ) : (
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#ef4444' }}>Sube el monto — no cubre ni los intereses</div>
          )}
        </div>
      </div>

      {/* Comodidad */}
      <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.8rem', borderRadius: '9px',
        background: paraVivir >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
        border: `1px solid ${paraVivir >= 0 ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.3)'}` }}>
        <span style={{ fontSize: '0.76rem', color: paraVivir >= 0 ? '#10b981' : '#fca5a5', fontWeight: 600 }}>
          {paraVivir >= 0
            ? <>✅ Te sobran <b>{fmt(paraVivir)}/mes</b> para ti, además de comida y transporte. Cómodo.</>
            : <>⚠️ Te faltan <b>{fmt(-paraVivir)}/mes</b>: este ritmo se come tu supervivencia. Sale de un bono de la empresa, no del salario solo.</>}
        </span>
      </div>

      {/* Ataca ahora */}
      {target && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.75rem', padding: '0.7rem 0.85rem', borderRadius: '10px', background: '#0d0d0d', border: '1px solid #7f1d1d55' }}>
          <Zap size={18} style={{ color: '#ef4444', flexShrink: 0 }} />
          <div style={{ fontSize: '0.78rem', color: '#e4e4e7', lineHeight: 1.45 }}>
            <b style={{ color: '#fff' }}>Ataca ahora: {target.acreedor}.</b> Paga los mínimos de todas y tírale TODO tu excedente a esta ({target.tasaMensual}%/mes — la que más te sangra). Cuando muera, ese dinero rueda solo a la siguiente.
          </div>
        </div>
      )}

      {/* Orden de muerte */}
      <div style={{ marginTop: '0.85rem' }}>
        <div style={{ fontSize: '0.64rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem' }}>Orden en que caen 💀</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {sim.orden.map((o, i) => (
            <div key={o.acreedor} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.76rem' }}>
              <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: i === 0 ? '#ef444422' : '#18181b', color: i === 0 ? '#ef4444' : '#71717a', fontWeight: 800, fontSize: '0.66rem', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, color: '#a0aec0' }}>{o.acreedor}</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>{o.muere > 0 ? o.muereLabel : '—'}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: '0.66rem', color: '#52525b', marginTop: '0.7rem', lineHeight: 1.5 }}>
        Interés total que pagarías en el camino: <b style={{ color: '#a0aec0' }}>{fmt(Math.round(sim.interesTotal))}</b>. Mientras más subas el monto, menos interés y más rápido sales.
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
  const totalCuotas = activas.reduce((s, d) => s + d.cuotaMinima, 0);
  // Cuánto pide el plan este mes (cuotas con próximo pago dentro del mes en curso)
  const mesEnCurso = hoyISO().slice(0, 7);
  const aPagarEsteMes = activas
    .filter(d => (d.fechaProximoPago || '').startsWith(mesEnCurso))
    .reduce((s, d) => s + Math.min(d.cuotaMinima, d.saldoActual), 0);

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

          {/* Plan de salida interactivo */}
          <PlanSalida deudas={activas} />

          {/* Cómo pagar */}
          {activas.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#52525b', lineHeight: 1.5, padding: '0 0.25rem' }}>
              💸 Paga cada deuda con su botón <b style={{ color: '#a0aec0' }}>Pagar</b> (viene pre-cargado). Si abonas de más, sales antes y las próximas cuotas se recalculan solas.
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
              const pagosRestantes = d.cuotaMinima > 0 ? Math.ceil(d.saldoActual / d.cuotaMinima) : 0;
              let libreMes = '';
              if (pagosRestantes > 0 && d.fechaProximoPago) {
                const f = new Date(d.fechaProximoPago + 'T12:00:00');
                f.setMonth(f.getMonth() + (pagosRestantes - 1));
                libreMes = f.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
              }
              return (
                <div key={d.id} className="card" style={{ padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <CreditCard size={18} style={{ color: '#ef4444' }} />
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{d.acreedor} <span style={{ fontSize: '0.7rem', color: '#52525b', fontWeight: 500 }}>{TIPOS[d.tipo]}</span></div>
                        <div style={{ fontSize: '0.7rem', color: '#52525b' }}>
                          Cuota del plan {fmt(d.cuotaMinima)}
                          {d.fechaProximoPago && ` · próximo ${new Date(d.fechaProximoPago + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`}
                          {d.tasaMensual != null && ` · ${d.tasaMensual}%/mes`}
                        </div>
                        {pagosRestantes > 0 && (
                          <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700, marginTop: '0.15rem' }}>
                            🎯 Libre en {pagosRestantes} {pagosRestantes === 1 ? 'pago' : 'pagos'}{libreMes && ` · ${libreMes}`}
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
        <PagarModal debt={pagando} onClose={() => setPagando(null)}
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

const PagarModal: React.FC<{ debt: PersonalDebt; onClose: () => void; onSave: (valor: number) => Promise<void> }> = ({ debt, onClose, onSave }) => {
  const [valor, setValor] = useState(String(Math.round(debt.cuotaMinima)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  const [saving, setSaving] = useState(false);
  const num = Number(valor.replace(/\./g, '')) || 0;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div className="card" style={{ width: '360px', maxWidth: '100%', border: `1px solid ${GOLD}44` }}>
        <h3 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.25rem' }}>💸 Pagar {debt.acreedor}</h3>
        <div style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>
          Saldo actual: {fmt(debt.saldoActual)} · Viene pre-cargado con la cuota del plan. Pagar de más = sales antes; las próximas cuotas se ajustan solas. Se registra automático en Movimientos.
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
