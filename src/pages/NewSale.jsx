import React, { useState, useMemo } from 'react';
import { useStock } from '../context/StockContext';
import {
  SearchIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ShoppingCartIcon,
  CheckCircleIcon,
  RefreshCwIcon
} from '../components/Icons';

export default function NewSale({ setActiveTab }) {
  const { products, processSale, formatCurrency, refreshData } = useStock();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [paymentType, setPaymentType] = useState('Cash'); // 'Cash', 'CBE', 'Sinke', 'Coop', 'Awash', 'Dashen'

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
            const unitColorant = item.unitColorantCost || 0;
            const totalColorant = unitColorant * nextQty;
            const totalBeforeVat = (item.priceBeforeVat * nextQty) + totalColorant;
            const machineTotal = totalColorant > 0
              ? Math.floor((totalBeforeVat * 1.15) * 100) / 100
              : nextQty * item.unitPrice;
            return {
              ...item,
              quantity: nextQty,
              colorantCost: totalColorant,
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
            unitColorantCost: 0,
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
          const unitColorant = item.unitColorantCost || 0;
          const totalColorant = unitColorant * nextQty;
          const totalBeforeVat = (item.priceBeforeVat * nextQty) + totalColorant;
          const machineTotal = totalColorant > 0
            ? Math.floor((totalBeforeVat * 1.15) * 100) / 100
            : nextQty * item.unitPrice;
          return {
            ...item,
            quantity: nextQty,
            colorantCost: totalColorant,
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
          const unitColorant = item.unitColorantCost || 0;
          const totalColorant = unitColorant * qty;
          const totalBeforeVat = (item.priceBeforeVat * qty) + totalColorant;
          const machineTotal = totalColorant > 0
            ? Math.floor((totalBeforeVat * 1.15) * 100) / 100
            : qty * item.unitPrice;
          return {
            ...item,
            quantity: qty,
            colorantCost: totalColorant,
            subtotal: machineTotal
          };
        }
        return item;
      })
    );
  };

  // Update colorant cost for tintable base cans (from Jotun machine)
  const updateColorantCost = (productId, costInput) => {
    const cost = parseFloat(costInput);
    const validCost = isNaN(cost) || cost < 0 ? 0 : cost;

    setCart(prevCart =>
      prevCart.map(item => {
        if (item.productId === productId) {
          // validCost is the per-can colorant cost shown on Jotun machine
          const totalColorant = validCost * item.quantity;
          const totalBeforeVat = (item.priceBeforeVat * item.quantity) + totalColorant;
          const machineTotal = totalColorant > 0 
            ? Math.floor((totalBeforeVat * 1.15) * 100) / 100 
            : item.quantity * item.unitPrice;
          return {
            ...item,
            unitColorantCost: validCost,
            colorantCost: totalColorant,
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

  // Record Sale and immediately show it in Sales History
  const handleRecordSale = (e) => {
    if (e) e.preventDefault();
    if (cart.length === 0) {
      alert("Please add at least 1 product to the sale.");
      return;
    }

    const completed = processSale(cart, paymentType);
    if (completed) {
      setCart([]);
      setPaymentType('Cash');
      // Navigate directly to Sales History so user immediately sees their recorded transaction
      setActiveTab('sales');
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
                      <span className="product-card-category">{p.category}</span>
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

        {/* Right Side: Current Sale Order & Checkout */}
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
                        <div className="cart-item-header-row">
                          <span className="cart-item-name">{item.productName}</span>
                          {item.isTintable && (
                            <span className="badge-tag-tintable" title="Tintable Base">
                              Base
                            </span>
                          )}
                        </div>
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
                          {item.quantity > 1 && item.unitColorantCost > 0 && (
                            <span className="text-xs text-muted" style={{ fontWeight: 600 }}>
                              ({formatCurrency(item.unitColorantCost)} × {item.quantity} cans = {formatCurrency(item.colorantCost)})
                            </span>
                          )}
                        </div>
                        <div className="colorant-input-wrapper">
                          <span className="currency-prefix">ETB</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            value={item.unitColorantCost || ''}
                            onChange={(e) => updateColorantCost(item.productId, e.target.value)}
                            className="colorant-number-input"
                            title="Enter colorant cost per can"
                          />
                          {item.unitColorantCost > 0 && (
                            <button
                              type="button"
                              className="clear-colorant-btn"
                              onClick={() => updateColorantCost(item.productId, 0)}
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
                  <div className="financial-row financial-total">
                    <span>Total Due (ETB)</span>
                    <span>{formatCurrency(cartTotal)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-complete-sale"
                >
                  <CheckCircleIcon size={20} />
                  Record Sale & Deduct Stock ({formatCurrency(cartTotal)})
                </button>
                <p className="text-xs text-muted text-center mt-2">
                  ✓ Automatically deducts stock and switches directly to Sales History
                </p>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Universal Floating Proceed Bar (Visible on all devices when items selected) */}
      {cart.length > 0 && (
        <div className="universal-proceed-bar">
          <div className="proceed-bar-left">
            <span className="proceed-bar-badge">🛒 {cartItemCount} item(s) selected</span>
            <span className="proceed-bar-total">Total Due: <strong>{formatCurrency(cartTotal)}</strong></span>
          </div>
          <button
            type="button"
            className="btn-universal-proceed"
            onClick={handleRecordSale}
            title="Click to complete this sale and save to Sales History"
          >
            <CheckCircleIcon size={20} />
            <span>PROCEED & RECORD SALE ({formatCurrency(cartTotal)}) ➔</span>
          </button>
        </div>
      )}
    </div>
  );
}
