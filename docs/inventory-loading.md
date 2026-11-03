# Inventory loading

## First display and session cache

The first Inventory request displays 50 matching rows and bundles the next two pages in that same response. Pages 2 and 3 enter the browser cache before page 1 appears, so they do not wait for the full background download or another server request. Each page is cached separately on the server and assembled into the initial bundle; only 50 rows are rendered at a time. The response also includes counts for the full filtered inventory and the first page of its three summary dialogs. The default exclusion remains **Exclude: Disabled**. Filtering and sorting become local after the compact download; text searches become local after detail preparation completes, so partial downloads never produce incomplete search results.

After sign-in or restoration of a saved session on reload, the browser starts downloading all compact inventory records sequentially in batches of up to 1,000, even when another page is open. Opening Inventory reuses that download or the completed dataset; it does not start another download. If preparation is still running, the first-page request remains available to show rows without waiting for every batch. The small **Preparing inventory…** indicator shows progress without blocking the displayed page. Records include disabled items so removing the exclusion works locally later. This first pass downloads table data. Once it completes, a second background pass preloads item details, including permitted costs, original prices and delivery information. Thumbnail URLs are cached as data; actual images load lazily when visible. Item history and generated reports remain on demand.

The completed dataset is retained in memory for the current login/tab session. It has no timed browser expiry. Category/status/exclusion filters, sorting, pagination and summary dialogs use this dataset, rendering at most 50 rows at once. After details preload, text search also uses this dataset. Only four recent filtered/sorted views are retained alongside the dataset to avoid accumulating every possible query. Hard browser reload starts a fresh download; logout clears the dataset and in-flight work before another account signs in.

The previous filter-choice and next-page preloading queues were replaced by this single full-dataset download. Browser and server use the same explicitly exported pure query/display functions. No authentication, supplier-cost readers or sheet-access functions are exported to the browser.

## Refresh and consistency

Inventory data revisions change after sales, reservations, deliveries, returns, inventory edits and relevant manual sheet edits handled by installed automation. Production-to-Dev sync invalidates the Dev revision separately. The revision no longer contains a time bucket: expiration of the server's five-minute performance cache does not expire a completed browser dataset.

Existing account-session checks also return the current inventory revision, without scanning Inventory. The browser checks in the background periodically, on focus and when returning to Inventory. A changed revision or successful local mutation invalidates derived views and starts another background download. While refreshing a completed cache, its previous snapshot remains usable with a **Refreshing inventory…** indicator; the replacement is swapped in only after all batches complete for one revision. Visible rows and open summaries then update together. A mutation during download restarts preparation against the newer revision rather than mixing versions. Repeated changes or a network error pause preparation and provide Retry.

The app and installed edit automation must invalidate the revision for writes. An external import or script that bypasses both must call `invalidateInventoryRead_()`; there is deliberately no timed browser reset to compensate for untracked external writes.

Display caches never authorize stock changes, payments or manager permissions. Checkout, edits and item-detail/cost reads still validate the current authenticated account and authoritative sheet data. Until a detected change finishes downloading, the existing snapshot may briefly display older values.

## Inventory actions

Edit opens its modal immediately with a loading indicator. Fields stay hidden and inert until complete item details arrive, so missing costs or original prices cannot be saved as blanks. Closing the modal or opening another item prevents a late response from reopening it. View immediately shows the selected name and photo while loading remaining details.

After the compact inventory download, all valid item details preload sequentially in batches of up to 200 physical sheet rows. Each batch reads a contiguous inventory range, reuses Product Master and legacy delivery metadata caches, and reads custom costs in one range when authorized. Costs are attached only for manager-view roles on the server. Duplicate barcodes are excluded from this cache so opening them still fails the authoritative single-item lookup. Preparation progress appears without blocking other pages; completion clears the indicator. A failed batch retries twice, then leaves already cached details usable and falls back to an on-demand read for missing items.

All preloaded detail records stay in memory for the current account and inventory revision; the previous 100-item cap and 15-second expiry are removed. View and Edit use these records synchronously once preparation finishes. Inventory invalidation and logout cancel pending batches and clear details, preventing late responses from another revision or account from repopulating them. Repeated single-item server reads also use a five-minute revision-keyed cache, with separate entries for manager and non-manager responses so cost information is never shared with non-manager reads. Once the full inventory dataset is ready, Change Item builds its choices locally instead of requesting the same products again. Save and stock-change authorization remain unchanged.

## Loading and stock display

Only the first inventory load in a session replaces everything below the header with a loading indicator and disables header actions. Before background preparation completes, uncached queries show loading only in the table. Once the dataset is complete, local filtering and pagination do not show a loader. Text search stays server-backed until detail preparation completes. Background refresh does not hide the table. A hard reload starts the initial loading behavior again.

Cards count positive units across complete matching groups. Inventory and summary rows preserve actual signed stock balances. Sale-price allocations remain separate rows without duplicating physical stock. Searching a barcode matches its group while calculating the group's stock from all non-excluded records.

Completed unique YourFinds items with zero or negative stock are treated as INACTIVE on reads. INCOMPLETE, RESERVED, RETURNED and CONVERTED keep their own statuses. New sales, reservation completions and exchange replacements also persist INACTIVE when they exhaust unique stock. An administrative note marks automatic disabling. Voids and exchanges restore availability only for automatically disabled items when stock becomes positive; manual status changes clear that marker. Historical records and shared size definitions are retained.

## Filters and search

Exclusions are checkboxes in a dropdown, allowing several statuses to be hidden together. Disabled starts checked for each new login. Converted and Returned are removed from filter choices; their stored records and history are preserved. Requests still accept a single legacy exclusion value as well as the new array.

Search combines with selected category, status, stock and exclusion filters. Each result must match the search and every selected filter, and must not match any checked exclusion. Status words are searchable without selecting their corresponding filter: for example, searching `incomplete` finds incomplete items within the current filters. Search matches every space-separated term across names, barcodes, sizes, categories, statuses, stock, prices, dates, delivery IDs and other item-detail values. Cost values are searchable only for roles with manager-view access. Search response caches are separated by this server-verified access level, preventing cost-based matches from leaking between roles.

While details are preparing, server searches build the complete search text from bulk inventory and metadata reads, caching it in bounded chunks. Once detail preparation finishes, the browser uses the same pure search-text builder and matching rules. No partial local search is shown while the detailed index is incomplete.

## Verification and limits

Lint, source syntax/include validation, direct-call permission coverage and diff whitespace checks were run. Automated tests, live UI verification and deployment were skipped as requested. No live speed improvement is claimed. Logs distinguish first-page server/response/render times; the progress indicator exposes background preparation separately.

The first uncached server page still reads the workbook. After downloading, browser memory grows with inventory size because the requested behavior retains every compact record and its item details for the session. Before detail preparation finishes or after a failed batch, an uncached action can still require a server read. Very large inventories may eventually need an indexed database. This change uses the existing Apps Script/Sheets architecture and adds no service or data migration.
