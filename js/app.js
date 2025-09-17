// Main UI orchestration for Excel & CSV Parser.
// Wires file input, parsing pipeline, and table rendering using csvParser + DataTableController.

(function bootstrapApp(global, document) {
  'use strict';

  const csvParser = global.csvParser;
  const DataTableController = global.DataTableController;

  if (!csvParser || !DataTableController) {
    console.error('csvParser and DataTableController must be loaded before app.js');
    return;
  }

  const dom = {
    fileInput: document.getElementById('fileInput'),
    encodingSelector: document.getElementById('encodingSelector'),
    headerRowInput: document.getElementById('headerRowInput'),
    parseBtn: document.getElementById('parseBtn'),
    exportBtn: document.getElementById('exportBtn'),
    exportFilteredBtn: document.getElementById('exportFilteredBtn'),
    rawContainer: document.getElementById('raw-container'),
    convertedContainer: document.getElementById('converted-container'),
    rawPreview: document.getElementById('rawPreview'),
    convertedPreview: document.getElementById('convertedPreview'),
    status: document.getElementById('status'),
    fileNameLabel: document.getElementById('file-name'),
    tabs: {
      raw: document.getElementById('tab-raw'),
      converted: document.getElementById('tab-converted')
    },
    rawScroll: document.getElementById('rawScroll'),
    convertedScroll: document.getElementById('convertedScroll'),
    dtControls: document.getElementById('dt-controls'),
    dtSearch: document.getElementById('dtSearch'),
    dtFilterCol: document.getElementById('dtFilterCol'),
    dtPageSize: document.getElementById('dtPageSize'),
    dtPager: document.getElementById('dt-pager'),
    dtPrev: document.getElementById('dtPrev'),
    dtNext: document.getElementById('dtNext'),
    dtSummary: document.getElementById('dt-summary')
  };

  const state = {
    rawRows: [],
    headers: [],
    rows: [],
    fileName: 'exported_data.csv',
    meta: null
  };

  const convertedTable = new DataTableController({
    previewMount: dom.convertedPreview,
    searchInput: dom.dtSearch,
    filterColSelect: dom.dtFilterCol,
    pageSizeSelect: dom.dtPageSize,
    pagerPrev: dom.dtPrev,
    pagerNext: dom.dtNext,
    pagerSummary: dom.dtSummary,
    pagerWrap: dom.dtPager,
    exportFilteredBtn: dom.exportFilteredBtn
  });

  convertedTable.clear('Load a file to preview converted data.');

  dom.parseBtn?.addEventListener('click', () => parseFile());
  dom.exportBtn?.addEventListener('click', () => exportAll());

  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', () => {
      const file = dom.fileInput.files && dom.fileInput.files[0];
      if (file) {
        dom.fileNameLabel.textContent = `- ${file.name}`;
        disableExport();
        hideElement(dom.rawContainer);
        hideElement(dom.convertedContainer);
        updateStatus('File selected. Parsing…', 'info');
        parseFile();
      }
    });
  }

  if (dom.tabs.raw && dom.tabs.converted) {
    dom.tabs.raw.addEventListener('click', () => activateTab('raw'));
    dom.tabs.converted.addEventListener('click', () => activateTab('converted'));
  }

  function parseFile() {
    const file = dom.fileInput && dom.fileInput.files && dom.fileInput.files[0];
    if (!file) {
      updateStatus('Please select a file first.', 'error');
      return;
    }

    updateStatus('Parsing file…', 'info');
    disableExport();

    const reader = new FileReader();
    const encoding = dom.encodingSelector ? dom.encodingSelector.value : 'utf-8';

    reader.onload = (event) => {
      try {
        const fileData = event.target.result;
        const manualHeaderRow = dom.headerRowInput && dom.headerRowInput.value
          ? parseInt(dom.headerRowInput.value, 10)
          : null;

        const { headers, data, raw, meta } = csvParser.parse(fileData, manualHeaderRow);

        state.rawRows = raw;
        state.headers = headers;
        state.rows = data;
        state.meta = meta || null;
        state.fileName = file.name.replace(/\.[^/.]+$/, '') + '_converted.csv';

        renderRawPreview();
        renderConvertedPreview();
        enableExport();
        updateStatus('File parsed successfully. Ready for export.', 'success');
        activateTab('converted');
      } catch (error) {
        console.error('Parsing Error:', error);
        convertedTable.clear('Parsing failed. Adjust header row or encoding and retry.');
        hideElement(dom.rawContainer);
        hideElement(dom.dtControls);
        hideElement(dom.dtPager);
        updateStatus(`Error parsing file: ${error.message}`, 'error');
      }
    };

    reader.onerror = () => {
      updateStatus('Error reading file.', 'error');
      disableExport();
    };

    reader.readAsText(file, encoding);
  }

  function renderRawPreview() {
    if (!Array.isArray(state.rawRows) || !state.rawRows.length) {
      dom.rawPreview.innerHTML = '';
      hideElement(dom.rawContainer);
      return;
    }

    const table = document.createElement('table');
    state.rawRows.forEach((rowData) => {
      const row = table.insertRow();
      rowData.forEach((cellData) => {
        const cell = row.insertCell();
        cell.textContent = cellData;
      });
    });

    dom.rawPreview.innerHTML = '';
    dom.rawPreview.appendChild(table);

    showElement(dom.rawContainer);
  }

  function renderConvertedPreview() {
    convertedTable.setExportFilename(state.fileName);
    convertedTable.setData(state.headers, state.rows);
    showElement(dom.convertedContainer);
    if (state.rows.length) {
      showElement(dom.dtControls);
      showElement(dom.dtPager);
    } else {
      hideElement(dom.dtControls);
      hideElement(dom.dtPager);
    }
  }

  function exportAll() {
    if (!state.headers.length || !state.rows.length) {
      updateStatus('No data to export.', 'error');
      return;
    }

    const headerString = state.headers.join(',');
    const rows = state.rows.map((row) =>
      state.headers
        .map((header) => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          const stringValue = String(value);
          return stringValue.includes(',') ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
        })
        .join(',')
    );

    const csvContent = [headerString, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', state.fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    updateStatus('Data exported successfully.', 'success');
  }

  function activateTab(which) {
    const showRaw = which === 'raw';
    if (dom.tabs.raw) dom.tabs.raw.classList.toggle('active', showRaw);
    if (dom.tabs.converted) dom.tabs.converted.classList.toggle('active', !showRaw);
    if (dom.rawContainer) dom.rawContainer.classList.toggle('hidden', !showRaw);
    if (dom.convertedContainer) dom.convertedContainer.classList.toggle('hidden', showRaw);
  }

  function updateStatus(message, type) {
    if (!dom.status) return;
    dom.status.textContent = message;
    dom.status.className = `status ${type}`;
  }

  function disableExport() {
    if (dom.exportBtn) dom.exportBtn.disabled = true;
    if (dom.exportFilteredBtn) dom.exportFilteredBtn.disabled = true;
  }

  function enableExport() {
    if (dom.exportBtn) dom.exportBtn.disabled = false;
  }

  function hideElement(el) {
    if (el) el.classList.add('hidden');
  }

  function showElement(el) {
    if (el) el.classList.remove('hidden');
  }
})(window, document);
