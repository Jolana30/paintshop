import { useState } from 'react';
import { useStock } from '../context/StockContext';
import {
  PaintBucketIcon,
  CheckCircleIcon
} from '../components/Icons';

export default function AuthPage({ onOpenAdmin }) {
  const {
    currentShop,
    allShops,
    loginShop,
    registerShop,
    approveShop,
    suspendShop,
    deleteShop,
    logoutShop,
    authError,
    clearAuthError,
    refreshData,
    showToast
  } = useStock();

  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [cityAddress, setCityAddress] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [formMessage, setFormMessage] = useState(null);
  const [emailConfirmationNotice, setEmailConfirmationNotice] = useState(null);
  const [registeredPendingShop, setRegisteredPendingShop] = useState(null);

  // Platform Admin Console State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [adminPin, setAdminPin] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [adminFilter, setAdminFilter] = useState('all'); // 'all' | 'pending' | 'active'

  // Strict Phone Validation: Only allow digits 0-9, leading +, spaces, hyphens
  const handlePhoneKeyDown = (e) => {
    // Allow navigation, deletion, backspace, tab, enter, escape
    if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      return;
    }
    // Allow keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Cmd+A, etc.)
    if (e.ctrlKey || e.metaKey) {
      return;
    }
    // Strictly prevent letters and special characters
    if (!/[\d+ -]/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handlePhoneChange = (e) => {
    // Strip non-digit / non-phone characters
    const clean = e.target.value.replace(/[^\d+ -]/g, '');
    setPhone(clean);
  };

  // Quick Demo presets for testing
  const handleQuickDemoLogin = (shopType) => {
    if (shopType === 'bole') {
      loginShop('bole@jotunshop.et', 'demo123', {
        id: 'shop-demo-bole',
        name: 'Jotun Bole Paint Center',
        owner_name: 'Abebe Kebede',
        phone: '+251 911 234 567',
        city_address: 'Bole Medhanialem, Addis Ababa',
        tin_number: '0019283746',
        email: 'bole@jotunshop.et',
        status: 'active',
        isDemo: true
      });
    } else if (shopType === 'merkato') {
      loginShop('merkato@jotunshop.et', 'demo123', {
        id: 'shop-demo-merkato',
        name: 'Merkato Colors (Jotun Dealer)',
        owner_name: 'Sara Tesfaye',
        phone: '+251 922 987 654',
        city_address: 'Merkato Military Terra, Addis Ababa',
        tin_number: '0048291038',
        email: 'merkato@jotunshop.et',
        status: 'active',
        isDemo: true
      });
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setFormMessage(null);
    clearAuthError();

    const success = await loginShop(loginEmail, loginPassword);
    setIsLoading(false);
    if (!success && !authError) {
      setFormMessage({ type: 'error', text: 'Invalid email or password. Please check your credentials.' });
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!shopName.trim() || !phone.trim() || !cityAddress.trim() || !regEmail.trim() || !regPassword.trim()) {
      setFormMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    setIsLoading(true);
    setFormMessage(null);
    clearAuthError();

    const res = await registerShop({
      shopName: shopName.trim(),
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      cityAddress: cityAddress.trim(),
      tinNumber: tinNumber.trim(),
      email: regEmail.trim().toLowerCase(),
      password: regPassword
    });

    setIsLoading(false);
    if (res?.success) {
      if (res.shop) {
        setRegisteredPendingShop(res.shop);
      }
    } else {
      setFormMessage({
        type: 'error',
        text: res?.message || authError || 'Registration could not be completed. Please try again.'
      });
    }
  };

  const handleAdminUnlock = (e) => {
    e.preventDefault();
    if (adminPin.trim() === 'admin2026') {
      setIsAdminAuthenticated(true);
      setAdminError('');
    } else {
      setAdminError('Incorrect Master PIN. (Default: admin2026)');
    }
  };

  // Filtered shops list for Platform Admin Console
  const filteredShops = (allShops || []).filter(s => {
    if (adminFilter === 'pending') return s.status !== 'active';
    if (adminFilter === 'active') return s.status === 'active';
    return true;
  });

  const pendingCount = (allShops || []).filter(s => s.status !== 'active').length;
  const activeCount = (allShops || []).filter(s => s.status === 'active').length;

  // Render Platform Admin Console Modal
  const renderAdminModal = () => {
    if (!isAdminModalOpen) return null;

    return (
      <div className="admin-modal-overlay" onClick={() => setIsAdminModalOpen(false)}>
        <div className="admin-modal-container" onClick={(e) => e.stopPropagation()}>
          <div className="admin-modal-header">
            <div>
              <h3>🛡️ PaintFlow Platform Admin Console</h3>
              <p>Store Approvals, Activation Gate & Commercial SaaS Manager</p>
            </div>
            <button
              type="button"
              className="admin-modal-close"
              onClick={() => setIsAdminModalOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="admin-modal-body">
            {!isAdminAuthenticated ? (
              <form onSubmit={handleAdminUnlock} className="admin-auth-box">
                <div className="admin-auth-icon">🔐</div>
                <h4 className="admin-auth-title">Platform Administrator Access</h4>
                <p className="admin-auth-desc">
                  Enter the platform master PIN to manage paid subscriptions, approve newly registered shops, or suspend accounts.
                </p>

                {adminError && (
                  <div className="auth-banner banner-error mb-3" style={{ padding: '0.6rem', fontSize: '0.8rem' }}>
                    {adminError}
                  </div>
                )}

                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Master PIN (admin2026)"
                  value={adminPin}
                  onChange={(e) => { setAdminPin(e.target.value); setAdminError(''); }}
                  className="admin-pin-input"
                />

                <button
                  type="submit"
                  className="btn-auth-submit"
                  style={{ marginTop: '0.25rem' }}
                >
                  Unlock Admin Console
                </button>
              </form>
            ) : (
              <div>
                {/* Stats Bar */}
                <div className="admin-stats-bar">
                  <div className="admin-stat-card">
                    <span className="admin-stat-val">{(allShops || []).length}</span>
                    <span className="admin-stat-label">Total Stores</span>
                  </div>
                  <div className="admin-stat-card" style={{ borderColor: '#fde68a', background: '#fffdf5' }}>
                    <span className="admin-stat-val" style={{ color: '#d97706' }}>{pendingCount}</span>
                    <span className="admin-stat-label">Pending Approval</span>
                  </div>
                  <div className="admin-stat-card" style={{ borderColor: '#d1fae5', background: '#fcfdfd' }}>
                    <span className="admin-stat-val" style={{ color: '#059669' }}>{activeCount}</span>
                    <span className="admin-stat-label">Active Paid Licenses</span>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="admin-tabs-row">
                  <button
                    type="button"
                    className={`admin-tab-btn ${adminFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setAdminFilter('all')}
                  >
                    All Stores ({(allShops || []).length})
                  </button>
                  <button
                    type="button"
                    className={`admin-tab-btn ${adminFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => setAdminFilter('pending')}
                  >
                    Pending Activation ({pendingCount})
                  </button>
                  <button
                    type="button"
                    className={`admin-tab-btn ${adminFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setAdminFilter('active')}
                  >
                    Active Stores ({activeCount})
                  </button>
                </div>

                {/* Shops List */}
                <div className="admin-shops-list">
                  {filteredShops.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b', fontSize: '0.9rem' }}>
                      No stores found matching this filter.
                    </div>
                  ) : (
                    filteredShops.map(shop => {
                      const isPending = shop.status !== 'active';
                      return (
                        <div
                          key={shop.id}
                          className={`admin-shop-card ${isPending ? 'is-pending' : 'is-active'}`}
                        >
                          <div className="admin-shop-card-top">
                            <div>
                              <h4 className="admin-shop-name">{shop.name}</h4>
                              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                ID: <code>{shop.id}</code>
                              </span>
                            </div>
                            <span className={`badge-pill ${isPending ? 'badge-warning' : 'badge-success'}`}>
                              {isPending ? '⏳ Pending Approval' : '✓ Active & Paid'}
                            </span>
                          </div>

                          <div className="admin-shop-meta-grid">
                            <div className="admin-shop-meta-item">
                              <strong>Owner / Contact:</strong> {shop.owner_name || 'N/A'}
                            </div>
                            <div className="admin-shop-meta-item">
                              <strong>Phone:</strong> {shop.phone || 'N/A'}
                            </div>
                            <div className="admin-shop-meta-item">
                              <strong>Email:</strong> {shop.email}
                            </div>
                            <div className="admin-shop-meta-item">
                              <strong>Location:</strong> {shop.city_address || 'Addis Ababa'}
                            </div>
                            {shop.tin_number && (
                              <div className="admin-shop-meta-item">
                                <strong>TIN:</strong> {shop.tin_number}
                              </div>
                            )}
                          </div>

                          <div className="admin-shop-actions">
                            {isPending ? (
                              <button
                                type="button"
                                className="btn-admin-act-approve"
                                onClick={() => approveShop(shop.id)}
                              >
                                ✓ Approve & Activate Store
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-admin-act-suspend"
                                onClick={() => suspendShop(shop.id)}
                              >
                                ⏸️ Suspend Access
                              </button>
                            )}

                            {!shop.isDemo && (
                              <button
                                type="button"
                                className="btn-admin-act-delete"
                                onClick={() => {
                                  if (window.confirm(`Are you sure you want to remove "${shop.name}"?`)) {
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
            )}
          </div>

          <div className="admin-modal-footer">
            {isAdminAuthenticated && (
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
                onClick={() => {
                  setIsAdminAuthenticated(false);
                  setAdminPin('');
                }}
              >
                🔒 Lock Console
              </button>
            )}
            <button
              type="button"
              className="btn-primary"
              style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
              onClick={() => setIsAdminModalOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Show email confirmation holding view if user must verify inbox first
  if (emailConfirmationNotice) {
    return (
      <div className="auth-fullscreen-container">
        <div className="auth-approval-card">
          <div className="approval-icon-wrapper" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <span className="approval-badge-icon">✉️</span>
          </div>
          <h2 className="approval-title">Verification Email Sent</h2>
          <p className="approval-subtitle">
            We sent an activation link to <strong>{emailConfirmationNotice}</strong>.
          </p>
          <p className="approval-note">
            Please check your inbox (and spam folder) and click the verification link to confirm your account. After confirming, you can sign in to your paint shop portal.
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '1.5rem', width: '100%' }}
            onClick={() => {
              setEmailConfirmationNotice(null);
              setActiveTab('login');
            }}
          >
            Return to Sign In
          </button>
        </div>
      </div>
    );
  }

  const pendingShop = (currentShop && currentShop.status === 'pending_approval') ? currentShop : registeredPendingShop;

  // 1-Click Paid SaaS Activation Gate: If a shop is registered but pending approval
  if (pendingShop) {
    return (
      <div className="auth-fullscreen-container">
        {renderAdminModal()}
        <div className="auth-approval-card">
          <div className="approval-icon-wrapper" style={{ background: '#fef3c7', color: '#d97706' }}>
            <span className="approval-badge-icon">⏳</span>
          </div>
          <h2 className="approval-title">Store Account Pending Activation</h2>
          <p className="approval-subtitle">
            Welcome to PaintFlow, <strong>{pendingShop.name}</strong>!
          </p>

          <div className="holding-commercial-box">
            <h4>🛡️ Commercial SaaS License Notice</h4>
            <p>
              PaintFlow is a specialized commercial POS and inventory solution for Jotun paint dealers. Because it is a paid business service, newly registered shops must be confirmed and activated by the platform administrator before counter sales and inventory registers are unlocked.
            </p>
          </div>

          <div className="approval-details-box">
            <div className="detail-row">
              <span className="detail-label">Store / Branch:</span>
              <span className="detail-val">{pendingShop.name}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Location / City:</span>
              <span className="detail-val">{pendingShop.city_address}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Contact Phone:</span>
              <span className="detail-val">{pendingShop.phone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Personal / Store Email:</span>
              <span className="detail-val">{pendingShop.email}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Owner / Contact:</span>
              <span className="detail-val">{pendingShop.owner_name || 'Store Manager'}</span>
            </div>
            {pendingShop.tin_number && (
              <div className="detail-row">
                <span className="detail-label">TIN Number:</span>
                <span className="detail-val">{pendingShop.tin_number}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Jotun Catalog:</span>
              <span className="badge-pill badge-success">46 Official Paints Initialized</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Account Status:</span>
              <span className="badge-pill badge-warning">⏳ Pending Subscription Activation</span>
            </div>
          </div>

          <div className="holding-support-box">
            <div><strong>To activate your subscription or confirm bank transfer:</strong></div>
            <div className="holding-contact-line">
              <span>📞 Platform Desk:</span>
              <span>+251 911 234 567 / +251 922 987 654</span>
            </div>
            <div className="holding-contact-line">
              <span>✉️ Billing Email:</span>
              <span>billing@paintflow.et</span>
            </div>
          </div>

          <div className="admin-demo-approval-action">
            {/* Direct Admin Review Button */}
            <button
              type="button"
              className="btn-admin-approve"
              style={{ width: '100%', justifyContent: 'center', background: '#0f172a', color: '#ffffff', padding: '0.85rem' }}
              onClick={() => onOpenAdmin ? onOpenAdmin() : setIsAdminModalOpen(true)}
            >
              <span>🛡️ Platform Admin: Review & Activate Store</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '0.75rem', width: '100%', display: 'flex', justifyContent: 'center', gap: '0.4rem', alignItems: 'center' }}
              onClick={async () => {
                await refreshData();
                showToast("Checking store activation status...", "info");
              }}
            >
              <span>🔄 Check Activation Status</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '0.75rem', width: '100%', display: 'flex', justifyContent: 'center' }}
              onClick={() => {
                setRegisteredPendingShop(null);
                logoutShop();
              }}
            >
              ⎋ Sign Out / Change Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-fullscreen-container">
      {renderAdminModal()}
      <div className="auth-card-wrapper">
        {/* Left Presentation Hero */}
        <div className="auth-hero-panel">
          <div className="auth-hero-brand">
            <div className="hero-logo-box">
              <PaintBucketIcon size={32} />
            </div>
            <div>
              <h1 className="hero-app-title">PaintFlow</h1>
              <span className="hero-app-badge">for Jotun Paint Retailers</span>
            </div>
          </div>

          <p className="hero-pitch">
            The modern POS and inventory management system designed specifically for independent Jotun paint stores and hardware retailers.
          </p>

          <div className="hero-features-list">
            <div className="hero-feature-item">
              <CheckCircleIcon size={18} className="text-emerald" />
              <div>
                <strong>All 46 Official Jotun Paints Built-in</strong>
                <p>Standardized Fenomastic, Jotashield, and Primers catalog ready out-of-the-box.</p>
              </div>
            </div>

            <div className="hero-feature-item">
              <CheckCircleIcon size={18} className="text-emerald" />
              <div>
                <strong>Custom Local Accessories</strong>
                <p>Add and stock your own brushes, rollers, masking tape, and local putty.</p>
              </div>
            </div>

            <div className="hero-feature-item">
              <CheckCircleIcon size={18} className="text-emerald" />
              <div>
                <strong>Ethiopian 3% Withholding Tax (WHT)</strong>
                <p>Automatic deduction calculations and Ministry of Revenues (MoR) voucher tracking.</p>
              </div>
            </div>

            <div className="hero-feature-item">
              <CheckCircleIcon size={18} className="text-emerald" />
              <div>
                <strong>Multi-Device & Bank Ready</strong>
                <p>Instant checkout supporting Cash, CBE, Telebirr, and private bank transfers.</p>
              </div>
            </div>
          </div>

          {/* Quick Demo Login Preset Buttons */}
          <div className="demo-shops-box">
            <span className="demo-box-label">🚀 Instant Test Shops (Demo Mode):</span>
            <div className="demo-buttons-group">
              <button
                type="button"
                className="btn-demo-preset"
                onClick={() => handleQuickDemoLogin('bole')}
              >
                🏢 Shop 1: Jotun Bole Center
              </button>
              <button
                type="button"
                className="btn-demo-preset"
                onClick={() => handleQuickDemoLogin('merkato')}
              >
                🏬 Shop 2: Merkato Colors
              </button>
            </div>
            <div style={{ marginTop: '0.65rem', fontSize: '0.78rem', color: '#64748b', lineHeight: '1.4' }}>
              <div style={{ fontWeight: 600, color: '#334155', marginBottom: '2px' }}>Demo Accounts:</div>
              <div>• <strong>Bole</strong>: <code>bole@jotunshop.et</code> • Password: <code>demo123</code></div>
              <div>• <strong>Merkato</strong>: <code>merkato@jotunshop.et</code> • Password: <code>demo123</code></div>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="auth-form-panel">
          <div className="auth-tab-selector" style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              className={`auth-tab-btn ${activeTab === 'login' ? 'active' : ''}`}
              onClick={() => { setActiveTab('login'); setFormMessage(null); clearAuthError(); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => { setActiveTab('register'); setFormMessage(null); clearAuthError(); }}
            >
              <span className="tab-label-full">Register Paint Shop</span>
              <span className="tab-label-short">Register</span>
            </button>
            <button
              type="button"
              className="auth-tab-btn"
              style={{ background: '#0f172a', color: '#ffffff', fontWeight: 700, flex: '0 0 auto', padding: '0.65rem 0.85rem' }}
              onClick={() => onOpenAdmin ? onOpenAdmin() : setIsAdminModalOpen(true)}
              title="Platform Admin Console & Store Approvals"
            >
              <span>🛡️ Admin</span>
            </button>
          </div>

          {/* Top Feedback Banner */}
          {(formMessage || authError) && (
            <div className={`auth-banner ${formMessage?.type === 'success' ? 'banner-success' : 'banner-error'}`}>
              <span>{formMessage?.text || authError}</span>
            </div>
          )}

          {activeTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="auth-form">
              <div className="form-header-block">
                <h2>Welcome Back</h2>
                <p>Sign in to your shop counter and inventory management</p>
              </div>

              <div className="form-field">
                <label className="field-label">Personal or Store Email</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. yourname@gmail.com or store@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="field-input"
                  autoComplete="email"
                  inputMode="email"
                  enterKeyHint="next"
                />
              </div>

              <div className="form-field">
                <label className="field-label">Password</label>
                <div className="password-field-wrapper">
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="field-input"
                    autoComplete="current-password"
                    enterKeyHint="go"
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    tabIndex={-1}
                  >
                    {showLoginPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-auth-submit"
              >
                {isLoading ? 'Signing In...' : 'Sign In to Shop'}
              </button>

              <div className="auth-footer-help">
                <span>Want to register a new branch? </span>
                <button
                  type="button"
                  className="link-switch"
                  onClick={() => { setActiveTab('register'); setFormMessage(null); }}
                >
                  Register Paint Shop
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="auth-form">
              <div className="form-header-block">
                <h2>Register Your Paint Shop</h2>
                <p>Set up an independent store account with full Jotun catalog</p>
              </div>

              <div className="form-field">
                <label className="field-label">Shop / Branch Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bole Paint Center (Jotun Retailer)"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="field-input"
                  autoComplete="organization"
                  enterKeyHint="next"
                />
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label className="field-label">Owner / Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Abebe Kebede"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="field-input"
                    autoComplete="name"
                    enterKeyHint="next"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">Phone Number (Digits Only) *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 0911234567 or +251911234567"
                    value={phone}
                    onKeyDown={handlePhoneKeyDown}
                    onChange={handlePhoneChange}
                    className="field-input"
                    autoComplete="tel"
                    inputMode="tel"
                    enterKeyHint="next"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label className="field-label">City / Address *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Bole Medhanialem, Addis Ababa"
                    value={cityAddress}
                    onChange={(e) => setCityAddress(e.target.value)}
                    className="field-input"
                    autoComplete="street-address"
                    enterKeyHint="next"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">TIN Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 0019283746"
                    value={tinNumber}
                    onChange={(e) => setTinNumber(e.target.value)}
                    className="field-input"
                    inputMode="numeric"
                    enterKeyHint="next"
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label className="field-label">Personal or Store Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. yourname@gmail.com or store@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="field-input"
                    autoComplete="email"
                    inputMode="email"
                    enterKeyHint="next"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">Create Password *</label>
                  <div className="password-field-wrapper">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      required
                      placeholder="Minimum 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="field-input"
                      autoComplete="new-password"
                      enterKeyHint="done"
                      minLength={6}
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      tabIndex={-1}
                    >
                      {showRegPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom error banner right above submit button for immediate feedback */}
              {(formMessage || authError) && (
                <div className={`auth-banner ${formMessage?.type === 'success' ? 'banner-success' : 'banner-error'}`} style={{ marginTop: '0.75rem', marginBottom: '0.25rem' }}>
                  <span>{formMessage?.text || authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="btn-auth-submit"
              >
                {isLoading ? 'Submitting Registration...' : 'Register Paint Shop'}
              </button>

              <div className="auth-footer-help">
                <span>Already have a shop account? </span>
                <button
                  type="button"
                  className="link-switch"
                  onClick={() => { setActiveTab('login'); setFormMessage(null); }}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* Admin Console Access Link */}
          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button
              type="button"
              className="btn-open-admin-link"
              onClick={() => onOpenAdmin ? onOpenAdmin() : setIsAdminModalOpen(true)}
            >
              🛡️ Platform Admin Console (Platform Owner)
            </button>
          </div>

          {/* Legal Nominative Fair Use Disclaimer */}
          <div className="legal-disclaimer-box">
            <p>
              <strong>Disclaimer:</strong> PaintFlow is an independent point-of-sale and inventory management platform created for paint retailers and dealers. Jotun, Fenomastic, and Jotashield are registered trademarks of Jotun A/S. PaintFlow is not affiliated with, sponsored by, or endorsed by Jotun A/S.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
