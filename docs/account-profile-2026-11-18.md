# Account profile

The approved compact profile preview/editor is a dev-only release. The sidebar avatar opens a real account preview. Personal details and a masked password row are on the left; photo, display name, username, employee ID, role and hire date are on the right. Full profile data is fetched on first open and cached in memory for the signed-in session. Login includes only the display identity and small photo for immediate sidebar rendering.

Editable: profile full name, display name, email, birthday, contact number, address, optional emergency contact name/relationship/number, and photo. Username, employee ID, role and date hired are read-only. Date hired can be populated by an authorized sheet editor; an unknown date displays “Not added.” No sample dates or personal details were inserted.

Profile full name is separate from Employees First Name/Last Name. Editing a profile never renames a login username, cashier identity, past report or transaction. The photo is center-cropped/resized to a small JPEG and stored in the employee profile cell, with a 40,000-character bound. Only JPEG data is rendered; arbitrary sheet URLs are ignored.

## Sheet expansion

Both spreadsheets were inspected before editing. Employees A:H matched the existing identity/login schema; I:U was empty through row 999. Only I:U was expanded, without inserting/reordering columns or changing existing employee values:

| Column | Header |
| --- | --- |
| I | Profile Full Name |
| J | Display Name |
| K | Email |
| L | Birthday |
| M | Contact Number |
| N | Address |
| O | Emergency Contact Name |
| P | Emergency Contact Relationship |
| Q | Emergency Contact Number |
| R | Date Hired |
| S | Profile Photo |
| T | Profile Updated At |
| U | Profile Version |

Dev: `1xnHBsGsoMmcBIoRwEjX0paf5R39A-s2Tnc6m1lkoOQU`, Employees sheet ID `1806881385`.
Prod: `1PXY61BjpfR9cuubzPOKCBOSj2DgAfkiXCqbFIrIw_9c`, Employees sheet ID `1399217389`.

The existing header style was copied to the new headers. Text formats, clipping and 165px widths apply only to the added columns. Header readback confirmed the same schema in both workbooks. Production code remains on version 21; its existing A:G readers ignore the added columns. Rollback can restore dev code version 44 while leaving the additive profile columns and any saved profile data in place. Do not remove them or restore old employee rows over newer data.

## Authentication and data handling

All three profile endpoints are registered with `profile.own` and require the authenticated API gateway. The server derives the target employee from the session, rechecks the current fingerprint under the write lock, allowlists writable fields and ignores forged IDs, roles, usernames and hire dates. Profile Version prevents overwriting a newer edit. Personal contact values are not stored in the browser session or audit log; in-memory values are cleared at logout.

Change password requires the current password and matching new/confirmation fields of 12–128 characters, with no surrounding spaces. It uses the existing credential storage contract and changes the account revision, invalidating all prior session fingerprints. The current session is revoked, and the UI signs out. It does not end the cashier shift. Password fields are cleared on cancellation, logout and submission completion/failure; they are never sent to profile caches, session storage or logs.

## Verification

- Eight backend profile tests cover own-account reads, identity preservation, read-only/forged fields, stale versions, invalid dates/email/photo inputs, literal sheet text, current-password checks, credential invalidation and expired sessions.
- Six shared retail UI tests pass. Lint, project syntax/include validation and format checks pass.
- DOM integration exercises initial loading and caching, the left password row, live editing, saving and disabled controls, password errors and clearing, session privacy, logout and reopening as another employee.
- Five existing account-session harness tests fail because their isolated context omits existing dependencies (`defaultWorkspacePage`, `secureScriptRun`, `resetWorkspacePreload`, `matchMedia`). The AppJS source exercised by those tests is byte-identical to dev version 44 and is outside this release.
- This check does not claim browser screenshot or actual mobile-device verification.
- An anonymous fetch of the live dev URL redirected to Google sign-in. Signed-in live interactions were therefore not verified; the DOM checks and immutable release/source checks above are the available evidence.

Deployment is staged from the remote dev snapshot with only seven profile-related files changed/added. All other remote source files are preserved. The release tool checks immutable version source hashes before activation and verifies production source and deployment records are unchanged afterward. Snapshots and deployment evidence are kept under `/private/tmp/yourstyle-profile-release` for this session.

Released to the existing dev deployment as version **45**, with all 66 immutable source files verified against the staged release. The active dev deployment reports version 45. Production source hashes and all deployment records match the pre-release snapshot; live production remains version **21**.

## Drive photo storage update

The user selected Drive folder `1XiSl0YzkEPBEM4Vp2Q9iibhdmLdX1xkn` for profile photos and explicitly requested keeping its current sharing after being informed that anyone with the link can edit. No folder or file permissions are changed by this feature.

Employees column **V: Profile Photo File ID** was added identically to dev and prod. The original **S: Profile Photo** remains as a legacy read fallback; new saves store image bytes in Drive, place only the file ID in V, and clear S. Original identity, credentials and other profile values remain unchanged. Existing inline images take precedence during mixed-version execution, so a late version-45 request cannot hide a newer photo behind an older Drive ID.

Images retain the approved 192×192 JPEG format. They are read server-side and cached for six hours by spreadsheet ID, employee ID and file ID. No expiring thumbnail links or public image URLs are stored in Sheets or loaded by the browser. Drive files use spreadsheet/employee/content-hash names to prevent cross-environment collisions and reuse successful uploads on retry. Only JPEGs under 30 KB in the selected folder and matching the employee namespace are served. Metadata-only profile saves retain existing photo IDs even if the photo is temporarily unavailable. Replacing/removing a photo updates the reference; earlier files are retained for recovery.

Migration found one dev photo and no prod photos. The dev photo was uploaded using the existing bytes, then verified through the connected Drive account against its source checksum and destination folder. The clasp OAuth credential could not read Drive directly (HTTP 403); the existing Apps Script project already uses the Drive service for product photos and reports. The inline source is retained until the new dev deployment is active; migration then writes V and clears S in the same narrow Sheets batch after checking the current photo/version. If the row changed during staging, migration stops instead of overwriting it. No profile photos are copied across dev and prod.

Rollback to code version 45 requires restoring referenced JPEG bytes from Drive into S first. The task snapshot includes the original inline photo and profile version under `/private/tmp/yourstyle-photo-drive-release`; Drive files are not deleted. Added V headers may remain safely in either sheet because legacy readers ignore them.

Validation: all 16 profile/backend tests and six retail UI tests pass; DOM integration, lint, syntax/include validation, formatting and whitespace checks pass. Photo-specific cases cover Drive storage, legacy fallback, caching, retry reuse, unchanged photos, removal, folder/employee isolation, upload failures and late inline writes during rollout. The release stages only three affected source files on top of remote dev version 45 and verifies the immutable release before activation.

Released as **dev version 46**, with all 67 source files matching the staged immutable release. Active dev version 46 was verified. Production source hashes and deployment records are unchanged; live production remains **version 21**. The one dev photo (4,814 JPEG bytes) is now in the requested Drive folder, its V reference is saved, and its inline S value is cleared. Readback verified matching V headers in both sheets. Production has no photo records to migrate. The original image bytes, version, checksum and migration evidence are preserved in the task snapshot directory.

## Account preview loading fix

The first preview previously started `getMyProfile` only after clicking the avatar and hid the entire form until the RPC completed. Closing a pending preview discarded its result, so reopening could repeat the same work. Login already read the employee row and resolved the photo but returned only the display identity.

New sign-ins explicitly opt in to returning the complete authenticated profile from that existing login row, including cashier sign-in. This adds no second employee-sheet read for preview. `preloadAccountProfile` consumes and removes the transient `accountProfile` field before normal session serialization, keeping contact, birthday and address values in memory only. Old clients do not opt in and continue receiving the previous minimal login response.

Restored sessions start a background profile read from the sidebar/session initialization. Opening the modal renders the known account identity immediately while personal details load; editing/password buttons wait for the complete record and version. Repeated clicks share one request. Closing the modal leaves the safe background read running so its result is available on reopening. Logout/account switching invalidates earlier responses and clears the cached personal values. Errors keep the known identity visible and can retry on reopening. Existing save/version/password safeguards are retained.

Verification: 29 focused tests pass, including zero extra RPCs for a login-seeded preview, one shared read for restored sessions, closing/reopening during a read, retry after failure, account isolation, memory-only personal values, and reuse of the single authenticated employee read for normal/cashier login. DOM integration additionally verifies the visible form, loading placeholders, disabled edit controls, close/reopen and error states. Lint, include/syntax validation, formatting and whitespace checks pass. No sheet data/schema changes are required. Signed-in live latency was not measured; the proof is removal of the click-time RPC for new sign-ins and nonblocking/deduplicated reads for restored sessions.

The release stages only five related files from a remote dev version 48 snapshot. Unrelated local inventory edits are excluded. Deployment evidence is under `/private/tmp/yourstyle-profile-speed-release`.

Released as **dev version 49**. All 67 immutable source files match the staged package and active dev version 49 was verified. Production source hashes and deployment records remain unchanged; production stays on version 21.

## Profile photo preview polish

The account preview avatar now matches edit mode (104px desktop, 72px phone), with a 1px existing border-color token on both the profile photo and sidebar avatar. The preview photo is a labeled native button only enabled for a rendered photo in preview mode. It opens the existing native image viewer with the cached data URI and a responsive maximum viewing width of 420px; closing clears the viewer copy. It does not fetch Drive or modify photo storage.

40 focused account-cache, viewer, navigation and shared-dialog tests pass, together with syntax/include validation and whitespace checks. No browser rendering verification was performed. Release evidence: `/private/tmp/yourstyle-profile-photo-preview-release`; only AccountProfileModal is staged from remote dev v56. No sheet changes or production code changes.

Released on **dev version 57**, verified active with matching immutable sources. Production source hashes and deployment records remain unchanged on **version 21**.
