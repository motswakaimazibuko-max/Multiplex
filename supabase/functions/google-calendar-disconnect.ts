// Supabase Edge Function: google-calendar-disconnect
// Called from Settings when a practitioner clicks "Disconnect" on their own
// Google Calendar connection. Only removes that one practitioner's
// connection — other practitioners in the same practice keep theirs.
//
// Required secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (auto-provided)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not signed in.');

    const { practitionerId } = await req.json().catch(() => ({}));
    if (!practitionerId) throw new Error('Missing practitionerId.');

    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: practiceOwnerId, error: rpcErr } = await asUser.rpc('get_practice_owner_id');
    if (rpcErr) throw rpcErr;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Only delete a connection that both matches this practitioner AND
    // belongs to the caller's own practice.
    const { data: deleted, error: delErr } = await admin
      .from('google_calendar_connections')
      .delete()
      .eq('practitioner_id', practitionerId)
      .eq('user_id', practiceOwnerId)
      .select('practitioner_id')
      .maybeSingle();
    if (delErr) throw delErr;
    if (!deleted) throw new Error('No connection found for that practitioner in your practice.');

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
