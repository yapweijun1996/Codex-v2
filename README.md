# Excel & CSV Parser

A lightweight, browser‑only tool for turning messy Excel/CSV sheets into clean, analysis‑ready data. Handles multi‑row headers and produces a stable converted schema suitable for charts and pivoting.

## Features

- File support: `.xls`, `.xlsx`, `.xlsm`, `.csv` (SheetJS offline bundle).
- Smart CSV parsing: detects parent/child headers; disambiguates duplicate labels (e.g., two "To Date").
- Clean schema: normalized column names with consistent order (see "Converted Data Schema").
- Auto-parse on select: choosing a file starts parsing immediately.
- Tabs UI: switch between `Raw` and `Converted` views.
- Usability: sticky header for readability, horizontal scroll with shadows, mobile responsive.
- Converted table controls: global search, optional column scope, rows/page, export all vs. filtered subset.
- Numeric formatting: thousands separator; right-aligned numbers in numeric columns.

## Getting Started

1. Open `index.html` in a modern browser (no server required).
2. Click the file area or drop a file. Parsing starts automatically.
3. Use the tabs to switch between `Raw` and `Converted`.
4. In `Converted`, use search, choose a column (optional), and set rows per page. Click `Export CSV` (all rows) or `Export Filtered` (current filter only).

Tips
- If header detection is off, set the exact header line in `Header Row (1‑based)`.
- If characters look garbled, change `CSV Encoding` to `Windows‑1252` and re‑parse.

## Converted Data Schema

The Converted table outputs columns in a stable order:

1. `Project`
2. `Item_Code`
3. `Item_Description`
4. `Budget_Original`
5. `Budget_Revised`
6. `Committed_To_Date`
7. `Certified_To_Date`
8. `Forecast`
9. `Final_Forecast`
10+. One or more variance month pairs detected from the header, for example:
    - `Variance_Sep2025_Value`, `Variance_Sep2025_Remarks`
    - `Variance_Jun2025_Value`, `Variance_Jun2025_Remarks`
    The month pairs are derived dynamically from the CSV header (e.g., `Sep-25`, `Jun-25`).
Last. `Additional_Claim`

## Architecture & Developer APIs

- `js/app.js` centralizes UI orchestration (file input handling, status messages, tab toggles, exports) and consumes the modules below.
- `js/parser.js` exposes `csvParser.parse(csvString, manualHeaderRow?)` which returns `{ headers, data, raw, meta }` and a `csvParser.toLongFormat(records, measures?)` helper for downstream analytics.
- `js/datatable.js` exports a dependency-light `DataTableController` that falls back to a native table and upgrades to Tabulator when available.

## Optional: Rich Data Grid

This app includes a native table controller and can auto-upgrade to [Tabulator](https://tabulator.info/) if its files are present locally.

1. Add to the repo:
   - `lib/tabulator.min.js`
   - `lib/tabulator.min.css`
2. Reload `index.html` — the Converted table will render with Tabulator, enabling built‑in pagination, sorting, column moving/resizing. If the files are missing, the native table remains active.

## Offline Deployment

All parsing runs in the browser using the local SheetJS bundle: `lib/xlsx.full.min.js`. Keep this file (and optionally Tabulator assets) alongside `index.html` for offline use.
