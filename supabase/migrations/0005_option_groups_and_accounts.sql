-- Replaces the flat product_variants model with a Subway-style modifier
-- system (option groups -> option items), and adds financial accounts +
-- supplier payments (CXP) so purchases and orders both support partial /
-- split payments across accounts.

create type selection_type as enum ('single','multiple');

create table option_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  selection_type selection_type not null default 'single',
  is_required boolean not null default false,
  min_select integer not null default 0,
  max_select integer,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table option_items (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references option_groups(id) on delete cascade,
  name text not null,
  price_modifier numeric(10,2) not null default 0,
  ingredient_id uuid references ingredients(id) on delete set null,
  ingredient_quantity numeric(12,4),
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_option_items_group on option_items(option_group_id);

create table product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  option_group_id uuid not null references option_groups(id) on delete cascade,
  display_order integer not null default 0,
  unique (product_id, option_group_id)
);

create table order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  option_item_id uuid references option_items(id) on delete set null,
  name text not null,
  price_modifier numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_order_item_options_item on order_item_options(order_item_id);

-- drop the old flat-variant system in favor of option groups (pre-launch, no data to migrate)
alter table order_items drop column variant_id;
alter table price_history drop column variant_id;
alter table recipes drop constraint recipes_product_id_variant_id_key;
alter table recipes drop column variant_id;
drop table product_variants;

-- financial accounts (banks, cash boxes, "cuentas de orden")
create type account_type as enum ('cash','bank','digital_wallet','other');
create table financial_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_type account_type not null default 'bank',
  currency currency_code not null default 'USD',
  account_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table payments add column account_id uuid references financial_accounts(id);
alter table expenses add column account_id uuid references financial_accounts(id);
alter table cash_flow_entries add column account_id uuid references financial_accounts(id);

-- purchases: track supplier payments (CXP) separately from receiving stock
alter table purchases add column payment_status payment_status not null default 'pending';
create table purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency currency_code not null default 'USD',
  exchange_rate numeric(14,6) not null default 1,
  amount_currency numeric(14,2) not null,
  method payment_method not null,
  account_id uuid references financial_accounts(id),
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_purchase_payments_purchase on purchase_payments(purchase_id);

-- customers: national ID (cedula)
alter table customers add column cedula text;
create unique index idx_customers_cedula on customers(cedula) where cedula is not null;

alter table option_groups enable row level security;
alter table option_items enable row level security;
alter table product_option_groups enable row level security;
alter table order_item_options enable row level security;
alter table financial_accounts enable row level security;
alter table purchase_payments enable row level security;
