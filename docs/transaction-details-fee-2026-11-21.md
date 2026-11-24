# Shop-absorbed fee in transaction details

The payment panel now displays a Shop-absorbed fee row after the reference and before Transaction Total. It uses the feeAbsorbed values already returned on each Sales Log item, with no additional fetch, current-rate calculation or backend/schema change. Fees are summed once per recorded row, excluding fully voided rows in line with the existing total. Adjusted items and reservation stages retain their recorded fees; quantity does not multiply a row's fee. The row hides for zero/missing fees and resets before loading another receipt.

The displayed Transaction Total remains the saved net value, which already includes the deduction. For the supplied QR example, the new row shows ₱1.20 while the total remains ₱118.80.

Validation:
- Four regression tests passed for saved rather than recomputed fees, multi-unit/multi-row aggregation, void/adjustment/reservation handling, fee-free receipts, and stale-value clearing without another request.
- Local Chrome checks at 1280px, 390px and 320px confirmed the row's visibility, right alignment above the total, readable mobile spacing, zero-fee hiding, and recorded aggregation. No real sales were made.
- ESLint, project validation, formatting and whitespace checks passed.
- Nearby history/payment tests: 18 passed and 9 existing history-fixture failures. Failed names match the baseline (missing assertAppRequest_ / hasManagerViewAccess fixture globals); no new failing names.

Release scope: Frontend/Modals/TransactionDetailsModal only, applied over a fresh remote dev baseline. Production is read for verification only.

Released as dev version 92. All 16 staged fee/payment tests passed. Direct verification confirms active version 92, immutable source matching the tested release, and unchanged production source/deployment hashes. Verification evidence: /private/tmp/yourstyle-transaction-fee-release/verification.json.
