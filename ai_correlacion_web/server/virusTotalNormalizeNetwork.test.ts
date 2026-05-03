import { describe, expect, it } from "vitest";

import {
  normalizeVirusTotalDomain,
  normalizeVirusTotalIp,
} from "./virusTotalNormalizeNetwork";

describe("normalizeVirusTotalDomain", () => {
  it("aceita hostname simples ou URL com http/https (usa só hostname)", () => {
    expect(normalizeVirusTotalDomain("  Corp.Example.INVALID. ")).toEqual({
      ok: true,
      domain: "corp.example.invalid",
    });
    expect(
      normalizeVirusTotalDomain("https://Beacon.Subdominio.Example.INVALID/z"),
    ).toEqual({ ok: true, domain: "beacon.subdominio.example.invalid" });
  });

  it("rejeita IPs no campo domínio", () => {
    const r = normalizeVirusTotalDomain("203.0.113.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/IP|Consultar IP/i);
  });
});

describe("normalizeVirusTotalIp", () => {
  it("normaliza IPv4 e IPv6 (com ou sem parênteses rectos)", () => {
    expect(normalizeVirusTotalIp("  203.0.113.4 ")).toEqual({ ok: true, ip: "203.0.113.4" });
    expect(normalizeVirusTotalIp("[2001:db8::1]")).toEqual({ ok: true, ip: "2001:db8::1" });
  });

  it("rejeita hostname no campo IP", () => {
    const r = normalizeVirusTotalIp("evil.invalid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/domínio/i);
  });
});
