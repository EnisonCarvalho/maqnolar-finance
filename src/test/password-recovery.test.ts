import { describe, expect, it } from "vitest";
import {
  classifyPasswordUpdateError,
  classifyResetRequestError,
  parseRecoveryUrl,
} from "@/lib/password-recovery";

describe("parseRecoveryUrl", () => {
  it("detects expired otp error in URL hash", () => {
    const res = parseRecoveryUrl(
      "",
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    expect(res.kind).toBe("error");
    if (res.kind === "error") {
      expect(res.code).toBe("otp_expired");
      expect(res.message).toContain("expirou");
    }
  });

  it("detects implicit recovery session in URL hash", () => {
    const res = parseRecoveryUrl("", "#access_token=abc&refresh_token=def&type=recovery");
    expect(res).toEqual({ kind: "session_url" });
  });

  it("detects PKCE code in search params without treating as token_hash", () => {
    const res = parseRecoveryUrl("?code=pkce-123", "");
    expect(res).toEqual({ kind: "session_url" });
  });

  it("detects direct token_hash recovery link", () => {
    const res = parseRecoveryUrl("?token_hash=hash123&type=recovery", "");
    expect(res).toEqual({ kind: "token_hash", tokenHash: "hash123" });
  });

  it("returns none when URL has no recovery params", () => {
    expect(parseRecoveryUrl("", "")).toEqual({ kind: "none" });
  });
});

describe("classifyPasswordUpdateError", () => {
  it("does not mark same_password as expired link", () => {
    const res = classifyPasswordUpdateError({
      code: "same_password",
      message: "New password should be different from the old password.",
    });
    expect(res.expired).toBe(false);
    expect(res.message).toContain("diferente");
  });

  it("does not mark weak_password as expired link", () => {
    const res = classifyPasswordUpdateError({
      code: "weak_password",
      message: "Password should be at least 8 characters.",
    });
    expect(res.expired).toBe(false);
  });

  it("marks missing session as expired link", () => {
    const res = classifyPasswordUpdateError({
      message: "Auth session missing!",
    });
    expect(res.expired).toBe(true);
  });
});

describe("classifyResetRequestError", () => {
  it("explains rate limit clearly on 429", () => {
    const msg = classifyResetRequestError({ status: 429, code: "over_email_send_rate_limit" });
    expect(msg).toContain("Aguarde");
  });
});