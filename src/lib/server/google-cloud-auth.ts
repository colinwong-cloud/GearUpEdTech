import { createSign } from "node:crypto";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

let cachedToken: { accessToken: string; expiresAtMs: number } | null = null;

function parseServiceAccountJson(): ServiceAccount | null {
  const raw =
    process.env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

async function fetchGoogleAccessToken(): Promise<string | null> {
  const sa = parseServiceAccountJson();
  if (!sa?.client_email || !sa.private_key) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-translation https://www.googleapis.com/auth/cloud-platform",
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const sign = createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(sa.private_key);
  const jwt = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = {
    accessToken: data.access_token,
    expiresAtMs: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return data.access_token;
}

export function getGoogleCloudProjectId(): string | null {
  const sa = parseServiceAccountJson();
  if (sa?.project_id) return sa.project_id;
  const envProject = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  return envProject || null;
}

export async function getGoogleCloudAccessToken(): Promise<string | null> {
  return fetchGoogleAccessToken();
}

export function googleCredentialsConfigured(): boolean {
  return Boolean(parseServiceAccountJson()?.client_email);
}
