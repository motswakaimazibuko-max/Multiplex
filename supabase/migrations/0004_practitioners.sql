-- Adds multi-practitioner support (e.g. a GP and a Biokineticist sharing one
-- practice account) and points bookings + reminders + calendar sync at the
-- specific practitioner for each appointment, instead of one shared practice email.

create table if not exists practitioners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  discipline text not null check (discipline in ('gp', 'biokineticist')),
  registration_number text default '', -- HPCSA number (biokineticist) or MP/HPCSA number (GP)
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists practitioners_user_idx on practitioners (user_id);

alter table practitioners enable row level security;
create policy "own practitioners" on practitioners for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table appointments add column if not exists practitioner_id uuid references practitioners(id) on delete set null;
create index if not exists appointments_practitioner_idx on appointments (practitioner_id);

-- Reminders now go to the specific practitioner on the booking (falling back
-- to the practice-wide settings.email if the appointment has no practitioner set).
create or replace function queue_appointment_reminders()
returns trigger as $$
declare
  appt_ts timestamptz;
  patient_email text;
  clinician_email text;
begin
  update reminder_queue set status = 'cancelled'
  where appointment_id = new.id and status = 'pending';

  if new.status <> 'scheduled' then
    return new;
  end if;

  appt_ts := (new.date + new.time)::timestamptz;

  select email into patient_email from clients where id = new.client_id;

  if new.practitioner_id is not null then
    select email into clinician_email from practitioners where id = new.practitioner_id;
  end if;
  if clinician_email is null or clinician_email = '' then
    select email into clinician_email from settings where user_id = new.user_id;
  end if;

  if patient_email is not null and patient_email <> '' then
    insert into reminder_queue (user_id, appointment_id, recipient_type, recipient_email, send_at)
    values (new.user_id, new.id, 'patient', patient_email, appt_ts - interval '24 hours');
  end if;

  if clinician_email is not null and clinician_email <> '' then
    insert into reminder_queue (user_id, appointment_id, recipient_type, recipient_email, send_at)
    values (new.user_id, new.id, 'clinician', clinician_email, appt_ts - interval '2 hours');
  end if;

  return new;
end;
$$ language plpgsql security definer;
