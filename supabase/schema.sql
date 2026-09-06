-- PaintFlow - Multi-Shop SaaS Architecture for Jotun Paint Retailers
-- Supports: Multi-Shop Isolation, Master Jotun Catalog + Custom Shop Inventory, 3% Withholding Tax (WHT)

DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS shop_inventory CASCADE;
DROP TABLE IF EXISTS master_products CASCADE;
DROP TABLE IF EXISTS shops CASCADE;

-- 1. Shops (Tenants) Table
CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_name TEXT,
    phone TEXT NOT NULL,
    city_address TEXT NOT NULL,
    tin_number TEXT,
    email TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Master Jotun Products Table (Official 46 paints, standardized pricing)
CREATE TABLE master_products (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    size TEXT NOT NULL,
    price_before_vat NUMERIC(10, 2) NOT NULL,
    price_with_vat NUMERIC(10, 2) NOT NULL,
    min_stock INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Shop Inventory Table (Per-Shop Stock & Custom Local Items like Brushes/Putty)
CREATE TABLE shop_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    master_product_id TEXT REFERENCES master_products(id) ON DELETE CASCADE,
    is_custom BOOLEAN NOT NULL DEFAULT FALSE,
    custom_name TEXT,
    custom_category TEXT,
    custom_size TEXT,
    custom_code TEXT,
    custom_price_before_vat NUMERIC(10, 2),
    custom_price_with_vat NUMERIC(10, 2),
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_shop_master_product UNIQUE (shop_id, master_product_id)
);

-- 4. Sales Table (With Ethiopian 3% Withholding Tax Compliance)
CREATE TABLE sales (
    id TEXT PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer TEXT NOT NULL DEFAULT 'Cash Walk-in',
    customer_tin TEXT,
    payment_type TEXT NOT NULL DEFAULT 'Cash',
    total NUMERIC(12, 2) NOT NULL,
    total_items INTEGER NOT NULL DEFAULT 1,
    is_withholding BOOLEAN NOT NULL DEFAULT FALSE,
    withholding_rate NUMERIC(5, 2) NOT NULL DEFAULT 3.00,
    withholding_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    net_payable NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    wht_voucher_number TEXT,
    wht_voucher_status TEXT DEFAULT 'pending' CHECK (wht_voucher_status IN ('received', 'pending', 'not_applicable')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Sale Items Table
CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    code TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    price_before_vat NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Stock Movements Audit Table
CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'SALE', 'STOCK_IN', 'ADJUSTMENT'
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Row Level Security (RLS) Policies
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_master_products" ON master_products FOR SELECT USING (true);
CREATE POLICY "shop_isolation_profile" ON shops FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "shop_isolation_inventory" ON shop_inventory FOR ALL USING (shop_id = auth.uid()) WITH CHECK (shop_id = auth.uid());
CREATE POLICY "shop_isolation_sales" ON sales FOR ALL USING (shop_id = auth.uid()) WITH CHECK (shop_id = auth.uid());
CREATE POLICY "shop_isolation_sale_items" ON sale_items FOR ALL USING (shop_id = auth.uid()) WITH CHECK (shop_id = auth.uid());
CREATE POLICY "shop_isolation_stock_movements" ON stock_movements FOR ALL USING (shop_id = auth.uid()) WITH CHECK (shop_id = auth.uid());

-- 8. Seed All 46 Official Jotun Paint Products into master_products
INSERT INTO master_products (id, code, name, category, size, price_before_vat, price_with_vat, min_stock) VALUES
('prod-1', '6URMAWCSA', 'FENOMASTIC MYHM RCH MT(IM)BS A', 'Interior', '2.7L', 4393.50, 5052.53, 6),
('prod-2', '6URMAWPQA', 'FENOMASTIC MYHM RCH MT(IM)BS A', 'Interior', '13.5L', 17170.00, 19745.50, 4),
('prod-3', '6URMBSCSA', 'FENOMASTIC MYHM RCH MT(IM)BS B', 'Interior', '2.7L', 4040.00, 4646.00, 5),
('prod-4', '6URMBSPQA', 'FENOMASTIC MYHM RCH MT(IM)BS B', 'Interior', '13.5L', 14948.00, 17190.20, 3),
('prod-5', '6URMCNCSA', 'FENOMASTIC MYHM RCH MT(IM)BS C', 'Interior', '2.7L', 4040.00, 4646.00, 5),
('prod-6', '6URMCNPQA', 'FENOMASTIC MYHM RCH MT(IM)BS C', 'Interior', '13.5L', 14948.00, 17190.20, 3),
('prod-7', '6UR001DVA', 'FENOMASTIC MYHM RCH MT(IM)WHITE', 'Interior', '3L', 4545.00, 5226.75, 6),
('prod-8', '6UR001RVA', 'FENOMASTIC MYHM RCH MT(IM)WHITE', 'Interior', '15L', 17927.50, 20616.63, 4),
('prod-9', '1VVMAWCSA', 'FENOMASTIC PURE CL EMU MT BS A', 'Interior', '2.7L', 2272.50, 2613.38, 6),
('prod-10', '1VVMAWPQA', 'FENOMASTIC PURE CL EMU MT BS A', 'Interior', '13.5L', 10605.00, 12195.75, 4),
('prod-11', '1VVMBSCSA', 'FENOMASTIC PURE CL EMU MT BS B', 'Interior', '2.7L', 2121.00, 2439.15, 5),
('prod-12', '1VVMBSPQA', 'FENOMASTIC PURE CL EMU MT BS B', 'Interior', '13.5L', 9898.00, 11382.70, 3),
('prod-13', '1VVMCNCSA', 'FENOMASTIC PURE CL EMU MT BS C', 'Interior', '2.7L', 2020.00, 2323.00, 5),
('prod-14', '1VVMCNPQA', 'FENOMASTIC PURE CL EMU MT BS C', 'Interior', '13.5L', 8787.00, 10105.05, 3),
('prod-15', '1VV001DVA', 'FENOMASTIC PURE CL EMU MT WHITE', 'Interior', '3L', 2424.00, 2787.60, 8),
('prod-16', '1VV001RVA', 'FENOMASTIC PURE CL EMU MT WHITE', 'Interior', '15L', 11009.00, 12660.35, 5),
('prod-17', '6N2MAWKVA', 'FENOMASTIC WONDERWALL LUX BS A', 'Interior', '9L', 14140.00, 16261.00, 4),
('prod-18', '6N2MAWCSA', 'FENOMASTIC WONDERWALL LUX BS A', 'Interior', '2.7L', 5151.00, 5923.65, 5),
('prod-19', '6N2MBSKVA', 'FENOMASTIC WONDERWALL LUX BS B', 'Interior', '9L', 13231.00, 15215.65, 3),
('prod-20', '6N2MBSCSA', 'FENOMASTIC WONDERWALL LUX BS B', 'Interior', '2.7L', 4848.00, 5575.20, 4),
('prod-21', '6N2MCNKVA', 'FENOMASTIC WONDERWALL LUX BS C', 'Interior', '9L', 12625.00, 14518.75, 3),
('prod-22', '6N2MCNCSA', 'FENOMASTIC WONDERWALL LUX BS C', 'Interior', '2.7L', 4646.00, 5342.90, 4),
('prod-23', '6N2001DVA', 'FENOMASTIC WONDERWALL LUX WHT', 'Interior', '3L', 5353.00, 6155.95, 6),
('prod-24', '6N2001LVA', 'FENOMASTIC WONDERWALL LUX WHT', 'Interior', '10L', 14847.00, 17074.05, 3),
('prod-25', '1EK001RVA', 'JOTASHIELD ALKALI RES PRIMER', 'Exterior', '15L', 7676.00, 8827.40, 5),
('prod-26', '6TJMAWCSA', 'JOTASHIELD ETERNA BASE A', 'Exterior', '2.7L', 3737.00, 4297.55, 5),
('prod-27', '6TJMAWPQA', 'JOTASHIELD ETERNA BASE A', 'Exterior', '13.5L', 17170.00, 19745.50, 3),
('prod-28', '6TJMBSCSA', 'JOTASHIELD ETERNA BASE B', 'Exterior', '2.7L', 3535.00, 4065.25, 4),
('prod-29', '6TJMBSPQA', 'JOTASHIELD ETERNA BASE B', 'Exterior', '13.5L', 15857.00, 18235.55, 3),
('prod-30', '6TJMCNCSA', 'JOTASHIELD ETERNA BASE C', 'Exterior', '2.7L', 3232.00, 3716.80, 4),
('prod-31', '6TJMCNPQA', 'JOTASHIELD ETERNA BASE C', 'Exterior', '13.5L', 14645.00, 16841.75, 3),
('prod-32', '6TJ001DVA', 'JOTASHIELD ETERNA WHITE', 'Exterior', '3L', 3737.00, 4297.55, 6),
('prod-33', '6TJ001RVA', 'JOTASHIELD ETERNA WHITE', 'Exterior', '15L', 17675.00, 20326.25, 4),
('prod-34', '6Q8MBSKVA', 'JOTASHIELD KANVA BASE B', 'Exterior', '9L', 8585.00, 9872.75, 3),
('prod-35', '6Q8MCNKVA', 'JOTASHIELD KANVA BASE C', 'Exterior', '9L', 7575.00, 8711.25, 3),
('prod-36', '6Q8001LVA', 'JOTASHIELD KANVA WHITE', 'Exterior', '10L', 9090.00, 10453.50, 4),
('prod-37', '1E6MBSCSA', 'JOTASHIELD TEX MEDIUM BASE B', 'Exterior', '2.7L', 4141.00, 4762.15, 4),
('prod-38', '1E6MBSPQA', 'JOTASHIELD TEX MEDIUM BASE B', 'Exterior', '13.5L', 15150.00, 17422.50, 3),
('prod-39', '1E6MCNCSA', 'JOTASHIELD TEX MEDIUM BASE C', 'Exterior', '2.7L', 3434.00, 3949.10, 4),
('prod-40', '1E6MCNPQA', 'JOTASHIELD TEX MEDIUM BASE C', 'Exterior', '13.5L', 14342.00, 16493.30, 3),
('prod-41', '1E6001DVA', 'JOTASHIELD TEX MEDIUM WHITE', 'Exterior', '3L', 4343.00, 4994.45, 5),
('prod-42', '1E6001RVA', 'JOTASHIELD TEX MEDIUM WHITE', 'Exterior', '15L', 16160.00, 18584.00, 3),
('prod-43', '1AR001DVA', 'PVA PRIMER', 'Primers & Putty', '3L', 1313.00, 1509.95, 8),
('prod-44', '1AR001RVA', 'PVA PRIMER', 'Primers & Putty', '15L', 4747.00, 5459.05, 5),
('prod-45', '1AJ001RVA', 'STUCCO PUTTY', 'Primers & Putty', '15L', 5858.00, 6736.70, 10),
('prod-46', '1AU001RVA', 'TEXO COMPOUND WHITE', 'Primers & Putty', '15L', 9292.00, 10685.80, 5)
ON CONFLICT (id) DO UPDATE SET 
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    size = EXCLUDED.size,
    price_before_vat = EXCLUDED.price_before_vat,
    price_with_vat = EXCLUDED.price_with_vat,
    min_stock = EXCLUDED.min_stock;

-- 9. Automatic Shop Provisioning Trigger
CREATE OR REPLACE FUNCTION handle_new_shop_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO shop_inventory (shop_id, master_product_id, is_custom, stock, min_stock)
    SELECT 
        NEW.id,
        mp.id,
        FALSE,
        0,
        mp.min_stock
    FROM master_products mp
    ON CONFLICT (shop_id, master_product_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shop_created ON shops;
CREATE TRIGGER on_shop_created
    AFTER INSERT ON shops
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_shop_signup();
