-- Run this AFTER deploying the send-reminders Edge Function.
-- Replace YOUR-PROJECT-REF and YOUR-SERVICE-ROLE-KEY below, then run in SQL Editor.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-appointment-reminders',
  '*/10 * * * *',  -- every 10 minutes
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To check it's running: select * from cron.job;
-- To see run history:    select * from cron.job_run_details order by start_time desc limit 20;
-- To remove it later:    select cron.unschedule('send-appointment-reminders');
