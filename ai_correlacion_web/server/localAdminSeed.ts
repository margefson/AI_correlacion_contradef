import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import * as db from "./db";
import { ENV } from "./_core/env";

/**
 * Garante uma conta admin para login local (email + palavra-passe).
 * Predefinição: margefson@gmail.com / 123456 — altere com DEFAULT_LOCAL_ADMIN_* no .env.
 * Só corre com AUTH_MODE=local.
 */
export async function seedDefaultLocalAdminIfNeeded(): Promise<void> {
  if (ENV.authMode !== "local" || !process.env.DATABASE_URL) {
    return;
  }

  const email = (process.env.DEFAULT_LOCAL_ADMIN_EMAIL ?? "margefson@gmail.com")
    .trim()
    .toLowerCase();
  const password = process.env.DEFAULT_LOCAL_ADMIN_PASSWORD ?? "123456";

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const existing = await db.getUserByEmail(email);

    if (existing) {
      await db.upsertUser({
        openId: existing.openId,
        name: existing.name ?? "Admin",
        email,
        // Não redefinir a senha a cada arranque; só se ainda não houver hash (ex.: migrado de OAuth).
        ...(existing.passwordHash ? {} : { passwordHash }),
        role: "admin",
        loginMethod: "local",
        lastSignedIn: new Date(),
      });
      console.log(
        `[Auth] Conta admin local: ${email} (role admin).` +
          (existing.passwordHash ? " Palavra-passe existente mantida." : " Palavra-passe inicial definida.")
      );
      return;
    }

    await db.createLocalUser({
      openId: `local_seed_${nanoid(16)}`,
      name: "Admin",
      email,
      passwordHash,
      role: "admin",
    });
    console.log(
      `[Auth] Conta admin local criada: ${email} — inicie com a palavra-passe de DEFAULT_LOCAL_ADMIN_PASSWORD (pré-def.: 123456).`
    );
  } catch (e) {
    console.warn("[Auth] Não foi possível criar/atualizar a conta admin local:", e);
  }
}
