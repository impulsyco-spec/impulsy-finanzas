import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Megaphone, TrendingUp, Users, Crosshair } from 'lucide-react';
import { useLedger } from '../../hooks/useLedger';
import { useSupabaseData } from '../../hooks/useSupabaseData';
import { hoyISO, fechaISO } from '../../lib/dates';
import { ORIGEN_LABELS, OrigenCliente } from '../../types';

const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => {
  const abs = Math.abs(v); const s = v < 0 ? '−' : '';
  if (abs >= 1_000_000) return s + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return s + '$' + (abs / 1_000).toFixed(0) + 'K';
  return s + fmt(abs);
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
  const hoyStr = hoyISO();
  const [desde, setDesde] = useState(hoyStr.slice(0, 7) + '-01');
  const [hasta, setHasta] = useState(hoyStr);

  // Ventana del período seleccionado
  const { inicio, fin } = useMemo(() => {
    const h = new Date();
    if (periodo === 'mes')       return { inicio: hoyStr.slice(0, 7) + '-01', fin: hoyStr };
    if (periodo === 'trimestre') return { inicio: fechaISO(new Date(h.getFullYear(), h.getMonth() - 2, 1)), fin: hoyStr };
    if (periodo === 'año')       return { inicio: `${h.getFullYear()}-01-01`, fin: hoyStr };
    if (periodo === 'personalizado') return { inicio: desde || '2000-01-01', fin: hasta || hoyStr };
    return { inicio: '2000-01-01', fin: hoyStr };
  }, [periodo, hoyStr, desde, hasta]);

  const enPeriodo = (fecha: string) => fecha >= inicio && fecha <= fin;

  // Primera inversión publicitaria REGISTRADA (histórica, sin filtro de período):
  // todo proyecto iniciado ANTES de esa fecha no puede atribuirse a las campañas
  // medidas aquí — viene de inversión publicitaria vieja no registrada.
  const primeraPauta = useMemo(() => {
    const fechas = movements
      .filter(m => m.categoria === 'Ads Paid Media' && m.naturaleza === 'egreso' && m.estado === 'confirmado')
      .map(m => m.fecha)
      .sort();
    return fechas[0] || null;
  }, [movements]);

  // ── Inversión publicitaria: categoría "Ads Paid Media" confirmada ──
  const movsAds = useMemo(() =>
    movements.filter(m => m.categoria === 'Ads Paid Media' && m.naturaleza === 'egreso' && m.estado === 'confirmado' && enPeriodo(m.fecha)),
  [movements, inicio, fin]);
  const inversionAds = movsAds.reduce((s, m) => s + m.valor, 0);

  // ── Por origen: ingresos, gastos de proyecto y clientes nuevos del período ──
  // Regla de atribución: ingresos de clientes 📣 solo cuentan como "Campañas"
  // si el proyecto inició DESPUÉS de la primera pauta registrada; si no, van
  // al bucket "histórico" (inversión publicitaria vieja, fuera del ROAS).
  const datos = useMemo(() => {
    const projPorId: Record<string, { clientId: string; startDate?: string; name: string }> = {};
    projects.forEach(p => { projPorId[p.id] = { clientId: p.clientId, startDate: p.startDate ? p.startDate.slice(0, 10) : undefined, name: p.name }; });
    const clientePorId: Record<string, { origen: string; createdAt?: string; name: string }> = {};
    clients.forEach(c => { clientePorId[c.id] = { origen: c.origen || 'sin', createdAt: c.createdAt, name: c.name }; });

    const base = () => ({ ingresos: 0, gastosProyectos: 0, clientesNuevos: 0, proyectos: {} as Record<string, { nombre: string; cliente: string; ingresos: number }> });
    const porOrigen: Record<string, ReturnType<typeof base>> = {
      campanas: base(), referido: base(), organico: base(), campHist: base(), sin: base(),
    };

    // ¿Este ingreso de un cliente de campañas es atribuible a la pauta registrada?
    const esAtribuible = (projId?: string, clientId?: string) => {
      if (!primeraPauta) return false;
      const fechaRef = projId
        ? projPorId[projId]?.startDate
        : (clientId ? clientePorId[clientId]?.createdAt : undefined);
      // sin fecha de referencia no se puede probar atribución → histórico
      return fechaRef != null && fechaRef >= primeraPauta;
    };

    for (const m of movements) {
      if (m.estado !== 'confirmado' || !enPeriodo(m.fecha)) continue;
      const clientId = m.clientId || (m.projectId ? projPorId[m.projectId]?.clientId : undefined);
      if (!clientId) continue;
      let origen = clientePorId[clientId]?.origen || 'sin';
      if (origen === 'campanas' && !esAtribuible(m.projectId, clientId)) origen = 'campHist';
      const o = porOrigen[origen];
      if (!o) continue;
      if (m.naturaleza === 'ingreso') {
        o.ingresos += m.valor;
        const projId = m.projectId || 'directo:' + clientId;
        if (!o.proyectos[projId]) {
          const proj = m.projectId ? projPorId[m.projectId] : null;
          o.proyectos[projId] = { nombre: proj?.name || `Directo — ${clientePorId[clientId]?.name || 'cliente'}`, cliente: clientePorId[clientId]?.name || '', ingresos: 0 };
        }
        o.proyectos[projId].ingresos += m.valor;
      } else if (m.naturaleza === 'egreso' && m.categoria !== 'Ads Paid Media') {
        // costos de entrega asignados a proyectos/clientes (sin doble contar la pauta)
        o.gastosProyectos += m.valor;
      }
    }

    clients.forEach(c => {
      if (!c.createdAt || !enPeriodo(c.createdAt)) return;
      let origen = c.origen || 'sin';
      // cliente de campañas agregado antes de la primera pauta = histórico
      if (origen === 'campanas' && (!primeraPauta || c.createdAt < primeraPauta)) origen = 'campHist';
      porOrigen[origen].clientesNuevos += 1;
    });

    return porOrigen;
  }, [movements, clients, projects, inicio, fin, primeraPauta]);

  const camp = datos.campanas;
  const roas = inversionAds > 0 ? camp.ingresos / inversionAds : null;
  const utilidadCamp = camp.ingresos - camp.gastosProyectos - inversionAds;
  const roi  = inversionAds > 0 ? (utilidadCamp / inversionAds) * 100 : null;
  const cac  = inversionAds > 0 && camp.clientesNuevos > 0 ? inversionAds / camp.clientesNuevos : null;

  const totalIngresos = Object.values(datos).reduce((s, o) => s + o.ingresos, 0);
  const sinClasificar = clients.filter(c => !c.origen).length;

  if (loadLedger || loadData) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Calculando adquisición...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingBottom: '3rem' }}>
      {/* Header + filtro de período */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>📈 Adquisición</h1>
          <p style={{ color: '#52525b', fontSize: '0.8rem', marginTop: '0.15rem' }}>¿Está funcionando tu marketing? ROAS, ROI y CAC sobre datos reales.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
          ⚠ Tienes <b>{sinClasificar} cliente(s) sin origen asignado</b> — sus ingresos no entran al ROAS. Clasifícalos en Proyectos y Clientes → 👥 Clientes (selector "Origen…").
        </div>
      )}

      {/* KPIs principales */}
      <div className="resp-grid-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.875rem' }}>
        {[
          { label: 'Inversión en Ads', value: fmtK(inversionAds), color: '#a855f7', icon: <Megaphone size={13} />, hint: `${movsAds.length} pago(s) "Ads Paid Media"` },
          { label: 'Ingresos Campañas', value: fmtK(camp.ingresos), color: '#10b981', icon: <TrendingUp size={13} />, hint: 'clientes 📣 en el período' },
          { label: 'ROAS', value: roas != null ? roas.toFixed(2) + 'x' : '—', color: roas == null ? '#71717a' : roas >= 3 ? '#10b981' : roas >= 1 ? '#f59e0b' : '#ef4444', icon: <Crosshair size={13} />, hint: primeraPauta ? `solo proyectos desde ${new Date(primeraPauta + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: '2-digit' })} (1ª pauta)` : 'sin pauta registrada' },
          { label: 'ROI Campañas', value: roi != null ? roi.toFixed(0) + '%' : '—', color: roi == null ? '#71717a' : roi >= 100 ? '#10b981' : roi >= 0 ? '#f59e0b' : '#ef4444', icon: null, hint: '(utilidad − pauta) ÷ pauta' },
          { label: 'CAC', value: cac != null ? fmtK(cac) : '—', color: '#06b6d4', icon: <Users size={13} />, hint: cac != null ? `${camp.clientesNuevos} cliente(s) nuevos de campañas` : 'sin clientes nuevos de 📣 en el período' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>{s.icon}{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.35rem' }}>{s.value}</span>
            <span style={{ fontSize: '0.6rem', color: '#52525b', display: 'block', marginTop: '0.1rem' }}>{s.hint}</span>
          </div>
        ))}
      </div>

      {/* Desglose por origen — métricas cruzadas desplegables */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.35rem' }}>¿De dónde viene tu plata? — {PERIODOS.find(p => p.id === periodo)?.label}</h3>
        <p style={{ fontSize: '0.72rem', color: '#52525b', marginBottom: '1rem' }}>Toca cada origen para ver los proyectos que lo componen.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {([
            ...(Object.entries(ORIGEN_LABELS) as [string, { label: string; emoji: string; color: string }][]),
            ...(datos.campHist.ingresos > 0 || datos.campHist.clientesNuevos > 0
              ? [['campHist', { label: 'Campañas (histórico)', emoji: '🕰', color: '#71717a' }] as [string, { label: string; emoji: string; color: string }]]
              : []),
          ]).map(([key, o]) => {
            const d = datos[key];
            const pct = totalIngresos > 0 ? (d.ingresos / totalIngresos) * 100 : 0;
            const abierto = expandido === key;
            const proyectos = Object.values(d.proyectos).sort((a, b) => b.ingresos - a.ingresos);
            return (
              <div key={key} style={{ background: '#0d0d0d', borderRadius: '10px', border: `1px solid ${abierto ? o.color + '44' : '#1a1a1a'}` }}>
                <div onClick={() => setExpandido(abierto ? null : key)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.75rem 1rem', cursor: 'pointer' }}>
                  <span style={{ fontSize: '1.1rem' }}>{o.emoji}</span>
                  <div style={{ minWidth: '90px' }}>
                    <div style={{ color: o.color, fontWeight: 700, fontSize: '0.85rem' }}>{o.label}</div>
                    <div style={{ fontSize: '0.62rem', color: '#52525b' }}>{d.clientesNuevos} nuevo(s) · {proyectos.length} proyecto(s)</div>
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
                      <div style={{ fontSize: '0.78rem', color: '#52525b', textAlign: 'center', padding: '0.5rem' }}>Sin ingresos de este origen en el período.</div>
                    )}
                    {proyectos.map(p => (
                      <div key={p.nombre} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.75rem', background: '#0a0a0a', borderRadius: '8px' }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontSize: '0.8rem', color: '#e4e4e7' }}>{p.nombre}</span>
                          {p.cliente && <span style={{ fontSize: '0.65rem', color: '#52525b', marginLeft: '0.5rem' }}>{p.cliente}</span>}
                        </div>
                        <span style={{ fontWeight: 700, color: o.color, fontSize: '0.82rem' }}>{fmt(p.ingresos)}</span>
                      </div>
                    ))}
                    {key === 'campHist' && (
                      <div style={{ fontSize: '0.68rem', color: '#71717a', padding: '0.4rem 0.75rem', background: '#111', borderRadius: '8px', lineHeight: 1.5 }}>
                        Proyectos de clientes 📣 iniciados <b>antes</b> de tu primera pauta registrada
                        {primeraPauta && ` (${new Date(primeraPauta + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })})`} —
                        vienen de inversión publicitaria vieja, por eso no entran al ROAS ni al ROI.
                      </div>
                    )}
                    {key === 'campanas' && proyectos.length > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#111', borderRadius: '8px', borderTop: '1px solid #222', fontSize: '0.75rem' }}>
                        <span style={{ color: '#71717a' }}>Ingresos {fmtK(d.ingresos)} − costos de entrega {fmtK(d.gastosProyectos)} − pauta {fmtK(inversionAds)}</span>
                        <span style={{ color: utilidadCamp >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>Utilidad real: {fmtK(utilidadCamp)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inversión publicitaria del período — detalle */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <h3 style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.75rem' }}>
          Inversión publicitaria — {PERIODOS.find(p => p.id === periodo)?.label} <span style={{ color: '#a855f7' }}>({fmt(inversionAds)})</span>
        </h3>
        {movsAds.length === 0 ? (
          <div style={{ color: '#52525b', fontSize: '0.82rem', textAlign: 'center', padding: '1.25rem 0' }}>
            Sin gastos en "Ads Paid Media" en este período. Regístralos en Finanzas → Movimientos con esa categoría y aparecerán aquí automáticamente.
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

      {/* Cómo se calcula (transparencia del método) */}
      <div className="card" style={{ padding: '1rem 1.25rem', border: '1px solid #1f2937' }}>
        <div style={{ fontSize: '0.7rem', color: '#52525b', lineHeight: 1.8 }}>
          <b style={{ color: '#71717a' }}>Método:</b> ROAS = ingresos confirmados de clientes 📣 Campañas ÷ gasto "Ads Paid Media" (solo pauta — estándar de industria).
          · ROI = (ingresos 📣 − gastos asignados a sus proyectos − pauta) ÷ pauta (no incluye software/infraestructura: son costos compartidos que ya mide tu Margen).
          · CAC = pauta ÷ clientes nuevos 📣 del período (por fecha de creación del cliente).
          · Las renovaciones de un cliente de campañas siguen contando como ingresos de campañas: ese es el valor real de haberlo adquirido.
          · <b style={{ color: '#71717a' }}>Regla de atribución:</b> solo cuentan al ROAS los proyectos iniciados después de la primera pauta registrada en movimientos — lo anterior es inversión histórica (🕰) y se muestra aparte.
        </div>
      </div>
    </div>
  );
};
