-- Run this AFTER deploying the send-daily-digest Edge Function.
-- Replace YOUR-PROJECT-REF and YOUR-SERVICE-ROLE-KEY below, then run in SQL Editor.
--
-- South Africa is a fixed UTC+2 with no DST, so 18:30 SAST is always 16:30 UTC
-- — no seasonal adjustment needed.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'send-daily-digest',
  '30 16 * * *',  -- 16:30 UTC = 18:30 SAST, every day
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-daily-digest',
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
-- To remove it later:    select cron.unschedule('send-daily-digest');
