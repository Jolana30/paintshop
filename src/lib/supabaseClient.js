/**
 * Supabase Client & Connection Manager
 * Connects directly to Supabase PostgreSQL via environment variables.
 * Provides resilient CRUD, batch inserts, and offline resilience.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * Lightweight REST Client for Supabase PostgREST (Zero external heavy SDK dependency)
 */
export async function fetchFromSupabase(endpoint, options = {}) {
  if (!isSupabaseConfigured) return null;

  const cleanBase = SUPABASE_URL.replace(/\/+$/, '');
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  const url = `${cleanBase}/rest/v1/${cleanEndpoint}`;

  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...options.headers
  };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[Supabase API Error ${response.status}]`, errText);
      return null;
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) return true;
    return JSON.parse(text);
  } catch (err) {
    console.error('[Supabase Network Failure]', err);
    return null;
  }
}

export const supabaseApi = {
  /**
   * Fetch all 46 Jotun products ordered by code
   */
  async getProducts() {
    return fetchFromSupabase('products?select=*&order=code.asc');
  },

  /**
   * Fetch sales history with joined line items
   */
  async getSales() {
    return fetchFromSupabase('sales?select=*,sale_items(*)&order=created_at.desc');
  },

  /**
   * Fetch stock movements audit trail
   */
  async getMovements() {
    return fetchFromSupabase('stock_movements?select=*&order=created_at.desc');
  },

  /**
   * Update product stock directly in Supabase
   */
  async updateProductStock(productId, newStock) {
    return fetchFromSupabase(`products?id=eq.${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        stock: newStock,
        updated_at: new Date().toISOString()
      })
    });
  },

  /**
   * Complete Sale Transaction:
   * 1. Inserts record into `sales`
   * 2. Batch inserts line items into `sale_items`
   * 3. Batch inserts audit logs into `stock_movements`
   * 4. Updates remaining stock on all purchased products
   */
  async recordSale({ sale, items, movements, productUpdates }) {
    if (!isSupabaseConfigured) return false;

    try {
      // 1. Insert master sale record
      const saleRow = {
        id: sale.id,
        customer: sale.customer || 'Cash Walk-in',
        total: sale.total,
        total_items: sale.totalItems,
        created_at: sale.timestamp || new Date().toISOString()
      };

      await fetchFromSupabase('sales', {
        method: 'POST',
        body: JSON.stringify(saleRow)
      });

      // 2. Batch insert sale items
      if (items && items.length > 0) {
        const itemRows = items.map(item => ({
          sale_id: sale.id,
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

      // 3. Batch insert stock movements audit trail
      if (movements && movements.length > 0) {
        const movRows = movements.map(m => ({
          id: m.id,
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

      // 4. Update each product's stock count
      if (productUpdates && productUpdates.length > 0) {
        await Promise.all(
          productUpdates.map(u =>
            this.updateProductStock(u.id, u.stock)
          )
        );
      }

      return true;
    } catch (err) {
      console.error('[Supabase recordSale error]', err);
      return false;
    }
  },

  /**
   * Receive Inventory (Stock In):
   * 1. Updates product current stock
   * 2. Logs audit trail movement
   */
  async recordStockIn({ movement, productId, newStock }) {
    if (!isSupabaseConfigured) return false;

    try {
      // 1. Update product stock
      const prodRes = await this.updateProductStock(productId, newStock);

      // 2. Record stock movement
      const movRes = await fetchFromSupabase('stock_movements', {
        method: 'POST',
        body: JSON.stringify({
          id: movement.id,
          product_id: movement.productId,
          product_name: movement.productName,
          type: 'STOCK_IN',
          quantity: movement.quantity,
          previous_stock: movement.previousStock,
          new_stock: movement.newStock,
          reference: movement.reference || 'Supplier Stock Receipt',
          created_at: movement.timestamp || new Date().toISOString()
        })
      });

      return Boolean(prodRes && movRes);
    } catch (err) {
      console.error('[Supabase recordStockIn error]', err);
      return false;
    }
  },

  /**
   * Physical Count Stock Adjustment:
   * 1. Updates product stock to counted quantity
   * 2. Logs audit trail movement with adjustment reason
   */
  async recordStockAdjustment({ movement, productId, newStock }) {
    if (!isSupabaseConfigured) return false;

    try {
      // 1. Update product stock
      const prodRes = await this.updateProductStock(productId, newStock);

      // 2. Record stock movement
      const movRes = await fetchFromSupabase('stock_movements', {
        method: 'POST',
        body: JSON.stringify({
          id: movement.id,
          product_id: movement.productId,
          product_name: movement.productName,
          type: 'ADJUSTMENT',
          quantity: movement.quantity,
          previous_stock: movement.previousStock,
          new_stock: movement.newStock,
          reference: movement.reference || 'Physical Stock Count',
          created_at: movement.timestamp || new Date().toISOString()
        })
      });

      return Boolean(prodRes && movRes);
    } catch (err) {
      console.error('[Supabase recordStockAdjustment error]', err);
      return false;
    }
  }
};
