// Client-side behaviour for the AP Portal login page.
// NOTE: authentication here is a placeholder. Replace `authenticate()` with a
// call to your real backend (over HTTPS) before using this in production.

const form = document.getElementById('login-form');
const email = document.getElementById('email');
const password = document.getElementById('password');
const togglePassword = document.getElementById('toggle-password');
const submitBtn = document.getElementById('submit-btn');
const formError = document.getElementById('form-error');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setFieldError(input, message) {
  const errorEl = document.getElementById(`${input.id}-error`);
  errorEl.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (message) input.setAttribute('aria-describedby', errorEl.id);
}

function showAlert(message, type = 'error') {
  formError.textContent = message;
  formError.classList.toggle('success', type === 'success');
  formError.hidden = !message;
}

function validate() {
  let valid = true;

  if (!email.value.trim()) {
    setFieldError(email, 'Enter your work email.');
    valid = false;
  } else if (!EMAIL_PATTERN.test(email.value.trim())) {
    setFieldError(email, 'Enter a valid email address.');
    valid = false;
  } else {
    setFieldError(email, '');
  }

  if (!password.value) {
    setFieldError(password, 'Enter your password.');
    valid = false;
  } else if (password.value.length < 8) {
    setFieldError(password, 'Password must be at least 8 characters.');
    valid = false;
  } else {
    setFieldError(password, '');
  }

  return valid;
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.classList.toggle('loading', isLoading);
  submitBtn.querySelector('.btn-label').textContent = isLoading ? 'Signing in…' : 'Sign in';
}

// Placeholder: simulates a network request. Swap for a real API call, e.g.
//   fetch('/api/auth/login', { method: 'POST', credentials: 'include', ... })
function authenticate({ email, password }) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: email.length > 0 && password.length >= 8 }), 800);
  });
}

togglePassword.addEventListener('click', () => {
  const show = password.type === 'password';
  password.type = show ? 'text' : 'password';
  togglePassword.textContent = show ? 'Hide' : 'Show';
  togglePassword.setAttribute('aria-pressed', String(show));
  togglePassword.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});

[email, password].forEach((input) => {
  input.addEventListener('input', () => {
    if (input.getAttribute('aria-invalid') === 'true') validate();
    showAlert('');
  });
});

document.getElementById('forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  showAlert('Password reset is not set up yet. Contact your finance system administrator.');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showAlert('');

  if (!validate()) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  setLoading(true);
  try {
    const result = await authenticate({ email: email.value.trim(), password: password.value });
    if (result.ok) {
      showAlert('Signed in successfully (demo). Redirecting to the dashboard…', 'success');
      // window.location.href = '/dashboard';
    } else {
      showAlert('Incorrect email or password.');
    }
  } catch {
    showAlert('Something went wrong. Please try again.');
  } finally {
    setLoading(false);
  }
});
