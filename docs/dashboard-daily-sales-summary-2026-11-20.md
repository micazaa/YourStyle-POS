# Dashboard daily sales summary — 2026-11-20

Approved by “implement that on dev” after the daily date/payment/cashier and download simulation. Reuses the current dashboard modal, table, inline radios, scrolling, transaction navigation and secure PDF download; no new dependencies or sheet columns.

## Behavior

- Sales summary has Date and Sales (Expected collection) columns. Dates are newest first, including zero-collection days. The first date is expanded initially; other date rows expand independently. Changing breakdown preserves the open dates, and changing range resets them.
- Payment method details use Cash, GCash, Credit card and QR Code labels; legacy payment labels remain visible. Cashier details show recorded report names and the matching Cash Report Log shift times, including multiple shifts by the same cashier. Missing shift history is labeled Shift not recorded, without inventing times; open shifts say Ongoing.
- Preserve cashier privacy: manager/OIC dashboard responses include cashier amounts, while cashier accounts receive payment totals without the cashier array. The download endpoint enforces the same restriction.
- All details arrive with the existing dashboard sales read. The compact Sales Log snapshot includes cashier and fee fields plus one cached read of shift intervals; range changes and PDF downloads reuse the same snapshot. Backend sales response/source keys and device dashboard keys are versioned to avoid stale shapes.
- Expected collections represent customer money recorded for completed sales: net revenue plus absorbed and charged fees for non-split payments; recorded split allocations counted once per receipt/payment stage, plus charged line fees. Cash tender/change are not counted as extra sales. Reservation deposit/balance events stay separate. Exchange date/cashier anchors and void exclusions reuse the report collector. Net-sales card, graph, existing payment donut and financial writes are unchanged.
- A4 SALES REPORT SUMMARY contains YourStyle, selected range, current breakdown, every date and detail, daily subtotals and a final GRAND TOTAL. All details print regardless of modal expansion. Names are escaped. The download button retains its spinner, error/retry handling and logout protection.

## Verification

Focused backend/UI tests cover split-payment de-duplication, fees, refunds, reservation stages, cross-date exchanges, store midnight, repeated cashier shifts, cache reuse, empty dates, download modes, escaped names, auth/privacy, cached modal rendering and expandable rows. Lint, project validation, formatting and whitespace checks pass. Full-suite comparison: untouched HEAD 396 tests / 205 pass / 191 fail; with this feature 400 / 209 / 191, with no new failing test names. Existing failures are outside this change and include outdated auth fixtures.

Browser access is unavailable in this chat. Interactive behavior and generated PDF HTML were checked in the VM tests; authenticated live modal behavior and Google PDF visual rendering are not claimed. 21st CLI is unavailable; implementation uses the approved in-chat design and existing project primitives.

## Dev release

Staged only five changed application sources over a fresh dev v64 snapshot: Dashboard, ReportHelpers, DeliveryReceiptReport, DashboardPage and DeviceCache. Production sources and deployment metadata are checked before/after release. No sheet records, schemas or production code are changed. Release evidence is under /private/tmp/yourstyle-daily-sales-release. Published dev version **65** and verified that the existing dev deployment points to v65. All 89 files were read back and matched the staged hashes, including immutable v65 content. Production remains v21: source and deployment metadata unchanged. The staged release passed 66 focused tests plus three dashboard-data tests. Rollback uses dev version64 on the same deployment ID. The unrelated local InventoryMovement source difference was excluded; the remote dev copy was preserved.
