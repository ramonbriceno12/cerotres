import { supabaseAdmin } from "../config/supabaseClient.js";

// Verifies the Supabase access token and attaches { id, email, role, fullName } to req.user.
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing bearer token" });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired token" });

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, is_active")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) return res.status(500).json({ error: profileError.message });
    if (!profile || !profile.is_active) return res.status(403).json({ error: "Account inactive or not found" });

    req.user = {
      id: data.user.id,
      email: data.user.email,
      role: profile.role,
      fullName: profile.full_name,
    };
    next();
  } catch (err) {
    next(err);
  }
}

// Like requireAuth but never rejects: if a valid bearer token is present it
// attaches req.user, otherwise the request continues anonymously. Used on
// the checkout endpoint so both guests and staff (placing an order for a
// walk-in customer) hit the same route.
export async function optionalAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    const { data } = await supabaseAdmin.auth.getUser(token);
    if (!data?.user) return next();

    const { data: profile } = await supabaseAdmin.from("profiles").select("id, role, full_name, is_active").eq("id", data.user.id).maybeSingle();
    if (profile?.is_active) {
      req.user = { id: data.user.id, email: data.user.email, role: profile.role, fullName: profile.full_name };
    }
    next();
  } catch {
    next();
  }
}

// Restricts a route to specific staff roles, e.g. requireRole('admin', 'manager').
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No tienes permisos para esta accion" });
    }
    next();
  };
}

export const STAFF_ROLES = ["admin", "manager", "kitchen", "delivery"];
export const isStaffRole = (role) => STAFF_ROLES.includes(role);
