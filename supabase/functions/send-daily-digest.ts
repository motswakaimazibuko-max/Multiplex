// Supabase Edge Function: send-daily-digest
// Runs on a schedule (via pg_cron + pg_net, see 0011_daily_digest_cron.sql)
// at 18:30 SAST every day. For each practitioner with at least one
// 'scheduled' booking tomorrow, sends ONE email listing every patient
// booked for that day, sorted by time.
//
// This is separate from the existing per-appointment reminder system
// (reminder_queue / send-reminders), which emails the practitioner 2 hours
// before each individual booking — this is a single end-of-day overview
// instead.
//
// Bookings with no practitioner assigned aren't included (there's no
// calendar/inbox to send them to) — same limitation as Google Calendar sync.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY   - from resend.com (shared with send-reminders)
//   SUPABASE_URL     - auto-provided
//   SUPABASE_SERVICE_ROLE_KEY - auto-provided
//   REMINDER_FROM_EMAIL - optional, defaults to reminders@resend.dev (shared with send-reminders)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const FROM_EMAIL = Deno.env.get('REMINDER_FROM_EMAIL') || 'reminders@resend.dev';

function formatDate(dateStr: string) {
  // dateStr is 'YYYY-MM-DD' — build the Date at noon UTC so it can't drift
  // to the previous/next day when formatted, regardless of server timezone.
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
}

function tomorrowSADate(): string {
  // South Africa is a fixed UTC+2 (no DST) — shift "now" forward 2 hours to
  // get SA wall-clock time, then take tomorrow's date from that.
  const saNow = new Date(Date.now() + 2 * 3600 * 1000);
  saNow.setUTCDate(saNow.getUTCDate() + 1);
  return saNow.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const digestDate = tomorrowSADate();

    const { data: appts, error } = await supabase
      .from('appointments')
      .select('time, session_type, duration_minutes, practitioner_id, client:clients(name, phone), practitioner:practitioners(id, name, email)')
      .eq('date', digestDate)
      .eq('status', 'scheduled')
      .not('practitioner_id', 'is', null)
      .order('time', { ascending: true });
    if (error) throw error;

    if (!appts || appts.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_bookings' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Group appointments by practitioner
    const byPractitioner = new Map<string, { practitioner: any; rows: any[] }>();
    for (const appt of appts) {
      if (!appt.practitioner?.email) continue; // nothing to send to
      const key = appt.practitioner_id;
      if (!byPractitioner.has(key)) byPractitioner.set(key, { practitioner: appt.practitioner, rows: [] });
      byPractitioner.get(key)!.rows.push(appt);
    }

    if (byPractitioner.size === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_practitioner_emails' }), { headers: { 'Content-Type': 'application/json' } });
    }

    // Skip any practitioner we've already sent tomorrow's digest to (guards
    // against the cron firing twice for the same evening).
    const practitionerIds = Array.from(byPractitioner.keys());
    const { data: alreadySent } = await supabase
      .from('daily_digest_log')
      .select('practitioner_id')
      .eq('digest_date', digestDate)
      .eq('status', 'sent')
      .in('practitioner_id', practitionerIds);
    const skip = new Set((alreadySent || []).map((r) => r.practitioner_id));

    let sent = 0;
    let failed = 0;
    const prettyDate = formatDate(digestDate);

    for (const [practitionerId, { practitioner, rows }] of byPractitioner) {
      if (skip.has(practitionerId)) continue;

      const lines = rows
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((a) => {
          const time = a.time?.slice(0, 5);
          const client = a.client?.name || 'Patient';
          const phone = a.client?.phone ? ` — ${a.client.phone}` : '';
          const duration = a.duration_minutes ? ` (${a.duration_minutes} min)` : '';
          return `${time}  ${client}${phone} — ${a.session_type}${duration}`;
        });

      const count = rows.length;
      const subject = `Tomorrow (${prettyDate}) — ${count} booking${count === 1 ? '' : 's'}`;
      const body = `Hi ${practitioner.name},\n\nYou have ${count} appointment${count === 1 ? '' : 's'} scheduled for ${prettyDate}:\n\n${lines.join('\n')}\n\nSent automatically the evening before by Multiplex.`;

      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: FROM_EMAIL, to: practitioner.email, subject, text: body }),
        });
        if (!res.ok) throw new Error(await res.text());

        await supabase.from('daily_digest_log').upsert({
          practitioner_id: practitionerId,
          digest_date: digestDate,
          appointment_count: count,
          status: 'sent',
          error: null,
          sent_at: new Date().toISOString(),
        }, { onConflict: 'practitioner_id,digest_date' });
        sent++;
      } catch (e) {
        await supabase.from('daily_digest_log').upsert({
          practitioner_id: practitionerId,
          digest_date: digestDate,
          appointment_count: count,
          status: 'failed',
          error: String(e.message || e),
          sent_at: new Date().toISOString(),
        }, { onConflict: 'practitioner_id,digest_date' });
        failed++;
      }
    }

    return new Response(JSON.stringify({ sent, failed, skipped: skip.size, digestDate }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
});
