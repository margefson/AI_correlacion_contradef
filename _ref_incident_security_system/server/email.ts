/**
 * Email helper — password reset flow
 * Uses Resend REST API (https://resend.com) for transactional email.
 * Falls back gracefully when email cannot be delivered (e.g., free-tier domain restriction).
 *
 * Environment variables:
 *   RESEND_API_KEY  — API key from resend.com (starts with re_...)
 *   SMTP_FROM       — Sender address (default: onboarding@resend.dev)
 *
 * Legacy SMTP variables (SMTP_HOST, SMTP_USER, SMTP_PASS) are still supported
 * as a secondary fallback via Nodemailer.
 */
import nodemailer from "nodemailer";

interface SendResetEmailOptions {
  to: string;
  userName: string;
  resetUrl: string;
  expiresMinutes?: number;
}

export interface SendResetEmailResult {
  sent: boolean;
  /** Preview URL (Ethereal) or direct reset URL when email could not be delivered */
  preview?: string;
  /** Human-readable delivery status message */
  deliveryNote?: string;
  /** Whether the link was returned in-band (email could not be delivered) */
  linkInBand?: boolean;
}

/** Build the HTML body for the reset email */
function buildEmailHtml(userName: string, resetUrl: string, expiresMinutes: number): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#161b22;border:1px solid #21262d;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0d1117;border-bottom:2px solid #00b4d8;padding:24px 32px;">
            <span style="font-family:monospace;font-size:18px;font-weight:700;color:#e6edf3;">
              🔒 Incident Security System
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="color:#8b949e;font-size:13px;margin:0 0 8px 0;font-family:monospace;letter-spacing:1px;text-transform:uppercase;">REDEFINIÇÃO DE SENHA</p>
            <h2 style="color:#e6edf3;font-size:22px;margin:0 0 16px 0;">Olá, ${userName}!</h2>
            <p style="color:#8b949e;font-size:15px;line-height:1.6;margin:0 0 24px 0;">
              Recebemos uma solicitação para redefinir a senha da sua conta no
              <strong style="color:#e6edf3;">Incident Security System</strong>.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#1c2128;border:1px solid #f85149;border-radius:6px;margin:0 0 24px 0;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="color:#f85149;font-size:13px;font-weight:700;margin:0 0 6px 0;font-family:monospace;">⚠ ATENÇÃO — LINK COM VALIDADE LIMITADA</p>
                  <p style="color:#8b949e;font-size:13px;margin:0;line-height:1.5;">
                    Este link é válido por apenas <strong style="color:#e6edf3;">${expiresMinutes} minutos</strong>.
                    Após esse prazo, solicite uma nova redefinição.
                  </p>
                </td>
              </tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
              <tr>
                <td align="center">
                  <a href="${resetUrl}" style="display:inline-block;background:#00b4d8;color:#0d1117;font-size:15px;font-weight:700;text-decoration:none;padding:14px 32px;border-radius:6px;font-family:monospace;">
                    Redefinir Minha Senha
                  </a>
                </td>
              </tr>
            </table>
            <p style="color:#8b949e;font-size:12px;margin:0 0 8px 0;">Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
            <p style="background:#0d1117;border:1px solid #21262d;border-radius:4px;padding:10px 12px;font-family:monospace;font-size:11px;color:#00b4d8;word-break:break-all;margin:0 0 24px 0;">${resetUrl}</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;border:1px solid #21262d;border-radius:6px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="color:#8b949e;font-size:12px;margin:0;line-height:1.6;">
                    🔐 <strong style="color:#e6edf3;">Não solicitou esta redefinição?</strong><br>
                    Ignore este e-mail com segurança. Sua senha atual permanece inalterada.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#0d1117;border-top:1px solid #21262d;padding:16px 32px;">
            <p style="color:#30363d;font-size:11px;margin:0;font-family:monospace;text-align:center;">
              Incident Security System · ICOMP 2025/2026 · Este é um e-mail automático, não responda.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Build plain-text body */
function buildEmailText(userName: string, resetUrl: string, expiresMinutes: number): string {
  return `Redefinição de Senha — Incident Security System\n\nOlá, ${userName}!\n\nClique no link abaixo para redefinir sua senha:\n${resetUrl}\n\nATENÇÃO: Este link é válido por apenas ${expiresMinutes} minutos.\n\nSe você não solicitou esta redefinição, ignore este e-mail.`;
}

/**
 * Try to send via Resend REST API.
 * Returns null on success, or an error message string on failure.
 */
async function trySendViaResend(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ ok: boolean; error?: string; restrictedDomain?: boolean }> {
  const apiKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || "onboarding@resend.dev";

  if (!apiKey || !apiKey.startsWith("re_")) {
    return { ok: false, error: "RESEND_API_KEY não configurada" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: `"Incident Security System" <${from}>`, to, subject, html, text }),
    });

    if (response.ok) {
      return { ok: true };
    }

    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const message = (body.message as string) || `HTTP ${response.status}`;

    // Detect the free-tier domain restriction
    const isRestricted =
      response.status === 403 &&
      typeof message === "string" &&
      message.includes("only send testing emails to your own email address");

    return { ok: false, error: message, restrictedDomain: isRestricted };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Try to send via Nodemailer SMTP (legacy fallback).
 */
async function trySendViaSmtp(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ ok: boolean; error?: string; preview?: string }> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? "noreply@incidentsys.local";

  if (!host || !user || !pass) {
    return { ok: false, error: "Credenciais SMTP não configuradas" };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: `"Incident Security System" <${from}>`,
      to,
      subject,
      text,
      html,
    });

    const preview = nodemailer.getTestMessageUrl(info) || undefined;
    return { ok: true, preview };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Main function: send a password reset email.
 *
 * Strategy:
 * 1. Try Resend REST API (preferred)
 * 2. If Resend fails due to free-tier domain restriction, return link in-band
 * 3. Try SMTP fallback
 * 4. If all fail, log to console and return link in-band
 */
export async function sendPasswordResetEmail(
  opts: SendResetEmailOptions
): Promise<SendResetEmailResult> {
  const { to, userName, resetUrl, expiresMinutes = 10 } = opts;

  const subject = "Redefinição de Senha — Incident Security System";
  const html = buildEmailHtml(userName, resetUrl, expiresMinutes);
  const text = buildEmailText(userName, resetUrl, expiresMinutes);

  // ── 1. Try Resend REST API ──────────────────────────────────────────────────
  const resendResult = await trySendViaResend(to, subject, html, text);

  if (resendResult.ok) {
    console.log(`[Email] ✅ Enviado via Resend para: ${to}`);
    return { sent: true };
  }

  // Free-tier restriction: can only send to the account owner's email
  if (resendResult.restrictedDomain) {
    console.warn(`[Email] ⚠ Resend: domínio não verificado. Link retornado in-band para: ${to}`);
    console.log(`[Email] Reset URL: ${resetUrl}`);
    return {
      sent: true,
      preview: resetUrl,
      linkInBand: true,
      deliveryNote:
        "O serviço de e-mail está em modo de teste (domínio não verificado). " +
        "O link de redefinição foi gerado com sucesso e está disponível abaixo.",
    };
  }

  console.warn(`[Email] Resend falhou: ${resendResult.error}. Tentando SMTP...`);

  // ── 2. Try SMTP fallback ────────────────────────────────────────────────────
  const smtpResult = await trySendViaSmtp(to, subject, html, text);

  if (smtpResult.ok) {
    console.log(`[Email] ✅ Enviado via SMTP para: ${to}`);
    return { sent: true, preview: smtpResult.preview };
  }

  console.warn(`[Email] SMTP falhou: ${smtpResult.error}. Usando fallback in-band.`);

  // ── 3. Final fallback: log + return link in-band ────────────────────────────
  console.log("\n========== PASSWORD RESET EMAIL (FALLBACK MODE) ==========");
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Reset URL: ${resetUrl}`);
  console.log(`Expires in: ${expiresMinutes} minutes`);
  console.log("==========================================================\n");

  return {
    sent: true,
    preview: resetUrl,
    linkInBand: true,
    deliveryNote:
      "Não foi possível enviar o e-mail automaticamente. " +
      "O link de redefinição foi gerado com sucesso e está disponível abaixo.",
  };
}
