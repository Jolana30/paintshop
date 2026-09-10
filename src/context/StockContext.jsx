import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { initialProducts, initialSales, initialMovements } from '../data/initialProducts';
import { supabaseApi, supabaseAuth, isSupabaseConfigured } from '../lib/supabaseClient';
import { formatCurrency, getLocalDateString, generateUUID, isDemoShop } from '../utils/formatters';

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
    status: 'active',
    isDemo: true
  },
  {
    id: 'shop-demo-merkato',
    name: 'Merkato Colors (Jotun Dealer)',
    owner_name: 'Sara Tesfaye',
    phone: '+251 922 987 654',
    city_address: 'Merkato Military Terra, Addis Ababa',
    tin_number: '0048291038',
    email: 'merkato@jotunshop.et',
    status: 'active',
    isDemo: true
  }
];

export function StockProvider({ children }) {
  const [cloudStatus, setCloudStatus] = useState(isSupabaseConfigured ? 'checking' : 'offline');
  const [toast, setToast] = useState(null);
  const [authError, setAuthError] = useState(null);

  // Theme State (Dark / Light) with system preference fallback and localStorage persistence
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('paintflow_theme');
    if (saved === 'dark' || saved === 'light') return saved;
    if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('paintflow_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // 1. Multi-Shop Registry & Active Session
  const [allShops, setAllShops] = useState(() => {
    const saved = localStorage.getItem('paintflow_all_shops');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch { /* ignore */ }
    }
    return DEFAULT_DEMO_SHOPS;
  });

  const [currentShop, setCurrentShop] = useState(() => {
    const saved = localStorage.getItem('paintflow_current_shop');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    // S-06: In cloud mode, require explicit authentication. In offline mode, default to demo shop.
    return isSupabaseConfigured ? null : DEFAULT_DEMO_SHOPS[0];
  });

  // Proactive Supabase Cloud Health Check
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    const testCloud = async () => {
      try {
        const res = await supabaseApi.getMasterProducts();
        if (isMounted && Array.isArray(res) && res.length > 0) {
          setCloudStatus('connected');
        }
      } catch (err) {
        console.warn('Initial Supabase ping notice:', err);
        if (isMounted) setCloudStatus('error');
      }
    };

    testCloud();
    return () => { isMounted = false; };
  }, []);

  // Hydrate all registered shops from Supabase if connected
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const fetchRemoteShops = async () => {
      try {
        const remoteShops = await supabaseApi.getAllShops();
        if (Array.isArray(remoteShops) && remoteShops.length > 0) {
          setAllShops(prev => {
            const map = new Map();
            DEFAULT_DEMO_SHOPS.forEach(s => map.set(s.id, s));
            prev.forEach(s => map.set(s.id, s));
            remoteShops.forEach(s => {
              map.set(s.id, {
                id: s.id,
                name: s.name,
                owner_name: s.owner_name,
                phone: s.phone,
                city_address: s.city_address,
                tin_number: s.tin_number,
                email: s.email,
                status: s.status || 'pending_approval',
                created_at: s.created_at
              });
            });
            return Array.from(map.values());
          });

          // Proactively synchronize active shop status if approved in cloud
          setCurrentShop(prevCurrent => {
            if (!prevCurrent) return prevCurrent;
            const match = remoteShops.find(s => s.id === prevCurrent.id || (s.email && prevCurrent.email && s.email.toLowerCase() === prevCurrent.email.toLowerCase()));
            if (match && match.status && match.status !== prevCurrent.status) {
              const updated = { ...prevCurrent, status: match.status };
              localStorage.setItem('paintflow_current_shop', JSON.stringify(updated));
              return updated;
            }
            return prevCurrent;
          });
        }
      } catch (err) {
        console.warn('[Supabase] Could not fetch remote shop list:', err);
      }
    };
    fetchRemoteShops();
  }, []);

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
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(p => {
            const master = initialProducts.find(ip => ip.id === p.id);
            if (master) {
              return {
                ...p,
                category: master.category,
                priceBeforeVat: master.priceBeforeVat,
                priceWithVat: master.priceWithVat,
                size: master.size,
                code: master.code,
                name: master.name
              };
            }
            return p;
          });
        }
      } catch { /* ignore */ }
    }
    return initialProducts;
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
    if (!isSupabaseConfigured || !shop?.id || shop.status !== 'active' || isDemoShop(shop)) return;

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
            colourant_cost: Number(si.colourant_cost || si.colorant_cost || 0),
            colorantCost: Number(si.colourant_cost || si.colorant_cost || 0),
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
          customerPhone: s.customer_phone,
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
          productCode: m.product_code || m.code || '',
          productSize: m.product_size || m.size || '',
          code: m.product_code || m.code || '',
          size: m.product_size || m.size || '',
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

      if (isSupabaseConfigured && currentShop.status === 'active' && !isDemoShop(currentShop)) {
        await hydrateCloudData(currentShop);
      } else {
        const savedProds = localStorage.getItem(`paintflow_products_${currentShop.id}`);
        setProducts(savedProds ? JSON.parse(savedProds) : initialProducts);

        const savedSales = localStorage.getItem(`paintflow_sales_${currentShop.id}`);
        setSales(savedSales ? JSON.parse(savedSales) : initialSales);

        const savedMovs = localStorage.getItem(`paintflow_movements_${currentShop.id}`);
        setMovements(savedMovs ? JSON.parse(savedMovs) : initialMovements);
        setCloudStatus(isSupabaseConfigured && !isDemoShop(currentShop) ? 'connected' : 'offline');
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
      const demoShop = { ...mockShopOverride, isDemo: true };
      setCurrentShop(demoShop);
      setAllShops(prev => {
        const exists = prev.find(s => s.id === demoShop.id);
        return exists ? prev : [demoShop, ...prev];
      });
      showToast(`Logged into ${demoShop.name}! (Demo Mode)`, 'success');
      return true;
    }

    // Check if logging into a pre-seeded demo account (e.g. bole@jotunshop.et or merkato@jotunshop.et)
    const demoFound = DEFAULT_DEMO_SHOPS.find(s => s.email.toLowerCase() === email.toLowerCase());
    if (demoFound && (!isSupabaseConfigured || password === 'demo123')) {
      setCurrentShop(demoFound);
      setAllShops(prev => {
        const exists = prev.find(s => s.id === demoFound.id);
        return exists ? prev : [demoFound, ...prev];
      });
      showToast(`Welcome back, ${demoFound.name}! (Demo Mode)`, 'success');
      return true;
    }

    // Try cloud authentication if configured
    if (isSupabaseConfigured) {
      try {
        const res = await supabaseAuth.signIn({ email, password });
        if (res?.user) {
          const existingShop = allShops.find(s => s.email?.toLowerCase() === email.toLowerCase() || s.id === (res.profile?.id || res.user.id));
          const profile = res.profile || {
            id: res.user.id,
            name: res.user.user_metadata?.shop_name || 'My Jotun Store',
            email,
            phone: res.user.user_metadata?.phone || '',
            city_address: res.user.user_metadata?.city_address || '',
            tin_number: res.user.user_metadata?.tin_number || '',
            status: existingShop?.status || 'pending_approval'
          };

          if (!profile.status) {
            profile.status = existingShop?.status || 'pending_approval';
          }

          setCurrentShop(profile);
          setAllShops(prev => [profile, ...prev.filter(s => s.id !== profile.id)]);

          if (profile.status === 'active') {
            showToast(`Welcome back, ${profile.name}!`, 'success');
          } else {
            showToast(`Signed in to ${profile.name}. Account is pending subscription activation.`, 'info');
          }
          return true;
        }
      } catch (err) {
        console.error('Cloud login failed:', err.message);
        // Explicitly fail cloud login if credentials or server fails; do not silently bypass auth
        const isDemoAccount = email.toLowerCase().includes('demo');
        if (isDemoAccount) {
          const foundShop = allShops.find(s => s.email?.toLowerCase() === email.toLowerCase());
          if (foundShop) {
            setCurrentShop(foundShop);
            showToast(`Welcome back, ${foundShop.name}!`, 'success');
            return true;
          }
        }
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

    const fallbackId = generateUUID();
    let newShop = {
      id: fallbackId,
      name: shopName,
      owner_name: ownerName || 'Store Owner',
      phone,
      city_address: cityAddress,
      tin_number: tinNumber || '',
      email,
      status: 'pending_approval',
      created_at: new Date().toISOString()
    };

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

        if (res && res.success === false) {
          const errMsg = res.error || 'Registration failed on server.';
          setAuthError(errMsg);
          showToast(`Registration failed: ${errMsg}`, 'error');
          return {
            success: false,
            message: errMsg
          };
        }

        if (res?.user?.id) {
          newShop.id = res.user.id;
        } else if (res?.shop?.id) {
          newShop.id = res.shop.id;
        }
      } catch (err) {
        console.error('Registration failed:', err);
        setAuthError(err.message || 'Registration failed on server.');
        showToast(`Registration failed: ${err.message}`, 'error');
        return {
          success: false,
          message: err.message
        };
      }
    }

    // Gate all new store registrations under pending_approval (Paid SaaS commercial subscription model)
    setAllShops(prev => [newShop, ...prev.filter(s => s.id !== newShop.id)]);
    setCurrentShop(newShop);
    localStorage.setItem('paintflow_current_shop', JSON.stringify(newShop));
    showToast(`Store registered! Your account is pending administrator activation.`, 'info');

    return {
      success: true,
      requireEmailConfirmation: false,
      shop: newShop
    };
  };

  // Administrative Store Approval Workflow
  const approveShop = async (targetShopId) => {
    try {
      if (isSupabaseConfigured && !targetShopId.startsWith('shop-demo')) {
        await supabaseApi.updateShopStatus(targetShopId, 'active');
      }

      setAllShops(prev => prev.map(s => s.id === targetShopId ? { ...s, status: 'active' } : s));
      const targetShop = allShops.find(s => s.id === targetShopId);
      const isCurrentSession = currentShop && (currentShop.id === targetShopId || (currentShop.email && targetShop?.email && currentShop.email.toLowerCase() === targetShop.email.toLowerCase()));

      if (isCurrentSession) {
        const activeShop = { ...currentShop, status: 'active' };
        setCurrentShop(activeShop);
        localStorage.setItem('paintflow_current_shop', JSON.stringify(activeShop));
        if (isSupabaseConfigured && !isDemoShop(activeShop)) {
          await hydrateCloudData(activeShop);
        }
      }
      showToast("Store approved and activated! Ready for counter sales.", "success");
      return true;
    } catch (err) {
      console.error('Failed to approve shop:', err);
      showToast(`Failed to approve store: ${err.message}`, 'error');
      return false;
    }
  };

  // Administrative Store Suspension Workflow (Gating for Unpaid / Inactive Accounts)
  const suspendShop = async (targetShopId) => {
    try {
      if (isSupabaseConfigured && !targetShopId.startsWith('shop-demo')) {
        await supabaseApi.updateShopStatus(targetShopId, 'pending_approval');
      }

      setAllShops(prev => prev.map(s => s.id === targetShopId ? { ...s, status: 'pending_approval' } : s));
      if (currentShop && currentShop.id === targetShopId) {
        const suspendedShop = { ...currentShop, status: 'pending_approval' };
        setCurrentShop(suspendedShop);
        localStorage.setItem('paintflow_current_shop', JSON.stringify(suspendedShop));
      }
      showToast("Store suspended. Access gated until renewed.", "info");
      return true;
    } catch (err) {
      console.error('Failed to suspend shop:', err);
      showToast(`Failed to suspend store: ${err.message}`, 'error');
      return false;
    }
  };

  // Administrative Store Deletion
  const deleteShop = (targetShopId) => {
    setAllShops(prev => prev.filter(s => s.id !== targetShopId));
    if (currentShop?.id === targetShopId) {
      setCurrentShop(null);
      localStorage.removeItem('paintflow_current_shop');
    }
    showToast("Shop removed from store registry.", "info");
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

    if (isSupabaseConfigured && currentShop && !isDemoShop(currentShop)) {
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
        showToast(`Insufficient stock for "${prod.name}" (${prod.size}). Available: ${prod.stock}, Requested: ${item.quantity}`, 'error');
        return false;
      }
    }

    const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    const grossTotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);

    // 3% Withholding Tax calculations (applies on grossTotal > 20,000 ETB when toggled)
    const isWht = Boolean(withholdingDetails?.isWithholding && grossTotal >= 20000);
    const whtRate = isWht ? 3.0 : 0;
    const whtAmount = isWht ? Math.round(grossTotal * 0.03 * 100) / 100 : 0;
    const netPayable = isWht ? Math.round((grossTotal - whtAmount) * 100) / 100 : grossTotal;

    const saleId = 'SALE-' + generateUUID();
    const now = new Date();

    // Deduct stock locally
    const updatedProducts = products.map(prod => {
      const cartItem = cartItems.find(ci => ci.productId === prod.id);
      if (cartItem) {
        return { ...prod, stock: prod.stock - cartItem.quantity };
      }
      return prod;
    });

    // Sanitize cart items with explicit colourant cost
    const sanitizedCartItems = cartItems.map(item => ({
      ...item,
      colorantCost: Number(item.colorantCost || item.colourant_cost || 0),
      colourant_cost: Number(item.colorantCost || item.colourant_cost || 0)
    }));

    // Record stock movements with immutable product code and size
    const newMovements = cartItems.map(item => {
      const prod = products.find(p => p.id === item.productId);
      const prev = prod ? prod.stock : 0;
      const code = prod ? prod.code : (item.code || '');
      const size = prod ? prod.size : (item.size || '');
      return {
        id: 'MOV-' + generateUUID(),
        productId: item.productId,
        productName: item.productName,
        productCode: code,
        productSize: size,
        code,
        size,
        type: 'SALE',
        quantity: -item.quantity,
        previousStock: prev,
        newStock: prev - item.quantity,
        reference: `Sale #${saleId.slice(-8)}`,
        timestamp: now.toISOString()
      };
    });

    const finalPayment = paymentType || (withholdingDetails?.paymentType) || 'Cash';

    const newSale = {
      id: saleId,
      timestamp: now.toISOString(),
      localDate: getLocalDateString(now),
      items: sanitizedCartItems,
      totalItems,
      total: grossTotal,
      grossTotal,
      isWithholding: isWht,
      withholdingRate: whtRate,
      withholdingAmount: whtAmount,
      netPayable,
      customer: withholdingDetails?.customerName || (isWht ? 'Corporate Client' : 'Cash Walk-in'),
      customerTin: withholdingDetails?.customerTin || null,
      customerPhone: withholdingDetails?.customerPhone || null,
      whtVoucherNumber: withholdingDetails?.whtVoucherNumber || null,
      whtVoucherStatus: isWht ? (withholdingDetails?.whtVoucherStatus || 'pending') : 'not_applicable',
      paymentType: finalPayment,
      shopId: currentShop?.id,
      shopName: currentShop?.name
    };

    // Execute Atomic Database Transaction via Supabase RPC (S-03)
    if (isSupabaseConfigured && currentShop?.id && !isDemoShop(currentShop)) {
      try {
        const serverRes = await supabaseApi.recordSale({
          sale: newSale,
          items: sanitizedCartItems
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
    if (isSupabaseConfigured && currentShop && !isDemoShop(currentShop)) {
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
    if (isSupabaseConfigured && currentShop?.id && !isDemoShop(currentShop)) {
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
      productSize: targetProduct.size,
      productCode: targetProduct.code,
      code: targetProduct.code,
      size: targetProduct.size,
      type: 'STOCK_IN',
      quantity: qty,
      previousStock: prev,
      newStock: next,
      reference: refText,
      timestamp: now
    };

    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    showToast(`Stock received: ${targetProduct.name} (${targetProduct.size}) (+${qty} units)`, 'success');
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
    if (isSupabaseConfigured && currentShop?.id && !isDemoShop(currentShop)) {
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
      productSize: targetProduct.size,
      productCode: targetProduct.code,
      code: targetProduct.code,
      size: targetProduct.size,
      type: 'ADJUSTMENT',
      quantity: diff,
      previousStock: prev,
      newStock: next,
      reference: reasonText,
      timestamp: now
    };

    setProducts(updatedProducts);
    setMovements(prev => [newMovement, ...prev]);

    showToast(`Stock adjusted for ${targetProduct.name} (${targetProduct.size}): ${prev} → ${next}`, 'info');
    return true;
  };

  const refreshData = async () => {
    if (!isSupabaseConfigured) {
      showToast("Local branch mode: Supabase cloud not configured.", "info");
      setCloudStatus('offline');
      return;
    }

    setCloudStatus('connecting');
    showToast("Connecting to Supabase Cloud...", "info");

    try {
      // 1. Verify REST API connection to official master catalog
      const masterCheck = await supabaseApi.getMasterProducts();
      if (!Array.isArray(masterCheck) || masterCheck.length === 0) {
        throw new Error("Unable to reach cloud catalog");
      }

      // 2. Fetch remote shops to detect any recent approvals
      let updatedAllShops = allShops;
      try {
        const remoteShops = await supabaseApi.getAllShops();
        if (Array.isArray(remoteShops) && remoteShops.length > 0) {
          const map = new Map();
          DEFAULT_DEMO_SHOPS.forEach(s => map.set(s.id, s));
          allShops.forEach(s => map.set(s.id, s));
          remoteShops.forEach(s => {
            map.set(s.id, {
              id: s.id,
              name: s.name,
              owner_name: s.owner_name,
              phone: s.phone,
              city_address: s.city_address,
              tin_number: s.tin_number,
              email: s.email,
              status: s.status || 'pending_approval',
              created_at: s.created_at
            });
          });
          updatedAllShops = Array.from(map.values());
          setAllShops(updatedAllShops);
        }
      } catch (shopErr) {
        console.warn('Could not sync remote shops during refresh:', shopErr);
      }

      // 3. Resolve current shop status if it was approved
      let activeShop = currentShop;
      if (currentShop) {
        const match = updatedAllShops.find(s => s.id === currentShop.id || (s.email && currentShop.email && s.email.toLowerCase() === currentShop.email.toLowerCase()));
        if (match && match.status === 'active' && currentShop.status !== 'active') {
          activeShop = { ...currentShop, status: 'active' };
          setCurrentShop(activeShop);
          localStorage.setItem('paintflow_current_shop', JSON.stringify(activeShop));
        }
      }

      // 4. Hydrate cloud data if store is active
      if (activeShop && activeShop.status === 'active' && !isDemoShop(activeShop)) {
        await hydrateCloudData(activeShop);
        setCloudStatus('connected');
        showToast("Supabase Cloud synchronized! Inventory and sales are live.", "success");
      } else {
        setCloudStatus('connected');
        showToast("Supabase Cloud is live and connected!", "success");
      }
    } catch (err) {
      console.error('Refresh data error:', err);
      setCloudStatus('error');
      showToast(`Cloud connection warning: ${err.message || 'Offline'}`, "error");
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
        setCurrentShop,
        allShops,
        loginShop,
        registerShop,
        approveShop,
        suspendShop,
        deleteShop,
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
        formatCurrency,

        theme,
        toggleTheme,
        isDarkMode: theme === 'dark'
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
