import { describe, expect, it } from "vitest";
import { stableOidcOpenId } from "./socialOidcService";

describe("stableOidcOpenId", () => {
  it("is 64 hex chars and stable per provider+sub", () => {
    const a = stableOidcOpenId("google", "sub-123");
    const b = stableOidcOpenId("google", "sub-123");
    const c = stableOidcOpenId("microsoft", "sub-123");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(c).not.toBe(a);
  });
});
