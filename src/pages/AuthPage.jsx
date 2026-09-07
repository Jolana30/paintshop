import { useState } from 'react';
import { useStock } from '../context/StockContext';
import {
  PaintBucketIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon
} from '../components/Icons';

export default function AuthPage() {
  const {
    currentShop,
    loginShop,
    registerShop,
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
              <span className="detail-label">Personal Email:</span>
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
            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}
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
              ⎋ Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-fullscreen-container">
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

          {/* Test Accounts Reference */}
          <div className="demo-shops-box">
            <span className="demo-box-label">🔑 Pre-configured Accounts:</span>
            <div style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: '#475569', lineHeight: '1.5' }}>
              <div>• <strong>Bole</strong>: <code>bole@jotunshop.et</code> (Password: <code>demo123</code>)</div>
              <div>• <strong>Merkato</strong>: <code>merkato@jotunshop.et</code> (Password: <code>demo123</code>)</div>
            </div>
            <p style={{ margin: '0.45rem 0 0', fontSize: '0.74rem', color: '#64748b' }}>
              Sign in with your store credentials. To access another branch, sign out and log in again.
            </p>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="auth-form-panel">
          <div className="auth-tab-selector">
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
                <label className="field-label">Personal Email</label>
                <input
                  type="email"
                  required
                  placeholder="name@gmail.com"
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
                    title={showLoginPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    tabIndex={-1}
                  >
                    {showLoginPassword ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
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
                  <label className="field-label">Personal Email *</label>
                  <input
                    type="email"
                    required
                    placeholder="name@gmail.com"
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
                      title={showRegPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      tabIndex={-1}
                    >
                      {showRegPassword ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
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
