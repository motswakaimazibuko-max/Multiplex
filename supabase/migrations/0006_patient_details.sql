-- Expands "clients" (patients) with the personal, contact and medical aid
-- details needed when a patient is captured from the New booking screen —
-- independent of which practitioner (if any) is picked for the booking.

alter table clients add column if not exists id_number text;
alter table clients add column if not exists date_of_birth date;
alter table clients add column if not exists gender text;
alter table clients add column if not exists address text;

alter table clients add column if not exists medical_aid_scheme text;
alter table clients add column if not exists medical_aid_number text;
alter table clients add column if not exists medical_aid_dependent_code text;
alter table clients add column if not exists main_member_name text;
