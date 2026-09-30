type TurnstileVerifyResponse = {
  success?: boolean;
};

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const responseToken = token.trim();
  if (!responseToken) {
    return { ok: false, status: 400, error: "請完成人機驗證。" };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() || "";
  if (!secret) {
    return { ok: false, status: 503, error: "驗證服務未配置。" };
  }

  const body = new URLSearchParams({
    secret,
    response: responseToken,
  });
  const ip = remoteIp?.trim() || "";
  if (ip) body.set("remoteip", ip);

  let payload: TurnstileVerifyResponse;
  try {
    const res = await fetchImpl("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    payload = (await res.json()) as TurnstileVerifyResponse;
  } catch {
    return { ok: false, status: 503, error: "驗證服務暫時未能連線，請稍後再試。" };
  }

  if (!payload.success) {
    return { ok: false, status: 400, error: "人機驗證未通過，請再試一次。" };
  }
  return { ok: true };
}
