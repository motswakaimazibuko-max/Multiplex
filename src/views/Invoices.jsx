import React, { useState } from 'react';
import { Check, FileText, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { Badge, Btn, COLORS, EmptyState, Field, Modal, SectionHeader, SpineDivider, iconBtnStyle, inputStyle, money, todayISO, uid } from '../theme';

export default function InvoicesView({ invoices, onNew, onView, onToggleStatus, onDelete }) {
  const totalOutstanding = invoices.filter((i) => i.status !== 'paid').reduce((s, i) => s + Number(i.total), 0);
  return (
    <div>
      <SectionHeader action={<Btn onClick={onNew}><Plus size={16} />New invoice</Btn>}>Invoices</SectionHeader>
      <SpineDivider />
      {invoices.length > 0 && (
        <div style={{ background: COLORS.ink, borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#DCE6E2', fontSize: 13 }}>Outstanding balance</span>
          <span style={{ color: '#fff', fontFamily: 'IBM Plex Mono, monospace', fontSize: 18, fontWeight: 600 }}>{money(totalOutstanding)}</span>
        </div>
      )}
      {invoices.length === 0 && <EmptyState icon={FileText} title="No invoices yet" sub="Create an invoice from a booking or from scratch." actionLabel="New invoice" onAction={onNew} />}
      {invoices.map((inv) => (
        <div key={inv.id} onClick={() => onView(inv)} style={{ background: COLORS.paperRaised, border: `1px solid ${COLORS.line}`, borderRadius: 14, padding: 14, marginBottom: 10, cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 15 }}>{inv.client_name}</div>
              <div style={{ fontSize: 12.5, color: COLORS.slate, fontFamily: 'IBM Plex Mono, monospace', marginTop: 2 }}>{inv.number} · {inv.date}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, color: COLORS.ink }}>{money(inv.total)}</div>
              <Badge tone={inv.status === 'paid' ? 'teal' : 'rust'}>{inv.status}</Badge>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onToggleStatus(inv)} style={iconBtnStyle}><Check size={14} /> Mark {inv.status === 'paid' ? 'unpaid' : 'paid'}</button>
            <button onClick={() => onDelete(inv.id)} style={{ ...iconBtnStyle, color: COLORS.rust }}><Trash2 size={14} /> Remove</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// Used for both creating a new invoice and editing an existing one.
// Pass `invoice` (with .items) to edit; omit to create.
export function InvoiceFormModal({ invoice, fromAppt, clients, nextNumber, onClose, onSave }) {
  const isEdit = !!invoice;
  const [clientId, setClientId] = useState(invoice?.client_id || fromAppt?.client_id || '');
  const [date, setDate] = useState(invoice?.date || todayISO());
  const [vatRate, setVatRate] = useState(invoice ? Number(invoice.vat_rate) * 100 : 15);
  const [items, setItems] = useState(
    invoice
      ? invoice.items.map((it) => ({ id: it.id || uid(), description: it.description, qty: it.qty, rate: it.rate }))
      : fromAppt
      ? [{ id: uid(), description: `${fromAppt.session_type} — ${fromAppt.date}`, qty: 1, rate: fromAppt.rate }]
      : [{ id: uid(), description: '', qty: 1, rate: 0 }]
  );
  const [saving, setSaving] = useState(false);

  const addItem = () => setItems([...items, { id: uid(), description: '', qty: 1, rate: 0 }]);
  const updateItem = (id, patch) => setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const removeItem = (id) => setItems(items.filter((it) => it.id !== id));

  const subtotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.rate || 0), 0);
  const rateFraction = Number(vatRate || 0) / 100;
  const vat = subtotal * rateFraction;
  const total = subtotal + vat;

  const submit = async () => {
    const client = clients.find((c) => c.id === clientId);
    const clientName = client?.name || invoice?.client_name;
    if (!clientId || !clientName) return;
    setSaving(true);
    const itemPayload = items.map((it) => ({
      description: it.description,
      qty: Number(it.qty),
      rate: Number(it.rate),
      amount: Number(it.qty) * Number(it.rate),
    }));
    if (isEdit) {
      await onSave(invoice.id, { client_id: clientId, client_name: clientName, date, vat_rate: rateFraction, subtotal, vat, total }, itemPayload);
    } else {
      await onSave(
        { id: uid(), number: nextNumber, client_id: clientId, client_name: clientName, date, vat_rate: rateFraction, subtotal, vat, total, status: 'unpaid', appointment_id: fromAppt?.id || null },
        itemPayload
      );
    }
    setSaving(false);
  };

  return (
    <Modal title={isEdit ? `Edit invoice ${invoice.number}` : 'New invoice'} onClose={onClose} wide>
      <Field label="Client">
        <select style={inputStyle} value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={!!fromAppt}>
          <option value="">— Select client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}><Field label="Invoice date"><input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
        <div style={{ width: 120 }}>
          <Field label="VAT rate (%)">
            <input type="number" step="0.01" min="0" max="100" style={inputStyle} value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
          </Field>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.slate, textTransform: 'uppercase', letterSpacing: 0.4, margin: '16px 0 8px' }}>Line items</div>
      {items.map((it) => (
        <div key={it.id} style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
          <input style={{ ...inputStyle, flex: 3 }} placeholder="Description" value={it.description} onChange={(e) => updateItem(it.id, { description: e.target.value })} />
          <input type="number" style={{ ...inputStyle, flex: 1 }} placeholder="Qty" value={it.qty} onChange={(e) => updateItem(it.id, { qty: e.target.value })} />
          <input type="number" style={{ ...inputStyle, flex: 1 }} placeholder="Rate" value={it.rate} onChange={(e) => updateItem(it.id, { rate: e.target.value })} />
          <button onClick={() => removeItem(it.id)} style={{ background: 'none', border: 'none', color: COLORS.rust, cursor: 'pointer', padding: 6 }}><Trash2 size={16} /></button>
        </div>
      ))}
      <button onClick={addItem} style={{ ...iconBtnStyle, marginBottom: 14 }}><Plus size={14} /> Add line item</button>

      <div style={{ borderTop: `1px solid ${COLORS.line}`, paddingTop: 12, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: COLORS.slate }}><span>Subtotal</span><span>{money(subtotal)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: COLORS.slate }}><span>VAT ({Number(vatRate || 0).toFixed(2)}%)</span><span>{money(vat)}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: COLORS.ink, fontSize: 16 }}><span>Total</span><span>{money(total)}</span></div>
      </div>

      <Btn onClick={submit} disabled={saving} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
        {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create invoice'}
      </Btn>
    </Modal>
  );
}

export function InvoiceDetailModal({ invoice, settings, onClose, onToggleStatus, onEdit }) {
  const handlePrint = () => window.print();
  const vatPct = (Number(invoice.vat_rate) * 100).toFixed(2);
  return (
    <Modal title={`Invoice ${invoice.number}`} onClose={onClose} wide>
      <div style={{ background: '#fff', border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: 'Newsreader, serif', fontSize: 20, color: COLORS.ink }}>{settings?.practice_name}</div>
            {settings?.practitioner_name && <div style={{ fontSize: 12.5, color: COLORS.slate }}>{settings.practitioner_name}</div>}
            {settings?.hpcsa_number && <div style={{ fontSize: 12.5, color: COLORS.slate }}>HPCSA: {settings.hpcsa_number}</div>}
            {settings?.bhf_number && <div style={{ fontSize: 12.5, color: COLORS.slate }}>BHF: {settings.bhf_number}</div>}
            {settings?.email && <div style={{ fontSize: 12.5, color: COLORS.slate }}>{settings.email}</div>}
            {settings?.phone && <div style={{ fontSize: 12.5, color: COLORS.slate }}>{settings.phone}</div>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontWeight: 700, color: COLORS.ink }}>{invoice.number}</div>
            <div style={{ fontSize: 12.5, color: COLORS.slate }}>{invoice.date}</div>
            <div style={{ marginTop: 6 }}><Badge tone={invoice.status === 'paid' ? 'teal' : 'rust'}>{invoice.status}</Badge></div>
          </div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.slate, textTransform: 'uppercase', marginBottom: 4 }}>Billed to</div>
        <div style={{ fontSize: 15, color: COLORS.ink, marginBottom: 18 }}>{invoice.client_name}</div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.line}`, textAlign: 'left', color: COLORS.slate }}>
              <th style={{ padding: '6px 0', fontWeight: 600 }}>Description</th>
              <th style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>Qty</th>
              <th style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>Rate</th>
              <th style={{ padding: '6px 0', fontWeight: 600, textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items || []).map((it) => (
              <tr key={it.id} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                <td style={{ padding: '8px 0', color: COLORS.ink }}>{it.description}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: COLORS.inkSoft, fontFamily: 'IBM Plex Mono, monospace' }}>{it.qty}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: COLORS.inkSoft, fontFamily: 'IBM Plex Mono, monospace' }}>{money(it.rate)}</td>
                <td style={{ padding: '8px 0', textAlign: 'right', color: COLORS.ink, fontFamily: 'IBM Plex Mono, monospace' }}>{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 14, marginLeft: 'auto', width: 200, fontFamily: 'IBM Plex Mono, monospace', fontSize: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: COLORS.slate, marginBottom: 3 }}><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: COLORS.slate, marginBottom: 3 }}><span>VAT ({vatPct}%)</span><span>{money(invoice.vat)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: COLORS.ink, fontSize: 16, borderTop: `1px solid ${COLORS.line}`, paddingTop: 5 }}><span>Total</span><span>{money(invoice.total)}</span></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <Btn onClick={() => onEdit(invoice)} variant="ghost"><Pencil size={15} /> Edit invoice</Btn>
        <Btn onClick={handlePrint} variant="ghost"><Printer size={15} /> Print / Save PDF</Btn>
        <Btn onClick={() => onToggleStatus(invoice)}><Check size={15} /> Mark {invoice.status === 'paid' ? 'unpaid' : 'paid'}</Btn>
      </div>
    </Modal>
  );
}
