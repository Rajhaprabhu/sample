// Application details shown in the footer of every page.
// Update `version`, `build` and `releaseDate` for each release (see CHANGELOG.md).

const APP_INFO = {
  name: 'AP Portal',
  version: '1.0.0',
  build: '20261027.1',
  releaseDate: '2026-10-27',
  environment: 'Demo',
  licensee: 'Rajha',
  copyrightYear: 2026,
  developedBy: 'Claude Code',
};

function renderAppFooter() {
  const footer = document.querySelector('.app-footer');
  if (!footer) return;

  const thisYear = new Date().getFullYear();
  const years = thisYear > APP_INFO.copyrightYear
    ? `${APP_INFO.copyrightYear}–${thisYear}`
    : String(APP_INFO.copyrightYear);

  footer.innerHTML = `
    <p>© ${years} ${APP_INFO.licensee}. All rights reserved. ${APP_INFO.name} is licensed to ${APP_INFO.licensee}.</p>
    <p>
      Developed by ${APP_INFO.developedBy}
      <span class="sep" aria-hidden="true">·</span>
      Version ${APP_INFO.version} (build ${APP_INFO.build}, released ${APP_INFO.releaseDate})
      <span class="sep" aria-hidden="true">·</span>
      ${APP_INFO.environment} environment
    </p>
  `;
}

renderAppFooter();
