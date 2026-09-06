import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { initialProducts, initialSales, initialMovements } from '../data/initialProducts';
import { supabaseApi, supabaseAuth, isSupabaseConfigured } from '../lib/supabaseClient';
import { formatCurrency, getLocalDateString, generateUUID } from '../utils/formatters';

const StockContext = createContext(null);

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
  const [cloudStatus, setCloudStatus] = useState(isSupabaseConfigured ? 'checking' : 'offline');
  const [toast, setToast] = useState(null);
  const [authError, setAuthError] = useState(null);

  // 1. Multi-Shop Registry & Active Session
  const [allShops, setAllShops] = useState(() => {
    const saved = localStorage.getItem('paintflow_all_shops');
    return saved ? JSON.parse(saved) : (isSupabaseConfigured ? [] : DEFAULT_DEMO_SHOPS);
  });

  const [currentShop, setCurrentShop] = useState(() => {
    const saved = localStorage.getItem('paintflow_current_shop');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    // S-06: In cloud mode, require explicit authentication. In offline mode, default to demo shop.
    return isSupabaseConfigured ? null : DEFAULT_DEMO_SHOPS[0];
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

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // S-05: Authoritative Cloud Data Hydration
  const hydrateCloudData = useCallback(async (shop) => {
    if (!isSupabaseConfigured || !shop?.id || shop.status !== 'active') return;

    try {
      await Promise.resolve();
      setCloudStatus('connecting');
      const [masterRes, invRes, salesRes, movRes] = await Promise.all([
        supabaseApi.getMasterProducts(),
        supabaseApi.getShopInventory(shop.id),
        supabaseApi.getSales(shop.id),
        supabaseApi.getMovements(shop.id)
      ]);

      const masterList = Array.isArray(masterRes) ? masterRes : [];
      const invList = Array.isArray(invRes) ? invRes : [];

      const invByMasterId = new Map();
      const customItems = [];

      for (const inv of invList) {
        if (inv.master_product_id) {
          invByMasterId.set(inv.master_product_id, inv);
        } else if (inv.is_custom) {
          customItems.push({
            id: inv.id,
            code: inv.custom_code || 'CUSTOM',
            name: inv.custom_name,
            category: inv.custom_category || 'Accessories',
            size: inv.custom_size || '1 Unit',
            priceBeforeVat: Number(inv.custom_price_before_vat) || 0,
            priceWithVat: Number(inv.custom_price_with_vat) || 0,
            stock: Number(inv.stock) || 0,
            minStock: Number(inv.min_stock) || 5,
            isCustom: true
          });
        }
      }

      const combinedMasterProducts = masterList.map(mp => {
        const invRow = invByMasterId.get(mp.id);
        return {
          id: mp.id,
          code: mp.code,
          name: mp.name,
          category: mp.category,
          size: mp.size,
          priceBeforeVat: Number(mp.price_before_vat) || 0,
          priceWithVat: Number(mp.price_with_vat) || 0,
          minStock: invRow ? Number(invRow.min_stock) : (Number(mp.min_stock) || 5),
          stock: invRow ? Number(invRow.stock) : 0,
          isCustom: false
        };
      });

      const fullProductCatalog = [...combinedMasterProducts, ...customItems];
      setProducts(fullProductCatalog);

      if (Array.isArray(salesRes)) {
        const mappedSales = salesRes.map(s => ({
          id: s.id,
          timestamp: s.created_at,
          localDate: getLocalDateString(s.created_at),
          items: Array.isArray(s.sale_items) ? s.sale_items.map(si => ({
            productId: si.product_id,
            productName: si.product_name,
            code: si.code,
            size: si.size,
            quantity: si.quantity,
            unitPrice: Number(si.unit_price),
            priceBeforeVat: Number(si.price_before_vat),
            subtotal: Number(si.subtotal)
          })) : [],
          totalItems: s.total_items,
          total: Number(s.total),
          grossTotal: Number(s.total),
          isWithholding: Boolean(s.is_withholding),
          withholdingRate: Number(s.withholding_rate),
          withholdingAmount: Number(s.withholding_amount),
          netPayable: Number(s.net_payable),
          customer: s.customer,
          customerTin: s.customer_tin,
          whtVoucherNumber: s.wht_voucher_number,
          whtVoucherStatus: s.wht_voucher_status,
          paymentType: s.payment_type,
          shopId: s.shop_id,
          shopName: shop.name
        }));
        setSales(mappedSales);
      }

      if (Array.isArray(movRes)) {
        const mappedMovs = movRes.map(m => ({
          id: m.id,
          productId: m.product_id,
          productName: m.product_name,
          type: m.type,
          quantity: m.quantity,
          previousStock: m.previous_stock,
          newStock: m.new_stock,
          reference: m.reference,
          timestamp: m.created_at
        }));
        setMovements(mappedMovs);
      }

      setCloudStatus('connected');
    } catch (err) {
      console.error('[Cloud Hydration Error]', err);
      setCloudStatus('error');
      showToast(`Warning: Could not load cloud records: ${err.message}`, 'error');
    }
  }, [showToast]);

  // Reload products/sales whenever the active shop changes
  useEffect(() => {
    if (!currentShop) return;
    let isCancelled = false;

    const loadShopData = async () => {
      await Promise.resolve();
      if (isCancelled) return;

      if (isSupabaseConfigured && currentShop.status === 'active') {
        await hydrateCloudData(currentShop);
      } else {
        const savedProds = localStorage.getItem(`paintflow_products_${currentShop.id}`);
        setProducts(savedProds ? JSON.parse(savedProds) : initialProducts);

        const savedSales = localStorage.getItem(`paintflow_sales_${currentShop.id}`);
        setSales(savedSales ? JSON.parse(savedSales) : initialSales);

        const savedMovs = localStorage.getItem(`paintflow_movements_${currentShop.id}`);
        setMovements(savedMovs ? JSON.parse(savedMovs) : initialMovements);
        setCloudStatus(isSupabaseConfigured ? 'connected' : 'offline');
      }
    };

    loadShopData();

    return () => {
      isCancelled = true;
    };
  }, [currentShop, hydrateCloudData]);

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

  // 5. Authentication Handlers
  const loginShop = async (email, password, mockShopOverride = null) => {
    setAuthError(null);

    // Mock override passed from preset buttons
    if (mockShopOverride) {
      setCurrentShop(mockShopOverride);
      setAllShops(prev => {
        const exists = prev.find(s => s.id === mockShopOverride.id);
        return exists ? prev : [mockShopOverride, ...prev];
      });
      showToast(`Logged into ${mockShopOverride.name}!`, 'success');
      return true;
    }

    // Try cloud authentication if configured
    if (isSupabaseConfigured) {
      try {
        const res = await supabaseAuth.signIn({ email, password });
        if (res?.user) {
          const profile = res.profile || {
            id: res.user.id,
            name: res.user.user_metadata?.shop_name || 'My Jotun Store',
            email,
            phone: res.user.user_metadata?.phone || '',
            city_address: res.user.user_metadata?.city_address || '',
            tin_number: res.user.user_metadata?.tin_number || '',
            status: 'pending_approval' // Enforce pending status until explicitly active!
          };

          setCurrentShop(profile);
          setAllShops(prev => [profile, ...prev.filter(s => s.id !== profile.id)]);

          if (profile.status === 'active') {
            showToast(`Welcome back, ${profile.name}!`, 'success');
          } else {
            showToast(`Signed in. Store application is pending review.`, 'info');
          }
          return true;
        }
      } catch (err) {
        console.error('Login error:', err);
        setAuthError(err.message || 'Invalid login credentials.');
        return false;
      }
    } else {
      // Local demo shop lookup
      const foundLocal = allShops.find(s => s.email.toLowerCase() === email.toLowerCase());
      if (foundLocal) {
        setCurrentShop(foundLocal);
        showToast(`Welcome back, ${foundLocal.name}!`, 'success');
        return true;
      }
    }

    setAuthError('Shop account not found. Please check your credentials or register.');
    return false;
  };

  const registerShop = async ({ shopName, ownerName, phone, cityAddress, tinNumber, email, password }) => {
    setAuthError(null);

    if (isSupabaseConfigured) {
      try {
        const res = await supabaseAuth.signUp({
          email,
          password,
          shopName,
          ownerName,
          phone,
          cityAddress,
          tinNumber
        });

        if (res.requireEmailConfirmation) {
          return {
            success: true,
            requireEmailConfirmation: true,
            email: res.email,
            message: 'Account created! Please check your email to confirm your registration.'
          };
        }

        const newShop = {
          id: res.user?.id || ('shop-' + Date.now()),
          name: shopName,
          owner_name: ownerName,
          phone,
          city_address: cityAddress,
          tin_number: tinNumber || '',
          email,
          status: 'pending_approval',
          created_at: new Date().toISOString()
        };

        setAllShops(prev => [newShop, ...prev.filter(s => s.id !== newShop.id)]);
        setCurrentShop(newShop);
        showToast(`Store registered! Pending administrator approval.`, 'info');

        return {
          success: true,
          requireEmailConfirmation: false,
          shop: newShop
        };
      } catch (err) {
        console.error('Registration failed:', err);
        setAuthError(err.message || 'Registration failed. Please try again.');
        return {
          success: false,
          message: err.message || 'Registration failed.'
        };
      }
    } else {
      // Local demo mode registration
      const newShopId = 'shop-' + Date.now();
      const newShop = {
        id: newShopId,
        name: shopName,
        owner_name: ownerName,
        phone,
        city_address: cityAddress,
        tin_number: tinNumber,
        email,
        status: 'pending_approval',
        created_at: new Date().toISOString()
      };

      setAllShops(prev => [newShop, ...prev]);
      setCurrentShop(newShop);
      showToast(`Registered ${shopName}! Pending approval.`, 'info');
      return { success: true, requireEmailConfirmation: false, shop: newShop };
    }
  };

  // Administrative Approval Workflow
  const approveShop = async (targetShopId) => {
    try {
      if (isSupabaseConfigured) {
        await supabaseApi.updateShopStatus(targetShopId, 'active');
      }

      const updated = allShops.map(s => s.id === targetShopId ? { ...s, status: 'active' } : s);
      setAllShops(updated);
      if (currentShop && currentShop.id === targetShopId) {
        setCurrentShop(prev => ({ ...prev, status: 'active' }));
      }
      showToast("Shop successfully approved and activated!", "success");
      return true;
    } catch (err) {
      console.error('Failed to approve shop:', err);
      showToast(`Approval failed: ${err.message}`, 'error');
      return false;
    }
  };

  const logoutShop = () => {
    supabaseAuth.signOut();
    setCurrentShop(null);
    showToast("You have been signed out.", "info");
  };

  // 6. Custom Product Creation (Brushes, Rollers, Local Putty)
  const addCustomProduct = async (customProduct) => {
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

    if (isSupabaseConfigured && currentShop) {
      try {
        await supabaseApi.addCustomProduct(currentShop.id, newItem);
      } catch (err) {
        console.error('Failed to sync custom item to cloud:', err);
        showToast(`Warning: Failed to save product to cloud: ${err.message}`, 'error');
        return null;
      }
    }

    setProducts(prev => [newItem, ...prev]);
    showToast(`Added custom product: ${newItem.name}!`, 'success');
    return newItem;
  };

  // 7. Atomic Transactional Sale with 3% Withholding Tax
  const processSale = async (cartItems, paymentType = "Cash", withholdingDetails = null) => {
    if (!cartItems || cartItems.length === 0) return false;

    // Check available stock locally first
    for (const item of cartItems) {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) {
        showToast(`Product not found: ${item.productName}`, 'error');
        return false;
      }
      if (prod.stock < item.quantity) {
        showToast(`Insufficient stock for ${prod.name}! Available: ${prod.stock}, Requested: ${item.quantity}`, 'error');
        return false;
      }
    }

    const saleId = 'SALE-' + generateUUID();
    const now = new Date().toISOString();
    const newMovements = [];

    // Prepare updated products and movement records
    const updatedProducts = products.map(p => {
      const inCart = cartItems.find(item => item.productId === p.id);
      if (inCart) {
        const prev = p.stock;
        const next = p.stock - inCart.quantity;

        newMovements.push({
          id: 'MOV-' + generateUUID(),
          productId: p.id,
          productName: p.name,
          type: 'SALE',
          quantity: -inCart.quantity,
          previousStock: prev,
          newStock: next,
          reference: saleId,
          timestamp: now
        });

        return { ...p, stock: next };
      }
      return p;
    });

    const grossTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const finalPayment = paymentType || "Cash";

    // Ethiopian 3% Withholding Tax computation (requires minimum 20,000 ETB gross invoice)
    const isWhtRequested = Boolean(withholdingDetails?.isWithholding);
    if (isWhtRequested && grossTotal < 20000) {
      showToast('Withholding tax (3%) requires a minimum transaction total of 20,000 ETB.', 'warning');
      return false;
    }
    const isWht = isWhtRequested && grossTotal >= 20000;
    const whtRate = 3.0;
    const whtAmount = isWht ? Math.round((grossTotal * (whtRate / 100)) * 100) / 100 : 0;
    const netPayable = isWht ? (grossTotal - whtAmount) : grossTotal;

    const newSale = {
      id: saleId,
      timestamp: now,
      localDate: getLocalDateString(now),
      items: cartItems,
      totalItems,
      total: grossTotal,
      grossTotal,
      isWithholding: isWht,
      withholdingRate: whtRate,
      withholdingAmount: whtAmount,
      netPayable,
      customer: withholdingDetails?.customerName || (isWht ? 'Corporate Client' : 'Cash Walk-in'),
      customerTin: withholdingDetails?.customerTin || null,
      whtVoucherNumber: withholdingDetails?.whtVoucherNumber || null,
      whtVoucherStatus: isWht ? (withholdingDetails?.whtVoucherStatus || 'pending') : 'not_applicable',
      paymentType: finalPayment,
      shopId: currentShop?.id,
      shopName: currentShop?.name
    };

    // Execute Atomic Database Transaction via Supabase RPC (S-03)
    if (isSupabaseConfigured && currentShop?.id) {
      try {
        const serverRes = await supabaseApi.recordSale({
          sale: newSale,
          items: cartItems
        });
        if (serverRes?.gross_total !== undefined) {
          newSale.grossTotal = Number(serverRes.gross_total);
          newSale.total = newSale.grossTotal;
          newSale.totalItems = Number(serverRes.total_items);
          newSale.withholdingAmount = Number(serverRes.withholding_amount);
          newSale.netPayable = Number(serverRes.net_payable);
        }
      } catch (err) {
        console.error('[Sale Transaction Failed]', err);
        showToast(`Transaction failed: ${err.message}`, 'error');
        // Do not update local state on failure!
        return false;
      }
    }

    // Apply state upon confirmed transaction
    setProducts(updatedProducts);
    setSales(prevSales => [newSale, ...prevSales]);
    setMovements(prevMovements => [...newMovements, ...prevMovements]);

    if (isWht) {
      showToast(`Sale #${saleId.slice(-8)} recorded! Net collected: ${formatCurrency(netPayable)} (3% WHT: -${formatCurrency(whtAmount)})`, 'success');
    } else {
      showToast(`Sale #${saleId.slice(-8)} recorded! ${totalItems} unit(s) deducted from stock.`, 'success');
    }

    return newSale;
  };

  // Update Withholding Voucher Number or Status
  const updateSaleWhtVoucher = async (saleId, voucherNumber, voucherStatus) => {
    if (isSupabaseConfigured) {
      try {
        await supabaseApi.updateSaleWhtVoucher(saleId, {
          voucherNumber,
          voucherStatus
        });
      } catch (err) {
        console.error('Failed to update WHT voucher:', err);
        showToast(`Failed to update voucher: ${err.message}`, 'error');
        return false;
      }
    }

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

    showToast("Withholding voucher details updated!", "success");
    return true;
  };

  // Atomic Stock In
  const processStockIn = async (productId, quantity, reference = "") => {
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

    const refText = reference.trim() || "Supplier Stock Receipt";

    // Execute atomic server update
    if (isSupabaseConfigured && currentShop?.id) {
      try {
        await supabaseApi.recordStockIn(productId, qty, refText);
      } catch (err) {
        console.error('[Stock In Failed]', err);
        showToast(`Stock-in failed: ${err.message}`, 'error');
        return false;
      }
    }

    const prev = targetProduct.stock;
    const next = prev + qty;
    const now = new Date().toISOString();

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: next } : p
    );

    const newMovement = {
      id: 'MOV-' + generateUUID(),
      productId: targetProduct.id,
      productName: targetProduct.name,
      type: 'STOCK_IN',
      quantity: qty,
      previousStock: prev,
      newStock: next,
      reference: refText,
      timestamp: now
    };

    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    showToast(`Stock received: ${targetProduct.name} (+${qty} units)`, 'success');
    return true;
  };

  // Atomic Stock Adjustment
  const processStockAdjustment = async (productId, newStockQty, reason = "Inventory Count Adjustment") => {
    const next = parseInt(newStockQty, 10);
    if (isNaN(next) || next < 0) {
      showToast("Invalid stock amount.", "error");
      return false;
    }

    const targetProduct = products.find(p => p.id === productId);
    if (!targetProduct) return false;

    const reasonText = reason.trim() || "Physical Stock Count";

    // Execute atomic server adjustment
    if (isSupabaseConfigured && currentShop?.id) {
      try {
        await supabaseApi.adjustStock(productId, next, reasonText);
      } catch (err) {
        console.error('[Stock Adjustment Failed]', err);
        showToast(`Stock adjustment failed: ${err.message}`, 'error');
        return false;
      }
    }

    const prev = targetProduct.stock;
    const diff = next - prev;
    const now = new Date().toISOString();

    const updatedProducts = products.map(p =>
      p.id === productId ? { ...p, stock: next } : p
    );

    const newMovement = {
      id: 'MOV-' + generateUUID(),
      productId: targetProduct.id,
      productName: targetProduct.name,
      type: 'ADJUSTMENT',
      quantity: diff,
      previousStock: prev,
      newStock: next,
      reference: reasonText,
      timestamp: now
    };

    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    showToast(`Stock adjusted for ${targetProduct.name}: ${prev} → ${next}`, 'info');
    return true;
  };

  const refreshData = async () => {
    if (isSupabaseConfigured && currentShop?.status === 'active') {
      await hydrateCloudData(currentShop);
      showToast("Cloud catalog and sales synchronized!", "success");
    } else {
      showToast("Catalog and sales up to date!", "success");
    }
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

  // Per-product items sold today calculation for Inventory overview
  const getSoldToday = useCallback((productId) => {
    let count = 0;
    for (const s of todaySalesList) {
      if (Array.isArray(s.items)) {
        for (const item of s.items) {
          if (item.productId === productId) {
            count += Number(item.quantity) || 0;
          }
        }
      }
    }
    return count;
  }, [todaySalesList]);

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
        getSoldToday,
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
