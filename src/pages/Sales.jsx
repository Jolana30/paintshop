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
  const [selectedSale, setSelectedSale] = useState(null);

  const filteredSales = sales.filter(s => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const matchesId = s.id.toLowerCase().includes(q);
    const matchesCustomer = s.customer.toLowerCase().includes(q);
    const matchesProduct = s.items.some(item => item.productName.toLowerCase().includes(q));
    return matchesId || matchesCustomer || matchesProduct;
  });

  // Export Sales to Excel
  const handleExportExcel = () => {
    const headers = ["Sale ID", "Date", "Time", "Customer", "Product Code", "Product Name", "Size", "Quantity", "Unit Price (ETB)", "Subtotal (ETB)", "Sale Total (ETB)"];
    const rows = [];

    sales.forEach(sale => {
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

    downloadExcelCsv("jotun_sales_history", headers, rows);
  };

  // Export Sales to PDF
  const handleExportPdf = () => {
    const columns = ["Receipt #", "Date & Time", "Customer", "Items Purchased", "Units", "Total (ETB)"];
    const rows = sales.map(sale => {
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

    const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    const totalUnits = sales.reduce((sum, s) => sum + s.totalItems, 0);

    printOrSaveAsPdf({
      title: "Jotun Paint Sales History Report",
      subtitle: `Recorded sales transactions as of ${new Date().toLocaleDateString()}`,
      columns,
      rows,
      summaryCards: [
        { label: "Total Transactions", value: sales.length },
        { label: "Total Units Sold", value: totalUnits },
        { label: "Gross Revenue", value: formatCurrency(totalRevenue) }
      ]
    });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Sales History</h1>
          <p className="page-subtitle">Track customer orders, receipts, and paint transactions in Birr (ETB)</p>
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

      {/* Filter Toolbar */}
      <div className="section-card mb-4">
        <div className="search-input-wrapper">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search by receipt # (e.g. SALE-1001), customer name, or paint..."
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
          <div className="table-responsive">
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
