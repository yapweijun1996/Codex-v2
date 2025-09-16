// A self-contained parsing module for CSV data.

/**
 * Normalizes a cell value by cleaning and converting it to a number if possible.
 * Handles currency symbols, commas, parentheses for negatives, and trailing minus signs.
 * @param {string | number | null} value - The cell value to normalize.
 * @returns {string | number | null} - The normalized value.
 */
function normalizeCellValue(value) {
    if (value === null || typeof value === 'undefined') return null;
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return String(value);

    let str = value.trim();
    if (str === '') return null;

    // Handle percentage
    if (str.endsWith('%')) {
        const num = parseFloat(str.slice(0, -1));
        return isNaN(num) ? str : num / 100;
    }

    // Handle currency and grouping separators
    str = str.replace(/[\$,]/g, '');

    // Handle trailing minus sign for negative numbers
    if (str.endsWith('-')) {
        str = '-' + str.slice(0, -1);
    }

    // Handle parentheses for negative numbers
    if (str.startsWith('(') && str.endsWith(')')) {
        str = '-' + str.slice(1, -1);
    }

    const num = parseFloat(str);
    return isNaN(num) ? value : num; // Return original value if not a valid number
}

/**
 * Creates composite headers from parent and main header rows.
 * @param {string[]} parentHeader - The row containing parent group labels.
 * @param {string[]} mainHeader - The main header row.
 * @returns {string[]} - An array of composite header strings.
 */
function createCompositeHeaders(parentHeader, mainHeader) {
    // Heuristic rules tailored for this report layout:
    // - When child is "Original"/"Revised" => always "Budget Original/Revised"
    // - When child is "To Date" => use nearest parent "Committed"/"Certified"
    // - When child is "Forecast" under "Final" => "Final Forecast"
    // - Else if parent exists and is meaningful, join "Parent Child"
    const toLower = v => String(v || '').trim().toLowerCase();
    const nearestParent = (i) => {
        // scan leftwards for nearest non-empty parent text
        for (let j = i; j >= 0; j--) {
            const p = toLower(parentHeader && parentHeader[j]);
            if (p) return p;
        }
        return '';
    };

    return mainHeader.map((h, i) => {
        const childRaw = String(h || '').trim();
        const child = toLower(childRaw);
        const parent = toLower(parentHeader && parentHeader[i]);

        if (!child) return '';

        // Budget child columns
        if (child === 'original') return 'Budget Original';
        if (child === 'revised') return 'Budget Revised';

        // To Date disambiguation
        if (child === 'to date') {
            const p = parent || nearestParent(i);
            if (p.includes('commit')) return 'Committed To Date';
            if (p.includes('cert')) return 'Certified To Date';
            // default to committed if parent missing
            return 'Committed To Date';
        }

        // Final Forecast
        if (child === 'forecast') {
            const p = parent || nearestParent(i);
            if (p.includes('final')) return 'Final Forecast';
            return 'Forecast';
        }

        // Variance Forecast
        if (child === 'variance') return 'Variance Forecast';

        // Remarks / Claim / Month tags preserved as-is
        if (child.includes('remark')) return 'Remarks';
        if (child.includes('claim')) return 'Claim';

        // Fallback: if parent exists and is not same as child, combine; else child only
        if (parent && parent !== child) {
            // Capitalize combined nicely
            const cap = s => s.replace(/\b\w/g, c => c.toUpperCase());
            return `${cap(parent)} ${cap(childRaw)}`;
        }
        return childRaw;
    });
}

/**
 * Finds the header row index based on heuristic (looks for "Code" and "Description").
 * @param {Array<Array<string>>} arrays - The sheet data as an array of arrays.
 * @returns {number} - The index of the header row, or a default if not found.
 */
function findHeaderRowIndex(arrays) {
    const headerKeywords = ['code', 'description']; // Use lowercase for case-insensitive comparison
    const rowIndex = arrays.findIndex(row =>
        headerKeywords.every(keyword =>
            row.some(cell => cell && typeof cell === 'string' && cell.trim().toLowerCase() === keyword)
        )
    );
    return rowIndex === -1 ? 3 : rowIndex; // Default to 3 if not found
}

/**
 * Normalize a single header token into a canonical key using heuristics.
 * We prefer to rely on the child header text (mainHeader) rather than the parent row,
 * because CSV has no merges and parent carry-forward can be misleading.
 */
function normalizeHeaderToken(token) {
    const h = String(token || '').trim().toLowerCase();

    // Direct matches
    if (h === 'code' || h === 'item code' || h === 'item no' || h === 'item no.') return 'item_code';
    if (h === 'description' || h === 'item description' || h === 'desc') return 'item_description';
    if (h === 'original') return 'budget_original';
    if (h === 'revised') return 'budget_revised';
    if (h === 'to date') return 'to_date'; // disambiguate later as committed/certified
    if (h === 'final' || h === 'forecast' || h === 'final forecast' || h === 'forecast final') return 'final_forecast';
    if (h === 'variance' || h === 'variance forecast' || h === 'forecast variance') return 'variance_forecast';
    if (h.includes('claim')) return 'additional_claim';
    if (h.includes('remark')) return 'remarks';
    if (/(sep\-?25|september)/.test(h)) return 'additional_sep25';
    if (/(jun\-?25|june)/.test(h)) return 'additional_jun25';

    // Fallback generic
    if (!h) return '';
    return h.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/**
 * Derive canonical header keys from the main header row using rules:
 * - Map known tokens (Original/Revised/To Date/etc) to canonical fields
 * - The first 'to_date' encountered after Budget columns is committed_to_date
 *   and the next 'to_date' is certified_to_date.
 */
function deriveHeaderKeys(mainHeader) {
    const keys = [];
    let toDateSeen = 0;

    // We detect budget columns to help ordering of "to date" fields.
    // We'll simply count original/revised occurrences we pass; not strictly required.
    mainHeader.forEach((cell) => {
        const k = normalizeHeaderToken(cell);
        if (k === 'to_date') {
            toDateSeen += 1;
            keys.push(toDateSeen === 1 ? 'committed_to_date' : 'certified_to_date');
        } else if (k) {
            keys.push(k);
        } else {
            keys.push('');
        }
    });

    // Deduplicate accidental repeats while preserving order
    const seen = new Set();
    return keys.map(k => {
        if (!k) return '';
        if (!seen.has(k)) {
            seen.add(k);
            return k;
        }
        // For duplicate remarks, create remarks_2
        if (k === 'remarks' && !seen.has('remarks_2')) {
            seen.add('remarks_2');
            return 'remarks_2';
        }
        // For unexpected dups, keep the original raw token with suffix to avoid collisions
        let idx = 2;
        let alt = `${k}_${idx}`;
        while (seen.has(alt)) {
            idx += 1;
            alt = `${k}_${idx}`;
        }
        seen.add(alt);
        return alt;
    });
}

/**
 * Extract metadata (project, project_code, month) by scanning rows before the header.
 * Looks for "Project", "Project Code", "For Month Of" keys and grabs the next cell.
 */
function extractMetadata(rows, headerIndex) {
    const meta = { project: 'N/A', project_code: 'N/A', month: 'N/A' };
    const area = rows.slice(0, Math.max(0, headerIndex + 1));
    for (const row of area) {
        for (let i = 0; i < row.length - 1; i++) {
            const k = String(row[i] || '').trim().toLowerCase();
            const v = String(row[i + 1] || '').trim();
            if (!v) continue;
            if (k === 'project' && meta.project === 'N/A') meta.project = v;
            if ((k === 'project code' || k === 'project no' || k === 'project no.') && meta.project_code === 'N/A') meta.project_code = v;
            if ((k === 'for month of' || k === 'month' || k === 'month of') && meta.month === 'N/A') meta.month = v;
        }
    }
    // Fallbacks: try to guess month token if still N/A
    if (meta.month === 'N/A') {
        const m = area.flat().map(x => String(x || '')).find(s => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\s]*\-?\d{2,4}\b/i.test(s));
        if (m) meta.month = m.trim();
    }
    // Fallbacks: if 'project' still N/A, try second column of first two rows
    if (meta.project === 'N/A') {
        if (area[0] && area[0][1]) meta.project = String(area[0][1]).trim();
        else if (area[1] && area[1][1]) meta.project = String(area[1][1]).trim();
    }
    // If project_code still N/A, search any 4-6 digit number in pre-header
    if (meta.project_code === 'N/A') {
        const pc = area.flat().map(x => String(x || '')).find(s => /^\d{4,6}$/.test(s));
        if (pc) meta.project_code = pc;
    }
    return meta;
}

/**
 * Parses raw CSV string data into structured JSON.
 * @param {string} csvData - The raw CSV data as a string.
 * @param {number | null} manualHeaderRow - An optional 1-based index for the header row.
 * @returns {{headers: string[], data: Object[], raw: Array<Array<string>>}}
 */
function parseCsvData(csvData, manualHeaderRow = null) {
    const workbook = XLSX.read(csvData, { type: 'string', raw: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const arrays = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    const headerIndex = manualHeaderRow ? manualHeaderRow - 1 : findHeaderRowIndex(arrays);
    const parentHeaderIndex = headerIndex > 0 ? headerIndex - 1 : -1;

    const mainHeader = arrays[headerIndex] || [];
    const parentHeader = parentHeaderIndex >= 0 ? arrays[parentHeaderIndex] : [];

    // Derive canonical header keys from the main header row (avoid using parent carry-forward on CSV)
    const headerKeys = deriveHeaderKeys(mainHeader);

    const jsonData = [];
    const dataRows = arrays.slice(headerIndex + 1);

    dataRows.forEach(row => {
        // Filter out empty or malformed rows.
        if (row.filter(cell => cell !== null).length < 2) {
            return;
        }

        const rowData = {};
        headerKeys.forEach((key, i) => {
            rowData[key] = normalizeCellValue(row[i]);
        });

        // A row is a data row if its item_code is not an integer (section headers are 1,2,3,...).
        if (typeof rowData['item_code'] === 'number' && rowData['item_code'] % 1 !== 0) {
            jsonData.push(rowData);
        }
    });

    // Add project metadata to each row using robust scan
    const meta = extractMetadata(arrays, headerIndex);
    const project = meta.project;
    const projectCode = meta.project_code;
    const month = meta.month;

    const enrichedData = jsonData.map(row => ({
        project,
        project_code: projectCode,
        month,
        ...row
    }));

    const finalHeaders = ['project', 'project_code', 'month', ...headerKeys.filter(k => k)];

    return { headers: finalHeaders, data: enrichedData, raw: arrays };
}