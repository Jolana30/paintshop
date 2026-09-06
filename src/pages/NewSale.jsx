import { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  AlertTriangleIcon,
  PackageIcon
} from '../components/Icons';

export default function NewSale({ setActiveTab }) {
  const { products, processSale, formatCurrency, refreshData, showToast } = useStock();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [paymentType, setPaymentType] = useState('Cash'); // 'Cash', 'CBE', 'Sinke', 'Coop', 'Awash', 'Dashen'
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);

  // Ethiopian 3% Withholding Tax (WHT) State
  const [isWithholding, setIsWithholding] = useState(false);
  const [showWhtThresholdModal, setShowWhtThresholdModal] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerTin, setCustomerTin] = useState('');
  const [whtVoucherNumber, setWhtVoucherNumber] = useState('');
  const [whtVoucherStatus, setWhtVoucherStatus] = useState('pending'); // 'received' | 'pending'

  // Extract unique categories
  const categories = useMemo(() => {
    return ['ALL', ...Array.from(new Set(products.map(p => p.category)))];
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch = !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [products, selectedCategory, searchTerm]);

  // Helper: check if a paint is a tintable base (e.g. BS A, BS B, BS C, BASE A, BASE B, BASE C)
  // Non-base paints (like White, Matt White, Silk White, Primers, Putty) CANNOT have colorant added!
  const isTintableBase = (productName = '') => {
    const upper = productName.toUpperCase();
    return (
      upper.includes('BS A') ||
      upper.includes('BS B') ||
      upper.includes('BS C') ||
      upper.includes('BASE A') ||
      upper.includes('BASE B') ||
      upper.includes('BASE C')
    );
  };

  // Add or increment product in sale
  const handleAddProduct = (product) => {
    if (product.stock <= 0) return;

    setCart(prevCart => {
      const existing = prevCart.find(item => item.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          alert(`Cannot add more than available stock (${product.stock} units)`);
          return prevCart;
        }
        return prevCart.map(item => {
          if (item.productId === product.id) {
            const nextQty = item.quantity + 1;
            const currentTotalColorant = item.colorantCost || 0;
            const totalBeforeVat = (item.priceBeforeVat * nextQty) + currentTotalColorant;
            const machineTotal = currentTotalColorant > 0
              ? Math.floor((totalBeforeVat * 1.15) * 100) / 100
              : nextQty * item.unitPrice;
            return {
              ...item,
              quantity: nextQty,
              subtotal: machineTotal
            };
          }
          return item;
        });
      } else {
        const canTint = isTintableBase(product.name);
        return [
          ...prevCart,
          {
            productId: product.id,
            productName: product.name,
            code: product.code,
            size: product.size,
            unitPrice: product.priceWithVat,
            priceBeforeVat: product.priceBeforeVat,
            quantity: 1,
            maxStock: product.stock,
            isTintable: canTint,
            colorantCost: 0,
            subtotal: product.priceWithVat
          }
        ];
      }
    });
  };

  const handleDecrementProduct = (productId) => {
    setCart(prevCart => {
      const existing = prevCart.find(item => item.productId === productId);
      if (!existing) return prevCart;

      if (existing.quantity <= 1) {
        return prevCart.filter(item => item.productId !== productId);
      }

      return prevCart.map(item => {
        if (item.productId === productId) {
          const nextQty = item.quantity - 1;
          const currentTotalColorant = item.colorantCost || 0;
          const totalBeforeVat = (item.priceBeforeVat * nextQty) + currentTotalColorant;
          const machineTotal = currentTotalColorant > 0
            ? Math.floor((totalBeforeVat * 1.15) * 100) / 100
            : nextQty * item.unitPrice;
          return {
            ...item,
            quantity: nextQty,
            subtotal: machineTotal
          };
        }
        return item;
      });
    });
  };

  const updateQuantity = (productId, newQty) => {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty <= 0) {
      removeFromCart(productId);
      return;
    }

    const prod = products.find(p => p.id === productId);
    if (prod && qty > prod.stock) {
      alert(`Only ${prod.stock} units available in stock`);
      return;
    }

    setCart(prevCart =>
      prevCart.map(item => {
        if (item.productId === productId) {
          const currentTotalColorant = item.colorantCost || 0;
          const totalBeforeVat = (item.priceBeforeVat * qty) + currentTotalColorant;
          const machineTotal = currentTotalColorant > 0
            ? Math.floor((totalBeforeVat * 1.15) * 100) / 100
            : qty * item.unitPrice;
          return {
            ...item,
            quantity: qty,
            subtotal: machineTotal
          };
        }
        return item;
      })
    );
  };

  // Update colorant cost for tintable base cans directly from Jotun machine
  // In Jotun Colour Manager, if user selected multiple cans, machine already outputs the total colorant cost!
  const updateColorantCost = (productId, costInput) => {
    const cost = parseFloat(costInput);
    const validCost = isNaN(cost) || cost < 0 ? 0 : cost;

    setCart(prevCart =>
      prevCart.map(item => {
        if (item.productId === productId) {
          const totalBeforeVat = (item.priceBeforeVat * item.quantity) + validCost;
          const machineTotal = validCost > 0 
            ? Math.floor((totalBeforeVat * 1.15) * 100) / 100 
            : item.quantity * item.unitPrice;
          return {
            ...item,
            colorantCost: validCost,
            colorantCostInput: costInput === '' ? '' : costInput,
            colorantWithVat: machineTotal - (item.quantity * item.unitPrice),
            subtotal: machineTotal
          };
        }
        return item;
      })
    );
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item.productId !== productId));
  };

  const clearCart = () => {
    if (cart.length > 0 && window.confirm("Clear current sale items?")) {
      setCart([]);
    }
  };

  // Financial calculations
  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartBaseBeforeVat = cart.reduce((sum, item) => sum + (item.priceBeforeVat * item.quantity), 0);
  const cartColorantBeforeVat = cart.reduce((sum, item) => sum + (item.colorantCost || 0), 0);
  const cartSubtotalBeforeVat = cartBaseBeforeVat + cartColorantBeforeVat;
  const cartVatTotal = cartTotal - cartSubtotalBeforeVat;

  // Ethiopian 3% Withholding Tax Threshold and Calculations
  // Regulation: WHT (3%) is only applicable to commercial transactions of 20,000 ETB or more
  const WHT_MINIMUM_THRESHOLD = 20000;
  const cartGrossTotal = cartTotal;
  const isWhtEligible = cartGrossTotal >= WHT_MINIMUM_THRESHOLD;

  // Auto-reset withholding if cart falls below threshold (pure render-time state adjustment)
  if (isWithholding && !isWhtEligible) {
    setIsWithholding(false);
  }

  const cartWhtAmount = (isWithholding && isWhtEligible) ? Math.round((cartGrossTotal * 0.03) * 100) / 100 : 0;
  const cartNetPayable = (isWithholding && isWhtEligible) ? (cartGrossTotal - cartWhtAmount) : cartGrossTotal;

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Triggered when user attempts to toggle WHT
  const handleWhtToggleAttempt = (e) => {
    if (!isWhtEligible) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setShowWhtThresholdModal(true);
      showToast(`3% Withholding Tax requires a minimum transaction value of 20,000 ETB. Current total: ${formatCurrency(cartGrossTotal)}.`, 'warning');
      return;
    }
    setIsWithholding(prev => !prev);
  };

  // Record Sale and immediately show it in Sales History
  const handleRecordSale = async (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) {
      alert("Please add at least 1 product to the sale.");
      return;
    }
    if (isSubmitting) return;

    if (isWithholding && !isWhtEligible) {
      setShowWhtThresholdModal(true);
      showToast(`Withholding tax requires a minimum transaction value of 20,000 ETB. Current total is ${formatCurrency(cartGrossTotal)}.`, 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const completed = await processSale(cart, paymentType, {
        isWithholding: isWithholding && isWhtEligible,
        withholdingRate: 3.0,
        withholdingAmount: cartWhtAmount,
        netPayable: cartNetPayable,
        customerName: customerName.trim() || ((isWithholding && isWhtEligible) ? 'Corporate Contractor' : 'Cash Walk-in'),
        customerTin: customerTin.trim(),
        whtVoucherNumber: whtVoucherNumber.trim(),
        whtVoucherStatus: (isWithholding && isWhtEligible) ? whtVoucherStatus : 'not_applicable'
      });

      if (completed) {
        setCart([]);
        setPaymentType('Cash');
        setIsWithholding(false);
        setCustomerName('');
        setCustomerTin('');
        setWhtVoucherNumber('');
        setWhtVoucherStatus('pending');
        setIsMobileCartOpen(false);
        setActiveTab('sales');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Sale</h1>
          <p className="page-subtitle">Select paints, set quantity, and record sale directly into Sales History</p>
        </div>
        <div className="header-actions-group">
          {cart.length > 0 && (
            <button
              type="button"
              className="btn-header-cart-badge"
              onClick={() => setIsMobileCartOpen(true)}
              title="Open current order"
            >
              <ShoppingCartIcon size={15} />
              <span>Cart ({cartItemCount}) • {formatCurrency(cartTotal)}</span>
            </button>
          )}
          <button
            type="button"
            className="btn-outline-sm"
            onClick={refreshData}
            title="Refresh prices & stock from official sheet"
          >
            <RefreshCwIcon size={15} />
            Refresh Catalog
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => setActiveTab('inventory')}
            title="View store inventory & current stock"
          >
            <PackageIcon size={15} />
            Inventory Stock
          </button>
          <button
            type="button"
            className="btn-outline-sm"
            onClick={() => setActiveTab('sales')}
          >
            View Sales History ➔
          </button>
        </div>
      </div>

      <div className="sale-layout-grid">
        {/* Left Side: Product Selector */}
        <div className="sale-products-section">
          {/* Search & Category Filter */}
          <div className="product-search-bar">
            <div className="search-input-wrapper">
              <SearchIcon size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search paint by name or code (e.g. FENOMASTIC, JOTASHIELD, 15L)..."
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

            {/* Category horizontal scrolling chips */}
            <div className="category-chips-container">
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

          {/* Product Cards Grid */}
          <div className="products-grid">
            {filteredProducts.length === 0 ? (
              <div className="empty-state">
                <p>No products match your search.</p>
              </div>
            ) : (
              filteredProducts.map(p => {
                const isOutOfStock = p.stock <= 0;
                const isLow = p.stock <= p.minStock && !isOutOfStock;
                const inCartItem = cart.find(item => item.productId === p.id);

                return (
                  <div
                    key={p.id}
                    className={`product-card ${isOutOfStock ? 'disabled-card' : ''} ${inCartItem ? 'selected-card' : ''}`}
                  >
                    <div className="product-card-top">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="product-card-category">{p.category}</span>
                        {p.isCustom && <span className="badge-pill badge-warning" style={{ fontSize: '9px', padding: '1px 5px' }}>Custom</span>}
                      </div>
                      <span className="badge-tag">{p.size}</span>
                    </div>

                    <h4 className="product-card-name">{p.name}</h4>
                    <span className="product-card-code">{p.code}</span>

                    <div className="product-card-bottom">
                      <div className="price-block">
                        <span className="price-amount">{formatCurrency(p.priceWithVat)}</span>
                        <span className="vat-label">inc 15% VAT</span>
                      </div>

                      <div className="stock-block">
                        <span className={`stock-badge ${isOutOfStock ? 'badge-danger' : isLow ? 'badge-warning' : 'badge-healthy'}`}>
                          {isOutOfStock ? 'Out of stock' : `${p.stock} in stock`}
                        </span>
                      </div>
                    </div>

                    {/* Clean Quantity Selector & Add Button */}
                    {isOutOfStock ? (
                      <button type="button" disabled className="btn-add-cart disabled">
                        Out of Stock
                      </button>
                    ) : inCartItem ? (
                      <div className="card-selected-group">
                        <div className="card-qty-stepper">
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => handleDecrementProduct(p.id)}
                            title="Decrease quantity"
                          >
                            <MinusIcon size={16} />
                          </button>
                          <span className="stepper-count">
                            <strong>{inCartItem.quantity}</strong> in sale
                          </span>
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => handleAddProduct(p)}
                            disabled={inCartItem.quantity >= p.stock}
                            title="Add one more"
                          >
                            <PlusIcon size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="btn-card-proceed"
                          onClick={() => handleRecordSale()}
                          title="Click here to proceed and record this sale"
                        >
                          ✓ Proceed & Record Sale ➔
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn-add-cart"
                        onClick={() => handleAddProduct(p)}
                      >
                        + Add to Sale (1)
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Current Sale Order & Checkout (Desktop Sticky Sidebar) */}
        <div className="sale-cart-sidebar">
          <div className="cart-card">
            <div className="cart-header">
              <div className="flex-items-center gap-2">
                <ShoppingCartIcon size={20} className="text-primary" />
                <h3 className="section-heading">Current Sale Order</h3>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="btn-text-danger"
                  onClick={clearCart}
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="cart-items-list">
              {cart.length === 0 ? (
                <div className="empty-cart-state">
                  <ShoppingCartIcon size={40} className="text-muted" />
                  <p>No paints selected yet</p>
                  <span className="text-xs text-muted">
                    Click <strong>+ Add to Sale</strong> on any product on the left to add items.
                  </span>
                </div>
              ) : (
                cart.map(item => (
                  <div key={item.productId} className={`cart-item-card ${item.isTintable ? 'tintable-item-card' : ''}`}>
                    <div className="cart-item-row">
                      <div className="cart-item-info">
                        <span className="cart-item-name" title={item.productName}>{item.productName}</span>
                        <div className="cart-item-sub">
                          <span className="cart-item-size-badge">{item.size}</span>
                          <span className="cart-item-base-price">Base: {formatCurrency(item.unitPrice)}</span>
                        </div>
                      </div>

                      {/* Quantity controls */}
                      <div className="cart-item-qty-controls">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          title="Decrease"
                        >
                          <MinusIcon size={14} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={item.maxStock}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.productId, e.target.value)}
                          className="qty-input"
                        />
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          title="Increase"
                          disabled={item.quantity >= item.maxStock}
                        >
                          <PlusIcon size={14} />
                        </button>
                      </div>

                      <div className="cart-item-price-block">
                        <span className="cart-item-subtotal">{formatCurrency(item.subtotal)}</span>
                        <button
                          type="button"
                          className="btn-icon-trash"
                          onClick={() => removeFromCart(item.productId)}
                          title="Remove"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </div>

                    {/* ONLY FOR TINTABLE BASES: Optional Colorant Cost Input */}
                    {item.isTintable && (
                      <div className="colorant-input-row">
                        <div className="colorant-input-label">
                          <span>Colorant Cost:</span>
                        </div>
                        <div className="colorant-input-wrapper">
                          <span className="currency-prefix">ETB</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={item.colorantCostInput !== undefined ? item.colorantCostInput : (item.colorantCost || '')}
                            onChange={(e) => updateColorantCost(item.productId, e.target.value)}
                            className="colorant-number-input"
                            title="Enter colorant cost from machine"
                          />
                          {(item.colorantCost > 0 || item.colorantCostInput) && (
                            <button
                              type="button"
                              className="clear-colorant-btn"
                              onClick={() => updateColorantCost(item.productId, '')}
                              title="Clear colorant"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Cart Summary & Direct Record Sale Action */}
            {cart.length > 0 && (
              <form onSubmit={handleRecordSale} className="cart-footer">
                <div className="form-group mb-3">
                  <label className="form-label" style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Payment Type:</span>
                    <span className="badge-pill badge-primary" style={{ fontSize: '11px' }}>{paymentType}</span>
                  </label>
                  <div className="payment-type-grid">
                    {['Cash', 'CBE', 'Telebirr', 'Sinke', 'Coop', 'Awash', 'Dashen'].map(type => (
                      <button
                        key={type}
                        type="button"
                        className={`payment-type-btn ${paymentType === type ? 'active' : ''}`}
                        onClick={() => setPaymentType(type)}
                      >
                        {type === 'Cash' ? '💵 Cash' : type === 'Telebirr' ? '📱 Telebirr' : `🏦 ${type}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ethiopian 3% Withholding Tax (WHT) Section */}
                <div className="wht-checkout-box mb-3">
                  <div className="wht-toggle-header">
                    <label
                      className="wht-checkbox-label"
                      onClick={handleWhtToggleAttempt}
                      style={{ cursor: 'pointer' }}
                    >
                      <input
                        type="checkbox"
                        checked={isWithholding && isWhtEligible}
                        onChange={handleWhtToggleAttempt}
                        onClick={(e) => {
                          if (!isWhtEligible) {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowWhtThresholdModal(true);
                          }
                        }}
                      />
                      <span className="wht-toggle-title">Apply 3% Withholding Tax (WHT)</span>
                    </label>
                    {isWhtEligible && !isWithholding && (
                      <span className="badge-wht-hint">💡 Over 20k ETB (Eligible for 3% WHT)</span>
                    )}
                    {!isWhtEligible && (
                      <button
                        type="button"
                        className="badge-wht-hint"
                        style={{
                          cursor: 'pointer',
                          background: '#fef3c7',
                          color: '#92400e',
                          border: '1px solid #fde68a',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '600'
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          setShowWhtThresholdModal(true);
                          showToast(`3% Withholding Tax requires a minimum transaction value of 20,000 ETB. Current total: ${formatCurrency(cartGrossTotal)}.`, 'warning');
                        }}
                        title="Click to view Ethiopian Withholding Tax rules"
                      >
                        ⚠️ Min. 20,000 ETB
                      </button>
                    )}
                  </div>

                  {isWithholding && isWhtEligible && (
                    <div className="wht-fields-container">
                      <div className="form-group mb-2">
                        <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>Client / Company Name *</label>
                        <input
                          type="text"
                          required={isWithholding}
                          placeholder="e.g. Sunshine Construction PLC"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className="form-input form-input-sm"
                        />
                      </div>

                      <div className="form-grid-2 mb-2">
                        <div>
                          <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>Customer TIN (10-digits)</label>
                          <input
                            type="text"
                            placeholder="0012345678"
                            value={customerTin}
                            onChange={(e) => setCustomerTin(e.target.value)}
                            className="form-input form-input-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>WHT Voucher Serial #</label>
                          <input
                            type="text"
                            placeholder="e.g. WHT-9481"
                            value={whtVoucherNumber}
                            onChange={(e) => setWhtVoucherNumber(e.target.value)}
                            className="form-input form-input-sm"
                          />
                        </div>
                      </div>

                      <div className="wht-status-pill-group">
                        <span className="text-xs text-muted">Voucher Status:</span>
                        <div className="pill-options">
                          <button
                            type="button"
                            className={`wht-status-chip ${whtVoucherStatus === 'received' ? 'active-success' : ''}`}
                            onClick={() => setWhtVoucherStatus('received')}
                          >
                            ✓ Voucher In Hand
                          </button>
                          <button
                            type="button"
                            className={`wht-status-chip ${whtVoucherStatus === 'pending' ? 'active-warning' : ''}`}
                            onClick={() => setWhtVoucherStatus('pending')}
                          >
                            ⏳ Pending Collection
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="cart-financials">
                  <div className="financial-row">
                    <span>Base Goods ({cartItemCount} items)</span>
                    <span>{formatCurrency(cartBaseBeforeVat)}</span>
                  </div>
                  {cartColorantBeforeVat > 0 && (
                    <div className="financial-row text-primary">
                      <span>Colorant (Subtotal)</span>
                      <span>+{formatCurrency(cartColorantBeforeVat)}</span>
                    </div>
                  )}
                  <div className="financial-row">
                    <span>VAT (15%)</span>
                    <span>{formatCurrency(cartVatTotal)}</span>
                  </div>
                  <div className="financial-row">
                    <span>Gross Invoice Total</span>
                    <span>{formatCurrency(cartGrossTotal)}</span>
                  </div>

                  {isWithholding && isWhtEligible && (
                    <div className="financial-row text-danger font-semibold" style={{ color: '#dc2626' }}>
                      <span>Less: 3% Withholding Tax (WHT)</span>
                      <span>- {formatCurrency(cartWhtAmount)}</span>
                    </div>
                  )}

                  <div className="financial-row financial-total">
                    <span>{isWithholding && isWhtEligible ? 'Net Cash to Collect (ETB)' : 'Total Due (ETB)'}</span>
                    <span>{formatCurrency(cartNetPayable)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-complete-sale"
                >
                  <CheckCircleIcon size={20} />
                  {isWithholding && isWhtEligible
                    ? `Record Sale (Collect ${formatCurrency(cartNetPayable)} Net)`
                    : `Record Sale & Deduct Stock (${formatCurrency(cartGrossTotal)})`
                  }
                </button>
                <p className="text-xs text-muted text-center mt-2">
                  ✓ Automatically deducts stock and switches directly to Sales History
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Universal Floating Proceed Bar */}
      {cart.length > 0 && (
        <div className="universal-proceed-bar">
          <div className="proceed-bar-left" onClick={() => setIsMobileCartOpen(true)} title="Click to view & edit cart">
            <span className="proceed-bar-badge">🛒 {cartItemCount} item{cartItemCount > 1 ? 's' : ''}</span>
            <span className="proceed-bar-total">Total: <strong>{formatCurrency(cartTotal)}</strong></span>
          </div>
          <div className="proceed-bar-actions">
            <button
              type="button"
              className="btn-mobile-review-cart"
              onClick={() => setIsMobileCartOpen(true)}
              title="Review items and colorant"
            >
              Review Cart ➔
            </button>
            <button
              type="button"
              className="btn-universal-proceed"
              onClick={handleRecordSale}
              title="Click to complete this sale and save to Sales History"
            >
              <CheckCircleIcon size={18} />
              <span>RECORD SALE</span>
            </button>
          </div>
        </div>
      )}

      {/* Native Mobile Cart Bottom Sheet Modal */}
      {isMobileCartOpen && (
        <div className="mobile-cart-backdrop" onClick={() => setIsMobileCartOpen(false)}>
          <div className="mobile-cart-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-cart-sheet-header">
              <div className="flex-items-center gap-2">
                <ShoppingCartIcon size={20} className="text-primary" />
                <span className="sheet-title">Current Sale Order ({cartItemCount} items)</span>
              </div>
              <button
                type="button"
                className="btn-close-sheet"
                onClick={() => setIsMobileCartOpen(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="mobile-cart-sheet-body">
              {/* Items in Mobile Drawer */}
              <div className="cart-items-list">
                {cart.map(item => (
                  <div key={item.productId} className={`cart-item-card ${item.isTintable ? 'tintable-item-card' : ''}`}>
                    <div className="cart-item-row">
                      <div className="cart-item-info">
                        <span className="cart-item-name" title={item.productName}>{item.productName}</span>
                        <div className="cart-item-sub">
                          <span className="cart-item-size-badge">{item.size}</span>
                          <span className="cart-item-base-price">Base: {formatCurrency(item.unitPrice)}</span>
                        </div>
                      </div>

                      <div className="cart-item-qty-controls">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          title="Decrease"
                        >
                          <MinusIcon size={14} />
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={item.maxStock}
                          value={item.quantity}
                          onChange={(e) => updateQuantity(item.productId, e.target.value)}
                          className="qty-input"
                        />
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          title="Increase"
                          disabled={item.quantity >= item.maxStock}
                        >
                          <PlusIcon size={14} />
                        </button>
                      </div>

                      <div className="cart-item-price-block">
                        <span className="cart-item-subtotal">{formatCurrency(item.subtotal)}</span>
                        <button
                          type="button"
                          className="btn-icon-trash"
                          onClick={() => removeFromCart(item.productId)}
                          title="Remove"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </div>

                    {/* ONLY FOR TINTABLE BASES: Optional Colorant Cost Input */}
                    {item.isTintable && (
                      <div className="colorant-input-row">
                        <div className="colorant-input-label">
                          <span>Colorant Cost:</span>
                        </div>
                        <div className="colorant-input-wrapper">
                          <span className="currency-prefix">ETB</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={item.colorantCostInput !== undefined ? item.colorantCostInput : (item.colorantCost || '')}
                            onChange={(e) => updateColorantCost(item.productId, e.target.value)}
                            className="colorant-number-input"
                            title="Enter colorant cost from machine"
                          />
                          {(item.colorantCost > 0 || item.colorantCostInput) && (
                            <button
                              type="button"
                              className="clear-colorant-btn"
                              onClick={() => updateColorantCost(item.productId, '')}
                              title="Clear colorant"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Payment Type Grid in Mobile Drawer */}
              <div className="form-group mb-3 mt-3">
                <label className="form-label" style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Payment Type:</span>
                  <span className="badge-pill badge-primary" style={{ fontSize: '11px' }}>{paymentType}</span>
                </label>
                <div className="payment-type-grid">
                  {['Cash', 'CBE', 'Telebirr', 'Sinke', 'Coop', 'Awash', 'Dashen'].map(type => (
                    <button
                      key={type}
                      type="button"
                      className={`payment-type-btn ${paymentType === type ? 'active' : ''}`}
                      onClick={() => setPaymentType(type)}
                    >
                      {type === 'Cash' ? '💵 Cash' : type === 'Telebirr' ? '📱 Telebirr' : `🏦 ${type}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ethiopian 3% Withholding Tax (WHT) Section in Mobile Drawer */}
              <div className="wht-checkout-box mb-3">
                <div className="wht-toggle-header">
                  <label
                    className="wht-checkbox-label"
                    onClick={handleWhtToggleAttempt}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={isWithholding && isWhtEligible}
                      onChange={handleWhtToggleAttempt}
                      onClick={(e) => {
                        if (!isWhtEligible) {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowWhtThresholdModal(true);
                        }
                      }}
                    />
                    <span className="wht-toggle-title">Apply 3% Withholding Tax (WHT)</span>
                  </label>
                  {isWhtEligible && !isWithholding && (
                    <span className="badge-wht-hint">💡 Over 20k ETB (Eligible for 3% WHT)</span>
                  )}
                  {!isWhtEligible && (
                    <button
                      type="button"
                      className="badge-wht-hint"
                      style={{
                        cursor: 'pointer',
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fde68a',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        setShowWhtThresholdModal(true);
                        showToast(`3% Withholding Tax requires a minimum transaction value of 20,000 ETB. Current total: ${formatCurrency(cartGrossTotal)}.`, 'warning');
                      }}
                      title="Click to view Ethiopian Withholding Tax rules"
                    >
                      ⚠️ Min. 20,000 ETB
                    </button>
                  )}
                </div>

                {isWithholding && isWhtEligible && (
                  <div className="wht-fields-container">
                    <div className="form-group mb-2">
                      <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>Client / Company Name *</label>
                      <input
                        type="text"
                        required={isWithholding}
                        placeholder="e.g. Sunshine Construction PLC"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="form-input form-input-sm"
                      />
                    </div>

                    <div className="form-grid-2 mb-2">
                      <div>
                        <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>Customer TIN (10-digits)</label>
                        <input
                          type="text"
                          placeholder="0012345678"
                          value={customerTin}
                          onChange={(e) => setCustomerTin(e.target.value)}
                          className="form-input form-input-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted" style={{ display: 'block', marginBottom: '3px' }}>WHT Voucher Serial #</label>
                        <input
                          type="text"
                          placeholder="e.g. WHT-9481"
                          value={whtVoucherNumber}
                          onChange={(e) => setWhtVoucherNumber(e.target.value)}
                          className="form-input form-input-sm"
                        />
                      </div>
                    </div>

                    <div className="wht-status-pill-group">
                      <span className="text-xs text-muted">Voucher Status:</span>
                      <div className="pill-options">
                        <button
                          type="button"
                          className={`wht-status-chip ${whtVoucherStatus === 'received' ? 'active-success' : ''}`}
                          onClick={() => setWhtVoucherStatus('received')}
                        >
                          ✓ Voucher In Hand
                        </button>
                        <button
                          type="button"
                          className={`wht-status-chip ${whtVoucherStatus === 'pending' ? 'active-warning' : ''}`}
                          onClick={() => setWhtVoucherStatus('pending')}
                        >
                          ⏳ Pending Collection
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Financials Breakdown in Mobile Drawer */}
              <div className="cart-financials">
                <div className="financial-row">
                  <span>Base Paint ({cartItemCount} items)</span>
                  <span>{formatCurrency(cartBaseBeforeVat)}</span>
                </div>
                {cartColorantBeforeVat > 0 && (
                  <div className="financial-row text-primary">
                    <span>Colorant (Subtotal)</span>
                    <span>+{formatCurrency(cartColorantBeforeVat)}</span>
                  </div>
                )}
                <div className="financial-row">
                  <span>VAT (15%)</span>
                  <span>{formatCurrency(cartVatTotal)}</span>
                </div>
                <div className="financial-row">
                  <span>Gross Invoice Total</span>
                  <span>{formatCurrency(cartGrossTotal)}</span>
                </div>
                {isWithholding && isWhtEligible && (
                  <div className="financial-row text-danger font-semibold" style={{ color: '#dc2626' }}>
                    <span>Less: 3% Withholding Tax (WHT)</span>
                    <span>- {formatCurrency(cartWhtAmount)}</span>
                  </div>
                )}
                <div className="financial-row financial-total">
                  <span>{isWithholding && isWhtEligible ? 'Net Cash to Collect (ETB)' : 'Total Due (ETB)'}</span>
                  <span>{formatCurrency(cartNetPayable)}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn-complete-sale"
                onClick={handleRecordSale}
              >
                <CheckCircleIcon size={20} />
                {isWithholding && isWhtEligible
                  ? `Confirm Sale (Collect ${formatCurrency(cartNetPayable)} Net)`
                  : `Confirm Sale (${formatCurrency(cartGrossTotal)})`
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Withholding Tax Threshold Informational Modal */}
      {showWhtThresholdModal && (
        <div className="modal-backdrop" onClick={() => setShowWhtThresholdModal(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  backgroundColor: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <AlertTriangleIcon size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Withholding Tax Not Applicable</h3>
                  <p className="modal-subtitle">Ethiopian Revenue Authority (ERCA/MOR) Rule</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowWhtThresholdModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ paddingTop: '12px', paddingBottom: '16px' }}>
              <p style={{ fontSize: '13.5px', lineHeight: '1.55', color: '#4b5563', marginBottom: '16px' }}>
                Under Ethiopian Tax Proclamations, <strong>3% Withholding Tax (WHT)</strong> applies exclusively to commercial transactions with a gross invoice value of <strong>20,000 ETB or greater</strong>.
              </p>

              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>Current Cart Gross Total:</span>
                  <strong style={{ color: '#0f172a' }}>{formatCurrency(cartGrossTotal)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                  <span style={{ color: '#64748b' }}>WHT Minimum Threshold:</span>
                  <strong style={{ color: '#0f172a' }}>{formatCurrency(WHT_MINIMUM_THRESHOLD)}</strong>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '1px dashed #cbd5e1',
                  fontSize: '13.5px',
                  color: '#b45309',
                  fontWeight: 700
                }}>
                  <span>Amount Needed to Qualify:</span>
                  <span>+{formatCurrency(Math.max(0, WHT_MINIMUM_THRESHOLD - cartGrossTotal))}</span>
                </div>
              </div>

              <div style={{
                fontSize: '12px',
                color: '#475569',
                lineHeight: '1.45',
                backgroundColor: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '10px 12px'
              }}>
                💡 <strong>Commercial Tip:</strong> If the client requires a 3% Withholding Tax receipt (WHT voucher), add more paint or colorants to bring the invoice total to <strong>20,000 ETB or above</strong>.
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              padding: '12px 20px',
              borderTop: '1px solid #e2e8f0',
              backgroundColor: '#f8fafc',
              borderBottomLeftRadius: '12px',
              borderBottomRightRadius: '12px'
            }}>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowWhtThresholdModal(false)}
                style={{ padding: '8px 22px', fontSize: '13.5px', fontWeight: 600 }}
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
