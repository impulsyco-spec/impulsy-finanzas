-- ============================================================
-- IMPULSY · Migration 004 — Equipo / Proveedores + Bold fix
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Tabla team_members ──────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre         TEXT NOT NULL,
  rol            TEXT NOT NULL,
  email          TEXT,
  telefono       TEXT,
  tarifa_mensual NUMERIC DEFAULT 0,
  activo         BOOLEAN DEFAULT true,
  notas          TEXT,
  avatar_color   TEXT DEFAULT '#a855f7',
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ── 2. Agregar team_member_id a ledger_movements ───────────
ALTER TABLE ledger_movements
  ADD COLUMN IF NOT EXISTS team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL;

-- ── 3. RLS para team_members ───────────────────────────────
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_anon_select ON team_members;
DROP POLICY IF EXISTS allow_anon_insert ON team_members;
DROP POLICY IF EXISTS allow_anon_update ON team_members;
DROP POLICY IF EXISTS allow_anon_delete ON team_members;

CREATE POLICY allow_anon_select ON team_members FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON team_members FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON team_members FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON team_members FOR DELETE TO anon, authenticated USING (true);

-- ── 4. Enlazar movimientos confirmados sin cuenta → Bold ───
-- Solo actualiza si existe la cuenta Bold; si no existe, no hace nada.
DO $$
DECLARE bold_id UUID;
BEGIN
  SELECT id INTO bold_id FROM real_accounts WHERE nombre ILIKE '%bold%' LIMIT 1;
  IF bold_id IS NOT NULL THEN
    UPDATE ledger_movements
    SET cuenta_real_id = bold_id
    WHERE cuenta_real_id IS NULL
      AND estado = 'confirmado';
    RAISE NOTICE 'Movimientos enlazados a Bold: %', FOUND;
  ELSE
    RAISE NOTICE 'No se encontró cuenta Bold. Crea la cuenta en Cuentas & Bolsillos primero.';
  END IF;
END $$;

-- ── Verificación ───────────────────────────────────────────
SELECT 'team_members creada' AS status
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_members');

SELECT 'team_member_id en ledger_movements' AS status
WHERE EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'ledger_movements' AND column_name = 'team_member_id'
);
