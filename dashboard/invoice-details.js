// Invoice details panel: opens when an invoice in the list is clicked and shows
// what matters for that invoice's status first, then the full record.

const STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'pending', label: 'Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'paid', label: 'Paid' },
];

// Where each status sits on the progress bar, and whether it has stopped there.
const STEP_POSITION = {
  received: { index: 0 },
  pending: { index: 1 },
  approved: { index: 2 },
  scheduled: { index: 3 },
  paid: { index: 4, done: true },
  on_hold: { index: 1, stopped: 'On hold' },
  rejected: { index: 0, stopped: 'Rejected' },
};

// Actions a user would take next, by status. In the demo they only show a message.
const ACTIONS = {
  received: [['Open data entry', 'primary', (inv) => `data-entry.html?id=${encodeURIComponent(inv.id)}`], ['Reject']],
  pending: [['Approve', 'primary'], ['Reject'], ['Send reminder']],
  approved: [['Schedule payment', 'primary'], ['Put on hold']],
  scheduled: [['Change payment date'], ['Cancel payment']],
  on_hold: [['Release hold', 'primary'], ['Contact vendor'], ['Reject']],
  paid: [['Resend remittance advice']],
  rejected: [['Reopen invoice']],
};

const drawer = document.getElementById('invoice-drawer');
const backdrop = document.getElementById('drawer-backdrop');
const drawerBody = document.getElementById('drawer-body');
const toast = document.getElementById('toast');
const pageRegions = ['.topbar', 'main', '.app-footer'].map((s) => document.querySelector(s));
const dateTimeFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
let returnFocusTo = null;
let currentInvoiceId = null;
let toastTimer = null;

function esc(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function fmtDate(d) {
  return dateFmt.format(d);
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function field(label, value) {
  return `<div class="kv"><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
}

function personLine(p) {
  return `${esc(p.name)} <span class="muted">· ${esc(p.role)}</span>`;
}

// ---------- sections ----------

function renderHeader(inv) {
  const days = daysPastDue(inv);
  const open = !CLOSED_STATUSES.includes(inv.status);
  let due = `Due ${fmtDate(inv.dueDate)}`;
  if (open && days > 0) due = `<span class="overdue">${days} days overdue</span> · was due ${fmtDate(inv.dueDate)}`;
  else if (open) due = `Due ${fmtDate(inv.dueDate)} · in ${plural(-days, 'day')}`;

  return `
    <div class="d-head">
      <p class="eyebrow">Invoice</p>
      <h2 id="drawer-title">${esc(inv.number)}</h2>
      <p class="d-vendor">${esc(inv.vendor)}</p>
      <div class="d-amount-row">
        <span class="d-amount">${money.format(inv.amount)}</span>
        <span class="pill status-${inv.status}">${esc(statusLabel(inv.status))}</span>
      </div>
      <p class="d-due">${due}</p>
    </div>
  `;
}

function renderProgress(inv) {
  const pos = STEP_POSITION[inv.status];
  const items = STEPS.map((step, i) => {
    let state = 'todo';
    if (i < pos.index || (i === pos.index && pos.done)) state = 'done';
    else if (i === pos.index) state = pos.stopped ? 'stopped' : 'current';
    const label = state === 'stopped' ? pos.stopped : step.label;
    const sr = { done: 'completed', current: 'current step', stopped: 'stopped here', todo: 'not started' }[state];
    return `<li class="step ${state}"><span class="step-dot" aria-hidden="true"></span><span class="step-label">${esc(label)}</span><span class="visually-hidden"> (${sr})</span></li>`;
  }).join('');
  return `<ol class="progress" aria-label="Invoice progress">${items}</ol>`;
}

// The box at the top that answers "what's happening with this invoice?"
function renderStatusPanel(inv, d) {
  const days = daysPastDue(inv);
  const today = startOfToday();

  switch (inv.status) {
    case 'received': {
      const checks = [
        ['Duplicate check', 'No duplicates found', 'ok'],
        ['Vendor', `Verified (${esc(d.vendor.id)})`, 'ok'],
        ['Purchase order', d.poNumber ? `${esc(d.poNumber)} found` : 'Not required for this vendor', 'ok'],
        ['Coding', 'GL account and cost center to confirm', 'pending'],
      ];
      return panel('info', 'Waiting for AP review', `
        <p>Received ${fmtDate(d.receivedOn)} through ${esc(d.channel)}. Next, AP checks the coding and sends it for approval.</p>
        <ul class="checks">${checks.map(([k, v, s]) => `<li class="${s}"><strong>${k}:</strong> ${v}</li>`).join('')}</ul>
        ${discountNote(d, today)}
      `);
    }
    case 'pending': {
      const waiting = d.approvals.find((a) => a.state === 'waiting');
      const tone = waiting && waiting.days > 3 ? 'warn' : 'info';
      return panel(tone, `Waiting for ${waiting.name}`, `
        <p>${esc(waiting.role)} has had this invoice for ${plural(waiting.days, 'day')}${waiting.days > 3 ? ', longer than the 3-day approval target' : ''}.
        ${days > 0 ? `<strong>The invoice is already ${plural(days, 'day')} past due.</strong>` : `It is due in ${plural(-days, 'day')}.`}</p>
        ${discountNote(d, today)}
      `);
    }
    case 'approved': {
      const run = nextPaymentRun(today);
      return panel(days > 0 ? 'warn' : 'ok', 'Approved and ready to pay', `
        <p>Fully approved${d.approvals.length ? ` by ${esc(d.approvals[d.approvals.length - 1].name)} on ${fmtDate(d.approvals[d.approvals.length - 1].on)}` : ''}.
        The next payment run is <strong>${fmtDate(run)}</strong>.</p>
        ${d.approvals.length && d.approvals[d.approvals.length - 1].comment ? `<blockquote class="ap-comment">${esc(d.approvals[d.approvals.length - 1].comment)}</blockquote>` : ''}
        ${days > 0 ? `<p><strong>${plural(days, 'day')} past due.</strong> Schedule it on the next run to avoid late fees and keep the vendor relationship healthy.</p>` : ''}
        ${discountNote(d, today)}
      `);
    }
    case 'scheduled': {
      const p = d.payment;
      return panel('info', `Payment on ${fmtDate(p.runDate)}`, `
        <dl class="kv-grid">
          ${field('Payment ID', `<span class="mono">${esc(p.id)}</span>`)}
          ${field('Method', esc(p.method))}
          ${field('Amount', money.format(inv.amount))}
          ${field('Pay to', `${esc(d.vendor.bank)} <span class="muted">(${esc(inv.vendor)})</span>`)}
          ${field('Pay from', esc(p.from))}
          ${field('Arrives', p.method === 'Wire' ? 'Same day' : p.method === 'Check' ? 'In 5–7 days by post' : 'In 1–2 business days')}
        </dl>
        ${days > 0 ? `<p class="note warn-text">Scheduled after the due date (${plural(days, 'day')} late).</p>` : ''}
      `);
    }
    case 'on_hold': {
      const h = d.hold;
      return panel('danger', `On hold: ${h.type}`, `
        <p>${esc(h.detail)}</p>
        <dl class="kv-grid">
          ${field('On hold since', `${fmtDate(h.since)} <span class="muted">(${plural(dayDiff(today, h.since), 'day')})</span>`)}
          ${field('Owner', personLine(h.owner))}
        </dl>
        <p><strong>Next step:</strong> ${esc(h.nextStep)}</p>
        ${days > 0 ? `<p class="note warn-text">The invoice is ${plural(days, 'day')} past due while on hold.</p>` : ''}
      `);
    }
    case 'paid': {
      const p = d.payment;
      return panel('ok', `Paid on ${fmtDate(p.paidOn)}`, `
        <dl class="kv-grid">
          ${field('Amount paid', money.format(p.amountPaid))}
          ${field('Method', esc(p.method))}
          ${field('Payment reference', `<span class="mono">${esc(p.reference)}</span>`)}
          ${field('Paid from', esc(p.from))}
          ${field('Days to pay', `${p.daysToPay} days from invoice date`)}
          ${field('Remittance advice', `Emailed to ${esc(p.remittanceTo)}`)}
        </dl>
        ${p.discountCaptured ? `<p class="note ok-text">Early payment discount captured: ${money.format(p.discountCaptured)}.</p>` : ''}
      `);
    }
    case 'rejected': {
      const r = d.rejection;
      return panel('danger', `Rejected: ${r.reason}`, `
        <p>${esc(r.detail)}</p>
        <dl class="kv-grid">
          ${field('Rejected by', personLine(r.by))}
          ${field('Rejected on', fmtDate(r.on))}
          ${field('Vendor told', r.vendorNotified ? `Yes, emailed ${esc(d.vendor.contact)}` : 'No')}
        </dl>
      `);
    }
    default:
      return '';
  }
}

function panel(tone, title, body) {
  return `<section class="status-panel tone-${tone}" aria-label="Current status"><h3>${esc(title)}</h3>${body}</section>`;
}

function discountNote(d, today) {
  if (!d.discount) return '';
  const left = dayDiff(d.discount.deadline, today);
  if (left < 0) return `<p class="note muted">Early payment discount (${d.terms}) expired on ${fmtDate(d.discount.deadline)}.</p>`;
  return `<p class="note ok-text"><strong>Save ${money.format(d.discount.amount)}</strong> by paying by ${fmtDate(d.discount.deadline)} (${d.terms}, ${plural(left, 'day')} left).</p>`;
}

function renderActions(inv) {
  const buttons = ACTIONS[inv.status].map(([label, kind, href]) => {
    const cls = kind === 'primary' ? 'btn-primary' : 'ghost';
    return href
      ? `<a class="${cls} button-link" href="${href(inv)}">${esc(label)}</a>`
      : `<button type="button" class="${cls}" data-action="${esc(label)}">${esc(label)}</button>`;
  }).join('');
  return `<div class="d-actions">${buttons}</div>`;
}

function renderSummary(inv, d) {
  return `
    <section class="d-section" aria-labelledby="sec-summary">
      <h3 id="sec-summary">Invoice details</h3>
      <dl class="kv-grid">
        ${field('Invoice date', fmtDate(inv.invoiceDate))}
        ${field('Received', `${fmtDate(d.receivedOn)} <span class="muted">· ${esc(d.channel)}</span>`)}
        ${field('Due date', fmtDate(inv.dueDate))}
        ${field('Payment terms', esc(d.terms))}
        ${field('Purchase order', d.poNumber ? `<span class="mono">${esc(d.poNumber)}</span>` : '<span class="muted">None (non-PO invoice)</span>')}
        ${field('Currency', esc(d.currency))}
      </dl>
    </section>
  `;
}

function renderAmounts(d) {
  const a = d.amounts;
  const rows = [
    ['Subtotal', money.format(a.subtotal)],
    [`Sales tax (${(a.taxRate * 100).toFixed(0)}%)`, money.format(a.tax)],
  ];
  if (a.shipping) rows.push(['Shipping', money.format(a.shipping)]);
  rows.push(['Invoice total', money.format(a.total), 'total']);
  if (a.amountPaid) {
    if (a.total - a.amountPaid > 0.004) rows.push(['Early payment discount', `−${money.format(a.total - a.amountPaid)}`]);
    rows.push(['Paid', `−${money.format(a.amountPaid)}`]);
  }
  rows.push(['Balance due', money.format(a.balanceDue), 'balance']);

  return `
    <section class="d-section" aria-labelledby="sec-amounts">
      <h3 id="sec-amounts">Amounts</h3>
      <dl class="amounts">
        ${rows.map(([k, v, cls]) => `<div class="${cls || ''}"><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}
      </dl>
    </section>
  `;
}

function renderLines(d) {
  const rows = d.lines.map((l) => `
    <tr>
      <td><span class="line-desc">${esc(l.description)}</span><span class="line-code">${esc(l.gl)} · ${esc(l.costCenter)}</span></td>
      <td class="num">${l.qty.toLocaleString('en-US')}</td>
      <td class="num">${money.format(l.unitPrice)}</td>
      <td class="num">${money.format(l.amount)}</td>
    </tr>`).join('');
  return `
    <section class="d-section" aria-labelledby="sec-lines">
      <h3 id="sec-lines">Line items <span class="muted">(${d.lines.length})</span></h3>
      <div class="table-wrap">
        <table class="lines">
          <thead><tr><th scope="col">Description and coding</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Unit price</th><th scope="col" class="num">Amount</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderMatching(d) {
  if (!d.match) {
    return `
      <section class="d-section" aria-labelledby="sec-match">
        <h3 id="sec-match">Matching</h3>
        <p class="muted">${d.vendor.matching === 'None' ? 'Not matched: the vendor is not registered.' : 'Non-PO invoice. Checked through the approval chain instead of a purchase order.'}</p>
      </section>`;
  }
  const label = { ok: 'Matches', variance: 'Variance', missing: 'Missing', duplicate: 'Possible duplicate', pending: 'To check', na: 'Not needed' };
  const docs = [
    ['Purchase order', d.poNumber || 'Not entered', d.match.po],
    ['Goods receipt', d.vendor.matching === '3-way' && d.poNumber ? `GR-${d.poNumber.slice(3)}` : 'Services', d.match.receipt],
    ['Invoice', 'This invoice', d.match.invoice],
  ];
  return `
    <section class="d-section" aria-labelledby="sec-match">
      <h3 id="sec-match">${esc(d.vendor.matching)} match</h3>
      <ul class="match">
        ${docs.map(([name, ref, s]) => `<li class="m-${s}"><span class="m-name">${esc(name)}</span><span class="m-ref mono">${esc(ref)}</span><span class="m-state">${label[s]}</span></li>`).join('')}
      </ul>
    </section>
  `;
}

function renderApprovals(d) {
  if (!d.approvals.length) return '';
  const label = { approved: 'Approved', waiting: 'Waiting', 'not-started': 'Not started' };
  const items = d.approvals.map((a) => {
    const when = a.state === 'approved' ? dateTimeFmt.format(a.on) : a.state === 'waiting' ? `since ${fmtDate(a.since)}` : '';
    const comment = a.comment ? `<blockquote class="ap-comment">${esc(a.comment)}</blockquote>` : '';
    return `<li class="ap-${a.state}"><span class="ap-dot" aria-hidden="true"></span><div><div>${personLine(a)}</div><div class="small muted">${label[a.state]}${when ? ` · ${when}` : ''}</div>${comment}</div></li>`;
  }).join('');
  return `
    <section class="d-section" aria-labelledby="sec-approvals">
      <h3 id="sec-approvals">Approvals</h3>
      <ol class="approvals">${items}</ol>
      <p class="small muted">Over $5,000 needs the finance controller; over $20,000 also needs the CFO.</p>
    </section>
  `;
}

function renderVendor(inv, d) {
  const v = d.vendor;
  return `
    <section class="d-section" aria-labelledby="sec-vendor">
      <h3 id="sec-vendor">Vendor</h3>
      <dl class="kv-grid">
        ${field('Name', esc(inv.vendor))}
        ${field('Vendor ID', esc(v.id))}
        ${field('Category', esc(v.category))}
        ${field('Billing contact', esc(v.contact))}
        ${field('Pays by', esc(v.method))}
        ${field('Bank account', esc(v.bank))}
        ${field('Tax ID', esc(v.taxId))}
        ${field('Usual terms', esc(v.terms))}
      </dl>
    </section>
  `;
}

function renderAttachment(d) {
  return `
    <section class="d-section" aria-labelledby="sec-files">
      <h3 id="sec-files">Documents</h3>
      <p class="file"><span class="file-icon" aria-hidden="true">PDF</span><span>${esc(d.attachment.name)} <span class="muted">· ${esc(d.attachment.size)} · original invoice</span></span></p>
    </section>
  `;
}

function renderActivity(d) {
  const items = [...d.activity].reverse().map((e) => `
    <li><time>${dateTimeFmt.format(e.on)}</time><span>${esc(e.what)}</span><span class="small muted">${esc(e.who)}</span></li>`).join('');
  return `
    <section class="d-section" aria-labelledby="sec-activity">
      <h3 id="sec-activity">Activity <span class="muted">(audit trail)</span></h3>
      <ol class="activity">${items}</ol>
    </section>
  `;
}

// ---------- open / close ----------

function openInvoice(number, trigger, { refresh = false } = {}) {
  const inv = INVOICES.find((i) => i.id === number);
  if (!inv) return;
  const d = getInvoiceDetails(inv);

  drawerBody.innerHTML = `
    ${renderHeader(inv)}
    ${renderProgress(inv)}
    ${renderStatusPanel(inv, d)}
    ${renderActions(inv)}
    <div id="approve-slot"></div>
    ${renderSummary(inv, d)}
    ${renderAmounts(d)}
    ${renderLines(d)}
    ${renderMatching(d)}
    ${renderApprovals(d)}
    ${renderVendor(inv, d)}
    ${renderAttachment(d)}
    ${renderActivity(d)}
  `;
  drawerBody.scrollTop = 0;
  currentInvoiceId = number;
  if (refresh) {
    // Keep where focus returns to, and move focus to the updated status.
    const panel = drawerBody.querySelector('.status-panel');
    panel.tabIndex = -1;
    panel.focus();
    return;
  }

  returnFocusTo = trigger || document.activeElement;
  drawer.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add('drawer-open');
  pageRegions.forEach((el) => el && (el.inert = true));
  document.getElementById('drawer-close').focus();

  if (location.hash.slice(1) !== number) history.replaceState(null, '', `#${number}`);
  document.querySelectorAll('#invoice-rows tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.number === number));
}

function closeInvoice() {
  if (drawer.hidden) return;
  drawer.hidden = true;
  backdrop.hidden = true;
  document.body.classList.remove('drawer-open');
  pageRegions.forEach((el) => el && (el.inert = false));
  history.replaceState(null, '', location.pathname + location.search);
  document.querySelectorAll('#invoice-rows tr.selected').forEach((tr) => tr.classList.remove('selected'));
  if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

document.getElementById('drawer-close').addEventListener('click', closeInvoice);
backdrop.addEventListener('click', closeInvoice);

drawer.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'Approve') showApproveForm();
  else showToast(`"${button.dataset.action}" is not connected yet. This is a demo.`);
});

// ---------- approving ----------

const MIN_COMMENT = 10;

// "Finance controller" -> "finance controller", but keep "IT manager" as is.
function roleInSentence(role) {
  return /^[A-Z]{2}/.test(role) ? role : role.charAt(0).toLowerCase() + role.slice(1);
}

// Returns a reason the signed-in user may not approve this invoice, or null.
// Separation of duties: whoever entered an invoice, or approved an earlier
// step, can't approve it (again).
function approvalBlockedReason(inv) {
  const edit = inv.edit;
  if (edit?.submittedAt && edit.savedBy === user.name) {
    return 'You entered and submitted this invoice, so someone else must approve it. This keeps duties separate. To try approving, sign out and sign in with a different email.';
  }
  if ((edit?.approvals || []).some((a) => a.by === user.name)) {
    return 'You have already approved an earlier step, so the next step needs a different approver. To try it, sign out and sign in with a different email.';
  }
  return null;
}

function showApproveForm() {
  const inv = INVOICES.find((i) => i.id === currentInvoiceId);
  const d = getInvoiceDetails(inv);
  const stepIndex = d.approvals.findIndex((a) => a.state === 'waiting');
  const step = d.approvals[stepIndex];
  const next = d.approvals[stepIndex + 1];
  const slot = document.getElementById('approve-slot');
  const blocked = approvalBlockedReason(inv);

  if (blocked) {
    slot.innerHTML = `<div class="approve-form tone-warn" tabindex="-1" id="approve-box"><h3>You can't approve this invoice</h3><p>${esc(blocked)}</p>
      <button type="button" class="ghost" id="approve-cancel">Close</button></div>`;
    document.getElementById('approve-cancel').addEventListener('click', hideApproveForm);
    document.getElementById('approve-box').focus();
    return;
  }

  slot.innerHTML = `
    <form class="approve-form" id="approve-form" novalidate>
      <h3>Approve ${esc(inv.number)}</h3>
      <p>You're approving <strong>${money.format(inv.amount)}</strong> to ${esc(inv.vendor)} as the <strong>${esc(roleInSentence(step.role))}</strong> step.
      ${next ? `After this, it goes to ${esc(next.name)} (${esc(roleInSentence(next.role))}) for the next approval.` : 'This is the last approval: the invoice will move to <strong>Approved</strong>, ready to schedule for payment.'}</p>
      <label for="approve-comment">Approval comments <span class="req">(required)</span></label>
      <textarea id="approve-comment" rows="3" maxlength="500" aria-describedby="approve-hint approve-error" required></textarea>
      <p class="small muted" id="approve-hint">Say what you checked, for example "Goods received in full; price matches the purchase order." At least ${MIN_COMMENT} characters.</p>
      <p class="field-error" id="approve-error" role="alert"></p>
      <div class="approve-buttons">
        <button type="submit" class="btn-primary">Confirm approval</button>
        <button type="button" class="ghost" id="approve-cancel">Cancel</button>
      </div>
    </form>`;

  const form = document.getElementById('approve-form');
  const comment = document.getElementById('approve-comment');
  document.getElementById('approve-cancel').addEventListener('click', hideApproveForm);
  comment.addEventListener('input', () => {
    if (comment.getAttribute('aria-invalid') === 'true' && comment.value.trim().length >= MIN_COMMENT) {
      comment.removeAttribute('aria-invalid');
      document.getElementById('approve-error').textContent = '';
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    confirmApproval(inv, comment.value.trim(), Boolean(next), next);
  });
  form.scrollIntoView({ block: 'nearest' });
  comment.focus();
}

function hideApproveForm() {
  document.getElementById('approve-slot').innerHTML = '';
  drawer.querySelector('[data-action="Approve"]')?.focus();
}

function confirmApproval(inv, text, hasNext, next) {
  const error = document.getElementById('approve-error');
  const comment = document.getElementById('approve-comment');
  if (text.length < MIN_COMMENT) {
    error.textContent = text
      ? `Add a little more detail: at least ${MIN_COMMENT} characters (you have ${text.length}).`
      : 'Enter your approval comments. They are kept in the audit trail.';
    comment.setAttribute('aria-invalid', 'true');
    comment.focus();
    return;
  }

  const existing = loadInvoiceEdits()[inv.id] || {};
  const edit = {
    ...existing,
    status: hasNext ? 'pending' : 'approved',
    approvals: [...(existing.approvals || []), { by: user.name, comment: text, at: new Date().toISOString() }],
  };
  if (!saveInvoiceEdit(inv.id, edit)) {
    error.textContent = 'This browser blocked saving, so the approval was not recorded.';
    return;
  }

  // Update the in-memory list, the dashboard and this panel.
  const index = INVOICES.findIndex((i) => i.id === inv.id);
  INVOICES[index] = applyInvoiceEdit(ORIGINAL_INVOICES[index], edit);
  render();
  document.getElementById('reset-demo').hidden = false;
  openInvoice(inv.id, null, { refresh: true });
  document.querySelectorAll('#invoice-rows tr').forEach((tr) => tr.classList.toggle('selected', tr.dataset.number === inv.id));
  showToast(hasNext
    ? `Approved. ${inv.number} now waits for ${next.name}.`
    : `${inv.number} approved and moved to Approved.`);
}

document.addEventListener('keydown', (e) => {
  if (drawer.hidden) return;
  if (e.key === 'Escape') {
    closeInvoice();
    return;
  }
  // Keep keyboard focus inside the panel while it is open.
  if (e.key === 'Tab') {
    const focusable = [...drawer.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// Rows open the panel on click; the invoice number is a real button for keyboard users.
document.getElementById('invoice-rows').addEventListener('click', (e) => {
  if (e.target.closest('a')) return; // data entry link: let it navigate
  const tr = e.target.closest('tr[data-number]');
  if (tr) openInvoice(tr.dataset.number, tr.querySelector('.row-link'));
});

// Open the invoice named in the address (e.g. dashboard/index.html#INV-10421).
function openFromHash() {
  const number = decodeURIComponent(location.hash.slice(1));
  if (INVOICES.some((i) => i.id === number)) openInvoice(number);
}
window.addEventListener('hashchange', openFromHash);
if (typeof user !== 'undefined' && user) {
  openFromHash();
  // Back from data entry after submitting.
  const submitted = new URLSearchParams(window.location.search).get('submitted');
  const done = INVOICES.find((i) => i.id === submitted);
  if (done) showToast(`${done.number} was submitted for approval.`);
}
