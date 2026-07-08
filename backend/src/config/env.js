import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.warn(`[config] Missing env var ${name}`);
  }
  return value;
}

export const env = {
  port: process.env.PORT || 4000,
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.RESEND_FROM || "03/cerotres <onboarding@resend.dev>",
  },
};
