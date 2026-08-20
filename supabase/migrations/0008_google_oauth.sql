-- Replaces the old browser-only, ~1-hour-session Google Calendar connection
-- with a real server-side OAuth connection: tokens are stored here and used
-- by edge functions to (a) push bookings to Google automatically, even when
-- nobody has the app open, and (b) pull back reschedules/cancellations made
-- directly in Google Calendar on a schedule — genuine two-way sync.

create table if not exists google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade, -- practice_owner_id
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  calendar_id text not null default 'primary',
  sync_token text,             -- Google's incremental-sync cursor; null = do a fresh full pull first
  last_synced_at timestamptz,
  connected_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table google_calendar_connections enable row level security;

-- Tokens must never reach the browser. Only the service role (used inside
-- edge functions, which bypasses RLS) can read/write the full row. The app
-- itself is only ever allowed to read a few non-secret status columns, to
-- show "Connected" / "Not connected" in Settings.
revoke all on google_calendar_connections from authenticated, anon;
grant select (user_id, calendar_id, last_synced_at, connected_by, created_at) on google_calendar_connections to authenticated;

create policy "practice sees its own connection status" on google_calendar_connections
  for select using (user_id = get_practice_owner_id());

-- Bookkeeping the sync functions need on appointments:
--   updated_at        - so pull-sync can tell "changed in Google after we
--                        last touched it locally" from "we just haven't
--                        synced yet"
--   google_synced_at  - last time push OR pull successfully reconciled
--                        this appointment with its Google event
alter table appointments add column if not exists updated_at timestamptz not null default now();
alter table appointments add column if not exists google_synced_at timestamptz;

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_appointments_updated_at on appointments;
create trigger trg_appointments_updated_at
  before update on appointments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- One-time manual step, same pattern as 0003_cron_setup.sql: after
-- deploying the google-calendar-pull Edge Function, run this in the SQL
-- Editor with your own project ref + service role key filled in, to poll
-- Google every 15 minutes for changes made directly in Google Calendar.
-- ---------------------------------------------------------------------
-- select cron.schedule(
--   'pull-google-calendar-changes',
--   '*/15 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-calendar-pull',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
-- To remove it later: select cron.unschedule('pull-google-calendar-changes');
