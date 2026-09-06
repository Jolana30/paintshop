-- ==============================================================================
-- PaintFlow - Multi-Shop SaaS Architecture for Jotun Paint Retailers
-- Supports: Multi-Shop Isolation, Master Jotun Catalog + Custom Shop Inventory,
--           3% Withholding Tax (WHT), Strict RLS & Atomic Transactional RPCs
-- ==============================================================================

-- 1. Clean Slate (if rebuilding schema)
DROP TRIGGER IF EXISTS on_shop_created ON shops;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_shop_signup() CASCADE;
DROP FUNCTION IF EXISTS handle_auth_user_created() CASCADE;
DROP FUNCTION IF EXISTS is_active_shop() CASCADE;
DROP FUNCTION IF EXISTS record_sale_transaction(jsonb, jsonb) CASCADE;
DROP FUNCTION IF EXISTS record_stock_in_transaction(text, integer, text) CASCADE;
DROP FUNCTION IF EXISTS adjust_stock_transaction(text, integer, text) CASCADE;
DROP FUNCTION IF EXISTS admin_approve_shop(uuid) CASCADE;

DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS shop_inventory CASCADE;
DROP TABLE IF EXISTS master_products CASCADE;
DROP TABLE IF EXISTS shops CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 2. Shops (Tenants) Table
CREATE TABLE shops (
    id UUID PRIMARY KEY, -- Maps directly to auth.users.id
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

-- 3. Master Jotun Products Table (Standard Official Catalog)
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

-- 4. Shop Inventory Table (Per-Shop Stock & Custom Local Items like Brushes/Putty)
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
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    min_stock INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_shop_master_product UNIQUE (shop_id, master_product_id)
);

-- 5. Sales Table (With Ethiopian 3% Withholding Tax Compliance)
CREATE TABLE sales (
    id TEXT PRIMARY KEY, -- Uses standard UUID or SALE-UUID
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

-- 6. Sale Items Table
CREATE TABLE sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    code TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL,
    price_before_vat NUMERIC(10, 2) NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Stock Movements Audit Table
CREATE TABLE stock_movements (
    id TEXT PRIMARY KEY,
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('SALE', 'STOCK_IN', 'ADJUSTMENT')),
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Shop Approval Audit Trail (S-01)
CREATE TABLE shop_approval_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    approver_id UUID,
    approver_role TEXT,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 9. Row Level Security (RLS) & Helper Functions
-- ==============================================================================

ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE shop_approval_audit ENABLE ROW LEVEL SECURITY;

-- Helper to check if current authenticated session belongs to an active, approved shop (S-04)
CREATE OR REPLACE FUNCTION is_active_shop()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM shops
        WHERE id = auth.uid()
          AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- Master catalog: readable by all authenticated users & anon
CREATE POLICY "read_master_products" ON master_products
    FOR SELECT USING (true);

-- Shops Table Policies:
-- Critical P0 Fix: Explicitly remove legacy permissive shop policies that allowed self-approval
DROP POLICY IF EXISTS "shop_isolation_profile" ON shops;
DROP POLICY IF EXISTS "shop_profile_isolation" ON shops;
DROP POLICY IF EXISTS "shops_can_read_own_profile" ON shops;
DROP POLICY IF EXISTS "shops_can_update_own_contact_details" ON shops;

CREATE POLICY "shops_can_read_own_profile" ON shops
    FOR SELECT TO authenticated
    USING (id = auth.uid());

CREATE POLICY "shops_can_update_own_contact_details" ON shops
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND status = (SELECT s.status FROM shops s WHERE s.id = auth.uid())
    );

CREATE POLICY "approval_audit_admin_only" ON shop_approval_audit
    FOR SELECT TO authenticated
    USING (COALESCE((auth.jwt()->'app_metadata'->>'is_admin')::BOOLEAN, FALSE) = TRUE);

-- S-02: Tenant Data Tables are Strictly SELECT-Only; mutations must use RPCs
CREATE POLICY "shop_active_inventory_select" ON shop_inventory
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

CREATE POLICY "shop_active_sales_select" ON sales
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

CREATE POLICY "shop_active_sale_items_select" ON sale_items
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

CREATE POLICY "shop_active_stock_movements_select" ON stock_movements
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

-- ==============================================================================
-- 9. Automatic Provisioning Triggers
-- ==============================================================================

-- Trigger 1: When a new auth.users record is created in Supabase Auth,
-- automatically create a pending public.shops record using the registration metadata.
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.shops (
        id,
        name,
        owner_name,
        phone,
        city_address,
        tin_number,
        email,
        status
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'shop_name', 'Paint Store Branch'),
        COALESCE(NEW.raw_user_meta_data->>'owner_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        COALESCE(NEW.raw_user_meta_data->>'city_address', ''),
        NULLIF(NEW.raw_user_meta_data->>'tin_number', ''),
        NEW.email,
        'pending_approval'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_auth_user_created();

-- Trigger 2: When a new shop is created in public.shops,
-- seed its inventory table with all 46 official Jotun paints at 0 initial stock.
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_shop_created ON shops;
CREATE TRIGGER on_shop_created
    AFTER INSERT ON shops
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_shop_signup();

-- ==============================================================================
-- 10. Atomic Transactional RPC Functions
-- ==============================================================================

-- RPC 1: Record Sale Transaction (S-03 & S-04)
-- Authoritative calculation of unit prices, subtotals, 3% WHT, and net payable.
-- Rejects empty carts and locks inventory rows (FOR UPDATE).
CREATE OR REPLACE FUNCTION record_sale_transaction(
    p_sale JSONB,
    p_items JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_sale_id TEXT;
    v_item RECORD;
    v_inv RECORD;
    v_qty INT;
    v_prod_id TEXT;
    v_auth_pbv NUMERIC(10, 2);
    v_auth_pwv NUMERIC(10, 2);
    v_auth_name TEXT;
    v_auth_code TEXT;
    v_auth_size TEXT;
    v_line_subtotal NUMERIC(12, 2);
    v_calculated_gross NUMERIC(12, 2) := 0.00;
    v_calculated_items INT := 0;
    v_is_wht BOOLEAN;
    v_wht_rate NUMERIC(5, 2);
    v_wht_amount NUMERIC(12, 2);
    v_net_payable NUMERIC(12, 2);
    v_wht_voucher_status TEXT;
    v_prev_stock INT;
    v_new_stock INT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_shop_id := auth.uid();
    IF v_shop_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    IF NOT is_active_shop() THEN
        RAISE EXCEPTION 'Unauthorized: Shop account is not active or is pending approval';
    END IF;

    -- S-03: Reject empty carts
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot record sale: at least 1 line item is required';
    END IF;

    v_sale_id := p_sale->>'id';
    IF v_sale_id IS NULL OR v_sale_id = '' THEN
        v_sale_id := 'SALE-' || gen_random_uuid()::TEXT;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id TEXT,
        quantity INT
    )
    LOOP
        v_prod_id := v_item.product_id;
        v_qty := v_item.quantity;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity % for item %', v_qty, v_prod_id;
        END IF;

        -- Lock inventory row for update
        SELECT * INTO v_inv
        FROM shop_inventory
        WHERE shop_id = v_shop_id
          AND (master_product_id = v_prod_id OR id::TEXT = v_prod_id OR custom_code = v_prod_id)
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Product % not found in shop inventory', v_prod_id;
        END IF;

        IF v_inv.stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for product % (Available: %, Requested: %)', 
                v_prod_id, v_inv.stock, v_qty;
        END IF;

        -- S-03: Derive authoritative price from database
        IF v_inv.master_product_id IS NOT NULL THEN
            SELECT price_before_vat, price_with_vat, name, code, size
            INTO v_auth_pbv, v_auth_pwv, v_auth_name, v_auth_code, v_auth_size
            FROM master_products
            WHERE id = v_inv.master_product_id;
        ELSE
            v_auth_pbv := COALESCE(v_inv.custom_price_before_vat, 0.00);
            v_auth_pwv := v_inv.custom_price_with_vat;
            v_auth_name := v_inv.custom_name;
            v_auth_code := v_inv.custom_code;
            v_auth_size := v_inv.custom_size;
        END IF;

        IF v_auth_pwv IS NULL OR v_auth_pwv <= 0 THEN
            RAISE EXCEPTION 'Authoritative price not found for product %', v_prod_id;
        END IF;

        v_line_subtotal := ROUND(v_qty * v_auth_pwv, 2);
        v_calculated_gross := v_calculated_gross + v_line_subtotal;
        v_calculated_items := v_calculated_items + v_qty;

        v_prev_stock := v_inv.stock;
        v_new_stock := v_inv.stock - v_qty;

        UPDATE shop_inventory
        SET stock = v_new_stock,
            updated_at = v_now
        WHERE id = v_inv.id;

        INSERT INTO sale_items (
            sale_id,
            shop_id,
            product_id,
            product_name,
            code,
            size,
            quantity,
            unit_price,
            price_before_vat,
            subtotal,
            created_at
        ) VALUES (
            v_sale_id,
            v_shop_id,
            v_prod_id,
            v_auth_name,
            v_auth_code,
            v_auth_size,
            v_qty,
            v_auth_pwv,
            v_auth_pbv,
            v_line_subtotal,
            v_now
        );

        INSERT INTO stock_movements (
            id,
            shop_id,
            product_id,
            product_name,
            type,
            quantity,
            previous_stock,
            new_stock,
            reference,
            created_at
        ) VALUES (
            'MOV-' || gen_random_uuid()::TEXT,
            v_shop_id,
            v_prod_id,
            v_auth_name,
            'SALE',
            -v_qty,
            v_prev_stock,
            v_new_stock,
            v_sale_id,
            v_now
        );
    END LOOP;

    v_is_wht := COALESCE((p_sale->>'is_withholding')::BOOLEAN, FALSE);
    IF v_is_wht THEN
        IF v_calculated_gross < 20000.00 THEN
            RAISE EXCEPTION 'Withholding tax (3%%) requires a minimum transaction value of 20,000 ETB. Current gross total is % ETB', v_calculated_gross;
        END IF;
        v_wht_rate := 3.00;
        v_wht_amount := ROUND(v_calculated_gross * 0.03, 2);
        v_net_payable := v_calculated_gross - v_wht_amount;
        v_wht_voucher_status := COALESCE(p_sale->>'wht_voucher_status', 'pending');
    ELSE
        v_wht_rate := 0.00;
        v_wht_amount := 0.00;
        v_net_payable := v_calculated_gross;
        v_wht_voucher_status := 'not_applicable';
    END IF;

    INSERT INTO sales (
        id,
        shop_id,
        customer,
        customer_tin,
        payment_type,
        total,
        total_items,
        is_withholding,
        withholding_rate,
        withholding_amount,
        net_payable,
        wht_voucher_number,
        wht_voucher_status,
        created_at
    ) VALUES (
        v_sale_id,
        v_shop_id,
        COALESCE(p_sale->>'customer', 'Cash Walk-in'),
        NULLIF(p_sale->>'customer_tin', ''),
        COALESCE(p_sale->>'payment_type', 'Cash'),
        v_calculated_gross,
        v_calculated_items,
        v_is_wht,
        v_wht_rate,
        v_wht_amount,
        v_net_payable,
        NULLIF(p_sale->>'wht_voucher_number', ''),
        v_wht_voucher_status,
        COALESCE((p_sale->>'created_at')::TIMESTAMPTZ, v_now)
    );

    RETURN jsonb_build_object(
        'success', true,
        'sale_id', v_sale_id,
        'gross_total', v_calculated_gross,
        'total_items', v_calculated_items,
        'withholding_amount', v_wht_amount,
        'net_payable', v_net_payable,
        'created_at', v_now
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- RPC 2: Record Stock In Transaction (S-04)
CREATE OR REPLACE FUNCTION record_stock_in_transaction(
    p_product_id TEXT,
    p_quantity INT,
    p_reference TEXT DEFAULT 'Supplier Stock Receipt'
)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_inv RECORD;
    v_prev_stock INT;
    v_new_stock INT;
    v_prod_name TEXT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_shop_id := auth.uid();
    IF v_shop_id IS NULL OR NOT is_active_shop() THEN
        RAISE EXCEPTION 'Unauthorized: Active shop session required';
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantity must be greater than 0';
    END IF;

    SELECT * INTO v_inv
    FROM shop_inventory
    WHERE shop_id = v_shop_id
      AND (master_product_id = p_product_id OR id::TEXT = p_product_id OR custom_code = p_product_id)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in shop inventory', p_product_id;
    END IF;

    v_prev_stock := v_inv.stock;
    v_new_stock := v_prev_stock + p_quantity;
    v_prod_name := COALESCE(v_inv.custom_name, (SELECT name FROM master_products WHERE id = v_inv.master_product_id), 'Paint Product');

    UPDATE shop_inventory
    SET stock = v_new_stock,
        updated_at = v_now
    WHERE id = v_inv.id;

    INSERT INTO stock_movements (
        id,
        shop_id,
        product_id,
        product_name,
        type,
        quantity,
        previous_stock,
        new_stock,
        reference,
        created_at
    ) VALUES (
        'MOV-' || gen_random_uuid()::TEXT,
        v_shop_id,
        p_product_id,
        v_prod_name,
        'STOCK_IN',
        p_quantity,
        v_prev_stock,
        v_new_stock,
        COALESCE(NULLIF(p_reference, ''), 'Supplier Stock Receipt'),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'previous_stock', v_prev_stock,
        'new_stock', v_new_stock
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- RPC 3: Adjust Stock Transaction (S-04)
CREATE OR REPLACE FUNCTION adjust_stock_transaction(
    p_product_id TEXT,
    p_new_stock INT,
    p_reason TEXT DEFAULT 'Physical Stock Count'
)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_inv RECORD;
    v_prev_stock INT;
    v_diff INT;
    v_prod_name TEXT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_shop_id := auth.uid();
    IF v_shop_id IS NULL OR NOT is_active_shop() THEN
        RAISE EXCEPTION 'Unauthorized: Active shop session required';
    END IF;

    IF p_new_stock IS NULL OR p_new_stock < 0 THEN
        RAISE EXCEPTION 'Stock count cannot be negative';
    END IF;

    SELECT * INTO v_inv
    FROM shop_inventory
    WHERE shop_id = v_shop_id
      AND (master_product_id = p_product_id OR id::TEXT = p_product_id OR custom_code = p_product_id)
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product % not found in shop inventory', p_product_id;
    END IF;

    v_prev_stock := v_inv.stock;
    v_diff := p_new_stock - v_prev_stock;
    v_prod_name := COALESCE(v_inv.custom_name, (SELECT name FROM master_products WHERE id = v_inv.master_product_id), 'Paint Product');

    UPDATE shop_inventory
    SET stock = p_new_stock,
        updated_at = v_now
    WHERE id = v_inv.id;

    INSERT INTO stock_movements (
        id,
        shop_id,
        product_id,
        product_name,
        type,
        quantity,
        previous_stock,
        new_stock,
        reference,
        created_at
    ) VALUES (
        'MOV-' || gen_random_uuid()::TEXT,
        v_shop_id,
        p_product_id,
        v_prod_name,
        'ADJUSTMENT',
        v_diff,
        v_prev_stock,
        p_new_stock,
        COALESCE(NULLIF(p_reason, ''), 'Physical Stock Count'),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'product_id', p_product_id,
        'previous_stock', v_prev_stock,
        'new_stock', p_new_stock,
        'difference', v_diff
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- RPC 4: Add Custom Product RPC (S-02)
CREATE OR REPLACE FUNCTION add_custom_product_transaction(
    p_name TEXT,
    p_category TEXT,
    p_size TEXT,
    p_code TEXT,
    p_price_before_vat NUMERIC,
    p_price_with_vat NUMERIC,
    p_stock INT DEFAULT 0,
    p_min_stock INT DEFAULT 5
)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_item_id UUID;
    v_code TEXT;
    v_pbv NUMERIC(10, 2);
    v_pwv NUMERIC(10, 2);
    v_stock INT;
    v_min_stock INT;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    v_shop_id := auth.uid();
    IF v_shop_id IS NULL OR NOT is_active_shop() THEN
        RAISE EXCEPTION 'Unauthorized: Active shop session required';
    END IF;

    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Product name is required';
    END IF;

    v_pwv := COALESCE(p_price_with_vat, 0.00);
    IF v_pwv <= 0 THEN
        RAISE EXCEPTION 'Price with VAT must be greater than zero';
    END IF;

    v_pbv := COALESCE(p_price_before_vat, ROUND(v_pwv / 1.15, 2));
    v_stock := GREATEST(0, COALESCE(p_stock, 0));
    v_min_stock := GREATEST(0, COALESCE(p_min_stock, 5));
    v_code := COALESCE(NULLIF(TRIM(p_code), ''), 'CUSTOM-' || gen_random_uuid()::TEXT);

    INSERT INTO shop_inventory (
        shop_id,
        master_product_id,
        is_custom,
        custom_name,
        custom_category,
        custom_size,
        custom_code,
        custom_price_before_vat,
        custom_price_with_vat,
        stock,
        min_stock,
        created_at,
        updated_at
    ) VALUES (
        v_shop_id,
        NULL,
        TRUE,
        TRIM(p_name),
        COALESCE(NULLIF(TRIM(p_category), ''), 'Accessories'),
        COALESCE(NULLIF(TRIM(p_size), ''), '1 Unit'),
        v_code,
        v_pbv,
        v_pwv,
        v_stock,
        v_min_stock,
        v_now,
        v_now
    ) RETURNING id INTO v_item_id;

    IF v_stock > 0 THEN
        INSERT INTO stock_movements (
            id,
            shop_id,
            product_id,
            product_name,
            type,
            quantity,
            previous_stock,
            new_stock,
            reference,
            created_at
        ) VALUES (
            'MOV-' || gen_random_uuid()::TEXT,
            v_shop_id,
            v_item_id::TEXT,
            TRIM(p_name),
            'STOCK_IN',
            v_stock,
            0,
            v_stock,
            'Initial Stock for Custom Product',
            v_now
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_item_id,
        'name', TRIM(p_name),
        'code', v_code,
        'price_with_vat', v_pwv,
        'stock', v_stock
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- RPC 5: Update WHT Voucher RPC (S-02)
CREATE OR REPLACE FUNCTION update_wht_voucher_transaction(
    p_sale_id TEXT,
    p_voucher_number TEXT,
    p_voucher_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID;
    v_status TEXT;
BEGIN
    v_shop_id := auth.uid();
    IF v_shop_id IS NULL OR NOT is_active_shop() THEN
        RAISE EXCEPTION 'Unauthorized: Active shop session required';
    END IF;

    v_status := COALESCE(p_voucher_status, 'pending');
    IF v_status NOT IN ('pending', 'received', 'not_applicable') THEN
        RAISE EXCEPTION 'Invalid voucher status: %', v_status;
    END IF;

    UPDATE sales
    SET wht_voucher_number = NULLIF(TRIM(p_voucher_number), ''),
        wht_voucher_status = v_status
    WHERE id = p_sale_id
      AND shop_id = v_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale % not found or not owned by current shop', p_sale_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'sale_id', p_sale_id, 'voucher_status', v_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- RPC 6: Admin Approve Shop (S-01, S-04 & P2: Role verification & true approver audit logging)
DROP FUNCTION IF EXISTS admin_approve_shop(UUID);
CREATE OR REPLACE FUNCTION admin_approve_shop(
    target_shop_id UUID,
    p_approver_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_old_status TEXT;
    v_caller_role TEXT;
    v_approver_id UUID;
    v_approver_role TEXT;
BEGIN
    v_caller_role := auth.role();

    IF v_caller_role <> 'service_role' AND COALESCE((auth.jwt()->'app_metadata'->>'is_admin')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied: caller does not have administrator privileges';
    END IF;

    -- Record the validated human administrator's UUID if provided by admin service
    v_approver_id := COALESCE(p_approver_id, auth.uid());
    v_approver_role := CASE WHEN p_approver_id IS NOT NULL THEN 'admin_user' ELSE COALESCE(v_caller_role, 'service_role') END;

    SELECT status INTO v_old_status
    FROM shops
    WHERE id = target_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop with ID % not found', target_shop_id;
    END IF;

    UPDATE shops
    SET status = 'active',
        updated_at = NOW()
    WHERE id = target_shop_id;

    INSERT INTO shop_approval_audit (
        target_shop_id,
        approver_id,
        approver_role,
        old_status,
        new_status,
        created_at
    ) VALUES (
        target_shop_id,
        v_approver_id,
        v_approver_role,
        v_old_status,
        'active',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', target_shop_id,
        'approver_id', v_approver_id,
        'old_status', v_old_status,
        'new_status', 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- S-04: Enforce Least-Privilege Execution Grants
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON FUNCTION admin_approve_shop(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION is_active_shop() TO authenticated;
GRANT EXECUTE ON FUNCTION record_sale_transaction(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION record_stock_in_transaction(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock_transaction(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_custom_product_transaction(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_wht_voucher_transaction(TEXT, TEXT, TEXT) TO authenticated;

GRANT EXECUTE ON FUNCTION admin_approve_shop(UUID, UUID) TO service_role;

-- ==============================================================================
-- 11. Seed All 46 Official Jotun Paint Products into master_products
-- ==============================================================================
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
