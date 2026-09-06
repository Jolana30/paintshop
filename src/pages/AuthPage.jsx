import React, { useState } from 'react';
import { useStock } from '../context/StockContext';
import {
  PaintBucketIcon,
  CheckCircleIcon,
  AlertTriangleIcon
} from '../components/Icons';

export default function AuthPage() {
  const { currentShop, loginShop, registerShop, approveShop, logoutShop, authError, clearAuthError } = useStock();
  const [activeTab, setActiveTab] = useState('login'); // 'login' | 'register'

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [cityAddress, setCityAddress] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [formMessage, setFormMessage] = useState(null);
  const [emailConfirmationNotice, setEmailConfirmationNotice] = useState(null);

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
        status: 'active'
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
        status: 'active'
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
      if (res.requireEmailConfirmation) {
        setEmailConfirmationNotice(res.email);
      } else {
        setFormMessage({
          type: 'success',
          text: 'Shop successfully registered! Your application is pending administrator activation.'
        });
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

  // If a shop is registered but pending approval, show clean holding screen
  if (currentShop && currentShop.status === 'pending_approval') {
    return (
      <div className="auth-fullscreen-container">
        <div className="auth-approval-card">
          <div className="approval-icon-wrapper">
            <span className="approval-badge-icon">⏳</span>
          </div>
          <h2 className="approval-title">Branch Registration Under Review</h2>
          <p className="approval-subtitle">
            Thank you for registering <strong>{currentShop.name}</strong>.
          </p>

          <div className="approval-details-box">
            <div className="detail-row">
              <span className="detail-label">Location / City:</span>
              <span className="detail-val">{currentShop.city_address}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Contact Phone:</span>
              <span className="detail-val">{currentShop.phone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Owner / Contact:</span>
              <span className="detail-val">{currentShop.owner_name || 'Store Manager'}</span>
            </div>
            {currentShop.tin_number && (
              <div className="detail-row">
                <span className="detail-label">TIN Number:</span>
                <span className="detail-val">{currentShop.tin_number}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Status:</span>
              <span className="badge-pill badge-warning">Pending Administrator Approval</span>
            </div>
          </div>

          <p className="approval-note">
            To ensure authorized dealer compliance, our SaaS administrator verifies every paint retailer branch before unlocking the live POS and stock registers.
          </p>

          {/* Quick Demo Action for Testing / Local Environment */}
          <div className="admin-demo-approval-action">
            <button
              type="button"
              className="btn-admin-approve"
              onClick={() => approveShop(currentShop.id)}
            >
              <CheckCircleIcon size={16} />
              <span>[Demo Admin Action] Approve & Unlock Store Now</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ marginTop: '0.75rem', width: '100%', display: 'flex', justifyContent: 'center' }}
              onClick={logoutShop}
            >
              Sign Out / Switch Branch
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

          {/* Quick Demo Login Preset Buttons */}
          <div className="demo-shops-box">
            <span className="demo-box-label">🚀 Instant Test Shops (Click to explore):</span>
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
              Register Paint Shop
            </button>
          </div>

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
                <label className="field-label">Store Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. bole@jotunshop.et"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="field-input"
                />
              </div>

              <div className="form-field">
                <label className="field-label">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="field-input"
                />
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
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 0911 234 567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="field-input"
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
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-field">
                  <label className="field-label">Email Address *</label>
                  <input
                    type="email"
                    required
                    placeholder="store@example.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="field-input"
                  />
                </div>
                <div className="form-field">
                  <label className="field-label">Create Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="Minimum 6 characters"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="field-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-auth-submit"
              >
                {isLoading ? 'Creating Store Account...' : 'Register Paint Shop'}
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
