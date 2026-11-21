# Sales chart tooltip

Implements the approved inline preview in the existing Chart.js graph. A soft theme-token panel displays a date header and Category, Units, Net sales columns, with category-color dots and both totals aligned in a single footer row. PHP amounts show two decimals. There is no duplicate sales headline.

The external tooltip reads the real cached activity bucket and selected category checks rather than summing tooltip datasets, which prevents counting the net-sales line twice. Hourly titles include the date and time; weekly titles use the aggregated bucket range. Updating the chart replaces its tooltip closure so a newly chosen date never reuses the previous points. The panel hides when the chart rerenders, is scrolled horizontally, has no selected categories, or the chart tooltip closes. Placement accounts for canvas scroll offset and clamps to the visible frame. Uses the project's current surfaces and status tokens, with narrower spacing on small containers. No backend calls or schema changes.

48 focused tests pass, including real category sales/units, zero and negative amounts, selected-category totals, hourly and weekly headings, updating the existing Chart.js instance, edge clamping, and existing graph/mascot/filter/navigation behavior. Lint, syntax/include validation, formatting and whitespace checks pass. Browser visual verification was unavailable; no rendering claim is made. The 21st CLI is unavailable; the approved user preview and existing project/Chart.js primitives ground the implementation.

Release stages from dev v61 and changes only Frontend/Pages/DashboardPage. All unrelated local work is excluded. Evidence: `/private/tmp/yourstyle-sales-tooltip-release`. Production and Sheets are unchanged.

Released on **dev version 62**, verified active. All 89 immutable sources matched the staged release. Production source hashes and deployment records remain unchanged on **version 21**.

## Approved compact revision

The follow-up preview is content-fitted rather than 360px wide, with 10px padding, 6px column spacing, 12px text, 10px corners and a soft bottom pointer. The date header omits the icon/year. Whole-peso formatting applies only to tooltip display; raw sales arrays and calculations retain precision. Categories with both zero units and zero sales are omitted; refunds and other nonzero sales remain visible even with zero units. Both totals remain in their columns. The entire sales column has an 8px right inset, leaving pink space after its footer value while preserving alignment.

Positioning now permits a negative top offset relative to the plot so the tooltip can actually appear above the hovered point. Its top is clamped only to the viewport edge, and its pointer tracks the point when horizontal position is clamped. No backend/API/Sheets changes.

50 focused tests pass, including above-plot placement/caret, zero-activity filtering, refunds, display rounding without data mutation, and existing chart/cache/filter/navigation tests. Lint, syntax/include validation, formatting and whitespace checks pass. No browser visual verification was performed. Staged from dev v62, changing only DashboardPage. Evidence: `/private/tmp/yourstyle-compact-tooltip-release`.

Released on **dev version 63**, verified active with all immutable sources matching the staged release. Production source hashes and deployment records remain unchanged on **version 21**.

## Semi-transparent background — November 19

The tooltip panel, caret and pink footer backgrounds now mix their existing theme token with transparent at 85% opacity. Text and category indicators keep their existing colors. Only three background declarations change; sizing, placement, values and interactions are preserved. All seven tooltip tests, syntax/include validation and whitespace checks pass. No browser visual verification was performed. Staged from dev v63; production and Sheets remain unchanged. Evidence: `/private/tmp/yourstyle-transparent-tooltip-release`.

Released on **dev version 64**, verified active with matching immutable sources. Production sources and deployments remain unchanged on **version 21**.
