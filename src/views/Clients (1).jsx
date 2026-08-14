import React, { useState } from 'react';
import { Mail, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';
import { Badge, Btn, COLORS, EmptyState, Field, Modal, SectionHeader, SectionLabel, SpineDivider, iconBtnStyle, inputStyle, uid } from '../theme';

export default function ClientsView({ clients, appointments, onNew, onEdit, onDelete }) {
  const apptCount = (id) => appointments.filter((a) => a.client_id === id).length;
  return (
    <div>
      <SectionHeader action={<Btn onClick={onNew}><Plus size={16} />Add client</Btn>}>Clients</SectionHeader>
      <SpineDivider />
      {clients.length === 0 && <EmptyState icon={Users} title="No clients yet" sub="Add a client to start booking sessions." actionLabel="Add client" onAction={onNew} />}
      {clients.map((c) => (
        <div key={c.id} style={{ background: COLORS.paperRaised, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 14, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 15 }}>{c.name}</div>
              <div style={{ fontSize: 13, color: COLORS.slate, marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {c.phone && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Phone size={12} />{c.phone}</span>}
                {c.email && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Mail size={12} />{c.email}</span>}
              </div>
            </div>
            <Badge tone="slate">{apptCount(c.id)} session{apptCount(c.id) === 1 ? '' : 's'}</Badge>
          </div>
          {(c.medical_aid_scheme || c.is_wmp) && (
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {c.medical_aid_scheme && <Badge tone="teal">{c.medical_aid_scheme}{c.medical_aid_number ? ` · ${c.medical_aid_number}` : ''}</Badge>}
              {c.is_wmp && <Badge tone="rust">WMP</Badge>}
            </div>
          )}
          {c.notes && <div style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 8 }}>{c.notes}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => onEdit(c)} style={iconBtnStyle}><Pencil size={14} /> Edit</button>
            <button onClick={() => onDelete(c.id)} style={{ ...iconBtnStyle, color: COLORS.rust }}><Trash2 size={14} /> Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClientFormModal({ client, onClose, onSave }) {
  const [name, setName] = useState(client?.name || '');
  const [idNumber, setIdNumber] = useState(client?.id_number || '');
  const [dob, setDob] = useState(client?.date_of_birth || '');
  const [gender, setGender] = useState(client?.gender || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [email, setEmail] = useState(client?.email || '');
  const [address, setAddress] = useState(client?.address || '');
  const [medicalAidScheme, setMedicalAidScheme] = useState(client?.medical_aid_scheme || '');
  const [medicalAidNumber, setMedicalAidNumber] = useState(client?.medical_aid_number || '');
  const [dependentCode, setDependentCode] = useState(client?.medical_aid_dependent_code || '');
  const [mainMemberName, setMainMemberName] = useState(client?.main_member_name || '');
  const [isWmp, setIsWmp] = useState(client?.is_wmp || false);
  const [notes, setNotes] = useState(client?.notes || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      id: client?.id || uid(),
      name: name.trim(),
      id_number: idNumber,
      date_of_birth: dob || null,
      gender,
      phone,
      email,
      address,
      medical_aid_scheme: medicalAidScheme,
      medical_aid_number: medicalAidNumber,
      medical_aid_dependent_code: dependentCode,
      main_member_name: mainMemberName,
      is_wmp: isWmp,
      notes,
    });
    setSaving(false);
  };

  return (
    <Modal title={client ? 'Edit client' : 'Add client'} onClose={onClose}>
      <SectionLabel>Personal information</SectionLabel>
      <Field label="Full name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Dlamini" /></Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="ID number"><input style={inputStyle} value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="0000000000000" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Date of birth"><input type="date" style={inputStyle} value={dob} onChange={(e) => setDob(e.target.value)} /></Field></div>
      </div>
      <Field label="Gender">
        <select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
          <option value="">— Not specified —</option>
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </select>
      </Field>

      <SectionLabel>Contact details</SectionLabel>
      <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" /></Field>
      <Field label="Email"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" /></Field>
      <Field label="Address"><textarea style={{ ...inputStyle, minHeight: 56 }} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, suburb, city" /></Field>

      <SectionLabel>Medical aid details</SectionLabel>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Scheme name"><input style={inputStyle} value={medicalAidScheme} onChange={(e) => setMedicalAidScheme(e.target.value)} placeholder="Discovery Health" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Membership number"><input style={inputStyle} value={medicalAidNumber} onChange={(e) => setMedicalAidNumber(e.target.value)} /></Field></div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ width: 130 }}><Field label="Dependent code"><input style={inputStyle} value={dependentCode} onChange={(e) => setDependentCode(e.target.value)} placeholder="00" /></Field></div>
        <div style={{ flex: 1 }}><Field label="Main member (if not patient)"><input style={inputStyle} value={mainMemberName} onChange={(e) => setMainMemberName(e.target.value)} /></Field></div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: COLORS.ink, margin: '4px 0 14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={isWmp} onChange={(e) => setIsWmp(e.target.checked)} style={{ width: 16, height: 16 }} />
        Weight Management Program (WMP)
      </label>

      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Referral source, relevant history…" /></Field>
      <Btn onClick={submit} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
        {saving ? 'Saving…' : client ? 'Save changes' : 'Add client'}
      </Btn>
    </Modal>
  );
}
