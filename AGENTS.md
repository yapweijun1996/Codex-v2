# Repository Guidelines

## Project Structure & Module Organization
- `index.html` loads the parser UI, wires file inputs, and toggles the Raw/Converted views.
- `js/parser.js` hosts the normalization pipeline; `js/datatable.js` keeps DOM rendering helpers isolated from parsing logic.
- `lib/` stores third-party bundles required offline (`xlsx.full.min.js` now; add Tabulator assets here when upgrading tables).
- Sample workbooks (`test001.*`) sit at the project root for regression checks; keep new fixtures in `test/` using descriptive names.

## Build, Test, and Development Commands
- No build step is needed; open `index.html` directly in a browser for quick verification.
- For local hosting (avoids strict CORS modes), run `python3 -m http.server 8000` and browse to `http://localhost:8000/index.html`.
- Lint scripts are not yet wired; run `npx eslint js/*.js` before submitting changes if you add an ESLint config.

## Coding Style & Naming Conventions
- Use 4-space indentation, keep trailing semicolons, and prefer `const`/`let` over `var` in new code.
- Functions follow `camelCase`; exported helpers should read like verbs (`createCompositeHeaders`).
- Keep regex literals and heuristics documented inline—this code base relies on comments for business rules clarity.
- Place vendor filenames in `lib/` using lowercase with dots (e.g., `tabulator.min.js`).

## Testing Guidelines
- Exercise new parsing rules with the shipped fixtures (`test001.csv`, `test001.xls`, etc.) and add targeted cases under `test/`.
- When adjusting schema logic, log the `headers` array from `parseCsvData` and confirm converted tables render without console errors.
- Aim for deterministic output: no reliance on locale-specific APIs, and avoid mutating inputs in place.

## Commit & Pull Request Guidelines
- Favor imperative subjects with a scope tag when relevant, e.g., `feat(parser): handle trailing minus`. Keep lines ≤72 chars.
- Reference related issues in the body and list manual test steps (files opened, browsers used).
- Pull requests should include before/after screenshots when UI layout shifts, plus a short note on data files touched.

## Security & Data Handling
- Do not commit proprietary spreadsheets; anonymize fixtures before pushing.
- Keep third-party libraries pinned and audited; document versions inside PR descriptions when upgrading `lib/` assets.
