// Supabase Edge Function: send-reminders
// Runs on a schedule (via pg_cron + pg_net), finds due rows in reminder_queue,
// sends an email via Resend, and marks them sent/failed.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY   - from resend.com
//   SUPABASE_URL     - auto-provided
//   SUPABASE_SERVICE_ROLE_KEY - auto-provided

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_EMAIL = Deno.env.get('REMINDER_FROM_EMAIL') || 'reminders@resend.dev';

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: due, error } = await supabase
      .from('reminder_queue')
      .select('*, appointment:appointments(date, time, session_type, client:clients(name), user_id)')
      .eq('status', 'pending')
      .lte('send_at', new Date().toISOString())
      .limit(50);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    let sent = 0;
    let failed = 0;

    for (const row of due) {
      const appt = row.appointment;
      const clientName = appt?.client?.name || 'your patient';
      const isPatient = row.recipient_type === 'patient';

      const subject = isPatient
        ? `Appointment reminder — ${appt?.date} at ${appt?.time?.slice(0, 5)}`
        : `Upcoming appointment — ${clientName} at ${appt?.time?.slice(0, 5)}`;

      const body = isPatient
        ? `Hi, this is a reminder of your ${appt?.session_type} appointment on ${appt?.date} at ${appt?.time?.slice(0, 5)}. Please reply if you need to reschedule.`
        : `Reminder: you have ${clientName} booked for a ${appt?.session_type} on ${appt?.date} at ${appt?.time?.slice(0, 5)}.`;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: row.recipient_email,
            subject,
            text: body,
          }),
        });
        if (!res.ok) throw new Error(await res.text());

        await supabase.from('reminder_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', row.id);
        sent++;
      } catch (e) {
        await supabase.from('reminder_queue').update({ status: 'failed', error: String(e) }).eq('id', row.id);
        failed++;
      }
    }

    return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
