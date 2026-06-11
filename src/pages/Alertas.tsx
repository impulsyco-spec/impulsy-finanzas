import React from 'react';
import { useLedger } from '../hooks/useLedger';
import { calcKPIs, calcSemaforos } from '../hooks/useFinancials';
import { hoyISO, fechaISO } from '../lib/dates';

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');

const SEMAFORO_ICONS: Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' };
const SEMAFORO_COLORS: Record<string, string> = { verde: '#10b981', amarillo: '#f59e0b', rojo: '#ef4444' };
const SEMAFORO_BG: Record<string, string> = {
  verde: 'rgba(16,185,129,0.08)',
  amarillo: 'rgba(245,158,11,0.08)',
  rojo: 'rgba(239,68,68,0.08)',
};
const SEMAFORO_BORDER: Record<string, string> = {
  verde: 'rgba(16,185,129,0.2)',
  amarillo: 'rgba(245,158,11,0.2)',
  rojo: 'rgba(239,68,68,0.2)',
};

function buildAlerts(
  movements: ReturnType<typeof useLedger>['movements'],
  kpis: ReturnType<typeof calcKPIs>,
  semaforos: ReturnType<typeof calcSemaforos>
): { nivel: 'rojo' | 'amarillo' | 'verde'; titulo: string; detalle: string }[] {
  const hoy = hoyISO();
  const alerts: { nivel: 'rojo' | 'amarillo' | 'verde'; titulo: string; detalle: string }[] = [];

  // Runway bajo
  if (kpis.runway < 1) {
    alerts.push({ nivel: 'rojo', titulo: 'Runway crítico', detalle: `Menos de 1 mes de caja libre (${kpis.runway.toFixed(1)} meses). Prioriza cobros inmediatamente.` });
  } else if (kpis.runway < 3) {
    alerts.push({ nivel: 'amarillo', titulo: 'Runway bajo', detalle: `${kpis.runway.toFixed(1)} meses de runway. Monitorea gastos y acelera cobros.` });
  }

  // Facturas vencidas por cobrar
  const cobrarVencidas = movements.filter(
    m => m.naturaleza === 'ingreso' &&
         (m.estado === 'esperado' || m.estado === 'facturado') &&
         m.fechaVencimiento && m.fechaVencimiento < hoy
  );
  if (cobrarVencidas.length > 0) {
    const total = cobrarVencidas.reduce((s, m) => s + m.valor, 0);
    alerts.push({
      nivel: 'rojo',
      titulo: `${cobrarVencidas.length} cobro(s) vencido(s)`,
      detalle: `${fmt(total)} en facturas vencidas sin cobrar. Contacta al cliente.`,
    });
  }

  // Pagos vencidos por pagar
  const pagarVencidos = movements.filter(
    m => m.naturaleza === 'egreso' &&
         (m.estado === 'esperado' || m.estado === 'facturado') &&
         m.fechaVencimiento && m.fechaVencimiento < hoy
  );
  if (pagarVencidos.length > 0) {
    const total = pagarVencidos.reduce((s, m) => s + m.valor, 0);
    alerts.push({
      nivel: 'rojo',
      titulo: `${pagarVencidos.length} pago(s) vencido(s)`,
      detalle: `${fmt(total)} en compromisos de pago vencidos. Revisa y paga.`,
    });
  }

  // Margen bajo
  if (kpis.margenYTD < 0.1 && kpis.ingresosYTD > 0) {
    alerts.push({
      nivel: kpis.margenYTD < 0 ? 'rojo' : 'amarillo',
      titulo: 'Margen bajo',
      detalle: `Margen YTD de ${(kpis.margenYTD * 100).toFixed(1)}%. Revisa estructura de costos.`,
    });
  }

  // Gastos personales en caja empresa
  const personales = movements.filter(m => m.personalFlag && m.estado === 'confirmado');
  if (personales.length > 0) {
    const total = personales.reduce((s, m) => s + m.valor, 0);
    alerts.push({
      nivel: 'amarillo',
      titulo: 'Gastos personales en empresa',
      detalle: `${personales.length} movimiento(s) marcados como personal por ${fmt(total)}. Reclasifícalos.`,
    });
  }

  // Caja comprometida > 80% de caja total
  if (kpis.cajaTotal > 0 && kpis.cajaComprometida / kpis.cajaTotal > 0.8) {
    alerts.push({
      nivel: 'amarillo',
      titulo: 'Alta carga comprometida',
      detalle: `${((kpis.cajaComprometida / kpis.cajaTotal) * 100).toFixed(0)}% de la caja está comprometida en pagos pendientes.`,
    });
  }

  // Pagos próximos (próximos 7 días)
  const en7dias = new Date();
  en7dias.setDate(en7dias.getDate() + 7);
  const enStr = fechaISO(en7dias);
  const proxPagos = movements.filter(
    m => m.naturaleza === 'egreso' &&
         (m.estado === 'esperado' || m.estado === 'facturado') &&
         m.fechaVencimiento && m.fechaVencimiento >= hoy && m.fechaVencimiento <= enStr
  );
  if (proxPagos.length > 0) {
    const total = proxPagos.reduce((s, m) => s + m.valor, 0);
    alerts.push({
      nivel: 'amarillo',
      titulo: `${proxPagos.length} pago(s) en los próximos 7 días`,
      detalle: `Total: ${fmt(total)}. Asegúrate de tener fondos disponibles.`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({ nivel: 'verde', titulo: 'Todo en orden', detalle: 'Sin alertas activas. Buena salud financiera.' });
  }

  return alerts.sort((a, b) => {
    const order = { rojo: 0, amarillo: 1, verde: 2 };
    return order[a.nivel] - order[b.nivel];
  });
}

export const Alertas: React.FC = () => {
  const { movements, realAccounts, debts, loading } = useLedger();

  if (loading) return <div style={{ padding: '2rem', color: '#a1a1aa' }}>Analizando...</div>;

  const kpis = calcKPIs(movements, realAccounts, debts);
  const semaforos = calcSemaforos(kpis, movements);
  const alerts = buildAlerts(movements, kpis, semaforos);

  const rojos    = semaforos.filter(s => s.estado === 'rojo').length;
  const amarillos = semaforos.filter(s => s.estado === 'amarillo').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      <header>
        <h1 style={{ color: '#fff', fontWeight: 800, fontSize: '2rem' }}>Semáforos & Alertas</h1>
        <p style={{ color: '#71717a', marginTop: '0.25rem' }}>
          Estado financiero en tiempo real.
          {rojos > 0 && <span style={{ color: '#ef4444', fontWeight: 700 }}> {rojos} crítico(s)</span>}
          {amarillos > 0 && <span style={{ color: '#f59e0b', fontWeight: 700 }}> · {amarillos} atención</span>}
          {rojos === 0 && amarillos === 0 && <span style={{ color: '#10b981', fontWeight: 700 }}> · Todo verde</span>}
        </p>
      </header>

      {/* Semáforos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {semaforos.map(s => (
          <div
            key={s.id}
            className="card"
            style={{
              padding: '1.25rem',
              background: SEMAFORO_BG[s.estado],
              borderColor: SEMAFORO_BORDER[s.estado],
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#71717a', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>{s.label}</span>
              <span style={{ fontSize: '1.25rem' }}>{SEMAFORO_ICONS[s.estado]}</span>
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: SEMAFORO_COLORS[s.estado] }}>{s.valor}</div>
            <div style={{ fontSize: '0.8rem', color: '#a0aec0', marginTop: '0.25rem' }}>{s.desc}</div>
            <div style={{ fontSize: '0.72rem', color: '#52525b', marginTop: '0.5rem' }}>{s.detalle}</div>
          </div>
        ))}
      </div>

      {/* KPIs rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.875rem' }}>
        {[
          { label: 'Caja Total',      value: fmt(kpis.cajaTotal),      color: '#fff' },
          { label: 'Por Cobrar',      value: fmt(kpis.porCobrar),      color: '#06b6d4' },
          { label: 'Por Pagar',       value: fmt(kpis.porPagar),       color: '#f59e0b' },
          { label: 'Deuda Total',     value: fmt(kpis.totalDeudas),    color: '#ef4444' },
          { label: 'Ingresos YTD',    value: fmt(kpis.ingresosYTD),    color: '#10b981' },
          { label: 'Gastos YTD',      value: fmt(kpis.gastosYTD),      color: '#f97316' },
          { label: 'Utilidad YTD',    value: fmt(kpis.utilidadYTD),    color: kpis.utilidadYTD >= 0 ? '#10b981' : '#ef4444' },
          { label: 'Runway',          value: kpis.runway.toFixed(1) + ' meses', color: kpis.runway >= 3 ? '#10b981' : kpis.runway >= 1 ? '#f59e0b' : '#ef4444' },
        ].map(s => (
          <div key={s.label} className="card stat-card" style={{ minHeight: 'auto', padding: '1rem' }}>
            <span className="stat-label">{s.label}</span>
            <span className="stat-value" style={{ color: s.color, fontSize: '1.1rem' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Alertas */}
      <div>
        <h2 style={{ color: '#fff', fontWeight: 700, marginBottom: '1rem' }}>Alertas Activas</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {alerts.map((a, i) => (
            <div
              key={i}
              style={{
                background: SEMAFORO_BG[a.nivel],
                border: `1px solid ${SEMAFORO_BORDER[a.nivel]}`,
                borderRadius: '10px',
                padding: '0.875rem 1.25rem',
                display: 'flex',
                gap: '0.875rem',
                alignItems: 'flex-start',
              }}
            >
              <span style={{ fontSize: '1rem', marginTop: '0.05rem', flexShrink: 0 }}>{SEMAFORO_ICONS[a.nivel]}</span>
              <div>
                <div style={{ color: SEMAFORO_COLORS[a.nivel], fontWeight: 700, fontSize: '0.9rem' }}>{a.titulo}</div>
                <div style={{ color: '#a0aec0', fontSize: '0.82rem', marginTop: '0.15rem' }}>{a.detalle}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
