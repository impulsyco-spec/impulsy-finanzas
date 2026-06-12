-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- MODO PERSONAL â€” PARTE 2: Bolsillos, Metas, Deudas y Presupuestos
-- CÃ³mo ejecutar: Supabase â†’ SQL Editor â†’ pestaÃ±a nueva (+) â†’
-- pega TODO este archivo â†’ Run. Igual que la vez pasada.
-- (El aviso de "destructive operations" sale por los `drop policy`,
--  que solo tocan permisos de estas tablas NUEVAS. Cero riesgo.)
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Bolsillos de metas (sobres del saldo: fondo de emergencia, viaje, moto...)
create table if not exists personal_pockets (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  emoji          text default 'ðŸŽ¯',
  meta_valor     numeric not null default 0,
  fecha_objetivo date,
  es_fondo       boolean not null default false, -- true = fondo de emergencia
  orden          int not null default 0,
  activo         boolean not null default true,
  created_at     timestamptz default now(),
  updated_at     timestamptz
);

-- Aportes y retiros de cada bolsillo (no mueven el saldo total de
-- Bancolombia: solo lo APARTAN del disponible libre)
create table if not exists personal_pocket_moves (
  id         uuid primary key default gen_random_uuid(),
  pocket_id  uuid not null references personal_pockets(id) on delete cascade,
  fecha      date not null,
  valor      numeric not null, -- positivo = aporte, negativo = retiro
  nota       text,
  created_at timestamptz default now()
);

-- Deudas personales (tarjetas, prÃ©stamos)
create table if not exists personal_debts (
  id                 uuid primary key default gen_random_uuid(),
  acreedor           text not null,
  tipo               text not null default 'otro' check (tipo in ('tarjeta','prestamo','credito','otro')),
  monto_original     numeric not null default 0,
  saldo_actual       numeric not null default 0,
  cuota_minima       numeric not null default 0,
  tasa_mensual       numeric,
  fecha_proximo_pago date,
  activa             boolean not null default true,
  notas              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz
);

-- Presupuesto mensual por categorÃ­a (tope de gasto con alertas)
create table if not exists personal_budgets (
  id            uuid primary key default gen_random_uuid(),
  categoria     text not null unique,
  tope_mensual  numeric not null,
  activo        boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz
);

-- Permisos (mismo patrÃ³n que el resto de la app)
alter table personal_pockets      enable row level security;
alter table personal_pocket_moves enable row level security;
alter table personal_debts        enable row level security;
alter table personal_budgets      enable row level security;

drop policy if exists "personal_pockets_all" on personal_pockets;
create policy "personal_pockets_all" on personal_pockets for all using (true) with check (true);

drop policy if exists "personal_pocket_moves_all" on personal_pocket_moves;
create policy "personal_pocket_moves_all" on personal_pocket_moves for all using (true) with check (true);

drop policy if exists "personal_debts_all" on personal_debts;
create policy "personal_debts_all" on personal_debts for all using (true) with check (true);

drop policy if exists "personal_budgets_all" on personal_budgets;
create policy "personal_budgets_all" on personal_budgets for all using (true) with check (true);


-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- ADQUISICIÃ“N: columna "origen" en clientes (Â¿de dÃ³nde viene?)
-- Supabase â†’ SQL Editor â†’ pestaÃ±a nueva â†’ pegar â†’ Run.
-- Una sola lÃ­nea, sin riesgo: solo AGREGA una columna opcional.
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
alter table clients add column if not exists origen text
  check (origen in ('campanas','referido','organico') or origen is null);
