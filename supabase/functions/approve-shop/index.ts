import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const expectedAdminKey = Deno.env.get("ADMIN_API_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Missing server configuration: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({ error: "Internal server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Authenticate the caller as an administrator
    const authHeader = req.headers.get("Authorization");
    const providedAdminKey = req.headers.get("x-admin-key");

    let isAuthorizedAdmin = false;
    let approverIdentifier = "admin_service";

    // Option A: Admin API key header check
    if (expectedAdminKey && providedAdminKey && providedAdminKey === expectedAdminKey) {
      isAuthorizedAdmin = true;
      approverIdentifier = "api_key_admin";
    }

    // Option B: JWT user with app_metadata.is_admin === true
    if (!isAuthorizedAdmin && authHeader) {
      const token = authHeader.replace("Bearer ", "").trim();
      if (token) {
        const authClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: { user }, error: userError } = await authClient.auth.getUser(token);

        if (!userError && user) {
          const isAdminClaim = Boolean(user.app_metadata?.is_admin);
          if (isAdminClaim) {
            isAuthorizedAdmin = true;
            approverIdentifier = `user:${user.id}`;
          }
        }
      }
    }

    if (!isAuthorizedAdmin) {
      return new Response(
        JSON.stringify({ error: "Forbidden: Administrator access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse and validate payload
    const body = await req.json().catch(() => ({}));
    const shopId = body.shop_id || body.shopId;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!shopId || !uuidRegex.test(shopId)) {
      return new Response(
        JSON.stringify({ error: "Invalid or missing shop_id. Must be a valid UUID." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Execute admin_approve_shop via service_role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data, error } = await adminClient.rpc("admin_approve_shop", {
      target_shop_id: shopId,
    });

    if (error) {
      console.error(`[ApproveShop Error] target: ${shopId}, error:`, error);
      return new Response(
        JSON.stringify({ error: error.message || "Failed to approve shop" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Return clean approval result without leaking server credentials
    return new Response(
      JSON.stringify({
        success: true,
        shop_id: shopId,
        status: "active",
        approver: approverIdentifier,
        audit: data,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Unexpected Error]", err);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
