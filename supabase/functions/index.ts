// Supabase Edge Function: send-email
// Generic one-tap sender used by the "Remind patient (email)" and
// "Notify practitioner" buttons in Bookings. Sends immediately via Resend
// instead of opening a mailto: draft that someone still has to send.
//
// Required secrets (set with `supabase secrets set`, shared with the other
// email functions):
//   RESEND_API_KEY                          - from resend.com
//   REMINDER_FROM_EMAIL / INVITE_FROM_EMAIL (either works) - defaults to
//     'onboarding@resend.dev' if neither is set, but that
//     address can only deliver to your own Resend signup
//     email — use an address on your verified domain.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('REMINDER_FROM_EMAIL') || Deno.env.get('INVITE_FROM_EMAIL') || 'onboarding@resend.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set');

    const { to, subject, text } = await req.json();
    if (!to) throw new Error('to is required');
    if (!subject) throw new Error('subject is required');
    if (!text) throw new Error('text is required');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, text }),
    });

    if (!res.ok) throw new Error(await res.text());

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
