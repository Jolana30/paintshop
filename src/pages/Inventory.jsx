import { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';
import {
  SearchIcon,
  PackageIcon,
  PlusIcon,
  RefreshCwIcon,
  CheckCircleIcon,
  MinusIcon,
  AlertTriangleIcon
} from '../components/Icons';
import { downloadExcelCsv } from '../utils/exportExcel';
import { printOrSaveAsPdf } from '../utils/exportPdf';

export default function Inventory({ setActiveTab, onSelectStockInProduct }) {
  const {
    products,
    addCustomProduct,
    todayItemsSold,
    getSoldToday,
    processStockAdjustment,
    refreshData
  } = useStock();

  const safeGetSoldToday = (id) => (typeof getSoldToday === 'function' ? getSoldToday(id) : 0);

  // Custom Local Product Modal State
  const [isAddCustomModalOpen, setIsAddCustomModalOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState('Accessories');
  const [customSize, setCustomSize] = useState('1 Unit');
  const [customPrice, setCustomPrice] = useState('');
  const [customStock, setCustomStock] = useState('10');
  const [customMinStock, setCustomMinStock] = useState('3');

  const handleCreateCustomProduct = async (e) => {
    e.preventDefault();
    if (!customName.trim() || !customPrice) return;

    await addCustomProduct({
      name: customName.trim(),
      category: customCategory,
      size: customSize.trim() || '1 Unit',
      priceWithVat: parseFloat(customPrice),
      stock: parseInt(customStock, 10) || 0,
      minStock: parseInt(customMinStock, 10) || 3
    });

    setCustomName('');
    setCustomPrice('');
    setCustomStock('10');
    setCustomMinStock('3');
    setIsAddCustomModalOpen(false);
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, INSTOCK, LOW, OUT
  const [selectedCategory, setSelectedCategory] = useState('ALL'); // ALL, Interior, Exterior

  // Quick edit modal
  const [editingProduct, setEditingProduct] = useState(null);
  const [editQty, setEditQty] = useState(0);

  // Overall totals
  const totalUnits = useMemo(() => products.reduce((sum, p) => sum + p.stock, 0), [products]);
  const outOfStockCount = useMemo(() => products.filter(p => p.stock === 0).length, [products]);
  const lowStockCount = useMemo(() => products.filter(p => p.stock > 0 && p.stock <= p.minStock).length, [products]);
  const inStockCount = useMemo(() => products.filter(p => p.stock > 0).length, [products]);

  // Counts by category
  const interiorProducts = useMemo(() => products.filter(p => p.category === 'Interior'), [products]);
  const exteriorProducts = useMemo(() => products.filter(p => p.category === 'Exterior'), [products]);

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
        matchesStatus = p.stock > 0 && p.stock <= p.minStock;
      } else if (filterStatus === 'OUT') {
        matchesStatus = p.stock === 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, searchTerm, selectedCategory, filterStatus]);

  const hasActiveFilters = searchTerm !== '' || selectedCategory !== 'ALL' || filterStatus !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedCategory('ALL');
    setFilterStatus('ALL');
  };

  const openQuickEdit = (product) => {
    setEditingProduct(product);
    setEditQty(product.stock);
  };

  const [isSavingStock, setIsSavingStock] = useState(false);

  const handleSaveStock = async (e) => {
    e.preventDefault();
    if (!editingProduct || isSavingStock) return;
    const val = parseInt(editQty, 10);
    if (isNaN(val) || val < 0) {
      alert('Please enter a valid stock quantity (0 or greater).');
      return;
    }
    setIsSavingStock(true);
    try {
      await processStockAdjustment(editingProduct.id, val, 'Quick Stock Update');
      setEditingProduct(null);
    } finally {
      setIsSavingStock(false);
    }
  };

  const quickAdjustQty = (delta) => {
    setEditQty(prev => {
      const current = parseInt(prev, 10) || 0;
      return Math.max(0, current + delta);
    });
  };

  // Export to Excel: Shop Header + 4 Core Columns (Name, Size, In Store, Sold Today)
  const handleExportExcel = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const titleRows = [
      ["JOTUN PAINT SHOP — INVENTORY STATUS"],
      [`Date: ${dateStr}`, `Time: ${timeStr}`],
      [`Total in Store: ${totalUnits} cans`, `Total Sold Today: ${todayItemsSold} cans`],
      [""]
    ];

    const headers = ["Product Name", "Size", "Current Inventory", "Total Sold Today"];
    const rows = [];

    // Interior Paints section
    if (interiorProducts.length > 0) {
      rows.push(["[ INTERIOR PAINTS ]", "", "", ""]);
      interiorProducts.forEach(p => {
        rows.push([p.name, p.size, p.stock, safeGetSoldToday(p.id)]);
      });
      const intTotal = interiorProducts.reduce((sum, p) => sum + p.stock, 0);
      const intSold = interiorProducts.reduce((sum, p) => sum + safeGetSoldToday(p.id), 0);
      rows.push(["Sub-total Interior", "", intTotal, intSold]);
      rows.push(["", "", "", ""]);
    }

    // Exterior Paints section
    if (exteriorProducts.length > 0) {
      rows.push(["[ EXTERIOR PAINTS ]", "", "", ""]);
      exteriorProducts.forEach(p => {
        rows.push([p.name, p.size, p.stock, safeGetSoldToday(p.id)]);
      });
      const extTotal = exteriorProducts.reduce((sum, p) => sum + p.stock, 0);
      const extSold = exteriorProducts.reduce((sum, p) => sum + safeGetSoldToday(p.id), 0);
      rows.push(["Sub-total Exterior", "", extTotal, extSold]);
      rows.push(["", "", "", ""]);
    }

    // Grand total
    rows.push(["GRAND TOTAL IN STORE", "", totalUnits, todayItemsSold]);

    downloadExcelCsv(
      `jotun_inventory_${now.toISOString().split('T')[0]}`,
      headers,
      rows,
      titleRows
    );
  };

  // Export to PDF: Clean Shop Header + 4 Core Columns
  const handleExportPdf = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const columns = ["Product Name", "Size", "Current Inventory", "Total Sold Today"];
    const rows = [];

    if (interiorProducts.length > 0) {
      rows.push([
        `<strong style="color:#1e40af; font-size:13px; text-transform:uppercase;">Interior Paints</strong>`,
        "", "", ""
      ]);
      interiorProducts.forEach(p => {
        const sold = safeGetSoldToday(p.id);
        rows.push([
          `<strong>${p.name}</strong>`,
          p.size,
          `<strong>${p.stock}</strong> units`,
          sold > 0 ? `<strong style="color:#047857;">${sold} sold</strong>` : `<span style="color:#94a3b8;">0</span>`
        ]);
      });
    }

    if (exteriorProducts.length > 0) {
      rows.push([
        `<strong style="color:#1e40af; font-size:13px; text-transform:uppercase; margin-top:10px; display:inline-block;">Exterior Paints</strong>`,
        "", "", ""
      ]);
      exteriorProducts.forEach(p => {
        const sold = safeGetSoldToday(p.id);
        rows.push([
          `<strong>${p.name}</strong>`,
          p.size,
          `<strong>${p.stock}</strong> units`,
          sold > 0 ? `<strong style="color:#047857;">${sold} sold</strong>` : `<span style="color:#94a3b8;">0</span>`
        ]);
      });
    }

    printOrSaveAsPdf({
      title: "Jotun Paint Shop — Inventory Status",
      subtitle: `Official Stock Count as of ${dateStr} at ${timeStr}`,
      columns,
      rows,
      summaryCards: [
        { label: "Total in Store", value: `${totalUnits} cans` },
        { label: "Total Sold Today", value: `${todayItemsSold} cans` },
        { label: "Low Stock Items", value: `${lowStockCount}` },
        { label: "Out of Stock", value: `${outOfStockCount}` }
      ]
    });
  };

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory Stock</h1>
          <p className="page-subtitle">Real-time store stock and daily sales overview</p>
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
            title="Download clean inventory Excel spreadsheet"
          >
            📊 Excel
          </button>
          <button
            type="button"
            className="btn-export-pdf"
            onClick={handleExportPdf}
            title="Print or Save Inventory as PDF"
          >
            📄 PDF
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => setIsAddCustomModalOpen(true)}
            title="Add local hardware or accessories (brushes, rollers, local putty)"
          >
            <PlusIcon size={15} />
            + Custom Item
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

      {/* 4 Sleek Top Stats (Total in Store & Sold Today) */}
      <div className="inventory-stats-ribbon mb-4">
        <div className="stat-ribbon-card">
          <div className="stat-ribbon-icon bg-blue-light text-primary">
            <PackageIcon size={20} />
          </div>
          <div>
            <span className="stat-ribbon-label">Total in Store</span>
            <div className="stat-ribbon-value text-primary">
              {totalUnits} <span className="stat-ribbon-sub">units</span>
            </div>
          </div>
        </div>

        <div className="stat-ribbon-card">
          <div className="stat-ribbon-icon bg-emerald-light text-success">
            <CheckCircleIcon size={20} />
          </div>
          <div>
            <span className="stat-ribbon-label">Sold Today</span>
            <div className="stat-ribbon-value text-success">
              {todayItemsSold} <span className="stat-ribbon-sub">units</span>
            </div>
          </div>
        </div>

        <div className="stat-ribbon-card">
          <div className="stat-ribbon-icon bg-amber-light text-warning">
            <AlertTriangleIcon size={20} />
          </div>
          <div>
            <span className="stat-ribbon-label">Low Stock</span>
            <div className={`stat-ribbon-value ${lowStockCount > 0 ? 'text-warning' : 'text-muted'}`}>
              {lowStockCount} <span className="stat-ribbon-sub">items</span>
            </div>
          </div>
        </div>

        <div className="stat-ribbon-card">
          <div className="stat-ribbon-icon bg-red-light text-danger">
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>⛔</span>
          </div>
          <div>
            <span className="stat-ribbon-label">Out of Stock</span>
            <div className={`stat-ribbon-value ${outOfStockCount > 0 ? 'text-danger' : 'text-muted'}`}>
              {outOfStockCount} <span className="stat-ribbon-sub">items</span>
            </div>
          </div>
        </div>
      </div>

      {/* Search & Flexible Filter Buttons Toolbar */}
      <div className="inventory-unified-toolbar mb-4">
        {/* Search Bar */}
        <div className="search-input-wrapper mb-3">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search paint name or Part Code (e.g. Fenomastic, 15L, 6UR)..."
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

        {/* Flexible Filter Buttons Bar */}
        <div className="filter-controls-row">
          {/* Category Group */}
          <div className="filter-group">
            <span className="filter-group-label">Category:</span>
            <button
              type="button"
              className={`filter-toggle-btn ${selectedCategory === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('ALL')}
            >
              All ({products.length})
            </button>
            <button
              type="button"
              className={`filter-toggle-btn ${selectedCategory === 'Interior' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('Interior')}
            >
              Interior ({interiorProducts.length})
            </button>
            <button
              type="button"
              className={`filter-toggle-btn ${selectedCategory === 'Exterior' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('Exterior')}
            >
              Exterior ({exteriorProducts.length})
            </button>
          </div>

          {/* Status Group */}
          <div className="filter-group">
            <span className="filter-group-label">Status:</span>
            <button
              type="button"
              className={`filter-toggle-btn ${filterStatus === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterStatus('ALL')}
            >
              All Status
            </button>
            <button
              type="button"
              className={`filter-toggle-btn ${filterStatus === 'INSTOCK' ? 'active' : ''}`}
              onClick={() => setFilterStatus('INSTOCK')}
            >
              In Stock ({inStockCount})
            </button>
            <button
              type="button"
              className={`filter-toggle-btn btn-warning-pill ${filterStatus === 'LOW' ? 'active' : ''}`}
              onClick={() => setFilterStatus('LOW')}
            >
              Low ({lowStockCount})
            </button>
            <button
              type="button"
              className={`filter-toggle-btn btn-danger-pill ${filterStatus === 'OUT' ? 'active' : ''}`}
              onClick={() => setFilterStatus('OUT')}
            >
              Out ({outOfStockCount})
            </button>
          </div>

          {/* Reset Action */}
          {hasActiveFilters && (
            <button
              type="button"
              className="btn-reset-filters"
              onClick={resetFilters}
            >
              Reset Filters ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Products Table (Desktop) & Cards (Mobile) */}
      <div className="section-card">
        <div className="table-header-bar" style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-xs font-bold uppercase tracking-wider text-muted">
            Showing {filteredProducts.length} of {products.length} Products
          </span>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="empty-state">
            <PackageIcon size={40} className="text-muted" />
            <p>No products found matching your search or filters.</p>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn-outline mt-2"
                onClick={resetFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="table-responsive desktop-only-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Part Code</th>
                    <th>Product Name</th>
                    <th>Size</th>
                    <th className="text-center">In Store</th>
                    <th className="text-center column-sold-today">Sold Today</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map(product => {
                    const isOut = product.stock === 0;
                    const isLow = product.stock <= product.minStock && !isOut;
                    const soldToday = safeGetSoldToday(product.id);

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
                        <td className="text-center">
                          <strong className={`stock-number-large ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                            {product.stock}
                          </strong>
                          <span className="text-xs text-muted ml-1">units</span>
                        </td>
                        <td className="text-center column-sold-today-cell">
                          {soldToday > 0 ? (
                            <strong className="sold-today-badge">{soldToday} sold</strong>
                          ) : (
                            <span className="text-muted font-mono">0</span>
                          )}
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
                const soldToday = safeGetSoldToday(product.id);

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
                    </div>

                    <div className="mpc-stock-grid-row">
                      <div className="mpc-stock-box">
                        <span className="mpc-label">In Store</span>
                        <strong className={`mpc-val ${isOut ? 'text-danger' : isLow ? 'text-warning' : 'text-primary'}`}>
                          {product.stock} units
                        </strong>
                      </div>
                      <div className="mpc-stock-box mpc-sold-box">
                        <span className="mpc-label">Sold Today</span>
                        <strong className={`mpc-val ${soldToday > 0 ? 'text-success' : 'text-muted'}`}>
                          {soldToday} units
                        </strong>
                      </div>
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
      {/* Add Custom Local Product Modal (Brushes, Rollers, Local Putty) */}
      {isAddCustomModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsAddCustomModalOpen(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Add Custom Shop Item</h3>
                <p className="modal-subtitle">Add local accessories (brushes, rollers, putty) exclusive to your shop</p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setIsAddCustomModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomProduct} className="modal-body">
              <div className="form-group mb-3">
                <label className="form-label font-bold">Item Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Harris Paint Brush 4-inch, Local Putty 25kg"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-grid-2 mb-3">
                <div className="form-group">
                  <label className="form-label font-bold">Category</label>
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="form-select"
                  >
                    <option value="Accessories">Accessories</option>
                    <option value="Tools">Tools</option>
                    <option value="Primers & Putty">Primers & Putty</option>
                    <option value="Interior">Interior</option>
                    <option value="Exterior">Exterior</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label font-bold">Size / Pack *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 4-inch, 25kg, 1pc, 5L"
                    value={customSize}
                    onChange={(e) => setCustomSize(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group mb-3">
                <label className="form-label font-bold">Selling Price (Inc. 15% VAT ETB) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="e.g. 350.00"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-grid-2 mb-3">
                <div className="form-group">
                  <label className="form-label font-bold">Initial Stock Units</label>
                  <input
                    type="number"
                    min="0"
                    value={customStock}
                    onChange={(e) => setCustomStock(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label font-bold">Min Stock Warning Level</label>
                  <input
                    type="number"
                    min="1"
                    value={customMinStock}
                    onChange={(e) => setCustomMinStock(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="modal-footer mt-4" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn-outline-sm"
                  onClick={() => setIsAddCustomModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Save Item to Store
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}