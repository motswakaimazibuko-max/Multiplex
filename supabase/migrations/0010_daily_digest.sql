-- Nightly digest: each practitioner gets ONE email the evening before,
-- listing every patient booked for the next day (separate from the
-- existing per-appointment reminder_queue system in 0002_features.sql,
-- which sends the practitioner a reminder 2 hours before each individual
-- booking). This table just records what's been sent, so the digest is
-- idempotent if the cron job below ever fires twice for the same evening.

create table if not exists daily_digest_log (
  id uuid primary key default gen_random_uuid(),
  practitioner_id uuid not null references practitioners(id) on delete cascade,
  digest_date date not null, -- the day the digest is ABOUT (tomorrow, relative to when it's sent)
  appointment_count integer not null default 0,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  error text,
  sent_at timestamptz default now(),
  unique (practitioner_id, digest_date)
);

create index if not exists daily_digest_log_lookup on daily_digest_log (practitioner_id, digest_date);

alter table daily_digest_log enable row level security;
create policy "practice sees its own digest log" on daily_digest_log for select
  using (practitioner_id in (select id from practitioners where user_id = get_practice_owner_id()));
-- No insert/update/delete policy for authenticated users — only the
-- service-role edge function (send-daily-digest) writes to this table.
