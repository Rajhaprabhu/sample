// Requirements portal: collect, vote on and track AP system requirements.
// Demo only: requirements are kept in this browser's local storage, starting
// from SAMPLE_REQUIREMENTS (requirements-data.js). A real app would use
// GET/POST /api/requirements and PATCH /api/requirements/:id.

const REQ_KEY = 'apPortalRequirements';
const CLOSED = ['done', 'rejected'];

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const state = { status: null, area: '', priority: '', search: '', sort: 'newest' };

// ---------- Storage ----------

function loadRequirements() {
  try {
    const stored = JSON.parse(localStorage.getItem(REQ_KEY));
    if (Array.isArray(stored)) return stored;
  } catch {
    // Fall through to the sample data.
  }
  return structuredClone(SAMPLE_REQUIREMENTS);
}

// Returns true if saved, false if this browser blocks storage.
function saveRequirements() {
  try {
    localStorage.setItem(REQ_KEY, JSON.stringify(requirements));
    return true;
  } catch {
    return false;
  }
}

function hasChanges() {
  try {
    return localStorage.getItem(REQ_KEY) !== null;
  } catch {
    return false;
  }
}

let requirements = loadRequirements();

// ---------- Helpers ----------

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

const statusLabel = (key) => REQ_STATUSES.find((s) => s.key === key).label;
const priorityLabel = (key) => REQ_PRIORITIES.find((p) => p.key === key).label;
const priorityRank = (key) => REQ_PRIORITIES.findIndex((p) => p.key === key);

function localIso(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return dateFmt.format(new Date(y, m - 1, d));
}

function nextId() {
  const max = requirements.reduce((n, r) => Math.max(n, Number(r.id.replace(/\D/g, '')) || 0), 0);
  return `REQ-${String(max + 1).padStart(3, '0')}`;
}

function pill(kind, key, label) {
  return `<span class="pill ${kind}-${key}">${esc(label)}</span>`;
}

const toast = document.getElementById('toast');
let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
}

function persist(message) {
  const saved = saveRequirements();
  renderAll();
  showToast(saved ? message : `${message} Your browser is blocking storage, so this will be lost when you leave the page.`);
}

// ---------- Overview ----------

function renderStatusBuckets() {
  const container = document.getElementById('status-buckets');
  container.innerHTML = '';
  REQ_STATUSES.forEach((status) => {
    const items = requirements.filter((r) => r.status === status.key);
    const must = items.filter((r) => r.priority === 'must').length;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `bucket req-${status.key}`;
    card.setAttribute('aria-pressed', String(state.status === status.key));
    card.innerHTML = `
      <span class="bucket-label">${esc(status.label)}</span>
      <span class="bucket-count">${items.length}</span>
      <span class="bucket-hint">${must ? `${must} must have` : '&nbsp;'}</span>
    `;
    card.addEventListener('click', () => {
      state.status = state.status === status.key ? null : status.key;
      renderAll();
    });
    container.appendChild(card);
  });
}

function renderAreaCoverage() {
  const container = document.getElementById('area-coverage');
  container.innerHTML = '';
  const open = requirements.filter((r) => !CLOSED.includes(r.status));
  REQ_AREAS.forEach((area) => {
    const items = open.filter((r) => r.area === area);
    const byPriority = REQ_PRIORITIES.map((p) => ({ ...p, n: items.filter((r) => r.priority === p.key).length }));
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = `area-cell${items.length ? '' : ' gap'}`;
    cell.setAttribute('aria-pressed', String(state.area === area));
    const bar = items.length
      ? byPriority.filter((p) => p.n).map((p) => `<span class="prio-${p.key}" style="width:${(p.n / items.length) * 100}%"></span>`).join('')
      : '';
    const sub = items.length
      ? byPriority.filter((p) => p.n).map((p) => `${p.n} ${p.label.split(' (')[0].toLowerCase()}`).join(' · ')
      : 'No open requirements yet';
    cell.innerHTML = `
      <span class="area-name">${esc(area)}</span>
      <span class="area-count">${items.length}</span>
      <span class="area-bar" aria-hidden="true">${bar}</span>
      <span class="area-sub">${esc(sub)}</span>
    `;
    cell.addEventListener('click', () => {
      state.area = state.area === area ? '' : area;
      document.getElementById('filter-area').value = state.area;
      renderAll();
    });
    container.appendChild(cell);
  });
}

// ---------- List ----------

function filtered() {
  const q = state.search.trim().toLowerCase();
  const list = requirements.filter((r) =>
    (!state.status || r.status === state.status)
    && (!state.area || r.area === state.area)
    && (!state.priority || r.priority === state.priority)
    && (!q || [r.id, r.title, r.requestedBy.name, r.department].some((v) => v.toLowerCase().includes(q))));

  const byNewest = (a, b) => b.createdAt.localeCompare(a.createdAt);
  const sorters = {
    newest: byNewest,
    priority: (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.votes.length - a.votes.length || byNewest(a, b),
    votes: (a, b) => b.votes.length - a.votes.length || priorityRank(a.priority) - priorityRank(b.priority) || byNewest(a, b),
  };
  return list.sort(sorters[state.sort]);
}

function renderList() {
  const rows = document.getElementById('req-rows');
  const list = filtered();
  rows.innerHTML = '';
  list.forEach((r) => {
    const tr = document.createElement('tr');
    tr.className = 'clickable';
    tr.innerHTML = `
      <td class="mono">${esc(r.id)}</td>
      <td class="req-title-cell">
        <button type="button" class="row-link">${esc(r.title)}</button>
        <span class="cell-sub">${esc(r.area)}</span>
      </td>
      <td>${esc(r.type)}</td>
      <td>${pill('prio', r.priority, priorityLabel(r.priority).split(' (')[0])}</td>
      <td>${esc(r.requestedBy.name)}<span class="cell-sub">${esc(r.department)} · ${esc(dateFmt.format(new Date(r.createdAt)))}</span></td>
      <td class="num vote-count">${r.votes.length}</td>
      <td>${pill('req', r.status, statusLabel(r.status))}</td>
    `;
    tr.addEventListener('click', () => openDetails(r.id, tr.querySelector('.row-link')));
    rows.appendChild(tr);
  });
  document.getElementById('empty').hidden = list.length > 0;

  const parts = [];
  if (state.status) parts.push(statusLabel(state.status));
  if (state.area) parts.push(state.area);
  if (state.priority) parts.push(priorityLabel(state.priority).split(' (')[0]);
  if (state.search.trim()) parts.push(`“${state.search.trim()}”`);
  document.getElementById('list-filter').textContent = parts.length
    ? `· ${parts.join(' · ')} (${list.length})`
    : `(${list.length})`;
  document.getElementById('clear-filter').hidden = parts.length === 0;
}

function renderAll() {
  renderStatusBuckets();
  renderAreaCoverage();
  renderList();
  document.getElementById('reset-demo').hidden = !hasChanges();
  if (openId) renderDetails(openId);
}

// ---------- Drawer ----------

const drawer = document.getElementById('req-drawer');
const drawerBody = document.getElementById('drawer-body');
const backdrop = document.getElementById('drawer-backdrop');
let openId = null;
let returnFocus = null;
let formDirty = false;

function showDrawer(trigger) {
  returnFocus = trigger || document.activeElement;
  drawer.hidden = false;
  backdrop.hidden = false;
  document.body.classList.add('drawer-open');
  drawerBody.scrollTop = 0;
  drawer.querySelector('#drawer-title')?.focus();
}

// With an unfinished new requirement, asks first (confirm() isn't available everywhere).
function closeDrawer() {
  const discard = drawerBody.querySelector('#discard-confirm');
  if (formDirty && discard) {
    discard.hidden = false;
    discard.querySelector('#discard').focus();
    return;
  }
  formDirty = false;
  openId = null;
  drawer.hidden = true;
  backdrop.hidden = true;
  document.body.classList.remove('drawer-open');
  if (returnFocus && document.contains(returnFocus)) returnFocus.focus();
}

document.getElementById('drawer-close').addEventListener('click', closeDrawer);
backdrop.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (drawer.hidden) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeDrawer();
  } else if (e.key === 'Tab') {
    // Keep keyboard focus inside the open drawer.
    const focusable = [...drawer.querySelectorAll('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// ---------- Requirement details ----------

function openDetails(id, trigger) {
  openId = id;
  renderDetails(id);
  showDrawer(trigger);
}

function renderDetails(id) {
  const r = requirements.find((x) => x.id === id);
  if (!r) return;
  const me = user.email.toLowerCase();
  const voted = r.votes.includes(me);
  const mine = r.requestedBy.email.toLowerCase() === me;

  const statusOptions = REQ_STATUSES
    .map((s) => `<option value="${s.key}"${s.key === r.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('');

  const comments = r.comments.length
    ? `<ol class="timeline">${r.comments.map((c) => `
        <li><strong>${esc(c.by)}</strong> <span class="when">${esc(dateTimeFmt.format(new Date(c.at)))}</span>
        <p class="comment-text">${esc(c.text)}</p></li>`).join('')}</ol>`
    : '<p class="muted small">No comments yet.</p>';

  const history = [...r.history].reverse().map((h) => `
    <li>${esc(h.text)} <span class="when">${esc(h.by)} · ${esc(dateTimeFmt.format(new Date(h.at)))}</span></li>`).join('');

  drawerBody.innerHTML = `
    <div class="d-head">
      <p class="eyebrow">${esc(r.id)} · ${esc(r.area)}</p>
      <h2 id="drawer-title" class="req-heading" tabindex="-1">${esc(r.title)}</h2>
      <div class="d-pills">
        ${pill('req', r.status, statusLabel(r.status))}
        ${pill('prio', r.priority, priorityLabel(r.priority))}
        <span class="pill" style="--c: var(--muted)">${esc(r.type)}</span>
      </div>
    </div>

    <section class="d-section">
      <h3>Business need</h3>
      <p class="story">${esc(r.need)}</p>
    </section>

    <section class="d-section${r.status === 'done' ? ' req-done-list' : ''}">
      <h3>Acceptance criteria</h3>
      <ul class="criteria">${r.criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
    </section>

    <section class="d-section">
      <h3>Details</h3>
      <dl class="kv-grid">
        <div class="kv"><dt>Requested by</dt><dd>${esc(r.requestedBy.name)}</dd></div>
        <div class="kv"><dt>Department</dt><dd>${esc(r.department)}</dd></div>
        <div class="kv"><dt>Submitted</dt><dd>${esc(dateTimeFmt.format(new Date(r.createdAt)))}</dd></div>
        <div class="kv"><dt>Needed by</dt><dd>${r.targetDate ? esc(formatDate(r.targetDate)) : '<span class="muted">No date given</span>'}</dd></div>
      </dl>
    </section>

    <section class="d-section">
      <h3>Votes</h3>
      <div class="vote-row">
        <button type="button" id="vote" class="ghost vote-btn" aria-pressed="${voted}"${mine ? ' disabled title="You raised this requirement"' : ''}>
          ${voted ? '✓ You need this too' : '+1 I need this too'}
        </button>
        <span class="muted small">${r.votes.length} ${r.votes.length === 1 ? 'person needs' : 'people need'} this${mine ? ' · you raised it' : ''}</span>
      </div>
    </section>

    <section class="d-section">
      <h3>Change status</h3>
      <form id="status-form" class="inline-form" novalidate>
        <label for="new-status">Status</label>
        <select id="new-status">${statusOptions}</select>
        <label for="status-note">Reason <span class="muted small" id="status-note-hint">(optional)</span></label>
        <textarea id="status-note" rows="2" aria-describedby="status-error"></textarea>
        <p id="status-error" class="field-error"></p>
        <div class="btn-row"><button type="submit" class="btn-primary">Update status</button></div>
      </form>
    </section>

    <section class="d-section">
      <h3>Comments (${r.comments.length})</h3>
      ${comments}
      <form id="comment-form" class="inline-form" novalidate style="margin-top: 12px">
        <label for="comment-text">Add a comment</label>
        <textarea id="comment-text" rows="3" placeholder="Add detail, an example, or how this affects your team" aria-describedby="comment-error"></textarea>
        <p id="comment-error" class="field-error"></p>
        <div class="btn-row"><button type="submit" class="ghost">Post comment</button></div>
      </form>
    </section>

    <section class="d-section">
      <h3>History</h3>
      <ol class="timeline">${history}</ol>
    </section>
  `;

  drawerBody.querySelector('#vote').addEventListener('click', () => {
    if (voted) r.votes = r.votes.filter((v) => v !== me);
    else r.votes.push(me);
    persist(voted ? 'Vote removed.' : `Vote added to ${r.id}.`);
    drawerBody.querySelector('#vote').focus();
  });

  const statusSelect = drawerBody.querySelector('#new-status');
  const noteHint = drawerBody.querySelector('#status-note-hint');
  const updateHint = () => {
    noteHint.textContent = statusSelect.value === 'rejected' ? '(required when rejecting)' : '(optional)';
  };
  statusSelect.addEventListener('change', updateHint);

  drawerBody.querySelector('#status-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const next = statusSelect.value;
    const note = drawerBody.querySelector('#status-note');
    const error = drawerBody.querySelector('#status-error');
    const text = note.value.trim();
    error.textContent = '';
    note.removeAttribute('aria-invalid');
    if (next === r.status) {
      error.textContent = `It is already ${statusLabel(next)}. Choose a different status.`;
      statusSelect.focus();
      return;
    }
    if (next === 'rejected' && text.length < 10) {
      error.textContent = 'Give a reason for rejecting (at least 10 characters) so the requester knows why.';
      note.setAttribute('aria-invalid', 'true');
      note.focus();
      return;
    }
    const at = localIso();
    r.status = next;
    r.history.push({ by: user.name, at, text: `Status changed to ${statusLabel(next)}` });
    if (text) r.comments.push({ by: user.name, at, text });
    persist(`${r.id} is now ${statusLabel(next)}.`);
    drawerBody.querySelector('#new-status').focus();
  });

  drawerBody.querySelector('#comment-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const box = drawerBody.querySelector('#comment-text');
    const error = drawerBody.querySelector('#comment-error');
    const text = box.value.trim();
    if (text.length < 2) {
      error.textContent = 'Write a comment first.';
      box.setAttribute('aria-invalid', 'true');
      box.focus();
      return;
    }
    r.comments.push({ by: user.name, at: localIso(), text });
    persist('Comment posted.');
    drawerBody.querySelector('#comment-text').focus();
  });
}

// ---------- New requirement ----------

function options(list, placeholder) {
  return `<option value="">${esc(placeholder)}</option>`
    + list.map((o) => (typeof o === 'string'
      ? `<option>${esc(o)}</option>`
      : `<option value="${o.key}">${esc(o.label)}</option>`)).join('');
}

function field(id, label, control, { required = true, hint = '', span = false } = {}) {
  return `
    <div class="field${span ? ' span-2' : ''}">
      <label for="${id}">${esc(label)}${required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
      ${hint ? `<p class="hint" id="${id}-hint">${esc(hint)}</p>` : ''}
      ${control}
      <p class="field-error" id="${id}-error"></p>
    </div>`;
}

function describedBy(id, hint) {
  return `aria-describedby="${hint ? `${id}-hint ` : ''}${id}-error"`;
}

function openNewForm(trigger) {
  openId = null;
  formDirty = false;
  const today = localIso().slice(0, 10);

  drawerBody.innerHTML = `
    <div class="d-head">
      <p class="eyebrow">New requirement</p>
      <h2 id="drawer-title" class="req-heading" tabindex="-1">What should the AP system do?</h2>
      <p class="muted small">Fields marked <span class="req">*</span> are required. Describe the need, not the solution: the project team will work out how to deliver it.</p>
    </div>

    <div id="new-errors" class="error-summary" role="alert" tabindex="-1" hidden>
      <h2>Fix these before submitting</h2>
      <ul id="new-error-list"></ul>
    </div>

    <form id="new-form" class="entry-form" novalidate>
      ${field('f-title', 'Title', `<input id="f-title" maxlength="120" autocomplete="off" ${describedBy('f-title', true)}>`, { hint: 'A short summary, e.g. “Hold invoices that do not match the PO”.', span: true })}
      <div class="form-grid">
        ${field('f-area', 'AP process area', `<select id="f-area" ${describedBy('f-area')}>${options(REQ_AREAS, 'Choose an area')}</select>`)}
        ${field('f-type', 'Type', `<select id="f-type" ${describedBy('f-type')}>${options(REQ_TYPES, 'Choose a type')}</select>`)}
        ${field('f-priority', 'Priority', `<select id="f-priority" ${describedBy('f-priority', true)}>${options(REQ_PRIORITIES, 'Choose a priority')}</select>`, { hint: 'Must have: we cannot go live without it.' })}
        ${field('f-department', 'Your department', `<select id="f-department" ${describedBy('f-department')}>${options(REQ_DEPARTMENTS, 'Choose a department')}</select>`)}
      </div>
      ${field('f-need', 'Business need', `<textarea id="f-need" rows="4" maxlength="1000" ${describedBy('f-need', true)}></textarea><p class="char-count" id="f-need-count">0 / 1000</p>`, { hint: 'As a [role], I want [capability] so that [benefit]. Include volumes or examples if you have them.', span: true })}
      ${field('f-criteria', 'Acceptance criteria', `<textarea id="f-criteria" rows="4" ${describedBy('f-criteria', true)}></textarea>`, { hint: 'How will we know it works? One condition per line.', span: true })}
      ${field('f-target', 'Needed by', `<input id="f-target" type="date" min="${today}" ${describedBy('f-target', true)}>`, { required: false, hint: 'Optional. Leave empty if there is no fixed date.' })}
      <div class="btn-row d-actions">
        <button type="submit" class="btn-primary">Submit requirement</button>
        <button type="button" id="cancel-new" class="ghost">Cancel</button>
      </div>
      <div id="discard-confirm" class="status-panel tone-warn" role="alert" hidden>
        <p><strong>Discard this requirement?</strong> What you have typed will be lost.</p>
        <div class="btn-row d-actions">
          <button type="button" id="discard" class="ghost">Discard</button>
          <button type="button" id="keep-editing" class="btn-primary">Keep editing</button>
        </div>
      </div>
    </form>
  `;

  const form = drawerBody.querySelector('#new-form');
  const need = form.querySelector('#f-need');
  // Clear a field's error as soon as it is changed.
  const edited = (e) => {
    formDirty = true;
    if (e.target.getAttribute('aria-invalid') !== 'true') return;
    e.target.removeAttribute('aria-invalid');
    form.querySelector(`#${e.target.id}-error`).textContent = '';
  };
  form.addEventListener('input', edited);
  form.addEventListener('change', edited);
  need.addEventListener('input', () => {
    form.querySelector('#f-need-count').textContent = `${need.value.length} / 1000`;
  });
  form.querySelector('#cancel-new').addEventListener('click', closeDrawer);
  form.querySelector('#discard').addEventListener('click', () => {
    formDirty = false;
    closeDrawer();
  });
  form.querySelector('#keep-editing').addEventListener('click', () => {
    form.querySelector('#discard-confirm').hidden = true;
    form.querySelector('#f-title').focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submitNew(form, today);
  });

  showDrawer(trigger);
}

function submitNew(form, today) {
  const val = (id) => form.querySelector(`#${id}`).value.trim();
  const values = {
    title: val('f-title'),
    area: val('f-area'),
    type: val('f-type'),
    priority: val('f-priority'),
    department: val('f-department'),
    need: val('f-need'),
    criteria: val('f-criteria').split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim()).filter(Boolean),
    targetDate: val('f-target'),
  };

  const errors = [];
  const check = (id, ok, message) => { if (!ok) errors.push({ id, message }); };
  check('f-title', values.title.length >= 8, 'Enter a title of at least 8 characters.');
  check('f-title', !requirements.some((r) => r.title.toLowerCase() === values.title.toLowerCase()), 'A requirement with this title already exists. Vote for it instead, or make the title more specific.');
  check('f-area', values.area, 'Choose the AP process area.');
  check('f-type', values.type, 'Choose the type of requirement.');
  check('f-priority', values.priority, 'Choose a priority.');
  check('f-department', values.department, 'Choose your department.');
  check('f-need', values.need.length >= 20, 'Describe the business need in at least 20 characters.');
  check('f-criteria', values.criteria.length > 0, 'Add at least one acceptance criterion.');
  check('f-target', !values.targetDate || values.targetDate >= today, 'The needed-by date cannot be in the past.');

  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
  const summary = drawerBody.querySelector('#new-errors');

  if (errors.length) {
    const list = drawerBody.querySelector('#new-error-list');
    list.innerHTML = '';
    errors.forEach(({ id, message }) => {
      const input = form.querySelector(`#${id}`);
      const msg = form.querySelector(`#${id}-error`);
      input.setAttribute('aria-invalid', 'true');
      if (!msg.textContent) msg.textContent = message;
      const li = document.createElement('li');
      li.innerHTML = `<a href="#${id}">${esc(message)}</a>`;
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        input.focus();
      });
      list.appendChild(li);
    });
    summary.hidden = false;
    summary.focus();
    return;
  }

  const at = localIso();
  const req = {
    id: nextId(),
    ...values,
    status: 'new',
    requestedBy: { name: user.name, email: user.email },
    createdAt: at,
    votes: [],
    comments: [],
    history: [{ by: user.name, at, text: 'Submitted' }],
  };
  requirements.push(req);
  formDirty = false;
  // Show the new requirement in the list even if filters would hide it.
  Object.assign(state, { status: null, area: '', priority: '', search: '' });
  syncControls();
  openId = req.id;
  persist(`${req.id} submitted. Thank you!`);
  showDrawer(returnFocus);
}

// ---------- Export ----------

function exportCsv() {
  const cols = [
    ['ID', (r) => r.id],
    ['Title', (r) => r.title],
    ['Area', (r) => r.area],
    ['Type', (r) => r.type],
    ['Priority', (r) => priorityLabel(r.priority)],
    ['Status', (r) => statusLabel(r.status)],
    ['Business need', (r) => r.need],
    ['Acceptance criteria', (r) => r.criteria.map((c) => `• ${c}`).join('\n')],
    ['Requested by', (r) => r.requestedBy.name],
    ['Department', (r) => r.department],
    ['Submitted', (r) => r.createdAt.slice(0, 10)],
    ['Needed by', (r) => r.targetDate],
    ['Votes', (r) => r.votes.length],
    ['Comments', (r) => r.comments.length],
  ];
  const cell = (v) => {
    let s = String(v ?? '');
    // Stop spreadsheet apps treating text as a formula.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const list = filtered();
  const csv = [cols.map(([h]) => h), ...list.map((r) => cols.map(([, get]) => get(r)))]
    .map((row) => row.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ap-requirements-${localIso().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast(`Exported ${list.length} requirement${list.length === 1 ? '' : 's'} (current filters).`);
}

// ---------- Controls ----------

function syncControls() {
  document.getElementById('search').value = state.search;
  document.getElementById('filter-area').value = state.area;
  document.getElementById('filter-priority').value = state.priority;
  document.getElementById('sort').value = state.sort;
}

function init() {
  if (!user) return;
  renderUserBar();

  document.getElementById('filter-area').insertAdjacentHTML('beforeend',
    REQ_AREAS.map((a) => `<option>${esc(a)}</option>`).join(''));
  document.getElementById('filter-priority').insertAdjacentHTML('beforeend',
    REQ_PRIORITIES.map((p) => `<option value="${p.key}">${esc(p.label)}</option>`).join(''));

  document.getElementById('search').addEventListener('input', (e) => { state.search = e.target.value; renderList(); });
  document.getElementById('filter-area').addEventListener('change', (e) => { state.area = e.target.value; renderAll(); });
  document.getElementById('filter-priority').addEventListener('change', (e) => { state.priority = e.target.value; renderList(); });
  document.getElementById('sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
  document.getElementById('clear-filter').addEventListener('click', () => {
    Object.assign(state, { status: null, area: '', priority: '', search: '' });
    syncControls();
    renderAll();
  });
  document.getElementById('new-req').addEventListener('click', (e) => openNewForm(e.currentTarget));
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('reset-demo').addEventListener('click', () => {
    try {
      localStorage.removeItem(REQ_KEY);
    } catch {
      // Storage unavailable; nothing to clear.
    }
    requirements = loadRequirements();
    renderAll();
    showToast('Demo data restored.');
    document.getElementById('new-req').focus();
  });

  // Open a requirement from a link, e.g. index.html#REQ-003.
  const fromHash = decodeURIComponent(window.location.hash.slice(1));
  renderAll();
  if (requirements.some((r) => r.id === fromHash)) openDetails(fromHash, null);
}

init();
