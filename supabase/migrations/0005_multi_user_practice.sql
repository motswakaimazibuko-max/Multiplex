-- Lets a practice be shared by up to a few logins (Practice Manager, GP,
-- Biokineticist) that all see the same clients/bookings/invoices, instead of
-- each Supabase Auth user having their own isolated practice.
--
-- Model: whoever first signs in "owns" the practice (their auth uid is the
-- tenant id already used as `user_id` throughout the schema — nothing about
-- existing data changes). The owner invites teammates by email from
-- Settings; when that teammate signs in for the first time, a trigger links
-- their new auth account to the practice automatically.

create table if not exists practice_members (
  id uuid primary key default gen_random_uuid(),
  practice_owner_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid references auth.users(id) on delete cascade, -- null until they first sign in
  name text not null default '',
  email text not null,
  role text not null check (role in ('manager', 'gp', 'biokineticist')),
  invited_at timestamptz default now(),
  joined_at timestamptz
);

create unique index if not exists practice_members_owner_email_idx on practice_members (practice_owner_id, lower(email));
create index if not exists practice_members_member_idx on practice_members (member_user_id);

-- Resolves "which practice does the currently signed-in user belong to" —
-- their own uid if they're an owner (or not yet invited anywhere), otherwise
-- the owner id of the practice that invited them. security definer so it can
-- read practice_members regardless of that table's own RLS.
create or replace function get_practice_owner_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select coalesce(
    (select practice_owner_id from practice_members where member_user_id = auth.uid() limit 1),
    auth.uid()
  );
$$;

-- Auto-link an invited teammate the moment their account is created (first
-- magic-link sign-in) by matching the email the manager invited.
create or replace function link_practice_invite()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update practice_members
  set member_user_id = new.id, joined_at = now()
  where lower(email) = lower(new.email) and member_user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_link_invite on auth.users;
create trigger on_auth_user_created_link_invite
  after insert on auth.users
  for each row execute function link_practice_invite();

alter table practice_members enable row level security;
create policy "roster visible to practice" on practice_members
  for select using (practice_owner_id = get_practice_owner_id());
create policy "owner invites" on practice_members
  for insert with check (practice_owner_id = auth.uid());
create policy "owner updates roster" on practice_members
  for update using (practice_owner_id = auth.uid());
create policy "owner removes teammates" on practice_members
  for delete using (practice_owner_id = auth.uid());

-- Swap every existing "own X" policy from auth.uid() to get_practice_owner_id()
-- so all three logins share one practice's data instead of seeing separate ones.
drop policy if exists "own settings" on settings;
create policy "practice settings" on settings for all
  using (user_id = get_practice_owner_id()) with check (user_id = get_practice_owner_id());

drop policy if exists "own clients" on clients;
create policy "practice clients" on clients for all
  using (user_id = get_practice_owner_id()) with check (user_id = get_practice_owner_id());

drop policy if exists "own appointments" on appointments;
create policy "practice appointments" on appointments for all
  using (user_id = get_practice_owner_id()) with check (user_id = get_practice_owner_id());

drop policy if exists "own invoices" on invoices;
create policy "practice invoices" on invoices for all
  using (user_id = get_practice_owner_id()) with check (user_id = get_practice_owner_id());

drop policy if exists "own invoice items" on invoice_items;
create policy "practice invoice items" on invoice_items for all
  using (invoice_id in (select id from invoices where user_id = get_practice_owner_id()))
  with check (invoice_id in (select id from invoices where user_id = get_practice_owner_id()));

drop policy if exists "own reminders" on reminder_queue;
create policy "practice reminders" on reminder_queue for all
  using (user_id = get_practice_owner_id()) with check (user_id = get_practice_owner_id());

drop policy if exists "own practitioners" on practitioners;
create policy "practice practitioners" on practitioners for all
  using (user_id = get_practice_owner_id()) with check (user_id = get_practice_owner_id());
