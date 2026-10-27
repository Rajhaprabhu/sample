// "Choose a new password" page, opened from the link in the reset email.
// NOTE: `verifyResetToken()` and `resetPassword()` are placeholders. Replace them
// with calls to your backend, which must check the token is valid, unused and
// unexpired, then store the new password securely (hashed).

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const accountEmail = params.get('email');

const form = document.getElementById('reset-form');
const invalidPanel = document.getElementById('invalid-panel');
const password = document.getElementById('password');
const confirm = document.getElementById('confirm');
const confirmError = document.getElementById('confirm-error');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');

const RULES = {
  length: (v) => v.length >= 12,
  upper: (v) => /[A-Z]/.test(v),
  lower: (v) => /[a-z]/.test(v),
  number: (v) => /\d/.test(v),
  symbol: (v) => /[^A-Za-z0-9]/.test(v),
};

// Placeholder: e.g. fetch(`/api/auth/reset-password/verify?token=${token}`)
function verifyResetToken(value) {
  return Promise.resolve({ ok: Boolean(value) && value.startsWith('demo-') });
}

// Placeholder: e.g. fetch('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
function resetPassword({ token: value, password: newPassword }) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: Boolean(value) && newPassword.length > 0 }), 800);
  });
}

function checkRules() {
  let allMet = true;
  document.querySelectorAll('#requirements li').forEach((item) => {
    const met = RULES[item.dataset.rule](password.value);
    item.classList.toggle('met', met);
    item.setAttribute('aria-label', `${item.textContent}: ${met ? 'met' : 'not met'}`);
    if (!met) allMet = false;
  });
  return allMet;
}

function setConfirmError(message) {
  confirmError.textContent = message;
  confirm.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) confirm.setAttribute('aria-describedby', 'confirm-error');
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('loading', isLoading);
  submitBtn.querySelector('.btn-label').textContent = isLoading ? 'Updating…' : 'Update password';
}

document.querySelectorAll('.toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.target);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
});

password.addEventListener('input', () => {
  checkRules();
  password.removeAttribute('aria-invalid');
  if (confirm.value && confirmError.textContent) {
    setConfirmError(confirm.value === password.value ? '' : 'Passwords do not match.');
  }
});

confirm.addEventListener('input', () => {
  if (confirmError.textContent) {
    setConfirmError(confirm.value === password.value ? '' : 'Passwords do not match.');
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  if (!checkRules()) {
    password.setAttribute('aria-invalid', 'true');
    formError.textContent = 'Your new password does not meet all the requirements below.';
    formError.hidden = false;
    password.focus();
    return;
  }
  if (confirm.value !== password.value) {
    setConfirmError('Passwords do not match.');
    confirm.focus();
    return;
  }
  setConfirmError('');

  setLoading(true);
  try {
    const result = await resetPassword({ token, password: password.value });
    if (!result.ok) throw new Error('reset failed');
    const next = new URLSearchParams({ reset: '1' });
    if (accountEmail) next.set('email', accountEmail);
    window.location.href = `index.html?${next}`;
  } catch {
    formError.textContent = "We couldn't update your password. The link may have expired; request a new one.";
    formError.hidden = false;
    setLoading(false);
  }
});

verifyResetToken(token).then((result) => {
  if (!result.ok) {
    invalidPanel.hidden = false;
    return;
  }
  if (accountEmail) document.getElementById('reset-email').textContent = accountEmail;
  form.hidden = false;
  checkRules();
  password.focus();
});
