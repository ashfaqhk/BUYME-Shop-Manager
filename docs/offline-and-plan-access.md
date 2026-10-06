# BUYME plans, offline data and PDF reports

## Basic to Full

Click **Basic plan**, then **Request Full access**. This records a request; it does not grant access automatically. The company administrator signs in using the configured, verified company email, opens **Seller access**, searches for the seller's email, and selects **Approve Full**. The seller can use **Check status** or **Sync now**; periodic refresh also updates access without reloading the workspace.

Approved sellers can choose Basic or Full from the same plan control. This changes the interface preference, not approval, and preserves the same catalog, sales, stock and payment profiles. Basic checkout does not create individual invoice/receipt PDFs or payment QRs. Both versions provide Settings and Insights data reports.

The administrator can downgrade a shop to Basic or pause/restore its access. Changes apply to every member of that shop. Pausing does not delete data. Paused accounts cannot save, upload images, invite members or retrieve cloud shop contents; the account page returns only access metadata.

## Device and Supabase copies

Open and sign in online once on each device. Saved catalog, sales and settings are kept in account-scoped IndexedDB before a cloud sync is attempted. Offline edits remain pending across reopening the app. A recorded payment and its stock adjustment are one device-storage transaction.

The published build precaches the application shell. Development preview intentionally does not install this production service worker. A fully offline cold startup requires the published shell to have been downloaded previously, plus the account's saved device data. Offline startup does not require downloading Clerk's SDK. Reconnecting returns to signed-in authentication before cloud writes.

Sync occurs after saving, when internet returns, on focus/visibility changes and periodically while BUYME is open. Unsynced changes are reconciled with the last acknowledged cloud snapshot and the current Supabase revision:

- Independent changes are combined.
- Concurrent added bills and dated payment entries are retained.
- Conflicting field edits or deletions require an explicit device/cloud choice.
- The device snapshot and last conflict cloud snapshot are retained in IndexedDB before a conflict choice.
- A stale cloud revision causes a retry, not a destructive reload.

Only one tab per signed-in account can edit this device's saved shop at a time. Close the other tab and reopen if the lock warning appears.

The banner distinguishes device saving, pending sync, confirmed cloud saving and failures. Do not clear browser storage, uninstall the browser, or clear app data while changes are pending. Device storage is browser-managed; persistent-storage permission is requested where supported but cannot be guaranteed.

Offline access uses the last confirmed approval/access status. An administrator cannot instantly revoke access on a device with no connection. Access is checked again before cloud syncing; paused device changes remain preserved.

Uploaded JPEG, PNG and WebP image contents are stored in Supabase as well as private image records. Identical upload retries have the same shop-scoped content ID. This device also downloads account images for offline display. Existing App Storage images are copied to Supabase without removing the originals. The additive preparation and source-copy commands are:

```sh
node lib/db/scripts/add-shop-access.mjs
pnpm --filter @workspace/scripts exec tsx ../artifacts/api-server/scripts/mirror-shop-images.ts
```

These use configured secrets, do not print connection credentials, and are safe to rerun. They are deliberate operator actions, not automatic post-merge schema pushes.

## PDF data reports

In **Settings → Download your shop data**, select:

- One day: today.
- One week: the last 7 local calendar days including today.
- One month: the last 30 days including today.
- One year: the last 365 days including today.

In **Insights**, the same recent windows plus yesterday, short windows, this calendar month and custom inclusive dates are available. Select a period and click **Download PDF**. If a mobile/embedded browser does not start the download, use **Open PDF**, then Save or Share in the viewer.

Reports are generated entirely on the device, including when offline. They contain the local date range, source/sync status, sales and item details, payments received within the period (including collections on older bills), GST/discount summaries, current outstanding and the current catalog/stock snapshot. Empty periods produce a zero-activity report. Yearly reports paginate rather than truncate.

Current stock and current outstanding are labelled as current snapshots, not historical balances. A PDF report is neither a tax invoice nor a complete restorable shop backup.

## Focused regression checks

```sh
pnpm --filter @workspace/scripts exec tsx --test \
  ../artifacts/buyme/src/shop-merge.test.ts \
  ../artifacts/buyme/src/report-data.test.ts
```

Browser verification should use isolated test accounts: check an offline payment, pending IndexedDB data, reconnection acknowledgement without duplicate bills, account separation, manual company-admin approval/pause/restore, and each PDF period. Never seed or modify a real customer's shop for testing.
