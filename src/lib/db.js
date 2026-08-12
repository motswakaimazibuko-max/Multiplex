import { supabase } from '../supabaseClient';

// ---------- practice / team access ----------
// Resolves which shared practice the signed-in user belongs to, and their
// role in it. Call this once right after sign-in — the returned
// practiceOwnerId is what every other function's `userId` param should be.
export async function getPracticeContext(authUserId) {
  const { data: ownerId, error: rpcError } = await supabase.rpc('get_practice_owner_id');
  if (rpcError) throw rpcError;
  let role = 'manager'; // default: the original account (no membership row) is the practice owner/manager
  if (ownerId && ownerId !== authUserId) {
    const { data: membership } = await supabase
      .from('practice_members')
      .select('role')
      .eq('member_user_id', authUserId)
      .maybeSingle();
    if (membership?.role) role = membership.role;
  }
  return { practiceOwnerId: ownerId || authUserId, role };
}
export async function listTeam(practiceOwnerId) {
  const { data, error } = await supabase
    .from('practice_members')
    .select('*')
    .eq('practice_owner_id', practiceOwnerId)
    .order('invited_at');
  if (error) throw error;
  return data;
}
export async function inviteTeamMember(practiceOwnerId, { name, email, role }) {
  const { data, error } = await supabase
    .from('practice_members')
    .insert({ practice_owner_id: practiceOwnerId, name, email, role })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function removeTeamMember(id) {
  const { error } = await supabase.from('practice_members').delete().eq('id', id);
  if (error) throw error;
}

// ---------- settings ----------
export async function getSettings(userId) {
  const { data, error } = await supabase.from('settings').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function upsertSettings(userId, settings) {
  const { data, error } = await supabase
    .from('settings')
    .upsert({ user_id: userId, ...settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- clients ----------
export async function listClients(userId) {
  const { data, error } = await supabase.from('clients').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data;
}
export async function upsertClient(userId, client) {
  const payload = { ...client, user_id: userId };
  const { data, error } = await supabase.from('clients').upsert(payload).select().single();
  if (error) throw error;
  return data;
}
export async function deleteClient(id) {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) throw error;
}

// ---------- practitioners ----------
export async function listPractitioners(userId) {
  const { data, error } = await supabase.from('practitioners').select('*').eq('user_id', userId).order('name');
  if (error) throw error;
  return data;
}
export async function upsertPractitioner(userId, practitioner) {
  const payload = { ...practitioner, user_id: userId };
  const { data, error } = await supabase.from('practitioners').upsert(payload).select().single();
  if (error) throw error;
  return data;
}
export async function deletePractitioner(id) {
  const { error } = await supabase.from('practitioners').delete().eq('id', id);
  if (error) throw error;
}

// ---------- appointments ----------
export async function listAppointments(userId) {
  const { data, error } = await supabase
    .from('appointments')
    .select('*, client:clients(id, name, phone, email), practitioner:practitioners(id, name, discipline, email)')
    .eq('user_id', userId)
    .order('date')
    .order('time');
  if (error) throw error;
  return data;
}
export async function upsertAppointment(userId, appt) {
  const payload = { ...appt, user_id: userId };
  const { data, error } = await supabase.from('appointments').upsert(payload).select().single();
  if (error) throw error;
  return data;
}
export async function deleteAppointment(id) {
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if (error) throw error;
}

// ---------- invoices (+ items) ----------
export async function listInvoices(userId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, items:invoice_items(*)')
    .eq('user_id', userId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data;
}
export async function createInvoice(userId, invoice, items) {
  const { data: inv, error } = await supabase
    .from('invoices')
    .insert({ ...invoice, user_id: userId })
    .select()
    .single();
  if (error) throw error;

  const itemRows = items.map((it) => ({ ...it, invoice_id: inv.id }));
  const { data: savedItems, error: itemsError } = await supabase.from('invoice_items').insert(itemRows).select();
  if (itemsError) throw itemsError;

  return { ...inv, items: savedItems };
}
export async function updateInvoice(id, invoicePatch, items) {
  const { data: inv, error } = await supabase.from('invoices').update(invoicePatch).eq('id', id).select().single();
  if (error) throw error;

  // Replace line items wholesale (simplest correct approach for a small item list)
  const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', id);
  if (delErr) throw delErr;

  const itemRows = items.map((it) => ({ ...it, invoice_id: id }));
  const { data: savedItems, error: itemsError } = await supabase.from('invoice_items').insert(itemRows).select();
  if (itemsError) throw itemsError;

  return { ...inv, items: savedItems };
}
export async function setInvoiceStatus(id, status) {
  const { data, error } = await supabase.from('invoices').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteInvoice(id) {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}
export async function nextInvoiceNumber(userId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('number')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  const nums = (data || []).map((i) => parseInt((i.number || '').replace(/\D/g, ''), 10)).filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `INV-${String(next).padStart(4, '0')}`;
}
