// Renders the invoice status dashboard from INVOICES / STATUSES (data.js).

const AGING_BUCKETS = [
  { key: 'current', label: 'Not yet due', test: (d) => d <= 0 },
  { key: '1-30',    label: '1–30 days',   test: (d) => d >= 1 && d <= 30 },
  { key: '31-60',   label: '31–60 days',  test: (d) => d >= 31 && d <= 60 },
  { key: '61-90',   label: '61–90 days',  test: (d) => d >= 61 && d <= 90 },
  { key: '90+',     label: '90+ days',    test: (d) => d > 90 },
];
const CLOSED_STATUSES = ['paid', 'rejected'];

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeShort = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const state = { status: null, aging: null, search: '' };

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysPastDue(invoice) {
  return Math.round((today() - invoice.dueDate) / 86400000);
}

function agingKey(invoice) {
  const days = daysPastDue(invoice);
  return AGING_BUCKETS.find((b) => b.test(days)).key;
}

function summarize(invoices) {
  return {
    count: invoices.length,
    total: invoices.reduce((sum, inv) => sum + inv.amount, 0),
  };
}

function statusLabel(key) {
  return STATUSES.find((s) => s.key === key).label;
}

function renderStatusBuckets() {
  const container = document.getElementById('status-buckets');
  container.innerHTML = '';

  STATUSES.forEach((status) => {
    const items = INVOICES.filter((inv) => inv.status === status.key);
    const { count, total } = summarize(items);
    const overdue = CLOSED_STATUSES.includes(status.key)
      ? 0
      : items.filter((inv) => daysPastDue(inv) > 0).length;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = `bucket status-${status.key}`;
    card.setAttribute('aria-pressed', String(state.status === status.key));
    card.innerHTML = `
      <span class="bucket-label">${status.label}</span>
      <span class="bucket-count">${count}</span>
      <span class="bucket-amount">${money.format(total)}</span>
      <span class="bucket-hint">${overdue ? `<strong>${overdue} overdue</strong>` : status.hint}</span>
    `;
    card.addEventListener('click', () => {
      state.status = state.status === status.key ? null : status.key;
      state.aging = null;
      render();
    });
    container.appendChild(card);
  });
}

function renderAging() {
  const open = INVOICES.filter((inv) => !CLOSED_STATUSES.includes(inv.status));
  const grandTotal = summarize(open).total;
  const bar = document.getElementById('aging-bar');
  const grid = document.getElementById('aging-buckets');
  bar.innerHTML = '';
  grid.innerHTML = '';

  const descriptions = [];
  AGING_BUCKETS.forEach((bucket) => {
    const items = open.filter((inv) => agingKey(inv) === bucket.key);
    const { count, total } = summarize(items);
    const pct = grandTotal ? (total / grandTotal) * 100 : 0;
    descriptions.push(`${bucket.label}: ${money.format(total)}`);

    if (pct > 0) {
      const seg = document.createElement('span');
      seg.className = `seg aging-${bucket.key.replace('+', 'plus')}`;
      seg.style.width = `${pct}%`;
      seg.title = `${bucket.label}: ${money.format(total)} (${pct.toFixed(0)}%)`;
      bar.appendChild(seg);
    }

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'aging-cell';
    cell.setAttribute('aria-pressed', String(state.aging === bucket.key));
    cell.innerHTML = `
      <span class="dot aging-${bucket.key.replace('+', 'plus')}"></span>
      <span class="aging-label">${bucket.label}</span>
      <span class="aging-amount">${money.format(total)}</span>
      <span class="muted small">${count} invoice${count === 1 ? '' : 's'} · ${pct.toFixed(0)}%</span>
    `;
    cell.addEventListener('click', () => {
      state.aging = state.aging === bucket.key ? null : bucket.key;
      state.status = null;
      render();
    });
    grid.appendChild(cell);
  });

  bar.setAttribute('aria-label', `Unpaid invoices by age. ${descriptions.join('; ')}`);
}

function renderTable() {
  const tbody = document.getElementById('invoice-rows');
  const query = state.search.trim().toLowerCase();

  const rows = INVOICES
    .filter((inv) => !state.status || inv.status === state.status)
    .filter((inv) => !state.aging || (!CLOSED_STATUSES.includes(inv.status) && agingKey(inv) === state.aging))
    .filter((inv) => !query || inv.vendor.toLowerCase().includes(query) || inv.number.toLowerCase().includes(query))
    .sort((a, b) => a.dueDate - b.dueDate);

  // The Approved queue gets an extra column: when, and by whom, the final approval was given.
  const showApproved = state.status === 'approved';
  document.getElementById('col-approved').hidden = !showApproved;

  tbody.innerHTML = '';
  rows.forEach((inv) => {
    let approvedCell = '';
    if (showApproved) {
      const last = getInvoiceDetails(inv).approvals.filter((a) => a.state === 'approved').pop();
      approvedCell = last
        ? `<td><time datetime="${last.on.toISOString()}">${dateTimeShort.format(last.on)}</time><span class="cell-sub">by ${last.name}</span></td>`
        : '<td class="muted">—</td>';
    }
    const days = daysPastDue(inv);
    const overdue = days > 0 && !CLOSED_STATUSES.includes(inv.status);
    const tr = document.createElement('tr');
    tr.dataset.number = inv.id;
    tr.className = 'clickable';
    tr.innerHTML = `
      <td class="mono">${inv.status === 'received'
        ? `<a class="row-link" href="data-entry.html?id=${encodeURIComponent(inv.id)}" aria-label="Open data entry for invoice ${inv.number} from ${inv.vendor}">${inv.number}</a>`
        : `<button type="button" class="row-link" aria-label="View invoice ${inv.number} from ${inv.vendor}">${inv.number}</button>`}</td>
      <td>${inv.vendor}</td>
      <td>${dateFmt.format(inv.invoiceDate)}</td>
      <td>${dateFmt.format(inv.dueDate)}${overdue ? ` <span class="overdue">${days}d overdue</span>` : ''}</td>
      ${approvedCell}
      <td class="num">${money.format(inv.amount)}</td>
      <td><span class="pill status-${inv.status}">${statusLabel(inv.status)}</span></td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('empty').hidden = rows.length > 0;

  const filterLabel = state.status
    ? `· ${statusLabel(state.status)}`
    : state.aging
      ? `· ${AGING_BUCKETS.find((b) => b.key === state.aging).label} past due`
      : '';
  document.getElementById('list-filter').textContent = `${filterLabel} (${rows.length})`;
  document.getElementById('clear-filter').hidden = !(state.status || state.aging || query);
}

function render() {
  renderStatusBuckets();
  renderAging();
  renderTable();
}

if (user) {
  renderUserBar();
  document.getElementById('as-of').textContent = `As of ${dateFmt.format(today())}`;

  // Arriving from the breadcrumb on the data entry page, e.g. ?status=received
  const startStatus = new URLSearchParams(window.location.search).get('status');
  if (STATUSES.some((s) => s.key === startStatus)) state.status = startStatus;

  // Demo only: changes from data entry are kept in this browser; offer a reset.
  const resetButton = document.getElementById('reset-demo');
  resetButton.hidden = !hasInvoiceEdits();
  resetButton.addEventListener('click', () => {
    clearInvoiceEdits();
    window.location.href = window.location.pathname;
  });

  document.getElementById('search').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderTable();
  });

  document.getElementById('clear-filter').addEventListener('click', () => {
    state.status = null;
    state.aging = null;
    state.search = '';
    document.getElementById('search').value = '';
    render();
  });


  render();
}
