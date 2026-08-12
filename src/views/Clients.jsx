import React, { useState } from 'react';
import { Mail, Pencil, Phone, Plus, Trash2, Users } from 'lucide-react';
import { Badge, Btn, COLORS, EmptyState, Field, Modal, SectionHeader, SpineDivider, iconBtnStyle, inputStyle, uid } from '../theme';

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
  const [phone, setPhone] = useState(client?.phone || '');
  const [email, setEmail] = useState(client?.email || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: client?.id || uid(), name: name.trim(), phone, email, notes });
    setSaving(false);
  };

  return (
    <Modal title={client ? 'Edit client' : 'Add client'} onClose={onClose}>
      <Field label="Full name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Dlamini" /></Field>
      <Field label="Phone"><input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" /></Field>
      <Field label="Email"><input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" /></Field>
      <Field label="Notes"><textarea style={{ ...inputStyle, minHeight: 70 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Medical aid, referral source, relevant history…" /></Field>
      <Btn onClick={submit} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
        {saving ? 'Saving…' : client ? 'Save changes' : 'Add client'}
      </Btn>
    </Modal>
  );
}
