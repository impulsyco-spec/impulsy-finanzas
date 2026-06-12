-- ════════════════════════════════════════════════════════════════
-- ADQUISICIÓN: columna "origen" en clientes (¿de dónde viene?)
-- Supabase → SQL Editor → pestaña nueva → pegar → Run.
-- Una sola línea, sin riesgo: solo AGREGA una columna opcional.
-- ════════════════════════════════════════════════════════════════
alter table clients add column if not exists origen text
  check (origen in ('campanas','referido','organico') or origen is null);
