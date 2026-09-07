-- Auto-activate all existing pending shops
UPDATE public.shops
SET status = 'active', updated_at = NOW()
WHERE status = 'pending_approval';

-- Update handle_auth_user_created to default status to 'active'
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
        'active'
    )
    ON CONFLICT (id) DO UPDATE
    SET status = 'active';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

-- Allow authenticated shop owner to self-activate immediately if ever in pending status
CREATE OR REPLACE FUNCTION public.activate_my_shop()
RETURNS JSONB AS $$
DECLARE
    v_shop_id UUID := auth.uid();
BEGIN
    IF v_shop_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    UPDATE public.shops
    SET status = 'active', updated_at = NOW()
    WHERE id = v_shop_id;

    RETURN jsonb_build_object('success', true, 'shop_id', v_shop_id, 'status', 'active');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

GRANT EXECUTE ON FUNCTION public.activate_my_shop() TO authenticated;
