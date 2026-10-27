// "Forgot password" page: asks for the user's email and requests a reset link.
// NOTE: `requestPasswordReset()` is a placeholder. Replace it with a call to your
// backend, which should email a single-use, time-limited link to the user.

const form = document.getElementById('forgot-form');
const email = document.getElementById('email');
const emailError = document.getElementById('email-error');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');
const sentPanel = document.getElementById('sent-panel');
const resendBtn = document.getElementById('resend-btn');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_COOLDOWN_SECONDS = 30;

// Placeholder: simulates the API call, e.g.
//   fetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
// The backend should respond the same way whether or not the account exists,
// so the page never reveals which emails are registered.
function requestPasswordReset(address) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true, demoToken: `demo-${Date.now().toString(36)}` }), 800);
  });
}

function setLoading(button, isLoading, label) {
  button.disabled = isLoading;
  button.classList.toggle('loading', isLoading);
  button.querySelector('.btn-label').textContent = label;
}

function validate() {
  const value = email.value.trim();
  let message = '';
  if (!value) message = 'Enter your work email.';
  else if (!EMAIL_PATTERN.test(value)) message = 'Enter a valid email address.';

  emailError.textContent = message;
  email.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) email.setAttribute('aria-describedby', 'email-error');
  return !message;
}

function showSent(address, token) {
  document.getElementById('sent-email').textContent = address;
  const params = new URLSearchParams({ token, email: address });
  document.getElementById('demo-reset-link').href = `reset-password.html?${params}`;
  form.hidden = true;
  sentPanel.hidden = false;
}

function startResendCooldown() {
  let remaining = RESEND_COOLDOWN_SECONDS;
  resendBtn.disabled = true;
  resendBtn.textContent = `Resend email (${remaining}s)`;
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend email';
    } else {
      resendBtn.textContent = `Resend email (${remaining}s)`;
    }
  }, 1000);
}

// Pre-fill the email when arriving from the sign-in page.
const prefill = new URLSearchParams(window.location.search).get('email');
if (prefill) email.value = prefill;

email.addEventListener('input', () => {
  if (email.getAttribute('aria-invalid') === 'true') validate();
  formError.hidden = true;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;
  if (!validate()) {
    email.focus();
    return;
  }

  setLoading(submitBtn, true, 'Sending…');
  try {
    const address = email.value.trim();
    const result = await requestPasswordReset(address);
    showSent(address, result.demoToken);
    startResendCooldown();
  } catch {
    formError.textContent = "We couldn't send the reset link. Check your connection and try again.";
    formError.hidden = false;
  } finally {
    setLoading(submitBtn, false, 'Send reset link');
  }
});

resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  resendBtn.textContent = 'Sending…';
  const address = email.value.trim();
  const result = await requestPasswordReset(address);
  showSent(address, result.demoToken);
  startResendCooldown();
});

document.getElementById('demo-reset-link').addEventListener('click', (e) => {
  if (e.currentTarget.getAttribute('href') === '#') e.preventDefault();
});
