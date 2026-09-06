-- ==============================================================================
-- Migration: 20260907000000_security_hardening.sql
-- Description: Security & Reliability Hardening (S-01 to S-04, S-07)
-- 1. S-01: Secure admin approval with role verification & audit logging.
-- 2. S-02: Revoke direct table mutations (INSERT/UPDATE/DELETE) on financial & inventory tables;
--          enforce strictly SELECT-only for authenticated tenants; route all mutations via RPCs.
-- 3. S-03: Authoritative database pricing & tax calculation in record_sale_transaction;
--          reject empty carts, forged prices, and negative amounts.
-- 4. S-04: Enforce SET search_path = public, pg_temp on all SECURITY DEFINER functions,
--          revoke PUBLIC execute, and grant least privilege.
-- ==============================================================================

-- 1. Shop Approval Audit Trail Table (S-01)
CREATE TABLE IF NOT EXISTS shop_approval_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    approver_id UUID,
    approver_role TEXT,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE shop_approval_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_audit_admin_only" ON shop_approval_audit;
CREATE POLICY "approval_audit_admin_only" ON shop_approval_audit
    FOR SELECT TO authenticated
    USING (COALESCE((auth.jwt()->'app_metadata'->>'is_admin')::BOOLEAN, FALSE) = TRUE);

-- 2. Helper function: is_active_shop with hardened search_path (S-04)
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

-- 3. S-02: Convert Tenant Policies to Strictly SELECT-Only & Secure Shops Table
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

DROP POLICY IF EXISTS "shop_active_inventory" ON shop_inventory;
DROP POLICY IF EXISTS "shop_active_sales" ON sales;
DROP POLICY IF EXISTS "shop_active_sale_items" ON sale_items;
DROP POLICY IF EXISTS "shop_active_stock_movements" ON stock_movements;
DROP POLICY IF EXISTS "shop_isolation_inventory" ON shop_inventory;
DROP POLICY IF EXISTS "shop_isolation_sales" ON sales;
DROP POLICY IF EXISTS "shop_isolation_sale_items" ON sale_items;
DROP POLICY IF EXISTS "shop_isolation_stock_movements" ON stock_movements;

DROP POLICY IF EXISTS "shop_active_inventory_select" ON shop_inventory;
CREATE POLICY "shop_active_inventory_select" ON shop_inventory
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

DROP POLICY IF EXISTS "shop_active_sales_select" ON sales;
CREATE POLICY "shop_active_sales_select" ON sales
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

DROP POLICY IF EXISTS "shop_active_sale_items_select" ON sale_items;
CREATE POLICY "shop_active_sale_items_select" ON sale_items
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

DROP POLICY IF EXISTS "shop_active_stock_movements_select" ON stock_movements;
CREATE POLICY "shop_active_stock_movements_select" ON stock_movements
    FOR SELECT TO authenticated
    USING (shop_id = auth.uid() AND is_active_shop());

-- 4. S-03 & S-04: Hardened record_sale_transaction
-- Authoritative calculation of unit prices, subtotals, WHT (3%), and net payable
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

    -- 1. First Pass: Lock inventory, verify stock, calculate authoritative totals, decrement stock
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

        -- S-03: Retrieve authoritative unit price from database, ignoring any client price
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

        -- Calculate authoritative subtotal
        v_line_subtotal := ROUND(v_qty * v_auth_pwv, 2);
        v_calculated_gross := v_calculated_gross + v_line_subtotal;
        v_calculated_items := v_calculated_items + v_qty;

        v_prev_stock := v_inv.stock;
        v_new_stock := v_inv.stock - v_qty;

        -- Decrement stock atomically
        UPDATE shop_inventory
        SET stock = v_new_stock,
            updated_at = v_now
        WHERE id = v_inv.id;

        -- Insert authoritative sale line item
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

        -- Insert audit trail movement
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

    -- S-03: Authoritative Withholding Tax computation (Ethiopian official 3% on goods)
    v_is_wht := COALESCE((p_sale->>'is_withholding')::BOOLEAN, FALSE);
    IF v_is_wht THEN
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

    -- 2. Insert Master Sale Record with Server-Calculated Totals
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

-- 5. S-04: Hardened record_stock_in_transaction
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

-- 6. S-04: Hardened adjust_stock_transaction
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

-- 7. S-02: Add Custom Product RPC (replaces direct table insert)
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

-- 8. S-02: Update WHT Voucher RPC (replaces direct table update)
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

-- 9. S-01 & P2: Hardened admin_approve_shop (Preserves true approver UUID in audit log)
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
    -- Verify caller is service_role OR has is_admin = true claim
    v_caller_role := auth.role();
    IF v_caller_role <> 'service_role' AND COALESCE((auth.jwt()->'app_metadata'->>'is_admin')::BOOLEAN, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'Access denied: caller does not have administrator privileges';
    END IF;

    -- S-01 & P2: Record the validated human administrator's UUID if provided by admin service
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

    -- Record immutable audit log with the true administrator's ID
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

-- 10. S-04: Enforce Least-Privilege Execution Grants
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON FUNCTION admin_approve_shop(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- Grant tenant RPCs only to authenticated users
GRANT EXECUTE ON FUNCTION is_active_shop() TO authenticated;
GRANT EXECUTE ON FUNCTION record_sale_transaction(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION record_stock_in_transaction(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION adjust_stock_transaction(TEXT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION add_custom_product_transaction(TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION update_wht_voucher_transaction(TEXT, TEXT, TEXT) TO authenticated;

-- S-01: Grant admin_approve_shop ONLY to service_role (not accessible via tenant JWTs)
GRANT EXECUTE ON FUNCTION admin_approve_shop(UUID, UUID) TO service_role;

-- 11. S-03: Add database check constraints for non-negative values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_sales_total_non_negative') THEN
        ALTER TABLE sales ADD CONSTRAINT check_sales_total_non_negative CHECK (total >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_sales_net_payable_non_negative') THEN
        ALTER TABLE sales ADD CONSTRAINT check_sales_net_payable_non_negative CHECK (net_payable >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_sales_wht_non_negative') THEN
        ALTER TABLE sales ADD CONSTRAINT check_sales_wht_non_negative CHECK (withholding_amount >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_sale_items_qty_positive') THEN
        ALTER TABLE sale_items ADD CONSTRAINT check_sale_items_qty_positive CHECK (quantity > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_sale_items_subtotal_non_negative') THEN
        ALTER TABLE sale_items ADD CONSTRAINT check_sale_items_subtotal_non_negative CHECK (subtotal >= 0);
    END IF;
END $$;

-- 12. P3: Pin search_path on Provisioning Trigger Functions
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

