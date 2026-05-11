-- Migración 008: Eliminar cuentas BOLD duplicadas y blindar contra futuros duplicados
-- Ejecutar en Supabase SQL Editor > Run

-- PASO 1: Reasignar movimientos de duplicadas a la cuenta BOLD original (más antigua)
UPDATE ledger_movements
SET cuenta_real_id = (
  SELECT id FROM real_accounts
  WHERE nombre ILIKE '%bold%'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE cuenta_real_id IN (
  SELECT id FROM real_accounts
  WHERE nombre ILIKE '%bold%'
    AND id != (
      SELECT id FROM real_accounts
      WHERE nombre ILIKE '%bold%'
      ORDER BY created_at ASC
      LIMIT 1
    )
);

-- PASO 2: Eliminar las cuentas BOLD duplicadas (mantiene la más antigua)
DELETE FROM real_accounts
WHERE nombre ILIKE '%bold%'
  AND id != (
    SELECT id FROM real_accounts
    WHERE nombre ILIKE '%bold%'
    ORDER BY created_at ASC
    LIMIT 1
  );

-- PASO 3: Agregar restricción única sobre nombre para evitar duplicados a nivel BD
-- (solo si no existe ya)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'real_accounts_nombre_key'
  ) THEN
    ALTER TABLE real_accounts ADD CONSTRAINT real_accounts_nombre_key UNIQUE (nombre);
  END IF;
END $$;
