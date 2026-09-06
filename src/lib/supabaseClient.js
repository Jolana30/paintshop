/**
 * PaintFlow - Supabase Client & Multi-Shop Connection Manager
 * Connects directly to Supabase Auth & PostgreSQL REST API.
 * Provides resilient multi-tenant CRUD, 3% Withholding Tax tracking,
 * and seamless offline/demo mode.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Lightweight REST Client for Supabase PostgREST & Auth
 */
export async function fetchFromSupabase(endpoint, options = {}) {
  if (!isSupabaseConfigured) return null;

  const cleanBase = SUPABASE_URL.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const url = cleanEndpoint.startsWith('auth/') 
    ? `${cleanBase}/${cleanEndpoint}` 
    : `${cleanBase}/rest/v1/${cleanEndpoint}`;

  const token = options.token || localStorage.getItem('paintflow_auth_token') || SUPABASE_ANON_KEY;

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Supabase API Error ${response.status}]`, errText);
      try {
        return { error: JSON.parse(errText) };
      } catch {
        return { error: { message: errText } };
      }
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) return true;
    return JSON.parse(text);
  } catch (err) {
    console.error('[Supabase Network Failure]', err);
    return null;
  }
}

export const supabaseAuth = {
  /**
   * Register a new Paint Shop account
   */
  async signUp({ email, password, shopName, ownerName, phone, cityAddress, tinNumber }) {
    if (!isSupabaseConfigured) {
      // Mock signup for local demo
      const mockShop = {
        id: 'shop-' + Date.now(),
        name: shopName,
        owner_name: ownerName || 'Owner',
        phone,
        city_address: cityAddress,
        tin_number: tinNumber || '',
        email,
        status: 'pending_approval',
        created_at: new Date().toISOString()
      };
      return { data: { user: { id: mockShop.id, email } }, shop: mockShop };
    }

    const res = await fetchFromSupabase('auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: {
          shop_name: shopName,
          owner_name: ownerName,
          phone,
          city_address: cityAddress,
          tin_number: tinNumber
        }
      })
    });

    if (res?.error) return { error: res.error };

    // Also create shop record in public.shops
    if (res?.user?.id) {
      await fetchFromSupabase('shops', {
        method: 'POST',
        body: JSON.stringify({
          id: res.user.id,
          name: shopName,
          owner_name: ownerName,
          phone,
          city_address: cityAddress,
          tin_number: tinNumber || null,
          email,
          status: 'pending_approval'
        })
      });
    }

    return { data: res };
  },

  /**
   * Sign in to existing shop account
   */
  async signIn({ email, password }) {
    if (!isSupabaseConfigured) return null;

    const res = await fetchFromSupabase('auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (res?.access_token) {
      localStorage.setItem('paintflow_auth_token', res.access_token);
      localStorage.setItem('paintflow_refresh_token', res.refresh_token);
    }

    return res;
  },

  /**
   * Fetch shop profile for the authenticated user
   */
  async getShopProfile(shopId) {
    if (!isSupabaseConfigured) return null;
    const res = await fetchFromSupabase(`shops?id=eq.${encodeURIComponent(shopId)}&select=*`);
    if (Array.isArray(res) && res.length > 0) return res[0];
    return null;
  },

  /**
   * Sign out current shop session
   */
  async signOut() {
    if (isSupabaseConfigured) {
      await fetchFromSupabase('auth/v1/logout', { method: 'POST' });
    }
    localStorage.removeItem('paintflow_auth_token');
    localStorage.removeItem('paintflow_refresh_token');
  }
};

export const supabaseApi = {
  /**
   * Fetch Master 46 Jotun Products
   */
  async getMasterProducts() {
    return fetchFromSupabase('master_products?select=*&order=code.asc');
  },

  /**
   * Fetch shop inventory for a specific shop
   */
  async getShopInventory(shopId) {
    if (!shopId) return null;
    return fetchFromSupabase(`shop_inventory?shop_id=eq.${encodeURIComponent(shopId)}&select=*`);
  },

  /**
   * Fetch sales history for this specific shop
   */
  async getSales(shopId) {
    if (!shopId) return null;
    return fetchFromSupabase(`sales?shop_id=eq.${encodeURIComponent(shopId)}&select=*,sale_items(*)&order=created_at.desc`);
  },

  /**
   * Fetch stock movements audit trail for this specific shop
   */
  async getMovements(shopId) {
    if (!shopId) return null;
    return fetchFromSupabase(`stock_movements?shop_id=eq.${encodeURIComponent(shopId)}&select=*&order=created_at.desc`);
  },

  /**
   * Add a custom local product (brushes, rollers, local putty)
   */
  async addCustomProduct(shopId, product) {
    if (!isSupabaseConfigured) return null;
    return fetchFromSupabase('shop_inventory', {
      method: 'POST',
      body: JSON.stringify({
        shop_id: shopId,
        master_product_id: null,
        is_custom: true,
        custom_name: product.name,
        custom_category: product.category || 'Accessories',
        custom_size: product.size || '1 Unit',
        custom_code: product.code || ('CUSTOM-' + Date.now().toString().slice(-6)),
        custom_price_before_vat: product.priceBeforeVat || 0,
        custom_price_with_vat: product.priceWithVat,
        stock: product.stock || 0,
        min_stock: product.minStock || 5
      })
    });
  },

  /**
   * Update stock count in shop inventory
   */
  async updateInventoryStock(shopId, inventoryItemId, newStock) {
    return fetchFromSupabase(`shop_inventory?id=eq.${encodeURIComponent(inventoryItemId)}&shop_id=eq.${encodeURIComponent(shopId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stock: newStock,
        updated_at: new Date().toISOString()
      })
    });
  },

  /**
   * Update Withholding Tax Voucher number & status for a sale
   */
  async updateSaleWhtVoucher(saleId, { voucherNumber, voucherStatus }) {
    return fetchFromSupabase(`sales?id=eq.${encodeURIComponent(saleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        wht_voucher_number: voucherNumber,
        wht_voucher_status: voucherStatus
      })
    });
  },

  /**
   * Complete Sale Transaction with 3% Withholding Tax Support
   */
  async recordSale({ shopId, sale, items, movements, productUpdates }) {
    if (!isSupabaseConfigured) return false;

    try {
      const saleRow = {
        id: sale.id,
        shop_id: shopId,
        customer: sale.customer || 'Cash Walk-in',
        customer_tin: sale.customerTin || null,
        payment_type: sale.paymentType || 'Cash',
        total: sale.total,
        total_items: sale.totalItems,
        is_withholding: Boolean(sale.isWithholding),
        withholding_rate: sale.withholdingRate || 3.0,
        withholding_amount: sale.withholdingAmount || 0,
        net_payable: sale.netPayable !== undefined ? sale.netPayable : sale.total,
        wht_voucher_number: sale.whtVoucherNumber || null,
        wht_voucher_status: sale.whtVoucherStatus || (sale.isWithholding ? 'pending' : 'not_applicable'),
        created_at: sale.timestamp || new Date().toISOString()
      };

      await fetchFromSupabase('sales', {
        method: 'POST',
        body: JSON.stringify(saleRow)
      });

      if (items && items.length > 0) {
        const itemRows = items.map(item => ({
          sale_id: sale.id,
          shop_id: shopId,
          product_id: item.productId,
          product_name: item.productName,
          code: item.code,
          size: item.size,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          price_before_vat: item.priceBeforeVat || 0,
          subtotal: item.subtotal,
          created_at: sale.timestamp || new Date().toISOString()
        }));

        await fetchFromSupabase('sale_items', {
          method: 'POST',
          body: JSON.stringify(itemRows)
        });
      }

      if (movements && movements.length > 0) {
        const movRows = movements.map(m => ({
          id: m.id,
          shop_id: shopId,
          product_id: m.productId,
          product_name: m.productName,
          type: 'SALE',
          quantity: m.quantity,
          previous_stock: m.previousStock,
          new_stock: m.newStock,
          reference: sale.id,
          created_at: m.timestamp || new Date().toISOString()
        }));

        await fetchFromSupabase('stock_movements', {
          method: 'POST',
          body: JSON.stringify(movRows)
        });
      }

      return true;
    } catch (err) {
      console.error('[Supabase recordSale error]', err);
      return false;
    }
  },

  /**
   * Super Admin method: Update shop status (approve / suspend)
   */
  async updateShopStatus(shopId, status) {
    return fetchFromSupabase(`shops?id=eq.${encodeURIComponent(shopId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString()
      })
    });
  }
};
