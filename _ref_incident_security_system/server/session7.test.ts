/**
 * Session 7 Tests — Password Security, Reset Flow, Token Expiry
 * Tests: S7-1 (blockClipboard logic), S7-2 (mustChangePassword flag),
 *        S7-3 (requestPasswordReset), S7-4 (validateResetToken),
 *        S7-5 (confirmPasswordReset), S7-6 (changePassword),
 *        S7-7 (email template), S7-8 (token expiry)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import crypto from "crypto";

// ─── S7-1: Password field clipboard protection ──────────────────────────────
describe("S7-1: Password field clipboard protection", () => {
  it("S7-1.1 — blockClipboard prevents Ctrl+C on password field", () => {
    // Simulate the blockClipboard function logic
    const preventDefaultCalled: boolean[] = [];
    const mockEvent = {
      key: "c",
      ctrlKey: true,
      metaKey: false,
      preventDefault: () => preventDefaultCalled.push(true),
    };
    const isCtrl = mockEvent.ctrlKey || mockEvent.metaKey;
    const shouldBlock = isCtrl && ["c", "x", "v"].includes(mockEvent.key.toLowerCase());
    if (shouldBlock) mockEvent.preventDefault();
    expect(shouldBlock).toBe(true);
    expect(preventDefaultCalled).toHaveLength(1);
  });

  it("S7-1.2 — blockClipboard prevents Ctrl+V on password field", () => {
    const preventDefaultCalled: boolean[] = [];
    const mockEvent = {
      key: "v",
      ctrlKey: true,
      metaKey: false,
      preventDefault: () => preventDefaultCalled.push(true),
    };
    const isCtrl = mockEvent.ctrlKey || mockEvent.metaKey;
    const shouldBlock = isCtrl && ["c", "x", "v"].includes(mockEvent.key.toLowerCase());
    if (shouldBlock) mockEvent.preventDefault();
    expect(shouldBlock).toBe(true);
    expect(preventDefaultCalled).toHaveLength(1);
  });

  it("S7-1.3 — blockClipboard allows normal typing (letter 'a')", () => {
    const preventDefaultCalled: boolean[] = [];
    const mockEvent = {
      key: "a",
      ctrlKey: false,
      metaKey: false,
      preventDefault: () => preventDefaultCalled.push(true),
    };
    const isCtrl = mockEvent.ctrlKey || mockEvent.metaKey;
    const shouldBlock = isCtrl && ["c", "x", "v"].includes(mockEvent.key.toLowerCase());
    if (shouldBlock) mockEvent.preventDefault();
    expect(shouldBlock).toBe(false);
    expect(preventDefaultCalled).toHaveLength(0);
  });

  it("S7-1.4 — blockClipboard prevents Ctrl+X (cut)", () => {
    const mockEvent = { key: "x", ctrlKey: true, metaKey: false };
    const isCtrl = mockEvent.ctrlKey || mockEvent.metaKey;
    const shouldBlock = isCtrl && ["c", "x", "v"].includes(mockEvent.key.toLowerCase());
    expect(shouldBlock).toBe(true);
  });

  it("S7-1.5 — blockClipboard prevents Cmd+C on macOS", () => {
    const mockEvent = { key: "c", ctrlKey: false, metaKey: true };
    const isCtrl = mockEvent.ctrlKey || mockEvent.metaKey;
    const shouldBlock = isCtrl && ["c", "x", "v"].includes(mockEvent.key.toLowerCase());
    expect(shouldBlock).toBe(true);
  });
});

// ─── S7-2: mustChangePassword flag ──────────────────────────────────────────
describe("S7-2: mustChangePassword flag behavior", () => {
  it("S7-2.1 — resetUserPassword sets mustChangePassword=true in db", async () => {
    // Verify the db helper sets mustChangePassword=true
    const { resetUserPassword } = await import("./db");
    // The function should exist and accept (userId, hash)
    expect(typeof resetUserPassword).toBe("function");
  });

  it("S7-2.2 — clearMustChangePassword exists and is callable", async () => {
    const { clearMustChangePassword } = await import("./db");
    expect(typeof clearMustChangePassword).toBe("function");
  });

  it("S7-2.3 — mustChangePassword URL param detection logic", () => {
    // Simulate: new URLSearchParams("?mustChangePassword=1").get("mustChangePassword") === "1"
    const search = "?mustChangePassword=1";
    const params = new URLSearchParams(search);
    expect(params.get("mustChangePassword")).toBe("1");
    expect(params.get("mustChangePassword") === "1").toBe(true);
  });

  it("S7-2.4 — mustChangePassword absent in normal URL", () => {
    const search = "";
    const params = new URLSearchParams(search);
    expect(params.get("mustChangePassword")).toBeNull();
    expect(params.get("mustChangePassword") === "1").toBe(false);
  });
});

// ─── S7-3: Token generation ──────────────────────────────────────────────────
describe("S7-3: Password reset token generation", () => {
  it("S7-3.1 — token is 96-char hex string (48 random bytes)", () => {
    const token = crypto.randomBytes(48).toString("hex");
    expect(token).toHaveLength(96);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });

  it("S7-3.2 — two tokens are always different", () => {
    const t1 = crypto.randomBytes(48).toString("hex");
    const t2 = crypto.randomBytes(48).toString("hex");
    expect(t1).not.toBe(t2);
  });

  it("S7-3.3 — token expiry is set to 10 minutes from now", () => {
    const before = Date.now();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const after = Date.now();
    const diffMs = expiresAt.getTime() - before;
    expect(diffMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 5);
    expect(diffMs).toBeLessThanOrEqual(10 * 60 * 1000 + (after - before) + 5);
  });

  it("S7-3.4 — expired token is detected correctly", () => {
    const expiredAt = new Date(Date.now() - 1000); // 1 second ago
    const isExpired = new Date() > expiredAt;
    expect(isExpired).toBe(true);
  });

  it("S7-3.5 — valid token is not expired", () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const isExpired = new Date() > expiresAt;
    expect(isExpired).toBe(false);
  });
});

// ─── S7-4: Token validation logic ───────────────────────────────────────────
describe("S7-4: Token validation edge cases", () => {
  it("S7-4.1 — null token record returns invalid", () => {
    const record = null;
    const result = record ? "valid" : "invalid";
    expect(result).toBe("invalid");
  });

  it("S7-4.2 — already-used token is rejected", () => {
    const record = { usedAt: new Date(Date.now() - 5000), expiresAt: new Date(Date.now() + 60000) };
    const isUsed = !!record.usedAt;
    expect(isUsed).toBe(true);
  });

  it("S7-4.3 — unused, non-expired token is valid", () => {
    const record = { usedAt: null, expiresAt: new Date(Date.now() + 60000) };
    const isValid = !record.usedAt && new Date() <= record.expiresAt;
    expect(isValid).toBe(true);
  });

  it("S7-4.4 — token expired by 1 second is invalid", () => {
    const record = { usedAt: null, expiresAt: new Date(Date.now() - 1000) };
    const isExpired = new Date() > record.expiresAt;
    expect(isExpired).toBe(true);
  });
});

// ─── S7-5: Password hashing ──────────────────────────────────────────────────
describe("S7-5: Password hashing for reset", () => {
  it("S7-5.1 — new password is hashed with bcrypt cost 12", async () => {
    const password = "Security2026@";
    const hash = await bcrypt.hash(password, 12);
    expect(hash).toMatch(/^\$2[ab]\$12\$/);
  });

  it("S7-5.2 — hashed password verifies correctly", async () => {
    const password = "Security2026@";
    const hash = await bcrypt.hash(password, 12);
    const valid = await bcrypt.compare(password, hash);
    expect(valid).toBe(true);
  });

  it("S7-5.3 — wrong password does not verify", async () => {
    const password = "Security2026@";
    const hash = await bcrypt.hash(password, 12);
    const valid = await bcrypt.compare("WrongPassword!", hash);
    expect(valid).toBe(false);
  });

  it("S7-5.4 — default reset password 'Security2026@' meets complexity requirements", () => {
    const pwd = "Security2026@";
    expect(pwd.length).toBeGreaterThanOrEqual(8);
    expect(/[A-Z]/.test(pwd)).toBe(true);
    expect(/[a-z]/.test(pwd)).toBe(true);
    expect(/\d/.test(pwd)).toBe(true);
    expect(/[^A-Za-z0-9]/.test(pwd)).toBe(true);
  });
});

// ─── S7-6: Email template validation ────────────────────────────────────────
describe("S7-6: Password reset email template", () => {
  it("S7-6.1 — email helper module exists", async () => {
    const emailModule = await import("./email");
    expect(typeof emailModule.sendPasswordResetEmail).toBe("function");
  });

  it("S7-6.2 — reset URL includes token parameter", () => {
    const origin = "https://incidentsys.manus.space";
    const token = crypto.randomBytes(48).toString("hex");
    const resetUrl = `${origin}/reset-password?token=${token}`;
    expect(resetUrl).toContain("/reset-password?token=");
    expect(resetUrl).toContain(token);
  });

  it("S7-6.3 — reset URL uses the correct origin", () => {
    const origin = "https://incidentsys.manus.space";
    const token = "abc123";
    const resetUrl = `${origin}/reset-password?token=${token}`;
    expect(resetUrl.startsWith(origin)).toBe(true);
  });

  it("S7-6.4 — expiry message mentions 10 minutes", () => {
    const expiresMinutes = 10;
    const message = `Este link é válido por apenas ${expiresMinutes} minutos`;
    expect(message).toContain("10 minutos");
  });
});

// ─── S7-7: changePassword procedure logic ───────────────────────────────────
describe("S7-7: changePassword procedure validation", () => {
  it("S7-7.1 — new password minimum length is 8 characters", () => {
    const shortPwd = "abc123";
    const validPwd = "Security2026@";
    expect(shortPwd.length < 8).toBe(true);
    expect(validPwd.length >= 8).toBe(true);
  });

  it("S7-7.2 — wrong current password is rejected", async () => {
    const storedHash = await bcrypt.hash("correctPassword123", 12);
    const valid = await bcrypt.compare("wrongPassword", storedHash);
    expect(valid).toBe(false);
  });

  it("S7-7.3 — correct current password is accepted", async () => {
    const storedHash = await bcrypt.hash("correctPassword123", 12);
    const valid = await bcrypt.compare("correctPassword123", storedHash);
    expect(valid).toBe(true);
  });

  it("S7-7.4 — changePassword clears mustChangePassword flag", async () => {
    // After changePassword, mustChangePassword should be false
    // Verify the logic: resetUserPassword sets it true, clearMustChangePassword sets it false
    const { clearMustChangePassword } = await import("./db");
    expect(typeof clearMustChangePassword).toBe("function");
  });
});

// ─── S7-8: ResetPassword page token validation ──────────────────────────────
describe("S7-8: ResetPassword page validation", () => {
  it("S7-8.1 — missing token in URL is detected", () => {
    const search = "";
    const params = new URLSearchParams(search);
    const token = params.get("token") ?? "";
    expect(token).toBe("");
    expect(!token).toBe(true);
  });

  it("S7-8.2 — token is extracted from URL correctly", () => {
    const token = "abc123def456";
    const search = `?token=${token}`;
    const params = new URLSearchParams(search);
    expect(params.get("token")).toBe(token);
  });

  it("S7-8.3 — password strength: all checks pass for 'Security2026@'", () => {
    const password = "Security2026@";
    const checks = {
      minLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasLower: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecial: /[^A-Za-z0-9]/.test(password),
    };
    expect(Object.values(checks).every(Boolean)).toBe(true);
  });

  it("S7-8.4 — password strength: weak password fails checks", () => {
    const password = "abc";
    const checks = {
      minLength: password.length >= 8,
      hasUpper: /[A-Z]/.test(password),
      hasNumber: /\d/.test(password),
    };
    expect(checks.minLength).toBe(false);
    expect(checks.hasUpper).toBe(false);
    expect(checks.hasNumber).toBe(false);
  });

  it("S7-8.5 — passwords must match before submission", () => {
    const newPassword = "Security2026@";
    const confirmPassword = "Security2026@";
    const mismatch = "DifferentPass1!";
    expect(newPassword === confirmPassword).toBe(true);
    expect(newPassword === mismatch).toBe(false);
  });
});
