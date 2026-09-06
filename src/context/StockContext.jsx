import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { initialProducts, initialSales, initialMovements } from '../data/initialProducts';
import { supabaseApi, supabaseAuth, isSupabaseConfigured } from '../lib/supabaseClient';

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

// Pre-seeded Demo Shops for immediate evaluation
const DEFAULT_DEMO_SHOPS = [
  {
    id: 'shop-demo-bole',
    name: 'Jotun Bole Paint Center',
    owner_name: 'Abebe Kebede',
    phone: '+251 911 234 567',
    city_address: 'Bole Medhanialem, Addis Ababa',
    tin_number: '0019283746',
    email: 'bole@jotunshop.et',
    status: 'active'
  },
  {
    id: 'shop-demo-merkato',
    name: 'Merkato Colors (Jotun Dealer)',
    owner_name: 'Sara Tesfaye',
    phone: '+251 922 987 654',
    city_address: 'Merkato Military Terra, Addis Ababa',
    tin_number: '0048291038',
    email: 'merkato@jotunshop.et',
    status: 'active'
  }
];

export function StockProvider({ children }) {
  const [cloudStatus, setCloudStatus] = useState('checking'); // 'connected' | 'offline' | 'checking'
  const [toast, setToast] = useState(null);
  const [authError, setAuthError] = useState(null);

  // 1. Multi-Shop Registry & Active Session
  const [allShops, setAllShops] = useState(() => {
    const saved = localStorage.getItem('paintflow_all_shops');
    return saved ? JSON.parse(saved) : DEFAULT_DEMO_SHOPS;
  });

  const [currentShop, setCurrentShop] = useState(() => {
    const saved = localStorage.getItem('paintflow_current_shop');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    // Default to the first active demo shop for immediate convenience
    return DEFAULT_DEMO_SHOPS[0];
  });

  useEffect(() => {
    localStorage.setItem('paintflow_all_shops', JSON.stringify(allShops));
  }, [allShops]);

  useEffect(() => {
    if (currentShop) {
      localStorage.setItem('paintflow_current_shop', JSON.stringify(currentShop));
    } else {
      localStorage.removeItem('paintflow_current_shop');
    }
  }, [currentShop]);

  const shopId = currentShop?.id || 'default_shop';

  // 2. Per-Shop Products (Official 46 Jotun Paints + Shop Custom Accessories)
  const [products, setProducts] = useState(() => {
    const saved = localStorage.getItem(`paintflow_products_${shopId}`);
    return saved ? JSON.parse(saved) : initialProducts;
  });

  // 3. Per-Shop Sales History (with 3% Withholding Tax details)
  const [sales, setSales] = useState(() => {
    const saved = localStorage.getItem(`paintflow_sales_${shopId}`);
    return saved ? JSON.parse(saved) : initialSales;
  });

  // 4. Per-Shop Stock Movements Audit Trail
  const [movements, setMovements] = useState(() => {
    const saved = localStorage.getItem(`paintflow_movements_${shopId}`);
    return saved ? JSON.parse(saved) : initialMovements;
  });

  // Reload products/sales whenever the active shop changes
  useEffect(() => {
    if (!currentShop) return;
    const savedProds = localStorage.getItem(`paintflow_products_${currentShop.id}`);
    setProducts(savedProds ? JSON.parse(savedProds) : initialProducts);

    const savedSales = localStorage.getItem(`paintflow_sales_${currentShop.id}`);
    setSales(savedSales ? JSON.parse(savedSales) : initialSales);

    const savedMovs = localStorage.getItem(`paintflow_movements_${currentShop.id}`);
    setMovements(savedMovs ? JSON.parse(savedMovs) : initialMovements);
  }, [currentShop?.id]);

  // Sync to local storage per-shop
  useEffect(() => {
    if (currentShop?.id) {
      localStorage.setItem(`paintflow_products_${currentShop.id}`, JSON.stringify(products));
    }
  }, [products, currentShop?.id]);

  useEffect(() => {
    if (currentShop?.id) {
      localStorage.setItem(`paintflow_sales_${currentShop.id}`, JSON.stringify(sales));
    }
  }, [sales, currentShop?.id]);

  useEffect(() => {
    if (currentShop?.id) {
      localStorage.setItem(`paintflow_movements_${currentShop.id}`, JSON.stringify(movements));
    }
  }, [movements, currentShop?.id]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3500);
  };

  // 5. Auth Handlers
  const loginShop = async (email, password, mockShopOverride = null) => {
    setAuthError(null);

    // If mock override passed from preset buttons
    if (mockShopOverride) {
      setCurrentShop(mockShopOverride);
      // Ensure it is in allShops
      setAllShops(prev => {
        const exists = prev.find(s => s.id === mockShopOverride.id);
        return exists ? prev : [mockShopOverride, ...prev];
      });
      showToast(`Logged into ${mockShopOverride.name}!`, 'success');
      return true;
    }

    // Try finding in local mock shops first
    const foundLocal = allShops.find(s => s.email.toLowerCase() === email.toLowerCase());
    if (foundLocal) {
      setCurrentShop(foundLocal);
      showToast(`Welcome back, ${foundLocal.name}!`, 'success');
      return true;
    }

    // Attempt Supabase Cloud auth
    if (isSupabaseConfigured) {
      const res = await supabaseAuth.signIn({ email, password });
      if (res?.user) {
        const profile = await supabaseAuth.getShopProfile(res.user.id);
        const shopObj = profile || {
          id: res.user.id,
          name: res.user.user_metadata?.shop_name || 'My Jotun Store',
          email,
          phone: res.user.user_metadata?.phone || '',
          city_address: res.user.user_metadata?.city_address || '',
          tin_number: res.user.user_metadata?.tin_number || '',
          status: 'active'
        };
        setCurrentShop(shopObj);
        setAllShops(prev => [shopObj, ...prev.filter(s => s.id !== shopObj.id)]);
        showToast(`Signed in to ${shopObj.name}!`, 'success');
        return true;
      } else if (res?.error) {
        setAuthError(res.error.message || 'Invalid login credentials.');
        return false;
      }
    }

    setAuthError('Shop account not found. Please check your email or register your shop.');
    return false;
  };

  const registerShop = async ({ shopName, ownerName, phone, cityAddress, tinNumber, email, password }) => {
    setAuthError(null);
    const newShopId = 'shop-' + Date.now();
    const newShop = {
      id: newShopId,
      name: shopName,
      owner_name: ownerName,
      phone,
      city_address: cityAddress,
      tin_number: tinNumber,
      email,
      status: 'pending_approval', // Owner approval workflow!
      created_at: new Date().toISOString()
    };

    // Save to local registry
    setAllShops(prev => [newShop, ...prev]);
    setCurrentShop(newShop);

    // Try cloud registration if connected
    if (isSupabaseConfigured) {
      try {
        await supabaseAuth.signUp({
          email,
          password,
          shopName,
          ownerName,
          phone,
          cityAddress,
          tinNumber
        });
      } catch (err) {
        console.warn('Notice: Registered locally; cloud sync pending.', err);
      }
    }

    showToast(`Registered ${shopName}! Pending owner approval.`, 'info');
    return { success: true };
  };

  // Super Admin Approval Demo Action
  const approveShop = async (targetShopId) => {
    const updated = allShops.map(s => s.id === targetShopId ? { ...s, status: 'active' } : s);
    setAllShops(updated);
    if (currentShop && currentShop.id === targetShopId) {
      setCurrentShop({ ...currentShop, status: 'active' });
    }
    if (isSupabaseConfigured) {
      await supabaseApi.updateShopStatus(targetShopId, 'active');
    }
    showToast("Shop approved and activated successfully!", "success");
  };

  const logoutShop = () => {
    supabaseAuth.signOut();
    setCurrentShop(null);
    showToast("You have been signed out.", "info");
  };

  // 6. Custom Product Creation (Brushes, Rollers, Local Putty)
  const addCustomProduct = (customProduct) => {
    const newId = `custom-${Date.now()}`;
    const priceWithVat = parseFloat(customProduct.priceWithVat) || 0;
    const priceBeforeVat = customProduct.priceBeforeVat !== undefined
      ? parseFloat(customProduct.priceBeforeVat)
      : Math.round((priceWithVat / 1.15) * 100) / 100;

    const newItem = {
      id: newId,
      code: customProduct.code?.trim() || `ACC-${Math.floor(1000 + Math.random() * 9000)}`,
      name: customProduct.name.trim(),
      category: customProduct.category || 'Accessories',
      size: customProduct.size?.trim() || '1 Unit',
      priceBeforeVat,
      priceWithVat,
      stock: parseInt(customProduct.stock, 10) || 0,
      minStock: parseInt(customProduct.minStock, 10) || 5,
      isCustom: true
    };

    setProducts(prev => [newItem, ...prev]);

    if (isSupabaseConfigured && currentShop) {
      supabaseApi.addCustomProduct(currentShop.id, newItem).catch(err => {
        console.error('Failed to sync custom item to cloud:', err);
      });
    }

    showToast(`Added custom product: ${newItem.name}!`, 'success');
    return newItem;
  };

  // 7. Complete Sale with Ethiopian 3% Withholding Tax
  const processSale = (cartItems, paymentType = "Cash", withholdingDetails = null) => {
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

    // Deduct stock
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

    const grossTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const finalPayment = paymentType || "Cash";

    // Calculate 3% Withholding Tax if applied
    const isWht = Boolean(withholdingDetails?.isWithholding);
    const whtRate = 3.0; // Official Ethiopian tax rate on goods
    // In Ethiopia, 3% WHT is computed on the total taxable supply
    const whtAmount = isWht ? Math.round((grossTotal * (whtRate / 100)) * 100) / 100 : 0;
    const netPayable = isWht ? (grossTotal - whtAmount) : grossTotal;

    const newSale = {
      id: saleId,
      timestamp: now,
      localDate: getLocalDateString(now),
      items: cartItems,
      totalItems,
      total: grossTotal, // Gross Invoice total
      grossTotal,
      isWithholding: isWht,
      withholdingRate: whtRate,
      withholdingAmount: whtAmount,
      netPayable, // Actual cash/bank amount collected
      customer: withholdingDetails?.customerName || (isWht ? 'Corporate Client' : 'Cash Walk-in'),
      customerTin: withholdingDetails?.customerTin || null,
      whtVoucherNumber: withholdingDetails?.whtVoucherNumber || null,
      whtVoucherStatus: isWht ? (withholdingDetails?.whtVoucherStatus || 'pending') : 'not_applicable',
      paymentType: finalPayment,
      shopId: currentShop?.id,
      shopName: currentShop?.name
    };

    // Optimistic state updates
    setProducts(updatedProducts);
    setSales(prevSales => [newSale, ...prevSales]);
    setMovements(prevMovements => [...newMovements, ...prevMovements]);

    // Asynchronous Cloud Database Sync
    if (isSupabaseConfigured && currentShop?.id) {
      supabaseApi.recordSale({
        shopId: currentShop.id,
        sale: newSale,
        items: cartItems,
        movements: newMovements,
        productUpdates
      }).catch(err => console.error('Cloud Sync Error:', err));
    }

    if (isWht) {
      showToast(`Sale #${saleId} recorded! Net collected: ${formatCurrency(netPayable)} (3% WHT: -${formatCurrency(whtAmount)})`, 'success');
    } else {
      showToast(`Sale #${saleId} recorded! ${totalItems} unit(s) deducted from stock.`, 'success');
    }

    return newSale;
  };

  // Update Withholding Voucher Number or Status
  const updateSaleWhtVoucher = (saleId, voucherNumber, voucherStatus) => {
    setSales(prevSales => prevSales.map(s => {
      if (s.id === saleId) {
        return {
          ...s,
          whtVoucherNumber: voucherNumber !== undefined ? voucherNumber : s.whtVoucherNumber,
          whtVoucherStatus: voucherStatus || s.whtVoucherStatus
        };
      }
      return s;
    }));

    if (isSupabaseConfigured) {
      supabaseApi.updateSaleWhtVoucher(saleId, {
        voucherNumber,
        voucherStatus
      }).catch(err => console.error('Failed to update WHT voucher:', err));
    }

    showToast("Withholding voucher details updated!", "success");
  };

  // Stock In & Adjustments
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

    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    showToast(`Stock updated: ${targetProduct.name} (+${qty} units)`, 'success');
    return true;
  };

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

    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    showToast(`Stock adjusted for ${targetProduct.name}: ${prev} → ${next}`, 'info');
    return true;
  };

  const refreshData = async () => {
    showToast("Catalog and sales up to date!", "success");
  };

  // Financial & Withholding Metrics
  const todayStr = getLocalDateString();
  const todaySalesList = useMemo(() => {
    return sales.filter(s => {
      const saleDateStr = s.localDate || getLocalDateString(s.timestamp);
      return saleDateStr === todayStr;
    });
  }, [sales, todayStr]);

  const todayGrossRevenue = todaySalesList.reduce((sum, s) => sum + (s.grossTotal || s.total), 0);
  const todayNetRevenue = todaySalesList.reduce((sum, s) => sum + (s.netPayable !== undefined ? s.netPayable : s.total), 0);
  const todayWithheldTax = todaySalesList.reduce((sum, s) => sum + (s.withholdingAmount || 0), 0);
  const todayItemsSold = todaySalesList.reduce((sum, s) => sum + s.totalItems, 0);

  // All-time Withholding Metrics for Reporting
  const withheldSales = useMemo(() => sales.filter(s => s.isWithholding), [sales]);
  const totalWithholdingCredits = useMemo(() => {
    return withheldSales.reduce((sum, s) => sum + (s.withholdingAmount || 0), 0);
  }, [withheldSales]);
  const pendingVouchersCount = useMemo(() => {
    return withheldSales.filter(s => s.whtVoucherStatus === 'pending').length;
  }, [withheldSales]);

  const lowStockProducts = products.filter(p => p.stock <= p.minStock);

  return (
    <StockContext.Provider
      value={{
        currentShop,
        allShops,
        loginShop,
        registerShop,
        approveShop,
        logoutShop,
        authError,
        clearAuthError: () => setAuthError(null),

        products,
        addCustomProduct,
        sales,
        withheldSales,
        movements,

        todayRevenue: todayGrossRevenue,
        todayGrossRevenue,
        todayNetRevenue,
        todayWithheldTax,
        todayItemsSold,
        todaySalesList,
        totalWithholdingCredits,
        pendingVouchersCount,

        lowStockProducts,
        processSale,
        updateSaleWhtVoucher,
        processStockIn,
        processStockAdjustment,
        refreshData,
        cloudStatus,
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
