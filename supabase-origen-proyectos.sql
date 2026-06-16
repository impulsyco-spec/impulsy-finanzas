-- ════════════════════════════════════════════════════════════════
-- ADQUISICIÓN v2: columna "origen" tambien a nivel PROYECTO
-- Permite trazabilidad fina: distinguir el proyecto que vino de la
-- campaña de las renovaciones del mismo cliente (retención).
-- Supabase → SQL Editor → pestaña nueva → pegar → Run. Sin riesgo.
-- ════════════════════════════════════════════════════════════════
alter table projects add column if not exists origen text
  check (origen in ('campanas','referido','organico') or origen is null);
