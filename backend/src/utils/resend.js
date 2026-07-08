import { env } from "../config/env.js";

// Every email the app sends (order updates, confirm-email, forgot-password)
// goes through this one function, straight to the Resend HTTP API - no SMTP,
// no Supabase-managed emails. Never throws: a failed send should not break
// the caller's flow, it just reports back so it can be logged.
export async function sendEmail({ to, subject, html }) {
  if (!env.resend.apiKey) return { sent: false, error: "RESEND_API_KEY no configurada" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resend.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.resend.from, to, subject, html }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { sent: false, error: `Resend ${res.status}: ${body}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}
