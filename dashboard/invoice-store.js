// Saved changes to invoices made on the data entry page.
// Demo only: changes are kept in this browser's local storage. A real app
// would send them to the server, e.g. PATCH /api/invoices/:id.

const EDITS_KEY = 'apPortalInvoiceEdits';

function loadInvoiceEdits() {
  try {
    return JSON.parse(localStorage.getItem(EDITS_KEY)) || {};
  } catch {
    return {};
  }
}

// Returns true if the change was stored, false if this browser blocks storage.
function saveInvoiceEdit(id, edit) {
  const all = loadInvoiceEdits();
  all[id] = edit;
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

function clearInvoiceEdits() {
  try {
    localStorage.removeItem(EDITS_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

function hasInvoiceEdits() {
  return Object.keys(loadInvoiceEdits()).length > 0;
}

// Applies saved changes to an invoice from data.js. A change can be a full
// data entry record or just a status change (e.g. an approval), so any field
// may be missing. Dates are stored as YYYY-MM-DD strings.
function applyInvoiceEdit(inv, edit) {
  if (!edit) return inv;
  const toDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  return {
    ...inv,
    number: edit.number ?? inv.number,
    vendor: edit.vendor ?? inv.vendor,
    invoiceDate: edit.invoiceDate ? toDate(edit.invoiceDate) : inv.invoiceDate,
    dueDate: edit.dueDate ? toDate(edit.dueDate) : inv.dueDate,
    amount: edit.total ?? inv.amount,
    status: edit.status ?? inv.status,
    edit,
  };
}

// ---------- store interface used by the pages ----------
// The API version (api-data.js) has the same functions. Each returns a
// promise of { ok, error }.

async function storeSaveDraft(id, edit) {
  return saveInvoiceEdit(id, edit)
    ? { ok: true }
    : { ok: false, error: 'This browser blocked saving. Your changes are only on this page.' };
}

async function storeSubmit(id, edit) {
  return saveInvoiceEdit(id, edit)
    ? { ok: true }
    : { ok: false, error: 'This browser blocked saving, so the invoice could not be submitted.' };
}

// Records an approval for the waiting step and updates INVOICES in place.
async function storeApprove(inv, comment, hasNext, approverName) {
  const existing = loadInvoiceEdits()[inv.id] || {};
  const edit = {
    ...existing,
    status: hasNext ? 'pending' : 'approved',
    approvals: [...(existing.approvals || []), { by: approverName, comment, at: new Date().toISOString() }],
  };
  if (!saveInvoiceEdit(inv.id, edit)) {
    return { ok: false, error: 'This browser blocked saving, so the approval was not recorded.' };
  }
  const index = INVOICES.findIndex((i) => i.id === inv.id);
  INVOICES[index] = applyInvoiceEdit(ORIGINAL_INVOICES[index], edit);
  return { ok: true };
}
