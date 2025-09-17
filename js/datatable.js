// Lightweight table controller for the Converted Data preview.
// Works without external dependencies and can upgrade to Tabulator when available.

(function registerDataTableController(global) {
  'use strict';

  class DataTableController {
    constructor(opts) {
      this.previewMount = opts.previewMount;
      this.controls = {
        searchInput: opts.searchInput || null,
        filterColSelect: opts.filterColSelect || null,
        pageSizeSelect: opts.pageSizeSelect || null,
        pagerPrev: opts.pagerPrev || null,
        pagerNext: opts.pagerNext || null,
        pagerSummary: opts.pagerSummary || null,
        pagerWrap: opts.pagerWrap || null,
        exportFilteredBtn: opts.exportFilteredBtn || null
      };

      this.headers = [];
      this.rows = [];
      this.filtered = [];
      this.search = '';
      this.filterCol = '';
      this.pageSize = this._parsePageSize();
      this.page = 1;
      this.tabulator = null;
      this.exportFilename = opts.exportFilename || 'export.csv';

      if (this.controls.searchInput) {
        this.controls.searchInput.addEventListener('input', (event) => {
          this.setSearch(event.target.value || '');
        });
      }

      if (this.controls.filterColSelect) {
        this.controls.filterColSelect.addEventListener('change', (event) => {
          this.setFilterColumn(event.target.value || '');
        });
      }

      if (this.controls.pageSizeSelect) {
        this.controls.pageSizeSelect.addEventListener('change', (event) => {
          this.setPageSize(parseInt(event.target.value, 10) || 25);
        });
      }

      if (this.controls.pagerPrev) {
        this.controls.pagerPrev.addEventListener('click', () => this.prev());
      }

      if (this.controls.pagerNext) {
        this.controls.pagerNext.addEventListener('click', () => this.next());
      }

      if (this.controls.exportFilteredBtn) {
        this.controls.exportFilteredBtn.addEventListener('click', () => this.exportFiltered());
        this.controls.exportFilteredBtn.disabled = true;
      }
    }

    setData(headers, rows) {
      this.headers = Array.isArray(headers) ? headers.slice() : [];
      this.rows = Array.isArray(rows) ? rows.slice() : [];
      this.filtered = this.rows.slice();
      this.search = '';
      this.filterCol = '';
      this.page = 1;
      this._syncControls();
      this._populateFilterOptions();
      this.recalc();
    }

    clear(message) {
      const text = typeof message === 'string' ? message : 'No data loaded yet.';
      this.headers = [];
      this.rows = [];
      this.filtered = [];
      this.page = 1;
      this._syncControls();
      if (this.previewMount) {
        this.previewMount.innerHTML = `<div style="padding:12px;">${text}</div>`;
      }
      this._updateSummary(1, 1);
      this._toggleControls(false);
    }

    setExportFilename(name) {
      if (typeof name === 'string' && name.trim()) {
        this.exportFilename = name;
      }
    }

    setSearch(query) {
      this.search = (query || '').toLowerCase();
      this.page = 1;
      this.recalc();
    }

    setFilterColumn(column) {
      this.filterCol = column || '';
      this.page = 1;
      this.recalc();
    }

    setPageSize(size) {
      this.pageSize = size;
      this.page = 1;
      if (this.useTabulator() && this.tabulator) {
        this.tabulator.setPageSize(size);
      }
      this.recalc();
    }

    prev() {
      if (this.page > 1) {
        this.page -= 1;
        this.render();
      }
    }

    next() {
      const total = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
      if (this.page < total) {
        this.page += 1;
        this.render();
      }
    }

    recalc() {
      const query = this.search;
      const column = this.filterCol;
      this.filtered = this.rows.filter((row) => {
        if (!query) return true;
        if (column) {
          const value = row[column];
          return value !== null && value !== undefined && String(value).toLowerCase().includes(query);
        }
        return this.headers.some((header) => {
          const value = row[header];
          return value !== null && value !== undefined && String(value).toLowerCase().includes(query);
        });
      });
      this.render();
    }

    render() {
      if (!this.previewMount) return;
      if (!this.filtered.length) {
        this.previewMount.innerHTML = '<div style="padding:12px;">No results — adjust search or filters.</div>';
        this._updateSummary(1, 1);
        this._toggleControls(false);
        return;
      }

      this._toggleControls(true);

      if (this.useTabulator()) {
        this._renderTabulator();
      } else {
        this._renderNative();
      }
    }

    exportFiltered(filename) {
      if (!this.filtered.length) return;
      const exportName = filename || this.exportFilename || 'export.csv';
      const headerString = this.headers.join(',');
      const rows = this.filtered.map((row) =>
        this.headers
          .map((header) => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            return stringValue.includes(',')
              ? `"${stringValue.replace(/"/g, '""')}"`
              : stringValue;
          })
          .join(',')
      );
      const csvContent = [headerString, ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', exportName.replace(/\.csv$/, '') + '_filtered.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    useTabulator() {
      return typeof global.Tabulator !== 'undefined';
    }

    _renderNative() {
      const start = (this.page - 1) * this.pageSize;
      const end = start + this.pageSize;
      const rowsOnPage = this.filtered.slice(start, end);

      const table = document.createElement('table');
      table.createTHead();
      const headerRow = table.tHead.insertRow();
      this.headers.forEach((header) => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
      });

      const tbody = table.createTBody();
      rowsOnPage.forEach((row) => {
        const tr = tbody.insertRow();
        this.headers.forEach((header) => {
          const td = tr.insertCell();
          const value = row[header];
          if (typeof value === 'number') {
            td.textContent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
            td.setAttribute('data-type', 'number');
          } else {
            td.textContent = value !== null && value !== undefined ? value : '';
          }
        });
      });

      this.previewMount.innerHTML = '';
      this.previewMount.appendChild(table);

      const totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
      this._updateSummary(this.page, totalPages);
    }

    _renderTabulator() {
      this.previewMount.innerHTML = '';
      const mount = document.createElement('div');
      this.previewMount.appendChild(mount);

      const numericFields = new Set([
        'Budget_Original',
        'Budget_Revised',
        'Committed_To_Date',
        'Certified_To_Date',
        'Forecast',
        'Final_Forecast',
        'Additional_Claim'
      ]);
      this.headers.forEach((header) => {
        if (/^Variance_/.test(header) && /_Value$/.test(header)) {
          numericFields.add(header);
        }
      });

      const columns = this.headers.map((header) => ({
        title: header.replace(/_/g, ' '),
        field: header,
        hozAlign: numericFields.has(header) ? 'right' : 'left',
        sorter: numericFields.has(header) ? 'number' : 'string'
      }));

      if (this.tabulator) {
        this.tabulator.setColumns(columns);
        this.tabulator.setData(this.filtered);
        this.tabulator.setPageSize(this.pageSize);
      } else {
        this.tabulator = new global.Tabulator(mount, {
          data: this.filtered,
          columns,
          layout: 'fitDataStretch',
          pagination: true,
          paginationSize: this.pageSize,
          movableColumns: true,
          resizableColumns: true
        });
      }

      if (this.search) {
        if (this.filterCol) {
          this.tabulator.setFilter(this.filterCol, 'like', this.search);
        } else {
          this.tabulator.setFilter((row) => {
            const data = row.getData();
            return this.headers.some((header) => String(data[header] || '').toLowerCase().includes(this.search));
          });
        }
      } else {
        this.tabulator.clearFilter();
      }

      const totalPages = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
      this._updateSummary(1, totalPages);
    }

    _parsePageSize() {
      if (!this.controls.pageSizeSelect) return 25;
      return parseInt(this.controls.pageSizeSelect.value, 10) || 25;
    }

    _populateFilterOptions() {
      if (!this.controls.filterColSelect) return;
      const options = ['<option value="">All columns</option>'];
      options.push(...this.headers.map((header) => `<option value="${header}">${header}</option>`));
      this.controls.filterColSelect.innerHTML = options.join('');
    }

    _syncControls() {
      if (this.controls.searchInput) this.controls.searchInput.value = '';
      if (this.controls.filterColSelect) this.controls.filterColSelect.value = '';
      if (this.controls.pageSizeSelect) {
        this.controls.pageSizeSelect.value = String(this.pageSize);
      }
    }

    _toggleControls(hasData) {
      if (this.controls.pagerWrap) {
        this.controls.pagerWrap.classList.toggle('hidden', !hasData);
      }
      if (this.controls.exportFilteredBtn) {
        this.controls.exportFilteredBtn.disabled = !hasData;
      }
    }

    _updateSummary(page, totalPages) {
      if (this.controls.pagerSummary) {
        const totalRows = this.filtered.length;
        this.controls.pagerSummary.textContent = hasData(totalRows)
          ? `Showing page ${page} of ${totalPages} — ${totalRows} rows`
          : 'No rows available';
      }
      if (this.controls.pagerPrev) this.controls.pagerPrev.disabled = page <= 1;
      if (this.controls.pagerNext) this.controls.pagerNext.disabled = page >= totalPages;
    }
  }

  function hasData(total) {
    return typeof total === 'number' && total > 0;
  }

  global.DataTableController = DataTableController;
})(window);
