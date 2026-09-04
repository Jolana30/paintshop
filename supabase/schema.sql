-- Clean Reset & Creation Script for Jotun Paintshop
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 1. Products Table
CREATE TABLE products (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    size TEXT NOT NULL,
    price_before_vat NUMERIC(10, 2) NOT NULL,
    price_with_vat NUMERIC(10, 2) NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sales Table
CREATE TABLE sales (
    id TEXT PRIMARY KEY,
    customer TEXT NOT NULL DEFAULT 'Cash Walk-in',
    total NUMERIC(12, 2) NOT NULL,
    total_items INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Sale Items Table
CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id TEXT REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id),
    product_name TEXT NOT NULL,
    code TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    price_before_vat NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Stock Movements Audit Table
CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    product_name TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Open Access RLS Policies for Store App
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_sales" ON sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_sale_items" ON sale_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_stock_movements" ON stock_movements FOR ALL USING (true) WITH CHECK (true);

-- 6. Seed All 46 Official Jotun Paint Products
INSERT INTO products (id, code, name, category, size, price_before_vat, price_with_vat, stock, min_stock) VALUES
('prod-1', '6URMAWCSA', 'FENOMASTIC MYHM RCH MT(IM)BS A', 'Interior', '2.7L', 4393.50, 5052.53, 24, 6),
('prod-2', '6URMAWPQA', 'FENOMASTIC MYHM RCH MT(IM)BS A', 'Interior', '13.5L', 17170.00, 19745.50, 14, 4),
('prod-3', '6URMBSCSA', 'FENOMASTIC MYHM RCH MT(IM)BS B', 'Interior', '2.7L', 4040.00, 4646.00, 18, 5),
('prod-4', '6URMBSPQA', 'FENOMASTIC MYHM RCH MT(IM)BS B', 'Interior', '13.5L', 14948.00, 17190.20, 9, 3),
('prod-5', '6URMCNCSA', 'FENOMASTIC MYHM RCH MT(IM)BS C', 'Interior', '2.7L', 4040.00, 4646.00, 15, 5),
('prod-6', '6URMCNPQA', 'FENOMASTIC MYHM RCH MT(IM)BS C', 'Interior', '13.5L', 14948.00, 17190.20, 8, 3),
('prod-7', '6UR001DVA', 'FENOMASTIC MYHM RCH MT(IM)WHITE', 'Interior', '3L', 4545.00, 5226.75, 22, 6),
('prod-8', '6UR001RVA', 'FENOMASTIC MYHM RCH MT(IM)WHITE', 'Interior', '15L', 17927.50, 20616.63, 16, 4),
('prod-9', '1VVMAWCSA', 'FENOMASTIC PURE CL EMU MT BS A', 'Interior', '2.7L', 2272.50, 2613.38, 25, 6),
('prod-10', '1VVMAWPQA', 'FENOMASTIC PURE CL EMU MT BS A', 'Interior', '13.5L', 10605.00, 12195.75, 12, 4),
('prod-11', '1VVMBSCSA', 'FENOMASTIC PURE CL EMU MT BS B', 'Interior', '2.7L', 2121.00, 2439.15, 19, 5),
('prod-12', '1VVMBSPQA', 'FENOMASTIC PURE CL EMU MT BS B', 'Interior', '13.5L', 9898.00, 11382.70, 11, 3),
('prod-13', '1VVMCNCSA', 'FENOMASTIC PURE CL EMU MT BS C', 'Interior', '2.7L', 2020.00, 2323.00, 16, 5),
('prod-14', '1VVMCNPQA', 'FENOMASTIC PURE CL EMU MT BS C', 'Interior', '13.5L', 8787.00, 10105.05, 7, 3),
('prod-15', '1VV001DVA', 'FENOMASTIC PURE CL EMU MT WHITE', 'Interior', '3L', 2424.00, 2787.60, 28, 8),
('prod-16', '1VV001RVA', 'FENOMASTIC PURE CL EMU MT WHITE', 'Interior', '15L', 11009.00, 12660.35, 18, 5),
('prod-17', '6N2MAWKVA', 'FENOMASTIC WONDERWALL LUX BS A', 'Interior', '9L', 14140.00, 16261.00, 10, 4),
('prod-18', '6N2MAWCSA', 'FENOMASTIC WONDERWALL LUX BS A', 'Interior', '2.7L', 5151.00, 5923.65, 15, 5),
('prod-19', '6N2MBSKVA', 'FENOMASTIC WONDERWALL LUX BS B', 'Interior', '9L', 13231.00, 15215.65, 8, 3),
('prod-20', '6N2MBSCSA', 'FENOMASTIC WONDERWALL LUX BS B', 'Interior', '2.7L', 4848.00, 5575.20, 14, 4),
('prod-21', '6N2MCNKVA', 'FENOMASTIC WONDERWALL LUX BS C', 'Interior', '9L', 12625.00, 14518.75, 6, 3),
('prod-22', '6N2MCNCSA', 'FENOMASTIC WONDERWALL LUX BS C', 'Interior', '2.7L', 4646.00, 5342.90, 12, 4),
('prod-23', '6N2001DVA', 'FENOMASTIC WONDERWALL LUX WHT', 'Interior', '3L', 5353.00, 6155.95, 20, 6),
('prod-24', '6N2001LVA', 'FENOMASTIC WONDERWALL LUX WHT', 'Interior', '10L', 14847.00, 17074.05, 9, 3),
('prod-25', '1EK001RVA', 'JOTASHIELD ALKALI RES PRIMER', 'Exterior', '15L', 7676.00, 8827.40, 14, 5),
('prod-26', '6TJMAWCSA', 'JOTASHIELD ETERNA BASE A', 'Exterior', '2.7L', 3737.00, 4297.55, 17, 5),
('prod-27', '6TJMAWPQA', 'JOTASHIELD ETERNA BASE A', 'Exterior', '13.5L', 17170.00, 19745.50, 8, 3),
('prod-28', '6TJMBSCSA', 'JOTASHIELD ETERNA BASE B', 'Exterior', '2.7L', 3535.00, 4065.25, 13, 4),
('prod-29', '6TJMBSPQA', 'JOTASHIELD ETERNA BASE B', 'Exterior', '13.5L', 15857.00, 18235.55, 6, 3),
('prod-30', '6TJMCNCSA', 'JOTASHIELD ETERNA BASE C', 'Exterior', '2.7L', 3232.00, 3716.80, 15, 4),
('prod-31', '6TJMCNPQA', 'JOTASHIELD ETERNA BASE C', 'Exterior', '13.5L', 14645.00, 16841.75, 5, 3),
('prod-32', '6TJ001DVA', 'JOTASHIELD ETERNA WHITE', 'Exterior', '3L', 3737.00, 4297.55, 21, 6),
('prod-33', '6TJ001RVA', 'JOTASHIELD ETERNA WHITE', 'Exterior', '15L', 17675.00, 20326.25, 12, 4),
('prod-34', '6Q8MBSKVA', 'JOTASHIELD KANVA BASE B', 'Exterior', '9L', 8585.00, 9872.75, 9, 3),
('prod-35', '6Q8MCNKVA', 'JOTASHIELD KANVA BASE C', 'Exterior', '9L', 7575.00, 8711.25, 7, 3),
('prod-36', '6Q8001LVA', 'JOTASHIELD KANVA WHITE', 'Exterior', '10L', 9090.00, 10453.50, 11, 4),
('prod-37', '1E6MBSCSA', 'JOTASHIELD TEX MEDIUM BASE B', 'Exterior', '2.7L', 4141.00, 4762.15, 14, 4),
('prod-38', '1E6MBSPQA', 'JOTASHIELD TEX MEDIUM BASE B', 'Exterior', '13.5L', 15150.00, 17422.50, 8, 3),
('prod-39', '1E6MCNCSA', 'JOTASHIELD TEX MEDIUM BASE C', 'Exterior', '2.7L', 3434.00, 3949.10, 12, 4),
('prod-40', '1E6MCNPQA', 'JOTASHIELD TEX MEDIUM BASE C', 'Exterior', '13.5L', 14342.00, 16493.30, 6, 3),
('prod-41', '1E6001DVA', 'JOTASHIELD TEX MEDIUM WHITE', 'Exterior', '3L', 4343.00, 4994.45, 16, 5),
('prod-42', '1E6001RVA', 'JOTASHIELD TEX MEDIUM WHITE', 'Exterior', '15L', 16160.00, 18584.00, 10, 3),
('prod-43', '1AR001DVA', 'PVA PRIMER', 'Primers & Putty', '3L', 1313.00, 1509.95, 4, 8),
('prod-44', '1AR001RVA', 'PVA PRIMER', 'Primers & Putty', '15L', 4747.00, 5459.05, 18, 5),
('prod-45', '1AJ001RVA', 'STUCCO PUTTY', 'Primers & Putty', '15L', 5858.00, 6736.70, 35, 10),
('prod-46', '1AU001RVA', 'TEXO COMPOUND WHITE', 'Primers & Putty', '15L', 9292.00, 10685.80, 15, 5)
ON CONFLICT (id) DO UPDATE SET 
    code = EXCLUDED.code,
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    size = EXCLUDED.size,
    price_before_vat = EXCLUDED.price_before_vat,
    price_with_vat = EXCLUDED.price_with_vat,
    min_stock = EXCLUDED.min_stock;

-- 7. Atomic Sales Processing RPC
CREATE OR REPLACE FUNCTION process_sale_transaction(
    p_sale_id TEXT,
    p_customer TEXT,
    p_items JSONB,
    p_total NUMERIC,
    p_total_items INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_prod_id TEXT;
    v_qty INTEGER;
    v_current_stock INTEGER;
    v_new_stock INTEGER;
BEGIN
    -- 1. Insert master sale record
    INSERT INTO sales (id, customer, total, total_items, created_at)
    VALUES (p_sale_id, p_customer, p_total, p_total_items, NOW());

    -- 2. Process each purchased line item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := v_item->>'productId';
        v_qty := (v_item->>'quantity')::INTEGER;

        -- Get current stock
        SELECT stock INTO v_current_stock FROM products WHERE id = v_prod_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found', v_prod_id;
        END IF;

        v_new_stock := v_current_stock - v_qty;

        -- Deduct stock
        UPDATE products 
        SET stock = v_new_stock, updated_at = NOW() 
        WHERE id = v_prod_id;

        -- Insert line item
        INSERT INTO sale_items (
            sale_id, product_id, product_name, code, size,
            quantity, unit_price, price_before_vat, subtotal, created_at
        ) VALUES (
            p_sale_id,
            v_prod_id,
            v_item->>'productName',
            v_item->>'code',
            v_item->>'size',
            v_qty,
            (v_item->>'unitPrice')::NUMERIC,
            COALESCE((v_item->>'priceBeforeVat')::NUMERIC, 0),
            (v_item->>'subtotal')::NUMERIC,
            NOW()
        );

        -- Audit movement log
        INSERT INTO stock_movements (
            id, product_id, product_name, type, quantity,
            previous_stock, new_stock, reference, created_at
        ) VALUES (
            'MOV-' || floor(extract(epoch from clock_timestamp()) * 1000)::TEXT || '-' || v_prod_id,
            v_prod_id,
            v_item->>'productName',
            'SALE',
            -v_qty,
            v_current_stock,
            v_new_stock,
            p_sale_id,
            NOW()
        );
    END LOOP;

    RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id);
END;
$$;
