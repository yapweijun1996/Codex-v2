# Excel Parser

This project provides a lightweight interface for parsing Excel files directly in the browser.

## Getting Started

1. Open `index.html` in a modern browser.
2. Select a spreadsheet file to inspect its contents and export data as CSV.

## Offline Deployment

The app depends on the SheetJS `xlsx.full.min.js` bundle. For offline usage, the library is included locally at `lib/xlsx.full.min.js` (version 0.18.5, downloaded from the official [SheetJS repository](https://github.com/SheetJS/sheetjs)). When deploying without Internet access, ensure this file is distributed alongside the site and update the script reference in `index.html` if you replace the library with a different version.

