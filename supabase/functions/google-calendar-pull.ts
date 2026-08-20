// Supabase Edge Function: google-calendar-pull
// Runs on a schedule (via pg_cron + pg_net — see the commented block at the
// bottom of migration 0008_google_oauth.sql). For every connected practice,
// asks Google what changed since the last check and reflects reschedules or
// cancellations back onto the matching local appointment.
//
// Deliberately narrow scope: this only updates appointments that were
// already linked to a Google event by google-calendar-push (matched via
// google_event_id). An event created directly in Google Calendar, with no
// matching booking, is left alone — there's no patient/client record to
// attach it to, so it's not imported as a new booking.
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-provided),
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

async function refreshAccessToken(admin: any, connection: any) {
  const expiresAt = new Date(connection.token_expires_at).getTime();
  if (expiresAt - Date.now() > 2 * 60 * 1000) return connection.access_token;

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

async function syncOneConnection(admin: any, connection: any) {
  const accessToken = await refreshAccessToken(admin, connection);
  const calendarId = connection.calendar_id || 'primary';
  let pageToken: string | undefined;
  let syncToken = connection.sync_token || undefined;
  let nextSyncToken: string | undefined;
  let applied = 0;
  let needsFullResync = false;

  do {
    const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' });
    if (syncToken) params.set('syncToken', syncToken);
    else params.set('timeMin', new Date(Date.now() - 24 * 3600 * 1000).toISOString()); // seed: last 24h forward
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();

    if (!res.ok) {
      // 410 Gone = stored sync token is stale/invalid; clear it and do a fresh full sync next run
      if (res.status === 410) {
        needsFullResync = true;
        break;
      }
      throw new Error(data.error?.message || 'Google Calendar list failed');
    }

    for (const event of data.items || []) {
      if (!event.id) continue;
      const { data: local } = await admin
        .from('appointments')
        .select('id, date, time, duration_minutes, status, google_synced_at, updated_at')
        .eq('google_event_id', event.id)
        .maybeSingle();
      if (!local) continue; // not one of ours — leave it alone

      // Skip if we've already reconciled this appointment more recently than
      // Google's own last edit — avoids clobbering a local edit mid-flight.
      const googleUpdated = event.updated ? new Date(event.updated).getTime() : 0;
      const lastSynced = local.google_synced_at ? new Date(local.google_synced_at).getTime() : 0;
      if (googleUpdated <= lastSynced) continue;

      if (event.status === 'cancelled') {
        if (local.status === 'scheduled') {
          await admin.from('appointments').update({
            status: 'cancelled',
            google_synced_at: new Date().toISOString(),
          }).eq('id', local.id);
          applied++;
        }
        continue;
      }

      const startIso = event.start?.dateTime;
      if (!startIso) continue; // all-day event or malformed — skip
      const startDate = new Date(startIso);
      const endIso = event.end?.dateTime;
      const durationMinutes = endIso ? Math.round((new Date(endIso).getTime() - startDate.getTime()) / 60000) : local.duration_minutes;

      // Convert to South Africa wall-clock date/time (fixed UTC+2, no DST)
      const saMs = startDate.getTime() + 2 * 3600 * 1000;
      const sa = new Date(saMs);
      const newDate = sa.toISOString().slice(0, 10);
      const newTime = sa.toISOString().slice(11, 16);

      if (newDate !== local.date || newTime !== local.time.slice(0, 5) || durationMinutes !== local.duration_minutes) {
        await admin.from('appointments').update({
          date: newDate,
          time: newTime,
          duration_minutes: durationMinutes,
          google_synced_at: new Date().toISOString(),
        }).eq('id', local.id);
        applied++;
      }
    }

    pageToken = data.nextPageToken;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  await admin.from('google_calendar_connections').update({
    sync_token: needsFullResync ? null : (nextSyncToken || connection.sync_token),
    last_synced_at: new Date().toISOString(),
  }).eq('user_id', connection.user_id);

  return { applied, resyncNextTime: needsFullResync };
}

Deno.serve(async () => {
  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'Google OAuth secrets not configured' }), { status: 500 });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: connections, error } = await admin.from('google_calendar_connections').select('*');
    if (error) throw error;

    const results: Record<string, unknown> = {};
    for (const connection of connections || []) {
      try {
        results[connection.user_id] = await syncOneConnection(admin, connection);
      } catch (e) {
        results[connection.user_id] = { error: String(e.message || e) };
      }
    }

    return new Response(JSON.stringify({ connections: (connections || []).length, results }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
