-- ==============================================================================
-- Migration: 20260911000000_persist_colourant_and_movement_metadata.sql
-- Description: Persist colourant cost, immutable movement metadata, and SaaS approval hardening
-- 1. Persist colourant_cost in sale_items table.
-- 2. Persist immutable product_code and product_size in stock_movements table.
-- 3. Tenant-isolated backfill of code & size in stock_movements.
-- 4. Update record_sale_transaction RPC to calculate authoritative line totals
--    incorporating colourant cost, safeguard NULL custom PBV, and populate movement metadata.
-- 5. Update record_stock_in_transaction and adjust_stock_transaction RPCs to
--    populate immutable product_code and product_size in stock_movements.
-- 6. Enforce SaaS license approval: new shops default to 'pending_approval';
--    drop activate_my_shop; provide secure admin_set_shop_status RPC.
-- ==============================================================================

-- 1. Schema Alterations
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS colourant_cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS product_code TEXT;

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS product_size TEXT;

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS code TEXT;

ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS size TEXT;

-- 2. Tenant-Isolated Backfill of existing stock movements with snapshot product code and size
UPDATE stock_movements sm
SET 
    product_code = COALESCE(sm.product_code, mp.code, si.custom_code, 'PROD'),
    product_size = COALESCE(sm.product_size, mp.size, si.custom_size, 'Unit'),
    code = COALESCE(sm.code, mp.code, si.custom_code, 'PROD'),
    size = COALESCE(sm.size, mp.size, si.custom_size, 'Unit')
FROM shop_inventory si
LEFT JOIN master_products mp ON mp.id = si.master_product_id
WHERE sm.shop_id = si.shop_id
  AND (sm.product_id = si.master_product_id OR sm.product_id = si.id::TEXT OR sm.product_id = si.custom_code)
  AND (sm.product_code IS NULL OR sm.product_size IS NULL);

-- 3. Authoritative record_sale_transaction RPC
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
    v_item_colorant NUMERIC(10, 2);
    v_auth_pbv NUMERIC(10, 2);
    v_auth_pwv NUMERIC(10, 2);
    v_auth_name TEXT;
    v_auth_code TEXT;
    v_auth_size TEXT;
    v_line_pbv NUMERIC(12, 2);
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

    -- Reject empty carts
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
        quantity INT,
        colorant_cost NUMERIC,
        colourant_cost NUMERIC
    )
    LOOP
        v_prod_id := v_item.product_id;
        v_qty := v_item.quantity;
        v_item_colorant := COALESCE(v_item.colourant_cost, v_item.colorant_cost, 0.00);

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'Invalid quantity % for item %', v_qty, v_prod_id;
        END IF;

        IF v_item_colorant < 0 THEN
            RAISE EXCEPTION 'Colourant cost cannot be negative for item %', v_prod_id;
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

        -- Retrieve authoritative unit price from database, safeguarding against NULL custom price_before_vat
        IF v_inv.master_product_id IS NOT NULL THEN
            SELECT price_before_vat, price_with_vat, name, code, size
            INTO v_auth_pbv, v_auth_pwv, v_auth_name, v_auth_code, v_auth_size
            FROM master_products
            WHERE id = v_inv.master_product_id;
        ELSE
            v_auth_pwv := v_inv.custom_price_with_vat;
            v_auth_pbv := COALESCE(v_inv.custom_price_before_vat, ROUND(v_auth_pwv / 1.15, 2));
            v_auth_name := v_inv.custom_name;
            v_auth_code := v_inv.custom_code;
            v_auth_size := v_inv.custom_size;
        END IF;

        IF v_auth_pwv IS NULL OR v_auth_pwv <= 0 THEN
            RAISE EXCEPTION 'Authoritative price not found for product %', v_prod_id;
        END IF;

        -- Calculate authoritative subtotal including colourant cost (Jotun Colour Manager pricing model)
        IF v_item_colorant > 0 THEN
            v_line_pbv := (v_auth_pbv * v_qty) + v_item_colorant;
            v_line_subtotal := TRUNC(v_line_pbv * 1.15, 2);
        ELSE
            v_line_pbv := v_auth_pbv * v_qty;
            v_line_subtotal := ROUND(v_qty * v_auth_pwv, 2);
        END IF;

        v_calculated_gross := v_calculated_gross + v_line_subtotal;
        v_calculated_items := v_calculated_items + v_qty;

        v_prev_stock := v_inv.stock;
        v_new_stock := v_inv.stock - v_qty;

        -- Decrement stock atomically
        UPDATE shop_inventory
        SET stock = v_new_stock,
            updated_at = v_now
        WHERE id = v_inv.id;

        -- Insert authoritative sale line item with colourant_cost
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
            colourant_cost,
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
            v_item_colorant,
            v_line_subtotal,
            v_now
        );

        -- Insert audit trail movement with immutable product code & size
        INSERT INTO stock_movements (
            id,
            shop_id,
            product_id,
            product_name,
            product_code,
            product_size,
            code,
            size,
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
            v_auth_code,
            v_auth_size,
            v_auth_code,
            v_auth_size,
            'SALE',
            -v_qty,
            v_prev_stock,
            v_new_stock,
            COALESCE(p_sale->>'reference', 'Sale #' || RIGHT(v_sale_id, 8), v_sale_id),
            v_now
        );
    END LOOP;

    -- Authoritative Withholding Tax computation (Ethiopian official 3% on goods for transactions >= 20,000 ETB)
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

    -- 2. Insert Master Sale Record with Server-Calculated Totals
    INSERT INTO sales (
        id,
        shop_id,
        customer,
        customer_tin,
        customer_phone,
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
        NULLIF(p_sale->>'customer_phone', ''),
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

-- 4. Authoritative record_stock_in_transaction RPC
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
    v_prod_code TEXT;
    v_prod_size TEXT;
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

    IF v_inv.master_product_id IS NOT NULL THEN
        SELECT name, code, size INTO v_prod_name, v_prod_code, v_prod_size
        FROM master_products
        WHERE id = v_inv.master_product_id;
    ELSE
        v_prod_name := v_inv.custom_name;
        v_prod_code := v_inv.custom_code;
        v_prod_size := v_inv.custom_size;
    END IF;

    v_prod_name := COALESCE(v_prod_name, 'Paint Product');

    UPDATE shop_inventory
    SET stock = v_new_stock,
        updated_at = v_now
    WHERE id = v_inv.id;

    INSERT INTO stock_movements (
        id,
        shop_id,
        product_id,
        product_name,
        product_code,
        product_size,
        code,
        size,
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
        v_prod_code,
        v_prod_size,
        v_prod_code,
        v_prod_size,
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
        'product_name', v_prod_name,
        'product_code', v_prod_code,
        'product_size', v_prod_size,
        'previous_stock', v_prev_stock,
        'new_stock', v_new_stock
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 5. Authoritative adjust_stock_transaction RPC
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
    v_prod_code TEXT;
    v_prod_size TEXT;
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

    IF v_inv.master_product_id IS NOT NULL THEN
        SELECT name, code, size INTO v_prod_name, v_prod_code, v_prod_size
        FROM master_products
        WHERE id = v_inv.master_product_id;
    ELSE
        v_prod_name := v_inv.custom_name;
        v_prod_code := v_inv.custom_code;
        v_prod_size := v_inv.custom_size;
    END IF;

    v_prod_name := COALESCE(v_prod_name, 'Paint Product');

    UPDATE shop_inventory
    SET stock = p_new_stock,
        updated_at = v_now
    WHERE id = v_inv.id;

    INSERT INTO stock_movements (
        id,
        shop_id,
        product_id,
        product_name,
        product_code,
        product_size,
        code,
        size,
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
        v_prod_code,
        v_prod_size,
        v_prod_code,
        v_prod_size,
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
        'product_name', v_prod_name,
        'product_code', v_prod_code,
        'product_size', v_prod_size,
        'previous_stock', v_prev_stock,
        'new_stock', p_new_stock,
        'difference', v_diff
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 6. Enforce SaaS License Approval Gate
-- Update handle_auth_user_created to default status to 'pending_approval'
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

-- Revoke/drop self-activation bypass to enforce commercial subscription approval
DROP FUNCTION IF EXISTS public.activate_my_shop();

-- 7. Administrative Store Status Management (Approve / Suspend with Audit Log)
CREATE OR REPLACE FUNCTION public.admin_set_shop_status(
    target_shop_id UUID,
    p_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_old_status TEXT;
    v_new_status TEXT;
    v_caller_role TEXT := auth.role();
    v_is_admin BOOLEAN := COALESCE((auth.jwt()->'app_metadata'->>'is_admin')::BOOLEAN, FALSE);
    v_approver_id UUID := auth.uid();
BEGIN
    IF p_status NOT IN ('active', 'pending_approval', 'suspended') THEN
        RAISE EXCEPTION 'Invalid shop status: %', p_status;
    END IF;

    v_new_status := p_status;

    SELECT status INTO v_old_status
    FROM shops
    WHERE id = target_shop_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shop with ID % not found', target_shop_id;
    END IF;

    UPDATE shops
    SET status = v_new_status,
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
        CASE WHEN v_is_admin THEN 'admin_user' ELSE 'service_role' END,
        v_old_status,
        v_new_status,
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'shop_id', target_shop_id,
        'old_status', v_old_status,
        'new_status', v_new_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- 8. Least-privilege Grants
REVOKE EXECUTE ON FUNCTION record_sale_transaction(JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_sale_transaction(JSONB, JSONB) TO authenticated;

REVOKE EXECUTE ON FUNCTION record_stock_in_transaction(TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_stock_in_transaction(TEXT, INT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION adjust_stock_transaction(TEXT, INT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION adjust_stock_transaction(TEXT, INT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION admin_set_shop_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_shop_status(UUID, TEXT) TO authenticated, service_role;
