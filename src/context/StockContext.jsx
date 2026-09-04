import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initialProducts, initialSales, initialMovements } from '../data/initialProducts';
import { supabaseApi, isSupabaseConfigured } from '../lib/supabaseClient';

const StockContext = createContext(null);

// Format currency in Ethiopian Birr (ETB)
export const formatCurrency = (amount) => {
  const num = Number(amount) || 0;
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`;
};

// Helper for local date YYYY-MM-DD
export const getLocalDateString = (d = new Date()) => {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function StockProvider({ children }) {
  const [cloudStatus, setCloudStatus] = useState('checking'); // 'connected' | 'offline' | 'checking'

  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem('jotun_products_v6');
    return saved ? JSON.parse(saved) : initialProducts;
  });

  const [sales, setSales] = useState(() => {
    const saved = localStorage.getItem('jotun_sales_v6');
    return saved ? JSON.parse(saved) : initialSales;
  });

  const [movements, setMovements] = useState(() => {
    const saved = localStorage.getItem('jotun_movements_v6');
    return saved ? JSON.parse(saved) : initialMovements;
  });

  const [toast, setToast] = useState(null);

  useEffect(() => {
    localStorage.setItem('jotun_products_v6', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('jotun_sales_v6', JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem('jotun_movements_v6', JSON.stringify(movements));
  }, [movements]);

  // Fetch products, sales history, and audit movements from Supabase Cloud
  const checkCloudSync = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setCloudStatus('offline');
      return;
    }
    try {
      const [productsData, salesData, movementsData] = await Promise.all([
        supabaseApi.getProducts(),
        supabaseApi.getSales(),
        supabaseApi.getMovements()
      ]);

      let hasCloudData = false;

      if (productsData && Array.isArray(productsData) && productsData.length > 0) {
        hasCloudData = true;
        setProducts(productsData.map(p => ({
          id: p.id,
          code: p.code,
          name: p.name,
          category: p.category,
          size: p.size,
          priceBeforeVat: parseFloat(p.price_before_vat),
          priceWithVat: parseFloat(p.price_with_vat),
          stock: parseInt(p.stock, 10),
          minStock: parseInt(p.min_stock, 10)
        })));
      }

      if (salesData && Array.isArray(salesData)) {
        hasCloudData = true;
        const mappedSales = salesData.map(s => ({
          id: s.id,
          timestamp: s.created_at,
          localDate: getLocalDateString(s.created_at),
          customer: s.customer || 'Cash Customer',
          total: parseFloat(s.total) || 0,
          totalItems: parseInt(s.total_items, 10) || 1,
          items: (s.sale_items || []).map(item => ({
            productId: item.product_id,
            productName: item.product_name,
            code: item.code,
            size: item.size,
            quantity: parseInt(item.quantity, 10),
            unitPrice: parseFloat(item.unit_price),
            priceBeforeVat: parseFloat(item.price_before_vat),
            subtotal: parseFloat(item.subtotal)
          }))
        }));
        setSales(mappedSales);
      }

      if (movementsData && Array.isArray(movementsData)) {
        hasCloudData = true;
        const mappedMovements = movementsData.map(m => ({
          id: m.id,
          productId: m.product_id,
          productName: m.product_name,
          type: m.type,
          quantity: parseInt(m.quantity, 10),
          previousStock: parseInt(m.previous_stock, 10),
          newStock: parseInt(m.new_stock, 10),
          reference: m.reference || '',
          timestamp: m.created_at
        }));
        setMovements(mappedMovements);
      }

      setCloudStatus(hasCloudData ? 'connected' : 'offline');
    } catch (err) {
      console.error('[checkCloudSync error]', err);
      setCloudStatus('offline');
    }
  }, []);

  useEffect(() => {
    checkCloudSync();
  }, [checkCloudSync]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // Complete a sale (handles single item or cart)
  const processSale = (cartItems, customerName = "Cash Walk-in") => {
    if (!cartItems || cartItems.length === 0) return false;

    // Check available stock
    for (const item of cartItems) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) {
        showToast(`Product not found: ${item.productName}`, 'error');
        return false;
      }
      if (prod.stock < item.quantity) {
        showToast(`Insufficient stock for ${prod.name}! Only ${prod.stock} units available.`, 'error');
        return false;
      }
    }

    const saleId = `SALE-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();
    const newMovements = [];
    const productUpdates = [];

    // Calculate deductions cleanly
    const updatedProducts = products.map(p => {
      const inCart = cartItems.find(item => item.productId === p.id);
      if (inCart) {
        const prev = p.stock;
        const next = p.stock - inCart.quantity;

        newMovements.push({
          id: `MOV-${Date.now()}-${p.id}-${Math.floor(Math.random() * 1000)}`,
          productId: p.id,
          productName: p.name,
          type: 'SALE',
          quantity: -inCart.quantity,
          previousStock: prev,
          newStock: next,
          reference: saleId,
          timestamp: now
        });

        productUpdates.push({ id: p.id, stock: next });
        return { ...p, stock: next };
      }
      return p;
    });

    const total = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

    const newSale = {
      id: saleId,
      timestamp: now,
      localDate: getLocalDateString(now),
      items: cartItems,
      totalItems,
      total,
      customer: customerName || "Cash Customer"
    };

    // 1. Instant optimistic state update
    setProducts(updatedProducts);
    setSales(prevSales => [newSale, ...prevSales]);
    setMovements(prevMovements => [...newMovements, ...prevMovements]);

    // 2. Asynchronous write to Supabase Cloud Database
    if (isSupabaseConfigured) {
      supabaseApi.recordSale({
        sale: newSale,
        items: cartItems,
        movements: newMovements,
        productUpdates
      }).then(success => {
        if (!success) {
          console.warn('Notice: Sale saved locally; cloud sync pending.');
        }
      }).catch(err => {
        console.error('Supabase Sale Sync Error:', err);
      });
    }

    showToast(`Sale #${saleId} recorded! ${totalItems} unit(s) deducted from stock.`, 'success');
    return newSale;
  };

  // Instant 1-click single item sale (for fast cashier checkout)
  const quickSaleSingleItem = (product, quantity = 1, customer = "Cash Customer") => {
    if (!product || product.stock < quantity) {
      showToast(`Out of stock for ${product?.name}`, 'error');
      return false;
    }

    const lineItem = {
      productId: product.id,
      productName: product.name,
      code: product.code,
      size: product.size,
      unitPrice: product.priceWithVat,
      priceBeforeVat: product.priceBeforeVat,
      quantity,
      subtotal: product.priceWithVat * quantity
    };

    return processSale([lineItem], customer);
  };

  // Receive stock: adds to inventory & records audit trail
  const processStockIn = (productId, quantity, reference = "") => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty <= 0) {
      showToast("Please enter a valid stock quantity greater than 0.", "error");
      return false;
    }

    const targetProduct = products.find(p => p.id === productId);
    if (!targetProduct) {
      showToast("Product not found.", "error");
      return false;
    }

    const prev = targetProduct.stock;
    const next = prev + qty;
    const now = new Date().toISOString();

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: next } : p
    );

    const newMovement = {
      id: `MOV-${Date.now()}-${productId}`,
      productId: targetProduct.id,
      productName: targetProduct.name,
      type: 'STOCK_IN',
      quantity: qty,
      previousStock: prev,
      newStock: next,
      reference: reference.trim() || "Supplier Stock Receipt",
      timestamp: now
    };

    // 1. Instant optimistic state update
    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    // 2. Asynchronous write to Supabase Cloud Database
    if (isSupabaseConfigured) {
      supabaseApi.recordStockIn({
        movement: newMovement,
        productId,
        newStock: next
      }).catch(err => console.error('Supabase StockIn Sync Error:', err));
    }

    showToast(`Stock updated: ${targetProduct.name} (+${qty} units)`, 'success');
    return true;
  };

  // Direct manual stock adjustment with required reason for audit trail
  const processStockAdjustment = (productId, newStockQty, reason = "Inventory Count Adjustment") => {
    const next = parseInt(newStockQty, 10);
    if (isNaN(next) || next < 0) {
      showToast("Invalid stock amount.", "error");
      return false;
    }

    const targetProduct = products.find(p => p.id === productId);
    if (!targetProduct) return false;

    const prev = targetProduct.stock;
    const diff = next - prev;
    const now = new Date().toISOString();

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: next } : p
    );

    const newMovement = {
      id: `MOV-${Date.now()}-${productId}`,
      productId: targetProduct.id,
      productName: targetProduct.name,
      type: 'ADJUSTMENT',
      quantity: diff,
      previousStock: prev,
      newStock: next,
      reference: reason.trim() || "Physical Stock Count",
      timestamp: now
    };

    // 1. Instant optimistic state update
    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    // 2. Asynchronous write to Supabase Cloud Database
    if (isSupabaseConfigured) {
      supabaseApi.recordStockAdjustment({
        movement: newMovement,
        productId,
        newStock: next
      }).catch(err => console.error('Supabase Adjustment Sync Error:', err));
    }

    showToast(`Stock adjusted for ${targetProduct.name}: ${prev} → ${next}`, 'info');
    return true;
  };

  const syncOfficialCatalog = () => {
    // Reset local cache to official catalog defaults
    const keysToRemove = [
      'jotun_products_v6', 'jotun_sales_v6', 'jotun_movements_v6',
      'jotun_products_v5', 'jotun_sales_v5', 'jotun_movements_v5',
      'jotun_products_v4', 'jotun_sales_v4', 'jotun_movements_v4',
      'jotun_products_v3', 'jotun_sales_v3', 'jotun_movements_v3',
      'jotun_products_v2', 'jotun_sales_v2', 'jotun_movements_v2'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    setProducts(initialProducts);
    setSales(initialSales);
    setMovements(initialMovements);
    showToast("Catalog reset to official 46 products!", "success");
  };

  const resetToMockData = syncOfficialCatalog;

  // Sync latest cloud data on demand without destructive localStorage wipe
  const refreshData = async () => {
    showToast("Syncing with Supabase Cloud...", "info");
    await checkCloudSync();
    showToast("Catalog and sales up to date!", "success");
  };

  // Metrics using local date
  const todayStr = getLocalDateString();
  const todaySalesList = sales.filter(s => {
    const saleDateStr = s.localDate || getLocalDateString(s.timestamp);
    return saleDateStr === todayStr;
  });
  const todayRevenue = todaySalesList.reduce((sum, s) => sum + s.total, 0);
  const todayItemsSold = todaySalesList.reduce((sum, s) => sum + s.totalItems, 0);
  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  return (
    <StockContext.Provider
      value={{
        products,
        sales,
        movements,
        todayRevenue,
        todayItemsSold,
        todaySalesList,
        lowStockProducts,
        processSale,
        quickSaleSingleItem,
        processStockIn,
        processStockAdjustment,
        syncOfficialCatalog,
        resetToMockData,
        refreshData,
        cloudStatus,
        checkCloudSync,
        toast,
        showToast,
        formatCurrency
      }}
    >
      {children}
    </StockContext.Provider>
  );
}

export function useStock() {
  const context = useContext(StockContext);
  if (!context) {
    throw new Error('useStock must be used within a StockProvider');
  }
  return context;
}
