# Changelog

All notable changes to AP Portal are listed here. Versions follow
[Semantic Versioning](https://semver.org/). Build numbers use the
format `YYYYMMDD.N` (date of the build, then the build count that day).

## 1.0.0 (build 20261027.1) – 2026-10-27

First release.

### Added
- Sign-in page with email and password validation, show/hide password and "Keep me signed in".
- Invoice dashboard with status buckets (Received, Pending approval, Approved, Scheduled,
  On hold, Paid, Rejected), an aging breakdown of unpaid invoices and a searchable invoice list.
- Forgot password and reset password pages.
- Signed-in user's name and initials in the dashboard header.
- Footer on every page with support and legal links, support contact, copyright and licence,
  version, build, release date, time zone, an environment badge for non-production builds,
  and "Back to top" on long pages.
- Help & support, privacy policy (including cookies and browser storage), terms of use,
  accessibility statement and security reporting pages (templates to review before going live).

### Known limitations
- Sign-in, password reset and invoice data are demo placeholders; there is no backend yet.
