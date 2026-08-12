// Client-side Google Calendar integration using Google Identity Services (GIS).
// No client secret needed - this requests a short-lived access token directly
// in the browser, scoped only to calendar events.

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

let gisLoaded = false;
function loadGis() {
  return new Promise((resolve, reject) => {
    if (gisLoaded && window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      gisLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Opens the Google consent popup and resolves with a short-lived access token.
// Token is valid ~1 hour; call this again when it expires (e.g. on a 401).
export async function requestGoogleAccessToken() {
  if (!CLIENT_ID) throw new Error('VITE_GOOGLE_CLIENT_ID is not set. See README for setup.');
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) reject(new Error(resp.error));
        else resolve(resp.access_token);
      },
    });
    client.requestAccessToken();
  });
}

function apptToEvent(appt, clientName, durationMinutes, notes, clientEmail, clinicianEmail, practitionerLabel) {
  const start = new Date(`${appt.date}T${appt.time.length === 5 ? appt.time + ':00' : appt.time}`);
  const end = new Date(start.getTime() + durationMinutes * 60000);

  // Attendees get Google's own invite/update emails — this is what actually
  // notifies the patient (and, if given, the clinician's own address if it
  // differs from the calendar owner's Google account).
  const attendees = [];
  if (clientEmail) attendees.push({ email: clientEmail, displayName: clientName });
  if (clinicianEmail) attendees.push({ email: clinicianEmail });

  const titlePrefix = practitionerLabel ? `${practitionerLabel}: ` : '';

  return {
    summary: `${titlePrefix}${appt.session_type} — ${clientName}`,
    description: notes || '',
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees,
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 60 },       // 1 hour before
      ],
    },
  };
}

// clientEmail/clinicianEmail are optional — pass them to have Google email
// invites/updates to the patient and practice. practitionerLabel (e.g. "Dr. Naidoo (GP)")
// is prefixed onto the event title so a shared calendar stays readable with two practitioners.
// Requires the connected Google account to have permission to send invites (normal for a primary calendar).
export async function upsertCalendarEvent(accessToken, appt, clientName, clientEmail, clinicianEmail, practitionerLabel) {
  const body = apptToEvent(appt, clientName, appt.duration_minutes, appt.notes, clientEmail, clinicianEmail, practitionerLabel);
  const base = appt.google_event_id
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${appt.google_event_id}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  // sendUpdates=all is what triggers Google to actually email the attendees
  // (both on creation and on any later edits/cancellations).
  const url = `${base}?sendUpdates=all`;
  const res = await fetch(url, {
    method: appt.google_event_id ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google Calendar sync failed: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

export async function deleteCalendarEvent(accessToken, eventId) {
  if (!eventId) return;
  // sendUpdates=all so the patient also gets a cancellation email, not just
  // a silent removal from the clinician's calendar.
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => {}); // event may already be gone - not fatal
}

export const isGoogleCalendarConfigured = !!CLIENT_ID;
