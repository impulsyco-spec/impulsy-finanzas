-- Migración 006: Vincular payments ↔ ledger_movements
-- Ejecutar en Supabase SQL Editor > Run

ALTER TABLE payments
ADD COLUMN IF NOT EXISTS ledger_movement_id UUID REFERENCES ledger_movements(id) ON DELETE SET NULL;
