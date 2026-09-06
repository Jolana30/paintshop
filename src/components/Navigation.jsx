import {
  LayoutDashboardIcon,
  ShoppingCartIcon,
  PackageIcon,
  ArrowDownToDotIcon,
  ReceiptTextIcon,
  BarChart3Icon,
  AlertTriangleIcon,
  PaintBucketIcon,
  RefreshCwIcon
} from './Icons';
import { useStock } from '../context/StockContext';

export default function Navigation({ activeTab, setActiveTab }) {
  const { lowStockProducts, refreshData, cloudStatus, currentShop, logoutShop } = useStock();
  const lowCount = lowStockProducts.length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
    { id: 'newsale', label: 'New Sale', icon: ShoppingCartIcon },
    { id: 'stockin', label: 'Stock In', icon: ArrowDownToDotIcon },
    { id: 'inventory', label: 'Inventory', icon: PackageIcon, badge: lowCount > 0 ? lowCount : null },
    { id: 'sales', label: 'Sales History', icon: ReceiptTextIcon },
    { id: 'reports', label: 'Reports', icon: BarChart3Icon },
  ];

  return (
    <>
      {/* Desktop Sidebar (Windows) */}
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon-wrapper">
            <PaintBucketIcon size={24} className="brand-icon" />
          </div>
          <div className="brand-text">
            <h2>PaintFlow</h2>
            <span className="brand-tag">for Jotun Retailers</span>
          </div>
        </div>

        {/* Active Shop Profile Badge */}
        <div className="sidebar-active-shop-card">
          <div className="active-shop-dot"></div>
          <div className="active-shop-info">
            <strong className="active-shop-name">{currentShop?.name || 'My Jotun Store'}</strong>
            <span className="active-shop-location">{currentShop?.city_address || 'Addis Ababa'}</span>
          </div>
        </div>

        <div className={`sidebar-device-badge ${cloudStatus === 'connected' ? 'badge-cloud-online' : 'badge-cloud-local'}`}>
          <span className={`device-indicator ${cloudStatus === 'connected' ? 'indicator-online' : 'indicator-local'}`}></span>
          <span>{cloudStatus === 'connected' ? '☁️ Supabase Cloud (Live)' : '⚡ Storage: Local Branch'}</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={19} className="nav-icon" />
                <span className="nav-label">{item.label}</span>
                {item.badge && (
                  <span className="nav-badge" title={`${item.badge} low stock items`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {lowCount > 0 && (
            <div className="sidebar-alert-card" onClick={() => setActiveTab('inventory')}>
              <AlertTriangleIcon size={18} className="text-warning" />
              <div>
                <strong>{lowCount} Items Low</strong>
                <p>Restock needed</p>
              </div>
            </div>
          )}

          {/* Sync Catalog Button */}
          <button
            type="button"
            className="btn-refresh-sync mb-2"
            onClick={refreshData}
            title="Reload latest official prices and product catalog"
          >
            <RefreshCwIcon size={15} />
            <span>Sync Catalog</span>
          </button>

          {/* Sign Out / Switch Branch Button */}
          <button
            type="button"
            className="btn-sidebar-signout"
            onClick={logoutShop}
            title="Sign out of current store"
          >
            <span>⎋ Sign Out / Switch Store</span>
          </button>

          {/* Legal Nominative Fair Use Disclaimer */}
          <p className="sidebar-legal-text">
            Independent platform. Jotun, Fenomastic & Jotashield are trademarks of Jotun A/S.
          </p>
        </div>
      </aside>

      {/* Mobile Top Header (iOS / Android) */}
      <header className="mobile-top-header">
        <div className="mobile-brand">
          <PaintBucketIcon size={22} className="text-primary" />
          <div className="mobile-title-block">
            <h3>PaintFlow</h3>
            <span className="mobile-page-name">{currentShop?.name || 'Jotun Retailer'}</span>
          </div>
        </div>

        <div className="mobile-header-actions">
          <button
            type="button"
            className="mobile-refresh-btn"
            onClick={logoutShop}
            title="Sign Out / Switch Store"
            style={{ fontSize: '13px', fontWeight: 'bold' }}
          >
            ⎋
          </button>

          <span
            className={`mobile-cloud-pill ${cloudStatus === 'connected' ? 'cloud-online' : 'cloud-local'}`}
            title={cloudStatus === 'connected' ? 'Connected to Supabase Cloud' : 'Running in Offline Local Mode'}
          >
            {cloudStatus === 'connected' ? '☁️ Live' : '⚡ Local'}
          </span>

          {lowCount > 0 && (
            <button
              type="button"
              className="mobile-alert-pill"
              onClick={() => setActiveTab('inventory')}
              title="View Low Stock Items"
            >
              <AlertTriangleIcon size={14} />
              <span>{lowCount} Low</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Bottom Thumb Navigation Bar (iOS / Android) */}
      <nav className="mobile-bottom-nav">
        {navItems.slice(0, 5).map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`mobile-nav-btn ${isActive ? 'active' : ''}`}
            >
              <div className="icon-badge-wrapper">
                <Icon size={20} />
                {item.badge && <span className="mobile-dot-badge"></span>}
              </div>
              <span>{item.label === 'Sales History' ? 'Sales' : item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`mobile-nav-btn ${activeTab === 'reports' ? 'active' : ''}`}
        >
          <BarChart3Icon size={20} />
          <span>Reports</span>
        </button>
      </nav>
    </>
  );
}
