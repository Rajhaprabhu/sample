// Signed-in user for the dashboard pages (demo only: a real app checks the
// session on the server). Pages that load this are sent to sign in if needed.

const SESSION_KEY = 'apPortalUser';

// Returns the signed-in user as { name, email }, or null if not signed in.
function getSessionUser() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY));
    return stored && stored.name ? stored : null;
  } catch {
    return null;
  }
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }
}

const user = getSessionUser();
if (!user) {
  window.location.replace('../login/index.html');
}

// Fills in the shared top bar (name, initials, sign out) if the page has one.
function renderUserBar() {
  if (!user) return;
  const box = document.getElementById('user');
  if (!box) return;
  document.getElementById('user-name').textContent = user.name;
  document.getElementById('user-initials').textContent = initials(user.name);
  box.title = `Signed in as ${user.name} (${user.email})`;
  document.getElementById('sign-out').addEventListener('click', () => {
    clearSession();
    window.location.href = '../login/index.html';
  });
}
