-- 03/cerotres dark kitchen management system - initial schema
create extension if not exists "pgcrypto";

-- ============ ENUMS ============
create type user_role as enum ('admin','manager','kitchen','delivery','customer');
create type order_status as enum ('pending','confirmed','in_kitchen','ready','out_for_delivery','delivered','cancelled');
create type order_type as enum ('delivery','pickup');
create type kitchen_item_status as enum ('pending','preparing','ready');
create type payment_method as enum ('cash','card','transfer','other');
create type payment_status as enum ('pending','paid','partial','refunded','failed');
create type purchase_status as enum ('pending','received','cancelled');
create type movement_type as enum ('purchase_in','sale_out','adjustment_in','adjustment_out','waste','production_in','production_out');
create type unit_type as enum ('weight','volume','count');
create type expense_category as enum ('rent','utilities','salaries','marketing','maintenance','supplies','delivery','other');
create type cash_flow_type as enum ('income','expense');
create type notification_channel as enum ('email');
create type notification_type as enum ('order_confirmed','order_in_kitchen','order_ready','order_out_for_delivery','order_delivered','order_cancelled','welcome');
create type notification_status as enum ('pending','sent','failed');

-- ============ HELPERS ============
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ IDENTITY ============
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create or replace function handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer'),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone'
  );

  if coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer') = 'customer' then
    insert into customers (user_id, full_name, email, phone)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), new.email, new.raw_user_meta_data->>'phone');
  end if;

  return new;
end;
$$;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============ CUSTOMERS ============
create table customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null,
  email text,
  phone text not null,
  instagram_handle text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_phone on customers(phone);
create index idx_customers_email on customers(email);
create trigger trg_customers_updated_at before update on customers
  for each row execute function set_updated_at();

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text not null default 'Casa',
  address_line text not null,
  city text,
  state text,
  reference text,
  latitude numeric,
  longitude numeric,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_addresses_customer on customer_addresses(customer_id);

-- ============ CATALOG ============
create table units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  abbreviation text not null unique,
  unit_type unit_type not null,
  created_at timestamptz not null default now()
);

create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  description text,
  category_id uuid references categories(id) on delete set null,
  base_price numeric(10,2) not null default 0 check (base_price >= 0),
  image_url text,
  track_inventory boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_category on products(category_id);
create trigger trg_products_updated_at before update on products
  for each row execute function set_updated_at();

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  sku text unique,
  price_modifier numeric(10,2) not null default 0,
  is_default boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index idx_variants_product on product_variants(product_id);

create table price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  old_price numeric(10,2),
  new_price numeric(10,2) not null,
  changed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ============ SUPPLIERS & INGREDIENTS ============
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_suppliers_updated_at before update on suppliers
  for each row execute function set_updated_at();

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  unit_id uuid not null references units(id),
  default_supplier_id uuid references suppliers(id) on delete set null,
  cost_per_unit numeric(12,4) not null default 0 check (cost_per_unit >= 0),
  current_stock numeric(12,3) not null default 0,
  min_stock numeric(12,3) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_ingredients_updated_at before update on ingredients
  for each row execute function set_updated_at();

-- ============ RECIPES ============
create table recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  variant_id uuid references product_variants(id) on delete cascade,
  name text not null,
  yield_quantity numeric(10,2) not null default 1,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_id)
);
create trigger trg_recipes_updated_at before update on recipes
  for each row execute function set_updated_at();

create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),
  unit_id uuid not null references units(id),
  created_at timestamptz not null default now()
);
create index idx_recipe_ingredients_recipe on recipe_ingredients(recipe_id);

-- ============ PURCHASES ============
create sequence purchase_number_seq;
create table purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_number text not null unique,
  supplier_id uuid not null references suppliers(id),
  status purchase_status not null default 'pending',
  invoice_number text,
  purchase_date date not null default current_date,
  received_date date,
  total numeric(12,2) not null default 0,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_purchases_updated_at before update on purchases
  for each row execute function set_updated_at();

create or replace function set_purchase_number()
returns trigger language plpgsql as $$
begin
  if new.purchase_number is null then
    new.purchase_number := 'PO-' || lpad(nextval('purchase_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger trg_purchases_number before insert on purchases
  for each row execute function set_purchase_number();

create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,4) not null check (unit_cost >= 0),
  subtotal numeric(12,2) generated always as (quantity * unit_cost) stored
);
create index idx_purchase_items_purchase on purchase_items(purchase_id);

-- ============ INVENTORY ============
create table inventory_movements (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id),
  movement_type movement_type not null,
  quantity numeric(12,3) not null check (quantity > 0),
  resulting_stock numeric(12,3) not null default 0,
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_inventory_movements_ingredient on inventory_movements(ingredient_id);

create or replace function apply_inventory_movement()
returns trigger language plpgsql as $$
declare
  v_sign int;
  v_new_stock numeric(12,3);
begin
  v_sign := case
    when new.movement_type in ('purchase_in','adjustment_in','production_in') then 1
    else -1
  end;

  update ingredients
    set current_stock = current_stock + (v_sign * new.quantity)
    where id = new.ingredient_id
    returning current_stock into v_new_stock;

  new.resulting_stock := v_new_stock;
  return new;
end;
$$;
create trigger trg_inventory_movement before insert on inventory_movements
  for each row execute function apply_inventory_movement();

-- ============ ORDERS ============
create sequence order_number_seq;
create table orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references customers(id),
  status order_status not null default 'pending',
  order_type order_type not null default 'delivery',
  delivery_address_id uuid references customer_addresses(id),
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  delivery_fee numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method payment_method,
  payment_status payment_status not null default 'pending',
  notes text,
  estimated_ready_at timestamptz,
  placed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_customer on orders(customer_id);
create index idx_orders_status on orders(status);
create index idx_orders_placed_at on orders(placed_at);
create trigger trg_orders_updated_at before update on orders
  for each row execute function set_updated_at();

create or replace function set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null then
    new.order_number := 'ORD-' || lpad(nextval('order_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;
create trigger trg_orders_number before insert on orders
  for each row execute function set_order_number();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id),
  variant_id uuid references product_variants(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  subtotal numeric(12,2) generated always as (quantity * unit_price) stored,
  notes text,
  kitchen_status kitchen_item_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index idx_order_items_order on order_items(order_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status order_status not null,
  changed_by uuid references profiles(id),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_order_status_history_order on order_status_history(order_id);

-- ============ PAYMENTS ============
create table payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  method payment_method not null,
  status payment_status not null default 'paid',
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_payments_order on payments(order_id);

-- ============ FINANCE ============
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category expense_category not null,
  description text not null,
  amount numeric(12,2) not null check (amount > 0),
  expense_date date not null default current_date,
  is_recurring boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_expenses_date on expenses(expense_date);

create table cash_flow_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type cash_flow_type not null,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  description text,
  entry_date date not null default current_date,
  related_order_id uuid references orders(id),
  related_expense_id uuid references expenses(id),
  related_purchase_id uuid references purchases(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_cash_flow_date on cash_flow_entries(entry_date);
create index idx_cash_flow_type on cash_flow_entries(entry_type);

-- ============ NOTIFICATIONS ============
create table notifications_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id),
  order_id uuid references orders(id),
  channel notification_channel not null default 'email',
  notification_type notification_type not null,
  recipient text not null,
  subject text,
  status notification_status not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_order on notifications_log(order_id);

-- ============ SETTINGS ============
create table business_settings (
  id boolean primary key default true constraint single_row check (id),
  business_name text not null default '03/cerotres',
  currency text not null default 'USD',
  default_delivery_fee numeric(10,2) not null default 0,
  tax_rate numeric(5,2) not null default 0,
  instagram_handle text default '03__cerotres',
  updated_at timestamptz not null default now()
);
insert into business_settings (id) values (true);
create trigger trg_settings_updated_at before update on business_settings
  for each row execute function set_updated_at();

-- ============ ROW LEVEL SECURITY ============
-- All data access goes through the backend API using the service role key,
-- which bypasses RLS by design. RLS is enabled with no policies so the
-- anon/authenticated keys cannot read or write anything directly.
alter table profiles enable row level security;
alter table customers enable row level security;
alter table customer_addresses enable row level security;
alter table units enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_variants enable row level security;
alter table price_history enable row level security;
alter table suppliers enable row level security;
alter table ingredients enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table inventory_movements enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_status_history enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table cash_flow_entries enable row level security;
alter table notifications_log enable row level security;
alter table business_settings enable row level security;
