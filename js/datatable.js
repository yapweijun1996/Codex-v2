// A lightweight controller to manage the Converted Data table
// Works in two modes:
// - Native table (no dependency)
// - Tabulator (if window.Tabulator is available)

class DataTableController {
  constructor(opts) {
    this.previewMount = opts.previewMount; // element that will host the table/grid
    this.controls = {
      searchInput: opts.searchInput,
      filterColSelect: opts.filterColSelect,
      pageSizeSelect: opts.pageSizeSelect,
      pagerPrev: opts.pagerPrev,
      pagerNext: opts.pagerNext,
      pagerSummary: opts.pagerSummary,
      pagerWrap: opts.pagerWrap,
      exportFilteredBtn: opts.exportFilteredBtn,
    };

    // state
    this.headers = [];
    this.rows = [];
    this.filtered = [];
    this.search = '';
    this.filterCol = '';
    this.pageSize = parseInt(this.controls.pageSizeSelect?.value || '25', 10) || 25;
    this.page = 1;
    this.tabulator = null;

    // wire events
    if (this.controls.searchInput) {
      this.controls.searchInput.addEventListener('input', (e) => {
        this.setSearch(e.target.value || '');
      });
    }
    if (this.controls.filterColSelect) {
      this.controls.filterColSelect.addEventListener('change', (e) => {
        this.setFilterColumn(e.target.value || '');
      });
    }
    if (this.controls.pageSizeSelect) {
      this.controls.pageSizeSelect.addEventListener('change', (e) => {
        this.setPageSize(parseInt(e.target.value, 10) || 25);
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
    }
  }

  useTabulator() { return typeof window.Tabulator !== 'undefined'; }

  setData(headers, rows) {
    this.headers = Array.isArray(headers) ? headers.slice() : [];
    this.rows = Array.isArray(rows) ? rows.slice() : [];
    // populate filter column options
    if (this.controls.filterColSelect) {
      this.controls.filterColSelect.innerHTML = '<option value="">All columns</option>' +
        this.headers.map(h => `<option value="${h}">${h}</option>`).join('');
    }
    // show controls
    this.controls.pagerWrap?.classList.remove('hidden');
    this.controls.exportFilteredBtn && (this.controls.exportFilteredBtn.disabled = false);
    this.page = 1;
    this.recalc();
  }

  setSearch(q) { this.search = (q || '').toLowerCase(); this.page = 1; this.recalc(); }
  setFilterColumn(col) { this.filterCol = col || ''; this.page = 1; this.recalc(); }
  setPageSize(n) { this.pageSize = n; this.page = 1; if (this.useTabulator() && this.tabulator) this.tabulator.setPageSize(n); this.recalc(); }
  prev() { if (this.page > 1) { this.page -= 1; this.render(); } }
  next() { const total = Math.max(1, Math.ceil(this.filtered.length / this.pageSize)); if (this.page < total) { this.page += 1; this.render(); } }

  recalc() {
    const q = this.search;
    const col = this.filterCol;
    this.filtered = this.rows.filter(row => {
      if (!q) return true;
      if (col) {
        const v = row[col];
        return v !== null && typeof v !== 'undefined' && String(v).toLowerCase().includes(q);
      }
      return this.headers.some(k => {
        const v = row[k];
        return v !== null && typeof v !== 'undefined' && String(v).toLowerCase().includes(q);
      });
    });
    this.render();
  }

  render() {
    if (!this.filtered.length) {
      this.previewMount.innerHTML = '<div style="padding:12px;">No results — adjust search or filters.</div>';
      this.updateSummary(1,1);
      return;
    }

    if (this.useTabulator()) {
      this.renderTabulator();
    } else {
      this.renderNative();
    }
  }

  renderNative() {
    const start = (this.page - 1) * this.pageSize;
    const end = start + this.pageSize;
    const rows = this.filtered.slice(start, end);

    const table = document.createElement('table');
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    this.headers.forEach(key => { const th = document.createElement('th'); th.textContent = key; headerRow.appendChild(th); });

    const tbody = table.createTBody();
    rows.forEach(r => {
      const tr = tbody.insertRow();
      this.headers.forEach(k => {
        const td = tr.insertCell();
        const v = r[k];
        if (typeof v === 'number') {
          td.textContent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(v);
          td.setAttribute('data-type','number');
        } else {
          td.textContent = v ?? '';
        }
      });
    });
    this.previewMount.innerHTML = '';
    this.previewMount.appendChild(table);
    const total = Math.max(1, Math.ceil(this.filtered.length / this.pageSize));
    this.updateSummary(this.page, total);
  }

  renderTabulator() {
    this.previewMount.innerHTML = '';
    const mount = document.createElement('div');
    this.previewMount.appendChild(mount);
    const numericFields = new Set([
      'Budget_Original','Budget_Revised','Committed_To_Date','Certified_To_Date','Forecast','Final_Forecast','Additional_Claim'
    ]);
    this.headers.forEach(h => { if (/^Variance_/.test(h) && /_Value$/.test(h)) numericFields.add(h); });
    const columns = this.headers.map(key => ({
      title: key.replace(/_/g,' '), field: key,
      hozAlign: numericFields.has(key) ? 'right' : 'left',
      sorter: numericFields.has(key) ? 'number' : 'string'
    }));
    if (this.tabulator) {
      this.tabulator.setColumns(columns);
      this.tabulator.setData(this.filtered);
      this.tabulator.setPageSize(this.pageSize);
    } else {
      this.tabulator = new Tabulator(mount, {
        data: this.filtered,
        columns,
        layout: 'fitDataStretch',
        pagination: true,
        paginationSize: this.pageSize,
        movableColumns: true,
        resizableColumns: true,
      });
    }
    // apply filter
    if (this.search) {
      if (this.filterCol) this.tabulator.setFilter(this.filterCol, 'like', this.search);
      else this.tabulator.setFilter((row) => {
        const d = row.getData();
        return this.headers.some(k => String(d[k] ?? '').toLowerCase().includes(this.search));
      });
    } else {
      this.tabulator.clearFilter();
    }
    // Tabulator manages its own pager; show a compact summary
    this.updateSummary(1, Math.max(1, Math.ceil(this.filtered.length / this.pageSize)));
  }

  updateSummary(page, totalPages) {
    if (this.controls.pagerSummary) {
      const totalRows = this.filtered.length;
      this.controls.pagerSummary.textContent = `Showing page ${page} of ${totalPages} — ${totalRows} rows`;
    }
    if (this.controls.pagerPrev) this.controls.pagerPrev.disabled = page <= 1;
    if (this.controls.pagerNext) this.controls.pagerNext.disabled = page >= totalPages;
  }

  exportFiltered(filename = 'export.csv') {
    if (!this.filtered.length) return;
    const headerString = this.headers.join(',');
    const rows = this.filtered.map(row => this.headers.map(key => {
      const value = row[key];
      if (value === null || typeof value === 'undefined') return '';
      const strValue = String(value);
      if (strValue.includes(',')) return `"${strValue.replace(/"/g, '""')}"`;
      return strValue;
    }).join(','));
    const csvContent = [headerString, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename.replace(/\.csv$/, '') + '_filtered.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Expose globally
window.DataTableController = DataTableController;

