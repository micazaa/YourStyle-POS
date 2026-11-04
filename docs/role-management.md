# Role management

Permissions now come from the Employees **Role** column. Access Level remains part of existing usernames; changing a role does not rename the account or historical transactions. Supported roles are Owner, Manager, OIC and Cashier. Existing mixed-case roles remain valid.

## App controls

The sidebar's **Access Management** button opens approval history for Owners and Managers. The modal starts closed on reload and opens only when selected. OIC and Cashier accounts cannot open Access Management or read approval history. Owners also get Accounts and Permissions tabs. Owners can change an existing employee's role, reset their password, or deactivate/reactivate the account. Employee IDs, names and access numbers stay unchanged. The last active Owner with a valid login cannot be removed or demoted.

Account forms use an opaque record version. A stale form must reload before saving. Password fields start empty, are cleared after saving, and are never returned by account reads or written to approval history.

OIC retains manager viewing access, including transaction dates and inventory costs. Creating or changing products, adjusting stock, returning stock, distribution, voids, exchanges, dashboard task changes and report changes require Manager or Owner approval. OIC credentials cannot approve these actions or change accounts. Cashiers retain their existing receiving and incomplete-item completion flows; supplier returns, exchanges, voids, corrections and ending shifts require approval. Cashier inventory editing/deleting stays blocked.

An OIC can create the first Manager Daily Report for a selected Manager/Owner and report date without a PIN. Its Manager field lists active Managers and Owners; the selected account is validated again on the server. The PDF identifies the authenticated OIC in the header and Prepared by signature, and the selected Manager/Owner in Manager and Reviewed by. Selecting a reviewer does not count as PIN approval. Replacing an existing report for that reviewer/date still requires the selected reviewer's authorization. The existence check repeats under the report-write lock, so concurrent first downloads cannot silently overwrite a report. Existing Manager/Owner behavior and other OIC approval requirements remain unchanged. Approval Log records retain the actual requester and selected reviewer; Cash Report Log retains its existing reviewer/date identity and schema.

Owners and Managers approve their own management actions automatically. A cashier shift explicitly selecting a different verifying manager still checks that manager's credential. Normal sign-in has report and read-only Transaction History access on the cashier page. The History button sits beside Add Items, outside the disabled transaction controls. Transaction details remain readable, while receipt/item voids, exchanges and reservation completion buttons are disabled. Sales, reservations, exchanges and voids require a server-linked open cashier shift; the backend checks this before requesting approval. Browser role flags, supplied cashier names and supplied manager names cannot grant authority.

## Approval records

`Backend/AccessControl.js` holds the permission matrix, RPC registry, identity binding, approval checks and audit records. The frontend receives permission metadata during login and uses one shared transport. Existing public data/action functions reject direct unauthenticated RPC calls. Pure formatting helpers, login/session operations, sheet menus and installed automation triggers retain their appropriate entry paths.

An OIC approval preview binds one request to its employee session, complete action arguments and relevant current values. The preview expires after two minutes and can be consumed once. A changed item or changed request requires a fresh preview. Prompts show the action and requested changes. PINs and tokens are not stored in audit entries.

Management mutations create an **Approval Log** entry before running. Entries record requester, approver, timestamp, action, outcome, and relevant before/after state or saved delivery summary. Routine cashier sales continue using Sales Log rather than adding another audit write. Approval History shows the latest 100 entries. If the final audit update fails after an action succeeds, the action result remains successful, the entry remains STARTED, and the server logs its audit ID for reconciliation; repeating a completed stock or payment action would be unsafe.

## Sessions and rollout

Each session is bound to the current employee record and an account revision. Role/status/password changes made through Accounts invalidate all existing sessions for that account, including manager approval tokens, even if a role is later restored. Direct sheet changes are also checked against the saved employee record on subsequent requests. Access is rejected on the next server request; an idle browser discovers the change through its existing session monitor or when it regains focus.

Push backend and frontend together, then sign in again in all open app tabs. Older browser tabs calling direct RPC methods must reload. Existing session tokens without the new record binding expire. The Approval Log is created only when the first audited action runs. No employee or transaction data is deleted during rollout.

Existing spreadsheet menu and trigger names stay unchanged. Sheet menus establish their trusted container context; installed automation verifies its trigger identifier before running. These are separate from web-user permissions. Spreadsheet editors remain trusted to edit their workbook directly. Google documents the [bound spreadsheet UI context](https://developers.google.com/apps-script/guides/bound) and [private server functions](https://developers.google.com/apps-script/guides/html/communication#private_functions).

Linting and source syntax/include checks were run. Automated tests, live UI checks, and deployment were skipped as requested. Existing tests that call protected functions directly need authenticated fixtures before the full push gate can pass; the gate was not disabled.
