# AP Portal backend (.NET)

An ASP.NET Core 10 app that serves the AP Portal screens and the API behind
them, on the PostgreSQL database in [`db/`](../db/README.md).

When this app serves the pages they use the API: real sign-in, data saved in the
database, and the approval rules enforced by the server. Opened as plain files
(the demo or GitHub Pages) the same pages keep using their built-in sample data.

## Run it

Needs the .NET 10 SDK and PostgreSQL 14+.

```sh
# 1. Database (once)
createuser --pwprompt ap_portal          # password: ap_portal_dev (matches appsettings.Development.json)
createdb -O ap_portal ap_portal
psql -h localhost -U ap_portal -d ap_portal -f db/schema.sql
psql -h localhost -U ap_portal -d ap_portal -f db/seed.sql

# 2. App
cd backend/src/ApPortal.Api
ASPNETCORE_ENVIRONMENT=Development dotnet run --urls http://localhost:5080
```

Open http://localhost:5080 and sign in as a sample user, for example
`jane.doe@company.example` (AP processor), `priya.nair@company.example` (budget owner)
or `daniel.ortiz@company.example` (finance controller). In Development every sample
user's password is `Demo-Password-2026!` (set at startup from `DemoData:Password`).

Or run everything with Docker: `docker compose up --build`, then open http://localhost:8080.

## API

All responses are JSON; errors use ProblemDetails (`detail` explains the problem).
Everything except sign-in and password reset needs a signed-in session.

| Method and path | What it does |
|---|---|
| `POST /api/auth/login` | Sign in `{ email, password, remember }`. Sets an HttpOnly `ap_session` cookie. Locks the account for 15 minutes after 5 failed attempts. |
| `POST /api/auth/logout` | Sign out (ends the session on the server) |
| `GET /api/auth/me` | The signed-in user's name, email and roles |
| `POST /api/auth/forgot-password` | Emails a reset link `{ email }`. Same answer whether or not the account exists. |
| `GET /api/auth/reset-password/verify?token=` | Checks a reset link is still valid |
| `POST /api/auth/reset-password` | Sets a new password `{ token, password }` (12+ characters, upper, lower, number, symbol). Signs out other sessions. |
| `GET /api/invoices` | Every invoice with its full details |
| `GET /api/invoices/{docNumber}` | One invoice |
| `PUT /api/invoices/{docNumber}` | Save draft from data entry (AP processor). Send the `rowVersion` you loaded; a stale one returns 409. |
| `POST /api/invoices/{docNumber}/submit` | Submit for approval (AP processor) |
| `POST /api/invoices/{docNumber}/approve` | Approve the waiting step `{ comment }` (10+ characters; needs that step's role) |
| `GET /api/reference` | Vendors, terms, currencies, GL accounts and cost centers for the dropdowns |
| `GET /api/dashboard` | Status buckets and aging from the database views |
| `GET /api/health` | Health check |

## Security

- **Sessions:** stored on the server (`user_sessions`). The cookie holds a random token, and only its hash is stored. Cookies are `HttpOnly`, `SameSite=Strict` and `Secure` over HTTPS. Signing out, or resetting a password, ends sessions immediately.
- **Passwords:** hashed with ASP.NET Core's `PasswordHasher` (PBKDF2).
  - Sign-in and reset requests are rate-limited per address.
  - Sign-in errors don't reveal whether an email has an account.
- **Business rules:** separation of duties, approval roles and balanced totals are enforced by the database functions, so the API and the screens can't get around them.
- **What the app serves:** only `login/`, `dashboard/`, `info/` and `shared/`, never `db/` or source files.
- **Response headers:** a strict Content Security Policy and other security headers on every response.

## Settings

| Setting | Default | Notes |
|---|---|---|
| `ConnectionStrings:ApPortal` | — | Required. Include `Search Path=ap`. |
| `Auth:SessionHours` / `Auth:RememberMeDays` | 12 / 30 | Session length without and with "Keep me signed in" |
| `Auth:LockoutAttempts` / `Auth:LockoutMinutes` | 5 / 15 | |
| `Auth:AuthRequestsPerMinute` | 10 | Rate limit per client address |
| `Auth:ExposeResetLinkInResponse` | false | Development only: shows the reset link on screen because no email is sent |
| `App:PublicBaseUrl` | request URL | Base of links in emails, e.g. `https://ap.example.com` |
| `Hosting:UseHttpsRedirection` | false | Turn on when the app terminates HTTPS itself |
| `DemoData:Password` | — | Development only: password for the seeded sample users. Never set in production. |
| `Frontend:Root` | auto | Folder containing `login/` and `dashboard/` |

## Tests

```sh
dotnet test backend
```

The 15 tests start the real app against a PostgreSQL database rebuilt from
`db/schema.sql` and `db/seed.sql` (default `ap_portal_test` on localhost, or set
`AP_TEST_DATABASE`). They cover sign-in, lockout, sign-out, password reset, data entry,
submission, the two-step approval with separation of duties, and which files are served.

## Before production

- **Email:** replace `LoggingEmailSender` with a real email service, so password reset links are sent instead of logged.
- **Hosting:** run behind HTTPS and set `App:PublicBaseUrl`.
- **Secrets:** keep the connection string out of source control, for example in environment variables or a secrets store.
- **Sample data:** create real users with real password hashes, and don't load `db/seed.sql`.
