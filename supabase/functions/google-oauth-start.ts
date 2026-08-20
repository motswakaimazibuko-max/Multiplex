// Supabase Edge Function: google-oauth-start
// Called from the frontend (Settings -> Connect Google Calendar). Returns a
// Google consent-screen URL for the browser to redirect to. Does NOT redirect
// itself, since it's invoked via supabase.functions.invoke (which can't carry
// the browser to a new page) — the client does `window.location.href = url`.
//
// Required secrets (set with `supabase secrets set`):
//   GOOGLE_CLIENT_ID
//   GOOGLE_REDIRECT_URI  - the deployed URL of google-oauth-callback, e.g.
//                          https://YOUR-PROJECT-REF.supabase.co/functions/v1/google-oauth-callback
//                          (must be registered exactly in Google Cloud Console)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY - auto-provided

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
// Used only as an HMAC signing key for the short-lived `state` param (CSRF
// protection) — never sent anywhere, just needs to be a secret only our
// functions know.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function signState(payload: Record<string, unknown>): Promise<string> {
  const json = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(json));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${payloadB64}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI) {
      throw new Error('GOOGLE_CLIENT_ID / GOOGLE_REDIRECT_URI not set. See README for Google Cloud setup.');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not signed in.');

    // Identify the caller and resolve which practice they belong to, using
    // their own JWT (so RLS/RPC runs as them, not as service role).
    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) throw new Error('Could not verify session.');
    const authUserId = userData.user.id;

    const { data: practiceOwnerId, error: rpcErr } = await asUser.rpc('get_practice_owner_id');
    if (rpcErr) throw rpcErr;

    const state = await signState({ uid: practiceOwnerId || authUserId, by: authUserId, ts: Date.now() });

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: 'code',
      access_type: 'offline',   // required to get a refresh_token
      prompt: 'consent',        // forces Google to re-issue a refresh_token every time
      include_granted_scopes: 'true',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(JSON.stringify({ url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
