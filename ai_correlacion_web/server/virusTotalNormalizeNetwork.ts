import { isIP } from "node:net";

/**
 * Extrai nome de domínio legível pela VT `/domains/{domain}` — aceita `evil.com`, `evil.com.`,
 * ou `http(s)://host/caminho` (usa apenas o hostname).
 */
export function normalizeVirusTotalDomain(raw: string):
  | { ok: true; domain: string }
  | { ok: false; message: string } {
  let chunk = raw.trim();
  if (!chunk) {
    return { ok: false, message: "Indique um domínio ou um URL com hostname (ex.: evil.com ou https://evil.com/)." };
  }

  if (/^https?:\/\//i.test(chunk)) {
    try {
      chunk = new URL(chunk).hostname;
    } catch {
      return { ok: false, message: "URL inválido — não foi possível extrair o hostname." };
    }
  } else if (chunk.includes("/") || chunk.includes("?")) {
    return {
      ok: false,
      message: 'Use apenas o hostname (ex.: subdomínio.evil.com) ou um URL completo com http/https; não envie apenas o caminho "/…".',
    };
  }

  let host = chunk.toLowerCase().replace(/\.$/, "");
  host = host.replace(/^\*\./, "");

  if (host.length === 0 || host.length > 253) {
    return { ok: false, message: "Domínio vazio ou demasiado longo." };
  }

  /** Evitar usar o campo Domínio com um texto que é apenas um IP — guia para o campo IP. */
  if (isIP(host)) {
    return {
      ok: false,
      message: "Este valor é um endereço IP — use «Consultar IP» em vez de Domínio.",
    };
  }

  const labels = host.split(".");
  if (labels.length < 2 || labels.some((label) => !label.length || label.length > 63)) {
    return { ok: false, message: "Hostname de domínio inválido (ex.: corp.example.invalid)." };
  }

  if (!labels.every((label) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    return { ok: false, message: "O domínio contém caracteres não permitidos (apenas letras, dígitos e hífens)." };
  }

  return { ok: true, domain: host };
}

/**
 * Normaliza texto para `GET /ip_addresses/{ip}` (IPv4 ou IPv6 `[::]` ou sem colchetes).
 */
export function normalizeVirusTotalIp(raw: string):
  | { ok: true; ip: string }
  | { ok: false; message: string } {
  let t = raw.trim();
  if (!t) {
    return { ok: false, message: "Indique um IPv4 (ex.: 203.0.113.42) ou IPv6." };
  }

  if (/^\[.+]$/.test(t)) {
    t = t.slice(1, -1);
  }

  /** Bloqueio explícito: hostname no campo IP → pedir uso do campo Domínio. */
  if (!isIP(t) && /^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]{2,}$/i.test(t)) {
    return { ok: false, message: "Isto parece um hostname — use «Consultar domínio» em vez do campo IP." };
  }

  if (isIP(t) !== 4 && isIP(t) !== 6) {
    return { ok: false, message: "Endereço IPv4 ou IPv6 inválido (verifique dígitos, pontos ou ::)." };
  }

  return { ok: true, ip: t };
}
