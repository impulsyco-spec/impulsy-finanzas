import React, { useEffect, useMemo, useState } from 'react';
import { Phone, PhoneMissed, Target, Clock, CalendarCheck, Copy, Check, BarChart2, Play, Square, Trash2, Users, RefreshCw, FileText, X } from 'lucide-react';
import { useProductividad, Cualificacion, Desenlace, ProdLlamada } from '../../hooks/useProductividad';
import { useGHL, GhlLead } from '../../hooks/useGHL';

const C = '#06b6d4'; // acento Productividad

const pad = (n: number) => String(n).padStart(2, '0');
const fmtTimer = (seg: number) => {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
};
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

const DESENLACES: { id: Desenlace; label: string; emoji: string; color: string }[] = [
  { id: 'agendado',      label: 'Agendado',      emoji: '✅', color: '#10b981' },
  { id: 'reagendado',    label: 'Re-agendado',   emoji: '🔄', color: '#06b6d4' },
  { id: 'descalificado', label: 'Descalificado', emoji: '❌', color: '#71717a' },
  { id: 'colgo',         label: 'Colgó',         emoji: '📴', color: '#ef4444' },
];

const EMPTY_CUALIF: Cualificacion = {
  nombre: '', negocio: '', aQueSeDedica: '', email: '', ticket: '', volumen: '', objetivo: '', notas: '',
  decisor: false, emailConfirmado: false, pidioAviso: false, urgencia: false,
};

export const Productividad: React.FC = () => {
  const { llamadas, sesiones, loading, setupError, sesionActiva, refetch, empezarRonda, terminarRonda, registrarLlamada, borrarSesion } = useProductividad();
  const ghl = useGHL();
  const [leadActual, setLeadActual] = useState<GhlLead | null>(null);
  const [fichaLead, setFichaLead] = useState<GhlLead | null>(null);
  const [filtroEtapa, setFiltroEtapa] = useState<string>('');
  const [vista, setVista] = useState<'operar' | 'metricas'>('operar');
  const [ahora, setAhora] = useState(Date.now());
  const [enLlamada, setEnLlamada] = useState<number | null>(null); // ms de inicio de la llamada en curso
  const [cualif, setCualif] = useState<Cualificacion>(EMPTY_CUALIF);
  const [copiado, setCopiado] = useState(false);
  const [busy, setBusy] = useState(false);
  const [periodo, setPeriodo] = useState<'hoy' | 'semana' | 'global'>('hoy');

  // Reloj en vivo
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const fechaHoy = new Date(ahora).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const horaHoy = new Date(ahora).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const llamadasRonda = useMemo(() => llamadas.filter(l => sesionActiva && l.sesionId === sesionActiva.id), [llamadas, sesionActiva]);
  const rondaTotal = llamadasRonda.length;
  const rondaContestadas = llamadasRonda.filter(l => l.contesto).length;
  const rondaAgendados = llamadasRonda.filter(l => l.desenlace === 'agendado').length;

  // Intentos por contacto (todas las rondas) — para el contador y el auto-enfriado
  const intentosPorContacto = useMemo(() => {
    const m: Record<string, number> = {};
    llamadas.forEach(l => { const id = l.cualif?._contactId; if (id) m[id] = (m[id] || 0) + 1; });
    return m;
  }, [llamadas]);

  const rondaSeg = sesionActiva ? (ahora - new Date(sesionActiva.inicio).getTime()) / 1000 : 0;
  const llamadaSeg = enLlamada ? (ahora - enLlamada) / 1000 : 0;

  const empezar = async () => {
    setBusy(true);
    try { await empezarRonda(); if (!ghl.cargado) ghl.cargar(); }
    catch (e: any) { alert('Error: ' + e.message); } finally { setBusy(false); }
  };

  const terminar = async () => {
    if (!sesionActiva) return;
    if (enLlamada) { alert('Termina la llamada en curso (elige un desenlace) antes de cerrar la ronda.'); return; }
    if (!confirm('¿Terminar la ronda de llamadas? Se guarda el resumen.')) return;
    setBusy(true);
    try { await terminarRonda(sesionActiva.id); } catch (e: any) { alert('Error: ' + e.message); } finally { setBusy(false); }
  };

  const descartar = async () => {
    if (!sesionActiva) return;
    if (!confirm('¿Descartar esta ronda y borrar sus llamadas? (úsalo para pruebas — no se puede deshacer)')) return;
    setBusy(true);
    try { setEnLlamada(null); await borrarSesion(sesionActiva.id); }
    catch (e: any) { alert('Error: ' + e.message); } finally { setBusy(false); }
  };

  const noContesto = async () => {
    if (!sesionActiva) return;
    setBusy(true);
    try {
      await registrarLlamada({
        sesionId: sesionActiva.id, inicio: new Date().toISOString(), contesto: false, desenlace: 'no_contesto',
        cualif: leadActual ? { _contactId: leadActual.contactId, _oppId: leadActual.id, _lead: leadActual.nombre } : undefined,
      });
      // Auto-enfriado: al 7º intento sin contestar, pásalo a Enfriado en GHL
      if (leadActual?.contactId) {
        const intentos = (intentosPorContacto[leadActual.contactId] || 0) + 1;
        if (intentos >= 7) {
          try {
            await ghl.sincronizar({ contactId: leadActual.contactId, opportunityId: leadActual.id, desenlace: 'no_contesto', intentos });
            alert(`${leadActual.nombre} llegó a ${intentos} intentos → movido a ❄️ Enfriado en GHL.`);
          } catch (e: any) { console.error('auto-enfriado:', e.message); }
        }
      }
      setLeadActual(null);
    } catch (e: any) { alert('Error: ' + e.message); } finally { setBusy(false); }
  };

  const contestada = async () => {
    setEnLlamada(Date.now()); setCopiado(false);
    if (leadActual?.contactId) {
      setCualif({ ...EMPTY_CUALIF, nombre: leadActual.nombre });
      try {
        const c = await ghl.traerContacto(leadActual.contactId);
        const campos = c.campos || {};
        setCualif({
          ...EMPTY_CUALIF,
          nombre: c.nombre || leadActual.nombre || '',
          negocio: c.empresa || '',
          email: c.email || '',
          objetivo: campos['¿Cúal es el objetivo de tu negocio?'] || '',
          notas: Object.entries(campos).map(([k, v]) => `${k}: ${v}`).join('\n'),
        });
      } catch { /* si falla, deja lo prellenado con el nombre */ }
    } else {
      setCualif(EMPTY_CUALIF);
    }
  };

  const cerrarConDesenlace = async (d: Desenlace) => {
    if (!sesionActiva || !enLlamada) return;
    const dur = Math.round((Date.now() - enLlamada) / 1000);
    const cualifFinal: Cualificacion = { ...cualif };
    if (leadActual) { cualifFinal._contactId = leadActual.contactId; cualifFinal._oppId = leadActual.id; cualifFinal._lead = leadActual.nombre; }
    const hayTexto = Object.values(cualif).some(v => typeof v === 'string' && v.trim());
    setBusy(true);
    try {
      await registrarLlamada({
        sesionId: sesionActiva.id, inicio: new Date(enLlamada).toISOString(),
        contesto: true, desenlace: d, duracionSeg: dur,
        cualif: (hayTexto || leadActual) ? cualifFinal : undefined,
      });
      // Sincronizar a GHL: nota + empresa/email + mover etapa segun desenlace
      if (leadActual?.contactId) {
        try {
          const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
          const r = await ghl.sincronizar({
            contactId: leadActual.contactId, opportunityId: leadActual.id, desenlace: d,
            companyName: cualif.negocio || undefined, email: cualif.email || undefined,
            nota: `📞 Llamada (${d}) · ${fecha}\n${textoCualif()}`,
          });
          if (r.etapa) console.log('GHL: movido a', r.etapa);
        } catch (e: any) { alert('La llamada se guardó, pero no se pudo sincronizar a GHL: ' + e.message); }
      }
      setEnLlamada(null); setCualif(EMPTY_CUALIF); setCopiado(false); setLeadActual(null);
    } catch (e: any) { alert('Error: ' + e.message); } finally { setBusy(false); }
  };

  const textoCualif = () => {
    const c = cualif;
    const chk = (b?: boolean) => (b ? '✅' : '⬜');
    return [
      c.nombre && `Cliente: ${c.nombre}`,
      c.negocio && `Negocio: ${c.negocio}`,
      c.aQueSeDedica && `A qué se dedica: ${c.aQueSeDedica}`,
      c.email && `Email: ${c.email}`,
      c.ticket && `Ticket promedio: ${c.ticket}`,
      c.volumen && `Volumen (leads/citas/ventas): ${c.volumen}`,
      c.objetivo && `Objetivo: ${c.objetivo}`,
      `\nChecklist:`,
      `${chk(c.decisor)} Es el decisor / decisores presentes`,
      `${chk(c.emailConfirmado)} Email confirmado para la cita`,
      `${chk(c.pidioAviso)} Pidió avisar si no puede asistir`,
      `${chk(c.urgencia)} Urgencia ALTA`,
      c.notas && `\nNotas:\n${c.notas}`,
    ].filter(Boolean).join('\n');
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(textoCualif()); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
    catch { alert('No se pudo copiar. Selecciona y copia manual.'); }
  };

  // ── Métricas del período ───────────────────────────────────────
  const metr = useMemo(() => {
    const inicioHoy = new Date(); inicioHoy.setHours(0, 0, 0, 0);
    const cutoff = periodo === 'hoy' ? inicioHoy.getTime() : periodo === 'semana' ? Date.now() - 7 * 864e5 : 0;
    const lls = llamadas.filter(l => new Date(l.inicio).getTime() >= cutoff);
    const total = lls.length;
    const contestadas = lls.filter(l => l.contesto).length;
    const agendados = lls.filter(l => l.desenlace === 'agendado').length;
    const reagendados = lls.filter(l => l.desenlace === 'reagendado').length;
    const noContesto = lls.filter(l => l.desenlace === 'no_contesto').length;
    const durAgendadas = lls.filter(l => l.desenlace === 'agendado' && l.duracionSeg).map(l => l.duracionSeg!);
    const durProm = durAgendadas.length ? durAgendadas.reduce((s, x) => s + x, 0) / durAgendadas.length : 0;

    // tiempo activo del período
    const ses = sesiones.filter(s => new Date(s.inicio).getTime() >= cutoff);
    const tiempoActivoSeg = ses.reduce((s, x) => s + ((x.fin ? new Date(x.fin).getTime() : ahora) - new Date(x.inicio).getTime()) / 1000, 0);

    // mejor franja horaria (por agendados)
    const porHora: Record<number, { total: number; agendados: number }> = {};
    lls.forEach(l => {
      const h = new Date(l.inicio).getHours();
      porHora[h] = porHora[h] || { total: 0, agendados: 0 };
      porHora[h].total++;
      if (l.desenlace === 'agendado') porHora[h].agendados++;
    });
    let mejorHora: { h: number; total: number; agendados: number } | null = null;
    Object.entries(porHora).forEach(([h, v]) => {
      if (!mejorHora || v.agendados > mejorHora.agendados || (v.agendados === mejorHora.agendados && v.total < mejorHora.total)) {
        if (v.agendados > 0) mejorHora = { h: Number(h), total: v.total, agendados: v.agendados };
      }
    });

    return {
      total, contestadas, agendados, reagendados, noContesto, durProm, tiempoActivoSeg, mejorHora,
      tasaContacto: pct(contestadas, total),
      convContestadas: pct(agendados, contestadas),
      convTotal: pct(agendados, total),
      llamadasPorAgenda: agendados > 0 ? (total / agendados) : 0,
    };
  }, [llamadas, sesiones, periodo, ahora]);

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Cargando productividad...</div>;

  if (setupError) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem' }}>
      <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '1.8rem' }}>📞 Productividad</h1>
      <div className="card" style={{ padding: '1.5rem', border: `1px solid ${C}44` }}>
        <h3 style={{ color: C, fontWeight: 700, marginBottom: '0.5rem' }}>Falta crear las tablas (paso único)</h3>
        <p style={{ color: '#a0aec0', fontSize: '0.85rem', lineHeight: 1.7 }}>
          Abre tu proyecto en <b>Supabase → SQL Editor</b>, pega el contenido del archivo
          <b> supabase-productividad.sql</b> (está en la raíz del proyecto) y dale RUN. Luego refresca esta página.
        </p>
        <button className="btn btn-primary" style={{ marginTop: '1rem' }} onClick={refetch}>Ya lo corrí — reintentar</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      {/* Encabezado + reloj */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>📞 Productividad</h1>
          <p style={{ color: '#52525b', fontSize: '0.8rem', marginTop: '0.15rem', textTransform: 'capitalize' }}>{fechaHoy}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Hora Bogotá</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: C, fontVariantNumeric: 'tabular-nums' }}>{horaHoy}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.4rem', background: '#111', padding: '0.25rem', borderRadius: '10px', width: 'fit-content' }}>
        {([['operar', '🎯 Operar'], ['metricas', '📊 Métricas']] as const).map(([v, t]) => (
          <button key={v} onClick={() => setVista(v)}
            style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', background: vista === v ? C : 'transparent', color: vista === v ? '#000' : '#71717a' }}>
            {t}
          </button>
        ))}
      </div>

      {vista === 'operar' ? (
        !sesionActiva ? (
          /* ── Sin ronda activa ── */
          <>
            <div className="card" style={{ padding: '2rem', textAlign: 'center', border: `1px solid ${C}33` }}>
              <Target size={36} style={{ color: C, marginBottom: '0.5rem' }} />
              <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>Listo para cazar</h3>
              <p style={{ color: '#52525b', fontSize: '0.8rem', margin: '0.4rem 0 1.25rem' }}>Arranca una ronda y empieza a registrar cada llamada.</p>
              <button onClick={empezar} disabled={busy}
                style={{ padding: '1rem 2rem', borderRadius: '12px', border: 'none', background: C, color: '#000', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                <Play size={18} /> {busy ? 'Abriendo...' : 'Empezar ronda de caza'}
              </button>
            </div>
            <ResumenHoy m={metr} onVerMetricas={() => { setPeriodo('hoy'); setVista('metricas'); }} />
          </>
        ) : !enLlamada ? (
          /* ── Ronda activa, esperando llamada ── */
          <>
            <div className="card" style={{ padding: '1.25rem', border: `1px solid ${C}33`, textAlign: 'center' }}>
              <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                <Clock size={12} /> Ronda en curso
              </div>
              <div style={{ fontSize: '2.6rem', fontWeight: 900, color: C, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtTimer(rondaSeg)}</div>
              <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginTop: '1rem' }}>
                <MiniStat label="Llamadas" value={rondaTotal} color="#fff" />
                <MiniStat label="Contestadas" value={rondaContestadas} color="#06b6d4" />
                <MiniStat label="Agendadas" value={rondaAgendados} color="#10b981" />
              </div>
            </div>

            {leadActual ? (
              <div className="card" style={{ padding: '1rem 1.25rem', border: `1px solid ${C}55`, background: `${C}0d`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.6rem', color: C, textTransform: 'uppercase', fontWeight: 700 }}>Marcando a</div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{leadActual.nombre}</div>
                  <div style={{ fontSize: '0.78rem', color: '#a0aec0' }}>{leadActual.telefono || 'sin teléfono'} · {leadActual.etapa}</div>
                </div>
                <button onClick={() => setLeadActual(null)} style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', flexShrink: 0 }}>quitar</button>
              </div>
            ) : (
              <div style={{ fontSize: '0.72rem', color: '#52525b', textAlign: 'center' }}>
                Elige un lead de la lista de abajo 👇, o registra una llamada manual con los botones.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <button onClick={noContesto} disabled={busy}
                style={{ padding: '1.5rem', borderRadius: '14px', border: '1px solid #2a2a2a', background: '#0d0d0d', color: '#a1a1aa', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <PhoneMissed size={26} /> No contestó
              </button>
              <button onClick={contestada} disabled={busy}
                style={{ padding: '1.5rem', borderRadius: '14px', border: 'none', background: '#10b981', color: '#000', fontWeight: 800, fontSize: '1rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={26} /> Contestada
              </button>
            </div>

            <button onClick={terminar} disabled={busy}
              style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid #2a2a2a', background: 'transparent', color: '#ef4444', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
              <Square size={14} /> Terminar ronda
            </button>
            <button onClick={descartar} disabled={busy}
              style={{ padding: '0.4rem', background: 'none', border: 'none', color: '#52525b', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', textDecoration: 'underline' }}>
              <Trash2 size={12} /> Descartar ronda (era una prueba)
            </button>

            <ListaMarcacion ghl={ghl} leadActualId={leadActual?.id} filtro={filtroEtapa} setFiltro={setFiltroEtapa}
              llamadosIds={new Set(llamadasRonda.map(l => l.cualif?._contactId).filter(Boolean) as string[])}
              intentos={intentosPorContacto}
              onPick={l => setLeadActual(l)} onFicha={l => setFichaLead(l)} />
          </>
        ) : (
          /* ── En llamada (contestada) ── */
          <>
            <div className="card" style={{ padding: '1rem 1.25rem', border: '1px solid #10b98144', background: 'rgba(16,185,129,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: 700, fontSize: '0.85rem', minWidth: 0 }}>
                <Phone size={16} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>En llamada{leadActual ? ` · ${leadActual.nombre}` : ''}</span>
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#10b981', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtTimer(llamadaSeg)}</div>
            </div>

            {/* Plantilla híbrida de cualificación */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Cualificación</h3>
                <button onClick={copiar} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.75rem', borderRadius: '8px', border: `1px solid ${C}55`, background: copiado ? '#10b981' : 'transparent', color: copiado ? '#000' : C, fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar a GHL</>}
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <CampoCualif label="Nombre" value={cualif.nombre} onChange={v => setCualif(c => ({ ...c, nombre: v }))} />
                <CampoCualif label="🏢 Negocio (nombre → empresa en GHL)" value={cualif.negocio} onChange={v => setCualif(c => ({ ...c, negocio: v }))} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <CampoCualif label="A qué se dedica (actividad → nota)" value={cualif.aQueSeDedica} onChange={v => setCualif(c => ({ ...c, aQueSeDedica: v }))} />
                </div>
                <CampoCualif label="✉️ Email (→ se guarda en el contacto)" value={cualif.email} onChange={v => setCualif(c => ({ ...c, email: v }))} />
                <CampoCualif label="Ticket promedio" value={cualif.ticket} onChange={v => setCualif(c => ({ ...c, ticket: v }))} />
                <CampoCualif label="Volumen (leads/citas/ventas)" value={cualif.volumen} onChange={v => setCualif(c => ({ ...c, volumen: v }))} />
                <CampoCualif label="Objetivo (económico, tiempo...)" value={cualif.objetivo} onChange={v => setCualif(c => ({ ...c, objetivo: v }))} />

                <div style={{ gridColumn: '1 / -1', marginTop: '0.25rem' }}>
                  <label style={lblS}>Checklist — no se te olvide</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', marginTop: '0.35rem' }}>
                    <CheckCualif label="Es el decisor / decisores presentes" checked={!!cualif.decisor} onChange={v => setCualif(c => ({ ...c, decisor: v }))} />
                    <CheckCualif label="Email confirmado para la cita" checked={!!cualif.emailConfirmado} onChange={v => setCualif(c => ({ ...c, emailConfirmado: v }))} />
                    <CheckCualif label="Pidió avisar si no puede asistir" checked={!!cualif.pidioAviso} onChange={v => setCualif(c => ({ ...c, pidioAviso: v }))} />
                    <CheckCualif label="Urgencia ALTA para resolver" checked={!!cualif.urgencia} onChange={v => setCualif(c => ({ ...c, urgencia: v }))} />
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={lblS}>Notas libres (lo que extraigas del script)</label>
                  <textarea value={cualif.notas} onChange={e => setCualif(c => ({ ...c, notas: e.target.value }))}
                    rows={4} placeholder="Qué quiere mejorar, cómo lo maneja hoy, qué se le escapa, intentos previos, impacto si se resuelve..."
                    style={{ ...inpS, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>
            </div>

            {/* Desenlace */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>¿Cómo terminó la llamada?</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                {DESENLACES.map(d => (
                  <button key={d.id} onClick={() => cerrarConDesenlace(d.id)} disabled={busy}
                    style={{ padding: '1rem', borderRadius: '12px', border: `1px solid ${d.color}55`, background: `${d.color}11`, color: d.color, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{d.emoji}</span> {d.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      ) : (
        /* ── MÉTRICAS ── */
        <>
          <div style={{ display: 'flex', gap: '0.4rem', background: '#111', padding: '0.25rem', borderRadius: '10px', width: 'fit-content' }}>
            {([['hoy', 'Hoy'], ['semana', 'Semana'], ['global', 'Global']] as const).map(([p, t]) => (
              <button key={p} onClick={() => setPeriodo(p)}
                style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', background: periodo === p ? '#fff' : 'transparent', color: periodo === p ? '#000' : '#71717a' }}>
                {t}
              </button>
            ))}
          </div>

          <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
            <BigStat label="Llamadas" value={String(metr.total)} hint="en el período" color="#fff" />
            <BigStat label="Tasa de contacto" value={`${metr.tasaContacto}%`} hint={`${metr.contestadas} contestadas`} color="#06b6d4" />
            <BigStat label="Agendadas" value={String(metr.agendados)} hint={`${metr.convContestadas}% de las contestadas`} color="#10b981" />
            <BigStat label="Llamadas por agenda" value={metr.llamadasPorAgenda ? metr.llamadasPorAgenda.toFixed(1) : '—'} hint="cuántas para 1 cita" color={C} />
          </div>

          <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.875rem' }}>
            <BigStat label="Conversión total" value={`${metr.convTotal}%`} hint="agendadas / llamadas" color="#10b981" />
            <BigStat label="No contestaron" value={String(metr.noContesto)} hint="no levantaron" color="#a1a1aa" />
            <BigStat label="Tiempo activo" value={fmtTimer(metr.tiempoActivoSeg)} hint="en rondas" color="#fff" />
            <BigStat label="Dur. prom. agendada" value={metr.durProm ? fmtTimer(metr.durProm) : '—'} hint="cuánto dura una que agenda" color="#06b6d4" />
          </div>

          {/* Mejor horario */}
          <div className="card" style={{ padding: '1.25rem', border: `1px solid ${C}33` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <CalendarCheck size={16} style={{ color: C }} />
              <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Mejor franja para agendar</h3>
            </div>
            {metr.mejorHora ? (
              <div style={{ fontSize: '0.85rem', color: '#a0aec0' }}>
                Tu mejor hora es <b style={{ color: C, fontSize: '1.1rem' }}>{pad(metr.mejorHora.h)}:00–{pad((metr.mejorHora.h + 1) % 24)}:00</b> — {metr.mejorHora.agendados} agenda{metr.mejorHora.agendados > 1 ? 's' : ''} de {metr.mejorHora.total} llamada{metr.mejorHora.total > 1 ? 's' : ''}.
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: '#52525b' }}>Aún no hay agendas registradas. Cuando agendes, aquí verás a qué hora conviertes mejor.</div>
            )}
          </div>

          {/* Últimas rondas */}
          <HistorialRondas sesiones={sesiones} llamadas={llamadas} onBorrar={borrarSesion} />
        </>
      )}

      {fichaLead && (
        <FichaContacto lead={fichaLead} ghl={ghl}
          historial={llamadas.filter(l => l.cualif?._contactId === fichaLead.contactId)}
          onClose={() => setFichaLead(null)} />
      )}
    </div>
  );
};

// ── Sub-componentes ──────────────────────────────────────────────
const inpS: React.CSSProperties = { width: '100%', background: '#0d0d0d', border: '1px solid #1f2937', borderRadius: '8px', padding: '0.5rem 0.6rem', color: '#fff', fontSize: '0.85rem', marginTop: '0.2rem' };
const lblS: React.CSSProperties = { fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 };

const CampoCualif: React.FC<{ label: string; value?: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label style={lblS}>{label}</label>
    <input style={inpS} value={value || ''} onChange={e => onChange(e.target.value)} />
  </div>
);

const CheckCualif: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)}
    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.6rem', borderRadius: '8px', border: `1px solid ${checked ? '#10b981' : '#2a2a2a'}`, background: checked ? 'rgba(16,185,129,0.1)' : '#0d0d0d', color: checked ? '#10b981' : '#a1a1aa', fontWeight: 600, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
    <span style={{ flexShrink: 0, width: '16px', height: '16px', borderRadius: '4px', border: `1.5px solid ${checked ? '#10b981' : '#52525b'}`, background: checked ? '#10b981' : 'transparent', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 900 }}>{checked ? '✓' : ''}</span>
    {label}
  </button>
);

const MiniStat: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '1.5rem', fontWeight: 900, color }}>{value}</div>
    <div style={{ fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
  </div>
);

const BigStat: React.FC<{ label: string; value: string; hint: string; color: string }> = ({ label, value, hint, color }) => (
  <div className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
    <span className="stat-label">{label}</span>
    <span className="stat-value" style={{ color, fontSize: '1.4rem' }}>{value}</span>
    <span style={{ fontSize: '0.6rem', color: '#52525b', marginTop: '0.1rem' }}>{hint}</span>
  </div>
);

const ResumenHoy: React.FC<{ m: any; onVerMetricas: () => void }> = ({ m, onVerMetricas }) => (
  <div className="card" style={{ padding: '1.25rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
      <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem' }}>Hoy</h3>
      <button onClick={onVerMetricas} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', background: 'none', border: 'none', color: '#06b6d4', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        <BarChart2 size={13} /> Ver métricas
      </button>
    </div>
    <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
      <MiniStat label="Llamadas" value={m.total} color="#fff" />
      <MiniStat label="Contestadas" value={m.contestadas} color="#06b6d4" />
      <MiniStat label="Agendadas" value={m.agendados} color="#10b981" />
      <MiniStat label="x agenda" value={m.llamadasPorAgenda ? Number(m.llamadasPorAgenda.toFixed(1)) : 0} color="#06b6d4" />
    </div>
  </div>
);

const ListaMarcacion: React.FC<{
  ghl: ReturnType<typeof useGHL>;
  leadActualId?: string;
  filtro: string;
  setFiltro: (s: string) => void;
  llamadosIds: Set<string>;
  intentos: Record<string, number>;
  onPick: (l: GhlLead) => void;
  onFicha: (l: GhlLead) => void;
}> = ({ ghl, leadActualId, filtro, setFiltro, llamadosIds, intentos, onPick, onFicha }) => {
  const { leads, stages, cargando, error, cargado, cargar, pipeline } = ghl;
  const visibles = filtro ? leads.filter(l => l.etapaId === filtro) : leads;
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Users size={16} style={{ color: C }} /> Lista de marcación {pipeline && <span style={{ color: '#52525b', fontWeight: 400, fontSize: '0.75rem' }}>· {pipeline}</span>}
        </h3>
        {cargado && (
          <button onClick={cargar} disabled={cargando} title="Actualizar desde GHL"
            style={{ background: 'none', border: 'none', color: C, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', fontWeight: 700, fontFamily: 'inherit' }}>
            <RefreshCw size={13} /> Actualizar
          </button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: '0.78rem', color: '#fca5a5', marginBottom: '0.5rem' }}>
          {error} <button onClick={cargar} style={{ background: 'none', border: 'none', color: C, textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}>reintentar</button>
        </div>
      )}

      {!cargado && !cargando && !error && (
        <button onClick={cargar}
          style={{ width: '100%', padding: '0.875rem', borderRadius: '10px', border: 'none', background: C, color: '#000', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
          Cargar mis leads de GHL
        </button>
      )}
      {cargando && <div style={{ color: '#52525b', fontSize: '0.82rem', padding: '1rem 0', textAlign: 'center' }}>Trayendo tus leads de GHL...</div>}

      {cargado && (
        <>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <Chip activo={filtro === ''} onClick={() => setFiltro('')} label={`Todas (${leads.length})`} />
            {stages.map(s => {
              const n = leads.filter(l => l.etapaId === s.id).length;
              if (n === 0) return null;
              return <Chip key={s.id} activo={filtro === s.id} onClick={() => setFiltro(s.id)} label={`${s.name} (${n})`} />;
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '420px', overflowY: 'auto' }}>
            {visibles.slice(0, 150).map(l => {
              const llamado = l.contactId && llamadosIds.has(l.contactId);
              const activo = l.id === leadActualId;
              return (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', background: activo ? `${C}1a` : '#0a0a0a', borderRadius: '8px', border: activo ? `1px solid ${C}55` : '1px solid transparent', opacity: llamado ? 0.5 : 1 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.82rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {llamado && '✓ '}{l.nombre}
                      {l.contactId && intentos[l.contactId] > 0 && (
                        <span style={{ marginLeft: '0.4rem', fontSize: '0.62rem', fontWeight: 700, color: intentos[l.contactId] >= 7 ? '#ef4444' : '#06b6d4', background: intentos[l.contactId] >= 7 ? 'rgba(239,68,68,0.12)' : 'rgba(6,182,212,0.12)', padding: '0.05rem 0.4rem', borderRadius: '999px' }}>
                          {intentos[l.contactId]} intento{intentos[l.contactId] > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.66rem', color: '#52525b' }}>{l.telefono || 'sin teléfono'}{!filtro && ` · ${l.etapa}`}</div>
                  </div>
                  <button onClick={() => onFicha(l)} title="Ver ficha"
                    style={{ flexShrink: 0, background: 'none', border: 'none', color: '#52525b', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}>
                    <FileText size={15} />
                  </button>
                  <button onClick={() => onPick(l)}
                    style={{ flexShrink: 0, padding: '0.35rem 0.7rem', borderRadius: '7px', border: 'none', background: activo ? C : '#1f2937', color: activo ? '#000' : '#fff', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {activo ? 'Elegido' : 'Marcar'}
                  </button>
                </div>
              );
            })}
            {visibles.length > 150 && (
              <div style={{ fontSize: '0.7rem', color: '#52525b', textAlign: 'center', padding: '0.5rem' }}>
                +{visibles.length - 150} más. Filtra por etapa para verlos.
              </div>
            )}
            {visibles.length === 0 && <div style={{ fontSize: '0.78rem', color: '#52525b', textAlign: 'center', padding: '1rem' }}>No hay leads en esta etapa.</div>}
          </div>
        </>
      )}
    </div>
  );
};

const DESENLACE_LABEL: Record<string, string> = {
  agendado: '✅ Agendado', reagendado: '🔄 Re-agendado', descalificado: '❌ Descalificado', colgo: '📴 Colgó', no_contesto: '📵 No contestó',
};

const FichaContacto: React.FC<{ lead: GhlLead; ghl: ReturnType<typeof useGHL>; historial: ProdLlamada[]; onClose: () => void }> = ({ lead, ghl, historial, onClose }) => {
  const [c, setC] = useState<{ empresa?: string; email?: string; campos?: Record<string, string> } | null>(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try { const d = await ghl.traerContacto(lead.contactId); if (vivo) setC(d); }
      catch { /* ignora */ } finally { if (vivo) setCargando(false); }
    })();
    return () => { vivo = false; };
  }, [lead, ghl]);
  const hist = [...historial].sort((a, b) => b.inicio.localeCompare(a.inicio));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem' }} onClick={onClose}>
      <div className="card" style={{ width: '520px', maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto', border: `1px solid ${C}44` }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>{lead.nombre}</h3>
            <div style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{lead.telefono || 'sin teléfono'} · {lead.etapa}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {/* Datos en GHL */}
        <div className="card" style={{ padding: '0.875rem', background: '#0d0d0d', marginBottom: '0.875rem' }}>
          <div style={{ fontSize: '0.62rem', color: C, textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.4rem' }}>En GoHighLevel</div>
          {cargando ? <div style={{ color: '#52525b', fontSize: '0.78rem' }}>Cargando datos de GHL...</div> : c ? (
            <div style={{ fontSize: '0.78rem', color: '#a0aec0', lineHeight: 1.7 }}>
              {c.empresa && <div><b style={{ color: '#e4e4e7' }}>Empresa:</b> {c.empresa}</div>}
              {c.email && <div><b style={{ color: '#e4e4e7' }}>Email:</b> {c.email}</div>}
              {c.campos && Object.entries(c.campos).map(([k, v]) => <div key={k}><b style={{ color: '#e4e4e7' }}>{k}:</b> {v}</div>)}
              {(!c.empresa && !c.email && (!c.campos || Object.keys(c.campos).length === 0)) && <div style={{ color: '#52525b' }}>Sin datos guardados aún.</div>}
            </div>
          ) : <div style={{ color: '#52525b', fontSize: '0.78rem' }}>No se pudo cargar GHL.</div>}
        </div>

        {/* Historial de llamadas */}
        <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>
          Historial de llamadas ({hist.length})
        </div>
        {hist.length === 0 ? (
          <div style={{ color: '#52525b', fontSize: '0.8rem' }}>Aún no le has llamado (registrado aquí).</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {hist.map(h => (
              <div key={h.id} style={{ padding: '0.6rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                  <span style={{ fontWeight: 700, color: '#e4e4e7' }}>{DESENLACE_LABEL[h.desenlace] || h.desenlace}</span>
                  <span style={{ color: '#52525b' }}>{new Date(h.inicio).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} {new Date(h.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                {h.cualif?.notas && <div style={{ fontSize: '0.72rem', color: '#a0aec0', marginTop: '0.3rem', whiteSpace: 'pre-wrap' }}>{h.cualif.notas}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const Chip: React.FC<{ activo: boolean; onClick: () => void; label: string }> = ({ activo, onClick, label }) => (
  <button onClick={onClick}
    style={{ padding: '0.3rem 0.7rem', borderRadius: '999px', border: activo ? `1px solid ${C}` : '1px solid #2a2a2a', background: activo ? `${C}22` : 'transparent', color: activo ? C : '#a1a1aa', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'inherit' }}>
    {label}
  </button>
);

const HistorialRondas: React.FC<{ sesiones: any[]; llamadas: ProdLlamada[]; onBorrar: (id: string) => Promise<void> }> = ({ sesiones, llamadas, onBorrar }) => {
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const rondas = sesiones.filter(s => s.fin).slice(0, 12);
  if (rondas.length === 0) return null;
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.875rem' }}>Últimas rondas</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {rondas.map(s => {
          const lls = llamadas.filter(l => l.sesionId === s.id);
          const ag = lls.filter(l => l.desenlace === 'agendado').length;
          const dur = s.fin ? (new Date(s.fin).getTime() - new Date(s.inicio).getTime()) / 1000 : 0;
          return (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#0a0a0a', borderRadius: '8px', fontSize: '0.78rem', gap: '0.75rem' }}>
              <span style={{ color: '#a0aec0', flexShrink: 0 }}>{new Date(s.inicio).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} · {new Date(s.inicio).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#52525b' }}>
                <span>{lls.length} llam.</span>
                <span style={{ color: '#10b981', fontWeight: 700 }}>{ag} agend.</span>
                <span>{fmtTimer(dur)}</span>
                {borrandoId === s.id ? (
                  <button onClick={async () => { await onBorrar(s.id); setBorrandoId(null); }}
                    style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.15rem 0.45rem', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    ¿Seguro?
                  </button>
                ) : (
                  <button onClick={() => setBorrandoId(s.id)} title="Borrar ronda"
                    style={{ background: 'none', border: 'none', color: '#3f3f46', cursor: 'pointer', padding: '0.15rem', display: 'flex' }}>
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
