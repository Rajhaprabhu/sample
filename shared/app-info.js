// Application details and the footer shown on every page.
// Update `version`, `build` and `releaseDate` for each release (see CHANGELOG.md),
// and replace the placeholder support contact before going live.

const APP_INFO = {
  name: 'AP Portal',
  version: '1.1.0',
  build: '20261027.2',
  releaseDate: '2026-10-27',
  environment: 'Demo', // 'Production' hides the environment badge
  licensee: 'Rajha',
  copyrightYear: 2026,
  developedBy: 'Claude Code',
  supportEmail: 'support@example.com', // placeholder: replace with the real support address
  supportHours: 'Monday to Friday, 9:00–18:00 IST', // placeholder: set your real hours and time zone
};

// Footer links, relative to the site root.
const FOOTER_LINKS = [
  { label: 'Help & support', path: 'info/support.html' },
  { label: 'Privacy policy', path: 'info/privacy.html' },
  { label: 'Cookies & storage', path: 'info/privacy.html#storage' },
  { label: 'Terms of use', path: 'info/terms.html' },
  { label: 'Accessibility', path: 'info/accessibility.html' },
  { label: 'Report a security issue', path: 'info/security.html' },
];

// Site root, worked out from where this script is loaded (…/shared/app-info.js),
// so links work from any folder.
const SITE_ROOT = new URL('../', document.currentScript.src);

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function renderAppFooter() {
  const footer = document.querySelector('.app-footer');
  if (!footer) return;

  const thisYear = new Date().getFullYear();
  const years = thisYear > APP_INFO.copyrightYear
    ? `${APP_INFO.copyrightYear}–${thisYear}`
    : String(APP_INFO.copyrightYear);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isProduction = APP_INFO.environment.toLowerCase() === 'production';
  const currentPage = window.location.href.split('#')[0];

  const links = FOOTER_LINKS.map((link) => {
    const href = new URL(link.path, SITE_ROOT).href;
    const current = href === currentPage ? ' aria-current="page"' : '';
    return `<li><a href="${href}"${current}>${escapeHtml(link.label)}</a></li>`;
  }).join('');

  footer.innerHTML = `
    <div class="footer-inner">
      <nav class="footer-nav" aria-label="Support and legal">
        <ul>${links}</ul>
      </nav>

      <p class="footer-support">
        Need help? Email
        <a href="mailto:${APP_INFO.supportEmail}">${escapeHtml(APP_INFO.supportEmail)}</a>
        <span class="sep" aria-hidden="true">·</span>
        ${escapeHtml(APP_INFO.supportHours)}
      </p>

      <p class="footer-legal">
        © ${years} ${escapeHtml(APP_INFO.licensee)}. All rights reserved.
        ${escapeHtml(APP_INFO.name)} is licensed to ${escapeHtml(APP_INFO.licensee)}.
        <span class="sep" aria-hidden="true">·</span>
        Developed by ${escapeHtml(APP_INFO.developedBy)}
      </p>

      <p class="footer-meta">
        <span>Version ${escapeHtml(APP_INFO.version)}</span>
        <span>Build ${escapeHtml(APP_INFO.build)}</span>
        <span>Released <time datetime="${APP_INFO.releaseDate}">${escapeHtml(APP_INFO.releaseDate)}</time></span>
        <span>Times shown in ${escapeHtml(timeZone)}</span>
        ${isProduction ? '' : `<span class="env-badge" title="Not the live system. Data shown is for demonstration only.">${escapeHtml(APP_INFO.environment)} environment</span>`}
        <a href="#top" class="back-to-top" hidden>Back to top ↑</a>
      </p>
    </div>
  `;

  // Only offer "Back to top" when the page is long enough to scroll.
  const backToTop = footer.querySelector('.back-to-top');
  const updateBackToTop = () => {
    backToTop.hidden = document.documentElement.scrollHeight <= window.innerHeight * 1.5;
  };
  backToTop.addEventListener('click', (e) => {
    e.preventDefault();
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    document.querySelector('main')?.focus({ preventScroll: true });
  });
  window.addEventListener('resize', updateBackToTop);
  window.addEventListener('load', updateBackToTop);
  updateBackToTop();
}

renderAppFooter();
