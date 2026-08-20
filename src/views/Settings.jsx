import React, { useState } from 'react';
import { CalendarCheck2, Mail, Pencil, Plus, Stethoscope, Trash2, Activity, UserPlus, Users2 } from 'lucide-react';
import { Btn, COLORS, Field, Modal, inputStyle } from '../theme';

const DISCIPLINE_LABEL = { gp: 'General Practitioner', biokineticist: 'Biokineticist' };
const ROLE_LABEL = { manager: 'Practice Manager', gp: 'GP', biokineticist: 'Biokineticist' };

function PractitionerRow({ p, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${COLORS.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {p.discipline === 'gp' ? <Stethoscope size={14} color={COLORS.amber} /> : <Activity size={14} color={COLORS.teal} />}
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{p.name}</div>
          <div style={{ fontSize: 11.5, color: COLORS.slate }}>{DISCIPLINE_LABEL[p.discipline]}{p.email ? ` · ${p.email}` : ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onEdit(p)} style={{ background: 'none', border: 'none', color: COLORS.slate, cursor: 'pointer', padding: 6 }}><Pencil size={14} /></button>
        <button onClick={() => onDelete(p.id)} style={{ background: 'none', border: 'none', color: COLORS.rust, cursor: 'pointer', padding: 6 }}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

function PractitionerForm({ practitioner, onSave, onCancel }) {
  const [name, setName] = useState(practitioner?.name || '');
  const [discipline, setDiscipline] = useState(practitioner?.discipline || 'biokineticist');
  const [registrationNumber, setRegistrationNumber] = useState(practitioner?.registration_number || '');
  const [email, setEmail] = useState(practitioner?.email || '');
  const [phone, setPhone] = useState(practitioner?.phone || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      id: practitioner?.id,
      name: name.trim(),
      discipline,
      registration_number: registrationNumber,
      email,
      phone,
      active: true,
    });
    setSaving(false);
  };

  return (
    <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. J. Naidoo" /></Field>
      <Field label="Discipline">
        <select style={inputStyle} value={discipline} onChange={(e) => setDiscipline(e.target.value)}>
          <option value="biokineticist">Biokineticist</option>
          <option value="gp">General Practitioner</option>
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Registration number"><input style={inputStyle} value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Email"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="For invites & reminders" /></Field></div>
      </div>
      <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn onClick={submit} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Saving…' : 'Save practitioner'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

function InviteForm({ onInvite, onCancel }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('biokineticist');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSaving(true);
    await onInvite({ name: name.trim(), email: email.trim(), role });
    setSaving(false);
  };

  return (
    <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <Field label="Name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr. J. Naidoo" /></Field>
      <Field label="Email (they'll sign in with this)"><input type="email" style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="colleague@example.com" /></Field>
      <Field label="Role">
        <select style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="biokineticist">Biokineticist</option>
          <option value="gp">General Practitioner</option>
          <option value="manager">Practice Manager</option>
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <Btn onClick={submit} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>{saving ? 'Inviting…' : 'Send invite'}</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

export default function SettingsModal({ settings, onClose, onSave, practitioners, onSavePractitioner, onDeletePractitioner, team, myRole, onInviteTeamMember, onRemoveTeamMember, googleConnected, googleConfigured, googleLastSyncedAt, onConnectGoogle, onDisconnectGoogle }) {
  const [s, setS] = useState({
    practice_name: settings?.practice_name || '',
    practitioner_name: settings?.practitioner_name || '',
    hpcsa_number: settings?.hpcsa_number || '',
    bhf_number: settings?.bhf_number || '',
    email: settings?.email || '',
    phone: settings?.phone || '',
    address: settings?.address || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });

  const [googleError, setGoogleError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [editingPractitioner, setEditingPractitioner] = useState(null);
  const [addingPractitioner, setAddingPractitioner] = useState(false);
  const [invitingTeam, setInvitingTeam] = useState(false);
  const [inviteEmailError, setInviteEmailError] = useState('');

  const submit = async () => {
    setSaving(true);
    await onSave(s);
    setSaving(false);
  };

  const handleConnect = async () => {
    setGoogleError('');
    setConnecting(true);
    try {
      await onConnectGoogle(); // redirects the page to Google — this only returns early on error
    } catch (e) {
      setGoogleError(e.message);
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setGoogleError('');
    setDisconnecting(true);
    try {
      await onDisconnectGoogle();
    } catch (e) {
      setGoogleError(e.message);
    }
    setDisconnecting(false);
  };

  const savePractitionerAndClose = async (p) => {
    await onSavePractitioner(p);
    setEditingPractitioner(null);
    setAddingPractitioner(false);
  };

  return (
    <Modal title="Practice details" onClose={onClose}>
      {myRole === 'manager' && (
        <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users2 size={16} color={COLORS.teal} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>Team access</span>
            </div>
            {!invitingTeam && (
              <button onClick={() => setInvitingTeam(true)} style={{ background: 'none', border: 'none', color: COLORS.teal, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600 }}>
                <UserPlus size={14} /> Invite
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: COLORS.slate, marginBottom: 6 }}>
            Invite your GP and biokineticist by email — they each get their own sign-in and see the same bookings, clients and invoices as you.
          </div>
          {team?.length > 0 && !invitingTeam && (
            <div>
              {team.map((t) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${COLORS.line}` }}>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>{t.name} <span style={{ fontWeight: 400, color: COLORS.slate }}>· {ROLE_LABEL[t.role]}</span></div>
                    <div style={{ fontSize: 11.5, color: COLORS.slate, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Mail size={11} /> {t.email} {t.joined_at ? '· joined' : '· invited, awaiting first sign-in'}
                    </div>
                  </div>
                  <button onClick={() => onRemoveTeamMember(t.id)} style={{ background: 'none', border: 'none', color: COLORS.rust, cursor: 'pointer', padding: 6 }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          {inviteEmailError && !invitingTeam && (
            <div style={{ color: COLORS.rust, fontSize: 12, marginBottom: 6 }}>
              Teammate added, but the invite email failed to send: {inviteEmailError}. They can still sign in manually with the email you entered — see README for setting up RESEND_API_KEY / APP_URL on the send-team-invite function.
            </div>
          )}
          {invitingTeam && (
            <InviteForm
              onInvite={async (m) => {
                setInviteEmailError('');
                const saved = await onInviteTeamMember(m);
                if (saved?.emailError) setInviteEmailError(saved.emailError);
                setInvitingTeam(false);
              }}
              onCancel={() => setInvitingTeam(false)}
            />
          )}
          {(!team || team.length === 0) && !invitingTeam && (
            <div style={{ fontSize: 12.5, color: COLORS.slate, fontStyle: 'italic' }}>Just you so far. Invite your GP and biokineticist to give them their own login.</div>
          )}
        </div>
      )}

      <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>Practitioners</span>
          {!addingPractitioner && !editingPractitioner && (
            <button onClick={() => setAddingPractitioner(true)} style={{ background: 'none', border: 'none', color: COLORS.teal, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={14} /> Add
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: COLORS.slate, marginBottom: 6 }}>
          Add your GP and biokineticist so bookings, calendar invites, and reminder emails go to the right person.
        </div>
        {practitioners?.length > 0 && !addingPractitioner && (
          <div>
            {practitioners.map((p) =>
              editingPractitioner?.id === p.id ? (
                <PractitionerForm key={p.id} practitioner={editingPractitioner} onSave={savePractitionerAndClose} onCancel={() => setEditingPractitioner(null)} />
              ) : (
                <PractitionerRow key={p.id} p={p} onEdit={setEditingPractitioner} onDelete={onDeletePractitioner} />
              )
            )}
          </div>
        )}
        {addingPractitioner && <PractitionerForm onSave={savePractitionerAndClose} onCancel={() => setAddingPractitioner(false)} />}
        {(!practitioners || practitioners.length === 0) && !addingPractitioner && (
          <div style={{ fontSize: 12.5, color: COLORS.slate, fontStyle: 'italic' }}>No practitioners added yet.</div>
        )}
      </div>

      <div style={{ background: COLORS.paper, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 14, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <CalendarCheck2 size={16} color={COLORS.teal} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>Google Calendar</span>
        </div>
        {!googleConfigured ? (
          <div style={{ fontSize: 12.5, color: COLORS.slate }}>Not set up yet — add Google OAuth credentials (see README) to enable calendar sync.</div>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: COLORS.slate, marginBottom: 8 }}>
              {googleConnected
                ? `Connected — scheduled bookings sync to your primary calendar automatically, titled with the practitioner's name. Google emails an invite to the patient and that practitioner (if they have an email on file). Reschedules or cancellations made directly in Google Calendar sync back within about 15 minutes.${googleLastSyncedAt ? ` Last checked ${new Date(googleLastSyncedAt).toLocaleString('en-ZA')}.` : ''}`
                : 'Connect once to sync scheduled bookings to your Google Calendar automatically — even when the app is closed. Google emails an invite to the patient and the assigned practitioner, and reschedules/cancellations made directly in Google sync back here too.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" onClick={handleConnect} disabled={connecting}>
                {connecting ? 'Connecting…' : googleConnected ? 'Reconnect' : 'Connect Google Calendar'}
              </Btn>
              {googleConnected && (
                <Btn variant="ghost" onClick={handleDisconnect} disabled={disconnecting}>
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </Btn>
              )}
            </div>
            {googleError && <div style={{ color: COLORS.rust, fontSize: 12.5, marginTop: 6 }}>{googleError}</div>}
          </>
        )}
        <div style={{ fontSize: 11.5, color: COLORS.slate, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${COLORS.line}` }}>
          Prefer not to use Google Calendar? Email reminders (patient 24h before, practitioner 2h before) work independently via the automated reminder system — see README for setup.
        </div>
      </div>

      <Field label="Practice name"><input style={inputStyle} value={s.practice_name} onChange={set('practice_name')} /></Field>
      <Field label="Practitioner name"><input style={inputStyle} value={s.practitioner_name} onChange={set('practitioner_name')} /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="HPCSA number"><input style={inputStyle} value={s.hpcsa_number} onChange={set('hpcsa_number')} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Practice / BHF number"><input style={inputStyle} value={s.bhf_number} onChange={set('bhf_number')} /></Field></div>
      </div>
      <Field label="Email"><input style={inputStyle} value={s.email} onChange={set('email')} /></Field>
      <Field label="Phone"><input style={inputStyle} value={s.phone} onChange={set('phone')} /></Field>
      <Field label="Address"><textarea style={{ ...inputStyle, minHeight: 60 }} value={s.address} onChange={set('address')} /></Field>
      <Btn onClick={submit} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
        {saving ? 'Saving…' : 'Save details'}
      </Btn>
    </Modal>
  );
}
