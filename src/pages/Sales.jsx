import React, { useState, useMemo, useEffect } from 'react';
import { useStock } from '../context/StockContext';
import {
  ReceiptTextIcon,
  SearchIcon,
  ShoppingCartIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Sales({ setActiveTab, initialDate = '', onClearDateFilter }) {
  const { sales, formatCurrency, currentShop, updateSaleWhtVoucher } = useStock();
  const [editingVoucherSale, setEditingVoucherSale] = useState(null);
  const [inputVoucherNo, setInputVoucherNo] = useState('');
  const [inputVoucherStatus, setInputVoucherStatus] = useState('received');
  const [whtFilter, setWhtFilter] = useState('ALL'); // 'ALL' | 'WHT_ONLY' | 'PENDING_ONLY'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);

  // Quick date presets
  const todayStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const yesterdayStr = useMemo(() => {
    const d = new Date(Date.now() - 86400000);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const currentMonthStr = useMemo(() => {
    return todayStr.substring(0, 7); // "YYYY-MM"
  }, [todayStr]);

  const lastMonthStr = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }, []);

  // Filter states (Default is Today!)
  const [filterMode, setFilterMode] = useState('DAY'); // 'DAY' | 'MONTH' | 'ALL'
  const [selectedDate, setSelectedDate] = useState(() => initialDate || todayStr);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedPayment, setSelectedPayment] = useState('ALL'); // 'ALL', 'Cash', 'CBE', 'Telebirr', 'Sinke', 'Coop', 'Awash', 'Dashen'

  // Expandable advanced details drawer state
  const [showDetails, setShowDetails] = useState(false);

  // Sync initialDate when navigating from dashboard
  useEffect(() => {
    if (initialDate) {
      setFilterMode('DAY');
      setSelectedDate(initialDate);
    }
  }, [initialDate]);

  // Check if non-default filters are active (to highlight the details button)
  const hasActiveAdvancedFilters = filterMode !== 'DAY' || selectedDate !== todayStr || selectedPayment !== 'ALL';

  const formatMonthLabel = (yearMonth) => {
    if (!yearMonth) return '';
    const [y, m] = yearMonth.split('-');
    const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const filteredSales = useMemo(() => {
    return (sales || [])
      .filter(s => {
        if (!s) return false;
        const q = searchTerm.toLowerCase().trim();
        const payType = (s.paymentType || s.customer || 'Cash').trim();

        // 1. Search text filter
        const matchesSearch = !q ||
          (s.id || '').toLowerCase().includes(q) ||
          payType.toLowerCase().includes(q) ||
          ((s.items || []).some(item => (item.productName || '').toLowerCase().includes(q)));

        // 2. Payment Type filter
        let matchesPayment = true;
        if (selectedPayment !== 'ALL') {
          matchesPayment = payType.toLowerCase() === selectedPayment.toLowerCase();
        }

        // 3. Date / Period filter
        let matchesPeriod = true;
        const saleDate = s.localDate || (s.timestamp ? s.timestamp.split('T')[0] : '');

        if (filterMode === 'DAY') {
          matchesPeriod = selectedDate ? saleDate === selectedDate : true;
        } else if (filterMode === 'MONTH') {
          matchesPeriod = selectedMonth ? saleDate.startsWith(selectedMonth) : true;
        }

        return matchesSearch && matchesPayment && matchesPeriod;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [sales, searchTerm, selectedPayment, filterMode, selectedDate, selectedMonth]);

  const totalFilteredRevenue = useMemo(() => filteredSales.reduce((sum, s) => sum + s.total, 0), [filteredSales]);
  const totalFilteredUnits = useMemo(() => filteredSales.reduce((sum, s) => sum + s.totalItems, 0), [filteredSales]);

  // Dynamic filter title for exports & summaries
  const getFilterDescription = () => {
    let periodDesc = 'All Recorded Time';
    if (filterMode === 'DAY') {
      periodDesc = selectedDate === todayStr ? 'Today' : selectedDate === yesterdayStr ? 'Yesterday' : selectedDate;
    } else if (filterMode === 'MONTH') {
      periodDesc = formatMonthLabel(selectedMonth);
    }
    const payDesc = selectedPayment === 'ALL' ? 'All Payment Types' : selectedPayment;
    return `${payDesc} • ${periodDesc}`;
  };

  // Export Sales to Excel (respects payment and period filters)
  const handleExportExcel = () => {
    const now = new Date();
    const filterDesc = getFilterDescription();

    const titleRows = [
      [`JOTUN PAINT SHOP — SALES REGISTER (${filterDesc.toUpperCase()})`],
      [`Exported: ${now.toLocaleDateString()} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`],
      [`Total Transactions: ${filteredSales.length} | Units Sold: ${totalFilteredUnits} | Total Revenue: ${totalFilteredRevenue.toFixed(2)} ETB`],
      [""]
    ];

    const headers = ["Sale ID", "Date", "Time", "Payment Type", "Product Code", "Product Name", "Size", "Quantity", "Unit Price (ETB)", "Subtotal (ETB)", "Sale Total (ETB)"];
    const rows = [];

    filteredSales.forEach(sale => {
      const dt = new Date(sale.timestamp);
      const dateStr = dt.toLocaleDateString();
      const timeStr = dt.toLocaleTimeString();
      const payType = sale.paymentType || sale.customer || 'Cash';

      sale.items.forEach(item => {
        rows.push([
          sale.id,
          dateStr,
          timeStr,
          payType,
          item.code,
          item.productName,
          item.size,
          item.quantity,
          item.unitPrice.toFixed(2),
          item.subtotal.toFixed(2),
          sale.total.toFixed(2)
        ]);
      });
    });

    const fileTag = `${selectedPayment.toLowerCase()}_${filterMode.toLowerCase()}`;
    downloadExcelCsv(
      `jotun_sales_${fileTag}`,
      headers,
      rows,
      titleRows
    );
  };

  // Export Sales to PDF (respects payment and period filters)
  const handleExportPdf = () => {
    const filterDesc = getFilterDescription();
    const columns = ["Receipt #", "Date & Time", "Payment Type", "Items Purchased", "Units", "Total (ETB)"];
    const rows = filteredSales.map(sale => {
      const dt = new Date(sale.timestamp);
      const itemsSummary = sale.items.map(i => `${i.quantity}x ${i.productName} (${i.size})`).join('<br/>');
      const payType = sale.paymentType || sale.customer || 'Cash';

      return [
        `<strong>${sale.id}</strong>`,
        `${dt.toLocaleDateString()}<br/><small style="color:#64748b;">${dt.toLocaleTimeString()}</small>`,
        `<span style="color:#1e40af; font-weight:700;">${payType}</span>`,
        itemsSummary,
        `<strong>${sale.totalItems}</strong>`,
        `<strong style="color:#059669;">${formatCurrency(sale.total)}</strong>`
      ];
    });

    printOrSaveAsPdf({
      title: `Jotun Sales Register — ${filterDesc}`,
      subtitle: `Filtered transactions as of ${new Date().toLocaleDateString()}`,
      columns,
      rows,
      summaryCards: [
        { label: "Transactions", value: filteredSales.length },
        { label: "Units Sold", value: totalFilteredUnits },
        { label: "Gross Revenue", value: formatCurrency(totalFilteredRevenue) }
      ]
    });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales History</h1>
          <p className="page-subtitle">Track receipts, bank collections (CBE, Telebirr, etc.), and daily/monthly revenue in Birr (ETB)</p>
        </div>
        <div className="header-actions-group">
          <button
            type="button"
            className="btn-export-excel"
            onClick={handleExportExcel}
            title="Download CSV file for Microsoft Excel"
          >
            📊 Export Excel
          </button>
          <button
            type="button"
            className="btn-export-pdf"
            onClick={handleExportPdf}
            title="Print or Save Sales History as PDF"
          >
            📄 Export PDF
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setActiveTab('newsale')}
          >
            <ShoppingCartIcon size={18} />
            + New Sale
          </button>
        </div>
      </div>

      {/* Filter Toolbar: Search + Date/Month Mode + Payment Type */}
      <div className="section-card mb-4" style={{ padding: '1.15rem' }}>
        {/* Row 1: Search Box */}
        <div className="search-input-wrapper mb-3">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search by receipt # (e.g. SALE-1001), bank/cash, or paint name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-input search-input"
          />
          {searchTerm && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchTerm('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Landing Control Row: Date quick-picker + View in Details button */}
        <div className="sales-landing-row">
          {/* Quick Date Switcher for Landing View */}
          <div className="sales-landing-date-group">
            <span className="text-xs font-bold text-muted uppercase">Date:</span>
            <input
              type="date"
              value={filterMode === 'DAY' ? selectedDate : ''}
              onChange={(e) => {
                setFilterMode('DAY');
                setSelectedDate(e.target.value);
              }}
              className="sales-date-input"
              title="Pick a specific date"
            />
            <button
              type="button"
              className={`quick-date-btn ${filterMode === 'DAY' && selectedDate === todayStr ? 'active' : ''}`}
              onClick={() => {
                setFilterMode('DAY');
                setSelectedDate(todayStr);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={`quick-date-btn ${filterMode === 'DAY' && selectedDate === yesterdayStr ? 'active' : ''}`}
              onClick={() => {
                setFilterMode('DAY');
                setSelectedDate(yesterdayStr);
              }}
            >
              Yesterday
            </button>
          </div>

          {/* Expandable Details Button & Reset action */}
          <div className="sales-landing-actions">
            {hasActiveAdvancedFilters && (
              <button
                type="button"
                className="btn-reset-filters text-xs"
                onClick={() => {
                  setFilterMode('DAY');
                  setSelectedDate(todayStr);
                  setSelectedMonth(currentMonthStr);
                  setSelectedPayment('ALL');
                  setSearchTerm('');
                  if (onClearDateFilter) onClearDateFilter();
                }}
                title="Reset to today's sales"
              >
                Reset to Today ✕
              </button>
            )}

            <button
              type="button"
              className={`btn-details-toggle ${showDetails ? 'active' : ''}`}
              onClick={() => setShowDetails(prev => !prev)}
              title="Click to view monthly periods, all time, or bank breakdowns"
            >
              <span>📅 Period & Banks</span>
              {hasActiveAdvancedFilters && <span className="details-active-dot" title="Custom filter active">●</span>}
              <span className="toggle-chevron">{showDetails ? '▴' : '▾'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Details Drawer: Period Selector & Bank Breakdown */}
        {showDetails && (
          <div className="sales-details-drawer mt-3 pt-3">
            {/* Period Selector (Daily vs Monthly vs All Time) */}
            <div className="sales-filter-row mb-3">
              <div className="filter-group">
                <span className="filter-group-label">View Period:</span>
                <button
                  type="button"
                  className={`filter-toggle-btn ${filterMode === 'DAY' ? 'active' : ''}`}
                  onClick={() => setFilterMode('DAY')}
                >
                  📅 Daily
                </button>
                <button
                  type="button"
                  className={`filter-toggle-btn ${filterMode === 'MONTH' ? 'active' : ''}`}
                  onClick={() => setFilterMode('MONTH')}
                >
                  🗓️ Monthly
                </button>
                <button
                  type="button"
                  className={`filter-toggle-btn ${filterMode === 'ALL' ? 'active' : ''}`}
                  onClick={() => {
                    setFilterMode('ALL');
                    if (onClearDateFilter) onClearDateFilter();
                  }}
                >
                  All Time
                </button>
              </div>

              {/* Monthly Subgroup */}
              {filterMode === 'MONTH' && (
                <div className="filter-subgroup">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="sales-date-input"
                    title="Select specific month"
                  />
                  <button
                    type="button"
                    className={`quick-date-btn ${selectedMonth === currentMonthStr ? 'active' : ''}`}
                    onClick={() => setSelectedMonth(currentMonthStr)}
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    className={`quick-date-btn ${selectedMonth === lastMonthStr ? 'active' : ''}`}
                    onClick={() => setSelectedMonth(lastMonthStr)}
                  >
                    Last Month
                  </button>
                </div>
              )}
            </div>

            {/* Payment Type Filter (Cash, CBE, Telebirr, Sinke, Coop, Awash, Dashen) */}
            <div className="sales-filter-row">
              <div className="filter-group">
                <span className="filter-group-label">Tax / WHT:</span>
                <button
                  type="button"
                  className={`filter-toggle-btn ${whtFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setWhtFilter('ALL')}
                >
                  All Invoices
                </button>
                <button
                  type="button"
                  className={`filter-toggle-btn ${whtFilter === 'WHT_ONLY' ? 'active' : ''}`}
                  onClick={() => setWhtFilter('WHT_ONLY')}
                >
                  📋 3% WHT Sales
                </button>
                <button
                  type="button"
                  className={`filter-toggle-btn ${whtFilter === 'PENDING_ONLY' ? 'active' : ''}`}
                  onClick={() => setWhtFilter('PENDING_ONLY')}
                >
                  ⏳ Pending Vouchers
                </button>
              </div>
            </div>

            <div className="sales-filter-row">
              <div className="filter-group">
                <span className="filter-group-label">Payment / Bank:</span>
                {['ALL', 'Cash', 'CBE', 'Telebirr', 'Sinke', 'Coop', 'Awash', 'Dashen'].map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`filter-toggle-btn ${selectedPayment === type ? 'active' : ''}`}
                    onClick={() => setSelectedPayment(type)}
                  >
                    {type === 'ALL' ? 'All Payments' : type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Active Filter Answer Banner (e.g. "Total CBE in August") */}
        <div className="sales-day-summary-banner mt-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge-pill badge-primary font-bold">
                {getFilterDescription()}
              </span>
              <span className="text-xs text-muted">
                <strong>{filteredSales.length}</strong> transactions • <strong>{totalFilteredUnits}</strong> units sold
              </span>
            </div>
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              Live total of sales matching your selected bank & period
            </p>
          </div>
          <strong className="text-success text-xl" style={{ fontWeight: 800 }}>
            {formatCurrency(totalFilteredRevenue)}
          </strong>
        </div>
      </div>

      {/* Sales Table */}
      <div className="section-card">
        {filteredSales.length === 0 ? (
          <div className="empty-state">
            <ReceiptTextIcon size={40} className="text-muted" />
            <p>No sales records found.</p>
            <button
              type="button"
              className="btn-primary mt-2"
              onClick={() => setActiveTab('newsale')}
            >
              Record First Sale Now
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="table-responsive desktop-only-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Receipt #</th>
                    <th>Date & Time</th>
                    <th>Payment Type</th>
                    <th>Items Breakdown</th>
                    <th>Total Units</th>
                    <th>Sale Total</th>
                    <th>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSales.map((sale, index) => {
                    const dt = new Date(sale.timestamp);
                    const isRecent = index === 0 && (Date.now() - dt.getTime() < 1000 * 60 * 10);
                    const payType = sale.paymentType || sale.customer || 'Cash';
                    return (
                      <tr key={sale.id} className={isRecent ? 'row-recently-recorded' : ''}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                            <strong className="text-primary font-mono">{sale.id}</strong>
                            {isRecent && (
                              <span className="badge-pill badge-healthy" style={{ fontSize: '9px' }}>
                                NEW
                              </span>
                            )}
                            {sale.isWithholding && (
                              <span className="badge-pill badge-warning" style={{ fontSize: '9px' }}>
                                3% WHT
                              </span>
                            )}
                          </div>
                          {sale.isWithholding && (
                            <div className="text-xs text-muted mt-1">
                              {sale.whtVoucherStatus === 'received' ? (
                                <span className="text-success font-semibold">✓ Voucher: {sale.whtVoucherNumber || 'On file'}</span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-link-action text-warning"
                                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' }}
                                  onClick={() => {
                                    setEditingVoucherSale(sale);
                                    setInputVoucherNo(sale.whtVoucherNumber || '');
                                    setInputVoucherStatus('received');
                                  }}
                                  title="Click to enter voucher serial"
                                >
                                  ⏳ Voucher Pending ✎
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td>
                          <div className="text-sm">
                            <div>{dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            <div className="text-xs text-muted">{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-pill badge-neutral font-semibold">{payType}</span>
                        </td>
                        <td>
                          <div className="line-items-summary">
                            {sale.items.map((item, idx) => (
                              <div key={idx} className="item-summary-line">
                                <strong>{item.quantity}x</strong> {item.productName} ({item.size}) — {formatCurrency(item.subtotal)}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td>
                          <strong>{sale.totalItems}</strong>
                        </td>
                        <td>
                          {sale.isWithholding ? (
                            <div>
                              <strong className="text-success text-md">{formatCurrency(sale.netPayable)}</strong>
                              <div className="text-xs text-muted" style={{ textDecoration: 'line-through' }}>
                                Gross: {formatCurrency(sale.grossTotal || sale.total)}
                              </div>
                            </div>
                          ) : (
                            <strong className="text-success text-md">{formatCurrency(sale.total)}</strong>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn-outline-xs"
                            onClick={() => setSelectedSale(sale)}
                          >
                            View Receipt
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Native Transaction Cards */}
            <div className="mobile-only-cards">
              {filteredSales.map((sale, index) => {
                const dt = new Date(sale.timestamp);
                const isRecent = index === 0 && (Date.now() - dt.getTime() < 1000 * 60 * 10);
                return (
                  <div key={sale.id} className={`mobile-sale-card ${isRecent ? 'card-recently-recorded' : ''}`}>
                    <div className="msc-header">
                      <div>
                        <strong className="msc-id font-mono">{sale.id}</strong>
                        {isRecent && (
                          <span className="badge-pill badge-healthy ml-2" style={{ fontSize: '10px', padding: '0.15rem 0.4rem' }}>
                            NEW
                          </span>
                        )}
                        <span className="msc-customer font-semibold">{sale.paymentType || sale.customer || 'Cash'}</span>
                      </div>
                      <div className="msc-time">
                        <span>{dt.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        <small>{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                      </div>
                    </div>

                    <div className="msc-items">
                      {sale.items.map((item, idx) => (
                        <div key={idx} className="msc-item-line">
                          <span><strong>{item.quantity}x</strong> {item.productName} ({item.size})</span>
                          <span className="text-muted">{formatCurrency(item.subtotal)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="msc-footer">
                      <div className="msc-total-block">
                        <span className="msc-items-count">{sale.totalItems} unit(s) total</span>
                        <strong className="msc-total-val text-success">{formatCurrency(sale.total)}</strong>
                      </div>
                      <button
                        type="button"
                        className="btn-msc-receipt"
                        onClick={() => setSelectedSale(sale)}
                      >
                        Receipt ➔
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Sale Receipt Modal */}
      {selectedSale && (
        <div className="modal-overlay" onClick={() => setSelectedSale(null)}>
          <div className="modal-box receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="receipt-paper">
              <div className="receipt-top">
                <h3>Jotun Paint Manager</h3>
                <p className="text-xs text-muted">Paint & Coating Solutions (ETB)</p>
                <div className="receipt-divider"></div>
                <div className="receipt-meta-grid">
                  <div>
                    <span className="text-muted text-xs">Receipt No:</span>
                    <strong>{selectedSale.id}</strong>
                  </div>
                  <div>
                    <span className="text-muted text-xs">Date:</span>
                    <span>{new Date(selectedSale.timestamp).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted text-xs">Payment Method:</span>
                    <strong className="badge-pill badge-neutral" style={{ display: 'inline-block', marginTop: '2px' }}>
                      {selectedSale.paymentType || selectedSale.customer || 'Cash'}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="receipt-divider"></div>

              <div className="receipt-items-table">
                <div className="receipt-item-header">
                  <span>Item</span>
                  <span className="text-center">Qty</span>
                  <span className="text-right">Price</span>
                  <span className="text-right">Amount</span>
                </div>
                {selectedSale.items.map((item, idx) => (
                  <div key={idx} className="receipt-item-row">
                    <div>
                      <span className="font-semibold text-xs">{item.productName}</span>
                      <div className="text-xs text-muted">{item.size} • {item.code}</div>
                      {item.colorantCost > 0 && (
                        <div className="text-xs text-primary" style={{ fontWeight: 600 }}>
                          🎨 Colorant: +{formatCurrency(item.colorantCost * 1.15)} (inc VAT)
                        </div>
                      )}
                    </div>
                    <div className="text-center text-xs">{item.quantity}</div>
                    <div className="text-right text-xs">{formatCurrency(item.unitPrice)}</div>
                    <div className="text-right text-xs font-bold">{formatCurrency(item.subtotal)}</div>
                  </div>
                ))}
              </div>

              <div className="receipt-divider"></div>

              <div className="receipt-totals">
                <div className="receipt-total-row">
                  <span>Items Count:</span>
                  <span>{selectedSale.totalItems} units</span>
                </div>
                <div className="receipt-total-row">
                  <span>Tax (Included 15% VAT):</span>
                  <span>{formatCurrency(selectedSale.total - selectedSale.total / 1.15)}</span>
                </div>
                <div className="receipt-total-row grand-total">
                  <strong>Total Paid:</strong>
                  <strong>{formatCurrency(selectedSale.total)}</strong>
                </div>
              </div>

              <div className="receipt-footer">
                <p className="text-xs text-muted text-center">Thank you for choosing Jotun Paints!</p>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-outline-sm w-full"
                onClick={() => setSelectedSale(null)}
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Update Withholding Voucher Modal */}
      {editingVoucherSale && (
        <div className="modal-backdrop" onClick={() => setEditingVoucherSale(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Withholding Tax Voucher</h3>
                <p className="modal-subtitle">Invoice #{editingVoucherSale.id} • {editingVoucherSale.customer}</p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setEditingVoucherSale(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={(e) => {
              e.preventDefault();
              updateSaleWhtVoucher(editingVoucherSale.id, inputVoucherNo.trim(), inputVoucherStatus);
              setEditingVoucherSale(null);
            }} className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label font-bold">Voucher Serial Number (የደረሰኝ ቁጥር)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WHT-2026-08942"
                  value={inputVoucherNo}
                  onChange={(e) => setInputVoucherNo(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label font-bold">Voucher Status</label>
                <select
                  value={inputVoucherStatus}
                  onChange={(e) => setInputVoucherStatus(e.target.value)}
                  className="form-select"
                >
                  <option value="received">✓ Physical / Digital Voucher In Hand</option>
                  <option value="pending">⏳ Still Pending Collection from Client</option>
                </select>
              </div>

              <div className="modal-footer mt-4" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => setEditingVoucherSale(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Save Voucher Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}