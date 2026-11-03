# Inventory loading

## First display and session cache

The first Inventory request displays 50 matching rows and bundles the next two pages in that same response. Pages 2 and 3 enter the browser cache before page 1 appears, so they do not wait for the full background download or another server request. Each page is cached separately on the server and assembled into the initial bundle; only 50 rows are rendered at a time. The response also includes counts for the full filtered inventory and the first page of its three summary dialogs. The default exclusion remains **Exclude: Disabled**. Search and sorting stay server-backed until the full background download is ready, so partial downloads never produce incomplete search results.

After the first page renders, the browser downloads all compact inventory records sequentially in batches of up to 1,000. The small **Preparing inventory…** indicator shows progress without blocking the displayed page. Records include disabled items so removing the exclusion works locally later. Only table data is downloaded: costs, original prices, detailed dates and history remain on-demand reads. Thumbnail URLs are cached as data; actual images load lazily when visible.

The completed dataset is retained in memory for the current login/tab session. It has no timed browser expiry. Search, category/status/exclusion filters, sorting, pagination and summary dialogs use this dataset, rendering at most 50 rows at once. Only four recent filtered/sorted views are retained alongside the dataset to avoid accumulating every possible query. Hard browser reload starts a fresh download; logout clears the dataset and in-flight work before another account signs in.

The previous filter-choice and next-page preloading queues were replaced by this single full-dataset download. Browser and server use the same explicitly exported pure query/display functions. No authentication, supplier-cost readers or sheet-access functions are exported to the browser.

## Refresh and consistency

Inventory data revisions change after sales, reservations, deliveries, returns, inventory edits and relevant manual sheet edits handled by installed automation. Production-to-Dev sync invalidates the Dev revision separately. The revision no longer contains a time bucket: expiration of the server's five-minute performance cache does not expire a completed browser dataset.

Existing account-session checks also return the current inventory revision, without scanning Inventory. The browser checks in the background periodically, on focus and when returning to Inventory. A changed revision or successful local mutation invalidates derived views and starts another background download. While refreshing a completed cache, its previous snapshot remains usable with a **Refreshing inventory…** indicator; the replacement is swapped in only after all batches complete for one revision. Visible rows and open summaries then update together. A mutation during download restarts preparation against the newer revision rather than mixing versions. Repeated changes or a network error pause preparation and provide Retry.

The app and installed edit automation must invalidate the revision for writes. An external import or script that bypasses both must call `invalidateInventoryRead_()`; there is deliberately no timed browser reset to compensate for untracked external writes.

Display caches never authorize stock changes, payments or manager permissions. Checkout, edits and item-detail/cost reads still validate the current authenticated account and authoritative sheet data. Until a detected change finishes downloading, the existing snapshot may briefly display older values.

## Loading and stock display

Only the first inventory load in a session replaces everything below the header with a loading indicator and disables header actions. Before background preparation completes, uncached queries show loading only in the table. Once the dataset is complete, local filtering and pagination do not show a loader. Background refresh does not hide the table. A hard reload starts the initial loading behavior again.

Cards count positive units across complete matching groups. Inventory and summary rows preserve actual signed stock balances. Sale-price allocations remain separate rows without duplicating physical stock. Searching a barcode matches its group while calculating the group's stock from all non-excluded records.

Completed unique YourFinds items with zero or negative stock are treated as INACTIVE on reads. INCOMPLETE, RESERVED, RETURNED and CONVERTED keep their own statuses. New sales, reservation completions and exchange replacements also persist INACTIVE when they exhaust unique stock. An administrative note marks automatic disabling. Voids and exchanges restore availability only for automatically disabled items when stock becomes positive; manual status changes clear that marker. Historical records and shared size definitions are retained.

## Verification and limits

Lint, source syntax/include validation, direct-call permission coverage and diff whitespace checks were run. Automated tests, live UI verification and deployment were skipped as requested. No live speed improvement is claimed. Logs distinguish first-page server/response/render times; the progress indicator exposes background preparation separately.

The first uncached server page still reads the workbook. After downloading, browser memory grows with inventory size because the requested behavior retains every compact record for the session. Very large inventories may eventually need an indexed database. This change uses the existing Apps Script/Sheets architecture and adds no service or data migration.
