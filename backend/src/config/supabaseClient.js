import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

// Service-role client used by the backend only. It bypasses RLS, so every
// authorization decision (role checks, ownership checks) must happen in
// the route/middleware layer before this client is used.
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
