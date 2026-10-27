// Data entry page: an AP processor checks a received invoice against the
// original document, corrects the captured fields, codes each line and then
// saves a draft or submits the invoice for approval.

const TERMS = ['Due on receipt', 'Net 15', 'Net 30', 'Net 45', 'Net 60', '2/10 Net 30'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD'];
const REGISTERED_VENDORS = Object.keys(VENDORS).filter((name) => VENDORS[name].id.startsWith('V-'));
const GL_ACCOUNTS = [...new Set(REGISTERED_VENDORS.map((v) => VENDORS[v].gl))].sort();
const COST_CENTERS = [...new Set(REGISTERED_VENDORS.map((v) => VENDORS[v].costCenter))].sort();

const params = new URLSearchParams(window.location.search);
const invoiceId = params.get('id');
const invoice = INVOICES.find((i) => i.id === invoiceId);
const original = ORIGINAL_INVOICES.find((i) => i.id === invoiceId);

const form = document.getElementById('entry-form');
const $ = (id) => document.getElementById(id);
const dateLong = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

let lines = [];
let savedSnapshot = '';
let pendingLeaveHref = null;

// ---------- helpers ----------

function esc(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function toInputDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromInputDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function termDays(terms) {
  if (terms === 'Due on receipt') return 0;
  const match = /Net (\d+)/.exec(terms);
  return match ? Number(match[1]) : null;
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: $('currency').value || 'USD' }).format(amount);
}

function fillSelect(select, options, { placeholder, preferred } = {}) {
  select.innerHTML = (placeholder ? `<option value="">${esc(placeholder)}</option>` : '')
    + options.map((o) => `<option value="${esc(o)}">${esc(o)}${o === preferred ? ' (vendor default)' : ''}</option>`).join('');
}

// ---------- line items ----------

function lineAmount(line) {
  const qty = numberOrNull(line.qty);
  const price = numberOrNull(line.unitPrice);
  return qty === null || price === null ? 0 : Math.round(qty * price * 100) / 100;
}

function renderLines() {
  const vendor = VENDORS[$('vendor').value];
  const rows = lines.map((line, i) => `
    <tr>
      <td><label class="visually-hidden" for="line-${i}-description">Line ${i + 1} description</label>
        <input id="line-${i}-description" data-line="${i}" data-key="description" type="text" value="${esc(line.description)}"></td>
      <td><label class="visually-hidden" for="line-${i}-gl">Line ${i + 1} GL account</label>
        <select id="line-${i}-gl" data-line="${i}" data-key="gl"></select></td>
      <td><label class="visually-hidden" for="line-${i}-costCenter">Line ${i + 1} cost center</label>
        <select id="line-${i}-costCenter" data-line="${i}" data-key="costCenter"></select></td>
      <td class="num"><label class="visually-hidden" for="line-${i}-qty">Line ${i + 1} quantity</label>
        <input id="line-${i}-qty" data-line="${i}" data-key="qty" type="number" inputmode="decimal" min="0" step="any" value="${esc(line.qty)}"></td>
      <td class="num"><label class="visually-hidden" for="line-${i}-unitPrice">Line ${i + 1} unit price</label>
        <input id="line-${i}-unitPrice" data-line="${i}" data-key="unitPrice" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(line.unitPrice)}"></td>
      <td class="num line-amount" id="line-${i}-amount">${formatMoney(lineAmount(line))}</td>
      <td><button type="button" class="remove-line" data-remove="${i}" aria-label="Remove line ${i + 1}" ${lines.length === 1 ? 'disabled' : ''}>✕</button></td>
    </tr>`).join('');
  $('line-rows').innerHTML = rows;

  lines.forEach((line, i) => {
    fillSelect($(`line-${i}-gl`), GL_ACCOUNTS, { placeholder: 'Choose…', preferred: vendor?.gl });
    fillSelect($(`line-${i}-costCenter`), COST_CENTERS, { placeholder: 'Choose…', preferred: vendor?.costCenter });
    $(`line-${i}-gl`).value = line.gl || '';
    $(`line-${i}-costCenter`).value = line.costCenter || '';
  });
}

// ---------- calculated values ----------

function updateCalculated() {
  const invoiceDate = fromInputDate($('invoiceDate').value);
  const days = termDays($('terms').value);
  $('dueDate').textContent = invoiceDate && days !== null ? dateLong.format(addDays(invoiceDate, days)) : '—';

  const subtotal = lines.reduce((sum, l) => sum + lineAmount(l), 0);
  const calc = subtotal + (numberOrNull($('tax').value) || 0) + (numberOrNull($('shipping').value) || 0);
  lines.forEach((l, i) => { $(`line-${i}-amount`).textContent = formatMoney(lineAmount(l)); });
  $('subtotal').textContent = formatMoney(subtotal);
  $('calcTotal').textContent = formatMoney(calc);

  const stated = numberOrNull($('total').value);
  const check = $('balance-check');
  if (stated === null) {
    check.className = 'balance-check';
    check.textContent = 'Enter the invoice total to check it against the lines.';
  } else if (Math.abs(cents(stated) - cents(calc)) === 0) {
    check.className = 'balance-check ok';
    check.textContent = '✓ Lines, tax and shipping add up to the invoice total.';
  } else {
    const diff = Math.round((stated - calc) * 100) / 100;
    check.className = 'balance-check bad';
    check.textContent = `Out of balance by ${formatMoney(Math.abs(diff))}: the lines are ${diff > 0 ? 'lower' : 'higher'} than the invoice total.`;
  }

  const notes = $('notes').value.length;
  $('notes-count').textContent = `${notes} of 500 characters`;
}

function updateVendorInfo() {
  const vendor = VENDORS[$('vendor').value];
  $('vendor-id').textContent = vendor?.id || '—';
  $('vendor-method').textContent = vendor?.method || '—';
  $('vendor-bank').textContent = vendor?.bank || '—';

  const needsPo = vendor && ['2-way', '3-way'].includes(vendor.matching);
  $('po-req').hidden = !needsPo;
  $('po-hint').textContent = !vendor ? ''
    : vendor.matching === '3-way' ? 'Required. Matched against the purchase order and the goods receipt.'
      : vendor.matching === '2-way' ? 'Required. Matched against the purchase order.'
        : 'Not needed for this vendor.';
}

// ---------- reading and checking the form ----------

function collect() {
  return {
    vendor: $('vendor').value,
    number: $('number').value.trim(),
    invoiceDate: $('invoiceDate').value,
    terms: $('terms').value,
    poNumber: $('poNumber').value.trim().toUpperCase(),
    currency: $('currency').value,
    lines: lines.map((l) => ({
      description: l.description.trim(),
      gl: l.gl,
      costCenter: l.costCenter,
      qty: numberOrNull(l.qty),
      unitPrice: numberOrNull(l.unitPrice),
      amount: lineAmount(l),
    })),
    tax: numberOrNull($('tax').value),
    shipping: numberOrNull($('shipping').value) || 0,
    total: numberOrNull($('total').value),
    notes: $('notes').value.trim(),
  };
}

// `full` = every rule needed to submit; a draft only needs sensible values.
function validate(data, full) {
  const errors = [];
  const add = (id, message) => errors.push({ id, message });
  const today = startOfToday();
  const vendor = VENDORS[data.vendor];

  if (full && !data.vendor) add('vendor', 'Choose the vendor.');

  if (!data.number) {
    add('number', 'Enter the supplier invoice number.');
  } else if (!/^[A-Za-z0-9][A-Za-z0-9\-/.]{1,29}$/.test(data.number)) {
    add('number', 'Use letters, numbers, hyphens, slashes or dots only (2 to 30 characters).');
  } else {
    const duplicate = INVOICES.find((i) => i.id !== invoiceId && i.vendor === data.vendor && i.number.toLowerCase() === data.number.toLowerCase());
    if (duplicate) add('number', `${duplicate.number} from this vendor already exists (${statusName(duplicate.status)}). This may be a duplicate.`);
  }

  const invDate = fromInputDate(data.invoiceDate);
  if (!data.invoiceDate) {
    if (full) add('invoiceDate', 'Enter the invoice date.');
  } else if (!invDate) {
    add('invoiceDate', 'Enter a real date.');
  } else if (invDate > today) {
    add('invoiceDate', 'The invoice date cannot be in the future.');
  } else if (dayDiff(today, invDate) > 365) {
    add('invoiceDate', 'The invoice date is more than a year ago. Check it against the document.');
  }

  if (full && !data.terms) add('terms', 'Choose the payment terms.');
  if (full && !data.currency) add('currency', 'Choose the currency.');

  const needsPo = vendor && ['2-way', '3-way'].includes(vendor.matching);
  if (data.poNumber && !/^PO-\d{4,}$/.test(data.poNumber)) {
    add('poNumber', 'Enter the purchase order as PO- followed by its number, for example PO-4521.');
  } else if (full && needsPo && !data.poNumber) {
    add('poNumber', 'Enter the purchase order number. This vendor\'s invoices are matched to a purchase order.');
  }

  data.lines.forEach((l, i) => {
    const n = i + 1;
    if (full && !l.description) add(`line-${i}-description`, `Line ${n}: enter a description.`);
    if (full && !l.gl) add(`line-${i}-gl`, `Line ${n}: choose a GL account.`);
    if (full && !l.costCenter) add(`line-${i}-costCenter`, `Line ${n}: choose a cost center.`);
    if (l.qty === null ? full : l.qty <= 0) add(`line-${i}-qty`, `Line ${n}: enter a quantity greater than 0.`);
    if (l.unitPrice === null ? full : l.unitPrice <= 0) add(`line-${i}-unitPrice`, `Line ${n}: enter a unit price greater than 0.`);
  });

  if (data.tax === null ? full : data.tax < 0) add('tax', 'Enter the tax amount (0 if there is none).');
  if (data.shipping < 0) add('shipping', 'Shipping cannot be negative.');

  if (data.total === null) {
    if (full) add('total', 'Enter the total shown on the invoice.');
  } else if (data.total <= 0) {
    add('total', 'The invoice total must be more than 0.');
  } else if (full) {
    const calc = data.lines.reduce((s, l) => s + cents(l.amount), 0) + cents(data.tax || 0) + cents(data.shipping);
    if (calc !== cents(data.total)) add('total', 'The lines, tax and shipping do not add up to the invoice total. Check each line against the document.');
  }

  return errors;
}

function statusName(key) {
  return STATUSES.find((s) => s.key === key)?.label || key;
}

function showErrors(errors) {
  document.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  document.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });

  errors.forEach(({ id, message }) => {
    const input = $(id);
    if (input) input.setAttribute('aria-invalid', 'true');
    const slot = $(`${id}-error`) || (id.startsWith('line-') ? $('lines-error') : null);
    if (slot) slot.textContent = slot.textContent ? `${slot.textContent} ${message}` : message;
  });

  const summary = $('error-summary');
  summary.hidden = errors.length === 0;
  $('error-list').innerHTML = errors.map((e) => `<li><a href="#${e.id}" data-focus="${e.id}">${esc(e.message)}</a></li>`).join('');
  if (errors.length) summary.focus();
}

// ---------- saving ----------

function buildEdit(data, status) {
  const invDate = fromInputDate(data.invoiceDate) || invoice.invoiceDate;
  const days = termDays(data.terms) ?? 30;
  const now = new Date();
  return {
    ...data,
    invoiceDate: toInputDate(invDate),
    dueDate: toInputDate(addDays(invDate, days)),
    total: data.total ?? invoice.amount,
    tax: data.tax ?? 0,
    lines: data.lines.map((l) => ({ ...l, qty: l.qty ?? 0, unitPrice: l.unitPrice ?? 0 })),
    receivedOn: toInputDate(details.receivedOn),
    status,
    savedAt: now.toISOString(),
    savedBy: user.name,
    submittedAt: status === 'pending' ? now.toISOString() : null,
  };
}

function snapshot() {
  return JSON.stringify(collect());
}

function isDirty() {
  return snapshot() !== savedSnapshot;
}

function setStatus(message, tone) {
  const el = $('save-status');
  el.textContent = message;
  el.className = `save-status ${tone || ''}`;
}

function saveDraft() {
  const data = collect();
  const errors = validate(data, false);
  showErrors(errors);
  if (errors.length) {
    setStatus('Draft not saved. Fix the highlighted fields.', 'bad');
    return;
  }
  const stored = saveInvoiceEdit(invoiceId, buildEdit(data, 'received'));
  if (!stored) {
    setStatus('This browser blocked saving. Your changes are only on this page.', 'bad');
    return;
  }
  savedSnapshot = snapshot();
  setStatus(`Draft saved at ${timeFmt.format(new Date())}. The invoice stays in Received.`, 'ok');
}

function submitForApproval(e) {
  e.preventDefault();
  const data = collect();
  const errors = validate(data, true);
  showErrors(errors);
  if (errors.length) {
    setStatus(`${errors.length} ${errors.length === 1 ? 'problem' : 'problems'} to fix before submitting.`, 'bad');
    return;
  }
  const stored = saveInvoiceEdit(invoiceId, buildEdit(data, 'pending'));
  if (!stored) {
    setStatus('This browser blocked saving, so the invoice could not be submitted.', 'bad');
    return;
  }
  savedSnapshot = snapshot();
  window.location.href = `index.html?submitted=${encodeURIComponent(invoiceId)}#${encodeURIComponent(invoiceId)}`;
}

// ---------- original document ----------

function renderDocument(inv, d) {
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const days = termDays(d.terms) ?? 30;
  $('doc-caption').textContent = `As received on ${dateLong.format(d.receivedOn)} through ${d.channel}. Check each field against this copy.`;
  $('document').innerHTML = `
    <div class="paper-head">
      <div><strong>${esc(inv.vendor)}</strong><br><span class="muted">${esc(d.vendor.contact)}</span><br><span class="muted">Tax ID ${esc(d.vendor.taxId)}</span></div>
      <div class="paper-title">INVOICE</div>
    </div>
    <dl class="paper-meta">
      <div><dt>Invoice no.</dt><dd>${esc(inv.number)}</dd></div>
      <div><dt>Date</dt><dd>${dateLong.format(inv.invoiceDate)}</dd></div>
      <div><dt>PO</dt><dd>${esc(d.poNumber || '—')}</dd></div>
      <div><dt>Terms</dt><dd>${esc(d.terms)}</dd></div>
      <div><dt>Due</dt><dd>${dateLong.format(addDays(inv.invoiceDate, days))}</dd></div>
    </dl>
    <table class="paper-lines">
      <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${d.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="num">${l.qty.toLocaleString('en-US')}</td><td class="num">${money.format(l.unitPrice)}</td><td class="num">${money.format(l.amount)}</td></tr>`).join('')}</tbody>
    </table>
    <dl class="paper-totals">
      <div><dt>Subtotal</dt><dd>${money.format(d.amounts.subtotal)}</dd></div>
      <div><dt>Tax (8%)</dt><dd>${money.format(d.amounts.tax)}</dd></div>
      ${d.amounts.shipping ? `<div><dt>Shipping</dt><dd>${money.format(d.amounts.shipping)}</dd></div>` : ''}
      <div class="grand"><dt>Total due</dt><dd>${money.format(inv.amount)}</dd></div>
    </dl>
    <p class="paper-foot">Pay by ${esc(d.vendor.method)} to account ${esc(d.vendor.bank)}.</p>
  `;
}

// ---------- start ----------

let details = null;

function start() {
  renderUserBar();

  if (!invoice) {
    $('not-found').hidden = false;
    $('title-number').textContent = invoiceId ? `· ${invoiceId}` : '';
    return;
  }

  details = getInvoiceDetails(invoice);
  const originalDetails = getInvoiceDetails(original);
  const edit = invoice.edit;
  const editable = invoice.status === 'received';

  document.title = `Data entry ${invoice.id} · AP Portal`;
  $('title-number').textContent = `· ${invoice.id}`;
  $('crumb-current').textContent = invoice.id;
  $('status-pill').className = `pill status-${invoice.status}`;
  $('status-pill').textContent = statusName(invoice.status);
  $('capture-note').textContent = editable
    ? 'Captured automatically. Check every field against the original invoice, code each line, then submit it for approval.'
    : '';

  // Choices
  fillSelect($('vendor'), REGISTERED_VENDORS, { placeholder: 'Choose a vendor…' });
  fillSelect($('terms'), TERMS, { placeholder: 'Choose…' });
  fillSelect($('currency'), CURRENCIES);

  // Values: the saved draft if there is one, otherwise what was captured.
  $('vendor').value = invoice.vendor;
  $('number').value = invoice.number;
  $('invoiceDate').value = toInputDate(invoice.invoiceDate);
  $('terms').value = details.terms;
  $('poNumber').value = details.poNumber || '';
  $('currency').value = details.currency;
  $('receivedOn').textContent = `${dateLong.format(details.receivedOn)} · ${details.channel}`;
  $('tax').value = details.amounts.tax.toFixed(2);
  $('shipping').value = details.amounts.shipping ? details.amounts.shipping.toFixed(2) : '';
  $('total').value = (edit ? edit.total : invoice.amount).toFixed(2);
  $('notes').value = details.notes;
  lines = details.lines.map((l) => ({
    description: l.description,
    // Captured lines aren't coded yet: the processor chooses GL and cost center.
    gl: edit ? l.gl : '',
    costCenter: edit ? l.costCenter : '',
    qty: String(l.qty),
    unitPrice: String(Math.round(l.unitPrice * 100) / 100),
  }));

  updateVendorInfo();
  renderLines();
  renderDocument(original, originalDetails);
  updateCalculated();
  savedSnapshot = snapshot();
  $('entry').hidden = false;
  // On narrow screens the document starts collapsed so the form comes first.
  if (window.matchMedia('(max-width: 1000px)').matches) $('doc-toggle').open = false;

  if (edit?.savedAt && editable) {
    setStatus(`Draft last saved ${dateLong.format(new Date(edit.savedAt))} at ${timeFmt.format(new Date(edit.savedAt))} by ${edit.savedBy}.`, '');
  }

  if (!editable) {
    $('form-fields').disabled = true;
    $('action-buttons').querySelectorAll('button').forEach((b) => { b.hidden = true; });
    $('action-buttons').querySelector('a').textContent = 'Back to dashboard';
    $('add-line').hidden = true;
    const locked = $('locked');
    locked.hidden = false;
    locked.innerHTML = `<h3>Read only</h3><p>This invoice is <strong>${esc(statusName(invoice.status))}</strong>, so it can no longer be edited here. Only invoices in <strong>Received</strong> can be changed. <a href="index.html#${encodeURIComponent(invoice.id)}">View its details on the dashboard</a>.</p>`;
  }
  wireEvents();
}

function wireEvents() {
  // Line item edits update the totals without re-drawing (so focus stays put).
  $('line-rows').addEventListener('input', (e) => {
    const { line, key } = e.target.dataset;
    if (line === undefined) return;
    lines[Number(line)][key] = e.target.value;
    updateCalculated();
  });
  $('line-rows').addEventListener('change', (e) => {
    const { line, key } = e.target.dataset;
    if (line !== undefined) lines[Number(line)][key] = e.target.value;
  });
  $('line-rows').addEventListener('click', (e) => {
    const button = e.target.closest('[data-remove]');
    if (!button) return;
    const n = Number(button.dataset.remove);
    lines.splice(n, 1);
    renderLines();
    updateCalculated();
    $('add-line').focus();
    setStatus(`Line ${n + 1} removed.`, '');
  });
  $('add-line').addEventListener('click', () => {
    const vendor = VENDORS[$('vendor').value];
    lines.push({ description: '', gl: vendor?.gl || '', costCenter: vendor?.costCenter || '', qty: '1', unitPrice: '' });
    renderLines();
    updateCalculated();
    $(`line-${lines.length - 1}-description`).focus();
  });

  ['invoiceDate', 'terms', 'tax', 'shipping', 'total', 'notes', 'currency'].forEach((id) => {
    $(id).addEventListener('input', updateCalculated);
  });
  $('vendor').addEventListener('change', () => {
    updateVendorInfo();
    renderLines();
    updateCalculated();
  });

  $('save-draft').addEventListener('click', saveDraft);
  form.addEventListener('submit', submitForApproval);

  // Links in the error summary move focus to the field.
  $('error-list').addEventListener('click', (e) => {
    const link = e.target.closest('[data-focus]');
    if (!link) return;
    e.preventDefault();
    const field = $(link.dataset.focus);
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  });

  // Ask before leaving with unsaved changes (confirm() isn't available everywhere).
  document.querySelectorAll('[data-leave]').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.dataset.filter ? `index.html?status=${link.dataset.filter}` : link.getAttribute('href');
      if (!isDirty() || invoice.status !== 'received') {
        if (link.dataset.filter) {
          e.preventDefault();
          window.location.href = href;
        }
        return;
      }
      e.preventDefault();
      pendingLeaveHref = href;
      $('leave-confirm').hidden = false;
      $('discard').focus();
    });
  });
  $('discard').addEventListener('click', () => {
    savedSnapshot = snapshot();
    window.location.href = pendingLeaveHref || 'index.html';
  });
  $('keep-editing').addEventListener('click', () => {
    $('leave-confirm').hidden = true;
    pendingLeaveHref = null;
  });
  window.addEventListener('beforeunload', (e) => {
    if (invoice.status === 'received' && isDirty()) e.preventDefault();
  });
}

if (user) start();
