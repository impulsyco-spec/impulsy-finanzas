import React, { useState } from 'react';
import { Plus, Trash2, Lock, X } from 'lucide-react';
import { usePersonal, PersonalPocket } from '../../../hooks/usePersonal';
import { hoyISO } from '../../../lib/dates';
import { GOLD, fmt, fmtK, inp, lbl, fmtInput, PersonalHeader, Setup2Banner } from './comunes';

const EMOJIS = ['🛡️','✈️','🏍️','🏠','💍','🎓','💻','🚗','🎁','📈','🧳','🎯'];

export const PersonalBolsillos: React.FC = () => {
  const { movements, pockets, loading, setupError, setup2Error, refetch, addPocket, updatePocket, removePocket, moverPocket } = usePersonal();
  const [showAdd, setShowAdd] = useState(false);
  const [moviendo, setMoviendo] = useState<{ pocket: PersonalPocket; tipo: 'aporte' | 'retiro' } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const conf = movements.filter(m => m.estado === 'confirmado');
  const saldo = conf.reduce((s, m) => s + (m.naturaleza === 'ingreso' ? m.valor : -m.valor), 0);
  const activos = pockets.filter(p => p.activo);
  const enBolsillos = activos.reduce((s, p) => s + p.saldo, 0);
  const libre = saldo - enBolsillos;

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      <PersonalHeader titulo="🎯 Bolsillos y Metas" sub="Lo apartado deja de verse disponible — así se cumple una meta."
        extra={!setup2Error ? (
          <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Plus size={16} /> Nueva Meta
          </button>
        ) : undefined} />

      {setup2Error ? <Setup2Banner onRetry={refetch} /> : (
        <>
          {/* Hero: la matemática del método de sobres */}
          <div className="card" style={{ padding: '1.25rem', border: `1px solid ${GOLD}33`, background: `linear-gradient(135deg, ${GOLD}0a, transparent)` }}>
            <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto 1fr', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Saldo Bancolombia</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{fmtK(saldo)}</div>
              </div>
              <div style={{ fontSize: '1.2rem', color: '#52525b' }}>−</div>
              <div>
                <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}><Lock size={10} style={{ display: 'inline' }} /> Apartado en metas</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#06b6d4' }}>{fmtK(enBolsillos)}</div>
              </div>
              <div style={{ fontSize: '1.2rem', color: '#52525b' }}>=</div>
              <div>
                <div style={{ fontSize: '0.62rem', color: GOLD, textTransform: 'uppercase', fontWeight: 700 }}>Disponible libre</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: libre >= 0 ? GOLD : '#ef4444' }}>{fmtK(libre)}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#52525b', textAlign: 'center', marginTop: '0.6rem' }}>
              El dinero apartado sigue en tu cuenta — pero tu cerebro deja de verlo como gastable. Ese es el truco.
            </div>
          </div>

          {/* Formulario nueva meta */}
          {showAdd && (
            <NuevaMetaForm
              onSave={async p => { await addPocket(p); setShowAdd(false); }}
              onCancel={() => setShowAdd(false)}
              esPrimera={activos.length === 0}
            />
          )}

          {/* Bolsillos */}
          {activos.length === 0 && !showAdd && (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: '#52525b', border: '1px dashed #333', borderRadius: '12px' }}>
              Sin metas aún. Te sugiero arrancar con el <b style={{ color: GOLD }}>🛡️ Fondo de emergencia</b> — tu colchón de 3 meses de vida.
            </div>
          )}
          <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {activos.map(p => {
              const pct = p.metaValor > 0 ? Math.min(100, (p.saldo / p.metaValor) * 100) : 0;
              const lograda = p.metaValor > 0 && p.saldo >= p.metaValor;
              const color = lograda ? '#10b981' : p.esFondo ? '#06b6d4' : GOLD;
              return (
                <div key={p.id} className="card" style={{ padding: '1.25rem', border: `1px solid ${color}33` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.4rem' }}>{p.emoji}</span>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>{p.nombre}</div>
                        {p.fechaObjetivo && (
                          <div style={{ fontSize: '0.65rem', color: '#52525b' }}>
                            Meta: {new Date(p.fechaObjetivo + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                    </div>
                    {deletingId === p.id ? (
                      <button onClick={async () => { await removePocket(p.id); setDeletingId(null); }}
                        style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        ¿Seguro?
                      </button>
                    ) : (
                      <button onClick={() => setDeletingId(p.id)} style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer' }} title="Eliminar (el saldo vuelve al disponible)">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color }}>
                    {fmtK(p.saldo)}
                    {p.metaValor > 0 && <span style={{ fontSize: '0.8rem', color: '#52525b', fontWeight: 600 }}> de {fmtK(p.metaValor)}</span>}
                  </div>
                  <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', margin: '0.5rem 0' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '999px', transition: 'width 0.4s' }} />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: lograda ? '#10b981' : '#52525b', marginBottom: '0.75rem', fontWeight: lograda ? 700 : 400 }}>
                    {lograda ? '🎉 ¡Meta cumplida! Ya puedes usarla.' : p.metaValor > 0 ? `${pct.toFixed(0)}% — te faltan ${fmt(p.metaValor - p.saldo)}` : 'Sin meta definida'}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => setMoviendo({ pocket: p, tipo: 'aporte' })}
                      style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: color, color: '#000', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                      + Aportar
                    </button>
                    <button onClick={() => setMoviendo({ pocket: p, tipo: 'retiro' })} disabled={p.saldo <= 0}
                      style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: `1px solid ${color}55`, background: 'transparent', color, fontWeight: 700, fontSize: '0.75rem', cursor: p.saldo > 0 ? 'pointer' : 'default', opacity: p.saldo > 0 ? 1 : 0.4, fontFamily: 'inherit' }}>
                      − Retirar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal aporte/retiro */}
      {moviendo && (
        <MoverModal
          pocket={moviendo.pocket} tipo={moviendo.tipo} libre={libre}
          onClose={() => setMoviendo(null)}
          onSave={async (valor, nota) => {
            await moverPocket(moviendo.pocket.id, moviendo.tipo === 'aporte' ? valor : -valor, hoyISO(), nota);
            setMoviendo(null);
          }}
        />
      )}
    </div>
  );
};

const NuevaMetaForm: React.FC<{
  onSave: (p: { nombre: string; emoji: string; metaValor: number; fechaObjetivo?: string; esFondo?: boolean }) => Promise<void>;
  onCancel: () => void;
  esPrimera: boolean;
}> = ({ onSave, onCancel, esPrimera }) => {
  const [f, setF] = useState({ nombre: esPrimera ? 'Fondo de emergencia' : '', emoji: esPrimera ? '🛡️' : '🎯', metaValor: '', fechaObjetivo: '', esFondo: esPrimera });
  const [saving, setSaving] = useState(false);
  return (
    <div className="card" style={{ padding: '1rem', border: `1px solid ${GOLD}44` }}>
      <div className="resp-form" style={{ display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div>
          <label style={lbl}>Emoji</label>
          <select style={{ ...inp, width: '70px' }} value={f.emoji} onChange={e => setF(x => ({ ...x, emoji: e.target.value }))}>
            {EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
        <div><label style={lbl}>Nombre de la meta</label>
          <input style={inp} value={f.nombre} onChange={e => setF(x => ({ ...x, nombre: e.target.value }))} placeholder="Ej. Viaje a San Andrés" autoFocus={!esPrimera} />
        </div>
        <div><label style={lbl}>Meta COP</label>
          <input style={inp} inputMode="numeric" value={f.metaValor} onChange={e => setF(x => ({ ...x, metaValor: fmtInput(e.target.value) }))} placeholder="0" />
        </div>
        <div><label style={lbl}>Fecha objetivo</label>
          <input style={inp} type="date" value={f.fechaObjetivo} onChange={e => setF(x => ({ ...x, fechaObjetivo: e.target.value }))} />
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button className="btn btn-primary" disabled={saving} style={{ padding: '0.55rem 0.875rem' }}
            onClick={async () => {
              const meta = Number(f.metaValor.replace(/\./g, ''));
              if (!f.nombre.trim() || meta <= 0) { alert('Completa nombre y meta.'); return; }
              setSaving(true);
              try { await onSave({ nombre: f.nombre.trim(), emoji: f.emoji, metaValor: meta, fechaObjetivo: f.fechaObjetivo || undefined, esFondo: f.esFondo }); }
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

const MoverModal: React.FC<{
  pocket: PersonalPocket; tipo: 'aporte' | 'retiro'; libre: number;
  onClose: () => void; onSave: (valor: number, nota?: string) => Promise<void>;
}> = ({ pocket, tipo, libre, onClose, onSave }) => {
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');
  const [saving, setSaving] = useState(false);
  const esAporte = tipo === 'aporte';
  const num = Number(valor.replace(/\./g, '')) || 0;
  const excedeLibre = esAporte && num > libre;
  const excedeSaldo = !esAporte && num > pocket.saldo;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }}>
      <div className="card" style={{ width: '380px', maxWidth: '100%', border: `1px solid ${GOLD}44` }}>
        <h3 style={{ color: '#fff', fontWeight: 800, marginBottom: '0.25rem' }}>
          {esAporte ? '+ Aportar a' : '− Retirar de'} {pocket.emoji} {pocket.nombre}
        </h3>
        <div style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>
          {esAporte ? `Disponible libre: ${fmt(libre)}` : `En el bolsillo: ${fmt(pocket.saldo)}`}
        </div>
        <label style={lbl}>Valor COP</label>
        <input style={{ ...inp, fontSize: '1.1rem', fontWeight: 700, color: GOLD }} inputMode="numeric" autoFocus
          value={valor} onChange={e => setValor(fmtInput(e.target.value))} placeholder="0" />
        {excedeLibre && <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.4rem' }}>⚠ Supera tu disponible libre — puedes hacerlo, pero quedarías en negativo.</div>}
        {excedeSaldo && <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.4rem' }}>No puedes retirar más de lo que hay en el bolsillo.</div>}
        <label style={{ ...lbl, marginTop: '0.75rem' }}>Nota (opcional)</label>
        <input style={inp} value={nota} onChange={e => setNota(e.target.value)} placeholder={esAporte ? 'Ej. Ahorro de la quincena' : 'Ej. Compré los tiquetes ✈️'} />
        <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
          <button onClick={onClose} className="btn btn-outline">Cancelar</button>
          <button className="btn btn-primary" disabled={saving || num <= 0 || excedeSaldo}
            onClick={async () => {
              setSaving(true);
              try { await onSave(num, nota.trim() || undefined); }
              catch (err: any) { alert('Error: ' + err.message); }
              finally { setSaving(false); }
            }}>
            {saving ? '...' : esAporte ? 'Aportar' : 'Retirar'}
          </button>
        </div>
      </div>
    </div>
  );
};
