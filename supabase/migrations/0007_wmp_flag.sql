-- Adds a Weight Management Program (WMP) flag to clients (patients), so a
-- patient can be tagged as being on the WMP from the Clients screen or right
-- after they're loaded/selected on the New booking screen.

alter table clients add column if not exists is_wmp boolean not null default false;
