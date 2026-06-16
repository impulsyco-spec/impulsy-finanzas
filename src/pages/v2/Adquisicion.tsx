import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Megaphone, TrendingUp, Users, Crosshair, Repeat, Gem } from 'lucide-react';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { hoyISO, fechaISO } from '../../lib/dates';
import { ORIGEN_LABELS } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => {
  const abs = Math.abs(v); const s = v < 0 ? '−' : '';
  if (abs >= 1_000_000) return s + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return s + '$' + (abs / 1_000).toFixed(0) + 'K';
  return s + fmt(abs);
};
// ROAS / LTV:CAC como proporción "X : 1"
const fmtRatio = (r: number | null) => {
  if (r == null) return '—';
  if (r >= 10) return Math.round(r) + ' : 1';
  return r.toFixed(1) + ' : 1';
};

type Periodo = 'mes' | 'trimestre' | 'año' | 'todo' | 'personalizado';
const PERIODOS: { id: Periodo; label: string }[] = [
  { id: 'mes',       label: 'Este mes' },
  { id: 'trimestre', label: 'Últimos 3 meses' },
  { id: 'año',       label: `Año ${new Date().getFullYear()}` },
  { id: 'todo',      label: 'Todo' },
  { id: 'personalizado', label: '📅 Fechas' },
];

export const Adquisicion: React.FC = () => {
  const { movements, loading: loadLedger } = useLedger();
  const { clients, projects, loading: loadData } = useSupabaseData();
  const [periodo, setPeriodo] = useState<Periodo>('año');
  const [expandido, setExpandido] = useState<string | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const hoyStr = hoyISO();
  const [desde, setDesde] = useState(hoyStr.slice(0, 7) + '-01');
  const [hasta, setHasta] = useState(hoyStr);

  const { inicio, fin } = useMemo(() => {
    const h = new Date();
    if (periodo === 'mes')       return { inicio: hoyStr.slice(0, 7) + '-01', fin: hoyStr };
    if (periodo === 'trimestre') return { inicio: fechaISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), fin: hoyStr };
    if (periodo === 'año')       return { inicio: `${h.getFullYear()}-01-01`, fin: hoyStr };
    if (periodo === 'personalizado') return { inicio: desde || '2000-01-01', fin: hasta || hoyStr };
    return { inicio: '2000-01-01', fin: hoyStr };
  }, [periodo, hoyStr, desde, hasta]);

  // Primera pauta registrada (global): línea de corte de atribución histórica
  const primeraPauta = useMemo(() => {
    const fechas = movements
      .filter(m => m.categoria === 'Ads Paid Media' && m.naturaleza === 'egreso' && m.estado === 'confirmado')
      .map(m => m.fecha).sort();
    return fechas[0] || null;
  }, [movements]);

  // Inversión publicitaria del período (por fecha del gasto)
  const movsAds = useMemo(() =>
    movements.filter(m => m.categoria === 'Ads Paid Media' && m.naturaleza === 'egreso' && m.estado === 'confirmado' && m.fecha >= inicio && m.fecha <= fin),
  [movements, inicio, fin]);
  const inversionAds = movsAds.reduce((s, m) => s + m.valor, 0);

  // ── Unidades de adquisición: cada proyecto + cada cliente con ingresos directos ──
  // Modelo de COHORTE: cada unidad se ancla a su fecha de adquisición, NO a la
  // fecha del pago. Sus ingresos = TODOS sus pagos de toda la vida (confirmados).
  const unidades = useMemo(() => {
    const cli: Record<string, { name: string; origen?: string; createdAt?: string }> = {};
    clients.forEach(c => { cli[c.id] = { name: c.name, origen: c.origen, createdAt: c.createdAt }; });

    const ingProj: Record<string, number> = {};
    const cosProj: Record<string, number> = {};
    const ingDirecto: Record<string, number> = {};
    for (const m of movements) {
      if (m.estado !== 'confirmado') continue;
      if (m.naturaleza === 'ingreso') {
        if (m.projectId) ingProj[m.projectId] = (ingProj[m.projectId] || 0) + m.valor;
        else if (m.clientId) ingDirecto[m.clientId] = (ingDirecto[m.clientId] || 0) + m.valor;
      } else if (m.naturaleza === 'egreso' && m.categoria !== 'Ads Paid Media') {
        if (m.projectId) cosProj[m.projectId] = (cosProj[m.projectId] || 0) + m.valor;
      }
    }

    type U = { id: string; nombre: string; clientId: string; cliente: string; origen: string; fechaAdq?: string; ingresos: number; costos: number };
    const out: U[] = [];

    projects.forEach(p => {
      const c = cli[p.clientId];
      const origenBase = p.origen || c?.origen || 'sin';
      const fechaAdq = (p.startDate ? p.startDate.slice(0, 10) : undefined) || c?.createdAt;
      let origen = origenBase;
      if (origenBase === 'campanas' && (!fechaAdq || !primeraPauta || fechaAdq < primeraPauta)) origen = 'campHist';
      out.push({ id: p.id, nombre: p.name, clientId: p.clientId, cliente: c?.name || '', origen, fechaAdq, ingresos: ingProj[p.id] || 0, costos: cosProj[p.id] || 0 });
    });

    Object.entries(ingDirecto).forEach(([clientId, ing]) => {
      const c = cli[clientId];
      const origenBase = c?.origen || 'sin';
      const fechaAdq = c?.createdAt;
      let origen = origenBase;
      if (origenBase === 'campanas' && (!fechaAdq || !primeraPauta || fechaAdq < primeraPauta)) origen = 'campHist';
      out.push({ id: 'dir:' + clientId, nombre: `Directo — ${c?.name || 'cliente'}`, clientId, cliente: c?.name || '', origen, fechaAdq, ingresos: ing, costos: 0 });
    });

    return out;
  }, [movements, clients, projects, primeraPauta]);

  const enCohorte = (fechaAdq?: string) => fechaAdq != null && fechaAdq >= inicio && fechaAdq <= fin;

  // ── KPIs de campañas (cohorte adquirida en el período) ──
  const campCohorte = unidades.filter(u => u.origen === 'campanas' && enCohorte(u.fechaAdq));
  const ingresosCohorte = campCohorte.reduce((s, u) => s + u.ingresos, 0);
  const costosCohorte = campCohorte.reduce((s, u) => s + u.costos, 0);
  const clientesNuevos = new Set(campCohorte.map(u => u.clientId)).size;
  const utilidadCohorte = ingresosCohorte - costosCohorte - inversionAds;

  const roas = inversionAds > 0 ? ingresosCohorte / inversionAds : null;
  const roi  = inversionAds > 0 ? (utilidadCohorte / inversionAds) * 100 : null;
  const cac  = inversionAds > 0 && clientesNuevos > 0 ? inversionAds / clientesNuevos : null;

  // ── LTV (histórico, no depende del período): valor de vida por cliente de campañas ──
  const { ltv, nClientesLtv } = useMemo(() => {
    const porCliente: Record<string, number> = {};
    unidades.filter(u => u.origen === 'campanas').forEach(u => {
      porCliente[u.clientId] = (porCliente[u.clientId] || 0) + u.ingresos;
    });
    const ids = Object.keys(porCliente);
    if (ids.length === 0) return { ltv: null as number | null, nClientesLtv: 0 };
    return { ltv: ids.reduce((s, id) => s + porCliente[id], 0) / ids.length, nClientesLtv: ids.length };
  }, [unidades]);
  const ltvCac = ltv != null && cac != null && cac > 0 ? ltv / cac : null;

  // ── Desglose por origen (cohorte del período) ──
  const desglose = useMemo(() => {
    const base = () => ({ ingresos: 0, clientesNuevos: new Set<string>(), proyectos: [] as { nombre: string; cliente: string; ingresos: number }[] });
    const map: Record<string, ReturnType<typeof base>> = {
      campanas: base(), referido: base(), organico: base(), campHist: base(), sin: base(),
    };
    unidades.filter(u => enCohorte(u.fechaAdq)).forEach(u => {
      const o = map[u.origen]; if (!o) return;
      o.ingresos += u.ingresos;
      o.clientesNuevos.add(u.clientId);
      if (u.ingresos > 0) o.proyectos.push({ nombre: u.nombre, cliente: u.cliente, ingresos: u.ingresos });
    });
    return map;
  }, [unidades, inicio, fin]);

  const totalIngresos = Object.values(desglose).reduce((s, o) => s + o.ingresos, 0);
  const sinClasificar = clients.filter(c => !c.origen).length;
  const periodoLabel = PERIODOS.find(p => p.id === periodo)?.label || '';

  // Explicaciones del glosario (estilo "Ver diagnóstico" de Inicio)
  const INSIGHTS: Record<string, string> = {
    inversion: 'Lo que gastaste en pauta (Meta, Google, TikTok) en el período. Es la semilla que siembras para atraer clientes.',
    ingresos:  'Todo lo que han pagado —en toda su relación contigo— los clientes que ADQUIRISTE con pauta en este período. La cosecha de esa semilla, aunque paguen meses después.',
    roas:      'Por cada $1 de pauta, cuántos pesos en ventas regresaron. 4 : 1 = entran $4 por cada $1 invertido. Meta sana de agencia: 3 : 1 o más. Es el rendimiento bruto de tu inversión.',
    roi:       'El ROAS mira ventas; el ROI mira GANANCIA real: resta lo que costó entregar el servicio y la pauta. Puedes tener buen ROAS y flojo ROI si entregar sale caro.',
    cac:       'Costo de Adquisición: cuánto te cuesta conseguir UN cliente nuevo por pauta. Gastas $1M y cierras 2 → CAC $500K.',
    ltv:       'Valor de Vida: lo que un cliente de pauta te deja en TODA su relación (pagos + renovaciones). Histórico, no del período. El cliente que cuesta $500K y deja $5M es oro.',
    ltvcac:    'La métrica reina: cuánto te devuelve un cliente por cada peso que costó traerlo. Bajo 1 : 1 pierdes; sano 3 : 1+. Si es 10 : 1, escala la pauta sin miedo.',
  };

  if (loadLedger || loadData) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Calculando adquisición...</div>;

  const kpis = [
    { id: 'inversion', label: 'Inversión en Ads', value: fmtK(inversionAds), color: '#a855f7', icon: <Megaphone size={13} />, hint: `${movsAds.length} pago(s) "Ads Paid Media"` },
    { id: 'ingresos',  label: 'Ingresos de la cohorte', value: fmtK(ingresosCohorte), color: '#10b981', icon: <TrendingUp size={13} />, hint: 'todo lo que pagan los clientes 📣 captados en el período' },
    { id: 'roas',      label: 'ROAS', value: fmtRatio(roas), color: roas == null ? '#71717a' : roas >= 3 ? '#10b981' : roas >= 1 ? '#f59e0b' : '#ef4444', icon: <Crosshair size={13} />, hint: 'retorno por cada $1 de pauta · meta 3 : 1+' },
    { id: 'roi',       label: 'ROI Campañas', value: roi != null ? roi.toFixed(0) + '%' : '—', color: roi == null ? '#71717a' : roi >= 100 ? '#10b981' : roi >= 0 ? '#f59e0b' : '#ef4444', icon: null, hint: 'ganancia real sobre la pauta' },
    { id: 'cac',       label: 'CAC', value: cac != null ? fmtK(cac) : '—', color: '#06b6d4', icon: <Users size={13} />, hint: cac != null ? `${clientesNuevos} cliente(s) nuevos de 📣` : 'sin clientes nuevos de 📣 en el período' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      {/* Header + filtro */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>📈 Adquisición</h1>
          <p style={{ color: '#52525b', fontSize: '0.8rem', marginTop: '0.15rem' }}>¿Está funcionando tu marketing? ROAS, ROI, CAC y LTV sobre datos reales.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => setShowInsights(v => !v)}
            style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${showInsights ? '#a855f7' : '#2a2a2a'}`, background: showInsights ? '#a855f714' : 'transparent', color: showInsights ? '#a855f7' : '#52525b', cursor: 'pointer', fontFamily: 'inherit' }}>
            {showInsights ? '◉ Ocultar explicación' : '○ Ver explicación'}
          </button>
          <div style={{ display: 'flex', gap: '0.3rem', background: '#111', padding: '0.2rem', borderRadius: '10px' }}>
            {PERIODOS.map(p => (
              <button key={p.id} onClick={() => setPeriodo(p.id)}
                style={{ padding: '0.4rem 0.875rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: periodo === p.id ? '#fff' : 'transparent', color: periodo === p.id ? '#000' : '#71717a', transition: 'all 0.15s' }}>
                {p.label}
              </button>
            ))}
          </div>
          {periodo === 'personalizado' && (
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.78rem', fontFamily: 'inherit' }} />
              <span style={{ color: '#52525b', fontSize: '0.78rem' }}>→</span>
              <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                style={{ background: '#1a1a1a', border: '1px solid #333', color: '#fff', padding: '0.4rem 0.6rem', borderRadius: '8px', fontSize: '0.78rem', fontFamily: 'inherit' }} />
            </div>
          )}
        </div>
      </div>

      {sinClasificar > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', padding: '0.7rem 1rem', fontSize: '0.8rem', color: '#f59e0b' }}>
          ⚠ Tienes <b>{sinClasificar} cliente(s) sin origen asignado</b> — no entran al ROAS. Clasifícalos en Proyectos y Clientes → 👥 Clientes.
        </div>
      )}

      {/* KPIs del período */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.875rem' }}>
        {kpis.map(s => (
          <div key={s.id} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{s.icon}{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.35rem' }}>{s.value}</span>
            <span style={{ fontSize: '0.6rem', color: '#52525b', display: 'block', marginTop: '0.1rem' }}>{s.hint}</span>
            {showInsights && INSIGHTS[s.id] && (
              <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #1f1f1f', fontSize: '0.66rem', color: '#a855f7', lineHeight: 1.5 }}>
                {INSIGHTS[s.id]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Valor de vida del cliente (global, histórico) */}
      <div className="card" style={{ padding: '1.25rem', border: '1px solid #14b8a633', background: 'linear-gradient(135deg, rgba(20,184,166,0.05), transparent)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Gem size={15} style={{ color: '#14b8a6' }} />
          <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>Valor de vida del cliente <span style={{ fontSize: '0.65rem', color: '#52525b', fontWeight: 600 }}>· histórico, no depende del filtro</span></h3>
        </div>
        <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}><Repeat size={11} /> LTV promedio</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#14b8a6' }}>{ltv != null ? fmtK(ltv) : '—'}</div>
            <div style={{ fontSize: '0.62rem', color: '#52525b' }}>{nClientesLtv} cliente(s) 📣 en su vida completa</div>
            {showInsights && <div style={{ marginTop: '0.4rem', fontSize: '0.66rem', color: '#14b8a6', lineHeight: 1.5 }}>{INSIGHTS.ltv}</div>}
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>CAC (período)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#06b6d4' }}>{cac != null ? fmtK(cac) : '—'}</div>
            <div style={{ fontSize: '0.62rem', color: '#52525b' }}>costo de traer un cliente</div>
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', color: '#52525b', textTransform: 'uppercase', fontWeight: 700 }}>Relación LTV : CAC</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: ltvCac == null ? '#71717a' : ltvCac >= 3 ? '#10b981' : ltvCac >= 1 ? '#f59e0b' : '#ef4444' }}>{fmtRatio(ltvCac)}</div>
            <div style={{ fontSize: '0.62rem', color: ltvCac == null ? '#52525b' : ltvCac >= 3 ? '#10b981' : '#f59e0b' }}>
              {ltvCac == null ? 'falta CAC del período' : ltvCac >= 3 ? 'saludable — puedes escalar' : ltvCac >= 1 ? 'aceptable, vigila' : 'pierdes en cada cliente'}
            </div>
            {showInsights && <div style={{ marginTop: '0.4rem', fontSize: '0.66rem', color: '#14b8a6', lineHeight: 1.5 }}>{INSIGHTS.ltvcac}</div>}
          </div>
        </div>
      </div>

      {/* Desglose por origen (cohorte del período) */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>¿De dónde viene tu plata? — {periodoLabel}</h3>
        <p style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>
          Clientes adquiridos en el período, agrupados por origen. Toca cada uno para ver sus proyectos.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {([
            ...(Object.entries(ORIGEN_LABELS) as [string, { label: string; emoji: string; color: string }][]),
            ...(desglose.campHist.ingresos > 0 || desglose.campHist.clientesNuevos.size > 0
              ? [['campHist', { label: 'Campañas (histórico)', emoji: '🕰', color: '#71717a' }] as [string, { label: string; emoji: string; color: string }]] : []),
          ]).map(([key, o]) => {
            const d = desglose[key];
            const pct = totalIngresos > 0 ? (d.ingresos / totalIngresos) * 100 : 0;
            const abierto = expandido === key;
            const proyectos = [...d.proyectos].sort((a, b) => b.ingresos - a.ingresos);
            return (
              <div key={key} style={{ background: '#0d0d0d', borderRadius: '10px', border: `1px solid ${abierto ? o.color + '44' : '#1a1a1a'}` }}>
                <div onClick={() => setExpandido(abierto ? null : key)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 1rem', cursor: 'pointer' }}>
                  <span style={{ fontSize: '1.1rem' }}>{o.emoji}</span>
                  <div style={{ minWidth: '90px' }}>
                    <div style={{ color: o.color, fontWeight: 700, fontSize: '0.85rem' }}>{o.label}</div>
                    <div style={{ fontSize: '0.62rem', color: '#52525b' }}>{d.clientesNuevos.size} cliente(s) · {proyectos.length} proyecto(s)</div>
                  </div>
                  <div style={{ flex: 1, height: '7px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: o.color, borderRadius: '999px', transition: 'width 0.4s', opacity: 0.85 }} />
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '110px' }}>
                    <div style={{ color: o.color, fontWeight: 800, fontSize: '0.95rem' }}>{fmtK(d.ingresos)}</div>
                    <div style={{ fontSize: '0.62rem', color: '#52525b' }}>{pct.toFixed(0)}% del total</div>
                  </div>
                  {abierto ? <ChevronUp size={15} style={{ color: '#52525b' }} /> : <ChevronDown size={15} style={{ color: '#52525b' }} />}
                </div>
                {abierto && (
                  <div style={{ padding: '0 1rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {proyectos.length === 0 && (
                      <div style={{ fontSize: '0.78rem', color: '#52525b', textAlign: 'center', padding: '0.5rem' }}>Sin clientes de este origen adquiridos en el período.</div>
                    )}
                    {proyectos.map((p, i) => (
                      <div key={p.nombre + i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '0.8rem', color: '#e4e4e7' }}>{p.nombre}</span>
                          {p.cliente && <span style={{ fontSize: '0.65rem', color: '#52525b', marginLeft: '0.5rem' }}>{p.cliente}</span>}
                        </div>
                        <span style={{ fontWeight: 700, color: o.color, fontSize: '0.82rem' }}>{fmt(p.ingresos)}</span>
                      </div>
                    ))}
                    {key === 'campHist' && (
                      <div style={{ fontSize: '0.68rem', color: '#71717a', padding: '0.4rem 0.75rem', background: '#111', borderRadius: '8px', lineHeight: 1.5 }}>
                        Clientes 📣 adquiridos <b>antes</b> de tu primera pauta registrada
                        {primeraPauta && ` (${new Date(primeraPauta + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })})`} —
                        vienen de inversión publicitaria vieja, por eso no entran al ROAS ni al ROI.
                      </div>
                    )}
                    {key === 'campanas' && proyectos.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#111', borderRadius: '8px', borderTop: '1px solid #222', fontSize: '0.75rem' }}>
                        <span style={{ color: '#71717a' }}>Ingresos {fmtK(ingresosCohorte)} − entrega {fmtK(costosCohorte)} − pauta {fmtK(inversionAds)}</span>
                        <span style={{ color: utilidadCohorte >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>Utilidad: {fmtK(utilidadCohorte)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inversión publicitaria del período */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Inversión publicitaria — {periodoLabel} <span style={{ color: '#a855f7' }}>({fmt(inversionAds)})</span>
        </h3>
        {movsAds.length === 0 ? (
          <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1.25rem 0' }}>
            Sin gastos en "Ads Paid Media" en este período. Regístralos en Finanzas → Movimientos con esa categoría.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {[...movsAds].sort((a, b) => b.fecha.localeCompare(a.fecha)).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: '#a0aec0' }}>
                  {new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })} · {m.descripcion}
                </span>
                <span style={{ fontWeight: 700, color: '#a855f7', fontSize: '0.82rem' }}>−{fmt(m.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Método */}
      <div className="card" style={{ padding: '1rem 1.25rem', border: '1px solid #1f2937' }}>
        <div style={{ fontSize: '0.7rem', color: '#52525b', lineHeight: 1.8 }}>
          <b style={{ color: '#71717a' }}>Modelo de cohorte:</b> cada cliente se ancla a su <b>fecha de adquisición</b> (inicio del proyecto o creación del cliente), no a la fecha del pago.
          El ROAS de un período compara la pauta gastada en ese período contra <b>todo</b> lo que pagan —presente y futuro— los clientes captados en ese período.
          Así, un pago de hoy de un cliente captado hace meses suma a la cohorte de <i>su</i> mes (y al LTV), no infla el ROAS de hoy.
          · <b style={{ color: '#71717a' }}>ROAS</b> = ingresos de la cohorte ÷ pauta · <b style={{ color: '#71717a' }}>ROI</b> = (ingresos − entrega − pauta) ÷ pauta · <b style={{ color: '#71717a' }}>CAC</b> = pauta ÷ clientes nuevos · <b style={{ color: '#71717a' }}>LTV</b> = ingreso de vida promedio por cliente 📣.
          · Proyectos iniciados antes de la primera pauta registrada {primeraPauta && `(${new Date(primeraPauta + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })})`} van a histórico (🕰), fuera del ROAS.
        </div>
      </div>
    </div>
  );
};
