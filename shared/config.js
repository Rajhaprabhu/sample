// Tells the pages whether the AP Portal API is available. This copy says no, so
// the pages use their built-in sample data (the demo and GitHub Pages). The .NET
// backend serves its own version of this file that turns the API on.
window.AP_CONFIG = window.AP_CONFIG || { api: false, apiBase: '/api' };
