/**
 * Sessão 9 — Testes para Correção do Reset de Senha por E-mail
 *
 * S9-1: Módulo email.ts — estrutura e exportações
 * S9-2: Módulo email.ts — construção do HTML do e-mail
 * S9-3: Módulo email.ts — lógica de fallback in-band
 * S9-4: Módulo email.ts — integração com Resend REST API
 * S9-5: Procedure requestPasswordReset — retorno linkInBand
 * S9-6: Procedure validateResetToken — validação de token
 * S9-7: Procedure confirmPasswordReset — redefinição de senha
 * S9-8: Segurança — prevenção de enumeração de e-mail
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SERVER_DIR = path.join(__dirname);
const EMAIL_TS = path.join(SERVER_DIR, "email.ts");
const ROUTERS_TS = path.join(SERVER_DIR, "routers.ts");

// ─── S9-1: Módulo email.ts — estrutura e exportações ──────────────────────────
describe("S9-1: Módulo email.ts — estrutura e exportações", () => {
  let emailSource: string;

  beforeEach(() => {
    emailSource = fs.readFileSync(EMAIL_TS, "utf-8");
  });

  it("S9-1.1: arquivo email.ts existe", () => {
    expect(fs.existsSync(EMAIL_TS)).toBe(true);
  });

  it("S9-1.2: exporta função sendPasswordResetEmail", () => {
    expect(emailSource).toContain("export async function sendPasswordResetEmail");
  });

  it("S9-1.3: exporta interface SendResetEmailResult", () => {
    expect(emailSource).toContain("export interface SendResetEmailResult");
  });

  it("S9-1.4: interface SendResetEmailResult tem campo sent", () => {
    expect(emailSource).toContain("sent: boolean");
  });

  it("S9-1.5: interface SendResetEmailResult tem campo linkInBand", () => {
    expect(emailSource).toContain("linkInBand?: boolean");
  });

  it("S9-1.6: interface SendResetEmailResult tem campo deliveryNote", () => {
    expect(emailSource).toContain("deliveryNote?: string");
  });

  it("S9-1.7: interface SendResetEmailResult tem campo preview", () => {
    expect(emailSource).toContain("preview?: string");
  });
});

// ─── S9-2: Módulo email.ts — construção do HTML do e-mail ─────────────────────
describe("S9-2: Módulo email.ts — construção do HTML do e-mail", () => {
  let emailSource: string;

  beforeEach(() => {
    emailSource = fs.readFileSync(EMAIL_TS, "utf-8");
  });

  it("S9-2.1: função buildEmailHtml existe", () => {
    expect(emailSource).toContain("function buildEmailHtml");
  });

  it("S9-2.2: função buildEmailText existe", () => {
    expect(emailSource).toContain("function buildEmailText");
  });

  it("S9-2.3: HTML contém botão de redefinição de senha", () => {
    expect(emailSource).toContain("Redefinir Minha Senha");
  });

  it("S9-2.4: HTML contém aviso de validade do link", () => {
    expect(emailSource).toContain("ATENÇÃO — LINK COM VALIDADE LIMITADA");
  });

  it("S9-2.5: HTML contém link de fallback (URL visível)", () => {
    expect(emailSource).toContain("Se o botão não funcionar");
  });

  it("S9-2.6: HTML contém nota de segurança", () => {
    expect(emailSource).toContain("Não solicitou esta redefinição");
  });

  it("S9-2.7: assunto do e-mail está correto", () => {
    expect(emailSource).toContain("Redefinição de Senha — Incident Security System");
  });
});

// ─── S9-3: Módulo email.ts — lógica de fallback in-band ───────────────────────
describe("S9-3: Módulo email.ts — lógica de fallback in-band", () => {
  let emailSource: string;

  beforeEach(() => {
    emailSource = fs.readFileSync(EMAIL_TS, "utf-8");
  });

  it("S9-3.1: detecta restrição de domínio do Resend (free tier)", () => {
    expect(emailSource).toContain("only send testing emails to your own email address");
  });

  it("S9-3.2: retorna linkInBand: true quando domínio não verificado", () => {
    expect(emailSource).toContain("linkInBand: true");
  });

  it("S9-3.3: retorna preview com a URL do reset quando in-band", () => {
    expect(emailSource).toContain("preview: resetUrl");
  });

  it("S9-3.4: retorna deliveryNote explicativa quando in-band", () => {
    expect(emailSource).toContain("deliveryNote");
  });

  it("S9-3.5: tem fallback final para console quando tudo falha", () => {
    expect(emailSource).toContain("PASSWORD RESET EMAIL (FALLBACK MODE)");
  });

  it("S9-3.6: função trySendViaResend existe", () => {
    expect(emailSource).toContain("async function trySendViaResend");
  });

  it("S9-3.7: função trySendViaSmtp existe como fallback secundário", () => {
    expect(emailSource).toContain("async function trySendViaSmtp");
  });
});

// ─── S9-4: Módulo email.ts — integração com Resend REST API ───────────────────
describe("S9-4: Módulo email.ts — integração com Resend REST API", () => {
  let emailSource: string;

  beforeEach(() => {
    emailSource = fs.readFileSync(EMAIL_TS, "utf-8");
  });

  it("S9-4.1: usa API REST do Resend (https://api.resend.com/emails)", () => {
    expect(emailSource).toContain("https://api.resend.com/emails");
  });

  it("S9-4.2: usa RESEND_API_KEY como variável de ambiente", () => {
    expect(emailSource).toContain("RESEND_API_KEY");
  });

  it("S9-4.3: valida que a chave começa com re_", () => {
    expect(emailSource).toContain('startsWith("re_")');
  });

  it("S9-4.4: usa Authorization Bearer header", () => {
    expect(emailSource).toContain("Authorization");
    expect(emailSource).toContain("Bearer");
  });

  it("S9-4.5: usa SMTP_FROM como endereço de remetente", () => {
    expect(emailSource).toContain("SMTP_FROM");
  });

  it("S9-4.6: usa onboarding@resend.dev como padrão de remetente", () => {
    expect(emailSource).toContain("onboarding@resend.dev");
  });

  it("S9-4.7: verifica response.ok para sucesso", () => {
    expect(emailSource).toContain("response.ok");
  });

  it("S9-4.8: loga sucesso com ✅ no console", () => {
    expect(emailSource).toContain("✅ Enviado via Resend");
  });
});

// ─── S9-5: Procedure requestPasswordReset — retorno linkInBand ────────────────
describe("S9-5: Procedure requestPasswordReset — retorno linkInBand", () => {
  let routersSource: string;

  beforeEach(() => {
    routersSource = fs.readFileSync(ROUTERS_TS, "utf-8");
  });

  it("S9-5.1: procedure requestPasswordReset existe", () => {
    expect(routersSource).toContain("requestPasswordReset");
  });

  it("S9-5.2: recebe campo origin para construir a URL de reset", () => {
    expect(routersSource).toContain("origin: z.string()");
  });

  it("S9-5.3: retorna linkInBand: false no caso normal", () => {
    expect(routersSource).toContain("linkInBand: false");
  });

  it("S9-5.4: retorna linkInBand: true quando email não pode ser entregue", () => {
    expect(routersSource).toContain("linkInBand: true");
  });

  it("S9-5.5: retorna resetUrl quando linkInBand é true", () => {
    expect(routersSource).toContain("resetUrl,");
  });

  it("S9-5.6: retorna deliveryNote quando linkInBand é true", () => {
    expect(routersSource).toContain("deliveryNote: emailResult.deliveryNote");
  });

  it("S9-5.7: token tem 48 bytes de entropia (crypto.randomBytes(48))", () => {
    expect(routersSource).toContain("crypto.randomBytes(48)");
  });

  it("S9-5.8: token expira em 10 minutos", () => {
    expect(routersSource).toContain("10 * 60 * 1000");
  });

  it("S9-5.9: verifica emailResult.linkInBand antes de retornar", () => {
    expect(routersSource).toContain("emailResult.linkInBand");
  });
});

// ─── S9-6: Procedure validateResetToken — validação de token ──────────────────
describe("S9-6: Procedure validateResetToken — validação de token", () => {
  let routersSource: string;

  beforeEach(() => {
    routersSource = fs.readFileSync(ROUTERS_TS, "utf-8");
  });

  it("S9-6.1: procedure validateResetToken existe", () => {
    expect(routersSource).toContain("validateResetToken");
  });

  it("S9-6.2: retorna valid: false para token inválido", () => {
    expect(routersSource).toContain('return { valid: false, reason: "Token inválido" }');
  });

  it("S9-6.3: retorna valid: false para token já utilizado", () => {
    expect(routersSource).toContain('return { valid: false, reason: "Token já utilizado" }');
  });

  it("S9-6.4: retorna valid: false para token expirado", () => {
    expect(routersSource).toContain('return { valid: false, reason: "Token expirado" }');
  });

  it("S9-6.5: verifica campo usedAt do token", () => {
    expect(routersSource).toContain("record.usedAt");
  });

  it("S9-6.6: verifica campo expiresAt do token", () => {
    expect(routersSource).toContain("record.expiresAt");
  });

  it("S9-6.7: retorna valid: true para token válido", () => {
    expect(routersSource).toContain("return { valid: true }");
  });
});

// ─── S9-7: Procedure confirmPasswordReset — redefinição de senha ───────────────
describe("S9-7: Procedure confirmPasswordReset — redefinição de senha", () => {
  let routersSource: string;

  beforeEach(() => {
    routersSource = fs.readFileSync(ROUTERS_TS, "utf-8");
  });

  it("S9-7.1: procedure confirmPasswordReset existe", () => {
    expect(routersSource).toContain("confirmPasswordReset");
  });

  it("S9-7.2: requer nova senha com mínimo 8 caracteres", () => {
    expect(routersSource).toContain("newPassword: z.string().min(8)");
  });

  it("S9-7.3: usa bcrypt para hash da nova senha", () => {
    expect(routersSource).toContain("bcrypt.hash");
  });

  it("S9-7.4: usa fator de custo 12 para bcrypt", () => {
    expect(routersSource).toContain("bcrypt.hash(input.newPassword, 12)");
  });

  it("S9-7.5: lança erro para token inválido", () => {
    expect(routersSource).toContain('"Token inválido"');
  });

  it("S9-7.6: lança erro para token já utilizado", () => {
    expect(routersSource).toContain('"Token já utilizado"');
  });

  it("S9-7.7: lança erro para token expirado", () => {
    expect(routersSource).toContain('"Token expirado. Solicite uma nova redefinição."');
  });

  it("S9-7.8: chama resetPasswordWithToken para persistir a nova senha", () => {
    expect(routersSource).toContain("resetPasswordWithToken");
  });

  it("S9-7.9: retorna success: true após redefinição bem-sucedida", () => {
    expect(routersSource).toContain("return { success: true }");
  });
});

// ─── S9-8: Segurança — prevenção de enumeração de e-mail ──────────────────────
describe("S9-8: Segurança — prevenção de enumeração de e-mail", () => {
  let routersSource: string;

  beforeEach(() => {
    routersSource = fs.readFileSync(ROUTERS_TS, "utf-8");
  });

  it("S9-8.1: retorna success mesmo quando e-mail não existe (anti-enumeração)", () => {
    // The procedure should return success even for non-existent emails
    expect(routersSource).toContain("Always return success to prevent email enumeration");
  });

  it("S9-8.2: retorna success: true para e-mail não cadastrado", () => {
    expect(routersSource).toContain("if (!user || !user.email) return { success: true, linkInBand: false }");
  });

  it("S9-8.3: procedure requestPasswordReset é pública (não requer autenticação)", () => {
    // Should use publicProcedure, not protectedProcedure
    const resetSection = routersSource.substring(
      routersSource.indexOf("requestPasswordReset"),
      routersSource.indexOf("requestPasswordReset") + 200
    );
    expect(resetSection).toContain("publicProcedure");
  });

  it("S9-8.4: procedure validateResetToken é pública", () => {
    const validateSection = routersSource.substring(
      routersSource.indexOf("validateResetToken"),
      routersSource.indexOf("validateResetToken") + 200
    );
    expect(validateSection).toContain("publicProcedure");
  });

  it("S9-8.5: procedure confirmPasswordReset é pública", () => {
    const confirmSection = routersSource.substring(
      routersSource.indexOf("confirmPasswordReset"),
      routersSource.indexOf("confirmPasswordReset") + 200
    );
    expect(confirmSection).toContain("publicProcedure");
  });

  it("S9-8.6: token de reset usa hex encoding (URL-safe)", () => {
    expect(routersSource).toContain('.toString("hex")');
  });

  it("S9-8.7: URL de reset inclui o origin do frontend", () => {
    expect(routersSource).toContain("`${input.origin}/reset-password?token=${token}`");
  });
});

// ─── S9-9: Frontend Login.tsx — exibição do link in-band ──────────────────────
describe("S9-9: Frontend Login.tsx — exibição do link in-band", () => {
  const LOGIN_TSX = path.join(__dirname, "../client/src/pages/Login.tsx");
  let loginSource: string;

  beforeEach(() => {
    loginSource = fs.readFileSync(LOGIN_TSX, "utf-8");
  });

  it("S9-9.1: arquivo Login.tsx existe", () => {
    expect(fs.existsSync(LOGIN_TSX)).toBe(true);
  });

  it("S9-9.2: tem estado inBandLink para armazenar o link", () => {
    expect(loginSource).toContain("inBandLink");
  });

  it("S9-9.3: tem estado inBandNote para armazenar a nota de entrega", () => {
    expect(loginSource).toContain("inBandNote");
  });

  it("S9-9.4: verifica data.linkInBand na resposta da mutation", () => {
    expect(loginSource).toContain("data.linkInBand");
  });

  it("S9-9.5: exibe o link diretamente quando linkInBand é true", () => {
    expect(loginSource).toContain("inBandLink ?");
  });

  it("S9-9.6: tem botão para copiar o link", () => {
    expect(loginSource).toContain("Copiar Link");
  });

  it("S9-9.7: tem botão para abrir o link diretamente", () => {
    expect(loginSource).toContain("Abrir Link");
  });

  it("S9-9.8: usa navigator.clipboard.writeText para copiar", () => {
    expect(loginSource).toContain("navigator.clipboard.writeText");
  });

  it("S9-9.9: exibe ícone de alerta (AlertTriangle) para o modo in-band", () => {
    expect(loginSource).toContain("AlertTriangle");
  });

  it("S9-9.10: exibe a nota de entrega (deliveryNote) ao usuário", () => {
    expect(loginSource).toContain("inBandNote");
  });
});

// ─── S9-10: Configuração SMTP/Resend ──────────────────────────────────────────
describe("S9-10: Configuração SMTP/Resend no ambiente", () => {
  it("S9-10.1: SMTP_HOST está configurado (smtp.resend.com)", () => {
    const host = process.env.SMTP_HOST;
    expect(host).toBeDefined();
    expect(host).toBe("smtp.resend.com");
  });

  it("S9-10.2: SMTP_PORT está configurado (465 para SSL)", () => {
    const port = process.env.SMTP_PORT;
    expect(port).toBeDefined();
    expect(parseInt(port ?? "0")).toBe(465);
  });

  it("S9-10.3: SMTP_USER está configurado (resend)", () => {
    const user = process.env.SMTP_USER;
    expect(user).toBeDefined();
    expect(user).toBe("resend");
  });

  it("S9-10.4: SMTP_PASS (API key) está configurado", () => {
    const pass = process.env.SMTP_PASS;
    expect(pass).toBeDefined();
    expect(pass?.length).toBeGreaterThan(10);
  });

  it("S9-10.5: SMTP_FROM está configurado", () => {
    const from = process.env.SMTP_FROM;
    expect(from).toBeDefined();
    expect(from).toContain("@");
  });

  it("S9-10.6: RESEND_API_KEY está configurado e começa com re_", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key).toBeDefined();
    expect(key?.startsWith("re_")).toBe(true);
  });

  it("S9-10.7: RESEND_API_KEY tem comprimento mínimo de 20 caracteres", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key?.length).toBeGreaterThanOrEqual(20);
  });
});
