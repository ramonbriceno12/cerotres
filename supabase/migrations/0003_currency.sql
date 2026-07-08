-- Multi-currency support. USD is always the accounting base currency:
-- product prices, order.total, payment.amount and every report/cash-flow
-- number stay in USD. currency/exchange_rate/*_currency columns are the
-- snapshot of what the customer actually saw/paid at that moment.
create type currency_code as enum ('USD','EUR','VES');

create table exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency currency_code not null unique,
  rate numeric(14,6) not null check (rate > 0),
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

insert into exchange_rates (currency, rate) values
  ('USD', 1),
  ('EUR', 0.92),
  ('VES', 40)
on conflict do nothing;

alter table orders
  add column currency currency_code not null default 'USD',
  add column exchange_rate numeric(14,6) not null default 1,
  add column total_currency numeric(14,2) not null default 0;

alter table payments
  add column currency currency_code not null default 'USD',
  add column exchange_rate numeric(14,6) not null default 1,
  add column amount_currency numeric(14,2);

update payments set amount_currency = amount where amount_currency is null;
alter table payments alter column amount_currency set not null;

alter table exchange_rates enable row level security;
