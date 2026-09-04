import React, { useState } from 'react';
import { useStock } from '../context/StockContext';
import {
  BarChart3Icon,
  ReceiptTextIcon,
  PackageIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Reports() {
  const { products, sales, movements, lowStockProducts, todayRevenue, todayItemsSold, formatCurrency } = useStock();

  const [activeSubTab, setActiveSubTab] = useState('summary'); // 'summary', 'audit'
  const [movementFilter, setMovementFilter] = useState('ALL'); // ALL, SALE, STOCK_IN, ADJUSTMENT

  // Total inventory metrics
  const totalStockUnits = products.reduce((sum, p) => sum + p.stock, 0);
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock * p.priceWithVat), 0);

  const filteredMovements = movements.filter(m => {
    if (movementFilter === 'ALL') return true;
    return m.type === movementFilter;
  });

  // Export Daily Closing Report to Excel
  const handleExportClosingExcel = () => {
    const headers = ["Product Code", "Product Name", "Size", "Closing Stock (Units)", "Safety Min Stock", "Unit Price (+15% VAT ETB)", "Total Valuation (ETB)", "Status"];
    const rows = products.map(p => [
      p.code,
      p.name,
      p.size,
      p.stock,
      p.minStock,
      p.priceWithVat.toFixed(2),
      (p.stock * p.priceWithVat).toFixed(2),
      p.stock === 0 ? "OUT_OF_STOCK" : p.stock <= p.minStock ? "LOW_STOCK" : "OK"
    ]);

    downloadExcelCsv("jotun_daily_closing_stock", headers, rows);
  };

  // Export Daily Closing Report to PDF
  const handleExportClosingPdf = () => {
    const columns = ["Code", "Product", "Size", "Closing Stock", "Min Level", "Unit Price (+VAT)", "Total Value (ETB)"];
    const rows = products.map(p => [
      p.code,
      p.name,
      p.size,
      `<strong>${p.stock} units</strong>`,
      `${p.minStock}`,
      formatCurrency(p.priceWithVat),
      formatCurrency(p.stock * p.priceWithVat)
    ]);

    printOrSaveAsPdf({
      title: "Jotun Daily Closing Stock Report",
      subtitle: `End-of-day stock reconciliation as of ${new Date().toLocaleDateString()}`,
      columns,
      rows,
      summaryCards: [
        { label: "Today's Revenue", value: formatCurrency(todayRevenue) },
        { label: "Units Sold Today", value: todayItemsSold },
        { label: "Total Units in Shop", value: totalStockUnits },
        { label: "Total Inventory Value", value: formatCurrency(totalInventoryValue) }
      ]
    });
  };

  // Export Audit Trail to Excel
  const handleExportAuditExcel = () => {
    const headers = ["Movement ID", "Date", "Time", "Product Name", "Event Type", "Quantity Change", "Previous Stock", "New Stock", "Reference / Reason"];
    const rows = movements.map(m => {
      const dt = new Date(m.timestamp);
      return [
        m.id,
        dt.toLocaleDateString(),
        dt.toLocaleTimeString(),
        m.productName,
        m.type,
        m.quantity,
        m.previousStock,
        m.newStock,
        m.reference || ''
      ];
    });

    downloadExcelCsv("jotun_stock_audit_trail", headers, rows);
  };

  // Export Audit Trail to PDF
  const handleExportAuditPdf = () => {
    const columns = ["Timestamp", "Product", "Type", "Change", "Shift", "Reference / Note"];
    const rows = filteredMovements.map(m => {
      const dt = new Date(m.timestamp);
      return [
        `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        `<strong>${m.productName}</strong>`,
        m.type,
        `<span style="color:${m.quantity > 0 ? '#059669' : '#dc2626'}; font-weight:bold;">${m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span>`,
        `${m.previousStock} ➔ ${m.newStock}`,
        m.reference || ''
      ];
    });

    printOrSaveAsPdf({
      title: "Jotun Complete Stock Movement Audit Trail",
      subtitle: `Audit record of sales, shipments, and inventory adjustments`,
      columns,
      rows,
      summaryCards: [
        { label: "Total Logged Movements", value: movements.length },
        { label: "Sales Deductions", value: movements.filter(m => m.type === 'SALE').length },
        { label: "Stock Receipts", value: movements.filter(m => m.type === 'STOCK_IN').length },
        { label: "Manual Adjustments", value: movements.filter(m => m.type === 'ADJUSTMENT').length }
      ]
    });
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Audit Log</h1>
          <p className="page-subtitle">End-of-day reconciliation and complete stock movement verification in Birr (ETB)</p>
        </div>
        <div className="header-actions-group">
          {activeSubTab === 'summary' ? (
            <>
              <button
                type="button"
                className="btn-export-excel"
                onClick={handleExportClosingExcel}
                title="Download Closing Stock Excel file"
              >
                📊 Export Excel
              </button>
              <button
                type="button"
                className="btn-export-pdf"
                onClick={handleExportClosingPdf}
                title="Print or Save Closing Stock as PDF"
              >
                📄 Export PDF
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-export-excel"
                onClick={handleExportAuditExcel}
                title="Download Stock Movements Audit Log Excel"
              >
                📊 Export Excel
              </button>
              <button
                type="button"
                className="btn-export-pdf"
                onClick={handleExportAuditPdf}
                title="Print or Save Audit Trail as PDF"
              >
                📄 Export PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reports Navigation Subtabs */}
      <div className="tabs-navigation mb-4">
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('summary')}
        >
          Daily Closing Summary
        </button>
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'audit' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('audit')}
        >
          Stock Movement Audit Trail ({movements.length})
        </button>
      </div>

      {activeSubTab === 'summary' && (
        <>
          {/* Top KPI Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon-wrap bg-blue-subtle text-primary">
                <ReceiptTextIcon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Today's Revenue</span>
                <span className="stat-value">{formatCurrency(todayRevenue)}</span>
                <span className="stat-subtext">Automatically compiled in ETB</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrap bg-emerald-subtle text-success">
                <PackageIcon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Units Sold Today</span>
                <span className="stat-value">{todayItemsSold}</span>
                <span className="stat-subtext">No manual Excel counting needed</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrap bg-purple-subtle text-purple">
                <PackageIcon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total Stock on Hand</span>
                <span className="stat-value">{totalStockUnits}</span>
                <span className="stat-subtext">Across {products.length} Jotun products</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrap bg-emerald-subtle text-success">
                <BarChart3Icon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Inventory Valuation</span>
                <span className="stat-value">{formatCurrency(totalInventoryValue)}</span>
                <span className="stat-subtext">At retail VAT price</span>
              </div>
            </div>
          </div>

          {/* End-of-Day Closing Stock Table */}
          <div className="section-card mt-4">
            <div className="section-header-flex">
              <div>
                <h3 className="section-heading">End-of-Day Closing Stock</h3>
                <p className="text-muted text-sm">
                  Replaces manual Excel changes: closing stock is continuously derived from sales & incoming stock.
                </p>
              </div>
            </div>

            <div className="table-responsive">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Size</th>
                    <th>Closing Stock</th>
                    <th>Safety Min</th>
                    <th>Status</th>
                    <th>Total Inventory Value</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => {
                    const isOut = p.stock === 0;
                    const isLow = p.stock <= p.minStock && !isOut;
                    return (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <div className="text-xs text-muted">{p.code}</div>
                        </td>
                        <td><span className="badge-tag">{p.size}</span></td>
                        <td>
                          <span className={`stock-number font-bold ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                            {p.stock} units
                          </span>
                        </td>
                        <td className="text-muted">{p.minStock} units</td>
                        <td>
                          {isOut ? (
                            <span className="badge-pill badge-danger">OUT OF STOCK</span>
                          ) : isLow ? (
                            <span className="badge-pill badge-warning">LOW STOCK</span>
                          ) : (
                            <span className="badge-pill badge-healthy">OK</span>
                          )}
                        </td>
                        <td>
                          <strong>{formatCurrency(p.stock * p.priceWithVat)}</strong>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeSubTab === 'audit' && (
        <div className="section-card">
          <div className="section-header-flex">
            <div>
              <h3 className="section-heading">Complete Stock Movement Audit Trail</h3>
              <p className="text-muted text-sm">
                Eliminates unexplained inventory changes by tracking every Sale, Stock In, and Adjustment.
              </p>
            </div>
            {/* Movement Type Filter */}
            <div className="movement-filter-pills">
              <button
                type="button"
                className={`pill-btn ${movementFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setMovementFilter('ALL')}
              >
                All ({movements.length})
              </button>
              <button
                type="button"
                className={`pill-btn ${movementFilter === 'SALE' ? 'active' : ''}`}
                onClick={() => setMovementFilter('SALE')}
              >
                Sales ({movements.filter(m => m.type === 'SALE').length})
              </button>
              <button
                type="button"
                className={`pill-btn ${movementFilter === 'STOCK_IN' ? 'active' : ''}`}
                onClick={() => setMovementFilter('STOCK_IN')}
              >
                Stock In ({movements.filter(m => m.type === 'STOCK_IN').length})
              </button>
              <button
                type="button"
                className={`pill-btn ${movementFilter === 'ADJUSTMENT' ? 'active' : ''}`}
                onClick={() => setMovementFilter('ADJUSTMENT')}
              >
                Adjustments ({movements.filter(m => m.type === 'ADJUSTMENT').length})
              </button>
            </div>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Product</th>
                  <th>Event Type</th>
                  <th>Change</th>
                  <th>Stock Shift</th>
                  <th>Reference / Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredMovements.map(m => {
                  const isSale = m.type === 'SALE';
                  const isStockIn = m.type === 'STOCK_IN';
                  return (
                    <tr key={m.id}>
                      <td className="text-sm text-muted">
                        <div>{new Date(m.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        <div className="text-xs">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td>
                        <strong>{m.productName}</strong>
                      </td>
                      <td>
                        <span className={`badge-pill ${isSale ? 'badge-neutral' : isStockIn ? 'badge-healthy' : 'badge-warning'}`}>
                          {m.type}
                        </span>
                      </td>
                      <td>
                        <strong className={`text-md ${m.quantity > 0 ? 'text-success' : 'text-danger'}`}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </strong>
                      </td>
                      <td>
                        <span className="text-muted">{m.previousStock}</span>
                        <span className="mx-2 text-muted">➔</span>
                        <strong className="text-primary">{m.newStock}</strong>
                      </td>
                      <td>
                        <span className="font-mono text-xs">{m.reference}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
