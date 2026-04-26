import Joi from "joi";

// ─── Password Rules (exportadas para reuso no frontend) ────────────────────
export const PASSWORD_RULES = {
  minLength: 8,
  maxLength: 128,
  lowercase: /[a-z]/,
  uppercase: /[A-Z]/,
  digit: /[0-9]/,
  special: /[^a-zA-Z0-9]/,
} as const;

/**
 * Verifica quais critérios de senha estão satisfeitos.
 * Retornado como objeto para uso no frontend (checklist visual).
 */
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

/**
 * Retorna true se todos os critérios de senha forem atendidos.
 */
export function isPasswordValid(password: string): boolean {
  const c = checkPasswordCriteria(password);
  return c.minLength && c.maxLength && c.lowercase && c.uppercase && c.digit && c.special;
}

// ─── Auth Schemas ──────────────────────────────────────────────────────────
export const registerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "string.min": "Nome deve ter pelo menos 2 caracteres",
    "string.max": "Nome deve ter no máximo 100 caracteres",
    "any.required": "Nome é obrigatório",
  }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      "string.email": "Email inválido",
      "any.required": "Email é obrigatório",
    }),
  password: Joi.string()
    .min(PASSWORD_RULES.minLength)
    .max(PASSWORD_RULES.maxLength)
    .pattern(PASSWORD_RULES.lowercase, "lowercase")
    .pattern(PASSWORD_RULES.uppercase, "uppercase")
    .pattern(PASSWORD_RULES.digit, "digit")
    .pattern(PASSWORD_RULES.special, "special")
    .required()
    .messages({
      "string.min": `Senha deve ter pelo menos ${PASSWORD_RULES.minLength} caracteres`,
      "string.max": `Senha deve ter no máximo ${PASSWORD_RULES.maxLength} caracteres`,
      "string.pattern.name": "Senha deve conter pelo menos: {{#name}}",
      "any.required": "Senha é obrigatória",
    }),
});

export const loginSchema = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).required().messages({
    "string.email": "Email inválido",
    "any.required": "Email é obrigatório",
  }),
  password: Joi.string().required().messages({
    "any.required": "Senha é obrigatória",
  }),
});

// ─── Incident Schemas ──────────────────────────────────────────────────────
export const createIncidentSchema = Joi.object({
  title: Joi.string().min(3).max(255).required().messages({
    "string.min": "Título deve ter pelo menos 3 caracteres",
    "string.max": "Título deve ter no máximo 255 caracteres",
    "any.required": "Título é obrigatório",
  }),
  description: Joi.string().min(10).max(5000).required().messages({
    "string.min": "Descrição deve ter pelo menos 10 caracteres",
    "string.max": "Descrição deve ter no máximo 5000 caracteres",
    "any.required": "Descrição é obrigatória",
  }),
});

export function validateJoi<T>(schema: Joi.Schema, data: unknown): T {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const messages = error.details.map((d) => d.message).join("; ");
    throw new Error(messages);
  }
  return value as T;
}
