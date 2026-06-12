import React from 'react';

// ── Identidad visual del mundo Personal: dorado ──────────────────
export const GOLD = '#f59e0b';
export const CAT_COLORS = ['#f59e0b','#10b981','#06b6d4','#a855f7','#ef4444','#f97316','#8b5cf6','#ec4899','#14b8a6','#84cc16','#eab308','#64748b'];

export const fmt  = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
export const fmtK = (v: number) => {
  const abs = Math.abs(v); const s = v < 0 ? '−' : '';
  if (abs >= 1_000_000) return s + '$' + (abs / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return s + '$' + (abs / 1_000).toFixed(0) + 'K';
  return s + fmt(abs);
};
export const fmtFecha = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
export const fmtInput = (v: string) => v.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const inp: React.CSSProperties = {
  width: '100%', background: '#1a1a1a', border: '1px solid #333', color: '#fff',
  padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit',
};
export const lbl: React.CSSProperties = {
  display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#71717a',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.3rem',
};

// Banner cuando faltan las tablas de la parte 2 (bolsillos/deudas/presupuestos)
export const Setup2Banner: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="card" style={{ padding: '1.5rem', border: `1px solid ${GOLD}44`, textAlign: 'center' }}>
    <div style={{ fontSize: '1.5rem', marginBottom: '0.4rem' }}>🔧</div>
    <div style={{ color: GOLD, fontWeight: 800, marginBottom: '0.5rem' }}>Falta activar esta sección</div>
    <p style={{ color: '#a0aec0', fontSize: '0.85rem', lineHeight: 1.7, maxWidth: '480px', margin: '0 auto 0.75rem' }}>
      Ejecuta el archivo <b style={{ color: GOLD }}>supabase-modo-personal-2.sql</b> en el SQL Editor de Supabase
      (igual que la vez pasada: pestaña nueva → pegar → Run) y toca el botón.
    </p>
    <button onClick={onRetry} className="btn btn-primary">Ya lo ejecuté — Activar</button>
  </div>
);

// Encabezado de cada página personal
export const PersonalHeader: React.FC<{ titulo: string; sub: string; extra?: React.ReactNode }> = ({ titulo, sub, extra }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
    <div>
      <h1 style={{ color: GOLD, fontWeight: 800, fontSize: '1.8rem' }}>{titulo}</h1>
      <p style={{ color: '#52525b', fontSize: '0.8rem', marginTop: '0.15rem' }}>{sub}</p>
    </div>
    {extra}
  </div>
);
