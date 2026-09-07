import { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';
import {
  PaintBucketIcon,
  CheckCircleIcon,
  SearchIcon,
  RefreshCwIcon
} from '../components/Icons';

export default function AdminPage({ onBackToApp, onSelectShop }) {
  const {
    allShops,
    approveShop,
    suspendShop,
    deleteShop,
    refreshData,
    showToast
  } = useStock();

  const [adminPin, setAdminPin] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('paintflow_admin_auth') === 'true';
  });
  const [authError, setAuthError] = useState('');
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'pending' | 'active'
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleUnlock = (e) => {
    e.preventDefault();
    if (adminPin.trim() === 'admin2026') {
      setIsAuthenticated(true);
      sessionStorage.setItem('paintflow_admin_auth', 'true');
      setAuthError('');
      showToast('Administrator Console Unlocked', 'success');
    } else {
      setAuthError('Incorrect Master PIN. (Default: admin2026)');
    }
  };

  const handleLock = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('paintflow_admin_auth');
    setAdminPin('');
    showToast('Admin Console Locked', 'info');
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setIsRefreshing(false);
    showToast('Store registry refreshed from Supabase cloud.', 'success');
  };

  // Filter and search shops
  const filteredShops = useMemo(() => {
    const list = Array.isArray(allShops) ? allShops : [];
    const q = searchQuery.toLowerCase().trim();

    return list.filter(shop => {
      // Tab filter
      if (filterTab === 'pending' && shop.status === 'active') return false;
      if (filterTab === 'active' && shop.status !== 'active') return false;

      // Text query
      if (!q) return true;
      return (
        (shop.name || '').toLowerCase().includes(q) ||
        (shop.owner_name || '').toLowerCase().includes(q) ||
        (shop.email || '').toLowerCase().includes(q) ||
        (shop.phone || '').toLowerCase().includes(q) ||
        (shop.city_address || '').toLowerCase().includes(q) ||
        (shop.tin_number || '').toLowerCase().includes(q) ||
        (shop.id || '').toLowerCase().includes(q)
      );
    });
  }, [allShops, filterTab, searchQuery]);

  const totalCount = (allShops || []).length;
  const pendingCount = (allShops || []).filter(s => s.status !== 'active').length;
  const activeCount = (allShops || []).filter(s => s.status === 'active').length;

  // Unauthenticated PIN Gate
  if (!isAuthenticated) {
    return (
      <div className="auth-fullscreen-container">
        <div className="auth-approval-card" style={{ maxWidth: '440px' }}>
          <div className="approval-icon-wrapper" style={{ background: '#0f172a', color: '#ffffff' }}>
            <span style={{ fontSize: '1.8rem' }}>🛡️</span>
          </div>

          <h2 className="approval-title">Platform Admin Portal</h2>
          <p className="approval-subtitle">
            PaintFlow Store Approvals & Commercial SaaS Console
          </p>

          <form onSubmit={handleUnlock} style={{ marginTop: '1.25rem' }}>
            <div style={{ marginBottom: '1.25rem', textAlign: 'left' }}>
              <label className="field-label">Administrator Master PIN</label>
              <input
                type="password"
                required
                autoFocus
                placeholder="Enter PIN (admin2026)"
                value={adminPin}
                onChange={(e) => { setAdminPin(e.target.value); setAuthError(''); }}
                className="field-input"
                style={{ textAlign: 'center', fontSize: '1.15rem', letterSpacing: '2px', padding: '0.75rem' }}
              />
            </div>

            {authError && (
              <div className="auth-banner banner-error mb-3">
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn-auth-submit"
              style={{ background: '#0f172a', color: '#ffffff' }}
            >
              Unlock Admin Console
            </button>

            {onBackToApp && (
              <button
                type="button"
                className="btn-secondary"
                style={{ marginTop: '0.75rem', width: '100%', display: 'flex', justifyContent: 'center' }}
                onClick={onBackToApp}
              >
                ← Return to Store / Login
              </button>
            )}
          </form>

          <div style={{ marginTop: '1.5rem', fontSize: '0.78rem', color: '#64748b' }}>
            Hint for platform administrators & developers: Master PIN is <code>admin2026</code>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated Super Admin Management Console
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '1.5rem 1rem' }}>
      <div style={{ maxWidth: '1060px', margin: '0 auto' }}>
        {/* Top Header Bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#0f172a',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              background: '#2563eb',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <PaintBucketIcon size={24} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>
                PaintFlow Platform Admin
              </h1>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Store Registry, License Activation & Commercial Subscriptions
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', border: 'none', padding: '0.5rem 0.9rem', fontSize: '0.82rem' }}
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCwIcon size={14} className={isRefreshing ? 'spin-icon' : ''} />
              <span>Sync Cloud</span>
            </button>

            {onBackToApp && (
              <button
                type="button"
                className="btn-primary"
                style={{ padding: '0.5rem 1rem', fontSize: '0.82rem' }}
                onClick={onBackToApp}
              >
                ← Back to App
              </button>
            )}

            <button
              type="button"
              className="btn-secondary"
              style={{ background: '#334155', color: '#e2e8f0', border: 'none', padding: '0.5rem 0.85rem', fontSize: '0.82rem' }}
              onClick={handleLock}
              title="Lock Admin Console"
            >
              🔒 Lock
            </button>
          </div>
        </div>

        {/* Statistics Metric Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Stores Registered</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', marginTop: '0.25rem' }}>{totalCount}</div>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Platform store registry</span>
          </div>

          <div style={{ background: '#fffdf5', border: '1px solid #fde68a', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>⏳ Pending Activation</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d97706', marginTop: '0.25rem' }}>{pendingCount}</div>
            <span style={{ fontSize: '0.78rem', color: '#b45309' }}>Awaiting subscription approval</span>
          </div>

          <div style={{ background: '#fcfdfd', border: '1px solid #d1fae5', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>✓ Active Licenses</span>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#059669', marginTop: '0.25rem' }}>{activeCount}</div>
            <span style={{ fontSize: '0.78rem', color: '#047857' }}>Counter POS & inventory unlocked</span>
          </div>
        </div>

        {/* Filter & Search Toolbar */}
        <div style={{
          background: '#ffffff',
          borderRadius: '14px',
          padding: '1rem',
          border: '1px solid #e2e8f0',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className={`admin-tab-btn ${filterTab === 'all' ? 'active' : ''}`}
              onClick={() => setFilterTab('all')}
            >
              All Stores ({totalCount})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${filterTab === 'pending' ? 'active' : ''}`}
              onClick={() => setFilterTab('pending')}
            >
              Pending Approval ({pendingCount})
            </button>
            <button
              type="button"
              className={`admin-tab-btn ${filterTab === 'active' ? 'active' : ''}`}
              onClick={() => setFilterTab('active')}
            >
              Active Stores ({activeCount})
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '240px', flex: '1', maxWidth: '380px' }}>
            <SearchIcon size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Search store, owner, phone, city..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="field-input"
              style={{ paddingLeft: '2.25rem', fontSize: '0.85rem' }}
            />
          </div>
        </div>

        {/* Stores List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {filteredShops.length === 0 ? (
            <div style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '3rem 1rem',
              textAlign: 'center',
              border: '1px dashed #cbd5e1',
              color: '#64748b'
            }}>
              <p style={{ margin: 0, fontSize: '0.95rem' }}>No paint shops found matching this criteria.</p>
            </div>
          ) : (
            filteredShops.map(shop => {
              const isPending = shop.status !== 'active';
              return (
                <div
                  key={shop.id}
                  style={{
                    background: isPending ? '#fffdf5' : '#ffffff',
                    border: `1px solid ${isPending ? '#fde68a' : '#e2e8f0'}`,
                    borderRadius: '14px',
                    padding: '1.25rem',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                          {shop.name}
                        </h3>
                        {shop.isDemo && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#e0e7ff', color: '#3730a3', borderRadius: '4px', fontWeight: 700 }}>
                            DEMO STORE
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Store ID: <code>{shop.id}</code>
                      </span>
                    </div>

                    <span className={`badge-pill ${isPending ? 'badge-warning' : 'badge-success'}`}>
                      {isPending ? '⏳ Pending Subscription Activation' : '✓ Active Paid License'}
                    </span>
                  </div>

                  {/* Details Grid */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.6rem 1rem',
                    fontSize: '0.83rem',
                    margin: '0.85rem 0',
                    padding: '0.75rem',
                    background: isPending ? 'rgba(254, 243, 199, 0.4)' : '#f8fafc',
                    borderRadius: '8px'
                  }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>OWNER / MANAGER</span>
                      <strong style={{ color: '#1e293b' }}>{shop.owner_name || 'Store Manager'}</strong>
                    </div>

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>CONTACT PHONE</span>
                      <a href={`tel:${shop.phone}`} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                        {shop.phone || 'N/A'}
                      </a>
                    </div>

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>PERSONAL / STORE EMAIL</span>
                      <a href={`mailto:${shop.email}`} style={{ color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                        {shop.email}
                      </a>
                    </div>

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>LOCATION / BRANCH</span>
                      <strong style={{ color: '#1e293b' }}>{shop.city_address || 'Addis Ababa'}</strong>
                    </div>

                    {shop.tin_number && (
                      <div>
                        <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>TIN NUMBER</span>
                        <code style={{ color: '#0f172a', fontWeight: 700 }}>{shop.tin_number}</code>
                      </div>
                    )}

                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '0.72rem', fontWeight: 600 }}>OFFICIAL CATALOG</span>
                      <span style={{ color: '#059669', fontWeight: 700 }}>✓ 46 Jotun Paints Ready</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    flexWrap: 'wrap',
                    paddingTop: '0.6rem',
                    borderTop: '1px solid rgba(0,0,0,0.06)'
                  }}>
                    {isPending ? (
                      <button
                        type="button"
                        className="btn-admin-act-approve"
                        style={{ padding: '0.55rem 1.15rem', fontSize: '0.85rem' }}
                        onClick={() => approveShop(shop.id)}
                      >
                        <CheckCircleIcon size={16} />
                        <span>✓ Approve & Activate License</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-admin-act-suspend"
                        style={{ padding: '0.55rem 1rem', fontSize: '0.85rem' }}
                        onClick={() => suspendShop(shop.id)}
                      >
                        <span>⏸️ Suspend Subscription</span>
                      </button>
                    )}

                    {onSelectShop && (
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '0.55rem 0.9rem', fontSize: '0.82rem' }}
                        onClick={() => onSelectShop(shop)}
                        title="Open this shop's counter POS"
                      >
                        <span>🏪 Open POS as this Shop</span>
                      </button>
                    )}

                    {!shop.isDemo && (
                      <button
                        type="button"
                        className="btn-admin-act-delete"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to delete "${shop.name}" from the store directory?`)) {
                            deleteShop(shop.id);
                          }
                        }}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
