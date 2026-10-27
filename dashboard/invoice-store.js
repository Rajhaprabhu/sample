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

// Applies saved changes to an invoice from data.js. Dates are stored as
// YYYY-MM-DD strings and turned back into local dates here.
function applyInvoiceEdit(inv, edit) {
  if (!edit) return inv;
  const toDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  return {
    ...inv,
    number: edit.number,
    vendor: edit.vendor,
    invoiceDate: toDate(edit.invoiceDate),
    dueDate: toDate(edit.dueDate),
    amount: edit.total,
    status: edit.status,
    edit,
  };
}
