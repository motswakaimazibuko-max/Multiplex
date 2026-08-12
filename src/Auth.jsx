import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { COLORS, inputStyle, Btn } from './theme';

export default function Auth() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.paper, fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <div style={{ maxWidth: 380, width: '100%', background: COLORS.paperRaised, border: `1px solid ${COLORS.line}`, borderRadius: 18, padding: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.teal, textTransform: 'uppercase' }}>Practice Manager</div>
        <h1 style={{ fontFamily: 'Newsreader, serif', fontSize: 26, color: COLORS.ink, margin: '4px 0 20px' }}>Sign in</h1>

        {sent ? (
          <p style={{ color: COLORS.inkSoft, fontSize: 14, lineHeight: 1.5 }}>
            Check <strong>{email}</strong> for a sign-in link. You can close this tab.
          </p>
        ) : (
          <form onSubmit={submit}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>Email</label>
            <input
              type="email"
              required
              style={{ ...inputStyle, marginBottom: 14 }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            {error && <div style={{ color: COLORS.rust, fontSize: 13, marginBottom: 12 }}>{error}</div>}
            <Btn type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? 'Sending…' : 'Send sign-in link'}
            </Btn>
          </form>
        )}
      </div>
    </div>
  );
}
