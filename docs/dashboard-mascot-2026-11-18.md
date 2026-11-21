# Dashboard sales empty state

Implements the approved in-chat empty-state layout and the follow-up instruction to use all mascots through daily rotation. The chart card stays full height alongside the three sales metric cards. The mascot renders at the selected **240px** size with the approved morning/afternoon copy. The chart-specific legend/caption stays hidden while the mascot is displayed.

The 20 image IDs come from the supplied MASCOT folder `1hASnwrN1EiQa0oEhC_42PM1Lw5boBdr_`, ordered from `01-happy.png` through `20-determined.png`. One image is selected per **Asia/Manila calendar day** on a repeating 20-day cycle, anchored to November 18, 2026. The image stays consistent throughout the day; the encouraging message changes at noon. Historical or multi-day empty ranges use neutral period copy. Unchecking all categories gives the existing category-selection prompt.

The existing Drive thumbnail pattern delivers a small `w480` image. The selected image preloads while the existing dashboard request runs and is reused on rerenders. The in-memory preload pool is capped at two images; the other 19 full-resolution files are not downloaded upfront. The public thumbnail endpoint was checked and returned HTTP 200, image/jpeg, 32,521 bytes. No image is generated, altered in Drive, moved or re-shared. No new backend calls, sheet columns, data writes or production changes are needed.

The mascot appears only for a completed zero-activity result. Loading/unavailable sales and chart-library failures retain their distinct existing behavior. Any sales or units activity restores the real chart. A single minute timer updates visible empty-state copy/daily selection; it stops when the empty state ends, including logout. Browser visibility changes refresh the daily selection without sales refetches. Image failure keeps the message visible rather than showing a broken image.

Reused the existing dashboard card, category filter, chart and date controls. A small `DashboardMascot` script is included before the Dashboard page only when the dashboard is enabled. This keeps the approved UI and no-sales behavior inside the existing Apps Script/Bootstrap flow, without a new package or generated component. The 21st CLI is unavailable in this workspace; the user-selected design and existing project primitives ground this change.

Verification: 39 focused tests pass across mascot rotation/Manila midnight, caching, morning/afternoon copy, historical dates, category prompts, real-chart restoration, sales/chart errors, workspace navigation and shared retail UI. Lint, syntax/include validation, formatting and whitespace checks pass. No signed-in browser screenshot check was performed.

The dev-only release is staged from the remote version 50 snapshot, changing only Frontend/Index, Frontend/Pages/DashboardPage and adding Frontend/Scripts/DashboardMascot. Unrelated local inventory and raster-asset work is excluded. Release evidence is under `/private/tmp/yourstyle-sales-mascot-release`.

Released on **dev version 51**, verified active. All 68 immutable source files matched the staged release. Production source hashes and deployment records remain unchanged; production stays on **version 21**.

## Transparent 180px correction

The follow-up screenshot exposed Drive's thumbnail conversion: `thumbnail?...&sz=w480` returned JPEG and flattened the transparent source onto black. Both happy and sad source PNGs were verified to have RGBA alpha with a fully transparent top-left pixel. Resized googleusercontent PNG output was also opaque, so the dashboard now requests the original via `https://drive.google.com/uc?export=view&id=...`. The original transparent image is reused by the existing preload cache; only the daily selection is fetched. This preserves the supplied artwork without editing files or sharing in Drive.

The mascot's HTML dimensions and CSS width are now 180px. The supporting copy uses the available card width instead of a 340px text box, allowing the sentence through “win” on one line where space permits, with natural wrapping on narrow screens. Daily rotation and all chart/loading/filter behavior are preserved. No sheet changes are needed.

The dev release is staged from the remote version 51 snapshot, changing only Frontend/Pages/DashboardPage and Frontend/Scripts/DashboardMascot. Evidence is under `/private/tmp/yourstyle-mascot-transparent-release`.

Released on **dev version 52**, verified active. All 68 immutable source files matched the staged release. The 39 focused tests, lint, syntax/include validation, formatting and whitespace checks pass. Original happy and sad PNG endpoints returned HTTP 200 and preserved transparent pixels. No signed-in browser screenshot check was performed. Production source hashes and deployment records remain unchanged on **version 21**.

## Missing image and oversized empty card correction

The follow-up screenshot showed the original Drive URL failing in an embedded browser image, while the image error handler hid it and left its space reserved. HTTP-only checks had not proved browser embeddability. Runtime Drive image delivery is now removed: the supplied original PNGs are resized to 180px with alpha preserved and bundled as HTML text assets. The backend allowlists the 20 IDs and includes only today's small PNG data URI when evaluating the page template. A day rollover requests the selected bundled image through Apps Script once and reuses it in memory; arbitrary file IDs/paths are rejected. There are no external image requests, Drive reads or sharing changes for dashboard mascots.

The empty-state flex growth and full-column stretch were removed. It now uses a 360px minimum content height on desktop and phones. The supporting sentence still uses the available card width. The previously chosen 180px mascot size is retained.

Verification: 41 focused tests cover the existing dashboard behavior, single-request rollover and retry, all 20 bundled PNG dimensions/alpha, default server selection and rejection of unapproved IDs. Lint, syntax/include validation, formatting and whitespace checks pass. Browser network verification was blocked by automatic approval review's usage limit; no in-browser rendering claim is made.

Release stages from the remote version 52 snapshot, changing only DashboardPage, DashboardMascot, the Index bootstrap, the new allowlisted artwork helper and its 20 bundled data assets. Unrelated local work is excluded. Evidence: `/private/tmp/yourstyle-mascot-inline-release`. No sheet changes.

Released on **dev version 53**, verified active. All 89 immutable sources matched the staged release. Production source hashes and deployment records remain unchanged on **version 21**. All 20 resized PNGs also passed transparent-corner verification.

## Sad mascot after noon

The user clarified that 10 PM with no sales should show a sad mascot. Daily rotation had overridden the original time-based emotion. The client and initial server selection now both choose the sad image from noon through 11:59 PM in Asia/Manila; before noon the 20-day rotation remains. The existing minute refresh and visibility refresh update an already-open dashboard. No layout, asset, sheet or production changes. Tests cover 11:59:59 AM, noon, 10 PM and midnight, plus server/client image agreement at 10 PM. All 41 focused tests and project checks pass. Release evidence: `/private/tmp/yourstyle-mascot-time-release`.

Released on **dev version 54**, verified active with matching immutable sources. Production source hashes and deployment records are unchanged on **version 21**.
