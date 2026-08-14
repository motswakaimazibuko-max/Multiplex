// Supabase Edge Function: send-team-invite
// Called from the frontend right after a manager invites a teammate
// (Settings → Team access → Invite). Sends the teammate an email via
// Resend telling them how to sign in and get linked to the practice.
//
// Required secrets (set with `supabase secrets set`):
//   RESEND_API_KEY   - from resend.com
//   REMINDER_FROM_EMAIL (optional, reused from the reminders function) or
//   INVITE_FROM_EMAIL - defaults to 'onboarding@resend.dev'
//   APP_URL - your deployed app URL, e.g. https://yourapp.vercel.app
//             (falls back to the Origin header of the request if not set)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = Deno.env.get('INVITE_FROM_EMAIL') || Deno.env.get('REMINDER_FROM_EMAIL') || 'onboarding@resend.dev';
const APP_URL = Deno.env.get('APP_URL');

const ROLE_LABEL: Record<string, string> = {
  manager: 'Practice Manager',
  gp: 'GP',
  biokineticist: 'Biokineticist',
};

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

    const { email, name, role, practiceName, inviterName } = await req.json();
    if (!email) throw new Error('email is required');

    const appUrl = APP_URL || req.headers.get('origin') || '';
    const roleLabel = ROLE_LABEL[role] || role;
    const greetingName = name ? name.split(' ')[0] : 'there';
    const practiceLabel = practiceName || 'the practice';
    const fromLine = inviterName ? `${inviterName} has` : 'You have been';

    const subject = `You've been invited to ${practiceLabel} on Practice Manager`;
    const text = `Hi ${greetingName},

${fromLine} invited you to join ${practiceLabel} as a ${roleLabel}.

To get access, sign in at ${appUrl || '(app link)'} using this email address: ${email}
You'll get a one-time sign-in link by email — no password needed. Once you sign in, you'll automatically see the shared bookings, clients and invoices for the practice.

If you weren't expecting this, you can ignore this email.`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject,
        text,
      }),
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
