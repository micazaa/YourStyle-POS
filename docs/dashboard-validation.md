# Dashboard validation — 2026-09-24

Implemented on `dashboard` from `d4496dc`. The fetched branch and local checkout did not contain the handover's uncommitted draft, so this implementation was built from the existing application.

Local validation: `npm run check`, `node --test tests/*.test.cjs` (52 passing), and `git diff --check`. Tests cover report parity, cross-date exchanges, void exclusions, distinct receipts, ranges and store midnight, session revocation/demotion, redacted leaderboard ties, inventory grouping, task permissions and optimistic concurrency, and stale frontend responses.

Browser verification used the actual application templates with mocked Apps Script responses at 1440×1000 and 390×844. Checked manager task creation, comparison and product filters, cashier status changes and rank privacy, keyboard sidebar collapse, mobile drawer, reminder drill-down, editor sizing, and action footer placement. Fixed mobile chart overflow and collapsed Petty Cash wrapping. This does not validate real Sheets writes, live sessions, printing, or Google Apps Script integration.

No merge into main or Apps Script deployment was performed. After an authorized deployment, existing users must sign out and sign back in to receive a dashboard session. Dashboard sessions expire after six hours (or earlier cache eviction). Analytics preserve the report's name-based historical cashier attribution; historical profit is intentionally excluded. Inventory reminders always use current stock. This work is **not passed/frozen** until the checklist below is confirmed live.

## Live regression checklist

- [ ] Manager can select valid periods and presets; cashier is restricted to today, including direct backend requests and the store's midnight boundary.
- [ ] Net sales, positive units, receipt count, and exchange adjustments match existing reports; item voids and cross-date exchanges are handled correctly.
- [ ] Zero-sales periods, tied leaderboard ranks, category charts, best-seller filters, and YF size/product grouping display correctly.
- [ ] Cashier cannot receive another cashier's detailed leaderboard amounts under the default policy; manager can view them.
- [ ] Managers can create/edit/assign/delete tasks; cashiers can change only their assigned/shared task statuses.
- [ ] Tasks survive refresh and date changes; completion records are correct; stale concurrent edits are rejected without data loss.
- [ ] Incomplete/low-stock/sold-out reminders open the correct inventory view.
- [ ] Sidebar empty-space and keyboard toggles work; icons navigate without toggling; mobile navigation remains usable.
- [ ] Petty Cash displays the correct shift amount clearly after login, refresh, and account changes.
- [ ] Void and Exchange stay centered at the bottom of Add Items and retain their existing behavior.
- [ ] Inventory/Delivery navigation stays centered and sticky and remembers its active tab.
- [ ] Logout removes stale/private dashboard state; expired sessions prompt re-login; late responses do not leak data into another session.
- [ ] Reports, checkout, inventory edits, delivery acceptance, and label printing retain their existing behavior.
