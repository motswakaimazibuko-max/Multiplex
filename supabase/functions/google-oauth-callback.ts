// Supabase Edge Function: google-oauth-callback
// Public endpoint — Google redirects the practitioner's browser here directly
// (not called via supabase.functions.invoke) with ?code=...&state=.... We
// verify state, exchange the code for tokens, store them, then redirect the
// browser back into the app.
//
// Required secrets (set with `supabase secrets set`):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
//   APP_URL - your deployed app URL, e.g. https://yourapp.vercel.app
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY - auto-provided

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');
const APP_URL = Deno.env.get('APP_URL');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes to complete the consent flow

function b64urlToStr(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return atob(b64);
}

async function verifyState(state: string): Promise<{ uid: string; by: string; ts: number }> {
  const [payloadB64, sigB64] = state.split('.');
  if (!payloadB64 || !sigB64) throw new Error('Malformed state');
  const json = b64urlToStr(payloadB64);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
  );
  const sigBytes = Uint8Array.from(b64urlToStr(sigB64), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(json));
  if (!ok) throw new Error('State signature invalid');
  const payload = JSON.parse(json);
  if (Date.now() - payload.ts > STATE_MAX_AGE_MS) throw new Error('State expired, please try connecting again');
  return payload;
}

function redirectTo(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');
  const fallbackApp = APP_URL || '/';

  try {
    if (oauthError) throw new Error(`Google sign-in was cancelled or denied (${oauthError})`);
    if (!code || !state) throw new Error('Missing code or state from Google');
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
      throw new Error('Google OAuth secrets are not fully configured');
    }

    const { uid: practiceOwnerId, by: connectedBy } = await verifyState(state);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || tokenData.error || 'Token exchange failed');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Google only returns refresh_token on the very first consent unless we
    // force prompt=consent (which google-oauth-start does), but fall back to
    // keeping any previously-stored refresh_token just in case.
    let refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      const { data: existing } = await supabase
        .from('google_calendar_connections')
        .select('refresh_token')
        .eq('user_id', practiceOwnerId)
        .maybeSingle();
      refreshToken = existing?.refresh_token;
    }
    if (!refreshToken) throw new Error('Google did not return a refresh token — try disconnecting any prior access at myaccount.google.com/permissions and reconnecting');

    const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    const { error: upsertErr } = await supabase.from('google_calendar_connections').upsert({
      user_id: practiceOwnerId,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      connected_by: connectedBy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    if (upsertErr) throw upsertErr;

    return redirectTo(`${fallbackApp}?google=connected`);
  } catch (e) {
    return redirectTo(`${fallbackApp}?google=error&message=${encodeURIComponent(String(e.message || e))}`);
  }
});
