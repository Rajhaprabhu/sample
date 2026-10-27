# AP Portal

A web front end for an accounts payable application: sign in, review invoices by
status and age, and reset a forgotten password.

**Version 1.0.0** (build 20261027.1) · Developed by Claude Code · Licensed to Rajha

## Pages

| Page | File |
|---|---|
| Sign in | `login/index.html` |
| Forgot password | `login/forgot-password.html` |
| Choose a new password | `login/reset-password.html` |
| Invoice dashboard | `dashboard/index.html` |

`shared/app-info.js` holds the application name, version, build and licence
details shown in the footer of every page.

## Running it

No build step is needed. Open `login/index.html` in a browser, then sign in with
any valid email and a password of 8 or more characters.

## Status

This is a front-end demo. Sign-in, password reset emails and invoice data are
placeholders that need to be connected to a backend before real use. See the
comments in `login/script.js`, `login/forgot-password.js`,
`login/reset-password.js` and `dashboard/data.js`.

## Releasing a new version

1. Update `version`, `build` and `releaseDate` in `shared/app-info.js`.
2. Add an entry to `CHANGELOG.md`.

## Licence

Copyright © 2026 Rajha. All rights reserved. See [LICENSE](LICENSE).
