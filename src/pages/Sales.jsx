import React, { useState } from 'react';
import { useStock } from '../context/StockContext';
import {
  ReceiptTextIcon,
  SearchIcon,
  ShoppingCartIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Sales({ setActiveTab }) {
  const { sales, formatCurrency } = useStock();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState(''); // '' means all dates, or 'YYYY-MM-DD'
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

  const filteredSales = useMemo(() => {
    return sales
      .filter(s => {
        const q = searchTerm.toLowerCase().trim();
        const matchesSearch = !q ||
          s.id.toLowerCase().includes(q) ||
          s.customer.toLowerCase().includes(q) ||
          s.items.some(item => item.productName.toLowerCase().includes(q));

        let matchesDate = true;
        if (selectedDate) {
          const saleDate = s.localDate || (s.timestamp ? s.timestamp.split('T')[0] : '');
          matchesDate = saleDate === selectedDate;
        }

        return matchesSearch && matchesDate;
      })
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [sales, searchTerm, selectedDate]);

  const totalFilteredRevenue = useMemo(() => filteredSales.reduce((sum, s) => sum + s.total, 0), [filteredSales]);
  const totalFilteredUnits = useMemo(() => filteredSales.reduce((sum, s) => sum + s.totalItems, 0), [filteredSales]);

  // Export Sales to Excel (respects current date filter)
  const handleExportExcel = () => {
    const now = new Date();
    const dateTitle = selectedDate ? `Sales for ${selectedDate}` : `All Sales History`;

    const titleRows = [
      [`JOTUN PAINT SHOP — ${dateTitle.toUpperCase()}`],
      [`Exported: ${now.toLocaleDateString()} at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`],
      [`Total Transactions: ${filteredSales.length} | Units Sold: ${totalFilteredUnits} | Total Revenue: ${totalFilteredRevenue.toFixed(2)} ETB`],
      [""]
    ];

    const headers = ["Sale ID", "Date", "Time", "Customer", "Product Code", "Product Name", "Size", "Quantity", "Unit Price (ETB)", "Subtotal (ETB)", "Sale Total (ETB)"];
    const rows = [];

    filteredSales.forEach(sale => {
      const dt = new Date(sale.timestamp);
      const dateStr = dt.toLocaleDateString();
      const timeStr = dt.toLocaleTimeString();

      sale.items.forEach(item => {
        rows.push([
          sale.id,
          dateStr,
          timeStr,
          sale.customer,
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

    downloadExcelCsv(
      selectedDate ? `jotun_sales_${selectedDate}` : "jotun_sales_history",
      headers,
      rows,
      titleRows
    );
  };

  // Export Sales to PDF (respects current date filter)
  const handleExportPdf = () => {
    const columns = ["Receipt #", "Date & Time", "Customer", "Items Purchased", "Units", "Total (ETB)"];
    const rows = filteredSales.map(sale => {
      const dt = new Date(sale.timestamp);
      const itemsSummary = sale.items.map(i => `${i.quantity}x ${i.productName} (${i.size})`).join('<br/>');
      return [
        `<strong>${sale.id}</strong>`,
        `${dt.toLocaleDateString()}<br/><small style="color:#64748b;">${dt.toLocaleTimeString()}</small>`,
        sale.customer,
        itemsSummary,
        `<strong>${sale.totalItems}</strong>`,
        `<strong style="color:#059669;">${formatCurrency(sale.total)}</strong>`
      ];
    });

    printOrSaveAsPdf({
      title: selectedDate ? `Jotun Sales Register — ${selectedDate}` : "Jotun Paint Sales History Report",
      subtitle: selectedDate
        ? `Filtered transactions for ${selectedDate}`
        : `All recorded transactions as of ${new Date().toLocaleDateString()}`,
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
          <p className="page-subtitle">Track customer orders, daily receipts, and revenue in Birr (ETB)</p>
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

      {/* Filter Toolbar: Search + Date Chooser */}
      <div className="section-card mb-4" style={{ padding: '1rem 1.25rem' }}>
        <div className="sales-toolbar-grid">
          {/* Search Box */}
          <div className="search-input-wrapper">
            <SearchIcon size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search by receipt # (e.g. SALE-1001), customer, or paint..."
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

          {/* Date Chooser Controls */}
          <div className="sales-date-chooser">
            <div className="date-picker-field">
              <span className="date-picker-label">Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="form-input sales-date-input"
                title="Choose specific date"
              />
            </div>

            <div className="quick-date-buttons">
              <button
                type="button"
                className={`quick-date-btn ${selectedDate === todayStr ? 'active' : ''}`}
                onClick={() => setSelectedDate(todayStr)}
              >
                Today
              </button>
              <button
                type="button"
                className={`quick-date-btn ${selectedDate === yesterdayStr ? 'active' : ''}`}
                onClick={() => setSelectedDate(yesterdayStr)}
              >
                Yesterday
              </button>
              <button
                type="button"
                className={`quick-date-btn ${!selectedDate ? 'active' : ''}`}
                onClick={() => setSelectedDate('')}
              >
                All Dates
              </button>
            </div>
          </div>
        </div>

        {/* Active Date Summary Banner */}
        {selectedDate && (
          <div className="sales-day-summary-banner mt-3">
            <div className="flex items-center gap-2">
              <span className="badge-pill badge-primary">Day Filter: {selectedDate}</span>
              <span className="text-sm text-muted">
                Showing <strong>{filteredSales.length}</strong> sale(s) — <strong>{totalFilteredUnits}</strong> units sold
              </span>
            </div>
            <strong className="text-success text-md">
              Day Total: {formatCurrency(totalFilteredRevenue)}
            </strong>
          </div>
        )}
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
                    <th>Customer</th>
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
                    return (
                      <tr key={sale.id} className={isRecent ? 'row-recently-recorded' : ''}>
                        <td>
                          <strong className="text-primary font-mono">{sale.id}</strong>
                          {isRecent && (
                            <span className="badge-pill badge-healthy" style={{ marginLeft: '6px', fontSize: '10px' }}>
                              JUST RECORDED
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="text-sm">
                            <div>{dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                            <div className="text-xs text-muted">{dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </td>
                        <td>
                          <span className="badge-pill badge-neutral">{sale.customer}</span>
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
                          <strong className="text-success text-md">{formatCurrency(sale.total)}</strong>
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
                        <span className="msc-customer">{sale.customer}</span>
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
                    <span className="text-muted text-xs">Customer:</span>
                    <span>{selectedSale.customer}</span>
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
    </div>
  );
}
