import React, { useState, useEffect } from 'react';
import { useStock } from '../context/StockContext';
import {
  ArrowDownToDotIcon,
  CheckCircleIcon,
  SearchIcon,
  PlusIcon,
  PackageIcon
} from '../components/Icons';

export default function StockIn({ preselectedProductId, setActiveTab }) {
  const { products, processStockIn, movements } = useStock();

  const [selectedProductId, setSelectedProductId] = useState(preselectedProductId || (products[0]?.id || ''));
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (preselectedProductId) {
      setSelectedProductId(preselectedProductId);
    }
  }, [preselectedProductId]);

  const selectedProduct = products.find(p => p.id === selectedProductId) || products[0];

  const parsedQty = parseInt(quantity, 10) || 0;
  const currentStock = selectedProduct ? selectedProduct.stock : 0;
  const projectedStock = currentStock + (parsedQty > 0 ? parsedQty : 0);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct || isSubmitting) return;
    if (parsedQty <= 0) {
      alert("Please enter a valid quantity received greater than 0");
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await processStockIn(selectedProduct.id, parsedQty, reference);
      if (success) {
        setQuantity('');
        setReference('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickAdd = (amount) => {
    setQuantity(prev => {
      const current = parseInt(prev, 10) || 0;
      return String(current + amount);
    });
  };

  // Recent Stock In movements
  const recentStockIns = movements
    .filter(m => m.type === 'STOCK_IN')
    .slice(0, 6);

  const filteredDropdownProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock In (Receive Inventory)</h1>
          <p className="page-subtitle">Record incoming Jotun paint shipments — automatically added to stock</p>
        </div>
      </div>

      <div className="stockin-layout-grid">
        {/* Left Card: Input Form */}
        <div className="section-card stockin-form-card">
          <div className="section-header-flex">
            <h3 className="section-heading flex-items-center gap-2">
              <ArrowDownToDotIcon size={20} className="text-primary" />
              Receive New Stock
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="stockin-form">
            {/* Product selection search filter */}
            <div className="form-group mb-3">
              <label className="form-label">Find & Select Jotun Product</label>
              <div className="search-input-wrapper mb-2">
                <SearchIcon size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Filter product dropdown..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-input search-input-sm"
                />
              </div>
              <select
                className="form-select"
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
              >
                {filteredDropdownProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.size}) — Current Stock: {p.stock} units
                  </option>
                ))}
              </select>
            </div>

            {/* Visual Formula Display (Core Principle of PDF) */}
            {selectedProduct && (
              <div className="stock-calculation-display">
                <div className="formula-box">
                  <div className="calc-item">
                    <span className="calc-label">Current Stock</span>
                    <span className="calc-val">{currentStock}</span>
                  </div>
                  <span className="calc-operator">+</span>
                  <div className="calc-item">
                    <span className="calc-label">Received Qty</span>
                    <span className="calc-val text-primary">{parsedQty > 0 ? parsedQty : 0}</span>
                  </div>
                  <span className="calc-operator">=</span>
                  <div className="calc-item result-box">
                    <span className="calc-label">New Stock Balance</span>
                    <span className="calc-val text-success font-bold">{projectedStock}</span>
                  </div>
                </div>
                <p className="formula-explanation">
                  Employees record the event. Application computes and audits: <strong>{currentStock} + {parsedQty} = {projectedStock} units</strong>.
                </p>
              </div>
            )}

            {/* Quantity Input with Quick Chips */}
            <div className="form-group mb-3">
              <label className="form-label">Quantity Received (Units)</label>
              <div className="quantity-entry-wrapper">
                <input
                  type="number"
                  min="1"
                  placeholder="Enter quantity (e.g. 10)"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="form-input quantity-large-input"
                  required
                />
              </div>

              {/* Quick Increment Buttons for Mobile Touch */}
              <div className="quick-qty-chips">
                <span>Quick Add:</span>
                <button type="button" onClick={() => quickAdd(1)} className="quick-qty-btn">+1</button>
                <button type="button" onClick={() => quickAdd(5)} className="quick-qty-btn">+5</button>
                <button type="button" onClick={() => quickAdd(10)} className="quick-qty-btn">+10</button>
                <button type="button" onClick={() => quickAdd(20)} className="quick-qty-btn">+20</button>
                <button type="button" onClick={() => quickAdd(50)} className="quick-qty-btn">+50</button>
                <button type="button" onClick={() => setQuantity('')} className="quick-qty-btn clear">Clear</button>
              </div>
            </div>

            {/* Reference / Supplier Note */}
            <div className="form-group mb-4">
              <label className="form-label">Delivery Reference / Note (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Jotun Factory Shipment PO-904, Truck delivery"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="form-input"
              />
            </div>

            <button
              type="submit"
              className="btn-primary btn-large w-full"
              disabled={parsedQty <= 0}
            >
              <CheckCircleIcon size={20} />
              Confirm & Add {parsedQty > 0 ? `${parsedQty} Units` : 'Stock'}
            </button>
          </form>
        </div>

        {/* Right Side: Stock In Log */}
        <div className="section-card">
          <div className="section-header-flex">
            <div>
              <h3 className="section-heading">Recent Stock In Activity</h3>
              <p className="text-muted text-sm">Audit log of received shipments</p>
            </div>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={() => setActiveTab('reports')}
            >
              Full Audit Trail ➔
            </button>
          </div>

          {recentStockIns.length === 0 ? (
            <div className="empty-state">
              <PackageIcon size={36} className="text-muted" />
              <p>No recent incoming shipments.</p>
            </div>
          ) : (
            <div className="movements-list">
              {recentStockIns.map(m => (
                <div key={m.id} className="movement-item-card">
                  <div className="movement-header">
                    <span className="badge-pill badge-healthy">+ {m.quantity} Units</span>
                    <span className="movement-time text-xs text-muted">
                      {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(m.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <h4 className="movement-product-name">{m.productName}</h4>
                  <div className="movement-footer">
                    <span className="movement-stock-shift">
                      Previous: {m.previousStock} → <strong>New: {m.newStock}</strong>
                    </span>
                    <span className="movement-ref">{m.reference}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
