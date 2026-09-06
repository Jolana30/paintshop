import { useStock } from '../context/StockContext';
import { getLocalDateString } from '../utils/formatters';
import {
  ShoppingCartIcon,
  ArrowDownToDotIcon,
  BarChart3Icon,
  PackageIcon,
  AlertTriangleIcon,
  ReceiptTextIcon
} from '../components/Icons';

export default function Dashboard({ setActiveTab, onSelectStockInProduct, onViewSalesForDate }) {
  const { products, sales, todayRevenue, todayItemsSold, lowStockProducts, formatCurrency } = useStock();

  const recentSales = sales.slice(0, 5);

  const handleOpenTodaySales = () => {
    const todayStr = getLocalDateString();
    if (onViewSalesForDate) {
      onViewSalesForDate(todayStr);
    } else {
      setActiveTab('sales');
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">PaintFlow</h1>
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
            <span className="stat-subtext">Total daily gross revenue in ETB</span>
          </div>
        </div>

        <div
          className="stat-card stat-card-clickable"
          onClick={handleOpenTodaySales}
          style={{ cursor: 'pointer' }}
          title="Click to view detailed items sold today in Sales History"
        >
          <div className="stat-icon-wrap bg-emerald-subtle text-success">
            <ShoppingCartIcon size={22} />
          </div>
          <div className="stat-content">
            <div className="stat-header-row">
              <span className="stat-label">Units Sold Today</span>
              <span className="stat-action-badge">View Details ➔</span>
            </div>
            <span className="stat-value">{todayItemsSold}</span>
            <span className="stat-subtext">Tap to view itemized daily sales</span>
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

          <>
            {/* Desktop Low Stock Table */}
            <div className="table-responsive desktop-only-table">
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

            {/* Mobile Low Stock Cards */}
            <div className="mobile-only-cards">
              {lowStockProducts.map(p => (
                <div key={p.id} className="mobile-low-stock-card">
                  <div className="flex-items-center justify-between">
                    <span className="badge-tag">{p.size}</span>
                    <span className="badge-pill badge-danger">{p.stock === 0 ? 'OUT' : 'LOW'}</span>
                  </div>
                  <strong className="text-sm mt-1">{p.name}</strong>
                  <div className="text-xs text-muted font-mono">{p.code}</div>
                  <div className="flex-items-center justify-between mt-2 pt-2 border-top">
                    <div>
                      <span className="text-xs text-muted">Current: </span>
                      <strong className="text-danger">{p.stock} units</strong>
                      <span className="text-xs text-muted"> (min {p.minStock})</span>
                    </div>
                    <button
                      type="button"
                      className="btn-outline-xs"
                      onClick={() => {
                        if (onSelectStockInProduct) onSelectStockInProduct(p.id);
                        setActiveTab('stockin');
                      }}
                    >
                      + Receive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
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
          <>
            {/* Desktop Table */}
            <div className="table-responsive desktop-only-table">
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

            {/* Mobile Recent Sales Cards */}
            <div className="mobile-only-cards">
              {recentSales.map(sale => (
                <div key={sale.id} className="mobile-sale-card" onClick={() => setActiveTab('sales')} style={{ cursor: 'pointer' }}>
                  <div className="msc-header">
                    <div>
                      <strong className="msc-id font-mono">{sale.id}</strong>
                      <span className="msc-customer">{sale.customer}</span>
                    </div>
                    <span className="text-xs text-muted">
                      {new Date(sale.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
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
                    <span className="text-xs text-muted">{sale.totalItems} unit(s)</span>
                    <strong className="text-success">{formatCurrency(sale.total)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
