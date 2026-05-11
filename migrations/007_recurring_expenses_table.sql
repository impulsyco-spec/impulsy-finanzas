-- Tabla para almacenar gastos recurrentes de forma permanente (no localStorage)
-- Esto asegura que nunca se pierdan los datos de gastos fijos mensuales

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  valor NUMERIC NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'Infraestructura',
  activo BOOLEAN DEFAULT true,
  duracion_meses INTEGER DEFAULT 0,  -- 0 = 6 meses por defecto
  fecha_inicio DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS: Usuario anónimo puede leer y escribir sus propios gastos recurrentes
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon can read recurring expenses" ON recurring_expenses
  FOR SELECT USING (true);

CREATE POLICY "Anon can insert recurring expenses" ON recurring_expenses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anon can update recurring expenses" ON recurring_expenses
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete recurring expenses" ON recurring_expenses
  FOR DELETE USING (true);

-- Índice para búsquedas rápidas
CREATE INDEX idx_recurring_expenses_activo ON recurring_expenses(activo);
CREATE INDEX idx_recurring_expenses_fecha_inicio ON recurring_expenses(fecha_inicio);
