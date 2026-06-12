-- ════════════════════════════════════════════════════════════════
-- MODO PERSONAL — Tablas separadas de las finanzas del negocio
-- Cómo ejecutar: Supabase → tu proyecto → SQL Editor → New query →
-- pega TODO este archivo → Run. Solo se ejecuta una vez.
-- ════════════════════════════════════════════════════════════════

-- Movimientos personales (cuenta Bancolombia)
create table if not exists personal_movements (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  naturaleza  text not null check (naturaleza in ('ingreso','egreso')),
  descripcion text not null,
  valor       numeric not null check (valor > 0),
  categoria   text,
  estado      text not null default 'confirmado' check (estado in ('confirmado','esperado')),
  notas       text,
  -- fuente identifica el origen para evitar duplicados:
  --   'manual' | 'salario:<id_movimiento_ledger>' | 'recurring:<id_plantilla>'
  fuente      text not null default 'manual',
  created_at  timestamptz default now(),
  updated_at  timestamptz
);

-- Gastos recurrentes personales (arriendo, suscripciones, etc.)
create table if not exists personal_recurring (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  valor          numeric not null,
  categoria      text,
  activo         boolean not null default true,
  duracion_meses int not null default 6,
  fecha_inicio   date not null,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);

-- Acceso igual al resto de tablas de la app (clave anon)
alter table personal_movements enable row level security;
alter table personal_recurring enable row level security;

drop policy if exists "personal_movements_all" on personal_movements;
create policy "personal_movements_all" on personal_movements
  for all using (true) with check (true);

drop policy if exists "personal_recurring_all" on personal_recurring;
create policy "personal_recurring_all" on personal_recurring
  for all using (true) with check (true);

-- Índice para el control de duplicados del puente de salario
create unique index if not exists personal_movements_fuente_unica
  on personal_movements (fuente) where fuente <> 'manual';
