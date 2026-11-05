// Data source for the dashboard pages when they are served by the .NET backend.
// Loads the signed-in user, the dropdown choices and the invoices from the AP
// Portal API, and provides the same globals and store functions as the sample
// data files (data.js, invoice-details-data.js, invoice-store.js).

const INVOICES = [];
const ORIGINAL_INVOICES = INVOICES; // the API keeps only the current version
const VENDORS = {};
const ACTIVE_VENDOR_NAMES = [];
const GL_ACCOUNT_OPTIONS = [];
const COST_CENTER_OPTIONS = [];
const API_INVOICES = {}; // docNumber -> the API's record (keeps rowVersion)
const API_DETAILS = {}; // docNumber -> details in the shape the pages use
let API_REFERENCE = { vendors: [], terms: [], currencies: [], glAccounts: [], costCenters: [] };

const CHANNEL_LABELS = { email: 'Email to AP inbox', supplier_portal: 'Supplier portal', edi: 'EDI', manual: 'Manual entry' };
const METHOD_LABELS = { ach: 'ACH', wire: 'Wire', check: 'Check' };
const MATCHING_LABELS = { three_way: '3-way', two_way: '2-way', non_po: 'Non-PO' };
const HOLD_LABELS = {
  price_variance: 'Price variance', quantity_variance: 'Quantity variance', missing_receipt: 'Missing goods receipt',
  possible_duplicate: 'Possible duplicate', vendor_mismatch: 'Vendor details mismatch', tax_variance: 'Tax variance', other: 'Other',
};

// ---------- converting API records ----------

function localDate(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function codeName(code, name) {
  return code ? `${code} · ${name}` : '';
}

function codeOf(label) {
  return (label || '').split(' · ')[0].trim();
}

function pageStatus(apiStatus) {
  return apiStatus === 'pending_approval' ? 'pending' : apiStatus;
}

function vendorForPages(v) {
  const active = v.status === 'active';
  return {
    code: v.code,
    id: active ? v.code : `${v.code} (not verified)`,
    active,
    category: v.category || '—',
    terms: v.termsLabel,
    matching: active ? MATCHING_LABELS[v.matchingType] : 'None',
    contact: v.billingEmail || '—',
    method: METHOD_LABELS[v.paymentMethod] || v.paymentMethod,
    bank: v.bankLast4 ? `•••• ${v.bankLast4}` : 'Not on file',
    taxId: v.taxIdLast4 ? `••-•••${v.taxIdLast4}` : 'Not on file',
    gl: codeName(v.defaultGlCode, v.defaultGlName) || 'Not coded',
    costCenter: codeName(v.defaultCostCenterCode, v.defaultCostCenterName) || 'Not assigned',
  };
}

function detailsForPages(api) {
  const today = startOfToday();
  const invoiceDate = localDate(api.invoiceDate);
  const discount = api.discountPercent > 0
    ? {
      rate: api.discountPercent / 100,
      deadline: addDays(invoiceDate, api.discountDays),
      amount: Math.round(api.total * api.discountPercent) / 100,
    }
    : null;

  const approvals = api.approvals.map((s) => {
    const state = s.status === 'approved' ? 'approved' : s.status === 'waiting' ? 'waiting' : 'not-started';
    const since = s.waitingSince ? new Date(s.waitingSince) : null;
    return {
      name: s.decidedByName || s.assigneeName || s.roleName,
      role: s.roleName,
      state,
      on: s.decidedAt ? new Date(s.decidedAt) : null,
      since,
      days: since ? Math.max(0, dayDiff(today, startOfDay(since))) : 0,
      comment: s.comment,
    };
  });

  const scheduled = api.payments.find((p) => p.status === 'scheduled');
  const paid = api.payments.find((p) => p.status === 'paid');
  let payment = null;
  if (api.status === 'scheduled' && scheduled) {
    payment = {
      runDate: localDate(scheduled.scheduledDate),
      method: METHOD_LABELS[scheduled.method],
      from: `${scheduled.fromAccount} •••• ${scheduled.fromLast4}`,
      id: scheduled.ref,
    };
  } else if (api.status === 'paid' && paid) {
    const paidOn = new Date(paid.paidAt);
    payment = {
      paidOn,
      method: METHOD_LABELS[paid.method],
      from: `${paid.fromAccount} •••• ${paid.fromLast4}`,
      reference: paid.bankReference,
      amountPaid: paid.amountApplied,
      discountCaptured: paid.discountTaken,
      remittanceTo: paid.remittanceEmail,
      daysToPay: dayDiff(startOfDay(paidOn), invoiceDate),
    };
  }
  const amountPaid = api.payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amountApplied, 0);

  const hold = api.holds.find((h) => !h.releasedAt);
  const doc = api.documents[0];
  const matchResult = (r) => (r === 'not_applicable' ? 'na' : r);

  return {
    vendor: vendorForPages(api.vendor),
    channel: CHANNEL_LABELS[api.intakeChannel] || api.intakeChannel,
    receivedOn: startOfDay(new Date(api.receivedAt)),
    poNumber: api.poNumber,
    terms: api.termsLabel,
    discount,
    currency: api.currency,
    notes: api.notes || '',
    lines: api.lines.map((l) => ({
      description: l.description,
      qty: l.quantity,
      unitPrice: l.unitPrice,
      amount: l.amount,
      gl: codeName(l.glCode, l.glName),
      costCenter: codeName(l.costCenterCode, l.costCenterName),
    })),
    amounts: {
      subtotal: api.subtotal,
      tax: api.tax,
      taxRate: api.subtotal ? api.tax / api.subtotal : 0,
      shipping: api.shipping,
      total: api.total,
      amountPaid,
      balanceDue: ['paid', 'rejected'].includes(api.status) ? 0 : api.total,
    },
    approvals,
    match: api.match
      ? { po: matchResult(api.match.po), receipt: matchResult(api.match.receipt), invoice: matchResult(api.match.invoice) }
      : null,
    payment,
    hold: hold
      ? {
        type: HOLD_LABELS[hold.type] || hold.type,
        detail: hold.detail,
        nextStep: hold.nextStep || '',
        owner: { name: hold.ownerName || 'Unassigned', role: hold.ownerRole || '' },
        since: new Date(hold.placedAt),
      }
      : null,
    rejection: api.rejection
      ? {
        reason: api.rejection.reason,
        detail: api.rejection.detail || '',
        by: { name: api.rejection.byName, role: api.rejection.byRole || '' },
        on: new Date(api.rejection.at),
        vendorNotified: Boolean(api.rejection.vendorNotifiedAt),
      }
      : null,
    attachment: doc
      ? { name: doc.fileName, size: `${Math.round(doc.sizeBytes / 1024)} KB` }
      : { name: 'No document', size: '' },
    activity: api.events.map((e) => ({ on: new Date(e.at), who: e.actorName || 'System', what: e.message })),
  };
}

function invoiceForPages(api) {
  const lastUpdate = [...api.events].reverse().find((e) => e.type === 'updated');
  return {
    id: api.docNumber,
    number: api.supplierInvoiceNumber,
    vendor: api.vendor.name,
    invoiceDate: localDate(api.invoiceDate),
    dueDate: localDate(api.dueDate),
    amount: api.total,
    status: pageStatus(api.status),
    // What the pages read from a saved change (separation of duties, "last saved").
    edit: {
      total: api.total,
      submittedAt: api.submittedAt,
      savedBy: api.submittedByName || lastUpdate?.actorName || '',
      savedAt: api.submittedAt ? null : lastUpdate?.at || null,
      approvals: api.approvals.filter((s) => s.decidedByName).map((s) => ({ by: s.decidedByName })),
    },
  };
}

// Adds or replaces an invoice everywhere the pages look for it.
function keepInvoice(api) {
  API_INVOICES[api.docNumber] = api;
  API_DETAILS[api.docNumber] = detailsForPages(api);
  const inv = invoiceForPages(api);
  const index = INVOICES.findIndex((i) => i.id === inv.id);
  if (index >= 0) INVOICES[index] = inv;
  else INVOICES.push(inv);
  return inv;
}

function getInvoiceDetails(inv) {
  return API_DETAILS[inv.id];
}

// Saved changes live on the server, so there is nothing to reset in the browser.
function hasInvoiceEdits() {
  return false;
}

function clearInvoiceEdits() {}

// ---------- store functions used by the pages ----------

function saveRequest(id, edit) {
  const terms = API_REFERENCE.terms.find((t) => t.label === edit.terms);
  return {
    vendorCode: VENDORS[edit.vendor]?.code || null,
    supplierInvoiceNumber: edit.number,
    invoiceDate: edit.invoiceDate,
    termsCode: terms?.code || null,
    poNumber: edit.poNumber || null,
    currency: edit.currency,
    tax: edit.tax,
    shipping: edit.shipping || 0,
    total: edit.total,
    notes: edit.notes || null,
    lines: edit.lines.map((l) => ({
      description: l.description,
      quantity: l.qty,
      unitPrice: l.unitPrice,
      glCode: codeOf(l.gl) || null,
      costCenterCode: codeOf(l.costCenter) || null,
    })),
    rowVersion: API_INVOICES[id].rowVersion,
  };
}

async function storeSaveDraft(id, edit) {
  try {
    keepInvoice(await apiFetch(`/invoices/${encodeURIComponent(id)}`, { method: 'PUT', body: saveRequest(id, edit) }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function storeSubmit(id, edit) {
  const saved = await storeSaveDraft(id, edit);
  if (!saved.ok) return saved;
  try {
    keepInvoice(await apiFetch(`/invoices/${encodeURIComponent(id)}/submit`, { method: 'POST' }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Saved, but not submitted: ${err.message}` };
  }
}

async function storeApprove(inv, comment) {
  try {
    keepInvoice(await apiFetch(`/invoices/${encodeURIComponent(inv.id)}/approve`, { method: 'POST', body: { comment } }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ---------- loading ----------

window.AP_DATA_READY = (async () => {
  try {
    window.AP_API_USER = await apiFetch('/auth/me');
  } catch (err) {
    if (err.status === 401) {
      window.location.replace('../login/index.html');
      return new Promise(() => {}); // stop here while the browser leaves
    }
    throw err;
  }

  const [reference, invoices] = await Promise.all([apiFetch('/reference'), apiFetch('/invoices')]);
  API_REFERENCE = reference;

  const glNames = Object.fromEntries(reference.glAccounts.map((g) => [g.code, g.name]));
  const ccNames = Object.fromEntries(reference.costCenters.map((c) => [c.code, c.name]));
  reference.vendors.forEach((v) => {
    VENDORS[v.name] = vendorForPages({
      ...v,
      termsLabel: reference.terms.find((t) => t.code === v.termsCode)?.label || v.termsCode,
      defaultGlCode: v.glCode,
      defaultGlName: glNames[v.glCode],
      defaultCostCenterCode: v.costCenterCode,
      defaultCostCenterName: ccNames[v.costCenterCode],
    });
    if (v.status === 'active') ACTIVE_VENDOR_NAMES.push(v.name);
  });
  GL_ACCOUNT_OPTIONS.push(...reference.glAccounts.map((g) => codeName(g.code, g.name)));
  COST_CENTER_OPTIONS.push(...reference.costCenters.map((c) => codeName(c.code, c.name)));

  invoices.forEach(keepInvoice);
})();
