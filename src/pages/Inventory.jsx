import React, { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';
import {
  SearchIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  MinusIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Inventory({ setActiveTab, onSelectStockInProduct }) {
  const { products, processStockAdjustment, lowStockProducts, formatCurrency, refreshData } = useStock();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, INSTOCK, LOW, OUT
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Quick edit modal
  const [editingProduct, setEditingProduct] = useState(null);
  const [editQty, setEditQty] = useState(0);

  const categories = useMemo(() => {
    return ['ALL', ...Array.from(new Set(products.map(p => p.category)))];
  }, [products]);

  // Dynamic breakdown of units by category
  const categoryStats = useMemo(() => {
    const stats = {
      ALL: { units: 0, count: products.length }
    };
    products.forEach(p => {
      stats.ALL.units += p.stock;
      if (!stats[p.category]) {
        stats[p.category] = { units: 0, count: 0 };
      }
      stats[p.category].units += p.stock;
      stats[p.category].count += 1;
    });
    return stats;
  }, [products]);

  // Context-aware totals (matches active category selection)
  const activeProductsByCategory = useMemo(() => {
    return selectedCategory === 'ALL'
      ? products
      : products.filter(p => p.category === selectedCategory);
  }, [products, selectedCategory]);

  const activeUnits = useMemo(() => {
    return activeProductsByCategory.reduce((sum, p) => sum + p.stock, 0);
  }, [activeProductsByCategory]);

  const activeValue = useMemo(() => {
    return activeProductsByCategory.reduce((sum, p) => sum + (p.stock * p.priceWithVat), 0);
  }, [activeProductsByCategory]);

  const mostAvailableProduct = useMemo(() => {
    const sorted = [...activeProductsByCategory].sort((a, b) => b.stock - a.stock);
    return sorted.length > 0 && sorted[0].stock > 0 ? sorted[0] : null;
  }, [activeProductsByCategory]);

  // Overall totals
  const totalUnits = useMemo(() => products.reduce((sum, p) => sum + p.stock, 0), [products]);
  const totalValue = useMemo(() => products.reduce((sum, p) => sum + (p.stock * p.priceWithVat), 0), [products]);
  const outOfStockCount = useMemo(() => products.filter(p => p.stock === 0).length, [products]);

  // Filtered list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;

      let matchesStatus = true;
      if (filterStatus === 'INSTOCK') {
        matchesStatus = p.stock > 0;
      } else if (filterStatus === 'LOW') {
        matchesStatus = p.stock <= p.minStock && p.stock > 0;
      } else if (filterStatus === 'OUT') {
        matchesStatus = p.stock === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchTerm, selectedCategory, filterStatus]);

  const openQuickEdit = (product) => {
    setEditingProduct(product);
    setEditQty(product.stock);
  };

  const handleSaveStock = (e) => {
    e.preventDefault();
    if (!editingProduct) return;
    const val = parseInt(editQty, 10);
    if (isNaN(val) || val < 0) {
      alert('Please enter a valid stock quantity (0 or greater).');
      return;
    }
    processStockAdjustment(editingProduct.id, val, 'Quick Stock Update');
    setEditingProduct(null);
  };

  const quickAdjustQty = (delta) => {
    setEditQty(prev => {
      const current = parseInt(prev, 10) || 0;
      return Math.max(0, current + delta);
    });
  };

  const handleExportExcel = () => {
    const headers = [
      "Product Code",
      "Product Name",
      "Category",
      "Size",
      "Current Stock",
      "Min Safety Level",
      "Unit Price (+15% VAT ETB)",
      "Total Valuation (ETB)",
      "Status"
    ];
    const rows = products.map(p => [
      p.code,
      p.name,
      p.category,
      p.size,
      p.stock,
      p.minStock,
      p.priceWithVat.toFixed(2),
      (p.stock * p.priceWithVat).toFixed(2),
      p.stock === 0 ? "OUT_OF_STOCK" : p.stock <= p.minStock ? "LOW_STOCK" : "IN_STOCK"
    ]);
    downloadExcelCsv(`jotun_inventory_stock_${new Date().toISOString().split('T')[0]}`, headers, rows);
  };

  const handleExportPdf = () => {
    const columns = ["Code", "Product", "Size", "Stock", "Unit Price (+VAT)", "Total Value", "Status"];
    const rows = products.map(p => [
      p.code,
      p.name,
      p.size,
      `<strong>${p.stock} units</strong>`,
      formatCurrency(p.priceWithVat),
      formatCurrency(p.stock * p.priceWithVat),
      p.stock === 0
        ? '<span style="color:#dc2626; font-weight:bold;">OUT</span>'
        : p.stock <= p.minStock
        ? '<span style="color:#d97706; font-weight:bold;">LOW</span>'
        : '<span style="color:#059669; font-weight:bold;">OK</span>'
    ]);

    printOrSaveAsPdf({
      title: "Jotun Paintshop Inventory Valuation",
      subtitle: `Current stock on shelf & valuation as of ${new Date().toLocaleDateString()}`,
      columns,
      rows,
      summaryCards: [
        { label: "Total Paint Units", value: `${totalUnits} units` },
        { label: "Total Inventory Value", value: formatCurrency(totalValue) },
        { label: "Low Stock Items", value: `${lowStockProducts.length} items` },
        { label: "Out of Stock Items", value: `${outOfStockCount} items` }
      ]
    });
  };

  return (
    <div className="page-container">
      {/* Clean Top Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Stock</h1>
          <p className="page-subtitle">Real-time stock counts and valuation in store</p>
        </div>
        <div className="header-actions-group">
          <button
            type="button"
            className="btn-outline-sm"
            onClick={refreshData}
            title="Refresh latest stock from cloud"
          >
            <RefreshCwIcon size={15} />
            Sync Cloud
          </button>
          <button
            type="button"
            className="btn-export-excel"
            onClick={handleExportExcel}
            title="Download inventory as Excel CSV"
          >
            📊 Excel
          </button>
          <button
            type="button"
            className="btn-export-pdf"
            onClick={handleExportPdf}
            title="Export / Print inventory as PDF"
          >
            📄 PDF
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

      {/* 4 Clean Snapshot Cards */}
      <div className="simple-summary-row">
        <div className="simple-stat-box">
          <span className="simple-stat-label">
            {selectedCategory === 'ALL' ? 'Total Shop Units' : `${selectedCategory} Units`}
          </span>
          <strong className="simple-stat-val text-primary">{activeUnits} units</strong>
        </div>

        <div className="simple-stat-box">
          <span className="simple-stat-label">
            {selectedCategory === 'ALL' ? 'Total Shop Valuation' : `${selectedCategory} Value`}
          </span>
          <strong className="simple-stat-val text-success">{formatCurrency(activeValue)}</strong>
        </div>

        <div className="simple-stat-box">
          <span className="simple-stat-label">Most Available Paint</span>
          {mostAvailableProduct ? (
            <div className="most-avail-preview">
              <strong className="simple-stat-val text-accent">{mostAvailableProduct.stock} units</strong>
              <span className="text-xs text-muted truncate-1-line" title={mostAvailableProduct.name}>
                {mostAvailableProduct.name} ({mostAvailableProduct.size})
              </span>
            </div>
          ) : (
            <strong className="simple-stat-val text-muted">None</strong>
          )}
        </div>

        <div className="simple-stat-box">
          <span className="simple-stat-label">Low / Out of Stock</span>
          <strong className={`simple-stat-val ${lowStockProducts.length > 0 ? 'text-warning' : 'text-muted'}`}>
            {lowStockProducts.length} items
          </strong>
        </div>
      </div>

      {/* Clean Search & Filters Toolbar */}
      <div className="inventory-clean-toolbar">
        {/* Search input */}
        <div className="search-input-wrapper">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search paint by name or code (e.g. FENOMASTIC, 15L, 6URMAWCSA)..."
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

        {/* Category Horizontal Chips */}
        <div className="category-chips-container">
          {categories.map(cat => {
            const stat = categoryStats[cat] || { units: 0, count: 0 };
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`chip-btn ${selectedCategory === cat ? 'active' : ''}`}
              >
                {cat === 'ALL' ? 'All' : cat} ({stat.units} units)
              </button>
            );
          })}
        </div>

        {/* Status Pills */}
        <div className="status-filter-pills">
          <button
            type="button"
            className={`pill-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilterStatus('ALL')}
          >
            All Products ({products.length})
          </button>
          <button
            type="button"
            className={`pill-btn ${filterStatus === 'INSTOCK' ? 'active' : ''}`}
            onClick={() => setFilterStatus('INSTOCK')}
          >
            In Stock ({products.filter(p => p.stock > 0).length})
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
            Out of Stock ({outOfStockCount})
          </button>
        </div>
      </div>

      {/* Products Table (Desktop) & Cards (Mobile) */}
      <div className="section-card">
        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <PackageIcon size={40} className="text-muted" />
            <p>No products found matching your search.</p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Table */}
            <div className="table-responsive desktop-only-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Part Code</th>
                    <th>Product Description</th>
                    <th>Size</th>
                    <th>Current Stock</th>
                    <th>Status</th>
                    <th>Price (+15% VAT)</th>
                    <th>Total Value</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => {
                    const isOut = product.stock === 0;
                    const isLow = product.stock <= product.minStock && !isOut;

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
                        <td>
                          <strong className={`stock-number-large ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                            {product.stock}
                          </strong>
                          <span className="text-xs text-muted ml-1">units</span>
                        </td>
                        <td>
                          {isOut ? (
                            <span className="badge-pill badge-danger">OUT OF STOCK</span>
                          ) : isLow ? (
                            <span className="badge-pill badge-warning">LOW (min {product.minStock})</span>
                          ) : (
                            <span className="badge-pill badge-healthy">IN STOCK</span>
                          )}
                        </td>
                        <td>
                          <strong>{formatCurrency(product.priceWithVat)}</strong>
                        </td>
                        <td>
                          <span className="text-muted">{formatCurrency(product.stock * product.priceWithVat)}</span>
                        </td>
                        <td className="text-right">
                          <div className="actions-cell-flex justify-end">
                            <button
                              type="button"
                              className="btn-outline-xs"
                              onClick={() => {
                                if (onSelectStockInProduct) onSelectStockInProduct(product.id);
                                setActiveTab('stockin');
                              }}
                              title="Receive incoming shipment"
                            >
                              + Receive
                            </button>
                            <button
                              type="button"
                              className="btn-primary-xs"
                              onClick={() => openQuickEdit(product)}
                              title="Quick edit stock count"
                            >
                              Edit Count
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards Feed */}
            <div className="mobile-only-cards">
              {filteredProducts.map(product => {
                const isOut = product.stock === 0;
                const isLow = product.stock <= product.minStock && !isOut;

                return (
                  <div key={product.id} className={`mobile-product-card ${isOut ? 'card-out' : isLow ? 'card-low' : ''}`}>
                    <div className="mpc-top">
                      <div className="flex-items-center gap-2">
                        <span className="badge-tag">{product.size}</span>
                        <span className="font-mono text-xs product-code-badge">{product.code}</span>
                      </div>
                      <span className={`badge-pill ${isOut ? 'badge-danger' : isLow ? 'badge-warning' : 'badge-healthy'}`}>
                        {isOut ? 'OUT' : isLow ? 'LOW' : 'IN STOCK'}
                      </span>
                    </div>

                    <h4 className="mpc-name">{product.name}</h4>
                    <div className="mpc-sub">
                      <span>{product.category}</span>
                      <span>•</span>
                      <strong>{formatCurrency(product.priceWithVat)}</strong>
                    </div>

                    <div className="mpc-stock-highlight">
                      <span className="mpc-stock-label">Available on Shelf:</span>
                      <strong className={`mpc-stock-qty ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                        {product.stock} units
                      </strong>
                    </div>

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
                        onClick={() => openQuickEdit(product)}
                      >
                        Edit Count
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Super Simple 1-Click Quick Count Edit Modal */}
      {editingProduct && (
        <div className="modal-overlay" onClick={() => setEditingProduct(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="section-heading">Quick Stock Edit</h3>
                <p className="text-sm text-muted">{editingProduct.name} ({editingProduct.size})</p>
              </div>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setEditingProduct(null)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStock} className="modal-body">
              <div className="current-stock-preview">
                <span>Current Stock on Record:</span>
                <strong>{editingProduct.stock} units</strong>
              </div>

              {/* Stepper with Large Direct Number */}
              <div className="form-group mb-3">
                <label className="form-label">New Stock Count</label>
                <div className="quick-edit-stepper">
                  <button
                    type="button"
                    className="stepper-btn-large"
                    onClick={() => quickAdjustQty(-1)}
                  >
                    <MinusIcon size={20} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="quick-edit-input"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="stepper-btn-large"
                    onClick={() => quickAdjustQty(1)}
                  >
                    <PlusIcon size={20} />
                  </button>
                </div>

                {/* Quick chip increments */}
                <div className="quick-qty-chips mt-2">
                  <span>Quick Add:</span>
                  <button type="button" onClick={() => quickAdjustQty(1)} className="quick-qty-btn">+1</button>
                  <button type="button" onClick={() => quickAdjustQty(5)} className="quick-qty-btn">+5</button>
                  <button type="button" onClick={() => quickAdjustQty(10)} className="quick-qty-btn">+10</button>
                  <button type="button" onClick={() => quickAdjustQty(20)} className="quick-qty-btn">+20</button>
                  <button type="button" onClick={() => setEditQty(0)} className="quick-qty-btn clear">Set 0</button>
                </div>
              </div>

              <div className="modal-actions-grid mt-4">
                <button
                  type="button"
                  className="btn-outline w-full"
                  onClick={() => setEditingProduct(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary w-full"
                >
                  <CheckCircleIcon size={18} />
                  Save Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
