# Cashier shifts and petty-cash handovers

Cashier logout offers **Pause shift** and **End shift**. Ordinary staff logout remains a simple sign-out.

- Pause: count petty cash, supply a voucher number and explanation if it differs, then select Save handover & pause. The return is immediately recorded in Petty Cash Handovers before sign-out; there is no additional confirmation checkbox. The cashier retains sales cash. No sales-cash tally or final PDF is required.
- Resume: confirm the latest available petty cash and continue the same report, including its accumulated sales. A shift tracked by the handover log can resume after midnight until it is ended.
- End: select an active verifying manager from Employees, count petty cash and all sales cash retained during the shift, and obtain that manager's PIN/session verification. Choosing another manager prompts for their PIN even when the cashier is a manager. The verified name is recorded on the report. Save the report, close the shift, and sign out. PDF generation failure does not undo a saved report; use Regenerate Report later.

Same cashier + same report date uses the same Report ID. Starting cashier work again after End shift reopens that day's report rather than creating another row. Its saved cash count and remarks remain visible. The next End shift is an updated full-day cash count, including the amount already recorded; the form prefills that amount and explains this. Earlier END handovers remain in the audit log. Once a report is closed, starting on the next day creates a new report. Existing duplicate rows from older versions are preserved, not merged or deleted.

The End shift form shows today's closing date in Manila time automatically, with no date picker or past-report link. It still closes the active report by ID and preserves its original shift start, including overnight shifts. Historical reporting remains available through the existing reports workflow.

`Petty Cash Handovers` is created automatically on the first cashier start using this workflow. It records RECEIVE, PAUSE and END events, denomination counts, voucher details, request IDs and an END recovery snapshot. Tokens and passwords are never stored there. Do not rename or reorder its columns.

`Cash Report Log` keeps its existing 37 columns. A report remains OPEN while paused; the handover log records the PAUSED state. Closing petty totals add the receipts and PAUSE/END returns of every segment, so a balance received again does not create a false variance. Legacy totals are retained in the first reopening snapshot. The last handover's actual returned amount supplies the next cashier, rather than the sum displayed on the report. Sales reports and regenerated PDFs use the report's original start and latest end times.

Only one cashier can hold petty cash at a time. A different cashier must wait for the current holder's handover. A stale confirmation requires reloading and recounting the latest amount. Retrying a saved exit uses the same request ID and does not create another handover. A request from before a later resume/reopen is rejected without changing the row. Only the latest END snapshot can repair a failed close, so earlier snapshots cannot undo reopened work. A saved RECEIVE repairs an interrupted reopen on the next sign-in/context reload.

## Deployment and rollback

Deploy the backend and frontend together to dev and reload open app tabs before testing. Existing report rows are preserved. When there is no handover history, the latest closed cashier/initial-petty report supplies the opening balance. Old prior-day OPEN records remain available for reconciliation, while same-day open records are adopted when the cashier signs in.

Before rolling back to a version that does not read the handover log, finish/reconcile every active or paused shift and record the latest physical petty-cash balance in the legacy opening/closing record. Keep the handover log for audit; do not delete it. Rolling back while a paused handover is outstanding would make the old login code read an outdated opening balance. Before rolling back only the daily-reopen behavior, close any reopened daily report using the updated backend first; earlier backends do not include prior END petty returns in their totals.

Automated coverage: `tests/cashier-shift-handover.test.cjs` and `tests/cashier-logout-ui.test.cjs` cover alternating cashiers, same-day reuse, next-day creation, saved-count prefilling, manager verification, failed saves/reopens, stale retries, legacy totals and PDF failure.
