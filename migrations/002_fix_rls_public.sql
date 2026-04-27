-- ============================================================
-- IMPULSY · Migration 002 — Habilitar acceso público a tablas de negocio
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Habilitar RLS en las tablas (por si no está activado)
ALTER TABLE clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Agregar política permisiva para acceso anónimo a clients
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'clients' AND policyname = 'allow_all_public'
  ) THEN
    CREATE POLICY allow_all_public ON clients FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Agregar política permisiva para acceso anónimo a projects
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'allow_all_public'
  ) THEN
    CREATE POLICY allow_all_public ON projects FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Agregar política permisiva para acceso anónimo a payments
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payments' AND policyname = 'allow_all_public'
  ) THEN
    CREATE POLICY allow_all_public ON payments FOR ALL TO public USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Verificación
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('clients','projects','payments')
ORDER BY tablename, policyname;
