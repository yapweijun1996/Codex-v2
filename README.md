# Excel & CSV Parser

This project provides a lightweight, powerful interface for parsing complex Excel and CSV files directly in the browser. It's designed to handle tricky real-world formats, including multi-line headers and messy data, turning them into clean, analysis-ready JSON.

## Features

- **Broad File Support**: Parses `.xls`, `.xlsx`, `.xlsm`, and `.csv` files.
- **Intelligent CSV Parsing**: Specifically handles CSVs with leading metadata and multi-line, grouped headers.
- **Metadata Extraction**: Automatically finds and extracts key-value metadata from the top of the sheet (e.g., Project Name, Project Code).
- **Data Enrichment**: Injects the extracted metadata into every data row, so each record is self-contained.
- **Advanced Data Normalization**: Cleans and types data, converting currency strings, percentages, and parenthesized negative numbers into proper numeric types.
- **Side-by-Side Preview**: Displays the raw, unprocessed data next to the clean, converted data table for immediate verification.
- **CSV Export**: Exports the clean, normalized data to a CSV file with a stable column order.
- **Modern UI/UX**: A clean, responsive interface with clear user feedback, including loading states and interactive controls.

## Getting Started

1.  Open `index.html` in a modern browser.
2.  Click the file selection area to choose a spreadsheet or drag and drop a file onto it.
3.  The parser will automatically attempt to find the header and process the data.
4.  Review the "Raw Data" and "Converted Data" tables to ensure the conversion is correct.
5.  Use the "Export CSV" button to download the clean data.

## Advanced Usage

For files where the automatic parsing might fail, you can use the manual override controls:

-   **Header Row (1-based)**: If the parser can't find the correct header, you can manually enter the row number where the main header line is located (e.g., for `test001.csv`, this would be row 4). The parser will use the row above it as the parent/group header.
-   **CSV Encoding**: If you are parsing a CSV file and see garbled text (e.g., `�`), the file might not be in UTF-8. Try selecting `Windows-1252` (a common encoding for older Excel-generated files) and parse again.

## Offline Deployment

The app depends on the SheetJS `xlsx.full.min.js` bundle. For offline usage, the library is included locally at `lib/xlsx.full.min.js`. When deploying without Internet access, ensure this file is distributed alongside the site.
