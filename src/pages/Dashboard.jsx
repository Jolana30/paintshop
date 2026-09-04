import React from 'react';
import { useStock } from '../context/StockContext';
import {
  ShoppingCartIcon,
  ArrowDownToDotIcon,
  BarChart3Icon,
  PackageIcon,
  AlertTriangleIcon,
  ReceiptTextIcon
} from '../components/Icons';

export default function Dashboard({ setActiveTab, onSelectStockInProduct }) {
  const { products, sales, todayRevenue, todayItemsSold, lowStockProducts, formatCurrency } = useStock();

  const recentSales = sales.slice(0, 5);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jotun Paint Manager</h1>
          <p className="page-subtitle">Real-time stock control & sales dashboard (Birr / ETB)</p>
        </div>
        <div className="header-meta">
          <span className="badge-pill date-pill">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrap bg-blue-subtle text-primary">
            <ReceiptTextIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Today's Sales</span>
            <span className="stat-value">{formatCurrency(todayRevenue)}</span>
            <span className="stat-subtext">Automated total (with 15% VAT)</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap bg-emerald-subtle text-success">
            <ShoppingCartIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Units Sold Today</span>
            <span className="stat-value">{todayItemsSold}</span>
            <span className="stat-subtext">Deducted automatically</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon-wrap bg-purple-subtle text-purple">
            <PackageIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Total Products</span>
            <span className="stat-value">{products.length}</span>
            <span className="stat-subtext">46 unique paints & sizes in catalog</span>
          </div>
        </div>

        <div className={`stat-card ${lowStockProducts.length > 0 ? 'border-warning' : ''}`}>
          <div className={`stat-icon-wrap ${lowStockProducts.length > 0 ? 'bg-amber-subtle text-warning' : 'bg-emerald-subtle text-success'}`}>
            <AlertTriangleIcon size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">Low Stock Warnings</span>
            <span className="stat-value">{lowStockProducts.length}</span>
            <span className="stat-subtext">
              {lowStockProducts.length > 0 ? 'Items below safety threshold' : 'All stock levels healthy'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section-card quick-actions-card">
        <h3 className="section-heading">Quick Actions</h3>
        <div className="action-buttons-grid">
          <button
            type="button"
            className="action-btn action-btn-primary"
            onClick={() => setActiveTab('newsale')}
          >
            <div className="action-btn-icon">
              <ShoppingCartIcon size={22} />
            </div>
            <div className="action-btn-text">
              <strong>New Sale</strong>
              <span>Sell items & auto-deduct stock</span>
            </div>
          </button>

          <button
            type="button"
            className="action-btn action-btn-secondary"
            onClick={() => setActiveTab('stockin')}
          >
            <div className="action-btn-icon">
              <ArrowDownToDotIcon size={22} />
            </div>
            <div className="action-btn-text">
              <strong>Stock In</strong>
              <span>Receive stock & auto-increment</span>
            </div>
          </button>

          <button
            type="button"
            className="action-btn action-btn-tertiary"
            onClick={() => setActiveTab('reports')}
          >
            <div className="action-btn-icon">
              <BarChart3Icon size={22} />
            </div>
            <div className="action-btn-text">
              <strong>Reports & Audit</strong>
              <span>Excel / PDF exports & closing stock</span>
            </div>
          </button>
        </div>
      </div>

      {/* Low Stock Alert Section */}
      {lowStockProducts.length > 0 && (
        <div className="section-card alert-section-card">
          <div className="section-header-flex">
            <div>
              <h3 className="section-heading text-warning flex-items-center gap-2">
                <AlertTriangleIcon size={18} />
                Low Stock Alert ({lowStockProducts.length} products)
              </h3>
              <p className="text-muted text-sm">Units at or below safety stock threshold</p>
            </div>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => setActiveTab('inventory')}
            >
              View Full Inventory
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Size</th>
                  <th>Current Stock</th>
                  <th>Min Level</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {lowStockProducts.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="product-title-cell">
                        <span className="product-name">{p.name}</span>
                        <span className="product-code">{p.code}</span>
                      </div>
                    </td>
                    <td><span className="badge-tag">{p.size}</span></td>
                    <td>
                      <span className="stock-number text-danger font-bold">
                        {p.stock} units
                      </span>
                    </td>
                    <td className="text-muted">{p.minStock} units</td>
                    <td>
                      <span className="badge-pill badge-danger">
                        {p.stock === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-sm btn-primary"
                        onClick={() => {
                          if (onSelectStockInProduct) onSelectStockInProduct(p.id);
                          setActiveTab('stockin');
                        }}
                      >
                        + Stock In
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Sales Section */}
      <div className="section-card">
        <div className="section-header-flex">
          <div>
            <h3 className="section-heading">Recent Transactions</h3>
            <p className="text-muted text-sm">Latest sales recorded in the shop</p>
          </div>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => setActiveTab('sales')}
          >
            All Sales ({sales.length}) ➔
          </button>
        </div>

        {recentSales.length === 0 ? (
          <div className="empty-state">
            <p>No sales recorded yet.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Time</th>
                  <th>Items Purchased</th>
                  <th>Total Units</th>
                  <th>Total (ETB)</th>
                </tr>
              </thead>
              <tbody>
                {recentSales.map(sale => (
                  <tr key={sale.id}>
                    <td>
                      <strong className="text-primary">{sale.id}</strong>
                      <div className="text-xs text-muted">{sale.customer}</div>
                    </td>
                    <td className="text-muted">
                      {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <div className="line-items-summary">
                        {sale.items.map((item, idx) => (
                          <span key={idx} className="item-chip">
                            {item.quantity}x {item.productName} ({item.size})
                          </span>
                        ))}
                      </div>
                    </td>
                    <td><strong>{sale.totalItems}</strong></td>
                    <td>
                      <strong className="text-success text-md">{formatCurrency(sale.total)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
