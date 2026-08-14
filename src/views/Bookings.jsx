import React, { useMemo, useState } from 'react';
import { Activity, Calendar, Check, Clock, FileText, Loader2, Mail, Pencil, Phone, Plus, Stethoscope, Trash2, UserPlus, Users } from 'lucide-react';
import { COLORS, Badge, Btn, EmptyState, Field, Modal, SectionHeader, SectionLabel, SpineDivider, clinicianReminderText, fmtDateLabel, iconBtnStyle, inputStyle, reminderText, todayISO, uid, waLink } from '../theme';
import { supabase } from '../supabaseClient';

export const SESSION_TYPES_BY_DISCIPLINE = {
  biokineticist: [
    { label: 'Initial Assessment', rate: 650 },
    { label: 'Follow-up Session', rate: 450 },
    { label: 'Rehabilitation Session', rate: 450 },
    { label: 'Outcome Re-assessment', rate: 500 },
    { label: 'Other', rate: 0 },
  ],
  gp: [
    { label: 'GP Consultation', rate: 450 },
    { label: 'Follow-up Consultation', rate: 350 },
    { label: 'Sick Note / Referral', rate: 300 },
    { label: 'Procedure', rate: 550 },
    { label: 'Other', rate: 0 },
  ],
};
// Fallback used when no practitioner is selected yet, or practitioners can't be loaded.
export const SESSION_TYPES = SESSION_TYPES_BY_DISCIPLINE.biokineticist;
const DEFAULT_DURATION = { gp: 15, biokineticist: 45 };
const DISCIPLINE_LABEL = { gp: 'GP', biokineticist: 'Biokineticist' };
const DisciplineIcon = { gp: Stethoscope, biokineticist: Activity };

export default function BookingsView({ appointments, clients, settings, practitioners, onNew, onEdit, onDelete, onStatusChange, onInvoice }) {
  const [filterDiscipline, setFilterDiscipline] = useState('all');
  // Tracks in-flight / just-finished one-tap sends, keyed by `${apptId}-${kind}`
  // so the "patient" and "clinician" buttons on the same booking don't clobber
  // each other's status.
  const [sendStatus, setSendStatus] = useState({}); // key -> 'sending' | 'sent'
  const [sendError, setSendError] = useState({}); // key -> message

  const handleSend = async (key, { to, subject, text }) => {
    setSendStatus((prev) => ({ ...prev, [key]: 'sending' }));
    setSendError((prev) => ({ ...prev, [key]: '' }));
    try {
      const { error } = await supabase.functions.invoke('send-email', { body: { to, subject, text } });
      if (error) throw error;
      setSendStatus((prev) => ({ ...prev, [key]: 'sent' }));
      setTimeout(() => setSendStatus((prev) => ({ ...prev, [key]: undefined })), 2500);
    } catch (e) {
      setSendStatus((prev) => ({ ...prev, [key]: undefined }));
      setSendError((prev) => ({ ...prev, [key]: e.message || 'Could not send email' }));
    }
  };

  const filtered = useMemo(() => {
    if (filterDiscipline === 'all') return appointments;
    return appointments.filter((a) => {
      const p = practitioners?.find((pr) => pr.id === a.practitioner_id);
      return p?.discipline === filterDiscipline;
    });
  }, [appointments, practitioners, filterDiscipline]);

  const grouped = useMemo(() => {
    const groups = {};
    filtered.forEach((a) => {
      groups[a.date] = groups[a.date] || [];
      groups[a.date].push(a);
    });
    return groups;
  }, [filtered]);
  const dates = Object.keys(grouped).sort();
  const statusTone = { scheduled: 'teal', completed: 'amber', cancelled: 'slate', 'no-show': 'rust' };
  const hasBothDisciplines = practitioners?.some((p) => p.discipline === 'gp') && practitioners?.some((p) => p.discipline === 'biokineticist');

  return (
    <div>
      <SectionHeader action={<Btn onClick={onNew}><Plus size={16} />New booking</Btn>}>Bookings</SectionHeader>
      <SpineDivider />
      {hasBothDisciplines && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {['all', 'gp', 'biokineticist'].map((d) => (
            <button
              key={d}
              onClick={() => setFilterDiscipline(d)}
              style={{
                ...iconBtnStyle,
                background: filterDiscipline === d ? COLORS.teal : COLORS.paper,
                color: filterDiscipline === d ? '#fff' : COLORS.ink,
                border: `1px solid ${filterDiscipline === d ? COLORS.teal : COLORS.line}`,
              }}
            >
              {d === 'all' ? 'All' : DISCIPLINE_LABEL[d]}
            </button>
          ))}
        </div>
      )}
      {dates.length === 0 && <EmptyState icon={Calendar} title="No bookings yet" sub="Schedule your first session to get started." actionLabel="New booking" onAction={onNew} />}
      {dates.map((date) => (
        <div key={date} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.teal, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{fmtDateLabel(date)}</div>
          {grouped[date].map((a) => {
            const client = clients.find((c) => c.id === a.client_id);
            const practitioner = practitioners?.find((p) => p.id === a.practitioner_id);
            const text = client ? reminderText(client.name, a, settings) : '';
            const wa = client ? waLink(client.phone, text) : null;
            const patientSubject = `Appointment reminder — ${fmtDateLabel(a.date)}`;
            const canEmailPatient = Boolean(client?.email);
            const clinicianText = client ? clinicianReminderText(client.name, a) : '';
            const clinicianEmail = practitioner?.email || settings?.email;
            const clinicianSubject = `Upcoming: ${client?.name || 'appointment'} — ${fmtDateLabel(a.date)}`;
            const DIcon = practitioner ? DisciplineIcon[practitioner.discipline] : null;
            const patientKey = `${a.id}-patient`;
            const clinicianKey = `${a.id}-clinician`;
            return (
              <div key={a.id} style={{ background: COLORS.paperRaised, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 15 }}>{client?.name || 'Unknown client'}</div>
                    <div style={{ fontSize: 13, color: COLORS.slate, display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <Clock size={13} /> {a.time?.slice(0, 5)} · {a.duration_minutes}min · {a.session_type}
                    </div>
                    {practitioner && (
                      <div style={{ fontSize: 12, color: COLORS.tealDeep, display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        {DIcon && <DIcon size={12} />} {practitioner.name} · {DISCIPLINE_LABEL[practitioner.discipline]}
                      </div>
                    )}
                  </div>
                  <Badge tone={statusTone[a.status] || 'teal'}>{a.status}</Badge>
                </div>
                {a.notes && <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 8, fontStyle: 'italic' }}>{a.notes}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => onEdit(a)} style={iconBtnStyle}><Pencil size={14} /> Edit</button>
                  {a.status === 'scheduled' && (
                    <button onClick={() => onStatusChange(a, 'completed')} style={iconBtnStyle}><Check size={14} /> Mark done</button>
                  )}
                  <button onClick={() => onInvoice(a)} style={iconBtnStyle}><FileText size={14} /> Invoice</button>
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...iconBtnStyle, color: COLORS.tealDeep }}><Phone size={14} /> Remind patient (WhatsApp)</a>}
                  {canEmailPatient && (
                    <button
                      onClick={() => handleSend(patientKey, { to: client.email, subject: patientSubject, text })}
                      disabled={sendStatus[patientKey] === 'sending'}
                      style={{ ...iconBtnStyle, color: COLORS.tealDeep }}
                    >
                      {sendStatus[patientKey] === 'sending' ? <Loader2 size={14} /> : <Mail size={14} />}
                      {sendStatus[patientKey] === 'sending' ? 'Sending…' : sendStatus[patientKey] === 'sent' ? 'Sent ✓' : 'Remind patient (email)'}
                    </button>
                  )}
                  {clinicianEmail && (
                    <button
                      onClick={() => handleSend(clinicianKey, { to: clinicianEmail, subject: clinicianSubject, text: clinicianText })}
                      disabled={sendStatus[clinicianKey] === 'sending'}
                      style={{ ...iconBtnStyle, color: COLORS.amber }}
                    >
                      {sendStatus[clinicianKey] === 'sending' ? <Loader2 size={14} /> : <Mail size={14} />}
                      {sendStatus[clinicianKey] === 'sending' ? 'Sending…' : sendStatus[clinicianKey] === 'sent' ? 'Sent ✓' : 'Notify practitioner'}
                    </button>
                  )}
                  <button onClick={() => onDelete(a.id)} style={{ ...iconBtnStyle, color: COLORS.rust }}><Trash2 size={14} /> Remove</button>
                </div>
                {(sendError[patientKey] || sendError[clinicianKey]) && (
                  <div style={{ fontSize: 12, color: COLORS.rust, marginTop: 6 }}>
                    {sendError[patientKey] && <div>Reminder to patient failed: {sendError[patientKey]}</div>}
                    {sendError[clinicianKey] && <div>Notify practitioner failed: {sendError[clinicianKey]}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function ApptFormModal({ appt, clients, practitioners, onClose, onSave, onQuickAddClient }) {
  const [clientId, setClientId] = useState(appt?.client_id || '');
  const [patientMode, setPatientMode] = useState(appt || clients?.length ? 'list' : 'new');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSaving, setPatientSaving] = useState(false);
  const [patientError, setPatientError] = useState('');
  // New patient fields — personal info, contact details, medical aid details.
  const [pName, setPName] = useState('');
  const [pIdNumber, setPIdNumber] = useState('');
  const [pDob, setPDob] = useState('');
  const [pGender, setPGender] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pAddress, setPAddress] = useState('');
  const [pMedicalAidScheme, setPMedicalAidScheme] = useState('');
  const [pMedicalAidNumber, setPMedicalAidNumber] = useState('');
  const [pDependentCode, setPDependentCode] = useState('');
  const [pMainMemberName, setPMainMemberName] = useState('');
  const [pNotes, setPNotes] = useState('');

  const [practitionerId, setPractitionerId] = useState(appt?.practitioner_id || practitioners?.[0]?.id || '');
  const [date, setDate] = useState(appt?.date || todayISO());
  const [time, setTime] = useState(appt?.time?.slice(0, 5) || '09:00');
  const selectedPractitioner = practitioners?.find((p) => p.id === practitionerId);
  const disciplineTypes = SESSION_TYPES_BY_DISCIPLINE[selectedPractitioner?.discipline] || SESSION_TYPES;
  const [duration, setDuration] = useState(appt?.duration_minutes || DEFAULT_DURATION[selectedPractitioner?.discipline] || 45);
  const [sessionType, setSessionType] = useState(appt?.session_type || disciplineTypes[0].label);
  const [rate, setRate] = useState(appt?.rate ?? disciplineTypes[0].rate);
  const [notes, setNotes] = useState(appt?.notes || '');
  const [status, setStatus] = useState(appt?.status || 'scheduled');
  const [saving, setSaving] = useState(false);

  const selectedClient = clients.find((c) => c.id === clientId);
  const filteredClients = patientSearch.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(patientSearch.trim().toLowerCase()))
    : clients;

  const handlePractitioner = (id) => {
    setPractitionerId(id);
    const p = practitioners?.find((pr) => pr.id === id);
    const types = SESSION_TYPES_BY_DISCIPLINE[p?.discipline] || SESSION_TYPES;
    setSessionType(types[0].label);
    setRate(types[0].rate);
    if (!appt) setDuration(DEFAULT_DURATION[p?.discipline] || 45);
  };

  const handleSessionType = (label) => {
    setSessionType(label);
    const preset = disciplineTypes.find((s) => s.label === label);
    if (preset) setRate(preset.rate);
  };

  const buildNewPatientPayload = () => ({
    id: uid(),
    name: pName.trim(),
    id_number: pIdNumber,
    date_of_birth: pDob || null,
    gender: pGender,
    phone: pPhone,
    email: pEmail,
    address: pAddress,
    medical_aid_scheme: pMedicalAidScheme,
    medical_aid_number: pMedicalAidNumber,
    medical_aid_dependent_code: pDependentCode,
    main_member_name: pMainMemberName,
    notes: pNotes,
  });

  // Saves the patient immediately — this is deliberately independent of
  // practitioner/session fields below, so a patient can be captured and
  // stored without picking a clinician or finishing the booking.
  const savePatientNow = async () => {
    if (!pName.trim()) {
      setPatientError('Full name is required');
      return null;
    }
    setPatientSaving(true);
    setPatientError('');
    try {
      const saved = await onQuickAddClient(buildNewPatientPayload());
      setClientId(saved.id);
      setPatientMode('list');
      return saved.id;
    } catch (e) {
      setPatientError(e.message || 'Could not save patient');
      return null;
    } finally {
      setPatientSaving(false);
    }
  };

  const submit = async () => {
    let cId = clientId;
    if (!cId && patientMode === 'new' && pName.trim()) {
      cId = await savePatientNow();
    }
    if (!cId) return;
    setSaving(true);
    await onSave({
      id: appt?.id || uid(),
      client_id: cId,
      practitioner_id: practitionerId || null,
      date,
      time,
      duration_minutes: Number(duration),
      session_type: sessionType,
      rate: Number(rate),
      notes,
      status,
    });
    setSaving(false);
  };

  return (
    <Modal title={appt ? 'Edit booking' : 'New booking'} onClose={onClose}>
      <SectionLabel>Patient</SectionLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => setPatientMode('list')}
          style={{ ...iconBtnStyle, background: patientMode === 'list' ? COLORS.teal : COLORS.paper, color: patientMode === 'list' ? '#fff' : COLORS.ink, border: `1px solid ${patientMode === 'list' ? COLORS.teal : COLORS.line}` }}
        >
          <Users size={13} /> Patient list
        </button>
        <button
          type="button"
          onClick={() => setPatientMode('new')}
          style={{ ...iconBtnStyle, background: patientMode === 'new' ? COLORS.teal : COLORS.paper, color: patientMode === 'new' ? '#fff' : COLORS.ink, border: `1px solid ${patientMode === 'new' ? COLORS.teal : COLORS.line}` }}
        >
          <UserPlus size={13} /> New patient
        </button>
      </div>

      {patientMode === 'list' ? (
        <>
          {clients.length === 0 ? (
            <div style={{ fontSize: 13, color: COLORS.slate, marginBottom: 14 }}>No patients yet — switch to "New patient" to add one.</div>
          ) : (
            <>
              <Field label="Search patients">
                <input style={inputStyle} value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} placeholder="Type a name…" />
              </Field>
              <Field label="Patient">
                <select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  <option value="">— Select patient —</option>
                  {filteredClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              {selectedClient?.medical_aid_scheme && (
                <div style={{ fontSize: 12, color: COLORS.slate, marginTop: -8, marginBottom: 14 }}>
                  Medical aid: {selectedClient.medical_aid_scheme}{selectedClient.medical_aid_number ? ` · ${selectedClient.medical_aid_number}` : ''}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <Field label="Full name"><input style={inputStyle} value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Jane Dlamini" /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="ID number"><input style={inputStyle} value={pIdNumber} onChange={(e) => setPIdNumber(e.target.value)} placeholder="0000000000000" /></Field></div>
            <div style={{ flex: 1 }}><Field label="Date of birth"><input type="date" style={inputStyle} value={pDob} onChange={(e) => setPDob(e.target.value)} /></Field></div>
          </div>
          <Field label="Gender">
            <select style={inputStyle} value={pGender} onChange={(e) => setPGender(e.target.value)}>
              <option value="">— Not specified —</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Phone"><input style={inputStyle} value={pPhone} onChange={(e) => setPPhone(e.target.value)} placeholder="082 000 0000" /></Field></div>
            <div style={{ flex: 1 }}><Field label="Email"><input style={inputStyle} value={pEmail} onChange={(e) => setPEmail(e.target.value)} placeholder="jane@example.com" /></Field></div>
          </div>
          <Field label="Address"><textarea style={{ ...inputStyle, minHeight: 56 }} value={pAddress} onChange={(e) => setPAddress(e.target.value)} placeholder="Street, suburb, city" /></Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><Field label="Medical aid scheme"><input style={inputStyle} value={pMedicalAidScheme} onChange={(e) => setPMedicalAidScheme(e.target.value)} placeholder="Discovery Health" /></Field></div>
            <div style={{ flex: 1 }}><Field label="Membership number"><input style={inputStyle} value={pMedicalAidNumber} onChange={(e) => setPMedicalAidNumber(e.target.value)} /></Field></div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ width: 130 }}><Field label="Dependent code"><input style={inputStyle} value={pDependentCode} onChange={(e) => setPDependentCode(e.target.value)} placeholder="00" /></Field></div>
            <div style={{ flex: 1 }}><Field label="Main member (if not patient)"><input style={inputStyle} value={pMainMemberName} onChange={(e) => setPMainMemberName(e.target.value)} /></Field></div>
          </div>
          <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 56 }} value={pNotes} onChange={(e) => setPNotes(e.target.value)} placeholder="Referral source, relevant history…" /></Field>
          <Btn variant="ghost" onClick={savePatientNow} disabled={patientSaving} style={{ width: '100%', justifyContent: 'center', marginBottom: patientError ? 6 : 14 }}>
            {patientSaving ? 'Saving patient…' : 'Save patient'}
          </Btn>
          {patientError && <div style={{ fontSize: 12, color: COLORS.rust, marginBottom: 14 }}>{patientError}</div>}
        </>
      )}

      <SectionLabel>Booking details</SectionLabel>
      {practitioners?.length > 0 && (
        <Field label="Practitioner">
          <select style={inputStyle} value={practitionerId} onChange={(e) => handlePractitioner(e.target.value)}>
            <option value="">— Select practitioner —</option>
            {practitioners.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({DISCIPLINE_LABEL[p.discipline]})</option>
            ))}
          </select>
        </Field>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Date"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Time"><input type="time" style={inputStyle} value={time} onChange={(e) => setTime(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <Field label="Session type">
            <select style={inputStyle} value={sessionType} onChange={(e) => handleSessionType(e.target.value)}>
              {disciplineTypes.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </Field>
        </div>
        <div style={{ width: 100 }}><Field label="Duration (min)"><input type="number" style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Rate (ZAR)"><input type="number" style={inputStyle} value={rate} onChange={(e) => setRate(e.target.value)} /></Field></div>
        <div style={{ flex: 1 }}>
          <Field label="Status">
            <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="scheduled">Scheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no-show">No-show</option>
            </select>
          </Field>
        </div>
      </div>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Clinical notes, focus areas, precautions…" /></Field>
      <Btn onClick={submit} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
        {saving ? 'Saving…' : appt ? 'Save changes' : 'Create booking'}
      </Btn>
    </Modal>
  );
}
