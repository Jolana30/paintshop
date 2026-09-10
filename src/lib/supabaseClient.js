/**
 * PaintFlow - Supabase Client & Multi-Shop Connection Manager
 * Connects directly to Supabase Auth & PostgreSQL REST/RPC API.
 * Provides resilient multi-tenant isolation, 3% Withholding Tax tracking,
 * strict server-side transactional integrity, and seamless offline/demo mode.
 */

import { isValidUUID, generateUUID } from '../utils/formatters';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://bqdqotozxzzfoferagjr.supabase.co').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_z-B190KryqAKpJGTn1UInQ_WvzbwX4e').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Lightweight REST & RPC Client for Supabase PostgREST & Auth.
 * Throws on non-2xx responses so callers can reliably handle errors and rollbacks.
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

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    if (response.status === 401 && token !== SUPABASE_ANON_KEY) {
      console.warn('[Supabase Auth] Expired or invalid token detected. Purging stale auth and retrying with anon key.');
      localStorage.removeItem('paintflow_auth_token');
      localStorage.removeItem('paintflow_refresh_token');
      return fetchFromSupabase(endpoint, { ...options, token: SUPABASE_ANON_KEY });
    }

    const errText = await response.text();
    let errMsg = `Supabase request failed with HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(errText);
      errMsg = parsed.message || parsed.error_description || parsed.msg || parsed.error || errMsg;
    } catch {
      if (errText && errText.trim()) {
        errMsg = errText;
      }
    }
    const error = new Error(errMsg);
    error.status = response.status;
    console.error(`[Supabase API Error ${response.status}]`, errMsg);
    throw error;
  }

  const text = await response.text();
  if (!text || text.trim().length === 0) return true;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Call a PostgreSQL Remote Procedure Call (RPC) function in Supabase
 */
export async function callRpc(functionName, params = {}) {
  return fetchFromSupabase(`rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(params)
  });
}

export const supabaseAuth = {
  /**
   * Register a new Paint Shop account.
   * Shop profile creation is handled server-side via PostgreSQL trigger on auth.users.
   */
  async signUp({ email, password, shopName, ownerName, phone, cityAddress, tinNumber }) {
    const fallbackShop = {
      id: generateUUID(),
      name: shopName,
      owner_name: ownerName || 'Owner',
      phone,
      city_address: cityAddress,
      tin_number: tinNumber || '',
      email,
      status: 'pending_approval',
      created_at: new Date().toISOString()
    };

    if (!isSupabaseConfigured) {
      return { success: true, data: { user: { id: fallbackShop.id, email } }, user: { id: fallbackShop.id, email }, shop: fallbackShop, email };
    }

    try {
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
            tin_number: tinNumber || null
          }
        })
      });

      if (res?.session?.access_token) {
        localStorage.setItem('paintflow_auth_token', res.session.access_token);
        if (res.session.refresh_token) {
          localStorage.setItem('paintflow_refresh_token', res.session.refresh_token);
        }
      }

      const shop = {
        ...fallbackShop,
        id: res?.user?.id || fallbackShop.id
      };

      return {
        success: true,
        data: res,
        user: res?.user || { id: shop.id, email },
        shop,
        requireEmailConfirmation: false,
        email
      };
    } catch (err) {
      console.error('[Supabase Auth SignUp Failed]', err.message || err);
      return {
        success: false,
        error: err.message || 'Registration failed on server.',
        email
      };
    }
  },

  /**
   * Sign in to existing shop account and fetch authoritative profile
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

    let profile = null;
    if (res?.user?.id) {
      try {
        profile = await supabaseAuth.getShopProfile(res.user.id);
      } catch (err) {
        console.warn('Could not fetch shop profile after login:', err);
      }
    }

    return {
      user: res.user,
      profile,
      access_token: res.access_token
    };
  },

  /**
   * Fetch shop profile for the authenticated user from public.shops
   */
  async getShopProfile(shopId) {
    if (!isSupabaseConfigured || !shopId || !isValidUUID(shopId)) return null;
    const res = await fetchFromSupabase(`shops?id=eq.${encodeURIComponent(shopId)}&select=*`);
    if (Array.isArray(res) && res.length > 0) return res[0];
    return null;
  },

  /**
   * Sign out current shop session
   */
  async signOut() {
    if (isSupabaseConfigured) {
      try {
        await fetchFromSupabase('auth/v1/logout', { method: 'POST' });
      } catch (e) {
        console.warn('Logout API warning:', e);
      }
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
    if (!shopId || !isValidUUID(shopId)) return [];
    return fetchFromSupabase(`shop_inventory?shop_id=eq.${encodeURIComponent(shopId)}&select=*`);
  },

  /**
   * Fetch sales history for this specific shop
   */
  async getSales(shopId) {
    if (!shopId || !isValidUUID(shopId)) return [];
    return fetchFromSupabase(`sales?shop_id=eq.${encodeURIComponent(shopId)}&select=*,sale_items(*)&order=created_at.desc`);
  },

  /**
   * Fetch stock movements audit trail for this specific shop
   */
  async getMovements(shopId) {
    if (!shopId || !isValidUUID(shopId)) return [];
    return fetchFromSupabase(`stock_movements?shop_id=eq.${encodeURIComponent(shopId)}&select=*&order=created_at.desc`);
  },

  /**
   * Fetch all shops for platform admin console
   */
  async getAllShops() {
    if (!isSupabaseConfigured) return [];
    try {
      const res = await fetchFromSupabase('shops?select=*&order=created_at.desc');
      return Array.isArray(res) ? res : [];
    } catch {
      return [];
    }
  },

  /**
   * Add a custom local product via transactional RPC (S-02)
   */
  async addCustomProduct(_shopId, product) {
    if (!isSupabaseConfigured || (_shopId && !isValidUUID(_shopId))) return null;
    return callRpc('add_custom_product_transaction', {
      p_name: product.name,
      p_category: product.category || 'Accessories',
      p_size: product.size || '1 Unit',
      p_code: product.code || null,
      p_price_before_vat: product.priceBeforeVat || null,
      p_price_with_vat: product.priceWithVat,
      p_stock: product.stock || 0,
      p_min_stock: product.minStock || 5
    });
  },

  /**
   * Atomic Transactional Sale Recording:
   * Locks inventory rows, checks sufficient stock, decrements stock,
   * inserts sale, items, and movements in a single atomic database transaction.
   */
  async recordSale({ sale, items }) {
    if (!isSupabaseConfigured) return true;
    if (sale?.shopId && !isValidUUID(sale.shopId)) return true;

    const saleRow = {
      id: sale.id,
      customer: sale.customer || 'Cash Walk-in',
      customer_tin: sale.customerTin || null,
      customer_phone: sale.customerPhone || null,
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

    const itemRows = (items || []).map(item => ({
      product_id: item.productId,
      product_name: item.productName,
      code: item.code,
      size: item.size,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      price_before_vat: item.priceBeforeVat || 0,
      colourant_cost: Number(item.colorantCost || item.colourant_cost || item.colourantCost || 0),
      colorant_cost: Number(item.colorantCost || item.colourant_cost || item.colourantCost || 0),
      subtotal: item.subtotal
    }));

    return callRpc('record_sale_transaction', {
      p_sale: saleRow,
      p_items: itemRows
    });
  },

  /**
   * Atomic Transactional Stock In:
   * Increments stock with row lock and logs audit movement in one transaction.
   */
  async recordStockIn(productId, quantity, reference = 'Supplier Stock Receipt') {
    if (!isSupabaseConfigured) return true;
    return callRpc('record_stock_in_transaction', {
      p_product_id: productId,
      p_quantity: parseInt(quantity, 10),
      p_reference: reference
    });
  },

  /**
   * Atomic Transactional Stock Adjustment:
   * Adjusts stock count with row lock and logs audit movement in one transaction.
   */
  async adjustStock(productId, newStock, reason = 'Physical Stock Count') {
    if (!isSupabaseConfigured) return true;
    return callRpc('adjust_stock_transaction', {
      p_product_id: productId,
      p_new_stock: parseInt(newStock, 10),
      p_reason: reason
    });
  },

  /**
   * Update Withholding Tax Voucher number & status for a sale via transactional RPC (S-02)
   */
  async updateSaleWhtVoucher(saleId, { voucherNumber, voucherStatus }) {
    if (!isSupabaseConfigured) return true;
    return callRpc('update_wht_voucher_transaction', {
      p_sale_id: saleId,
      p_voucher_number: voucherNumber || '',
      p_voucher_status: voucherStatus || 'pending'
    });
  },

  /**
   * Super Admin approval & status change: Calls secure server RPC to approve, activate, or suspend shop
   */
  async updateShopStatus(shopId, status) {
    if (!isSupabaseConfigured) return true;
    if (!shopId || !isValidUUID(shopId)) return true;
    return await callRpc('admin_set_shop_status', { target_shop_id: shopId, p_status: status });
  },

  /**
   * Super Admin approval service (P1 & P2): Calls the secure backend Edge Function endpoint
   * using an authenticated administrator session JWT. The administrator's user.id is permanently
   * recorded in the database audit log.
   */
  async approveShopViaAdminService(shopId, adminToken) {
    if (!isSupabaseConfigured) return { success: true, shop_id: shopId, status: 'active' };

    if (!adminToken) {
      throw new Error('Administrator session token is required to approve branches.');
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/approve-shop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ shop_id: shopId })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Admin approval failed with status ${res.status}`);
    }

    return res.json();
  }
};
