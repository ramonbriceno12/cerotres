import { Router } from "express";
import { supabaseAdmin } from "../config/supabaseClient.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { sendEmail } from "../utils/resend.js";
import { env } from "../config/env.js";

// Supabase's own email sending is disabled on purpose (Auth > Email templates
// off in the dashboard). We generate the action links with the admin API and
// deliver every email ourselves through Resend, so copy/branding/delivery is
// entirely under our control.
export const authRouter = Router();

function confirmEmailHtml(fullName, link) {
  return `<p>Hola ${fullName || ""},</p>
    <p>Gracias por registrarte en 03/cerotres. Confirma tu correo para activar tu cuenta:</p>
    <p><a href="${link}">Confirmar mi correo</a></p>
    <p>Si no creaste esta cuenta, puedes ignorar este mensaje.</p>`;
}

function resetPasswordHtml(link) {
  return `<p>Recibimos una solicitud para restablecer tu contrasena en 03/cerotres.</p>
    <p><a href="${link}">Restablecer contrasena</a></p>
    <p>Si no solicitaste esto, puedes ignorar este mensaje.</p>`;
}

async function generateAndSend({ type, email, password, fullName, redirectTo, buildHtml, subject }) {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type,
    email,
    password,
    options: { redirectTo, data: fullName ? { full_name: fullName } : undefined },
  });
  if (error) throw new ApiError(400, error.message);

  const result = await sendEmail({ to: email, subject, html: buildHtml(data.properties.action_link) });
  if (!result.sent) console.error("Resend send failed:", result.error);
  return result;
}

// Self-service registration (customer accounts). Staff accounts are created
// by an admin via /api/settings/staff instead, pre-confirmed.
authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password, full_name, phone } = req.body;
    if (!email || !password || !full_name) throw new ApiError(400, "email, password y full_name son requeridos");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name, phone, role: "customer" },
    });
    if (error) throw new ApiError(400, error.message);

    await generateAndSend({
      type: "signup",
      email,
      fullName: full_name,
      redirectTo: `${env.frontendUrl}/correo-confirmado`,
      subject: "Confirma tu correo - 03/cerotres",
      buildHtml: (link) => confirmEmailHtml(full_name, link),
    });

    res.status(201).json({ data: { id: created.user.id, email: created.user.email } });
  })
);

authRouter.post(
  "/resend-confirmation",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "email es requerido");

    await generateAndSend({
      type: "signup",
      email,
      redirectTo: `${env.frontendUrl}/correo-confirmado`,
      subject: "Confirma tu correo - 03/cerotres",
      buildHtml: (link) => confirmEmailHtml("", link),
    });

    res.json({ data: { sent: true } });
  })
);

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    if (!email) throw new ApiError(400, "email es requerido");

    try {
      await generateAndSend({
        type: "recovery",
        email,
        redirectTo: `${env.frontendUrl}/restablecer-contrasena`,
        subject: "Restablece tu contrasena - 03/cerotres",
        buildHtml: (link) => resetPasswordHtml(link),
      });
    } catch {
      // Always answer the same way whether or not the email exists, so we
      // don't leak which addresses have an account.
    }

    res.json({ data: { sent: true } });
  })
);
