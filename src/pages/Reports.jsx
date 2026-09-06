import { useState } from 'react';
import { useStock } from '../context/StockContext';
import {
  BarChart3Icon,
  ReceiptTextIcon,
  PackageIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Reports() {
  const {
    products,
    withheldSales,
    movements,
    todayRevenue,
    todayItemsSold,
    totalWithholdingCredits,
    pendingVouchersCount,
    currentShop,
    formatCurrency
  } = useStock();

  const [activeSubTab, setActiveSubTab] = useState('summary'); // 'summary', 'audit', 'withholding'

  // Export Withholding Tax Ledger to Excel (Ministry of Revenues Format)
  const handleExportWhtExcel = () => {
    const headers = ["Invoice #", "Date", "Customer / Contractor", "Customer TIN", "Voucher Number", "Gross Total (ETB)", "3% Withholding Tax (ETB)", "Net Cash Collected (ETB)", "Voucher Status"];
    const rows = (withheldSales || []).map(s => {
      const dt = new Date(s.timestamp);
      return [
        s.id,
        dt.toLocaleDateString(),
        s.customer,
        s.customerTin || 'N/A',
        s.whtVoucherNumber || 'PENDING',
        (s.grossTotal || s.total).toFixed(2),
        (s.withholdingAmount || 0).toFixed(2),
        (s.netPayable !== undefined ? s.netPayable : s.total).toFixed(2),
        s.whtVoucherStatus === 'received' ? 'RECEIVED' : 'PENDING'
      ];
    });

    downloadExcelCsv("withholding_tax_mor_ledger", headers, rows);
  };

  // Export Withholding Tax Ledger to PDF
  const handleExportWhtPdf = () => {
    const columns = ["Invoice", "Date", "Customer / Contractor", "Customer TIN", "Voucher #", "Gross", "3% WHT", "Net Paid"];
    const rows = (withheldSales || []).map(s => {
      const dt = new Date(s.timestamp);
      return [
        s.id,
        dt.toLocaleDateString(),
        `<strong>${s.customer}</strong>`,
        s.customerTin || 'N/A',
        s.whtVoucherNumber || '<em>Pending</em>',
        formatCurrency(s.grossTotal || s.total),
        `<span style="color:#dc2626; font-weight:bold;">-${formatCurrency(s.withholdingAmount)}</span>`,
        formatCurrency(s.netPayable)
      ];
    });

    const totalGross = (withheldSales || []).reduce((sum, s) => sum + (s.grossTotal || s.total), 0);

    printOrSaveAsPdf({
      title: "Withholding Tax (WHT) Ledger & Credits",
      subtitle: `${currentShop?.name || 'Jotun Paint Store'} — Ministry of Revenues (MoR) Schedule as of ${new Date().toLocaleDateString()}`,
      columns,
      rows,
      summaryCards: [
        { label: "Total Gross Withheld Sales", value: formatCurrency(totalGross) },
        { label: "Total 3% WHT Credits", value: formatCurrency(totalWithholdingCredits) },
        { label: "Pending Vouchers", value: `${pendingVouchersCount} pending` }
      ]
    });
  };
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
          ) : activeSubTab === 'audit' ? (
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
          ) : (
            <>
              <button
                type="button"
                className="btn-export-excel"
                onClick={handleExportWhtExcel}
                title="Download MoR Withholding Tax Excel Schedule"
              >
                📊 Export WHT Schedule
              </button>
              <button
                type="button"
                className="btn-export-pdf"
                onClick={handleExportWhtPdf}
                title="Print or Save WHT Summary as PDF"
              >
                📄 Print WHT Summary
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
        <button
          type="button"
          className={`tab-btn ${activeSubTab === 'withholding' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('withholding')}
        >
          📋 3% Withholding Tax (WHT) Ledger ({withheldSales?.length || 0})
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
      {/* 3% Withholding Tax (WHT) Ledger Tab */}
      {activeSubTab === 'withholding' && (
        <>
          {/* Top KPI Cards for Withholding */}
          <div className="stats-grid mb-4">
            <div className="stat-card">
              <div className="stat-icon-wrap bg-blue-subtle text-primary">
                <ReceiptTextIcon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total Withheld Sales</span>
                <span className="stat-value">{withheldSales?.length || 0} Invoices</span>
                <span className="stat-subtext">Corporate & Contractor orders</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrap bg-emerald-subtle text-success">
                <BarChart3Icon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">3% Tax Credits Earned</span>
                <span className="stat-value">{formatCurrency(totalWithholdingCredits)}</span>
                <span className="stat-subtext">Claimable from Ministry of Revenues</span>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon-wrap bg-purple-subtle text-purple">
                <PackageIcon size={22} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Pending Vouchers</span>
                <span className="stat-value">{pendingVouchersCount}</span>
                <span className="stat-subtext">Vouchers awaiting physical collection</span>
              </div>
            </div>
          </div>

          {/* Withholding Table */}
          <div className="section-card">
            <div className="section-header-flex">
              <div>
                <h3 className="section-title">Withholding Tax (WHT) Schedule</h3>
                <p className="section-subtitle">
                  Detailed register of all 3% tax deductions with customer TIN numbers and voucher serials
                </p>
              </div>
            </div>

            {(!withheldSales || withheldSales.length === 0) ? (
              <div className="empty-state">
                <p>No sales with 3% Withholding Tax recorded yet.</p>
                <p className="text-xs text-muted">When ringing up contractor orders over 20,000 ETB, check "Apply 3% Withholding Tax" in New Sale.</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Invoice #</th>
                      <th>Client / Contractor</th>
                      <th>Client TIN</th>
                      <th>Voucher Serial</th>
                      <th>Gross Billed</th>
                      <th>3% WHT Deducted</th>
                      <th>Net Collected</th>
                      <th>Voucher Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withheldSales.map(sale => {
                      const dt = new Date(sale.timestamp);
                      return (
                        <tr key={sale.id}>
                          <td>{dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          <td><strong className="font-mono text-primary">{sale.id}</strong></td>
                          <td><strong>{sale.customer}</strong></td>
                          <td>{sale.customerTin ? <span className="font-mono">{sale.customerTin}</span> : <span className="text-muted">N/A</span>}</td>
                          <td>{sale.whtVoucherNumber ? <span className="badge-pill badge-neutral font-mono">{sale.whtVoucherNumber}</span> : <span className="text-warning">Pending</span>}</td>
                          <td>{formatCurrency(sale.grossTotal || sale.total)}</td>
                          <td><strong className="text-danger">- {formatCurrency(sale.withholdingAmount)}</strong></td>
                          <td><strong className="text-success">{formatCurrency(sale.netPayable)}</strong></td>
                          <td>
                            {sale.whtVoucherStatus === 'received' ? (
                              <span className="badge-pill badge-healthy">✓ Received</span>
                            ) : (
                              <span className="badge-pill badge-warning">⏳ Pending Voucher</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}