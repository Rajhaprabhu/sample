# Changelog

All notable changes to AP Portal are listed here. Versions follow
[Semantic Versioning](https://semver.org/). Build numbers use the
format `YYYYMMDD.N` (date of the build, then the build count that day).

## 1.5.0 (build 20261027.6) – 2026-10-27

### Added
- **Requirements portal** (`requirements/index.html`) for gathering what the AP system needs to do.
  Open it from **Requirements** in the new top bar navigation.
  - **New requirement** form: title, AP process area, type (functional, non-functional,
    report, integration, compliance), MoSCoW priority, department, business need
    (as a user story), acceptance criteria (one per line) and an optional needed-by date.
    Everything is checked before submitting, and an exact duplicate title is refused.
  - Counts by status (New, Under review, Approved, In progress, Delivered, Rejected) and
    open requirements by AP process area, showing areas with nothing raised yet. Both filter the list.
  - List with search, area and priority filters, and sorting by newest, priority or votes.
  - Details panel with **+1 I need this too** votes (not on your own requests), comments,
    status changes (a reason is required to reject) and a history of changes.
  - **Export CSV** of the filtered list, ready for Excel.
  - **Reset demo changes** restores the sample requirements.

### Changed
- The top bar on the dashboard and data entry pages links to **Invoices** and **Requirements**.
  On the data entry page these links ask before discarding unsaved changes.
- The privacy policy explains that demo changes are kept in the browser.

## 1.4.0 (build 20261027.5) – 2026-10-27

### Added
- **Approved on** column in the invoice list when the **Approved** bucket is selected,
  showing the date and time of the final approval and who gave it.

## 1.3.0 (build 20261027.4) – 2026-10-27

### Added
- **Approve with comments.** In the details panel of a **Pending approval** invoice,
  **Approve** opens a form that requires approval comments (at least 10 characters)
  before **Confirm approval** is allowed.
  - Each approval completes the current step of the approval chain. After the last
    step the invoice moves to **Approved**; otherwise it waits for the next approver.
  - The approver's name, time and comments appear in the approval chain, the
    Approved summary and the activity log (audit trail).
  - Separation of duties: the person who entered and submitted an invoice cannot
    approve it, and one person cannot approve two steps of the same invoice.
  - The dashboard counts and list update straight away.

## 1.2.0 (build 20261027.3) – 2026-10-27

### Added
- **Data entry page** for AP processors (`dashboard/data-entry.html`). On the dashboard,
  clicking the invoice number of a **Received** invoice opens it; the details panel also has
  an **Open data entry** button.
  - Editable fields: vendor (from the vendor master only), supplier invoice number,
    invoice date, payment terms, purchase order, currency, line items (description,
    GL account, cost center, quantity, unit price; add and remove lines), tax, shipping,
    the invoice total as printed, and notes for the approver.
  - Calculated for you: due date from the date and terms, line amounts, subtotal and
    total, and a check that the lines, tax and shipping add up to the invoice total.
  - Read-only, by design: vendor ID, payment method and bank account (bank details can
    only change in the vendor master) and the date received.
  - Checks before submitting: required fields, possible duplicates (same vendor and
    invoice number), purchase order format and whether the vendor needs one, invoice
    date not in the future or over a year old, and a balanced total. Problems are listed
    at the top with links to each field.
  - **Save draft** keeps the invoice in Received; **Submit for approval** moves it to
    Pending approval and returns to the dashboard with a confirmation.
  - The original invoice is shown beside the form for checking.
  - Warns before leaving with unsaved changes. Invoices past Received open read-only.
- **Reset demo changes** button on the dashboard.

### Fixed
- The invoice details panel now closes with the close button, Esc or a click outside it.

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
