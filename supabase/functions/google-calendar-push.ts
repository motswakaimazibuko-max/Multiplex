// Supabase Edge Function: google-calendar-push
// Called from the frontend right after a booking is saved or deleted.
// Fire-and-forget from the client's point of view — always returns 200 with
// {ok:false, reason} rather than throwing, so a sync hiccup never blocks the
// booking itself from saving.
//
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//   (auto-provided), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

const DISCIPLINE_LABEL: Record<string, string> = { gp: 'GP', biokineticist: 'Biokineticist' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

async function refreshAccessToken(admin: any, connection: any) {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > 2 * 60 * 1000) return connection.access_token; // still valid for 2+ min

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID!,
      client_secret: GOOGLE_CLIENT_SECRET!,
      refresh_token: connection.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Could not refresh Google token');

  const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  await admin.from('google_calendar_connections').update({
    access_token: data.access_token,
    token_expires_at: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq('user_id', connection.user_id);

  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return ok({ ok: false, reason: 'not_signed_in' });

    const { appointmentId, action } = await req.json();
    if (!appointmentId) return ok({ ok: false, reason: 'missing_appointment_id' });

    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: practiceOwnerId } = await asUser.rpc('get_practice_owner_id');
    if (!practiceOwnerId) return ok({ ok: false, reason: 'no_practice' });

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: connection } = await admin
      .from('google_calendar_connections')
      .select('*')
      .eq('user_id', practiceOwnerId)
      .maybeSingle();
    if (!connection) return ok({ ok: false, reason: 'not_connected' });

    const { data: appt, error: apptErr } = await admin
      .from('appointments')
      .select('*, client:clients(name, email), practitioner:practitioners(name, email, discipline)')
      .eq('id', appointmentId)
      .eq('user_id', practiceOwnerId) // belt-and-braces: never touch another practice's row
      .maybeSingle();
    if (apptErr || !appt) return ok({ ok: false, reason: 'appointment_not_found' });

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return ok({ ok: false, reason: 'google_not_configured' });
    const accessToken = await refreshAccessToken(admin, connection);
    const calendarId = connection.calendar_id || 'primary';
    const shouldDelete = action === 'delete' || appt.status !== 'scheduled';

    if (shouldDelete) {
      if (appt.google_event_id) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appt.google_event_id}?sendUpdates=all`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }).catch(() => {}); // may already be gone in Google — not fatal
      }
      await admin.from('appointments').update({ google_event_id: null, google_synced_at: new Date().toISOString() }).eq('id', appt.id);
      return ok({ ok: true, deleted: true });
    }

    const clientName = appt.client?.name || 'Patient';
    const clientEmail = appt.client?.email || null;
    const clinicianEmail = appt.practitioner?.email || null;
    const practitionerLabel = appt.practitioner
      ? `${appt.practitioner.name} (${DISCIPLINE_LABEL[appt.practitioner.discipline] || appt.practitioner.discipline})`
      : null;

    const start = appt.time.length === 5 ? `${appt.time}:00` : appt.time;
    const startDateTime = `${appt.date}T${start}`;
    const startMs = new Date(`${startDateTime}+02:00`).getTime(); // South Africa is fixed UTC+2, no DST
    const endMs = startMs + (appt.duration_minutes || 45) * 60000;
    const endDateTime = new Date(endMs).toISOString().slice(0, 19); // strip Z; we pass timeZone separately

    const attendees = [];
    if (clientEmail) attendees.push({ email: clientEmail, displayName: clientName });
    if (clinicianEmail) attendees.push({ email: clinicianEmail });

    const eventBody = {
      summary: `${practitionerLabel ? practitionerLabel + ': ' : ''}${appt.session_type} — ${clientName}`,
      description: appt.notes || '',
      start: { dateTime: startDateTime, timeZone: 'Africa/Johannesburg' },
      end: { dateTime: endDateTime, timeZone: 'Africa/Johannesburg' },
      attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 },
          { method: 'popup', minutes: 60 },
        ],
      },
      extendedProperties: { private: { multiplex_appointment_id: appt.id } },
    };

    const base = appt.google_event_id
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${appt.google_event_id}`
      : `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;

    const res = await fetch(`${base}?sendUpdates=all`, {
      method: appt.google_event_id ? 'PATCH' : 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    const eventData = await res.json();
    if (!res.ok) throw new Error(eventData.error?.message || 'Google Calendar sync failed');

    await admin.from('appointments').update({
      google_event_id: eventData.id,
      google_synced_at: new Date().toISOString(),
    }).eq('id', appt.id);

    return ok({ ok: true, eventId: eventData.id });
  } catch (e) {
    return ok({ ok: false, reason: 'error', error: String(e.message || e) });
  }
});
