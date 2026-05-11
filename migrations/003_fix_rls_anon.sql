-- ============================================================
-- IMPULSY · Migration 003 — Fix RLS para rol anon de Supabase
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- Deshabilitar RLS temporalmente para verificar
-- (o simplemente agregar políticas correctas para el rol anon)

-- ── clients ────────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON clients;
DROP POLICY IF EXISTS allow_anon_select  ON clients;
DROP POLICY IF EXISTS allow_anon_insert  ON clients;
DROP POLICY IF EXISTS allow_anon_update  ON clients;
DROP POLICY IF EXISTS allow_anon_delete  ON clients;

CREATE POLICY allow_anon_select ON clients FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON clients FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON clients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON clients FOR DELETE TO anon, authenticated USING (true);

-- ── projects ───────────────────────────────────────────────
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON projects;
DROP POLICY IF EXISTS allow_anon_select  ON projects;
DROP POLICY IF EXISTS allow_anon_insert  ON projects;
DROP POLICY IF EXISTS allow_anon_update  ON projects;
DROP POLICY IF EXISTS allow_anon_delete  ON projects;

CREATE POLICY allow_anon_select ON projects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON projects FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON projects FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON projects FOR DELETE TO anon, authenticated USING (true);

-- ── payments ───────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON payments;
DROP POLICY IF EXISTS allow_anon_select  ON payments;
DROP POLICY IF EXISTS allow_anon_insert  ON payments;
DROP POLICY IF EXISTS allow_anon_update  ON payments;
DROP POLICY IF EXISTS allow_anon_delete  ON payments;

CREATE POLICY allow_anon_select ON payments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON payments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON payments FOR DELETE TO anon, authenticated USING (true);

-- ── ledger_movements ───────────────────────────────────────
ALTER TABLE ledger_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON ledger_movements;
DROP POLICY IF EXISTS allow_anon_select  ON ledger_movements;
DROP POLICY IF EXISTS allow_anon_insert  ON ledger_movements;
DROP POLICY IF EXISTS allow_anon_update  ON ledger_movements;
DROP POLICY IF EXISTS allow_anon_delete  ON ledger_movements;

CREATE POLICY allow_anon_select ON ledger_movements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON ledger_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON ledger_movements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON ledger_movements FOR DELETE TO anon, authenticated USING (true);

-- ── real_accounts ──────────────────────────────────────────
ALTER TABLE real_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON real_accounts;
DROP POLICY IF EXISTS allow_anon_select  ON real_accounts;
DROP POLICY IF EXISTS allow_anon_insert  ON real_accounts;
DROP POLICY IF EXISTS allow_anon_update  ON real_accounts;
DROP POLICY IF EXISTS allow_anon_delete  ON real_accounts;

CREATE POLICY allow_anon_select ON real_accounts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON real_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON real_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON real_accounts FOR DELETE TO anon, authenticated USING (true);

-- ── pockets ────────────────────────────────────────────────
ALTER TABLE pockets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON pockets;
DROP POLICY IF EXISTS allow_anon_select  ON pockets;
DROP POLICY IF EXISTS allow_anon_insert  ON pockets;
DROP POLICY IF EXISTS allow_anon_update  ON pockets;
DROP POLICY IF EXISTS allow_anon_delete  ON pockets;

CREATE POLICY allow_anon_select ON pockets FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON pockets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON pockets FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON pockets FOR DELETE TO anon, authenticated USING (true);

-- ── debts ──────────────────────────────────────────────────
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all_public   ON debts;
DROP POLICY IF EXISTS allow_anon_select  ON debts;
DROP POLICY IF EXISTS allow_anon_insert  ON debts;
DROP POLICY IF EXISTS allow_anon_update  ON debts;
DROP POLICY IF EXISTS allow_anon_delete  ON debts;

CREATE POLICY allow_anon_select ON debts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY allow_anon_insert ON debts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update ON debts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete ON debts FOR DELETE TO anon, authenticated USING (true);

-- ── Verificación ───────────────────────────────────────────
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('clients','projects','payments','ledger_movements','real_accounts','pockets','debts')
ORDER BY tablename, policyname;
