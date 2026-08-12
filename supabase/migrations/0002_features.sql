-- Adds: per-invoice editable VAT rate, Google Calendar event linkage,
-- and a reminder queue for automated patient + clinician notifications.

alter table invoices add column if not exists vat_rate numeric(5,4) not null default 0.15;
alter table appointments add column if not exists google_event_id text;

create table if not exists reminder_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid not null references appointments(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('patient','clinician')),
  recipient_email text,
  send_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending' check (status in ('pending','sent','failed','cancelled')),
  error text,
  created_at timestamptz default now()
);

create index if not exists reminder_queue_due_idx on reminder_queue (status, send_at);

alter table reminder_queue enable row level security;
create policy "own reminders" on reminder_queue for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Whenever a booking is created/updated as 'scheduled', (re)queue reminders
-- for both patient and clinician, 24 hours before the appointment.
create or replace function queue_appointment_reminders()
returns trigger as $$
declare
  appt_ts timestamptz;
  patient_email text;
  clinician_email text;
begin
  -- clear any pending reminders for this appointment first (handles edits/cancellations)
  update reminder_queue set status = 'cancelled'
  where appointment_id = new.id and status = 'pending';

  if new.status <> 'scheduled' then
    return new;
  end if;

  appt_ts := (new.date + new.time)::timestamptz;

  select email into patient_email from clients where id = new.client_id;
  select email into clinician_email from settings where user_id = new.user_id;

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

drop trigger if exists trg_queue_appointment_reminders on appointments;
create trigger trg_queue_appointment_reminders
  after insert or update on appointments
  for each row execute function queue_appointment_reminders();

drop trigger if exists trg_cancel_reminders_on_delete on appointments;
create or replace function cancel_appointment_reminders()
returns trigger as $$
begin
  update reminder_queue set status = 'cancelled' where appointment_id = old.id and status = 'pending';
  return old;
end;
$$ language plpgsql security definer;

create trigger trg_cancel_reminders_on_delete
  before delete on appointments
  for each row execute function cancel_appointment_reminders();
