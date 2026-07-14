import React, { useMemo, useState } from 'react';
import { Wallet, Gift, PiggyBank, ShieldCheck, Check, X } from 'lucide-react';
import { useLedger } from '../../hooks/useLedger';
import { calcKPIs } from '../../hooks/useFinancials';
import { FOUNDER_RULES, calcFounderStatus, calcBonoMes } from '../../lib/founderRules';
import { hoyISO } from '../../lib/dates';
import { supabase } from '../../lib/supabase';
import { MESES_ES } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtMiles = (v: string | number) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\D/g, '')) || 0;
  return n.toLocaleString('es-CO');
};
const fmtK = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  if (a >= 1_000_000) return s + '$' + (a / 1_000_000).toFixed(1) + 'M';
  if (a >= 1_000) return s + '$' + (a / 1_000).toFixed(0) + 'K';
  return s + fmt(a);
};
const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

export const Nomina: React.FC = () => {
  const { movements, realAccounts, debts, loading, refetch } = useLedger();
  const [pagando, setPagando] = useState<'base' | 'bono' | null>(null);
  // Monto a registrar. null = aún no lo tocó → usa el sugerido por el motor.
  const [montoStr, setMontoStr] = useState<string | null>(null);
  const [bonoStr, setBonoStr] = useState<string | null>(null);

  const founder = useMemo(() => calcFounderStatus(movements), [movements]);
  const bono    = useMemo(() => calcBonoMes(movements), [movements]);
  const kpis    = useMemo(() => calcKPIs(movements, realAccounts, debts, 1), [movements, realAccounts, debts]);

  const hoyStr = hoyISO();
  const reservaPct = Math.max(0, Math.min(100, (kpis.cajaTotal / FOUNDER_RULES.reservaMeta) * 100));
  const reservaLograda = kpis.cajaTotal >= FOUNDER_RULES.reservaMeta;

  // Total que la empresa te paga este mes (base ya pagada + bono ya pagado)
  const mesActual = hoyStr.slice(0, 7);
  const pagadoEsteMes = movements
    .filter(m => m.estado === 'confirmado' && m.fecha.startsWith(mesActual) &&
      (m.notas?.startsWith('founder:salario') || m.notas?.startsWith('founder:bono')))
    .reduce((s, m) => s + m.valor, 0);

  // El pago se puede REGISTRAR cuando el fundador lo haga realmente (a veces paga
  // un día antes). La única regla es no duplicar: si ya está pagada, no se repite.
  const baseDisponiblePagar = founder.activo && !founder.proximoPago.pagado && founder.proximoPago.monto > 0;
  const bonoDisponiblePagar = bono.califica && bono.pendiente > 0;
  const bonoAntesDeCierre = hoyStr < bono.cierreMes;

  // Monto que se registrará: el sugerido por el motor (base − lo que ya sacaste
  // personal esta quincena) salvo que tú lo edites. Siempre editable.
  const montoSugerido = founder.proximoPago.monto;
  const montoRegistrar = montoStr === null ? montoSugerido : (Number(montoStr.replace(/\./g, '')) || 0);
  const yaSacasteQuincena = founder.gastoQuincena;

  // Bono editable: sugerido = lo que queda del bono del mes (rango recomendado 0–pendiente)
  const bonoRegistrar = bonoStr === null ? bono.pendiente : (Number(bonoStr.replace(/\./g, '')) || 0);
  const bonoExcede = bonoRegistrar > bono.pendiente;

  // Historial de pagos al fundador (base + bono)
  const historial = movements
    .filter(m => m.estado === 'confirmado' && (m.notas?.startsWith('founder:salario') || m.notas?.startsWith('founder:bono')))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 12);

  const registrarPago = async (tipo: 'base' | 'bono', monto: number, nota: string, descripcion: string) => {
    // Aviso de responsabilidad si te pagas FUERA de tu día (15 / fin de mes)
    const esAdelanto = tipo === 'base' && hoyStr < founder.proximoPago.fecha;
    const bonoAlto = tipo === 'bono' && monto > bono.pendiente;
    const aviso = esAdelanto
      ? `⚠️ ESTÁS ADELANTANDO TU PAGO\nHoy (${fmtFecha(hoyStr)}) no es tu día de nómina (${fmtFecha(founder.proximoPago.fecha)}).\nHazlo SOLO si es una urgencia real: adelantarte reduce tu colchón y desordena el ciclo.\n\n`
      : bonoAlto
      ? `⚠️ BONO POR ENCIMA DE LO RECOMENDADO\nTe estás pagando ${fmt(monto)} de bono, pero lo que generó la empresa este mes es ${fmt(bono.pendiente)}.\nEl exceso reduce tu reserva. Hazlo solo si sabes lo que haces.\n\n`
      : '';
    if (!confirm(`${aviso}Registrar ${descripcion} por ${fmt(monto)}?\n\n• Sale de Bold (empresa)\n• Entra como ingreso en tu mundo Personal\n\nRecuerda hacer la transferencia real por este mismo valor.`)) return;
    setPagando(tipo);
    try {
      const hoy = new Date();
      const boldAcc = realAccounts.find(a => a.nombre.toLowerCase().includes('bold')) || realAccounts[0];
      // 1) DEBITA de la empresa: retiro del fundador desde Bold
      const { data: nuevo, error } = await supabase.from('ledger_movements').insert({
        fecha: hoyISO(),
        tipo_movimiento: 'retiro_fundador',
        naturaleza: 'egreso',
        descripcion,
        valor: monto,
        categoria: 'Salario',
        estado: 'confirmado',
        cuenta_real_id: boldAcc?.id || null,
        personal_flag: false,
        tipo_retiro: 'sueldo_aprobado',
        notas: nota,
        mes: MESES_ES[hoy.getMonth()],
        updated_at: new Date().toISOString(),
      }).select('id').single();
      if (error) throw error;

      // 2) ACREDITA en tu mundo Personal: el salario aparece como ingreso en Bancolombia.
      //    `fuente` lleva el id del movimiento de empresa → el puente de Personal lo
      //    reconoce como ya sincronizado y nunca lo duplica.
      if (nuevo?.id) {
        const { error: pErr } = await supabase.from('personal_movements').insert({
          fecha: hoyISO(),
          naturaleza: 'ingreso',
          descripcion,
          valor: monto,
          categoria: tipo === 'bono' ? 'Bonificación' : 'Salario Impulsy',
          estado: 'confirmado',
          fuente: `salario:${nuevo.id}`,
        });
        if (pErr) {
          console.error('puente personal:', pErr.message);
          alert('El pago se registró en la empresa, pero no pudo sincronizarse al mundo Personal. Entra a Personal → Hoy y se completará solo.');
        }
      }
      setMontoStr(null); // vuelve al sugerido para la próxima quincena
      setBonoStr(null);
      refetch();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally { setPagando(null); }
  };

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando nómina...</div>;

  const candados = [
    { ok: bono.califica, label: 'El mes cerró con utilidad positiva', detalle: bono.califica ? `Utilidad ${fmtK(bono.utilidad)}` : `Va en ${fmtK(bono.utilidad)} — la empresa no rindió aún` },
    { ok: kpis.cajaTotal > 0 && bono.utilidad > 0, label: 'La reserva está creciendo', detalle: reservaLograda ? 'Reserva en meta ✓' : `Caja ${fmtK(kpis.cajaTotal)}` },
    { ok: null as boolean | null, label: 'Sin impuestos ni deudas urgentes sin cubrir', detalle: 'Confírmalo tú antes de cobrar el bono' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      <div>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>💼 Nómina del Fundador</h1>
        <p style={{ color: '#52525b', fontSize: '0.8rem', marginTop: '0.15rem' }}>
          La empresa te paga base + bono. Nada más. Lo personal va en tu cuenta aparte.
        </p>
      </div>

      {/* Cómo funciona el registro — para que no haya dudas */}
      <div className="card" style={{ padding: '0.875rem 1rem', background: '#0d0d0d', border: '1px solid #1f2937' }}>
        <div style={{ fontSize: '0.72rem', color: '#a0aec0', lineHeight: 1.7 }}>
          <b style={{ color: '#10b981' }}>Cómo funciona:</b> tú haces la transferencia real en tu banco (Bold → tu cuenta).
          Luego presionas <b style={{ color: '#fff' }}>“Registrar”</b> aquí y el sistema lo anota como un movimiento más —
          igual que cualquier gasto. <b style={{ color: '#fff' }}>No mueve plata, solo lleva la cuenta.</b> No se puede registrar dos veces la misma quincena.
        </div>
      </div>

      {/* KPIs */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
        {[
          { label: 'Base mensual', value: fmtK(FOUNDER_RULES.salarioQuincenal * 2), color: '#fff', hint: `${fmt(FOUNDER_RULES.salarioQuincenal)} × 2 quincenas` },
          { label: 'Pagado este mes', value: fmtK(pagadoEsteMes), color: '#10b981', hint: 'base + bono ya cobrados' },
          { label: 'Bono del mes', value: bono.califica ? fmtK(bono.bono) : '$0', color: bono.califica ? '#a855f7' : '#71717a', hint: bono.califica ? '30% de la utilidad' : 'el mes no califica' },
          { label: 'Reserva', value: fmtK(kpis.cajaTotal), color: reservaLograda ? '#10b981' : '#06b6d4', hint: `${reservaPct.toFixed(0)}% de ${fmtK(FOUNDER_RULES.reservaMeta)}` },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.3rem' }}>{s.value}</span>
            <span style={{ fontSize: '0.6rem', color: '#52525b', marginTop: '0.1rem' }}>{s.hint}</span>
          </div>
        ))}
      </div>

      {/* Base quincenal */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <Wallet size={16} style={{ color: '#10b981' }} />
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Tu quincena — {founder.quincena.label}</h3>
        </div>
        {founder.proximoPago.pagado ? (
          <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Esta quincena te pagaste</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#10b981' }}>{fmt(founder.salarioPagadoQuincena)}</div>
              <div style={{ fontSize: '0.68rem', color: '#52525b', marginTop: '0.2rem' }}>
                Base de referencia {fmt(FOUNDER_RULES.salarioQuincenal)}. Cierre y bono: {fmtFecha(founder.proximoPago.fecha)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontWeight: 700, fontSize: '0.85rem' }}>
                <Check size={16} /> Quincena registrada
              </div>
            </div>
          </div>
        ) : baseDisponiblePagar ? (
          <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
            {/* Izquierda: campo editable + desglose del sugerido */}
            <div>
              <label style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Monto a registrar hoy</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981' }}>$</span>
                <input
                  inputMode="numeric"
                  value={montoStr === null ? fmtMiles(montoSugerido) : montoStr}
                  onChange={e => setMontoStr(fmtMiles(e.target.value))}
                  style={{ width: '100%', maxWidth: '180px', background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '1.6rem', fontWeight: 900, fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ fontSize: '0.66rem', color: '#52525b', marginTop: '0.4rem', lineHeight: 1.6 }}>
                Sugerido: base {fmt(FOUNDER_RULES.salarioQuincenal)}
                {founder.salarioPagadoQuincena > 0 && <> − {fmt(founder.salarioPagadoQuincena)} que ya te pagaste esta quincena</>}
                {yaSacasteQuincena > 0 && <> − {fmt(yaSacasteQuincena)} que ya saliste de Bold</>}
                {founder.deudaArrastrada > 0 && <> − {fmt(founder.deudaArrastrada)} de arrastre</>}
                {' '}= <b style={{ color: '#a0aec0' }}>{fmt(montoSugerido)}</b>. Puedes pagarte en pedazos, cualquier día.
              </div>
            </div>
            {/* Derecha: botón de registro */}
            <div style={{ textAlign: 'right' }}>
              <button onClick={() => registrarPago('base', montoRegistrar, `founder:salario:${founder.quincena.id}`, `Salario base — ${founder.quincena.label}`)}
                disabled={pagando === 'base' || montoRegistrar <= 0}
                style={{ padding: '0.75rem 1.25rem', borderRadius: '10px', border: 'none', background: montoRegistrar > 0 ? '#10b981' : '#1f2937', color: montoRegistrar > 0 ? '#000' : '#52525b', fontWeight: 800, fontSize: '0.85rem', cursor: montoRegistrar > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {pagando === 'base' ? 'Registrando...' : `💰 Registrar ${fmt(montoRegistrar)}`}
              </button>
              <div style={{ fontSize: '0.64rem', color: '#52525b', marginTop: '0.35rem' }}>
                Cuando ya hiciste (o vas a hacer) la transferencia
              </div>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: '0.72rem', color: '#52525b' }}>Régimen inactivo</div>
        )}
      </div>

      {/* Bono del mes */}
      <div className="card" style={{ padding: '1.25rem', border: bono.califica ? '1px solid #a855f733' : undefined }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
          <Gift size={16} style={{ color: bono.califica ? '#a855f7' : '#71717a' }} />
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Bono de {bono.mesLabel}</h3>
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#52525b' }}>30% de la utilidad del mes</span>
        </div>

        {/* Cálculo de la utilidad */}
        <div className="resp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { l: 'Ingresos del mes', v: bono.ingresos, c: '#10b981' },
            { l: 'Egresos del mes', v: -bono.egresos, c: '#ef4444' },
            { l: 'Utilidad', v: bono.utilidad, c: bono.utilidad >= 0 ? '#10b981' : '#ef4444' },
          ].map(x => (
            <div key={x.l} style={{ background: '#0d0d0d', borderRadius: '10px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>{x.l}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: x.c }}>{fmtK(x.v)}</div>
            </div>
          ))}
        </div>

        {/* Candados */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
          {candados.map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
              <span style={{ flexShrink: 0 }}>
                {c.ok === true ? <Check size={14} style={{ color: '#10b981' }} /> : c.ok === false ? <X size={14} style={{ color: '#ef4444' }} /> : <ShieldCheck size={14} style={{ color: '#71717a' }} />}
              </span>
              <span style={{ color: c.ok === true ? '#a0aec0' : c.ok === false ? '#71717a' : '#71717a' }}>{c.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#52525b' }}>{c.detalle}</span>
            </div>
          ))}
        </div>

        {/* Resultado del bono */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.875rem 1rem', background: bono.califica ? 'rgba(168,85,247,0.08)' : '#0d0d0d', borderRadius: '10px' }}>
          <div>
            <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Bono que te corresponde</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: bono.califica ? '#a855f7' : '#71717a' }}>{fmt(bono.bono)}</div>
            {!bono.califica && <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: '0.2rem' }}>Este mes la empresa no rindió para premiarte. Solo tu base.</div>}
            {bono.califica && bono.pagado > 0 && <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '0.2rem' }}>Ya cobraste {fmt(bono.pagado)} de bono este mes.</div>}
          </div>
          {bonoDisponiblePagar && (
            <div style={{ textAlign: 'right', minWidth: '210px' }}>
              <label style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Cuánto bono registrar</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'flex-end', marginTop: '0.2rem' }}>
                <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#a855f7' }}>$</span>
                <input inputMode="numeric"
                  value={bonoStr === null ? fmtMiles(bono.pendiente) : bonoStr}
                  onChange={e => setBonoStr(fmtMiles(e.target.value))}
                  style={{ width: '150px', background: '#0d0d0d', border: `1px solid ${bonoExcede ? '#f59e0b' : '#1f2937'}`, borderRadius: '8px', padding: '0.4rem 0.6rem', color: '#fff', fontSize: '1.3rem', fontWeight: 900, fontFamily: 'inherit', textAlign: 'right' }} />
              </div>
              <button onClick={() => registrarPago('bono', bonoRegistrar, `founder:bono:${bono.mes}`, `Bono ${bono.mesLabel}`)}
                disabled={pagando === 'bono' || bonoRegistrar <= 0}
                style={{ marginTop: '0.5rem', padding: '0.7rem 1.25rem', borderRadius: '10px', border: 'none', background: bonoRegistrar > 0 ? '#a855f7' : '#1f2937', color: bonoRegistrar > 0 ? '#fff' : '#52525b', fontWeight: 800, fontSize: '0.85rem', cursor: bonoRegistrar > 0 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {pagando === 'bono' ? '...' : `🎁 Registrar ${fmt(bonoRegistrar)}`}
              </button>
              <div style={{ fontSize: '0.64rem', color: bonoExcede ? '#f59e0b' : '#52525b', marginTop: '0.35rem', maxWidth: '200px', marginLeft: 'auto' }}>
                {bonoExcede
                  ? `Máximo recomendado: ${fmt(bono.pendiente)} (30% de la utilidad). Puedes cobrar eso o menos.`
                  : bonoAntesDeCierre
                  ? `Recomendado hasta ${fmt(bono.pendiente)}. Ojo: el mes cierra el ${fmtFecha(bono.cierreMes)}, la utilidad puede cambiar.`
                  : `Recomendado hasta ${fmt(bono.pendiente)}. Puedes pagártelo en pedazos.`}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reserva + meta */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
          <PiggyBank size={16} style={{ color: reservaLograda ? '#10b981' : '#06b6d4' }} />
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Reserva — meta {fmtK(FOUNDER_RULES.reservaMeta)}</h3>
        </div>
        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: reservaLograda ? '#10b981' : '#fff' }}>{fmtK(Math.max(0, kpis.cajaTotal))}</div>
        <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', margin: '0.5rem 0' }}>
          <div style={{ height: '100%', width: `${reservaPct}%`, background: reservaLograda ? '#10b981' : '#06b6d4', borderRadius: '999px', transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: '0.7rem', color: '#52525b' }}>
          {reservaLograda
            ? 'Meta lograda — tu base puede subir y se desbloquean distribuciones 🎉'
            : `${reservaPct.toFixed(0)}% de 2 meses de operación en caja. Cuando llegue a la meta, tu base sube.`}
        </div>
      </div>

      {/* Historial */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.875rem' }}>Historial de pagos</h3>
        {historial.length === 0 ? (
          <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1.5rem 0' }}>
            Aún no te has pagado nada con el nuevo sistema. Tu primera quincena te espera arriba.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {historial.map(m => {
              const esBono = m.notas?.startsWith('founder:bono');
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: esBono ? '#a855f7' : '#10b981', background: esBono ? 'rgba(168,85,247,0.1)' : 'rgba(16,185,129,0.1)', padding: '0.12rem 0.5rem', borderRadius: '999px' }}>
                      {esBono ? 'Bono' : 'Base'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>{m.descripcion}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#52525b' }}>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: '0.85rem' }}>{fmt(m.valor)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
