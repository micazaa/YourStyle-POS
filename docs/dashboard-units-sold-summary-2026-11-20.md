# Units sold summary — 2026-11-20

Implements the approved units-sold-summary preview, including the later inventory-style category bands and Code column in the report. Dev only.

The Units sold card opens a capped, scrolling modal with Description, Price, Units sold and Total sales. Pink category bands group YourFinds by size, Pins, Others and Wholesale; rows use neutral text without inventory status colors or descriptive subtitles. The category and grand totals line up under both numeric columns. View transactions preserves the selected date range.

The same dashboard sales read now supplies the summary, grouping by category, normalized description and historical sale price. Existing inventory category comparators control the order. Different prices remain separate rows. Codes are collected per group (YF uses its size code). Recorded net revenue is summed, including discounts, absorbed fees and zero-unit financial adjustments, while units follow the existing positive-unit/report-exchange rules. This retains reconciliation with the dashboard metrics; price × units may differ from actual sales when discounts or adjustments apply. No checkout, stock write or existing report calculation changes.

A secured dashboard.view endpoint downloads UNITS SOLD REPORT SUMMARY. Columns are Code / Description / Price / Units sold / Total sales; YF uses long size names in the report only. Category bands, full cell borders, the highlighted grand total and the right-aligned authenticated Prepared by signature match the approved sales report. PDF generation reuses the same cached data and resolves the preparer outside shared caches. The frontend retains duplicate-download protection, spinner, retry and logout/stale-response guards. Backend response and device snapshot keys are bumped; the existing cached Sales Log source remains compatible.

## Verification

70 focused tests plus three dashboard data tests pass. Coverage includes category/size/price grouping, code preservation, discount/refund reconciliation, cached reads and downloads, auth/date restrictions, source escaping, preparer identity, modal rendering without a fetch, transaction date navigation and logout protection. Full suite: 404 tests, 213 pass, 191 pre-existing failures; no new failing test names compared with the previous run. Lint, project validation, formatting and whitespace checks pass.

Offline UI checks use the actual DashboardPage and shared CSS/Bootstrap at 1200px and 390px: no modal overflow or page errors, four columns and all categories present. The actual PDF builder was rendered locally to A4 with background printing disabled and the PNG was visually inspected for header/category colors, Code column, aligned totals and signature. This does not claim authenticated live Apps Script PDF-converter verification. The 21st CLI is unavailable; reuse the approved preview and existing app primitives.

## Deployment

Fresh baseline dev v70 / production v21. Stage only Dashboard, ReportHelpers, DeliveryReceiptReport, AccessControl, DashboardPage and DeviceCache over the remote dev snapshot, preserving unrelated local source differences. No sheet records or schemas changed. Evidence: /private/tmp/yourstyle-units-summary-release. Published and verified **dev v71** on the existing deployment. All 89 files matched staged source and immutable-version readback. The 70 focused and three dashboard-data checks pass against the staged remote source. Production remains v21 with sources and deployment metadata unchanged. Rollback uses dev v70.


## Group by code with price ranges

User requested all SNE in one row, grouping by code instead of price. Aggregate by category + code; YourFinds uses its normalized size code. Fall back to description only for legacy rows without a code. Store minimum and maximum historical prices in the cached row; modal and PDF display a range when different and a single amount when equal. Codes, quantities, recorded sales and category totals are preserved. Distinct product codes stay separate even when descriptions match. Cached backend/device response keys are bumped to avoid mixing old price-specific rows with the new shape.

Focused checks cover two SNE records with different codes/prices merging into one size row, the same product code with different historical labels/prices merging, distinct codes remaining separate, ranges in PDF and modal, and unchanged sales/unit reconciliation including returns. Desktop/phone UI and actual PDF HTML were rendered offline and visually reviewed, with no overflow or page errors. No schema or financial-write changes. Stage four sources (Dashboard, DeliveryReceiptReport, DashboardPage, DeviceCache) over dev v71. Evidence: /private/tmp/yourstyle-unit-price-range-release. Published and verified dev **v72**. Four approved sources changed from v71; all 89 files matched staged source and immutable-version readback. Production remains v21 with sources and deployments unchanged. All 74 focused/data checks pass against the staged remote source. Rollback uses dev v71.


Sale-price rows remain separate per code/size with independent ranges. Detect the report collector’s SALE marker (including price-source SALE records), add · SALE to the displayed description and render all cells red using the app danger color / PDF #a52d3b. This is historical sale pricing, independent of inventory stock status. Regular rows and totals keep their previous colors. 71 focused plus three dashboard-data tests pass; project gates pass. UI checks confirm red sale rows and price ranges on desktop/phone and PDF, with no overflow or page errors.
