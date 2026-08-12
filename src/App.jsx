import React, { useEffect, useState, useCallback } from 'react';
import { Calendar, FileText, Settings as SettingsIcon, Users, LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';
import Auth from './Auth';
import { COLORS, waLink, reminderText } from './theme';
import * as db from './lib/db';
import { deleteCalendarEvent, isGoogleCalendarConfigured, requestGoogleAccessToken, upsertCalendarEvent } from './lib/googleCalendar';

import BookingsView, { ApptFormModal } from './views/Bookings';
import ClientsView, { ClientFormModal } from './views/Clients';
import InvoicesView, { InvoiceFormModal, InvoiceDetailModal } from './views/Invoices';
import SettingsModal from './views/Settings';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const [practiceCtx, setPracticeCtx] = useState(undefined); // undefined = resolving, null = not yet available
  const [ctxError, setCtxError] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setPracticeCtx(null);
      return;
    }
    setPracticeCtx(undefined);
    setCtxError(null);
    db.getPracticeContext(session.user.id)
      .then(setPracticeCtx)
      .catch((e) => setCtxError(e.message || 'Could not load your practice.'));
  }, [session]);

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.paper, fontFamily: 'Inter, sans-serif', color: COLORS.slate }}>
        Loading…
      </div>
    );
  }
  if (!session) return <Auth />;
  if (ctxError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.paper, fontFamily: 'Inter, sans-serif', padding: 20 }}>
        <div style={{ maxWidth: 420, textAlign: 'center', color: COLORS.slate }}>
          <div style={{ color: COLORS.rust, fontWeight: 600, marginBottom: 8 }}>Couldn't load your practice</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>{ctxError}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 }}>
            This usually means migration <code>0005_multi_user_practice.sql</code> hasn't been run in Supabase yet — run it in the SQL Editor, then reload.
          </div>
          <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: COLORS.teal, cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>Sign out</button>
        </div>
      </div>
    );
  }
  // practiceCtx can still be null/undefined here for a render or two after
  // `session` flips truthy — the effect that resolves it hasn't run yet.
  // Keep showing the loading state rather than reading off of it.
  if (!practiceCtx) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.paper, fontFamily: 'Inter, sans-serif', color: COLORS.slate }}>
        Loading…
      </div>
    );
  }
  return <PracticeApp userId={practiceCtx.practiceOwnerId} authUserId={session.user.id} role={practiceCtx.role} />;
}

function PracticeApp({ userId, authUserId, role }) {
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('bookings');
  const [clients, setClients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState(null);
  const [practitioners, setPractitioners] = useState([]);
  const [team, setTeam] = useState([]);

  const [showApptForm, setShowApptForm] = useState(false);
  const [editingAppt, setEditingAppt] = useState(null);
  const [showClientForm, setShowClientForm] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [invoiceDraftFromAppt, setInvoiceDraftFromAppt] = useState(null);
  const [viewingInvoice, setViewingInvoice] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [nextInvNumber, setNextInvNumber] = useState('INV-0001');
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [googleToken, setGoogleToken] = useState(null);

  const connectGoogleCalendar = async () => {
    const token = await requestGoogleAccessToken();
    setGoogleToken(token);
    return token;
  };

  // Best-effort calendar sync: never blocks or breaks the booking save if it fails
  // (e.g. token expired, not connected, offline). Passing clientEmail/clinicianEmail
  // makes Google email a calendar invite/update to the patient (and the practice
  // inbox) — that's the actual notification, not just a calendar entry.
  const syncApptToCalendar = async (appt, clientName, clientEmail, practitioner) => {
    if (!googleToken) return null;
    const clinicianEmail = practitioner?.email || settings?.email;
    const practitionerLabel = practitioner ? `${practitioner.name} (${practitioner.discipline === 'gp' ? 'GP' : 'Biokineticist'})` : null;
    try {
      const eventId = await upsertCalendarEvent(googleToken, appt, clientName, clientEmail, clinicianEmail, practitionerLabel);
      return eventId;
    } catch (e) {
      console.warn('Google Calendar sync skipped:', e.message);
      return appt.google_event_id || null;
    }
  };

  const refreshAll = useCallback(async () => {
    const [c, a, i, s, p, t] = await Promise.all([
      db.listClients(userId),
      db.listAppointments(userId),
      db.listInvoices(userId),
      db.getSettings(userId),
      db.listPractitioners(userId),
      db.listTeam(userId),
    ]);
    setClients(c);
    setAppointments(a);
    setInvoices(i);
    setSettings(s || (await db.upsertSettings(userId, { practice_name: '' })));
    setPractitioners(p);
    setTeam(t);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // ---- clients ----
  const saveClient = async (client) => {
    const saved = await db.upsertClient(userId, client);
    setClients((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    return saved;
  };
  const removeClient = async (id) => {
    await db.deleteClient(id);
    setClients((prev) => prev.filter((c) => c.id !== id));
  };

  // ---- practitioners ----
  const savePractitioner = async (p) => {
    const saved = await db.upsertPractitioner(userId, p);
    setPractitioners((prev) => {
      const exists = prev.some((x) => x.id === saved.id);
      return exists ? prev.map((x) => (x.id === saved.id ? saved : x)) : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    return saved;
  };
  const removePractitioner = async (id) => {
    await db.deletePractitioner(id);
    setPractitioners((prev) => prev.filter((p) => p.id !== id));
  };

  // ---- team access (Practice Manager, GP, Biokineticist logins) ----
  const inviteTeamMember = async (member) => {
    const saved = await db.inviteTeamMember(userId, member);
    setTeam((prev) => [...prev, saved]);
    // Also add a matching practitioner entry so a GP/biokineticist teammate
    // shows up in the booking dropdown right away, not just the login list.
    if (member.role === 'gp' || member.role === 'biokineticist') {
      await savePractitioner({ name: member.name, discipline: member.role, email: member.email, registration_number: '', phone: '', active: true });
    }
    return saved;
  };
  const removeTeamMember = async (id) => {
    await db.removeTeamMember(id);
    setTeam((prev) => prev.filter((t) => t.id !== id));
  };

  // ---- appointments ----
  const saveAppt = async (appt, isNew) => {
    const client = clients.find((c) => c.id === appt.client_id);
    const clientName = client?.name || '';
    const practitioner = practitioners.find((p) => p.id === appt.practitioner_id) || null;
    let payload = appt;
    if (appt.status === 'scheduled') {
      const eventId = await syncApptToCalendar(appt, clientName, client?.email, practitioner);
      if (eventId) payload = { ...appt, google_event_id: eventId };
    } else if (appt.google_event_id && googleToken) {
      await deleteCalendarEvent(googleToken, appt.google_event_id);
      payload = { ...appt, google_event_id: null };
    }
    const saved = await db.upsertAppointment(userId, payload);
    await refreshAll();

    // Only notify on a brand-new, actually-scheduled booking — not on edits
    // or cancellations, and not on every re-save.
    if (isNew && payload.status === 'scheduled') {
      // Instant email confirmation to patient + clinician (fire-and-forget;
      // failures are logged inside sendBookingConfirmation, not thrown).
      db.sendBookingConfirmation(saved.id);

      // No WhatsApp Business API is wired up, so the closest we can do to an
      // "instant" WhatsApp notification is pre-fill the message and open it
      // for the practitioner to tap send.
      if (client?.phone) {
        const text = reminderText(clientName, payload, settings);
        const link = waLink(client.phone, text);
        if (link) window.open(link, '_blank', 'noopener,noreferrer');
      }
    }
  };
  const removeAppt = async (id) => {
    const appt = appointments.find((a) => a.id === id);
    if (appt?.google_event_id && googleToken) {
      await deleteCalendarEvent(googleToken, appt.google_event_id);
    }
    await db.deleteAppointment(id);
    setAppointments((prev) => prev.filter((a) => a.id !== id));
  };

  // ---- invoices ----
  const openNewInvoice = async (fromAppt) => {
    setNextInvNumber(await db.nextInvoiceNumber(userId));
    setInvoiceDraftFromAppt(fromAppt || null);
    setShowInvoiceForm(true);
  };
  const createInvoice = async (invoice, items) => {
    const saved = await db.createInvoice(userId, invoice, items);
    setInvoices((prev) => [saved, ...prev]);
    setShowInvoiceForm(false);
    setViewingInvoice(saved);
  };
  const editInvoice = async (id, patch, items) => {
    const updated = await db.updateInvoice(id, patch, items);
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...updated } : i)));
    setShowInvoiceForm(false);
    setEditingInvoice(null);
    setViewingInvoice((v) => (v && v.id === id ? { ...v, ...updated } : v));
  };
  const openEditInvoice = (inv) => {
    setViewingInvoice(null);
    setEditingInvoice(inv);
    setShowInvoiceForm(true);
  };
  const toggleInvoiceStatus = async (inv) => {
    const updated = await db.setInvoiceStatus(inv.id, inv.status === 'paid' ? 'unpaid' : 'paid');
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
    setViewingInvoice((v) => (v && v.id === updated.id ? { ...v, ...updated } : v));
  };
  const removeInvoice = async (id) => {
    await db.deleteInvoice(id);
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  const saveSettings = async (s) => {
    const saved = await db.upsertSettings(userId, s);
    setSettings(saved);
  };

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.paper, fontFamily: 'Inter, sans-serif', color: COLORS.slate }}>
        Loading practice data…
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: COLORS.paper, fontFamily: 'Inter, sans-serif', paddingBottom: 90 }}>
      <header style={{ padding: '22px 20px 14px', background: '#fff', borderBottom: `1px solid ${COLORS.line}`, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: COLORS.teal, textTransform: 'uppercase' }}>
              {role === 'gp' ? 'GP' : role === 'biokineticist' ? 'Biokineticist' : 'Practice Manager'}
            </div>
            <h1 style={{ fontFamily: 'Newsreader, serif', fontSize: 26, color: COLORS.ink, margin: '2px 0 0' }}>{settings?.practice_name || 'Your Practice'}</h1>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setShowSettings(true)} style={{ background: 'none', border: 'none', color: COLORS.slate, cursor: 'pointer', padding: 8 }}>
              <SettingsIcon size={20} />
            </button>
            <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: COLORS.slate, cursor: 'pointer', padding: 8 }}>
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main style={{ padding: '18px 16px 40px', maxWidth: 720, margin: '0 auto' }}>
        {tab === 'bookings' && (
          <BookingsView
            appointments={appointments}
            clients={clients}
            settings={settings}
            practitioners={practitioners}
            onNew={() => { setEditingAppt(null); setShowApptForm(true); }}
            onEdit={(a) => { setEditingAppt(a); setShowApptForm(true); }}
            onDelete={removeAppt}
            onStatusChange={(a, status) => saveAppt({ ...a, status, client_id: a.client_id })}
            onInvoice={(a) => openNewInvoice(a)}
          />
        )}
        {tab === 'clients' && (
          <ClientsView
            clients={clients}
            appointments={appointments}
            onNew={() => { setEditingClient(null); setShowClientForm(true); }}
            onEdit={(c) => { setEditingClient(c); setShowClientForm(true); }}
            onDelete={removeClient}
          />
        )}
        {tab === 'invoices' && (
          <InvoicesView
            invoices={invoices}
            onNew={() => openNewInvoice(null)}
            onView={(inv) => setViewingInvoice(inv)}
            onToggleStatus={toggleInvoiceStatus}
            onDelete={removeInvoice}
          />
        )}
      </main>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: `1px solid ${COLORS.line}`, display: 'flex', padding: '8px 10px', paddingBottom: 'max(8px, env(safe-area-inset-bottom))', zIndex: 20 }}>
        {[
          { key: 'bookings', label: 'Bookings', icon: Calendar },
          { key: 'clients', label: 'Clients', icon: Users },
          { key: 'invoices', label: 'Invoices', icon: FileText },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '6px 0', color: tab === key ? COLORS.teal : COLORS.slate }}>
            <Icon size={20} strokeWidth={tab === key ? 2.4 : 2} />
            <span style={{ fontSize: 11, fontWeight: tab === key ? 700 : 500 }}>{label}</span>
          </button>
        ))}
      </nav>

      {showApptForm && (
        <ApptFormModal
          appt={editingAppt}
          clients={clients}
          practitioners={practitioners}
          onClose={() => setShowApptForm(false)}
          onSave={async (a) => { await saveAppt(a, !editingAppt); setShowApptForm(false); }}
          onQuickAddClient={saveClient}
        />
      )}
      {showClientForm && (
        <ClientFormModal
          client={editingClient}
          onClose={() => setShowClientForm(false)}
          onSave={async (c) => { await saveClient(c); setShowClientForm(false); }}
        />
      )}
      {showInvoiceForm && (
        <InvoiceFormModal
          invoice={editingInvoice}
          fromAppt={invoiceDraftFromAppt}
          clients={clients}
          nextNumber={nextInvNumber}
          onClose={() => { setShowInvoiceForm(false); setEditingInvoice(null); }}
          onSave={editingInvoice ? editInvoice : createInvoice}
        />
      )}
      {viewingInvoice && (
        <InvoiceDetailModal
          invoice={invoices.find((i) => i.id === viewingInvoice.id) || viewingInvoice}
          settings={settings}
          onClose={() => setViewingInvoice(null)}
          onToggleStatus={toggleInvoiceStatus}
          onEdit={openEditInvoice}
        />
      )}
      {showSettings && (
        <SettingsModal
          settings={settings}
          practitioners={practitioners}
          onSavePractitioner={savePractitioner}
          onDeletePractitioner={removePractitioner}
          team={team}
          myRole={role}
          onInviteTeamMember={inviteTeamMember}
          onRemoveTeamMember={removeTeamMember}
          googleConnected={!!googleToken}
          googleConfigured={isGoogleCalendarConfigured}
          onConnectGoogle={connectGoogleCalendar}
          onClose={() => setShowSettings(false)}
          onSave={async (s) => { await saveSettings(s); setShowSettings(false); }}
        />
      )}
    </div>
  );
}
