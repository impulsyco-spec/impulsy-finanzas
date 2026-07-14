import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Split, CreditCard, ShieldCheck, Wallet, PartyPopper } from 'lucide-react';
import { usePersonal, PERSONAL_CONFIG } from '../../../hooks/usePersonal';
import { getQuincena, Quincena } from '../../../lib/founderRules';
import { hoyISO } from '../../../lib/dates';
import { supabase } from '../../../lib/supabase';
import { GOLD, fmt, fmtK, inp, lbl, fmtInput, PersonalHeader, Setup2Banner } from './comunes';

// Quincena en un offset relativo a la actual (0 = actual, -1 = anterior, …)
function quincenaEn(offset: number): Quincena {
  let q = getQuincena(new Date());
  for (let i = 0; i < -offset; i++) {
    const prev = new Date(q.inicio + 'T12:00:00');
    prev.setDate(prev.getDate() - 1);
    q = getQuincena(prev);
  }
  return q;
}

const MAX_ATRAS = 8;

export const PersonalDistribuir: React.FC = () => {
  const { movements, pockets, pocketMoves, loading, setupError, setup2Error, refetch, addPocket, moverPocket } = usePersonal();
  const [offset, setOffset] = useState(0);
  const [montoStr, setMontoStr] = useState<string | null>(null);       // override manual (simulación)
  const [deudasStr, setDeudasStr] = useState(() => localStorage.getItem('planDeudaQ') || '300.000');
  const [ahorroStr, setAhorroStr] = useState(() => localStorage.getItem('planAhorroQ') || '100.000');
  const [aplicando, setAplicando] = useState(false);

  const hoyStr = hoyISO();
  const q = useMemo(() => quincenaEn(offset), [offset]);
  const esActual = offset === 0;

  // Ingreso REAL de la quincena (se actualiza solo con tus movimientos confirmados)
  const ingresosQ = useMemo(() =>
    movements.filter(m => m.naturaleza === 'ingreso' && m.estado === 'confirmado' && m.fecha >= q.inicio && m.fecha <= q.fin),
    [movements, q]);
  const ingresoDetectado = ingresosQ.reduce((s, m) => s + m.valor, 0);
  const monto = montoStr === null ? ingresoDetectado : (Number(montoStr.replace(/\./g, '')) || 0);

  // Los 3 sobres: Deudas (fijo del plan bola de nieve) → Ahorro (editable) → Para mí (el resto)
  const deudas = Number(deudasStr.replace(/\./g, '')) || 0;
  const ahorro = Number(ahorroStr.replace(/\./g, '')) || 0;
  const paraMi = monto - deudas - ahorro;
  const survival = PERSONAL_CONFIG.supervivenciaQuincena;

  // Presupuesto de fin de semana: de "Para mí", reservo lo de vivir la quincena y
  // el resto lo reparto entre los findes que quedan → cuánto puedo gastar por finde.
  const findesRestantes = useMemo(() => {
    const desde = new Date(Math.max(new Date(hoyStr + 'T12:00:00').getTime(), new Date(q.inicio + 'T12:00:00').getTime()));
    const fin = new Date(q.fin + 'T12:00:00');
    let n = 0;
    for (const d = new Date(desde); d <= fin; d.setDate(d.getDate() + 1)) if (d.getDay() === 6) n++;
    return Math.max(1, n);
  }, [q, hoyStr]);
  const paraGustos = Math.max(0, paraMi - survival);
  const gastoPorFinde = Math.round(paraGustos / findesRestantes);

  const setDeudas = (v: string) => { const f = fmtInput(v); setDeudasStr(f); localStorage.setItem('planDeudaQ', f); };
  const setAhorro = (v: string) => { const f = fmtInput(v); setAhorroStr(f); localStorage.setItem('planAhorroQ', f); };

  // Cuánto de este período ya moviste a cada sobre (idempotente por nota distribuir:<q.id>)
  const yaEnSobre = (nombre: string) => {
    const p = pockets.find(pk => pk.nombre.toLowerCase() === nombre.toLowerCase());
    if (!p) return 0;
    return pocketMoves.filter(pm => pm.pocketId === p.id && pm.nota?.includes(`distribuir:${q.id}`)).reduce((s, pm) => s + pm.valor, 0);
  };
  const yaDeudas = yaEnSobre('Deudas');
  const yaAhorro = yaEnSobre('Ahorro');
  const yaDistribuido = yaDeudas > 0 || yaAhorro > 0;

  const getOrCreatePocket = async (nombre: string, emoji: string, esFondo: boolean) => {
    const ex = pockets.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
    if (ex) return ex.id;
    await addPocket({ nombre, emoji, metaValor: 0, esFondo });
    const { data } = await supabase.from('personal_pockets').select('id').ilike('nombre', nombre).limit(1).single();
    return data?.id as string | undefined;
  };

  // Lleva cada sobre a su monto objetivo (aporta o retira la diferencia). Así puedes
  // distribuir aunque el sueldo llegue en pedazos: subes el objetivo y se ajusta solo.
  const distribuir = async () => {
    if (deudas + ahorro <= 0) { alert('Define al menos cuánto va a Deudas o Ahorro.'); return; }
    setAplicando(true);
    try {
      const nota = `distribuir:${q.id}`;
      const idD = await getOrCreatePocket('Deudas', '💳', false);
      const deltaD = deudas - yaDeudas;
      if (idD && Math.abs(deltaD) >= 1) await moverPocket(idD, deltaD, hoyStr, nota);
      const idA = await getOrCreatePocket('Ahorro', '🛡️', true);
      const deltaA = ahorro - yaAhorro;
      if (idA && Math.abs(deltaA) >= 1) await moverPocket(idA, deltaA, hoyStr, nota);
      await refetch();
    } catch (err: any) { alert('Error: ' + err.message); }
    finally { setAplicando(false); }
  };

  const irA = (nuevo: number) => { setOffset(nuevo); setMontoStr(null); };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

  const sobres = [
    { emoji: '💳', nombre: 'Deudas', desc: 'tu monto fijo del plan bola de nieve — intocable', valor: deudas, color: '#ef4444', editable: setDeudas, str: deudasStr },
    { emoji: '🛡️', nombre: 'Ahorro', desc: 'tu colchón que crece — súbelo cuando salgas de deudas', valor: ahorro, color: '#06b6d4', editable: setAhorro, str: ahorroStr },
    { emoji: '😎', nombre: 'Para mí', desc: 'vivir + gustos — esto sí es tuyo, libre', valor: paraMi, color: GOLD, editable: null, str: null },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      <PersonalHeader titulo="🔀 Distribuir" sub="Cada peso que entra tiene un trabajo — antes de que lo veas disponible." />

      {setup2Error ? <Setup2Banner onRetry={refetch} /> : (
        <>
          {/* Selector de quincena */}
          <div className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={() => irA(offset - 1)} disabled={offset <= -MAX_ATRAS}
              style={{ background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.4rem 0.6rem', color: offset <= -MAX_ATRAS ? '#3f3f46' : GOLD, cursor: offset <= -MAX_ATRAS ? 'not-allowed' : 'pointer' }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Quincena {q.label}</div>
              <div style={{ fontSize: '0.64rem', color: esActual ? GOLD : '#52525b', fontWeight: 600 }}>{esActual ? 'EN CURSO' : 'histórico'}</div>
            </div>
            <button onClick={() => irA(offset + 1)} disabled={offset >= 0}
              style={{ background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.4rem 0.6rem', color: offset >= 0 ? '#3f3f46' : GOLD, cursor: offset >= 0 ? 'not-allowed' : 'pointer' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Lo que entró */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <label style={lbl}>Te entró esta quincena {montoStr !== null && <span style={{ color: GOLD }}>(simulación)</span>}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: GOLD }}>$</span>
              <input style={{ ...inp, fontSize: '1.4rem', fontWeight: 800, color: GOLD, marginTop: 0 }} inputMode="numeric"
                value={montoStr === null ? fmtInput(String(ingresoDetectado)) : montoStr}
                onChange={e => setMontoStr(fmtInput(e.target.value))} />
            </div>
            {ingresosQ.length > 0 ? (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {ingresosQ.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: '#a0aec0' }}>{m.descripcion}</span>
                    <span style={{ color: '#10b981', fontWeight: 700 }}>{fmt(m.valor)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ marginTop: '0.6rem', fontSize: '0.7rem', color: '#52525b' }}>
                Aún no hay ingresos registrados en esta quincena. Págate en Nómina o simula un monto arriba.
              </div>
            )}
            {montoStr !== null && (
              <button onClick={() => setMontoStr(null)} style={{ marginTop: '0.6rem', background: 'transparent', border: 'none', color: GOLD, fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                ← Volver al monto real ({fmt(ingresoDetectado)})
              </button>
            )}
          </div>

          {/* Los 3 sobres */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>A dónde va cada peso</h3>
            <p style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>
              Primero separas <b style={{ color: '#fca5a5' }}>Deudas</b> (tu plan) y <b style={{ color: '#67e8f9' }}>Ahorro</b>. Lo que queda es <b style={{ color: GOLD }}>tuyo</b>. Los montos son sugeridos — cámbialos como quieras.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {sobres.map(s => (
                <div key={s.nombre} style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', padding: '0.85rem 1rem', background: '#0d0d0d', borderRadius: '11px', border: `1px solid ${s.color}22` }}>
                  <span style={{ fontSize: '1.5rem' }}>{s.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: s.color, fontWeight: 800, fontSize: '0.92rem' }}>{s.nombre}</div>
                    <div style={{ fontSize: '0.66rem', color: '#52525b' }}>{s.desc}</div>
                  </div>
                  {s.editable ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <span style={{ color: s.color, fontWeight: 800 }}>$</span>
                      <input inputMode="numeric" value={s.str!} onChange={e => s.editable!(e.target.value)}
                        style={{ ...inp, width: '110px', textAlign: 'right', fontWeight: 800, color: s.color, fontSize: '1rem', marginTop: 0 }} />
                    </div>
                  ) : (
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: paraMi >= 0 ? s.color : '#ef4444' }}>{fmtK(paraMi)}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Avisos */}
            {paraMi < 0 && (
              <div style={{ marginTop: '0.75rem', padding: '0.7rem 0.85rem', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)', fontSize: '0.74rem', color: '#fca5a5' }}>
                🚨 Te pasaste: Deudas + Ahorro suman más de lo que entró. Baja alguno o registra el resto de tu ingreso.
              </div>
            )}
            {paraMi >= 0 && paraMi < survival && (
              <div style={{ marginTop: '0.75rem', padding: '0.7rem 0.85rem', borderRadius: '10px', background: 'rgba(245,158,11,0.08)', border: `1px solid ${GOLD}33`, fontSize: '0.74rem', color: '#fcd34d' }}>
                ⚠️ "Para mí" queda en {fmt(paraMi)} — menos de lo que sueles necesitar para vivir ({fmt(survival)}). Considera bajar Ahorro esta quincena.
              </div>
            )}

            {/* Distribuir */}
            {esActual ? (
              <>
                <button onClick={distribuir} disabled={aplicando || (deudas + ahorro) <= 0}
                  style={{ width: '100%', marginTop: '1rem', padding: '0.95rem', borderRadius: '10px', border: 'none', background: (deudas + ahorro) > 0 ? '#a855f7' : '#1f2937', color: (deudas + ahorro) > 0 ? '#fff' : '#52525b', fontWeight: 800, fontSize: '0.95rem', cursor: (deudas + ahorro) > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                  {aplicando ? 'Distribuyendo...' : <><Split size={18} /> {yaDistribuido ? 'Actualizar reparto' : 'Separar a mis sobres'}</>}
                </button>
                {yaDistribuido && (
                  <div style={{ marginTop: '0.6rem', fontSize: '0.68rem', color: '#10b981', textAlign: 'center' }}>
                    ✓ Ya separaste esta quincena: 💳 {fmt(yaDeudas)} · 🛡️ {fmt(yaAhorro)}. Puedes ajustar y volver a repartir.
                  </div>
                )}
                <div style={{ fontSize: '0.64rem', color: '#52525b', textAlign: 'center', marginTop: '0.5rem', lineHeight: 1.6 }}>
                  Separa 💳 {fmt(deudas)} a Deudas y 🛡️ {fmt(ahorro)} a Ahorro (bolsillos bloqueados). {fmtK(Math.max(0, paraMi))} quedan libres para ti.
                </div>
              </>
            ) : (
              <div style={{ marginTop: '1rem', fontSize: '0.68rem', color: '#52525b', textAlign: 'center' }}>
                {yaDistribuido ? `En esta quincena separaste 💳 ${fmt(yaDeudas)} · 🛡️ ${fmt(yaAhorro)}.` : 'En esta quincena no registraste distribución.'}
              </div>
            )}
          </div>

          {/* Presupuesto de fin de semana */}
          {esActual && monto > 0 && paraMi >= 0 && (
            <div className="card" style={{ padding: '1.5rem', border: `1px solid ${GOLD}44`, background: `linear-gradient(135deg, ${GOLD}0e, transparent)`, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <PartyPopper size={16} style={{ color: GOLD }} />
                <span style={{ fontSize: '0.68rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Puedes gastar este fin de semana</span>
              </div>
              <div style={{ fontSize: '2.6rem', fontWeight: 900, color: gastoPorFinde > 0 ? GOLD : '#52525b', lineHeight: 1 }}>{fmtK(gastoPorFinde)}</div>
              <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '0.5rem', lineHeight: 1.5 }}>
                {gastoPorFinde > 0
                  ? <>De tus <b style={{ color: GOLD }}>{fmtK(paraMi)}</b> para ti, reservé <b>{fmtK(survival)}</b> para vivir la quincena. El resto ({fmtK(paraGustos)}) repartido en {findesRestantes} finde{findesRestantes > 1 ? 's' : ''} que {findesRestantes > 1 ? 'quedan' : 'queda'}.</>
                  : <>Esta quincena "Para mí" apenas cubre lo de vivir ({fmtK(survival)}). Sin extra para fiesta — semana tranquila.</>}
              </div>
            </div>
          )}

          {/* Cómo se conecta */}
          <div className="card" style={{ padding: '1rem 1.25rem', border: '1px solid #1f2937' }}>
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', fontSize: '0.72rem', color: '#52525b', lineHeight: 1.6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><CreditCard size={14} style={{ color: '#ef4444' }} /> El sobre <b style={{ color: '#a0aec0' }}>Deudas</b> se vacía solo cuando pagas una cuota en la pestaña Deudas.</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><ShieldCheck size={14} style={{ color: '#06b6d4' }} /> <b style={{ color: '#a0aec0' }}>Ahorro</b> es tu fondo — no lo toques salvo emergencia.</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Wallet size={14} style={{ color: GOLD }} /> <b style={{ color: '#a0aec0' }}>Para mí</b> es tu disponible libre en Hoy.</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
