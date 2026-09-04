import React, { useState, useMemo } from 'react';
import { useStock, getLocalDateString } from '../context/StockContext';
import {
  SearchIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Inventory({ setActiveTab, onSelectStockInProduct }) {
  const { products, movements, processStockAdjustment, lowStockProducts, formatCurrency, refreshData } = useStock();

  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, LOW, OUT, HEALTHY
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Adjustment modal
  const [adjustingProduct, setAdjustingProduct] = useState(null);
  const [newStockInput, setNewStockInput] = useState('');
  const [adjustReason, setAdjustReason] = useState('Physical Stock Count');

  const categories = useMemo(() => {
    return ['ALL', ...Array.from(new Set(products.map(p => p.category)))];
  }, [products]);

  // Compute daily Excel-style inventory ledger (Opening, In, Out, Closing)
  const dailyLedger = useMemo(() => {
    return products.map(product => {
      const dayMovements = movements.filter(m => {
        const movementDate = getLocalDateString(m.timestamp);
        return movementDate === selectedDate && m.productId === product.id;
      });

      const stockInQty = dayMovements
        .filter(m => m.type === 'STOCK_IN')
        .reduce((sum, m) => sum + m.quantity, 0);

      const soldQty = dayMovements
        .filter(m => m.type === 'SALE')
        .reduce((sum, m) => sum + Math.abs(m.quantity), 0);

      const adjQty = dayMovements
        .filter(m => m.type === 'ADJUSTMENT')
        .reduce((sum, m) => sum + m.quantity, 0);

      const closingStock = product.stock;
      // Opening = Closing - In + Out - Adjustments
      const openingStock = Math.max(0, closingStock - stockInQty + soldQty - adjQty);

      return {
        ...product,
        openingStock,
        stockInQty,
        soldQty,
        adjQty,
        closingStock
      };
    });
  }, [products, movements, selectedDate]);

  // Daily totals
  const totalOpeningUnits = dailyLedger.reduce((sum, p) => sum + p.openingStock, 0);
  const totalReceivedUnits = dailyLedger.reduce((sum, p) => sum + p.stockInQty, 0);
  const totalSoldUnits = dailyLedger.reduce((sum, p) => sum + p.soldQty, 0);
  const totalClosingUnits = dailyLedger.reduce((sum, p) => sum + p.closingStock, 0);
  const totalClosingValue = dailyLedger.reduce((sum, p) => sum + (p.closingStock * p.priceWithVat), 0);

  // Filter products
  const filteredProducts = useMemo(() => {
    return dailyLedger.filter(p => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;

      let matchesStatus = true;
      if (filterStatus === 'LOW') {
        matchesStatus = p.closingStock <= p.minStock && p.closingStock > 0;
      } else if (filterStatus === 'OUT') {
        matchesStatus = p.closingStock === 0;
      } else if (filterStatus === 'HEALTHY') {
        matchesStatus = p.closingStock > p.minStock;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [dailyLedger, searchTerm, selectedCategory, filterStatus]);

  const openAdjustModal = (product) => {
    setAdjustingProduct(product);
    setNewStockInput(String(product.closingStock));
    setAdjustReason('Physical Stock Count');
  };

  const handleAdjustSubmit = (e) => {
    e.preventDefault();
    if (!adjustingProduct) return;

    const val = parseInt(newStockInput, 10);
    if (isNaN(val) || val < 0) {
      alert("Please enter a valid stock quantity.");
      return;
    }

    processStockAdjustment(adjustingProduct.id, val, adjustReason);
    setAdjustingProduct(null);
  };

  // Export Daily Excel Ledger (.csv format matching shop Excel workflow)
  const handleExportExcel = () => {
    const headers = [
      "Product Code",
      "Product Description",
      "Category",
      "Size",
      "Date",
      "Opening Stock (Units)",
      "Received Today (+)",
      "Sold Today (-)",
      "Adjustments (±)",
      "Closing Stock (Units)",
      "Min Stock Threshold",
      "Price Pre-VAT (ETB)",
      "Price With 15% VAT (ETB)",
      "Total Inventory Value (ETB)",
      "Status"
    ];

    const rows = dailyLedger.map(p => [
      p.code,
      p.name,
      p.category,
      p.size,
      selectedDate,
      p.openingStock,
      p.stockInQty,
      p.soldQty,
      p.adjQty,
      p.closingStock,
      p.minStock,
      p.priceBeforeVat.toFixed(2),
      p.priceWithVat.toFixed(2),
      (p.closingStock * p.priceWithVat).toFixed(2),
      p.closingStock === 0 ? "OUT_OF_STOCK" : p.closingStock <= p.minStock ? "LOW_STOCK" : "OK"
    ]);

    downloadExcelCsv(`jotun_daily_stock_sheet_${selectedDate}`, headers, rows);
  };

  // Export / Print Daily PDF Report
  const handleExportPdf = () => {
    const columns = [
      "Code",
      "Product Description",
      "Size",
      "Opening",
      "Received (+)",
      "Sold (-)",
      "Closing Stock",
      "Price (+VAT)",
      "Status"
    ];

    const rows = dailyLedger.map(p => [
      p.code,
      p.name,
      p.size,
      `${p.openingStock}`,
      p.stockInQty > 0 ? `<strong style="color:#059669;">+${p.stockInQty}</strong>` : '0',
      p.soldQty > 0 ? `<strong style="color:#dc2626;">-${p.soldQty}</strong>` : '0',
      `<strong>${p.closingStock}</strong>`,
      formatCurrency(p.priceWithVat),
      p.closingStock === 0
        ? '<span style="color:#dc2626; font-weight:bold;">OUT</span>'
        : p.closingStock <= p.minStock
        ? '<span style="color:#d97706; font-weight:bold;">LOW</span>'
        : '<span style="color:#059669;">OK</span>'
    ]);

    printOrSaveAsPdf({
      title: `Jotun Daily Stock Sheet — ${selectedDate}`,
      subtitle: `Opening, Received, Sold, and Closing balances for ${selectedDate}`,
      columns,
      rows,
      summaryCards: [
        { label: "Opening Total", value: `${totalOpeningUnits} units` },
        { label: "Received (+)", value: `+${totalReceivedUnits} units` },
        { label: "Sold Today (-)", value: `-${totalSoldUnits} units` },
        { label: "Closing Stock", value: `${totalClosingUnits} units` },
        { label: "Closing Valuation", value: formatCurrency(totalClosingValue) }
      ]
    });
  };

  const setDateToday = () => {
    setSelectedDate(getLocalDateString());
  };

  const setDateYesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    setSelectedDate(getLocalDateString(d));
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Daily Stock Sheet (Inventory by Day)</h1>
          <p className="page-subtitle">
            Replaces manual Excel: Opening Stock + Received - Sold = Closing Stock calculated automatically
          </p>
        </div>
        <div className="header-actions-group">
          <button
            type="button"
            className="btn-outline-sm"
            onClick={refreshData}
            title="Refresh prices & stock from official sheet"
          >
            <RefreshCwIcon size={15} />
            Refresh
          </button>
          <button
            type="button"
            className="btn-export-excel"
            onClick={handleExportExcel}
            title="Download daily sheet as Excel CSV"
          >
            📊 Export Excel Sheet
          </button>
          <button
            type="button"
            className="btn-export-pdf"
            onClick={handleExportPdf}
            title="Print or Save daily sheet as PDF"
          >
            📄 Export PDF
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setActiveTab('stockin')}
          >
            <PlusIcon size={18} />
            + Receive Stock
          </button>
        </div>
      </div>

      {/* Daily Excel Formula & Date Selector Bar */}
      <div className="daily-selector-card section-card">
        <div className="daily-selector-left">
          <span className="daily-selector-label">Active Sheet Date:</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="form-input date-picker-input"
          />
          <button
            type="button"
            className={`btn-date-quick ${selectedDate === getLocalDateString() ? 'active' : ''}`}
            onClick={setDateToday}
          >
            Today
          </button>
          <button
            type="button"
            className="btn-date-quick"
            onClick={setDateYesterday}
          >
            Yesterday
          </button>
        </div>

        <div className="excel-formula-badge">
          <span>Excel Formula:</span>
          <strong>Closing Stock = Opening + Received - Sold</strong>
        </div>
      </div>

      {/* Daily Stock Summary Cards (Excel Reconciliation Metrics) */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrap bg-purple-subtle text-purple">
            <PackageIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Opening Stock</span>
            <span className="stat-value">{totalOpeningUnits}</span>
            <span className="stat-subtext">Day start inventory</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap bg-emerald-subtle text-success">
            <PlusIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Received Today (+)</span>
            <span className="stat-value text-success">+{totalReceivedUnits}</span>
            <span className="stat-subtext">Incoming shipments</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap bg-blue-subtle text-primary">
            <span style={{ fontSize: '20px', fontWeight: 'bold' }}>−</span>
          </div>
          <div className="stat-content">
            <span className="stat-label">Sold Today (−)</span>
            <span className="stat-value text-danger">−{totalSoldUnits}</span>
            <span className="stat-subtext">Deducted from sales</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap bg-emerald-subtle text-success">
            <PackageIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Current Closing Stock</span>
            <span className="stat-value text-primary font-bold">{totalClosingUnits}</span>
            <span className="stat-subtext">{formatCurrency(totalClosingValue)} value</span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="section-card mb-4">
        <div className="filter-toolbar-grid">
          {/* Search bar */}
          <div className="search-input-wrapper">
            <SearchIcon size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search code or description (e.g. 6URMAWCSA, FENOMASTIC, 15L)..."
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

          {/* Status filter buttons */}
          <div className="status-filter-pills">
            <button
              type="button"
              className={`pill-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterStatus('ALL')}
            >
              All (46)
            </button>
            <button
              type="button"
              className={`pill-btn pill-warning ${filterStatus === 'LOW' ? 'active' : ''}`}
              onClick={() => setFilterStatus('LOW')}
            >
              Low Stock ({lowStockProducts.length})
            </button>
            <button
              type="button"
              className={`pill-btn pill-danger ${filterStatus === 'OUT' ? 'active' : ''}`}
              onClick={() => setFilterStatus('OUT')}
            >
              Out of Stock ({products.filter(p => p.stock === 0).length})
            </button>
            <button
              type="button"
              className={`pill-btn pill-healthy ${filterStatus === 'HEALTHY' ? 'active' : ''}`}
              onClick={() => setFilterStatus('HEALTHY')}
            >
              Healthy ({products.filter(p => p.stock > p.minStock).length})
            </button>
          </div>
        </div>

        {/* Clean Categories: Interior, Exterior, Primers & Putty */}
        <div className="category-chips-container mt-3">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Excel-Style Daily Stock Ledger Table */}
      <div className="section-card">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <PackageIcon size={40} className="text-muted" />
            <p>No products found matching filters.</p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table View */}
            <div className="table-responsive desktop-only-table">
              <table className="data-table inventory-table excel-ledger-table">
                <thead>
                  <tr>
                    <th>Part Code</th>
                    <th>Product Description</th>
                    <th>Size</th>
                    <th className="text-center bg-gray-header">Opening Stock</th>
                    <th className="text-center bg-green-header">+ Received</th>
                    <th className="text-center bg-red-header">− Sold Today</th>
                    <th className="text-center bg-blue-header">= Closing Stock</th>
                    <th>Status</th>
                    <th>Price (+15% VAT)</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => {
                    const isOut = product.closingStock === 0;
                    const isLow = product.closingStock <= product.minStock && !isOut;

                    return (
                      <tr key={product.id} className={isOut ? 'row-out' : isLow ? 'row-low' : ''}>
                        <td>
                          <span className="font-mono text-xs product-code-badge">{product.code}</span>
                        </td>
                        <td>
                          <div className="inventory-product-cell">
                            <strong className="product-name-heading">{product.name}</strong>
                            <span className="text-xs text-muted">{product.category}</span>
                          </div>
                        </td>
                        <td>
                          <span className="badge-tag">{product.size}</span>
                        </td>

                        {/* Excel Style Daily Movement Columns */}
                        <td className="text-center ledger-cell">
                          <span className="opening-num">{product.openingStock}</span>
                        </td>
                        <td className="text-center ledger-cell">
                          {product.stockInQty > 0 ? (
                            <span className="badge-pill badge-healthy">+{product.stockInQty}</span>
                          ) : (
                            <span className="text-muted text-xs">0</span>
                          )}
                        </td>
                        <td className="text-center ledger-cell">
                          {product.soldQty > 0 ? (
                            <span className="badge-pill badge-danger">−{product.soldQty}</span>
                          ) : (
                            <span className="text-muted text-xs">0</span>
                          )}
                        </td>
                        <td className="text-center ledger-cell closing-cell">
                          <strong className={`closing-num ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                            {product.closingStock}
                          </strong>
                        </td>

                        <td>
                          {isOut ? (
                            <span className="badge-pill badge-danger">OUT</span>
                          ) : isLow ? (
                            <span className="badge-pill badge-warning">LOW ({product.minStock} min)</span>
                          ) : (
                            <span className="badge-pill badge-healthy">OK</span>
                          )}
                        </td>
                        <td>
                          <strong>{formatCurrency(product.priceWithVat)}</strong>
                        </td>
                        <td>
                          <div className="actions-cell-flex">
                            <button
                              type="button"
                              className="btn-outline-xs"
                              onClick={() => {
                                if (onSelectStockInProduct) onSelectStockInProduct(product.id);
                                setActiveTab('stockin');
                              }}
                              title="Receive stock"
                            >
                              + Stock
                            </button>
                            <button
                              type="button"
                              className="btn-text-xs"
                              onClick={() => openAdjustModal(product)}
                              title="Manual inventory count adjustment"
                            >
                              Adjust
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Native Card Feed (iOS / Android) */}
            <div className="mobile-only-cards">
              {filteredProducts.map(product => {
                const isOut = product.closingStock === 0;
                const isLow = product.closingStock <= product.minStock && !isOut;

                return (
                  <div key={product.id} className={`mobile-product-card ${isOut ? 'card-out' : isLow ? 'card-low' : ''}`}>
                    <div className="mpc-top">
                      <div className="flex-items-center gap-2">
                        <span className="badge-tag">{product.size}</span>
                        <span className="font-mono text-xs product-code-badge">{product.code}</span>
                      </div>
                      <span className={`badge-pill ${isOut ? 'badge-danger' : isLow ? 'badge-warning' : 'badge-healthy'}`}>
                        {isOut ? 'OUT' : isLow ? `LOW (min ${product.minStock})` : 'HEALTHY'}
                      </span>
                    </div>

                    <h4 className="mpc-name">{product.name}</h4>
                    <div className="mpc-sub">
                      <span>{product.category}</span>
                      <span>•</span>
                      <strong>{formatCurrency(product.priceWithVat)}</strong>
                    </div>

                    {/* Stock Reconciliation Grid */}
                    <div className="mpc-ledger-grid">
                      <div className="mpc-stat">
                        <span className="mpc-label">Opening</span>
                        <span className="mpc-val">{product.openingStock}</span>
                      </div>
                      <div className="mpc-stat">
                        <span className="mpc-label">+ Recv</span>
                        <span className="mpc-val text-success">+{product.stockInQty}</span>
                      </div>
                      <div className="mpc-stat">
                        <span className="mpc-label">− Sold</span>
                        <span className="mpc-val text-danger">−{product.soldQty}</span>
                      </div>
                      <div className="mpc-stat mpc-closing">
                        <span className="mpc-label">= Closing</span>
                        <span className={`mpc-val font-bold ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                          {product.closingStock}
                        </span>
                      </div>
                    </div>

                    {/* Touch Friendly Action Buttons */}
                    <div className="mpc-actions">
                      <button
                        type="button"
                        className="btn-mpc-stock"
                        onClick={() => {
                          if (onSelectStockInProduct) onSelectStockInProduct(product.id);
                          setActiveTab('stockin');
                        }}
                      >
                        + Receive Stock
                      </button>
                      <button
                        type="button"
                        className="btn-mpc-adjust"
                        onClick={() => openAdjustModal(product)}
                      >
                        Adjust Count
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {adjustingProduct && (
        <div className="modal-overlay" onClick={() => setAdjustingProduct(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Adjust Stock Count</h3>
              <p className="text-muted text-sm">{adjustingProduct.name} ({adjustingProduct.size})</p>
            </div>

            <form onSubmit={handleAdjustSubmit} className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label">Current System Closing Balance</label>
                <div className="form-static-val">{adjustingProduct.closingStock} units</div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Actual Physical Count on Shelf (Units)</label>
                <input
                  type="number"
                  min="0"
                  value={newStockInput}
                  onChange={(e) => setNewStockInput(e.target.value)}
                  className="form-input font-bold text-lg"
                  required
                />
              </div>

              <div className="form-group mb-3">
                <label className="form-label">Reason for Discrepancy (Required for Audit)</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. End of day physical count correction"
                  className="form-input"
                  required
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn-primary w-full">
                  Save Adjustment & Update Closing Stock
                </button>
                <button
                  type="button"
                  className="btn-outline-sm w-full mt-2"
                  onClick={() => setAdjustingProduct(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
