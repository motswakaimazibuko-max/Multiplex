-- Biokinetics booking + invoicing schema
-- Run this in Supabase SQL Editor (or via CLI migrations)

create extension if not exists "pgcrypto";

create table if not exists settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  practice_name text not null default '',
  practitioner_name text default '',
  hpcsa_number text default '',
  bhf_number text default '',
  email text default '',
  phone text default '',
  address text default '',
  updated_at timestamptz default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references clients(id) on delete cascade,
  date date not null,
  time time not null,
  duration_minutes int not null default 45,
  session_type text not null,
  rate numeric(10,2) not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled','completed','cancelled','no-show')),
  notes text,
  created_at timestamptz default now()
);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  client_name text not null,
  appointment_id uuid references appointments(id) on delete set null,
  number text not null,
  date date not null default current_date,
  subtotal numeric(10,2) not null,
  vat numeric(10,2) not null,
  total numeric(10,2) not null,
  status text not null default 'unpaid' check (status in ('paid','unpaid')),
  created_at timestamptz default now()
);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  description text not null,
  qty numeric(10,2) not null default 1,
  rate numeric(10,2) not null default 0,
  amount numeric(10,2) not null
);

create unique index if not exists invoices_user_number_idx on invoices (user_id, number);
create index if not exists appointments_user_date_idx on appointments (user_id, date);
create index if not exists clients_user_idx on clients (user_id);

-- Row Level Security: every practitioner only ever sees their own data
alter table settings enable row level security;
alter table clients enable row level security;
alter table appointments enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;

create policy "own settings" on settings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own clients" on clients for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own appointments" on appointments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own invoices" on invoices for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own invoice items" on invoice_items for all
  using (invoice_id in (select id from invoices where user_id = auth.uid()))
  with check (invoice_id in (select id from invoices where user_id = auth.uid()));
