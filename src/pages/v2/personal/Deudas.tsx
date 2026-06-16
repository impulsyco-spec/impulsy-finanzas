import React, { useState } from 'react';
import { Plus, Trash2, X, CreditCard } from 'lucide-react';
import { usePersonal, PersonalDebt } from '../../../hooks/usePersonal';
import { hoyISO } from '../../../lib/dates';
import { GOLD, fmt, fmtK, inp, lbl, fmtInput, PersonalHeader, Setup2Banner } from './comunes';

const TIPOS: Record<PersonalDebt['tipo'], string> = {
  tarjeta: '💳 Tarjeta', prestamo: '🏦 Préstamo', credito: '📄 Crédito', otro: '📌 Otro',
};

export const PersonalDeudas: React.FC = () => {
  const { debts, loading, setupError, setup2Error, refetch, addDebt, removeDebt, pagarDeuda } = usePersonal();
  const [showAdd, setShowAdd] = useState(false);
  const [pagando, setPagando] = useState<PersonalDebt | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activas = debts.filter(d => d.activa && d.saldoActual > 0);
  const saldadas = debts.filter(d => d.activa && d.saldoActual <= 0);
  const totalDeuda = activas.reduce((s, d) => s + d.saldoActual, 0);
  const totalCuotas = activas.reduce((s, d) => s + d.cuotaMinima, 0);

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
              { label: 'Cuotas mínimas/mes', value: fmtK(totalCuotas), color: GOLD },
              { label: 'Deudas activas', value: String(activas.length), color: '#fff' },
            ].map(s => (
              <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem', borderColor: `${GOLD}22` }}>
                <span className="stat-label">{s.label}</span>
                <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
              </div>
            ))}
          </div>

          {showAdd && <NuevaDeudaForm onSave={async d => { await addDebt(d); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />}

          {activas.length === 0 && !showAdd && (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#10b981', border: '1px dashed #10b98133', borderRadius: '12px', fontWeight: 600 }}>
              Sin deudas personales activas — libertad total 🎉
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activas.map(d => {
              const pagado = d.montoOriginal > 0 ? Math.min(100, ((d.montoOriginal - d.saldoActual) / d.montoOriginal) * 100) : 0;
              return (
                <div key={d.id} className="card" style={{ padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <CreditCard size={18} style={{ color: '#ef4444' }} />
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700 }}>{d.acreedor} <span style={{ fontSize: '0.7rem', color: '#52525b', fontWeight: 500 }}>{TIPOS[d.tipo]}</span></div>
                        <div style={{ fontSize: '0.7rem', color: '#52525b' }}>
                          Cuota mínima {fmt(d.cuotaMinima)}
                          {d.fechaProximoPago && ` · próximo pago ${new Date(d.fechaProximoPago + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}`}
                          {d.tasaMensual != null && ` · ${d.tasaMensual}% mensual`}
                        </div>
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
          Saldo actual: {fmt(debt.saldoActual)} · El pago se registra automático en Movimientos (categoría Deudas).
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
