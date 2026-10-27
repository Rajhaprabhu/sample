# Changelog

All notable changes to AP Portal are listed here. Versions follow
[Semantic Versioning](https://semver.org/). Build numbers use the
format `YYYYMMDD.N` (date of the build, then the build count that day).

## 1.1.0 (build 20261027.2) – 2026-10-27

### Added
- Invoice details panel: click any invoice on the dashboard to open it.
  - Progress bar from Received to Paid, showing where an invoice stopped if it is on hold or rejected.
  - A status summary at the top that changes with the status:
    - **Received:** intake checks (duplicates, vendor, purchase order, coding).
    - **Pending approval:** who it is waiting for, for how long, and whether it is past due.
    - **Approved:** next payment run and any overdue warning.
    - **Scheduled:** payment date, method, amount and accounts.
    - **On hold:** the exception (price variance, missing goods receipt, possible duplicate), owner and next step.
    - **Paid:** payment reference, days to pay, remittance advice and any discount captured.
    - **Rejected:** reason, who rejected it, and whether the vendor was told.
  - Early payment discount alerts (e.g. 2/10 Net 30) while the discount can still be taken.
  - Invoice details, amounts, line items with GL coding, 2-way or 3-way match result,
    approval chain, vendor details with masked bank and tax numbers, the original
    document, and the activity log (audit trail).
  - Next-step buttons for each status (demo only: they show a message).
  - Opens from a link such as `dashboard/index.html#INV-10421`; closes with Esc.

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
