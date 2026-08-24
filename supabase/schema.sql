-- Mecamocha Inventory System — Supabase SQL Editor
-- Jalankan seluruh file ini sekali pada Supabase Dashboard > SQL Editor.
-- Seluruh tabel bisnis memakai TEXT id agar kompatibel dengan ID local-first di aplikasi React.

create extension if not exists pgcrypto;

do $$ begin create type public.app_role as enum ('super_admin', 'manager', 'staff'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ingredient_type as enum ('raw', 'prepared'); exception when duplicate_object then null; end $$;
do $$ begin create type public.recipe_owner_type as enum ('menu', 'prepared'); exception when duplicate_object then null; end $$;
do $$ begin create type public.inventory_transaction_type as enum ('init', 'purchase', 'prepare', 'production', 'adjustment', 'reversal'); exception when duplicate_object then null; end $$;
do $$ begin create type public.stock_direction as enum ('in', 'out'); exception when duplicate_object then null; end $$;
do $$ begin create type public.transaction_status as enum ('posted', 'reversed'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role public.app_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id text primary key,
  name text not null unique,
  abbreviation text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id text primary key,
  name text not null,
  contact text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ingredients (
  id text primary key,
  code text not null unique,
  name text not null,
  category_id text not null references public.categories(id) on update cascade,
  unit_id text not null references public.units(id) on update cascade,
  type public.ingredient_type not null default 'raw',
  min_stock numeric(14,4) not null default 0 check (min_stock >= 0),
  current_stock numeric(14,4) not null default 0,
  cost_per_unit numeric(16,4) not null default 0 check (cost_per_unit >= 0),
  cogs_per_unit numeric(16,4) not null default 0 check (cogs_per_unit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ingredients_category_idx on public.ingredients(category_id);
create index if not exists ingredients_low_stock_idx on public.ingredients(is_active, current_stock, min_stock);

create table if not exists public.menus (
  id text primary key,
  name text not null unique,
  category text,
  price numeric(16,2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  active_recipe_version integer not null default 0 check (active_recipe_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recipes (
  id text primary key,
  owner_type public.recipe_owner_type not null,
  menu_id text references public.menus(id) on delete cascade,
  target_ingredient_id text references public.ingredients(id) on delete cascade,
  version integer not null check (version > 0),
  is_active boolean not null default true,
  yield_quantity numeric(14,4) not null default 1 check (yield_quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_owner_check check (
    (owner_type = 'menu' and menu_id is not null and target_ingredient_id is null)
    or (owner_type = 'prepared' and menu_id is null and target_ingredient_id is not null)
  )
);
create unique index if not exists recipes_menu_version_idx on public.recipes(menu_id, version) where menu_id is not null;
create unique index if not exists recipes_prepared_version_idx on public.recipes(target_ingredient_id, version) where target_ingredient_id is not null;
create unique index if not exists recipes_one_active_menu_idx on public.recipes(menu_id) where is_active and menu_id is not null;
create unique index if not exists recipes_one_active_prepared_idx on public.recipes(target_ingredient_id) where is_active and target_ingredient_id is not null;

create table if not exists public.recipe_details (
  id text primary key,
  recipe_id text not null references public.recipes(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  quantity numeric(14,4) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(recipe_id, ingredient_id)
);
create index if not exists recipe_details_ingredient_idx on public.recipe_details(ingredient_id);

create table if not exists public.inventory_transactions (
  id text primary key,
  type public.inventory_transaction_type not null,
  status public.transaction_status not null default 'posted',
  transaction_at timestamptz not null default now(),
  reference_no text not null unique,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  supplier_id text references public.suppliers(id) on delete set null,
  adjustment_reason text,
  reversed_transaction_id text references public.inventory_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reversal_reference_check check ((type = 'reversal' and reversed_transaction_id is not null) or (type <> 'reversal'))
);
create index if not exists transactions_date_idx on public.inventory_transactions(transaction_at desc);
create index if not exists transactions_supplier_idx on public.inventory_transactions(supplier_id);

create table if not exists public.transaction_lines (
  id text primary key,
  transaction_id text not null references public.inventory_transactions(id) on delete cascade,
  ingredient_id text not null references public.ingredients(id),
  direction public.stock_direction not null,
  quantity numeric(14,4) not null check (quantity > 0),
  unit_cost numeric(16,4),
  description text,
  created_at timestamptz not null default now()
);
create index if not exists transaction_lines_transaction_idx on public.transaction_lines(transaction_id);

create table if not exists public.menu_sales (
  transaction_id text not null references public.inventory_transactions(id) on delete cascade,
  menu_id text not null references public.menus(id),
  portions numeric(14,4) not null check (portions > 0),
  created_at timestamptz not null default now(),
  primary key(transaction_id, menu_id)
);

create table if not exists public.stock_movements (
  id text primary key,
  transaction_id text not null references public.inventory_transactions(id) on delete cascade,
  transaction_line_id text references public.transaction_lines(id) on delete set null,
  ingredient_id text not null references public.ingredients(id),
  direction public.stock_direction not null,
  quantity numeric(14,4) not null check (quantity > 0),
  balance_after numeric(14,4) not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_ingredient_time_idx on public.stock_movements(ingredient_id, created_at, id);
create index if not exists stock_movements_transaction_idx on public.stock_movements(transaction_id);

-- Tombstone membuat transaksi yang telah dihapus dari browser tidak diimpor kembali saat sinkronisasi.
create table if not exists public.transaction_tombstones (
  transaction_id text primary key,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  reason text
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists categories_updated_at on public.categories;
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
drop trigger if exists units_updated_at on public.units;
create trigger units_updated_at before update on public.units for each row execute function public.set_updated_at();
drop trigger if exists suppliers_updated_at on public.suppliers;
create trigger suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
drop trigger if exists ingredients_updated_at on public.ingredients;
create trigger ingredients_updated_at before update on public.ingredients for each row execute function public.set_updated_at();
drop trigger if exists menus_updated_at on public.menus;
create trigger menus_updated_at before update on public.menus for each row execute function public.set_updated_at();
drop trigger if exists recipes_updated_at on public.recipes;
create trigger recipes_updated_at before update on public.recipes for each row execute function public.set_updated_at();
drop trigger if exists inventory_transactions_updated_at on public.inventory_transactions;
create trigger inventory_transactions_updated_at before update on public.inventory_transactions for each row execute function public.set_updated_at();

-- Profil otomatis saat pengguna baru terdaftar. Ubah role pengguna pertama menjadi super_admin di SQL Editor.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.current_app_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function public.can_manage_inventory()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('super_admin', 'manager'), false)
$$;
create or replace function public.can_record_transactions()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('super_admin', 'manager', 'staff'), false)
$$;

-- Jalur aman untuk menambah mutasi: mengunci baris bahan sehingga balance_after tetap sekuensial.
create or replace function public.apply_stock_movement(
  p_transaction_id text, p_ingredient_id text, p_direction public.stock_direction,
  p_quantity numeric, p_description text default null, p_unit_cost numeric default null,
  p_line_id text default null, p_movement_id text default null
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_current numeric(14,4); v_cost numeric(16,4); v_balance numeric(14,4); v_id text;
begin
  if p_quantity is null or p_quantity <= 0 then raise exception 'Kuantitas harus lebih dari 0'; end if;
  select current_stock, cogs_per_unit into v_current, v_cost from public.ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Bahan % tidak ditemukan', p_ingredient_id; end if;
  v_balance := round(v_current + case when p_direction = 'in' then p_quantity else -p_quantity end, 4);
  update public.ingredients set
    current_stock = v_balance,
    cost_per_unit = case when p_direction = 'in' and p_unit_cost is not null then p_unit_cost else cost_per_unit end,
    cogs_per_unit = case
      when p_direction = 'in' and p_unit_cost is not null and v_current + p_quantity > 0
      then round(((greatest(v_current, 0) * v_cost) + (p_quantity * p_unit_cost)) / (greatest(v_current, 0) + p_quantity), 4)
      else cogs_per_unit end
  where id = p_ingredient_id;
  v_id := coalesce(p_movement_id, gen_random_uuid()::text);
  insert into public.stock_movements (id, transaction_id, transaction_line_id, ingredient_id, direction, quantity, balance_after, description)
  values (v_id, p_transaction_id, p_line_id, p_ingredient_id, p_direction, p_quantity, v_balance, p_description);
  return v_balance;
end;
$$;

-- RPC atomik yang dapat dipanggil frontend dengan header dan array lines JSONB.
-- Contoh p_header: {"id":"PURCHASE-...","type":"purchase","transaction_at":"2026-08-25","reference_no":"INV-001","supplier_id":"sup-1"}
-- Contoh p_lines: [{"ingredient_id":"raw-001","direction":"in","quantity":1000,"unit_cost":18,"description":"Gula"}]
create or replace function public.record_inventory_transaction(p_header jsonb, p_lines jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_tx_id text; v_line jsonb; v_line_id text; v_type public.inventory_transaction_type;
begin
  if not public.can_record_transactions() then raise exception 'Tidak berwenang mencatat transaksi'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Minimal satu baris mutasi diperlukan'; end if;
  v_tx_id := coalesce(p_header ->> 'id', gen_random_uuid()::text);
  v_type := coalesce(p_header ->> 'type', 'adjustment')::public.inventory_transaction_type;
  insert into public.inventory_transactions (id, type, transaction_at, reference_no, notes, created_by, supplier_id, adjustment_reason)
  values (v_tx_id, v_type, coalesce((p_header ->> 'transaction_at')::timestamptz, now()), coalesce(p_header ->> 'reference_no', v_tx_id), p_header ->> 'notes', auth.uid(), nullif(p_header ->> 'supplier_id', ''), p_header ->> 'adjustment_reason');
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_line_id := coalesce(v_line ->> 'id', gen_random_uuid()::text);
    insert into public.transaction_lines (id, transaction_id, ingredient_id, direction, quantity, unit_cost, description)
    values (v_line_id, v_tx_id, v_line ->> 'ingredient_id', (v_line ->> 'direction')::public.stock_direction, (v_line ->> 'quantity')::numeric, nullif(v_line ->> 'unit_cost', '')::numeric, v_line ->> 'description');
    perform public.apply_stock_movement(v_tx_id, v_line ->> 'ingredient_id', (v_line ->> 'direction')::public.stock_direction, (v_line ->> 'quantity')::numeric, v_line ->> 'description', nullif(v_line ->> 'unit_cost', '')::numeric, v_line_id, v_line ->> 'movement_id');
  end loop;
  return v_tx_id;
end;
$$;

-- Reversal menggantikan hard-delete di cloud sehingga audit dan saldo bahan tetap konsisten.
create or replace function public.reverse_inventory_transaction(p_transaction_id text, p_reason text default 'Dibatalkan')
returns text language plpgsql security definer set search_path = public as $$
declare v_original public.inventory_transactions%rowtype; v_reversal_id text := gen_random_uuid()::text; v_movement public.stock_movements%rowtype;
begin
  if not public.can_manage_inventory() then raise exception 'Hanya manager/super admin yang dapat membatalkan transaksi'; end if;
  select * into v_original from public.inventory_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_original.status = 'reversed' then raise exception 'Transaksi sudah dibatalkan'; end if;
  insert into public.inventory_transactions (id, type, transaction_at, reference_no, notes, created_by, reversed_transaction_id)
  values (v_reversal_id, 'reversal', now(), 'REV-' || v_original.reference_no || '-' || substr(v_reversal_id, 1, 6), p_reason, auth.uid(), p_transaction_id);
  for v_movement in select * from public.stock_movements where transaction_id = p_transaction_id order by created_at desc, id desc
  loop
    perform public.apply_stock_movement(v_reversal_id, v_movement.ingredient_id, case when v_movement.direction = 'in' then 'out'::public.stock_direction else 'in'::public.stock_direction end, v_movement.quantity, 'Reversal: ' || coalesce(v_movement.description, v_original.reference_no));
  end loop;
  update public.inventory_transactions set status = 'reversed' where id = p_transaction_id;
  return v_reversal_id;
end;
$$;

create or replace function public.daily_stock_report(p_date date default current_date)
returns table (
  ingredient_id text, code text, ingredient_name text, category_name text, unit_abbreviation text,
  opening_stock numeric, purchase_in numeric, prepare_in numeric, prepare_out numeric,
  production_out numeric, adjustment_net numeric, closing_stock numeric
) language sql stable security definer set search_path = public as $$
  with movements as (
    select sm.*, it.type, it.transaction_at::date as transaction_date,
      case when sm.direction = 'in' then sm.quantity else -sm.quantity end as signed_quantity
    from public.stock_movements sm
    join public.inventory_transactions it on it.id = sm.transaction_id
    left join public.transaction_tombstones tt on tt.transaction_id = sm.transaction_id
    where tt.transaction_id is null
  ), totals as (
    select i.id,
      coalesce(sum(m.signed_quantity) filter (where m.transaction_date < p_date), 0) as opening_stock,
      coalesce(sum(m.signed_quantity) filter (where m.transaction_date = p_date and m.type = 'purchase'), 0) as purchase_in,
      coalesce(sum(m.quantity) filter (where m.transaction_date = p_date and m.type = 'prepare' and m.direction = 'in'), 0) as prepare_in,
      coalesce(sum(m.quantity) filter (where m.transaction_date = p_date and m.type = 'prepare' and m.direction = 'out'), 0) as prepare_out,
      coalesce(sum(m.quantity) filter (where m.transaction_date = p_date and m.type = 'production' and m.direction = 'out'), 0) as production_out,
      coalesce(sum(m.signed_quantity) filter (where m.transaction_date = p_date and m.type in ('adjustment', 'init', 'reversal')), 0) as adjustment_net
    from public.ingredients i left join movements m on m.ingredient_id = i.id group by i.id
  )
  select i.id, i.code, i.name, c.name, u.abbreviation, t.opening_stock, t.purchase_in, t.prepare_in, t.prepare_out, t.production_out, t.adjustment_net,
    t.opening_stock + t.purchase_in + t.prepare_in - t.prepare_out - t.production_out + t.adjustment_net
  from public.ingredients i join public.categories c on c.id = i.category_id join public.units u on u.id = i.unit_id join totals t on t.id = i.id
  order by c.name, i.name;
$$;

-- RLS: staf dapat melihat dan mencatat mutasi; manager/super admin dapat mengelola master & resep.
alter table public.profiles enable row level security;
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid() or public.current_app_role() = 'super_admin');
create policy "profiles edit own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

do $$ declare t text; begin
  foreach t in array array['categories','units','suppliers','ingredients','menus','recipes','recipe_details','inventory_transactions','transaction_lines','menu_sales','stock_movements','transaction_tombstones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated read" on public.%I', t);
    execute format('create policy "authenticated read" on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists "managers write" on public.%I', t);
    execute format('create policy "managers write" on public.%I for all to authenticated using (public.can_manage_inventory()) with check (public.can_manage_inventory())', t);
  end loop;
end $$;

-- Beri akses execute pada RPC; fungsi memverifikasi role di dalamnya.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.record_inventory_transaction(jsonb, jsonb) to authenticated;
grant execute on function public.reverse_inventory_transaction(text, text) to authenticated;
grant execute on function public.daily_stock_report(date) to authenticated;

-- Data master minimum. Aman dijalankan ulang.
insert into public.categories (id, name) values ('cat-kitchen', 'Kitchen'), ('cat-bar', 'Bar') on conflict (id) do nothing;
insert into public.units (id, name, abbreviation) values
  ('unit-g', 'Gram', 'g'), ('unit-ml', 'Millilitre', 'ml'), ('unit-pcs', 'Pieces', 'pcs'), ('unit-pack', 'Pack', 'pack'), ('unit-can', 'Can', 'can'), ('unit-btl', 'Bottle', 'btl')
on conflict (id) do nothing;

-- Setelah user pertama mendaftar, jalankan sekali (ganti UUID):
-- update public.profiles set role = 'super_admin' where id = 'UUID_USER_ANDA';

-- Realtime untuk dashboard multi-perangkat.
do $$ begin
  alter publication supabase_realtime add table public.ingredients, public.inventory_transactions, public.stock_movements;
exception when duplicate_object then null; when undefined_object then null; end $$;
