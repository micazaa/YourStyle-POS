# Approved checkout and success UI — dev only

The checkout reuses the existing overlay, buttons, controls, tokens, focus handling and authenticated sales routes. The content scrolls inside a capped card while its close button and Complete order action remain accessible. Success uses the approved centered check/title, receipt, total paid, received payment rows, plain Change given and full-width New transaction.

Split payment and customer-paid fees default off. Each digital payment requires a time and exactly four alphanumeric reference characters. Split allocations represent the sale portions, with charged fees added separately. Cash change uses actual cash tender minus its sale portion. The QR and card fee flags pass through regular checkout, reservation payments and exchange payments. Older API calls that omit the new last QR flag retain the previous charged-QR behavior; legacy card receivedAmount payloads remain supported. No schema migration or production writes are included.

Validation:
- 42 focused tests passed against the staged remote dev project: fee and allocation cases, references, validation, retry/busy behavior, stored payment fields in both Sales Log layouts, reservation/exchange payment paths, barcode search and services.
- Actual local HTML/CSS/JavaScript tested in Chrome at 1280px, 390px and 320px: single and split methods, fee toggles, equal reference columns, cash shortfall/change, failed-submit retry, successful confirmation, digital-only confirmation, reopening defaults, Escape and focus trapping. Browser requests were blocked; no real payments were submitted.
- ESLint, project validation and formatting checks passed.
- Full suite: 238 passed / 189 failed versus baseline 234 passed / 189 failed. The failing test names are identical; no new failures. Existing failures include missing fixture globals and older source-extraction assumptions.
- 21st CLI is unavailable; approved previews and installed project primitives supplied the implementation direction.

Release uses a fresh dev remote baseline and an eight-file allowlist. Unrelated remote code, including its InventoryMovement version, stays intact. Deployment and production readback evidence is stored in /private/tmp/yourstyle-checkout-redesign-release.

Released as dev version 88. Direct deployment readback confirms active version 88 and an exact match between the staged source and immutable version. Production source and deployment hashes are unchanged (live prod remains version 21). The first immediate readback returned stale version 87; a separate direct verification resolved it without a second deployment.

## Unequal split-payment follow-up

Removed both Sale amount controls and their automatic half-and-half allocation. Each method now has one full-width received amount field, starting blank; entering one amount never fills the other. For a ₱120 Yellow item, ₱100 Cash plus ₱20 GCash saves those exact sale portions, cash received ₱100 and zero change. Extra cash becomes change. Digital received amounts include any enabled fee; the existing API continues receiving sale portions and unchanged fee flags. Fee switches adjust only their own received amount. No backend or sheet changes are needed for this follow-up.

Follow-up validation: 45 focused tests passed, including the exact Yellow example in both Sales Log layouts, every distinct payment pair, independently entered amounts, cent reconciliation, zero/invalid/excess digital amounts, cash underpayment/change, fee toggles, references, retry/loading and existing cashier behavior. Local Chrome checked the actual app at 1280px, 390px and 320px with unequal splits, reversed method order, fees on/off, success rows and reservation routing. No real sale was submitted.

Released the follow-up as dev version 89. The active deployment and immutable version match the staged one-file change (Frontend/Modals/CheckoutModal). Production sources and deployments remain unchanged. Full-suite follow-up: 241 passed / 189 existing failures, with no newly failing test names.

## Compact split cards and Cash + GCash defaults

Split mode now uses two individually bordered cards with method and received amount aligned on the same row, short Reference labels, compact spacing, and slim total/change bars. The split methods default to Cash and GCash in the markup and on every checkout open; the split switch still starts off, both received fields stay blank, and unequal amounts remain independent. Turning split off restores the previous centered total, four method buttons and regular fields. All compact styles are scoped to split mode. No financial, backend, sheet, success-confirmation or permission logic changed.

Validation: the existing 45 focused tests passed, plus ESLint, project validation, formatting and diff whitespace checks. Local browser checks at 1280px, 390px and 320px confirmed Cash + GCash defaults, blank independent fields, aligned controls, visible card borders, compact total, normal-mode restoration, unequal payment/fee/change calculations, retry/busy handling, success and reservation routing. The 21st CLI remains unavailable; existing app controls/tokens and the approved interactive preview were reused.

Released the compact follow-up as dev version 90. The active deployment and immutable source match the tested two-file release. All other remote files were preserved; production source and deployment hashes remain unchanged (live production stays version 21). Verification evidence: /private/tmp/yourstyle-compact-split-release/verification.json.

## Restore the centered split total

Removed the four split-only total layout overrides. Split checkout now reuses the standard pink, centered Total due panel, larger amount and centered remaining-balance subtitle. Compact payment cards, Cash + GCash defaults, independent amounts and all financial behavior remain unchanged. Local Chrome checks at 1280px, 390px and 320px confirmed centered label/amount/subtitle, hidden remaining balance when covered, compact cards and normal-mode restoration. ESLint, project validation and diff whitespace checks passed. No new tests were added for this reversible CSS adjustment.

Released the centered-total follow-up as dev version 91. Direct deployment verification confirms version 91 is active and matches the tested one-file release; production source and deployment hashes are unchanged. The first immediate readback was stale (version 90); a separate direct verification resolved it without another deployment. Evidence: /private/tmp/yourstyle-centered-total-release/verification.json.
