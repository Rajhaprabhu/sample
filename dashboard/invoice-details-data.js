// Sample detail records for the invoice details panel. Everything here is
// demo data, built from the invoice list in data.js so totals always add up.
// Replace with an API call, e.g. fetch(`/api/invoices/${number}`).

const TAX_RATE = 0.08;

const PEOPLE = {
  apClerk:    { name: 'Anita Rao',     role: 'AP specialist' },
  opsManager: { name: 'Priya Nair',    role: 'Operations manager' },
  itManager:  { name: 'Sam Patel',     role: 'IT manager' },
  controller: { name: 'Daniel Ortiz',  role: 'Finance controller' },
  cfo:        { name: 'Meera Iyer',    role: 'Chief financial officer' },
  legalHead:  { name: 'Grace Kim',     role: 'Head of legal' },
  buyer:      { name: 'Tom Becker',    role: 'Procurement buyer' },
};

// Vendor master. Bank and tax numbers are masked, as they should be on screen.
const VENDORS = {
  'Northwind Office Supply': {
    id: 'V-1001', category: 'Office supplies', terms: 'Net 30', matching: '3-way',
    contact: 'billing@northwind-supply.example', method: 'ACH', bank: '•••• 4821', taxId: '••-•••7731',
    gl: '6100 · Office supplies', costCenter: 'CC-210 · Operations', owner: 'opsManager', shipping: 25,
    items: [['Copy paper, A4, 10-ream case', 48.5], ['Printer toner, black', 89], ['Desk organiser set', 32], ['Whiteboard markers, box of 12', 14.75]],
  },
  'Bluepeak Logistics': {
    id: 'V-1002', category: 'Freight and logistics', terms: '2/10 Net 30', matching: '3-way',
    contact: 'ar@bluepeak-logistics.example', method: 'ACH', bank: '•••• 0937', taxId: '••-•••2210',
    gl: '5300 · Freight inbound', costCenter: 'CC-310 · Warehouse', owner: 'opsManager', shipping: 0,
    items: [['Full truckload, Chicago to Dallas', 2850], ['Pallet handling fee', 45], ['Fuel surcharge', 310], ['Liftgate delivery', 95]],
  },
  'Cedar & Pine Facilities': {
    id: 'V-1003', category: 'Facilities maintenance', terms: 'Net 45', matching: '2-way',
    contact: 'invoices@cedarpine.example', method: 'ACH', bank: '•••• 5512', taxId: '••-•••9014',
    gl: '6400 · Repairs and maintenance', costCenter: 'CC-210 · Operations', owner: 'opsManager', shipping: 0,
    items: [['HVAC quarterly service', 1200], ['Janitorial services, monthly', 950], ['Emergency plumbing call-out', 380]],
  },
  'Metro Electric Co.': {
    id: 'V-1004', category: 'Utilities', terms: 'Net 30', matching: 'Non-PO',
    contact: 'billing@metroelectric.example', method: 'ACH', bank: '•••• 7745', taxId: '••-•••3388',
    gl: '6200 · Utilities', costCenter: 'CC-100 · Head office', owner: 'opsManager', shipping: 0,
    items: [['Electricity, head office (kWh)', 0.18], ['Electricity, warehouse (kWh)', 0.16]],
  },
  'Atlas IT Services': {
    id: 'V-1005', category: 'IT services', terms: 'Net 30', matching: '2-way',
    contact: 'accounts@atlas-it.example', method: 'Wire', bank: '•••• 3309', taxId: '••-•••6652',
    gl: '6500 · IT services', costCenter: 'CC-400 · Technology', owner: 'itManager', shipping: 0,
    items: [['Managed IT support, monthly', 6500], ['Cloud hosting, monthly', 3200], ['Security monitoring', 1850], ['Laptop setup and imaging', 120]],
  },
  'Harbor Print Works': {
    id: 'V-1006', category: 'Printing', terms: 'Net 30', matching: '3-way',
    contact: 'accounts@harborprint.example', method: 'Check', bank: '—', taxId: '••-•••1176',
    gl: '6300 · Marketing materials', costCenter: 'CC-500 · Marketing', owner: 'opsManager', shipping: 18,
    items: [['Brochures, tri-fold, 1,000 pcs', 0.42], ['Business cards, 500 pcs', 0.09], ['Trade show banner', 165]],
  },
  'Greenfield Catering': {
    id: 'V-1007', category: 'Catering', terms: 'Net 30', matching: '2-way',
    contact: 'orders@greenfieldcatering.example', method: 'ACH', bank: '•••• 6620', taxId: '••-•••4409',
    gl: '6600 · Staff meals and events', costCenter: 'CC-100 · Head office', owner: 'opsManager', shipping: 0,
    items: [['Lunch buffet, per person', 22], ['Coffee and pastries, per person', 9.5], ['Event staff, per hour', 35]],
  },
  'Summit Legal LLP': {
    id: 'V-1008', category: 'Legal services', terms: 'Net 30', matching: 'Non-PO',
    contact: 'billing@summitlegal.example', method: 'Wire', bank: '•••• 2284', taxId: '••-•••5590',
    gl: '6700 · Professional fees', costCenter: 'CC-100 · Head office', owner: 'legalHead', shipping: 0,
    items: [['Contract review, partner (hours)', 650], ['Contract review, associate (hours)', 375]],
  },
  'Riverbend Software': {
    id: 'V-1009', category: 'Software subscriptions', terms: 'Net 30', matching: '2-way',
    contact: 'billing@riverbend.example', method: 'ACH', bank: '•••• 9051', taxId: '••-•••8823',
    gl: '6510 · Software subscriptions', costCenter: 'CC-400 · Technology', owner: 'itManager', shipping: 0,
    items: [['Analytics platform, annual seats', 395]],
  },
  'Unknown Vendor Ltd': {
    id: 'Not in vendor master', category: 'Unverified', terms: 'Net 30', matching: 'None',
    contact: 'payments@unknown-vendor.example', method: '—', bank: 'Not on file', taxId: 'Not on file',
    gl: 'Not coded', costCenter: 'Not assigned', owner: null, shipping: 0,
    items: [['Consulting services', 3300]],
  },
};

// Status-specific facts that can't be derived from the invoice list.
const INVOICE_OVERRIDES = {
  'INV-10388': {
    hold: {
      type: 'Price variance',
      // Built from the invoice's own line so the figures match what is shown.
      detail: (lines) => {
        const invoiced = lines[0].unitPrice;
        const ordered = Math.round((invoiced / 1.129) * 100) / 100;
        const fmt = (n) => `$${n.toFixed(2)}`;
        return `Invoiced at ${fmt(invoiced)} per seat; the purchase order price is ${fmt(ordered)} per seat. That is 12.9% over, and the tolerance is 2%.`;
      },
      owner: 'buyer',
      nextStep: 'Buyer to confirm the new price with the vendor, or ask for a credit note for the difference.',
      match: { po: 'variance', receipt: 'na', invoice: 'variance' },
    },
  },
  'INV-10379': {
    hold: {
      type: 'Missing goods receipt',
      detail: 'No goods receipt has been recorded against the purchase order, so the delivery cannot be confirmed.',
      owner: 'opsManager',
      nextStep: 'Requester to confirm the items were delivered and record the goods receipt.',
      match: { po: 'ok', receipt: 'missing', invoice: 'ok' },
    },
  },
  'INV-10402': {
    hold: {
      type: 'Possible duplicate',
      detail: 'Same vendor, amount and service date as INV-10398, which was paid on an earlier payment run.',
      owner: 'apClerk',
      nextStep: 'AP to compare both invoices with the vendor and reject this one if it is a duplicate.',
      match: { po: 'ok', receipt: 'na', invoice: 'duplicate' },
    },
  },
  'INV-10400': {
    rejection: {
      reason: 'Vendor not in vendor master',
      detail: 'The vendor is not registered and the bank details could not be verified. Invoices from unregistered vendors are a common fraud risk.',
      by: 'controller',
      vendorNotified: true,
    },
  },
};

// ---------- helpers ----------

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function dayDiff(later, earlier) {
  return Math.round((later - earlier) / 86400000);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Small deterministic number from the invoice number, so a given invoice always
// shows the same sample details.
function seedOf(number) {
  return [...number].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) % 9973, 7);
}

function at(date, hours, minutes) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// Next payment run: payments go out on Tuesdays and Fridays.
function nextPaymentRun(from) {
  let d = addDays(from, 1);
  while (![2, 5].includes(d.getDay())) d = addDays(d, 1);
  return d;
}

function approversFor(amount, vendor) {
  const chain = [];
  if (vendor.owner) chain.push(vendor.owner);
  if (amount >= 5000) chain.push('controller');
  if (amount >= 20000) chain.push('cfo');
  return chain;
}

// Split a subtotal into line items whose quantity × unit price add up exactly
// (all arithmetic in cents to avoid rounding errors).
function buildLines(vendor, subtotal, seed) {
  const count = Math.min(vendor.items.length, 1 + (seed % 3));
  const chosen = vendor.items.slice(0, count);
  const lines = [];
  let remaining = Math.round(subtotal * 100);

  chosen.forEach(([description, unitPrice], i) => {
    const unit = Math.round(unitPrice * 100);
    const isLast = i === chosen.length - 1;

    if (!isLast) {
      const share = remaining * (0.25 + (seed % 3) * 0.1);
      const qty = Math.floor(share / unit);
      if (qty >= 1) {
        lines.push({ description, qty, unitPrice: unit / 100, amount: (qty * unit) / 100 });
        remaining -= qty * unit;
      }
      return;
    }

    // Last line: find a quantity close to the catalogue price that divides the
    // remainder exactly; otherwise bill it as a single unit.
    let qty = Math.max(1, Math.round(remaining / unit));
    while (qty > 1 && remaining % qty !== 0) qty -= 1;
    lines.push({ description, qty, unitPrice: remaining / qty / 100, amount: remaining / 100 });
    remaining = 0;
  });

  return lines.map((line) => ({ ...line, gl: vendor.gl, costCenter: vendor.costCenter }));
}

// ---------- the detail record ----------

function getInvoiceDetails(inv) {
  const vendor = VENDORS[inv.vendor];
  const seed = seedOf(inv.number);
  const override = INVOICE_OVERRIDES[inv.number] || {};
  const today = startOfToday();
  const person = (key) => (key ? PEOPLE[key] : null);

  // Amounts
  const shipping = vendor.shipping;
  const subtotal = Math.round(((inv.amount - shipping) / (1 + TAX_RATE)) * 100) / 100;
  const tax = Math.round((inv.amount - shipping - subtotal) * 100) / 100;
  const lines = buildLines(vendor, subtotal, seed);

  // Key dates
  const receivedOn = addDays(inv.invoiceDate, 1);
  const discountTerms = /^(\d+)\/(\d+)/.exec(vendor.terms);
  const discount = discountTerms
    ? { rate: Number(discountTerms[1]) / 100, deadline: addDays(inv.invoiceDate, Number(discountTerms[2])) }
    : null;
  if (discount) discount.amount = Math.round(inv.amount * discount.rate * 100) / 100;

  const poNumber = vendor.matching === 'Non-PO' || vendor.matching === 'None' ? null : `PO-${4500 + (seed % 400)}`;
  const channel = ['Email to AP inbox', 'Supplier portal', 'EDI'][seed % 3];

  // Approval chain: who signs off, and how far it has got.
  const chainKeys = approversFor(inv.amount, vendor);
  const approvedCount = {
    received: 0,
    pending: Math.max(0, chainKeys.length - 1 - (seed % 2)),
    approved: chainKeys.length,
    scheduled: chainKeys.length,
    paid: chainKeys.length,
    on_hold: 0, // holds stop the invoice before approval
    rejected: 0,
  }[inv.status];
  const submittedOn = addDays(receivedOn, 1);
  const approvals = chainKeys.map((key, i) => {
    const decidedOn = addDays(submittedOn, 1 + i * 2);
    if (i < approvedCount) return { ...PEOPLE[key], state: 'approved', on: at(decidedOn, 10 + i, 15) };
    if (i === approvedCount && inv.status === 'pending') {
      const since = i === 0 ? submittedOn : addDays(submittedOn, 1 + (i - 1) * 2);
      return { ...PEOPLE[key], state: 'waiting', since, days: Math.max(0, dayDiff(today, since)) };
    }
    return { ...PEOPLE[key], state: 'not-started' };
  });
  const lastApproval = approvals.filter((a) => a.state === 'approved').pop();

  // Matching (PO, goods receipt, invoice)
  let match = null;
  if (vendor.matching === '3-way' || vendor.matching === '2-way') {
    const hasReceipt = vendor.matching === '3-way';
    match = override.hold?.match || { po: 'ok', receipt: hasReceipt ? 'ok' : 'na', invoice: 'ok' };
    if (inv.status === 'received') match = { po: 'ok', receipt: hasReceipt ? 'pending' : 'na', invoice: 'pending' };
  }

  // Payment
  let payment = null;
  if (inv.status === 'scheduled') {
    const runDate = nextPaymentRun(today);
    payment = { runDate, method: vendor.method, from: 'Operating account •••• 1180', id: `PAY-${70000 + seed}` };
  }
  if (inv.status === 'paid') {
    const paidOn = discount ? addDays(inv.invoiceDate, 9) : addDays(inv.dueDate, -2);
    const captured = discount && paidOn <= discount.deadline ? discount.amount : 0;
    payment = {
      paidOn,
      method: vendor.method,
      from: 'Operating account •••• 1180',
      reference: vendor.method === 'Check' ? `Check #${20400 + (seed % 90)}` : `${vendor.method === 'Wire' ? 'Wire' : 'ACH trace'} ${String(seed * 7919).padStart(9, '0')}`,
      amountPaid: Math.round((inv.amount - captured) * 100) / 100,
      discountCaptured: captured,
      remittanceTo: vendor.contact,
      daysToPay: dayDiff(paidOn, inv.invoiceDate),
    };
  }

  const amountPaid = payment?.amountPaid || 0;
  const balanceDue = inv.status === 'paid' || inv.status === 'rejected' ? 0 : inv.amount;

  // Activity log, oldest first
  const activity = [
    { on: at(receivedOn, 9, 12), who: 'System', what: `Invoice received (${channel})` },
    { on: at(receivedOn, 9, 13), who: 'System', what: 'Details captured and checked for duplicates' },
  ];
  if (inv.status !== 'received' && inv.status !== 'rejected') {
    activity.push({ on: at(submittedOn, 11, 40), who: PEOPLE.apClerk.name, what: 'Coded and submitted for approval' });
  }
  approvals.filter((a) => a.state === 'approved').forEach((a) => {
    activity.push({ on: a.on, who: a.name, what: 'Approved' });
  });
  if (override.hold) {
    activity.push({ on: at(addDays(submittedOn, 3), 15, 5), who: 'System', what: `Placed on hold: ${override.hold.type.toLowerCase()}` });
  }
  if (override.rejection) {
    activity.push({ on: at(addDays(receivedOn, 2), 14, 20), who: PEOPLE[override.rejection.by].name, what: `Rejected: ${override.rejection.reason.toLowerCase()}` });
    activity.push({ on: at(addDays(receivedOn, 2), 14, 21), who: 'System', what: `Rejection notice emailed to ${vendor.contact}` });
  }
  if (inv.status === 'scheduled') {
    activity.push({ on: at(addDays(lastApproval?.on || submittedOn, 1), 9, 30), who: PEOPLE.apClerk.name, what: `Added to payment run on ${payment.runDate.toDateString().slice(4)}` });
  }
  if (inv.status === 'paid') {
    activity.push({ on: at(payment.paidOn, 7, 0), who: 'System', what: `Paid by ${payment.method}: ${payment.reference}` });
    activity.push({ on: at(payment.paidOn, 7, 5), who: 'System', what: `Remittance advice emailed to ${payment.remittanceTo}` });
  }
  activity.sort((a, b) => a.on - b.on);

  return {
    vendor,
    channel,
    receivedOn,
    poNumber,
    terms: vendor.terms,
    discount,
    currency: 'USD',
    lines,
    amounts: { subtotal, tax, taxRate: TAX_RATE, shipping, total: inv.amount, amountPaid, balanceDue },
    approvals,
    match,
    payment,
    hold: override.hold
      ? {
        ...override.hold,
        detail: typeof override.hold.detail === 'function' ? override.hold.detail(lines) : override.hold.detail,
        owner: person(override.hold.owner),
        since: addDays(submittedOn, 3),
      }
      : null,
    rejection: override.rejection ? { ...override.rejection, by: person(override.rejection.by), on: addDays(receivedOn, 2) } : null,
    attachment: { name: `${inv.number}.pdf`, size: `${180 + (seed % 300)} KB` },
    activity,
  };
}
