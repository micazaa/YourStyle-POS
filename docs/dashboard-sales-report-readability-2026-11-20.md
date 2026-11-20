# Sales report readability — 2026-11-20

Approved after the sales-report-clear preview, with removal of “Expected collection” and “Expand dates by” labels and a Prepared by signature for the signed-in account. Development only.

The modal keeps Date / Sales and the two breakdown controls. Every collapsed row cell now uses the card background with no Bootstrap inset shading; only expanded dates use pink. The daily aggregation returns ascending dates, including empty dates. The backend response key and device dashboard key are versioned so old descending results are not restored.

The PDF matches the approved three-column layout: a date/weekday block, payment method or cashier details, and aligned Sales values. A date cell spans its details and daily total; subtotals and the grand total use the same quiet pink surface. Money is consistently formatted with two decimal places. The signature line follows the total, with the authenticated actor’s original account name and Prepared by. Identity is resolved per download outside the shared sales cache; request-supplied names are ignored and escaped text is used throughout. Calculations, cache source, permissions and other dashboard reports remain unchanged.

## Validation

66 focused tests and three dashboard data tests pass. Coverage includes ascending dates, unchanged reconciliations, empty dates, cashier grouping/privacy, server-resolved preparer identity across two accounts sharing cached totals, forged preparer rejection, label/table content, and existing download/cache/navigation behavior. Lint, project validation, formatting and whitespace checks pass. The previous full-suite comparison remains 191 pre-existing failures; this change does not claim the complete suite is green.

Offline rendering uses the real report HTML builder, local sample data and isolated headless Chrome with all network requests blocked. Both six-day payment and cashier samples render on one A4 page with a visible signature; PNGs were inspected. This is a local print-render check, not verification of Google Apps Script’s PDF converter. The modal is checked using the real DashboardPage and shared CSS plus the exact pinned Bootstrap 5.3.0 stylesheet at desktop and phone widths. Live authenticated Google Apps Script browser behavior is not claimed.

## Deployment

Fresh baseline: dev v65 (89 files), production v21 (62 files). Stage only Dashboard, DeliveryReceiptReport, DashboardPage and DeviceCache over the remote dev snapshot. Preserve the unrelated local InventoryMovement difference. Release evidence and local render samples: /private/tmp/yourstyle-clear-sales-release. Production source and deployment metadata are verified unchanged after deployment. No spreadsheet records or schemas are written. Published and verified **dev v66** on the existing deployment. The remote source and immutable v66 content matched the reviewed 89-file release; only the four approved application files changed from v65. Production remains v21, with source and deployment metadata unchanged. All 69 focused/data tests also passed against the staged remote-source release. Desktop (1200px) and phone (390px) checks confirmed no horizontal modal overflow, white collapsed cells, pink expanded cells, first selected date first, removed labels and no page errors. Rollback uses dev version65 on the same deployment ID.


## Date divider follow-up

The user requested visible separation between dates in the downloaded report. Replace the white inter-date border with an explicit date-start row class and a 2px muted rose top border across Date, Payment method/Cashier and Sales. Keep compact padding and preserve all values, order, totals, signature and modal behavior. Apply to both report modes.

Seven focused report/data tests and lint, validation, formatting and whitespace checks pass. Both six-day A4 samples were rendered and visually inspected with background printing off. Automated style inspection confirmed a 2px border on all three cells of each of the five date boundaries in each mode. Only DeliveryReceiptReport is staged over a fresh dev v66 snapshot; production remains protected. Evidence: /private/tmp/yourstyle-date-dividers-release. Published and verified dev **v67** on the existing deployment. Only DeliveryReceiptReport changed from v66; all 89 staged files matched source and immutable-version readback. Production remains v21 with source and deployments unchanged. All seven focused tests also pass against the staged remote source. Rollback uses dev v66.


## Grand total highlight follow-up

Highlight the grand total in both PDF modes with a stronger pink fill (#edd7dc), a 2px rose outline, bold dark rose text and an 18px amount. A decorative spacer preserves the separation from the final daily total. Keep the signed-in Prepared by signature below it. Explicit bgcolor attributes and exact print-color adjustment retain the colored band with background printing disabled. Dates, dividers, details and calculations are preserved.

Seven focused report/data checks and lint, validation, formatting and whitespace checks pass. Both six-day report samples were rendered to single-page A4 PDFs with background printing disabled and their PNGs were inspected. Automated computed-style checks confirmed the 2px border, 18px amount and chosen pink background, plus the existing date separators. Only DeliveryReceiptReport is staged over fresh dev v67 source; production remains protected. Evidence: /private/tmp/yourstyle-grand-total-release. Published and verified dev **v68**, changing only DeliveryReceiptReport. Source and immutable-version readback matched all 89 staged files. Production remains v21 with source and deployments unchanged. All seven focused checks pass against the staged remote source. Rollback uses dev v67.


## Report header and brand follow-up

Match the provided table-header reference using the existing inventory report palette: pink #f2dede fill, #e3c6c6 single cell borders, bold #65454b labels and matching padding. Preserve Date, Payment method/Cashier and Sales labels. YourStyle uses the inventory title’s Arial, 20px, 700 weight and #b76e79 rose color. Apply exact print-color retention and explicit header bgcolor attributes for the PDF converter. Keep the v68 grand-total highlight, date separators, values and signature intact.

Seven focused checks and project gates pass. Both report modes were rendered offline with background printing off; style checks cover the pink bordered header, YourStyle font/weight/color, grand-total highlight and date separators. PNG review verifies the printed appearance; local Chromium validation does not claim authenticated Google converter verification. Stage only DeliveryReceiptReport over dev v68; production remains protected. Evidence: /private/tmp/yourstyle-report-header-release. Published and verified dev **v69**, changing only DeliveryReceiptReport from v68. All 89 files matched source and immutable-version readback. Production remains v21 with source and deployment metadata unchanged. Seven focused checks also pass against the staged remote source. Rollback uses dev v68; the highlighted grand total remains included.


## Matching total colors and right signature

Match the grand-total band to the table header exactly: #f2dede fill, #65454b text and #e3c6c6 borders. Preserve the stronger 2px outline, bold label and 18px amount. Move the entire 60mm Prepared by block to the right content edge with centered name and role beneath the signature line. Identity, date order, dividers, monetary precision and computations remain unchanged.

Seven focused checks and project gates pass. Both PDF modes were rendered and visually checked with background printing disabled. Automated checks verify the exact total/header colors and that the signature block’s right edge aligns with the table, alongside prior typography and separator checks. Stage only DeliveryReceiptReport over fresh dev v69 source. No production code or sheet writes. Evidence: /private/tmp/yourstyle-report-colors-signature-release. Published and verified dev **v70**, changing only DeliveryReceiptReport from v69. All 89 files matched source and immutable-version readback. Production remains v21 with source and deployment metadata unchanged. Seven focused checks also pass against the staged remote source. Rollback uses dev v69.
