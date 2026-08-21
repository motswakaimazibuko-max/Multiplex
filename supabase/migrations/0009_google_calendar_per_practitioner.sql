-- Lets a practice connect MORE THAN ONE Google account: each practitioner
-- (GP, biokineticist, etc.) connects their own Google Calendar, and their
-- bookings sync only to that calendar. Replaces the old one-connection-per-
-- practice model from 0008_google_oauth.sql, where the whole practice could
-- only ever link a single shared Google account.
--
-- BREAKING CHANGE: any connection made under the old model (keyed by
-- user_id/practice owner) is dropped by this migration — practitioners need
-- to reconnect their calendars individually from Settings afterwards. If
-- you haven't deployed 0008 yet, this file supersedes it; just run both in
-- order (0008 then 0009), or skip straight to using this schema.

alter table google_calendar_connections drop constraint if exists google_calendar_connections_pkey;

alter table google_calendar_connections
  add column if not exists practitioner_id uuid references practitioners(id) on delete cascade,
  add column if not exists google_email text; -- the connected Google account's own email, purely for display in Settings

-- Old practice-wide rows have no practitioner to attach to — they're no
-- longer valid under the per-practitioner model, so clear them out. Anyone
-- who was relying on the old shared connection just reconnects per
-- practitioner in Settings.
delete from google_calendar_connections where practitioner_id is null;

alter table google_calendar_connections
  alter column practitioner_id set not null;

alter table google_calendar_connections
  add constraint google_calendar_connections_pkey primary key (practitioner_id);

create index if not exists google_calendar_connections_user_idx on google_calendar_connections (user_id);

-- Re-grant/re-create the status-only policy to include the new columns.
-- Tokens (access_token, refresh_token, sync_token) still never reach the
-- browser — only service-role edge functions can read/write those.
revoke all on google_calendar_connections from authenticated, anon;
grant select (practitioner_id, user_id, google_email, calendar_id, last_synced_at, connected_by, created_at)
  on google_calendar_connections to authenticated;

drop policy if exists "practice sees its own connection status" on google_calendar_connections;
create policy "practice sees its own connections status" on google_calendar_connections
  for select using (user_id = get_practice_owner_id());
