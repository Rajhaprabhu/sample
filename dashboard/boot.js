// Loads the data source and then the page's own scripts, in order.
// Served by the .NET backend (AP_CONFIG.api) the pages use the API; opened as
// plain files they use the sample data in this folder.
(function boot() {
  const pageScripts = document.currentScript.dataset.page.split(/\s+/).filter(Boolean);
  const dataScripts = apiMode()
    ? ['api-data.js']
    : ['invoice-store.js', 'data.js', 'invoice-details-data.js'];

  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${src}.`));
      document.body.appendChild(script);
    });
  }

  function showError(message) {
    const box = document.createElement('div');
    box.className = 'status-panel tone-danger load-error';
    box.setAttribute('role', 'alert');
    box.innerHTML = '<h3>The page could not load</h3><p></p>';
    box.querySelector('p').textContent = message;
    (document.querySelector('main') || document.body).prepend(box);
  }

  (async () => {
    for (const src of dataScripts) await load(src);
    if (window.AP_DATA_READY) await window.AP_DATA_READY;
    for (const src of pageScripts) await load(src);
  })().catch((err) => showError(err.message));
})();
