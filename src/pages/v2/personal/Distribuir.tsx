import React, { useState, useMemo } from 'react';
import { PartyPopper, ChevronLeft, ChevronRight, Split } from 'lucide-react';
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

const MAX_ATRAS = 8; // hasta 8 quincenas hacia atrás

export const PersonalDistribuir: React.FC = () => {
  const { movements, pockets, pocketMoves, loading, setupError, setup2Error, refetch, addPocket, moverPocket } = usePersonal();
  const [offset, setOffset] = useState(0);            // 0 = quincena actual
  const [montoStr, setMontoStr] = useState<string | null>(null); // override manual (simulación)
  const [aplicando, setAplicando] = useState(false);

  const hoyStr = hoyISO();
  const q = useMemo(() => quincenaEn(offset), [offset]);
  const esActual = offset === 0;

  // ── Ingresos REALES de la quincena (se actualiza solo con tus movimientos) ──
  const ingresosQ = useMemo(() =>
    movements.filter(m => m.naturaleza === 'ingreso' && m.estado === 'confirmado' && m.fecha >= q.inicio && m.fecha <= q.fin),
    [movements, q]
  );
  const ingresoDetectado = ingresosQ.reduce((s, m) => s + m.valor, 0);
  const monto = montoStr === null ? ingresoDetectado : (Number(montoStr.replace(/\./g, '')) || 0);

  // ── Cascada inteligente: obligaciones → supervivencia → excedente ──
  // 1) Fijos personales que vencen en la quincena (recurrentes esperados)
  const fijosPendientes = useMemo(() =>
    movements
      .filter(m => m.naturaleza === 'egreso' && m.estado === 'esperado' && m.fecha >= q.inicio && m.fecha <= q.fin)
      .reduce((s, m) => s + m.valor, 0),
    [movements, q]
  );
  // 2) Cuotas de deuda que VENCEN en la quincena (ya proyectadas como esperado, categoría Deudas)
  const cuotasDeudaQuincena = useMemo(() =>
    movements.filter(m => m.naturaleza === 'egreso' && m.estado === 'esperado' && m.categoria === 'Deudas' && m.fecha >= q.inicio && m.fecha <= q.fin)
      .reduce((s, m) => s + m.valor, 0),
    [movements, q]
  );
  const otrosFijos = Math.max(0, fijosPendientes - cuotasDeudaQuincena);
  const obligaciones = fijosPendientes; // todo lo esperado del periodo (cuotas de deuda + otros fijos)
  const supervivencia = PERSONAL_CONFIG.supervivenciaQuincena;
  // 3) Excedente real tras cubrir lo intocable
  const excedente = monto - obligaciones - supervivencia;
  const hayDeficit = excedente < 0;
  const deficit = hayDeficit ? -excedente : 0;
  // 4) Reparto del excedente: 50% acelera deuda (Libertad), 50% fiesta
  const aLibertad = hayDeficit ? 0 : Math.round(excedente * PERSONAL_CONFIG.pctLibertadExcedente);
  const disponibleFiesta = hayDeficit ? 0 : excedente - aLibertad;

  // ── Reparto a SOBRES por prioridad (lo intocable primero) ──────
  let _resto = monto;
  const aObligaciones  = Math.min(obligaciones, _resto);  _resto -= aObligaciones;
  const aSupervivencia = Math.min(supervivencia, _resto); _resto -= aSupervivencia;
  const aLibertadFund  = Math.min(aLibertad, _resto);     _resto -= aLibertadFund;
  const aFiesta = Math.max(0, _resto);

  // ¿Ya distribuiste esta quincena? (idempotente por nota `distribuir:<q.id>`)
  const movesDistribuir = useMemo(() =>
    pocketMoves.filter(pm => pm.nota?.includes(`distribuir:${q.id}`)),
    [pocketMoves, q]
  );
  const yaDistribuido = movesDistribuir.length > 0;
  const totalDistribuido = movesDistribuir.reduce((s, pm) => s + pm.valor, 0);

  // ── "Puedes salir el finde con X" — del disponible de fiesta ────
  const gastadoFiestaQuincena = useMemo(() =>
    movements
      .filter(m => m.naturaleza === 'egreso' && m.estado === 'confirmado' && m.categoria === 'Ocio' && m.fecha >= q.inicio && m.fecha <= q.fin)
      .reduce((s, m) => s + m.valor, 0),
    [movements, q]
  );
  const restanteFiesta = Math.max(0, aFiesta - gastadoFiestaQuincena);
  const findesRestantes = useMemo(() => {
    const desde = new Date(Math.max(new Date(hoyStr + 'T12:00:00').getTime(), new Date(q.inicio + 'T12:00:00').getTime()));
    const fin = new Date(q.fin + 'T12:00:00');
    let count = 0;
    for (const d = new Date(desde); d <= fin; d.setDate(d.getDate() + 1)) if (d.getDay() === 6) count++;
    return Math.max(1, count);
  }, [q, hoyStr]);
  const salirFindeCon = Math.round(restanteFiesta / findesRestantes);

  // Crea el bolsillo si no existe y devuelve su id
  const getOrCreatePocket = async (nombre: string, emoji: string, metaValor: number) => {
    const ex = pockets.find(p => p.nombre.toLowerCase() === nombre.toLowerCase());
    if (ex) return ex.id;
    await addPocket({ nombre, emoji, metaValor, esFondo: false });
    const { data } = await supabase.from('personal_pockets').select('id').ilike('nombre', nombre).limit(1).single();
    return data?.id as string | undefined;
  };

  // Reparte el ingreso de la quincena a los sobres (acumulativo, una vez por quincena)
  const distribuir = async () => {
    if (monto <= 0) { alert('No hay ingreso en esta quincena para distribuir. Págate en Nómina primero (o registra el ingreso).'); return; }
    if (yaDistribuido) { alert('Ya distribuiste esta quincena. Los montos ya están sumados a tus bolsillos.'); return; }
    if (!confirm(`Distribuir ${fmt(monto)} a tus bolsillos:\n\n🔒 Obligaciones   ${fmt(aObligaciones)}\n🍚 Supervivencia  ${fmt(aSupervivencia)}\n🗽 Libertad       ${fmt(aLibertadFund)}\n🎉 Queda libre    ${fmt(aFiesta)}\n\nSe SUMAN a los bolsillos (se crean la primera vez). Luego cada gasto lo descuentas del bolsillo que elijas.`)) return;
    setAplicando(true);
    try {
      const nota = `distribuir:${q.id}`;
      if (aObligaciones > 0)  { const id = await getOrCreatePocket('Obligaciones', '🔒', 0);            if (id) await moverPocket(id, aObligaciones, hoyStr, nota); }
      if (aSupervivencia > 0) { const id = await getOrCreatePocket('Supervivencia', '🍚', 0);            if (id) await moverPocket(id, aSupervivencia, hoyStr, nota); }
      if (aLibertadFund > 0)  { const id = await getOrCreatePocket('Libertad', '🗽', 7_710_000);          if (id) await moverPocket(id, aLibertadFund, hoyStr, nota); }
      await refetch();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally { setAplicando(false); }
  };

  const irA = (nuevoOffset: number) => { setOffset(nuevoOffset); setMontoStr(null); };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando...</div>;
  if (setupError) return <div style={{ padding: '2rem', color: GOLD }}>Activa el modo Personal desde la página Hoy.</div>;

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
              <div style={{ fontSize: '0.64rem', color: esActual ? GOLD : '#52525b', fontWeight: 600 }}>
                {esActual ? 'EN CURSO' : 'histórico'}
              </div>
            </div>
            <button onClick={() => irA(offset + 1)} disabled={offset >= 0}
              style={{ background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.4rem 0.6rem', color: offset >= 0 ? '#3f3f46' : GOLD, cursor: offset >= 0 ? 'not-allowed' : 'pointer' }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Lo que entró esta quincena (auto desde movimientos) */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <label style={lbl}>Te entró esta quincena {montoStr !== null && <span style={{ color: GOLD }}>(simulación)</span>}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.4rem', fontWeight: 800, color: GOLD }}>$</span>
              <input style={{ ...inp, fontSize: '1.4rem', fontWeight: 800, color: GOLD, marginTop: 0 }} inputMode="numeric"
                value={montoStr === null ? fmtInput(String(ingresoDetectado)) : montoStr}
                onChange={e => setMontoStr(fmtInput(e.target.value))} />
            </div>
            {/* Desglose de ingresos reales */}
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
                Aún no hay ingresos registrados en esta quincena. Cuando llegue un pago o tu salario, aparece aquí solo.
              </div>
            )}
            {montoStr !== null && (
              <button onClick={() => setMontoStr(null)} style={{ marginTop: '0.6rem', background: 'transparent', border: 'none', color: GOLD, fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                ← Volver al monto real ({fmt(ingresoDetectado)})
              </button>
            )}
          </div>

          {/* La cascada */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Repartición inteligente — lo intocable primero</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <CascadaFila emoji="🔒" titulo="Obligaciones del periodo"
                desc={`cuotas de deuda ${fmt(cuotasDeudaQuincena)} + otros fijos ${fmt(otrosFijos)}`}
                valor={obligaciones} color="#06b6d4" />
              <CascadaFila emoji="🍚" titulo="Supervivencia"
                desc="comer y moverte — intocable, antes que la fiesta"
                valor={supervivencia} color="#f59e0b" />

              {hayDeficit ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 0.95rem', background: 'rgba(239,68,68,0.1)', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.35)' }}>
                  <span style={{ fontSize: '1.3rem' }}>🚨</span>
                  <div style={{ fontSize: '0.74rem', color: '#fca5a5', lineHeight: 1.5 }}>
                    Te faltan <b style={{ color: '#ef4444' }}>{fmt(deficit)}</b> para cubrir tus obligaciones + supervivencia de esta quincena.
                    <b style={{ color: '#fff' }}> No apartes a Libertad ni salgas de fiesta</b> — primero asegura lo básico.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.875rem', borderTop: '1px dashed #2a2a2a', borderBottom: '1px dashed #2a2a2a' }}>
                    <span style={{ fontSize: '0.72rem', color: '#a0aec0', fontWeight: 700 }}>🟰 Excedente real (lo que de verdad sobra)</span>
                    <span style={{ fontSize: '1rem', fontWeight: 800, color: '#10b981' }}>{fmtK(excedente)}</span>
                  </div>
                  <CascadaFila emoji="🗽" titulo="Libertad (50% del excedente)"
                    desc="acelera tu salida de deudas"
                    valor={aLibertad} color="#a855f7" destacado />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.875rem', background: `${GOLD}11`, borderRadius: '10px', border: `1px solid ${GOLD}33` }}>
                    <span style={{ fontSize: '1.3rem' }}>🎉</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: GOLD, fontWeight: 800, fontSize: '0.9rem' }}>Disponible para fiesta/extra</div>
                      <div style={{ fontSize: '0.65rem', color: '#52525b' }}>solo esto se gasta libre — ya cubriste todo lo importante</div>
                    </div>
                    <div style={{ fontSize: '1.3rem', fontWeight: 900, color: GOLD }}>{fmtK(disponibleFiesta)}</div>
                  </div>
                </>
              )}
            </div>

            {/* Distribuir a sobres — una sola acción que llena los bolsillos */}
            {esActual ? (
              yaDistribuido ? (
                <div style={{ marginTop: '1rem', padding: '0.85rem', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', textAlign: 'center' }}>
                  <div style={{ color: '#10b981', fontWeight: 800, fontSize: '0.85rem' }}>✓ Distribuiste esta quincena</div>
                  <div style={{ fontSize: '0.66rem', color: '#52525b', marginTop: '0.25rem' }}>
                    {fmt(totalDistribuido)} repartidos a tus bolsillos. Cada gasto descuéntalo del bolsillo que elijas al registrarlo en Movimientos.
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={distribuir} disabled={aplicando || monto <= 0}
                    style={{ width: '100%', marginTop: '1rem', padding: '0.95rem', borderRadius: '10px', border: 'none', background: monto > 0 ? '#a855f7' : '#1f2937', color: monto > 0 ? '#fff' : '#52525b', fontWeight: 800, fontSize: '0.95rem', cursor: monto > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    {aplicando ? 'Distribuyendo...' : <><Split size={18} /> Distribuir {fmt(monto)} a mis bolsillos</>}
                  </button>
                  <div style={{ fontSize: '0.64rem', color: '#52525b', textAlign: 'center', marginTop: '0.5rem', lineHeight: 1.6 }}>
                    Crea los bolsillos la primera vez y les SUMA:
                    <br />🔒 {fmt(aObligaciones)} · 🍚 {fmt(aSupervivencia)} · 🗽 {fmt(aLibertadFund)} · 🎉 {fmt(aFiesta)} libre
                  </div>
                </>
              )
            ) : (
              <div style={{ marginTop: '1rem', fontSize: '0.68rem', color: '#52525b', textAlign: 'center' }}>
                {yaDistribuido ? `En esta quincena distribuiste ${fmt(totalDistribuido)} a tus bolsillos.` : 'En esta quincena no registraste distribución.'}
              </div>
            )}
          </div>

          {/* Puedes salir el finde con X — solo quincena en curso y si hay con qué */}
          {esActual && !hayDeficit && (
            <div className="card" style={{ padding: '1.5rem', border: `1px solid ${GOLD}33`, background: `linear-gradient(135deg, ${GOLD}0a, transparent)`, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <PartyPopper size={16} style={{ color: GOLD }} />
                <span style={{ fontSize: '0.7rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Puedes salir este finde con</span>
              </div>
              <div style={{ fontSize: '2.4rem', fontWeight: 900, color: GOLD, lineHeight: 1 }}>{fmtK(salirFindeCon)}</div>
              <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '0.5rem' }}>
                Te queda {fmt(restanteFiesta)} de fiesta esta quincena para {findesRestantes} finde{findesRestantes > 1 ? 's' : ''}.
                {gastadoFiestaQuincena > 0 && ` Ya gastaste ${fmt(gastadoFiestaQuincena)}.`}
              </div>
              <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', marginTop: '0.75rem' }}>
                <div style={{ height: '100%', width: `${disponibleFiesta > 0 ? Math.min(100, (gastadoFiestaQuincena / disponibleFiesta) * 100) : 0}%`, background: gastadoFiestaQuincena >= disponibleFiesta ? '#ef4444' : GOLD, borderRadius: '999px' }} />
              </div>
            </div>
          )}

          {/* Recordatorio de la regla */}
          <div className="card" style={{ padding: '1rem 1.25rem', border: '1px solid #1f2937' }}>
            <div style={{ fontSize: '0.72rem', color: '#52525b', lineHeight: 1.7 }}>
              <b style={{ color: '#a855f7' }}>Por qué Libertad va primero:</b> mientras debas al ~28%, pagar deuda es tu mejor inversión (28% garantizado, sin riesgo). Ese 15% no es un gasto — es comprarte tu libertad. Cuando salgas de deudas, ese mismo bolsillo se vuelve inversión real.
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const CascadaFila: React.FC<{ emoji: string; titulo: string; desc: string; valor: number; color: string; destacado?: boolean }> = ({ emoji, titulo, desc, valor, color, destacado }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0.875rem', background: destacado ? `${color}11` : '#0d0d0d', borderRadius: '10px', border: destacado ? `1px solid ${color}33` : '1px solid #1a1a1a' }}>
    <span style={{ fontSize: '1.3rem' }}>{emoji}</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ color: destacado ? color : '#e4e4e7', fontWeight: destacado ? 800 : 600, fontSize: '0.85rem' }}>{titulo}</div>
      <div style={{ fontSize: '0.65rem', color: '#52525b' }}>{desc}</div>
    </div>
    <div style={{ fontSize: '1.05rem', fontWeight: 800, color }}>{fmtK(valor)}</div>
  </div>
);
