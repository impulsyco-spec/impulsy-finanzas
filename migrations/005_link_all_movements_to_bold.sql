-- Migración 005: Enlazar TODOS los movimientos existentes a la cuenta BOLD
-- Ejecutar en Supabase SQL Editor > Run

DO $$
DECLARE
  bold_id UUID;
  rows_updated INT;
BEGIN
  -- Buscar cuenta BOLD (nombre contiene 'bold', sin distinción de mayúsculas)
  SELECT id INTO bold_id
  FROM real_accounts
  WHERE LOWER(nombre) LIKE '%bold%'
  LIMIT 1;

  IF bold_id IS NULL THEN
    RAISE NOTICE 'No se encontró cuenta BOLD. Verifica que exista en real_accounts.';
  ELSE
    -- Actualizar TODOS los movimientos a la cuenta BOLD
    UPDATE ledger_movements
    SET cuenta_real_id = bold_id;

    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    RAISE NOTICE '% movimientos enlazados a BOLD (id: %)', rows_updated, bold_id;
  END IF;
END $$;
