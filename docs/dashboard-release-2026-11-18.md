# Approved dashboard release — 2026-11-18

Implements the approved in-chat preview using the existing Apps Script, Bootstrap and YourStyle components. The dashboard is enabled for the recognized development and production spreadsheets, including production's live URL.

- Greeting and daily quote, shared range picker, three overview cards, sales metrics alongside the combined graph, ranked items and payment donut.
- Daily/Weekly controls outside the graph filter for multiple dates. Category checkboxes remain inside the graph filter.
- By qty/By amount controls outside the top-selling filter. Its previous category dropdown, Pins code grouping and YourFinds size grouping are preserved.
- Payment hover/focus expands the matching segment and updates the center's amount, payment method, share and actual absorbed fee. Tap/click pins a selection; Escape restores the total. Payment tooltips are removed. QR payments currently charge their 1% fee to the customer in checkout, so their shop-absorbed fee remains zero; this release does not change fee accounting.
- Inventory, Delivery, Return and Net sales report download buttons show a spinner instead of Preparing text, and reset after success or failure.
- Existing dashboard caches and a single loading state below the header are preserved. Device dashboard caches are scoped to the spreadsheet. The production session cleanup guard remains in place.

The isolated dev/prod release directories were prepared from immutable deployed versions 40 and 19. Exactly eight source files changed; existing inventory and phone code was preserved. Backups and release hashes are under `/private/tmp/yourstyle-dashboard-release-Nf0ibn`.

Validation: project validation, lint, formatting and whitespace checks passed. All 26 dashboard/navigation tests, 10 report tests and three current dashboard data tests passed against the staged production source. The full suite had 201 failures before these changes and 194 after correcting outdated dashboard mocks, with no new failing test names. The remaining failures belong to pre-existing fixtures and unrelated functionality; the full suite is not green.

Browser access was unavailable in this chat, so interactive DOM behavior was tested in the existing VM harness rather than visually verified in a browser. 21st search required a separate login; automatic approval review rejected exporting the private source to 21st review. Local source and behavior checks were used instead.

Published and verified through Apps Script deployment readback:

- Dev: version **41**, replacing version 40 on the existing deployment.
- Live production: version **20**, replacing version 19 on the existing deployment.
- All 62 files in each immutable release were pulled back and matched against the reviewed source hashes before deployment. The other saved deployments were preserved.
- Anonymous HTTP checks reached Google's sign-in page for both URLs; they do not constitute authenticated dashboard or checkout verification.

Rollback uses the same deployment IDs with dev version 40 or production version 19. No spreadsheet records or deployment access settings were changed.
