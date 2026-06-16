import { useState, useRef, useEffect, useMemo } from 'react';
import { useLedger } from '../hooks/useLedger';
import { useSupabaseData } from '../hooks/useSupabaseData';
import { Bot, X, Send, Settings, ChevronDown, Loader2, RotateCcw, Search } from 'lucide-react';
import type { LedgerMovement, RealAccount, Debt, Project, Client } from '../types';
import { fechaISO } from '../lib/dates';

// ── Config ──────────────────────────────────────────────────────
const OPENAI_MODEL      = 'gpt-4o-mini';
const OPENAI_URL        = 'https://api.openai.com/v1/chat/completions';
const LS_DIRECTIVES_KEY = 'impulsy_advisor_directives';
const LS_HISTORY_KEY    = 'impulsy_advisor_history';
const MAX_HISTORY       = 20;

const DEFAULT_DIRECTIVES = `Actúa como CFO estratégico y asesor financiero senior para Impulsy, una agencia de marketing digital en crecimiento (Colombia).

Tu objetivo: ayudar al fundador a tomar decisiones financieras inteligentes, sostenibles y basadas en datos reales de la app.

MONEDA: Pesos colombianos (COP). Formato: $X.XXX.XXX (puntos como separadores de miles).

CÓMO LEER EL CONTEXTO QUE RECIBES:
- "Caja total" = dinero real disponible hoy en el banco. USA ESTE NÚMERO como base.
- "Comprometida 30d/90d" = egresos pendientes en ese horizonte exacto. La "caja libre (30d)" ya descuenta esos compromisos.
- "ESTE MES" = sección con cobros y egresos del mes en curso, con lista detallada. Úsala cuando pregunten por el mes actual.
- NUNCA inventes una "caja libre" restando todo el "por cobrar" o el total de egresos futuros — eso no es la caja libre real.
- Los cobros "esperados" son ingresos confirmados con clientes pero aún no recibidos. Los "facturados" ya tienen factura enviada.

CUANDO TE PREGUNTEN POR SALARIO / RETIRO DEL FUNDADOR:
1. Base: Caja total actual
2. Resta: Comprometida del mes (gastos fijos recurrentes + egresos comprometidos del mes)
3. Suma: Cobros esperados del mes (si son reales y probables de cobrar)
4. El retiro sano = lo que queda después de cubrir gastos operativos + dejar 1 mes de runway mínimo

PRINCIPIOS DE DECISIÓN:
1. CAJA ES REY — toda decisión se evalúa contra la posición de caja real, no proyectada
2. PRIORIZA SUPERVIVENCIA — nunca recomiendes algo que lleve la caja a menos de 1 mes de runway
3. SÉ ESPECÍFICO — usa los números exactos del contexto, no rangos genéricos
4. DIFERENCIA ENTRE MES ACTUAL Y PROYECCIÓN — si te preguntan por "este mes", usa la sección ESTE MES del contexto

ESTRUCTURA DE RESPUESTA (adapta según la pregunta):
- Para preguntas de salario/retiro: cifra concreta + cálculo + condición
- Para análisis general: diagnóstico breve + 2-3 acciones concretas
- Para preguntas puntuales: respuesta directa en 1-2 párrafos

ESTILO: Directo. Con números reales del contexto en **negrita**. Sin teoría. Sin plantillas rígidas — adapta el formato a la pregunta.

EVITA: Inventar métricas no presentes en el contexto. Respuestas genéricas. Recomendar salarios basados en intuición sin mostrar el cálculo.`;

const SUGGESTIONS = [
  '¿Cómo está la salud financiera de Impulsy hoy?',
  '¿Cuánto puedo retirar este mes sin afectar la operación?',
  '¿Cuáles son mis gastos más altos?',
  '¿Tengo caja suficiente para los próximos 3 meses?',
  'Analiza los ingresos de los últimos 6 meses',
  '¿Cuánto debo y cuándo son los próximos pagos?',
];

// ── Helpers ──────────────────────────────────────────────────────
const fmt = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-CO', { useGrouping: true }).replace(/,/g, '.');

// ── CONTEXTO COMPACTO (predeterminado) ────────────────────────────
function buildCompactContext(
  movements: LedgerMovement[],
  realAccounts: RealAccount[],
  debts: Debt[],
  projects: Project[],
  clients: Client[],
): string {
  const today = new Date();
  const todayStr = fechaISO(today);
  const currentMonth = todayStr.slice(0, 7);
  const lastMonth = fechaISO(new Date(today.getFullYear(), today.getMonth() - 1, 1)).slice(0, 7);

  const confirmed = movements.filter(m => m.estado === 'confirmado');
  const pending   = movements.filter(m => m.estado === 'esperado' || m.estado === 'facturado' || m.estado === 'vencido');

  // ── Caja total real ──────────────────────────────────────────
  const saldoInicial = realAccounts.reduce((s, a) => s + a.saldoInicial, 0);
  const ingTot = confirmed.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const egTot  = confirmed.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
  const cajaTotal = saldoInicial + ingTot - egTot;

  // ── Horizontes temporales ────────────────────────────────────
  const in30 = new Date(today); in30.setDate(in30.getDate() + 30);
  const in90 = new Date(today); in90.setDate(in90.getDate() + 90);
  const in30Str = fechaISO(in30);
  const in90Str = fechaISO(in90);

  // ── Comprometida por horizonte (solo egresos pendientes) ─────
  const comprometida30 = pending
    .filter(m => m.naturaleza === 'egreso' && m.fecha >= todayStr && m.fecha <= in30Str)
    .reduce((s, m) => s + m.valor, 0);
  const comprometida90 = pending
    .filter(m => m.naturaleza === 'egreso' && m.fecha >= todayStr && m.fecha <= in90Str)
    .reduce((s, m) => s + m.valor, 0);

  // ── Este mes — cobros y egresos desglosados ──────────────────
  const cobrosEsteMes = pending
    .filter(m => m.naturaleza === 'ingreso' && m.fecha.startsWith(currentMonth))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const egresosEsteMes = pending
    .filter(m => m.naturaleza === 'egreso' && m.fecha.startsWith(currentMonth))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const totalCobrosEsteMes   = cobrosEsteMes.reduce((s, m) => s + m.valor, 0);
  const totalEgresosEsteMes  = egresosEsteMes.reduce((s, m) => s + m.valor, 0);
  const egresosRecurrentesMes = egresosEsteMes
    .filter(m => m.notas?.startsWith('recurring:'))
    .reduce((s, m) => s + m.valor, 0);
  const egresosComprometidosMes = totalEgresosEsteMes - egresosRecurrentesMes;

  const cobrosEsteMesLines = cobrosEsteMes.map(m =>
    `  ${m.fecha} ${m.descripcion} ${fmt(m.valor)}${m.estado === 'facturado' ? ' [FACTURADO]' : ''}`
  ).join('\n');
  const egresosComprometidosLines = egresosEsteMes
    .filter(m => !m.notas?.startsWith('recurring:'))
    .map(m => `  ${m.fecha} ${m.descripcion} ${fmt(m.valor)}`).join('\n');

  // ── Deudas ───────────────────────────────────────────────────
  const deudas = debts.filter(d => d.activa);
  const totalDeudas    = deudas.reduce((s, d) => s + d.saldoActual, 0);
  const totalCuotasMes = deudas.reduce((s, d) => s + d.cuotaMinima, 0);
  const deudaLines = deudas.map(d =>
    `  ${d.acreedor} (${d.tipo}): saldo ${fmt(d.saldoActual)}, cuota/mes ${fmt(d.cuotaMinima)}${d.fechaProximoPago ? ', próx. pago ' + d.fechaProximoPago : ''}`
  ).join('\n');

  // ── Promedio gasto mensual (últimos 3 meses confirmados) ─────
  const avgGastoMensual = (() => {
    const vals = [1, 2, 3].map(i => {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ms = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return confirmed.filter(m => m.naturaleza === 'egreso' && m.fecha.startsWith(ms))
        .reduce((s, m) => s + m.valor, 0);
    }).filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  })();
  const runway = avgGastoMensual > 0 ? cajaTotal / avgGastoMensual : 99;

  // ── Retiros del fundador ─────────────────────────────────────
  const retiros = confirmed
    .filter(m => m.tipoMovimiento === 'retiro_fundador')
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 8);
  const retirosLines = retiros.length > 0
    ? retiros.map(m => `  ${m.fecha}: ${fmt(m.valor)}`).join('\n')
    : '  (ninguno registrado)';

  // ── Cuentas bancarias ────────────────────────────────────────
  const cuentasLines = realAccounts.map(a => {
    const movs = confirmed.filter(m => m.cuentaRealId === a.id);
    const saldo = a.saldoInicial
      + movs.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0)
      - movs.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);
    return `  ${a.nombre} (${a.tipo}): ${fmt(saldo)}`;
  }).join('\n');

  // ── Historial mensual ────────────────────────────────────────
  const monthMap: Record<string, { ing: number; eg: number }> = {};
  for (const m of confirmed) {
    const mes = m.fecha.slice(0, 7);
    if (!monthMap[mes]) monthMap[mes] = { ing: 0, eg: 0 };
    if (m.naturaleza === 'ingreso') monthMap[mes].ing += m.valor;
    if (m.naturaleza === 'egreso')  monthMap[mes].eg  += m.valor;
  }
  const allMonths = Object.keys(monthMap).sort();
  const histLines = allMonths.map(mes => {
    const { ing, eg } = monthMap[mes];
    const marker = mes === currentMonth ? ' ← actual' : mes === lastMonth ? ' ← anterior' : '';
    return `  ${mes}: ing ${fmt(ing)} | eg ${fmt(eg)} | result ${fmt(ing - eg)}${marker}`;
  }).join('\n');

  // ── Movimientos mes actual + anterior ───────────────────────
  const recentMovs = confirmed
    .filter(m => m.fecha.startsWith(currentMonth) || m.fecha.startsWith(lastMonth))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const recentLines = recentMovs.map(m =>
    `  ${m.fecha} ${m.naturaleza === 'ingreso' ? '↑' : '↓'} ${m.descripcion} ${fmt(m.valor)}${m.categoria ? ' [' + m.categoria + ']' : ''}`
  ).join('\n');

  // ── Top categorías de gasto ──────────────────────────────────
  const catMap: Record<string, number> = {};
  for (const m of confirmed.filter(m => m.naturaleza === 'egreso' && m.categoria)) {
    catMap[m.categoria!] = (catMap[m.categoria!] || 0) + m.valor;
  }
  const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([cat, val]) => `  ${cat}: ${fmt(val)}`).join('\n');

  // ── Cobros próximos 90 días ──────────────────────────────────
  const cobros90 = pending
    .filter(m => m.naturaleza === 'ingreso' && m.fecha >= todayStr && m.fecha <= in90Str)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const cobros90Lines = cobros90.slice(0, 15).map(m =>
    `  ${m.fecha} ${m.descripcion} ${fmt(m.valor)}${m.estado === 'facturado' ? ' [FACTURADO]' : ''}`
  ).join('\n');

  // ── Pagos comprometidos próximos 90 días (no recurrentes) ────
  const pagos90 = pending
    .filter(m => m.naturaleza === 'egreso' && m.fecha >= todayStr && m.fecha <= in90Str && !m.notas?.startsWith('recurring:'))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pagos90Lines = pagos90.slice(0, 12).map(m =>
    `  ${m.fecha} ${m.descripcion} ${fmt(m.valor)}`
  ).join('\n');

  // ── Proyectos activos ────────────────────────────────────────
  const activeProj = projects.filter(p => p.status === 'active');
  const projLines = activeProj.slice(0, 8).map(p => {
    const c = clients.find(c => c.id === p.clientId);
    return `  ${p.name} (${c?.name || '?'}) ${fmt(p.totalAmount)}`;
  }).join('\n');

  // ── YTD ─────────────────────────────────────────────────────
  const year = todayStr.slice(0, 4);
  const ytd = confirmed.filter(m => m.fecha.startsWith(year));
  const ingYTD = ytd.filter(m => m.naturaleza === 'ingreso').reduce((s, m) => s + m.valor, 0);
  const egYTD  = ytd.filter(m => m.naturaleza === 'egreso').reduce((s, m) => s + m.valor, 0);

  return `=== CONTEXTO FINANCIERO IMPULSY — ${todayStr} ===

━━━ POSICIÓN REAL HOY ━━━
Caja total (dinero real en banco): ${fmt(cajaTotal)}
Runway: ${runway > 99 ? 'sin límite' : runway.toFixed(1) + ' meses'} (promedio gasto mensual: ${fmt(avgGastoMensual)})
Deuda total activa: ${fmt(totalDeudas)} | Cuotas mensuales: ${fmt(totalCuotasMes)}

Comprometida próximos 30 días: ${fmt(comprometida30)} → Caja libre (30d): ${fmt(cajaTotal - comprometida30)}
Comprometida próximos 90 días: ${fmt(comprometida90)} → Caja libre (90d): ${fmt(cajaTotal - comprometida90)}

NOTA: "Comprometida" = egresos pendientes (esperado/facturado) en ese horizonte. La caja libre indica lo disponible DESPUÉS de esas obligaciones.

━━━ ESTE MES — ${currentMonth} ━━━
Cobros esperados (${cobrosEsteMes.length}): ${fmt(totalCobrosEsteMes)}
${cobrosEsteMesLines || '  (ninguno)'}

Gastos fijos recurrentes este mes: ${fmt(egresosRecurrentesMes)}
Egresos comprometidos no-recurrentes este mes: ${fmt(egresosComprometidosMes)}
${egresosComprometidosLines || '  (ninguno)'}

BALANCE PROYECTADO ${currentMonth}: ${fmt(totalCobrosEsteMes - totalEgresosEsteMes)}
(cobros esperados − todos los egresos comprometidos del mes)

━━━ CUENTAS BANCARIAS ━━━
${cuentasLines || '(ninguna)'}

━━━ AÑO ${year} ━━━
Ingresos: ${fmt(ingYTD)} | Egresos: ${fmt(egYTD)} | Resultado: ${fmt(ingYTD - egYTD)}

━━━ HISTORIAL MENSUAL (${allMonths.length} meses) ━━━
${histLines || '(sin historial)'}

━━━ MOVIMIENTOS MES ACTUAL + ANTERIOR (${recentMovs.length} movs) ━━━
${recentLines || '(ninguno)'}

━━━ TOP CATEGORÍAS DE GASTO ━━━
${topCats || '(sin categorías)'}

━━━ COBROS ESPERADOS — PRÓX. 90 DÍAS (total: ${fmt(cobros90.reduce((s, m) => s + m.valor, 0))}) ━━━
${cobros90Lines || '(ninguno)'}${cobros90.length > 15 ? `\n  ...y ${cobros90.length - 15} más` : ''}

━━━ PAGOS COMPROMETIDOS — PRÓX. 90 DÍAS (sin recurrentes, total: ${fmt(pagos90.reduce((s, m) => s + m.valor, 0))}) ━━━
${pagos90Lines || '(ninguno)'}

━━━ DEUDAS ACTIVAS ━━━
${deudaLines || '(ninguna)'}

━━━ RETIROS FUNDADOR (historial) ━━━
${retirosLines}

━━━ PROYECTOS ACTIVOS (${activeProj.length}) ━━━
${projLines || '(ninguno)'}
=== FIN CONTEXTO ===`;
}

// ── CONTEXTO COMPLETO (solo cuando el usuario lo activa) ─────────
function buildFullContext(
  movements: LedgerMovement[],
  realAccounts: RealAccount[],
  debts: Debt[],
  projects: Project[],
  clients: Client[],
): string {
  const compact = buildCompactContext(movements, realAccounts, debts, projects, clients);
  const confirmed = movements.filter(m => m.estado === 'confirmado');

  const allMovsLines = confirmed
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map(m =>
      `  ${m.fecha} ${m.naturaleza === 'ingreso' ? '↑' : '↓'} ${m.descripcion} ${fmt(m.valor)}${m.categoria ? ' [' + m.categoria + ']' : ''}${m.tercero ? ' — ' + m.tercero : ''} (${m.estado})`
    ).join('\n');

  return compact.replace(
    '=== FIN CONTEXTO ===',
    `\nHISTORIAL COMPLETO DE MOVIMIENTOS (${confirmed.length} confirmados)\n${allMovsLines}\n=== FIN CONTEXTO (MODO COMPLETO) ===`
  );
}

// ── Types ────────────────────────────────────────────────────────
interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface APIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Component ────────────────────────────────────────────────────
export function FinancialAdvisor() {
  const { movements, realAccounts, debts, loading } = useLedger();
  const { clients, projects } = useSupabaseData();

  const [open, setOpen]           = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [deepMode, setDeepMode]   = useState(false); // full context for next message
  const [directives, setDirectives] = useState<string>(
    () => localStorage.getItem(LS_DIRECTIVES_KEY) || DEFAULT_DIRECTIVES
  );
  const [draftDirectives, setDraftDirectives] = useState(directives);
  const [messages, setMessages] = useState<Message[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_HISTORY_KEY) || '[]'); }
    catch { return []; }
  });
  const [input, setInput]         = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  useEffect(() => {
    if (open && !showConfig) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, showConfig]);

  const compactContext = useMemo(
    () => buildCompactContext(movements, realAccounts, debts, projects, clients),
    [movements, realAccounts, debts, projects, clients]
  );
  const fullContext = useMemo(
    () => buildFullContext(movements, realAccounts, debts, projects, clients),
    [movements, realAccounts, debts, projects, clients]
  );

  const saveDirectives = () => {
    setDirectives(draftDirectives);
    localStorage.setItem(LS_DIRECTIVES_KEY, draftDirectives);
    setShowConfig(false);
  };

  const clearHistory = () => {
    if (!confirm('¿Borrar todo el historial de conversación?')) return;
    setMessages([]);
    localStorage.removeItem(LS_HISTORY_KEY);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || streaming) return;

    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      alert('Configura VITE_OPENAI_API_KEY en el archivo .env para usar el asesor IA.');
      return;
    }

    const useFullContext = deepMode;
    if (deepMode) setDeepMode(false); // reset after use

    const userMsg: Message = { role: 'user', content: text.trim() };
    const nextMessages = [...messages, userMsg].slice(-MAX_HISTORY);
    setMessages(nextMessages);
    setInput('');
    setStreaming(true);
    setStreamContent('');

    abortRef.current = new AbortController();

    const systemPrompt = `${directives}\n\n${useFullContext ? fullContext : compactContext}`;
    const apiMessages: APIMessage[] = [
      { role: 'system', content: systemPrompt },
      ...nextMessages.map(m => ({ role: m.role, content: m.content })),
    ];

    try {
      const res = await fetch(OPENAI_URL, {
        method: 'POST',
        signal: abortRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          max_tokens: 1024,
          stream: true,
          messages: apiMessages,
        }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        throw new Error(`OpenAI error ${res.status}: ${errText}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer   = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) { fullText += delta; setStreamContent(fullText); }
          } catch { /* ignore */ }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant' as const, content: fullText }].slice(-MAX_HISTORY));
      setStreamContent('');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (streamContent) {
          setMessages(prev => [...prev, { role: 'assistant', content: streamContent + ' *(cancelado)*' }]);
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${msg}` }]);
      }
      setStreamContent('');
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  // ── Render ───────────────────────────────────────────────────
  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Asesor Financiero IA"
        className="advisor-fab"
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 1200,
          width: 52, height: 52, borderRadius: '50%',
          background: open ? '#18181b' : 'linear-gradient(135deg,#10b981,#059669)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(16,185,129,0.4)', transition: 'all 0.2s', color: '#fff',
        }}
      >
        {open ? <ChevronDown size={22} /> : <Bot size={22} />}
      </button>

      {/* Panel */}
      {open && (
        <div className="advisor-panel" style={{
          position: 'fixed', bottom: '5rem', right: '1.5rem', zIndex: 1200,
          width: 430, maxWidth: 'calc(100vw - 2rem)',
          height: 580, maxHeight: 'calc(100vh - 6rem)',
          background: '#09090b', border: '1px solid #27272a',
          borderRadius: 16, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.55)',
        }}>

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.85rem 1rem', borderBottom: '1px solid #27272a',
            background: '#09090b', flexShrink: 0,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg,#10b981,#059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={16} color="#fff" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem' }}>
                Asesor Financiero IA
              </div>
              <div style={{ color: '#71717a', fontSize: '0.68rem' }}>
                {loading
                  ? 'Cargando datos…'
                  : `${movements.length} movimientos · GPT-4o mini`}
              </div>
            </div>
            <button onClick={clearHistory} title="Limpiar historial"
              style={iconBtn}>
              <RotateCcw size={14} />
            </button>
            <button onClick={() => { setShowConfig(c => !c); setDraftDirectives(directives); }}
              title="Editar directrices"
              style={{ ...iconBtn, color: showConfig ? '#10b981' : '#52525b' }}>
              <Settings size={14} />
            </button>
            <button onClick={() => setOpen(false)} style={iconBtn}>
              <X size={16} />
            </button>
          </div>

          {/* Config panel */}
          {showConfig ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '0.75rem', overflow: 'hidden' }}>
              <div style={{ color: '#a1a1aa', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.05em' }}>
                DIRECTRICES DEL ASESOR
              </div>
              <div style={{ color: '#52525b', fontSize: '0.7rem' }}>
                Define el rol y tono. El contexto financiero se incluye automáticamente.
              </div>
              <textarea
                value={draftDirectives}
                onChange={e => setDraftDirectives(e.target.value)}
                style={{
                  flex: 1, background: '#18181b', border: '1px solid #27272a',
                  borderRadius: 8, color: '#e4e4e7', fontSize: '0.73rem',
                  padding: '0.75rem', resize: 'none', fontFamily: 'monospace',
                  lineHeight: 1.5, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={saveDirectives} style={{
                  flex: 1, background: '#10b981', border: 'none', borderRadius: 8,
                  color: '#fff', padding: '0.6rem', cursor: 'pointer',
                  fontWeight: 700, fontSize: '0.8rem',
                }}>Guardar</button>
                <button onClick={() => setDraftDirectives(DEFAULT_DIRECTIVES)} style={{
                  background: '#27272a', border: 'none', borderRadius: 8,
                  color: '#a1a1aa', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.8rem',
                }}>Reset</button>
              </div>

            </div>
          ) : (
            <>
              {/* Messages */}
              <div style={{
                flex: 1, overflowY: 'auto', padding: '0.75rem 1rem',
                display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}>
                {messages.length === 0 && !streaming && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', paddingTop: '0.25rem' }}>
                    <div style={{ color: '#3f3f46', fontSize: '0.72rem', textAlign: 'center', marginBottom: '0.2rem' }}>
                      Consulta cualquier aspecto financiero de Impulsy
                    </div>
                    {SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => sendMessage(s)} style={chipStyle}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#10b981';
                          (e.currentTarget as HTMLButtonElement).style.color = '#e4e4e7';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#27272a';
                          (e.currentTarget as HTMLButtonElement).style.color = '#71717a';
                        }}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {messages.map((m, i) => (
                  <MessageBubble key={i} message={m} />
                ))}

                {streaming && streamContent && (
                  <MessageBubble message={{ role: 'assistant', content: streamContent }} isStreaming />
                )}

                {streaming && !streamContent && (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', color: '#52525b', fontSize: '0.73rem' }}>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    Analizando…
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Deep mode banner */}
              {deepMode && (
                <div style={{
                  background: '#1c1917', borderTop: '1px solid #44403c',
                  padding: '0.45rem 1rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  flexShrink: 0,
                }}>
                  <Search size={13} color="#f59e0b" />
                  <span style={{ color: '#f59e0b', fontSize: '0.7rem', flex: 1 }}>
                    Búsqueda profunda activa — el próximo mensaje usará el historial completo
                  </span>
                  <button onClick={() => setDeepMode(false)} style={{ background: 'transparent', border: 'none', color: '#78716c', cursor: 'pointer', fontSize: '0.7rem' }}>
                    cancelar
                  </button>
                </div>
              )}

              {/* Input row */}
              <div style={{
                borderTop: '1px solid #27272a', padding: '0.65rem 0.75rem',
                display: 'flex', gap: '0.45rem', alignItems: 'flex-end',
                background: '#09090b', flexShrink: 0,
              }}>
                {/* Deep search toggle */}
                <button
                  onClick={() => setDeepMode(d => !d)}
                  title="Búsqueda profunda (todos los movimientos)"
                  style={{
                    background: deepMode ? '#292524' : 'transparent',
                    border: `1px solid ${deepMode ? '#f59e0b' : '#27272a'}`,
                    borderRadius: 8, color: deepMode ? '#f59e0b' : '#52525b',
                    width: 34, height: 34, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
                    transition: 'all 0.15s',
                  }}
                >
                  <Search size={14} />
                </button>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Pregunta sobre tus finanzas… (Enter)"
                  disabled={streaming}
                  rows={1}
                  style={{
                    flex: 1, background: '#18181b', border: '1px solid #27272a',
                    borderRadius: 10, color: '#e4e4e7', fontSize: '0.8rem',
                    padding: '0.55rem 0.7rem', resize: 'none', outline: 'none',
                    fontFamily: 'inherit', lineHeight: 1.4,
                    maxHeight: 80, overflowY: 'auto',
                  }}
                />

                {streaming ? (
                  <button onClick={() => abortRef.current?.abort()} title="Detener" style={{
                    background: '#27272a', border: 'none', borderRadius: 10,
                    color: '#f87171', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                  }}>
                    <X size={15} />
                  </button>
                ) : (
                  <button onClick={() => sendMessage(input)} disabled={!input.trim()} style={{
                    background: input.trim() ? '#10b981' : '#27272a', border: 'none',
                    borderRadius: 10, color: '#fff', width: 34, height: 34,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: input.trim() ? 'pointer' : 'default', flexShrink: 0,
                    transition: 'background 0.15s',
                  }}>
                    <Send size={14} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const iconBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: '#52525b', padding: '0.25rem',
  display: 'flex', alignItems: 'center',
};
const chipStyle: React.CSSProperties = {
  background: '#18181b', border: '1px solid #27272a', borderRadius: 10,
  color: '#71717a', padding: '0.45rem 0.7rem', cursor: 'pointer',
  textAlign: 'left', fontSize: '0.73rem', transition: 'all 0.15s', lineHeight: 1.3,
};

// ── MessageBubble ────────────────────────────────────────────────
function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === 'user';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', animation: 'fadeIn 0.2s ease' }}>
      <div style={{
        maxWidth: '86%',
        background: isUser ? '#059669' : '#18181b',
        border: isUser ? 'none' : '1px solid #27272a',
        borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
        padding: '0.55rem 0.8rem',
        color: '#f4f4f5', fontSize: '0.8rem', lineHeight: 1.55, wordBreak: 'break-word',
      }}>
        <MarkdownText text={message.content} />
        {isStreaming && (
          <span style={{
            display: 'inline-block', width: 6, height: 13, background: '#10b981',
            borderRadius: 2, marginLeft: 2, verticalAlign: 'middle',
            animation: 'spin 0.8s steps(2) infinite',
          }} />
        )}
      </div>
    </div>
  );
}

// ── Markdown renderer ────────────────────────────────────────────
function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (line.startsWith('## ')) {
      out.push(<div key={i} style={{ fontWeight: 700, color: '#34d399', marginTop: i ? '0.5rem' : 0, marginBottom: '0.1rem', fontSize: '0.78rem' }}>{inlineFormat(line.slice(3))}</div>);
    } else if (line.startsWith('# ')) {
      out.push(<div key={i} style={{ fontWeight: 700, color: '#6ee7b7', marginTop: i ? '0.45rem' : 0 }}>{inlineFormat(line.slice(2))}</div>);
    } else if (line.startsWith('- ') || line.startsWith('• ')) {
      out.push(<div key={i} style={{ paddingLeft: '1rem', position: 'relative' }}><span style={{ position: 'absolute', left: 0 }}>•</span>{inlineFormat(line.slice(2))}</div>);
    } else if (line === '') {
      if (i > 0 && lines[i - 1] !== '') out.push(<div key={i} style={{ height: '0.3rem' }} />);
    } else {
      out.push(<div key={i}>{inlineFormat(line)}</div>);
    }
  });
  return <>{out}</>;
}

function inlineFormat(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} style={{ color: '#fff' }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} style={{ background: '#27272a', borderRadius: 3, padding: '0 3px', fontFamily: 'monospace', fontSize: '0.74em' }}>{part.slice(1, -1)}</code>;
    return part;
  });
}
