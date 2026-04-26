import { z } from "zod";

export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  digit: /[0-9]/,
  special: /[^a-zA-Z0-9]/,
} as const;

export function checkPasswordCriteria(password: string) {
  return {
    minLength: password.length >= PASSWORD_RULES.minLength,
    maxLength: password.length <= PASSWORD_RULES.maxLength,
    lowercase: PASSWORD_RULES.lowercase.test(password),
    uppercase: PASSWORD_RULES.uppercase.test(password),
    digit: PASSWORD_RULES.digit.test(password),
    special: PASSWORD_RULES.special.test(password),
  };
}

export function isPasswordValid(password: string): boolean {
  const c = checkPasswordCriteria(password);
  return c.minLength && c.maxLength && c.lowercase && c.uppercase && c.digit && c.special;
}

const strongPassword = z
  .string()
  .refine(
    s => isPasswordValid(s),
    "A senha deve ter 8–128 caracteres e incluir maiúscula, minúscula, número e símbolo."
  );

export const localRegisterInputSchema = z.object({
  name: z.string().trim().min(2, "Nome deve ter pelo menos 2 caracteres.").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Email inválido.")),
  password: strongPassword,
});

export const localLoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Email inválido.")),
  password: z.string().min(1, "Senha é obrigatória."),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, "Indique a palavra-passe actual."),
  newPassword: strongPassword,
});

export const updateProfileInputSchema = z.object({
  name: z.string().trim().min(2, "Nome muito curto.").max(100),
});

export const setUserRoleInputSchema = z.object({
  userId: z.number().int().positive(),
  role: z.enum(["user", "admin"]),
});

export const adminUpdateUserInputSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().trim().min(2, "Nome muito curto.").max(100),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Email inválido.")),
  role: z.enum(["user", "admin"]),
});

export const adminUserIdInputSchema = z.object({
  userId: z.number().int().positive(),
});
