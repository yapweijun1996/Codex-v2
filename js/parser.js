// Core CSV parsing utilities for the Excel & CSV Parser UI.
// Exposes a browser-friendly API under window.csvParser for reuse across modules.

(function registerCsvParser(global) {
    'use strict';

    const HEADER_KEYWORDS = ['code', 'description'];
    const BASE_ORDER = [
        'Item_Code',
        'Item_Description',
        'Budget_Original',
        'Budget_Revised',
        'Committed_To_Date',
        'Certified_To_Date',
        'Forecast',
        'Final_Forecast'
    ];
    const VARIANCE_KEY_PATTERN = /^Variance_[A-Za-z]{3}\d{4}_/;

    const toLower = (value) => String(value ?? '').trim().toLowerCase();
    const isBlank = (value) => value === null || typeof value === 'undefined' || String(value).trim() === '';

    /**
     * Normalizes a cell value by cleaning and converting it to a number if possible.
     * Handles currency symbols, commas, parentheses for negatives, and trailing minus signs.
     */
    const normalizeCellValue = (value) => {
        if (value === null || typeof value === 'undefined') return null;
        if (typeof value === 'number') return value;
        if (typeof value !== 'string') return String(value);

        let str = value.trim();
        if (!str) return null;

        if (str.endsWith('%')) {
            const num = parseFloat(str.slice(0, -1));
            return Number.isNaN(num) ? str : num / 100;
        }

        str = str.replace(/[\$,]/g, '');

        if (str.endsWith('-')) {
            str = '-' + str.slice(0, -1);
        }

        if (str.startsWith('(') && str.endsWith(')')) {
            str = '-' + str.slice(1, -1);
        }

        const num = parseFloat(str);
        return Number.isNaN(num) ? value : num;
    };

    /**
     * Finds the header row index based on heuristic (looks for "Code" and "Description").
     */
    const findHeaderRowIndex = (rows) => {
        const rowIndex = rows.findIndex((row) =>
            HEADER_KEYWORDS.every((keyword) =>
                row.some((cell) => typeof cell === 'string' && cell.trim().toLowerCase() === keyword)
            )
        );
        return rowIndex === -1 ? 3 : rowIndex;
    };

    /**
     * Normalize a single header token into a canonical key using heuristics.
     * We prefer to rely on the child header text (mainHeader) rather than the parent row,
     * because CSV has no merges and parent carry-forward can be misleading.
     */
    const normalizeHeaderToken = (token) => {
        const h = toLower(token);

        if (h === 'code' || h === 'item code' || h === 'item no' || h === 'item no.') return 'item_code';
        if (h === 'description' || h === 'item description' || h === 'desc') return 'item_description';
        if (h === 'original') return 'budget_original';
        if (h === 'revised') return 'budget_revised';
        if (h === 'to date') return 'to_date';
        if (h === 'final' || h === 'forecast' || h === 'final forecast' || h === 'forecast final') return 'final_forecast';
        if (h === 'variance' || h === 'variance forecast' || h === 'forecast variance') return 'variance_forecast';
        if (h.includes('claim')) return 'additional_claim';
        if (h.includes('remark')) return 'remarks';

        if (!h) return '';
        return h.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    };

    // Parse a month token like "Sep-25", "Sep 2025", "September 2025" into a stable id "Sep2025"
    const parseMonthToken = (text) => {
        const s = String(text ?? '').trim();
        const match = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:[\s\-_/]+)?(\d{2,4})\b/i);
        if (!match) return null;
        let mon = match[1].toLowerCase();
        if (mon === 'sept') mon = 'sep';
        const monCap = mon.charAt(0).toUpperCase() + mon.slice(1, 3);
        let year = match[2];
        if (year.length === 2) {
            year = '20' + year;
        }
        return monCap + year;
    };

    /**
     * Derive canonical header keys from the main header row using rules.
     */
    const deriveHeaderKeys = (mainHeader, parentHeader = []) => {
        const keys = [];
        let toDateSeen = 0;
        let lastVarianceMonth = null;

        mainHeader.forEach((cell, idx) => {
            const token = normalizeHeaderToken(cell);
            const parent = toLower(parentHeader[idx]);

            if (token === 'to_date') {
                if (parent.includes('commit')) keys.push('Committed_To_Date');
                else if (parent.includes('cert')) keys.push('Certified_To_Date');
                else {
                    toDateSeen += 1;
                    keys.push(toDateSeen === 1 ? 'Committed_To_Date' : 'Certified_To_Date');
                }
                return;
            }

            if (token === 'final_forecast') {
                if (parent.includes('final')) keys.push('Final_Forecast');
                else if (parent.includes('variance')) keys.push('Variance_Forecast');
                else keys.push('Forecast');
                return;
            }

            if (parent.includes('variance')) {
                const monthId = parseMonthToken(cell);
                if (monthId) {
                    keys.push(`Variance_${monthId}_Value`);
                    lastVarianceMonth = monthId;
                } else if (token === 'remarks') {
                    keys.push(lastVarianceMonth ? `Variance_${lastVarianceMonth}_Remarks` : 'Variance_Remarks');
                } else if (token) {
                    keys.push(token);
                } else {
                    keys.push('');
                }
                return;
            }

            if (!token) {
                keys.push('');
                return;
            }

            switch (token) {
                case 'item_code':
                    keys.push('Item_Code');
                    break;
                case 'item_description':
                    keys.push('Item_Description');
                    break;
                case 'budget_original':
                    keys.push('Budget_Original');
                    break;
                case 'budget_revised':
                    keys.push('Budget_Revised');
                    break;
                case 'committed_to_date':
                    keys.push('Committed_To_Date');
                    break;
                case 'certified_to_date':
                    keys.push('Certified_To_Date');
                    break;
                case 'forecast':
                    keys.push('Forecast');
                    break;
                case 'variance_forecast':
                    keys.push('Variance_Forecast');
                    break;
                case 'final_forecast':
                    keys.push('Final_Forecast');
                    break;
                case 'additional_claim':
                    keys.push('Additional_Claim');
                    break;
                default:
                    keys.push('');
            }
        });

        const seen = new Set();
        return keys.map((key) => {
            if (!key) return '';
            if (!seen.has(key)) {
                seen.add(key);
                return key;
            }
            let idx = 2;
            let candidate = `${key}_${idx}`;
            while (seen.has(candidate)) {
                idx += 1;
                candidate = `${key}_${idx}`;
            }
            seen.add(candidate);
            return candidate;
        });
    };

    /**
     * Extract metadata (project, project_code, month) by scanning rows before the header.
     */
    const extractMetadata = (rows, headerIndex) => {
        const meta = { project: 'N/A', project_code: 'N/A', month: 'N/A' };
        const area = rows.slice(0, Math.max(0, headerIndex + 1));
        for (const row of area) {
            for (let i = 0; i < row.length - 1; i += 1) {
                const key = toLower(row[i]);
                const value = String(row[i + 1] ?? '').trim();
                if (!value) continue;
                if (key === 'project' && meta.project === 'N/A') meta.project = value;
                if ((key === 'project code' || key === 'project no' || key === 'project no.') && meta.project_code === 'N/A') meta.project_code = value;
                if ((key === 'for month of' || key === 'month' || key === 'month of') && meta.month === 'N/A') meta.month = value;
            }
        }
        if (meta.month === 'N/A') {
            const match = area
                .flat()
                .map((value) => String(value ?? ''))
                .find((text) => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[^\s]*\-?\d{2,4}\b/i.test(text));
            if (match) meta.month = match.trim();
        }
        if (meta.project === 'N/A') {
            if (area[0] && area[0][1]) meta.project = String(area[0][1]).trim();
            else if (area[1] && area[1][1]) meta.project = String(area[1][1]).trim();
        }
        if (meta.project_code === 'N/A') {
            const candidate = area
                .flat()
                .map((value) => String(value ?? ''))
                .find((text) => /^\d{4,6}$/.test(text));
            if (candidate) meta.project_code = candidate;
        }
        return meta;
    };

    /**
     * Checks if a row is a valid data row based on its Item_Code.
     * Skips group headers like "1", "2", "3.1", etc.
     */
    const isDataRow = (rowData) => {
        const code = rowData.Item_Code ?? rowData.item_code;
        if (code === null || typeof code === 'undefined') return false;
        const codeStr = String(code).trim();
        return (
            (typeof code === 'number' && !Number.isInteger(code)) ||
            (typeof code === 'string' && codeStr.includes('.') && codeStr.split('.').length > 1 && !/^\d+(\.0+)?$/.test(codeStr))
        );
    };

    const readSheetToArrays = (csvData) => {
        const workbook = XLSX.read(csvData, { type: 'string', raw: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    };

    const buildRowObject = (row, headerKeys) => {
        const out = {};
        headerKeys.forEach((key, idx) => {
            if (!key) return;
            const cell = row[idx];
            if (key.toLowerCase() === 'item_code') {
                out[key] = isBlank(cell) ? null : String(cell).trim();
            } else {
                out[key] = normalizeCellValue(cell);
            }
        });
        if (!out.Item_Code) {
            const guess = row.find((cell) => cell !== null && /^(\d+\.)+\d+$/.test(String(cell).trim()));
            if (guess != null) out.Item_Code = String(guess).trim();
        }
        return out;
    };

    const projectDataRows = (rows, headerKeys) => {
        const jsonRows = [];
        rows.forEach((row) => {
            if (row.filter((cell) => cell !== null).length < 2) return;
            const rowData = buildRowObject(row, headerKeys);
            if (isDataRow(rowData)) jsonRows.push(rowData);
        });
        return jsonRows;
    };

    const buildFinalHeaders = (headerKeys) => {
        const headerSet = new Set(headerKeys.filter(Boolean));
        const varianceKeys = headerKeys.filter((key) => VARIANCE_KEY_PATTERN.test(key));
        const dynamicOrder = [];
        BASE_ORDER.forEach((key) => {
            if (key === 'Item_Code' || headerSet.has(key)) dynamicOrder.push(key);
        });
        varianceKeys.forEach((key) => {
            if (!dynamicOrder.includes(key)) dynamicOrder.push(key);
        });
        if (headerSet.has('Additional_Claim')) dynamicOrder.push('Additional_Claim');
        return { finalHeaders: ['Project', ...dynamicOrder], dynamicOrder };
    };

    const projectRowsOntoHeaders = (rows, dynamicOrder, projectName) =>
        rows.map((row) => {
            const projected = { Project: projectName };
            dynamicOrder.forEach((key) => {
                projected[key] = Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
            });
            return projected;
        });

    const parseCsvData = (csvData, manualHeaderRow = null) => {
        const arrays = readSheetToArrays(csvData);
        const headerIndex = manualHeaderRow ? manualHeaderRow - 1 : findHeaderRowIndex(arrays);
        const parentHeaderIndex = headerIndex > 0 ? headerIndex - 1 : -1;
        const mainHeader = arrays[headerIndex] || [];
        const parentHeader = parentHeaderIndex >= 0 ? arrays[parentHeaderIndex] : [];

        const headerKeys = deriveHeaderKeys(mainHeader, parentHeader);
        const dataRows = projectDataRows(arrays.slice(headerIndex + 1), headerKeys);
        const meta = extractMetadata(arrays, headerIndex);
        const enriched = dataRows.map((row) => ({ Project: meta.project, ...row }));

        const { finalHeaders, dynamicOrder } = buildFinalHeaders(headerKeys);
        const projectedData = projectRowsOntoHeaders(enriched, dynamicOrder, meta.project);

        return { headers: finalHeaders, data: projectedData, raw: arrays, meta };
    };

    const toLongFormat = (records, measures) => {
        if (!Array.isArray(records) || records.length === 0) return [];
        const sample = records[0];
        const varianceCols = Object.keys(sample).filter((key) => /^Variance_[A-Za-z]{3}\d{4}_(Value|Remarks)$/.test(key));
        const defaultMeasures = [
            'Budget_Original',
            'Budget_Revised',
            'Committed_To_Date',
            'Certified_To_Date',
            'Forecast',
            'Final_Forecast',
            ...varianceCols,
            'Additional_Claim'
        ].filter((key) => Object.prototype.hasOwnProperty.call(sample, key));
        const metrics = Array.isArray(measures) && measures.length ? measures : defaultMeasures;
        const output = [];
        records.forEach((row) => {
            metrics.forEach((metric) => {
                if (!Object.prototype.hasOwnProperty.call(row, metric)) return;
                output.push({
                    project: row.Project,
                    item_code: row.Item_Code,
                    item_description: row.Item_Description,
                    metric,
                    value: row[metric]
                });
            });
        });
        return output;
    };

    global.csvParser = {
        parse: parseCsvData,
        toLongFormat,
        utils: {
            normalizeCellValue,
            findHeaderRowIndex,
            normalizeHeaderToken,
            deriveHeaderKeys,
            parseMonthToken,
            extractMetadata,
            isDataRow
        }
    };

    // Backwards compatibility for legacy callers.
    global.parseCsvData = parseCsvData;
    global.toLongFormat = toLongFormat;
})(window);

