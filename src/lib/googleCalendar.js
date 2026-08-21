// Server-side Google Calendar integration. Unlike the old version, the
// browser never sees a Google token — it just asks edge functions to do the
// work, so syncing survives page reloads/closed tabs instead of expiring
// after ~1 hour:
//   google-oauth-start   -> returns the Google consent URL to redirect to
//   (google-oauth-callback runs server-side after Google redirects back)
//   google-calendar-push -> pushes one appointment to Google (fire-and-forget)
//   google-calendar-disconnect -> removes one practitioner's stored connection
// Two-way sync back from Google (reschedules/cancellations made directly in
// Google Calendar) happens on a schedule via google-calendar-pull (pg_cron),
// not from the browser at all — see migration 0008_google_oauth.sql.
//
// Each practitioner connects their own Google account (see
// 0009_google_calendar_per_practitioner.sql), so connect/disconnect always
// take the practitionerId they apply to.

import { supabase } from '../supabaseClient';

export async function startGoogleOAuth(practitionerId) {
  if (!practitionerId) throw new Error('Missing practitioner.');
  const { data, error } = await supabase.functions.invoke('google-oauth-start', {
    body: { practitionerId },
  });
  if (error) throw new Error(error.message || 'Could not start Google sign-in.');
  if (data?.error) throw new Error(data.error);
  if (!data?.url) throw new Error('Could not start Google sign-in.');
  window.location.href = data.url;
}

// Fire-and-forget: never throws, never blocks a booking save/delete if
// Google sync fails (not connected, token issue, offline, etc).
export async function pushAppointmentToGoogle(appointmentId, action = 'upsert') {
  try {
    const { data, error } = await supabase.functions.invoke('google-calendar-push', {
      body: { appointmentId, action },
    });
    if (error) throw error;
    if (data && data.ok === false) console.warn('Google Calendar sync skipped:', data.reason, data.error || '');
    return data;
  } catch (e) {
    console.warn('Google Calendar sync skipped:', e.message);
    return null;
  }
}

export async function disconnectGoogleCalendar(practitionerId) {
  if (!practitionerId) throw new Error('Missing practitioner.');
  const { data, error } = await supabase.functions.invoke('google-calendar-disconnect', {
    body: { practitionerId },
  });
  if (error) throw new Error(error.message || 'Could not disconnect Google Calendar.');
  if (data?.error) throw new Error(data.error);
  return data;
}
