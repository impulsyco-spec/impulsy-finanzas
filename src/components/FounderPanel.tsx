import React, { useMemo, useState } from 'react';
import { ShieldCheck, Wallet, PiggyBank, Flame, BadgeDollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { hoyISO } from '../lib/dates';
import { FOUNDER_RULES, calcFounderStatus } from '../lib/founderRules';
import { LedgerMovement, RealAccount, FinancialKPIs, MESES_ES } from '../types';

interface Props {
  movements: LedgerMovement[];
  realAccounts: RealAccount[];
  kpis: FinancialKPIs;
  onRefetch: () => void;
}

const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const fmtK = (v: number) => {
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return sign + '$' + (abs / 1_000).toFixed(0) + 'K';
  return sign + fmt(abs);
};
const fmtFecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

const lblStyle: React.CSSProperties = {
  fontSize: '0.6rem', color: '#52525b', textTransform: 'uppercase',
  fontWeight: 700, letterSpacing: '0.5px',
};

export const FounderPanel: React.FC<Props> = ({ movements, realAccounts, kpis, onRefetch }) => {
  const [paying, setPaying] = useState(false);
  const status = useMemo(() => calcFounderStatus(movements), [movements]);
  const { salarioQuincenal, reservaMeta } = FOUNDER_RULES;

  const hoyStr = hoyISO();
  const pctGastado = Math.min(100, ((status.gastoQuincena + status.salarioPagadoQuincena) / salarioQuincenal) * 100);
  const enRojo = status.disponible < 0;
  const colorDisponible = enRojo ? '#ef4444' : pctGastado >= 75 ? '#f59e0b' : '#10b981';

  const pctReserva = Math.max(0, Math.min(100, (kpis.cajaTotal / reservaMeta) * 100));
  const reservaLograda = kpis.cajaTotal >= reservaMeta;

  const pagoDisponible = status.activo && !status.proximoPago.pagado && hoyStr >= status.proximoPago.fecha;

  const pagarSalario = async () => {
    if (!confirm(`Registrar tu pago de salario por ${fmt(status.proximoPago.monto)}?\n\nRecuerda hacer la transferencia real en tu banco por este mismo valor.`)) return;
    setPaying(true);
    try {
      const hoy = new Date();
      const boldAcc = realAccounts.find(a => a.nombre.toLowerCase().includes('bold')) || realAccounts[0];
      const { error } = await supabase.from('ledger_movements').insert({
        fecha: hoyISO(),
        tipo_movimiento: 'retiro_fundador',
        naturaleza: 'egreso',
        descripcion: `Salario Fundador — ${status.quincena.label}`,
        valor: status.proximoPago.monto,
        categoria: 'Salario',
        estado: 'confirmado',
        cuenta_real_id: boldAcc?.id || null,
        personal_flag: false,
        tipo_retiro: 'sueldo_aprobado',
        notas: `founder:salario:${status.quincena.id}`,
        mes: MESES_ES[hoy.getMonth()],
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      onRefetch();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.25rem', border: `1px solid ${enRojo ? '#ef444433' : '#1f2937'}`, background: 'linear-gradient(135deg,#0d0d11 0%,#0a0a0a 100%)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <ShieldCheck size={16} style={{ color: enRojo ? '#ef4444' : '#10b981' }} />
        <h3 style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>Reglas del Fundador</h3>
        {!status.activo && (
          <span style={{ fontSize: '0.65rem', color: '#a855f7', background: '#a855f714', border: '1px solid #a855f733', borderRadius: '999px', padding: '0.2rem 0.6rem', fontWeight: 700 }}>
            Arranca el {fmtFecha(FOUNDER_RULES.inicioRegimen)} — primer pago el {fmtFecha(status.proximoPago.fecha)}
          </span>
        )}
        {status.activo && status.racha > 0 && (
          <span style={{ fontSize: '0.65rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 700 }}>
            <Flame size={12} /> {status.racha} quincena{status.racha > 1 ? 's' : ''} limpia{status.racha > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="resp-grid-panel" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem' }}>

        {/* Tu quincena */}
        <div style={{ background: '#111', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Wallet size={12} style={{ color: colorDisponible }} />
            <span style={lblStyle}>Tuyo disponible · quincena {status.quincena.label}</span>
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: colorDisponible, marginTop: '0.3rem', lineHeight: 1.1 }}>
            {fmtK(status.disponible)}
          </div>
          <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', marginTop: '0.6rem' }}>
            <div style={{ height: '100%', width: `${pctGastado}%`, background: colorDisponible, borderRadius: '999px', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: '0.65rem', color: '#52525b', marginTop: '0.4rem' }}>
            Usado {fmt(status.gastoQuincena + status.salarioPagadoQuincena)} de {fmt(salarioQuincenal)}
          </div>
          {enRojo && (
            <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: '0.4rem', fontWeight: 600 }}>
              Te pasaste {fmt(Math.abs(status.disponible))} — se descuenta de tu próximo salario.
            </div>
          )}
          {status.deudaArrastrada > 0 && (
            <div style={{ fontSize: '0.68rem', color: '#f59e0b', marginTop: '0.3rem', fontWeight: 600 }}>
              Deuda con Impulsy: {fmt(status.deudaArrastrada)}
            </div>
          )}
        </div>

        {/* Próximo salario */}
        <div style={{ background: '#111', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <BadgeDollarSign size={12} style={{ color: '#06b6d4' }} />
            <span style={lblStyle}>Próximo salario</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '0.3rem' }}>
            {fmt(status.proximoPago.monto)}
          </div>
          <div style={{ fontSize: '0.65rem', color: '#52525b', marginTop: '0.2rem' }}>
            {status.proximoPago.pagado ? 'Pagado esta quincena ✓' : fmtFecha(status.proximoPago.fecha)}
          </div>
          {pagoDisponible && status.proximoPago.monto > 0 && (
            <button onClick={pagarSalario} disabled={paying}
              style={{ marginTop: '0.6rem', width: '100%', padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#10b981', color: '#000', fontWeight: 800, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}>
              {paying ? 'Registrando...' : '💰 Registrar pago de salario'}
            </button>
          )}
          {pagoDisponible && status.proximoPago.monto === 0 && (
            <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: '0.5rem', fontWeight: 600 }}>
              Esta quincena no hay pago: el gasto directo y la deuda lo consumieron.
            </div>
          )}
        </div>

        {/* Reserva */}
        <div style={{ background: '#111', borderRadius: '10px', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <PiggyBank size={12} style={{ color: reservaLograda ? '#10b981' : '#a855f7' }} />
            <span style={lblStyle}>Reserva · meta {fmtK(reservaMeta)}</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: reservaLograda ? '#10b981' : '#fff', marginTop: '0.3rem' }}>
            {fmtK(Math.max(0, kpis.cajaTotal))}
          </div>
          <div style={{ height: '5px', background: '#1a1a1a', borderRadius: '999px', overflow: 'hidden', marginTop: '0.6rem' }}>
            <div style={{ height: '100%', width: `${pctReserva}%`, background: reservaLograda ? '#10b981' : '#a855f7', borderRadius: '999px', transition: 'width 0.4s' }} />
          </div>
          <div style={{ fontSize: '0.65rem', color: '#52525b', marginTop: '0.4rem' }}>
            {reservaLograda
              ? 'Meta lograda — se desbloquean distribuciones trimestrales 🎉'
              : `${pctReserva.toFixed(0)}% de 2 meses de operación en caja`}
          </div>
        </div>
      </div>
    </div>
  );
};
