# Production audit — 2026-10-01

## Scope and architecture

This is a local source audit and a focused hardening pass, not a production certification. No deployment, live spreadsheet mutation, or migration was performed. Existing delivery-details edits were preserved.

The application is a Google Apps Script V8 web app. `Backend/Code.js` evaluates an HTML template that includes the vanilla JavaScript frontend, Bootstrap, pages, and modals. Calls use `google.script.run`. Google Sheets holds Product Master, Inventory, sales, deliveries, employees, and the inventory movement ledger. Drive holds generated documents and product images. Apps Script manages hosting, execution quotas, locks, triggers, and logging; there is no separately managed SQL database or application server.

The manifest runs the web app as the deploying user and permits `ANYONE`. Employee PIN verification creates cached manager/dashboard sessions. Frontend session state is persisted in localStorage. Page and catalog caches exist in the browser. Sheet formulas derive stock; SummaryQueries offers an optional migration to aggregated formulas. All HTML is included up front; there is no frontend bundle build or TypeScript check. Source inspection found about 528 KiB of frontend files and 448 KiB of backend files before this pass. These are disk sizes, not compressed transfer measurements.

Node 24 and exact direct development dependency versions are already declared. npm lockfile and GitHub Actions provide tooling reproducibility. No repository AGENTS.md was found. Existing dashboard validation documentation was reviewed alongside implementation and tests.

## Evidence and priorities

| Priority | Finding and evidence | Impact / risk / effort | Outcome |
|---|---|---|---|
| P0 | Public mutation/report endpoints do not consistently verify server sessions. `executeCheckoutBackend` accepts cart/cashier data; `getTransactionHistory` accepts `isManager`. The deployment executes as its owner. | Critical / coordinated API change / high | Open release blocker. Authenticate every external entry point and derive identity, roles, prices, and report scope on the server. |
| P1 | Public product readers exposed supplier costs. Manager-only UI did not secure direct calls. | High / low / small | Raw reader is private; public list, active, by-code, and management reads redact costs without verified manager authorization. |
| P1 | Manager login invoked `prepareSummaryQueries`, which can rewrite Inventory formulas. This put migration work and a script lock in normal login. | High / low / small | Removed automatic invocation. Explicit migration remains available; validate it separately against a copied spreadsheet. |
| P1 | Quality checks passed despite 12 failing tests because CI did not execute tests. Baseline: 51/63 passing. | High / low / medium | Tests included in `npm run check`; outdated schema fixtures and UI mocks repaired without skipping tests. |
| P1 | npm audit identified fast-uri (high), ip-address and qs (moderate) in development tooling. | High tooling exposure / low / small | Compatible lockfile updates, clean install, audit reports zero known vulnerabilities. Direct dependencies unchanged. |
| P2 | `processSalesRows_` performed one Sheets row read per pending sale, even for adjacent rows. | High batch latency / medium / small | Adjacent rows read in groups of at most 200, inside the existing lock. Sparse gaps are not scanned. Duplicate row IDs processed once. |
| P2 | An invalidated catalog request could finish after its replacement and overwrite the newer cache. | Stale products / low / small | Cache population now requires the exact current request and matching employee. Product save also invalidates the pending request. |
| P2 | Page/template payload loads all modals initially. Inventory reads raw/display ranges plus Product Master and movement metadata; several write paths repeat whole-sheet lookups per item. | Potential startup/large-data latency / medium / medium-high | Profile live data before choosing code splitting, pagination, or request-scoped indexes. No unsupported latency claim. |
| P2 | `ALLOWALL` explicitly allowed arbitrary framing. | Clickjacking exposure / embedding compatibility / small | Restored Apps Script DEFAULT framing. Test any intentional external embedding before release. |
| P2 | No explicit clasp upload allowlist. | Deployment safety / low / small | Added `.claspignore`; `clasp status` confirms only manifest, Backend, and Frontend are uploaded. |
| P2 | Summary readiness uses header markers; migration, formula parity, rollback, and error-state handling need live verification. | Stock correctness / high / medium | No live formula rewrite performed. Remains separate staging gate. |
| P3 | No application-wide timing metrics, readiness diagnostics, or alerting. Error handling and logging are inconsistent. | Diagnosis/operations / medium / medium | Release and measurement procedure below; no public unauthenticated diagnostic endpoint added. |

No memory leak was reproduced. No live p50/p95 API timings, cold-start timings, browser rendering profile, Drive asset transfer measurements, or production row counts were captured. Source complexity and repeated operations are evidence of work performed, not proof of end-user latency. SQL indexes and conventional server health checks do not apply directly to this Apps Script architecture.

## Changes and files

- `Backend/ProductMaster.js`: private raw product reader and public cost redaction, including by-code lookup.
- `Backend/InventoryMovement.js`, `Backend/Inventory.js`, `Backend/GeneralDelivery.js`: internal calls use the private reader; manager reads still verify authorization.
- `Backend/Code.js`: default framing policy.
- `Backend/SalesAutomation.js`: bounded adjacent-row reads under the existing script lock; existing validation, movement deduplication, writes, and lock release retained.
- `Frontend/Scripts/AppJS.html`: prevent stale catalog responses from replacing current cache.
- `Frontend/Modals/InventoryManagementModal.html`: invalidate cached and pending catalog after product changes.
- `Frontend/Modals/LoginModal.html`: remove automatic formula migration.
- `package.json`: add `npm test` and include it in the existing CI check command.
- `package-lock.json`: compatible transitive dependency fixes, including updates resolved by npm audit fix; no direct version changes.
- `.claspignore`: deployment allowlist.
- `tests/audit-regressions.test.cjs`: cost authorization/redaction, stale catalog race, login migration guard, bounded sales-read tests.
- `tests/dashboard.test.cjs`, `tests/inventory-list.test.cjs`, `tests/yourfinds-cost.test.cjs`: production column layouts, current UI behavior, and required test dependencies/mocks.

`Backend/DeliveryDetails.js` and delivery-report modal changes existed before the audit. The pre-existing delivery changes in GeneralDelivery were preserved. They are not claimed as audit fixes.

## Verification and before/after

| Check | Before | After |
|---|---|---|
| Behavioral tests | 51 pass, 12 fail, 63 total | 67 pass, 0 fail, 67 total |
| CI behavior | Lint, syntax, formatting only | Same checks plus full test suite |
| Adjacent sales row reads (200-row fixture) | 200 calls | 1 call; 99.5% fewer row-read calls |
| Sparse input `[2,3,10000,10000]` | Repeated individual reads | 2 bounded reads, no gap scan or repeated row processing |
| Large contiguous input (401 rows) | 401 reads | 3 reads, each at most 200 rows |
| Automatic migration RPC per successful manager login | 1 | 0 |
| Known npm vulnerabilities | 3 packages: 1 high, 2 moderate | 0 reported after clean install |

The read counts concern row retrieval inside sales processing only. Stock updates, movement scans, writes, flushes, and the initial pending-row search still cost time. This is not a claim of 99.5% faster checkout or sync. Unit-test duration is not an application performance benchmark.

`npm ci --ignore-scripts` succeeded against the updated lockfile. `npm run check` passed lint, Apps Script/HTML script syntax validation, configured formatting, and all 67 tests. `git diff --check` passed. `npx clasp status` confirmed upload boundaries. No separate compiler/build exists. Apps Script services and browser DOM were mocked in tests; live UI, formulas, and deployment remain unverified.

## Release, rollback, and remaining work

1. Treat complete endpoint authorization as the next release blocker. Inventory all externally callable Apps Script functions, including maintenance helpers. Reuse existing opaque session verification, require it on reads and writes, verify current employee status, and enforce role checks on the server. Preserve trigger/menu flows through private helpers. Add forged, expired, revoked, and cross-role tests before changing callers together.
2. Use a staging Apps Script project bound to a copy of the spreadsheet. Confirm configuration/Drive folders point to staging. Never paste OAuth tokens or clasp credentials into source or logs.
3. Run `npm ci`, `npm run check`, `npm audit`, and `npx clasp status`. Record the commit and current production deployment version. Push only the reviewed code after staging approval. Use a versioned deployment; do not use a development URL as a production release identifier.
4. Smoke-test cashier and manager login, logout/account switch, checkout retries, standard/custom costs, delivery/distribution, supplier returns, report downloads, and intentional embedding. Check no duplicate movements and exact stock parity before/after retries.
5. Measure at least cold login, warm navigation, catalog opening, inventory load, dashboard load, checkout, and 200-row sync. Record p50/p95 across repeated staging runs, dataset size, RPC count, response bytes, and Sheets read/write counts. Capture browser request/render timings and Apps Script execution duration separately. Log operation, duration, outcome, and a correlation ID only; exclude PINs, tokens, customer data, and cart contents.
6. Optimize the measured next bottleneck with request-scoped indexes and batched writes first. Introduce persistent caches only with explicit invalidation and session isolation. Lazy-load heavy modals only after quantifying initial transfer and preserving their global script dependencies.
7. Validate SummaryQueries against a spreadsheet copy, including empty ledgers, negative stock, returns, exchanges, duplicate codes, and formula errors. Preserve formula/value backups and verify rollback before an explicit production migration. Code rollback alone cannot undo a sheet migration.
8. Roll code back by updating the deployment to the recorded prior version. Do not reset or overwrite a dirty working tree. Keep spreadsheet backups separate; preserve transactions created since backup instead of restoring blindly.
9. Review report-file sharing and Drive retention, PIN storage/rate limiting, client-supplied checkout prices, localStorage session trust, and server authorization for operational setup functions. Existing image sharing may be intentional; financial report access needs an explicit policy.

This pass improves local safety and removes proven redundant work. It does not certify the application as production-secure or guarantee zero loading delay.
