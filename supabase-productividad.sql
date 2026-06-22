-- =============================================================
-- Seccion PRODUCTIVIDAD (Impulsy) - rondas de llamadas a leads
-- Correr UNA sola vez en el SQL Editor de Supabase.
-- No toca finanzas. Mide la productividad de agendamiento.
-- =============================================================

-- Ronda de llamadas (una "sesion de caza")
create table if not exists prod_sesiones (
  id          uuid primary key default gen_random_uuid(),
  inicio      timestamptz not null default now(),
  fin         timestamptz,
  nota        text,
  created_at  timestamptz default now()
);

-- Cada llamada de una ronda
create table if not exists prod_llamadas (
  id           uuid primary key default gen_random_uuid(),
  sesion_id    uuid not null references prod_sesiones(id) on delete cascade,
  inicio       timestamptz not null default now(),
  duracion_seg int,
  contesto     boolean not null default false,
  desenlace    text not null,
  cualif       jsonb,
  created_at   timestamptz default now()
);

create index if not exists prod_llamadas_sesion_idx on prod_llamadas(sesion_id);
create index if not exists prod_llamadas_inicio_idx  on prod_llamadas(inicio);

alter table prod_sesiones enable row level security;
alter table prod_llamadas enable row level security;

drop policy if exists "prod_sesiones_all" on prod_sesiones;
create policy "prod_sesiones_all" on prod_sesiones for all using (true) with check (true);

drop policy if exists "prod_llamadas_all" on prod_llamadas;
create policy "prod_llamadas_all" on prod_llamadas for all using (true) with check (true);
