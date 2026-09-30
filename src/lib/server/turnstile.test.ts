import { afterEach, describe, expect, it } from "vitest";
import { verifyTurnstileToken } from "./turnstile";

const originalSecret = process.env.TURNSTILE_SECRET_KEY;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
});

describe("verifyTurnstileToken", () => {
  it("rejects an empty token before calling Cloudflare", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    let called = false;
    const result = await verifyTurnstileToken("  ", null, async () => {
      called = true;
      return new Response(JSON.stringify({ success: true }));
    });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("fails closed when the server secret is missing", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const result = await verifyTurnstileToken("token", null, async () => {
      throw new Error("should not call");
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("accepts a successful Cloudflare response", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstileToken("token", "1.2.3.4", async (_url, init) => {
      const body = String(init?.body ?? "");
      expect(body).toContain("secret=secret");
      expect(body).toContain("response=token");
      expect(body).toContain("remoteip=1.2.3.4");
      return new Response(JSON.stringify({ success: true }));
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects a failed Cloudflare response", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const result = await verifyTurnstileToken("token", null, async () => {
      return new Response(JSON.stringify({ success: false }));
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });
});
