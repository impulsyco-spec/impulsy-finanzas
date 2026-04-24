-- ═══════════════════════════════════════════════════════════════
-- IMPULSY · FINANCIAL EXTENSION MIGRATION
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- ── Crear tabla clients si no existe ──────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name    text NOT NULL,
  company text,
  email   text,
  phone   text,
  created_at timestamptz DEFAULT now()
);

-- ── Crear tabla projects si no existe ─────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        uuid REFERENCES clients(id),
  name             text NOT NULL,
  plan             text,
  total_amount     numeric(14,2) DEFAULT 0,
  installments     int DEFAULT 1,
  duration_months  int DEFAULT 1,
  start_date       date,
  status           text DEFAULT 'active',
  is_recurring     boolean DEFAULT false,
  created_at       timestamptz DEFAULT now()
);

-- ── Crear tabla payments si no existe ─────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid REFERENCES projects(id),
  amount        numeric(14,2) DEFAULT 0,
  actual_amount numeric(14,2),
  date          date,
  status        text DEFAULT 'pending',
  created_at    timestamptz DEFAULT now()
);

-- ── Extender projects ──────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS tipo_acuerdo text
    CHECK (tipo_acuerdo IN ('pago_unico','pagos_divididos','retainer','hibrido')),
  ADD COLUMN IF NOT EXISTS valor_total_acuerdo numeric(14,2),
  ADD COLUMN IF NOT EXISTS estado_proyecto text DEFAULT 'activo'
    CHECK (estado_proyecto IN ('activo','vencido','pausado','finalizado'));

-- ── Extender payments ──────────────────────────────────────────
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS ledger_movement_id uuid,
  ADD COLUMN IF NOT EXISTS notas text,
  ADD COLUMN IF NOT EXISTS fecha_cobro_real date;

-- ── Cuentas reales (DÓNDE está el dinero) ─────────────────────
CREATE TABLE IF NOT EXISTS real_accounts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,
  tipo         text DEFAULT 'bancaria'
    CHECK (tipo IN ('bancaria','digital','efectivo','tarjeta','personal')),
  saldo_inicial numeric(14,2) DEFAULT 0,
  activa       boolean DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

-- ── Bolsillos (PARA QUÉ es el dinero) ─────────────────────────
CREATE TABLE IF NOT EXISTS pockets (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre             text NOT NULL,
  porcentaje_default numeric(5,2),
  orden              int DEFAULT 0,
  activo             boolean DEFAULT true
);

INSERT INTO pockets (nombre, porcentaje_default, orden) VALUES
  ('Operación',  45, 1),
  ('Sueldo',     30, 2),
  ('Reserva',    25, 3),
  ('Impuestos',  null, 4),
  ('Inversión',  null, 5),
  ('Deuda',      null, 6)
ON CONFLICT DO NOTHING;

-- ── Libro maestro de movimientos (FUENTE ÚNICA DE VERDAD) ─────
CREATE TABLE IF NOT EXISTS ledger_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           date NOT NULL,
  tipo_movimiento text NOT NULL
    CHECK (tipo_movimiento IN (
      'ingreso_operativo','egreso_operativo','transferencia',
      'retiro_fundador','aporte_capital',
      'deuda_recibida','pago_deuda','impuesto','ajuste'
    )),
  naturaleza      text NOT NULL
    CHECK (naturaleza IN ('ingreso','egreso','neutro')),
  descripcion     text NOT NULL,
  valor           numeric(14,2) NOT NULL CHECK (valor > 0),
  categoria       text,
  estado          text DEFAULT 'confirmado'
    CHECK (estado IN ('esperado','facturado','confirmado','vencido','anulado')),
  cuenta_real_id  uuid REFERENCES real_accounts(id),
  pocket_id       uuid REFERENCES pockets(id),
  project_id      uuid REFERENCES projects(id),
  client_id       uuid REFERENCES clients(id),
  payment_id      uuid REFERENCES payments(id),
  tercero         text,
  fecha_vencimiento date,
  notas           text,
  personal_flag   boolean DEFAULT false,
  tipo_retiro     text
    CHECK (tipo_retiro IN (
      'sueldo_aprobado','anticipo_sueldo',
      'retiro_extraordinario','gasto_personal_empresa'
    )),
  mes             text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- FK de payments a ledger (agregar después de crear la tabla)
ALTER TABLE payments
  ADD CONSTRAINT IF NOT EXISTS payments_ledger_movement_id_fkey
  FOREIGN KEY (ledger_movement_id) REFERENCES ledger_movements(id);

-- ── Deudas ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acreedor           text NOT NULL,
  tipo               text DEFAULT 'prestamo'
    CHECK (tipo IN ('prestamo','tarjeta','credito_proveedor','otro')),
  monto_original     numeric(14,2) DEFAULT 0,
  saldo_actual       numeric(14,2) DEFAULT 0,
  cuota_minima       numeric(14,2) DEFAULT 0,
  tasa_mensual       numeric(6,4),
  fecha_proximo_pago date,
  activa             boolean DEFAULT true,
  notas              text,
  created_at         timestamptz DEFAULT now()
);

-- ── Alertas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,
  severidad    text DEFAULT 'amarillo'
    CHECK (severidad IN ('verde','amarillo','rojo')),
  mensaje      text,
  entidad_tipo text,
  entidad_id   uuid,
  resuelta     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- ── RLS (habilitar pero permitir todo para usuarios auth) ─────
ALTER TABLE real_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "allow_all_authenticated" ON real_accounts FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "allow_all_authenticated" ON pockets FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "allow_all_authenticated" ON ledger_movements FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "allow_all_authenticated" ON debts FOR ALL USING (true);
CREATE POLICY IF NOT EXISTS "allow_all_authenticated" ON alerts FOR ALL USING (true);
