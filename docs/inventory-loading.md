# Inventory loading

The Inventory table and summary dialogs return at most 50 rows per request. Search, category/status/exclusion filters, and sorting run over the complete cached inventory index before pagination. Sale price allocations remain separate table rows, and their row counts include every allocation. Change Item uses its own stock-product lookup rather than the visible page.

The main table fetches only the fields it displays. Item details, supplier cost, original price, dates and delivery metadata load when opening or editing an item. Costs are returned only after the authenticated account's manager-view permission is checked. The shared server list cache contains no supplier costs or account credentials. Thumbnails load lazily at a smaller size; image viewers retain the original URL.

Fresh index construction reads raw Inventory A:O once and displayed barcodes once, preserving leading zeros. Product Master uses a compact read without formatting created/updated dates. Opening inventory no longer creates or repairs missing stock rows. Product saves and receiving retain responsibility for creating inventory records.

The server index uses small cache chunks and a workbook-specific data revision. Inventory, product, delivery, return, reservation and sales mutations invalidate the revision. Installed edit automation also invalidates manual Inventory/Product Master/movement edits; manual sales processing invalidates after changing stock. Production-to-Dev sync invalidates Dev separately. A one-minute version window bounds cached data when external changes do not fire installed triggers. Browser pages and item details are session-isolated, bounded, and invalidated after successful writes. Revisiting a recently loaded page reuses it immediately; later visits revalidate without clearing visible rows. Checkout and edits do not use cached stock to authorize writes.

Cards are calculated from all matching groups, separately from the returned page. Summary unit totals count positive balances; table and summary rows preserve signed stock values. A barcode search matches a group but still calculates that group's stock from all of its non-excluded records.

## Sold YourFinds

Completed unique YourFinds items with zero or negative stock are treated as INACTIVE on reads, including existing historical rows. INCOMPLETE, RESERVED, RETURNED and CONVERTED keep their own statuses. No history is deleted and old rows are not bulk-rewritten on page load.

New sales, reservation completions and exchange replacements that exhaust unique YourFinds stock also persist INACTIVE in Inventory. An administrative cell note marks automatic disabling. A void or exchange that restores positive stock reactivates only automatically disabled items; explicit manual status changes clear that marker. Reservation and exchange rollback paths restore the prior status note. Shared size definitions in Product Master remain unchanged.

The exclusion defaults to **Exclude: Disabled** on each login. Select **Exclude: None** to include disabled items, including sold rows and their true negative balances. Filters and pagination remain in place when navigating away and back during that session.

## Verification and limits

Lint, source syntax/include validation, direct-call permission coverage, and diff whitespace checks passed. Tests, live UI verification and deployment were skipped as requested. No live latency claim is made. Server logs emit `inventory_list_index` with row count/build time and `inventory_page` with matched/returned counts and elapsed time, allowing comparison after upload.

A cold index still reads the workbook. These changes bound browser work and response size and reuse warm server data; they do not make Sheets an indexed database. Very large datasets may eventually require a dedicated database or a separately maintained search index.
