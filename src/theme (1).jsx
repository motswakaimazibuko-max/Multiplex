import React from 'react';

export const COLORS = {
  paper: '#F6F7F4',
  paperRaised: '#FFFFFF',
  ink: '#1C2B33',
  inkSoft: '#3A4A52',
  teal: '#3D7A6B',
  tealDeep: '#2C5C50',
  amber: '#C8963C',
  rust: '#A6503D',
  slate: '#6B7686',
  line: '#DDE2DE',
  // Calendar-only accents: WMP patients vs everyone else.
  wmpGreen: '#4C8C57',
  wmpGreenDeep: '#356140',
  calendarBlue: '#3D6B8C',
  calendarBlueDeep: '#2C4E68',
};

export const VAT_RATE = 0.15;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const money = (n) => `R${(Number(n) || 0).toFixed(2)}`;

export function fmtDateLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  const today = todayISO();
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (iso === today) return 'Today';
  if (iso === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function waLink(phone, text) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const withCountry = digits.startsWith('0') ? '27' + digits.slice(1) : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}
export function mailLink(email, subject, body) {
  if (!email) return null;
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
export function reminderText(clientName, appt, settings) {
  const practitioner = settings?.practitioner_name || settings?.practice_name || 'the practice';
  return `Hi ${clientName}, this is a reminder of your ${appt.session_type} appointment on ${fmtDateLabel(appt.date)} (${appt.date}) at ${appt.time} with ${practitioner}. Reply to confirm or let us know if you need to reschedule.`;
}
export function clinicianReminderText(clientName, appt) {
  return `Reminder: ${clientName} is booked for a ${appt.session_type} on ${fmtDateLabel(appt.date)} (${appt.date}) at ${appt.time}.`;
}

export const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: `1px solid ${COLORS.line}`,
  borderRadius: 10,
  fontSize: 15,
  fontFamily: 'Inter, sans-serif',
  color: COLORS.ink,
  background: COLORS.paper,
  boxSizing: 'border-box',
};

export const iconBtnStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  background: COLORS.paper,
  border: `1px solid ${COLORS.line}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: 12.5,
  fontWeight: 600,
  color: COLORS.ink,
  cursor: 'pointer',
  textDecoration: 'none',
};

export function SpineDivider({ align = 'left' }) {
  const dots = [3, 5, 7, 9, 7, 5, 3];
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', justifyContent: align === 'left' ? 'flex-start' : 'center', margin: '10px 0 18px' }}>
      {dots.map((d, i) => (
        <div key={i} style={{ width: d, height: d, borderRadius: '50%', background: i === 3 ? COLORS.amber : COLORS.teal, opacity: i === 3 ? 1 : 0.55 }} />
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'teal' }) {
  const map = {
    teal: { bg: '#E6EFEC', fg: COLORS.tealDeep },
    amber: { bg: '#F7EDDA', fg: '#8A6420' },
    rust: { bg: '#F3E2DD', fg: COLORS.rust },
    slate: { bg: '#ECEDEF', fg: COLORS.slate },
  };
  const c = map[tone] || map.teal;
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 20, letterSpacing: 0.2, fontFamily: 'Inter, sans-serif' }}>
      {children}
    </span>
  );
}

export function Btn({ children, onClick, variant = 'primary', style, type = 'button', disabled }) {
  const base = { padding: '11px 18px', borderRadius: 10, fontSize: 14, fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: disabled ? 'not-allowed' : 'pointer', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, opacity: disabled ? 0.5 : 1 };
  const variants = {
    primary: { background: COLORS.teal, color: '#fff' },
    ghost: { background: 'transparent', color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    danger: { background: 'transparent', color: COLORS.rust, border: `1px solid ${COLORS.rust}44` },
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.slate, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'Inter, sans-serif' }}>{label}</span>
      {children}
    </label>
  );
}

export function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.teal, textTransform: 'uppercase', letterSpacing: 0.6, margin: '4px 0 10px' }}>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,43,51,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.paperRaised,
          width: '100%',
          maxWidth: wide ? 640 : 480,
          maxHeight: '92vh',
          overflowY: 'auto',
          borderRadius: '18px 18px 0 0',
          padding: '22px 20px 28px',
          boxShadow: '0 -8px 30px rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ fontFamily: 'Newsreader, serif', fontSize: 22, color: COLORS.ink, margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: COLORS.slate, padding: 6 }}>
            ✕
          </button>
        </div>
        <SpineDivider />
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, sub, actionLabel, onAction }) {
  return (
    <div style={{ textAlign: 'center', padding: '54px 20px', color: COLORS.slate }}>
      {Icon && <Icon size={30} style={{ color: COLORS.teal, marginBottom: 10, opacity: 0.7 }} />}
      <div style={{ fontFamily: 'Newsreader, serif', fontSize: 19, color: COLORS.ink, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 14, marginBottom: 18 }}>{sub}</div>
      {actionLabel && <Btn onClick={onAction}>+ {actionLabel}</Btn>}
    </div>
  );
}

export function SectionHeader({ children, action }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
      <h2 style={{ fontFamily: 'Newsreader, serif', fontSize: 22, color: COLORS.ink, margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}
