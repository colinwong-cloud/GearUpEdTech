import { createSign } from "node:crypto";
import { ExternalAccountClient } from "google-auth-library";
import { getVercelOidcToken } from "@vercel/oidc";
import {
  buildExternalAccountClientConfig,
  getGoogleAccessTokenScopes,
  getGoogleCloudProjectIdFromEnv,
  googleCredentialsConfiguredFromEnv,
  readGoogleServiceAccountJson,
  readGoogleWifEnvConfig,
  resolveGoogleCloudAuthMode,
} from "@/lib/server/google-cloud-auth-config";

export type { GoogleCloudAuthMode } from "@/lib/server/google-cloud-auth-config";
export {
  getGoogleCloudProjectIdFromEnv,
  googleCredentialsConfiguredFromEnv,
  resolveGoogleCloudAuthMode,
  readGoogleServiceAccountJson,
  readGoogleWifEnvConfig,
} from "@/lib/server/google-cloud-auth-config";

let cachedToken: { accessToken: string; expiresAtMs: number; mode: string } | null =
  null;

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

async function fetchGoogleAccessTokenViaServiceAccountJson(): Promise<string | null> {
  const sa = readGoogleServiceAccountJson();
  if (!sa) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope: getGoogleAccessTokenScopes().join(" "),
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
  return data.access_token;
}

async function fetchGoogleAccessTokenViaWif(): Promise<string | null> {
  const wif = readGoogleWifEnvConfig();
  if (!wif) return null;

  const clientConfig = buildExternalAccountClientConfig(wif);
  const authClient = ExternalAccountClient.fromJSON({
    ...clientConfig,
    subject_token_supplier: {
      getSubjectToken: () =>
        getVercelOidcToken({
          audience: wif.oidcAudience,
        }),
    },
  });
  if (!authClient) return null;

  const response = await authClient.getAccessToken();
  const token = typeof response === "string" ? response : response?.token;
  return token ?? null;
}

async function fetchGoogleAccessTokenUncached(): Promise<string | null> {
  const mode = resolveGoogleCloudAuthMode();
  if (mode === "service_account_json") {
    return fetchGoogleAccessTokenViaServiceAccountJson();
  }
  if (mode === "wif") {
    return fetchGoogleAccessTokenViaWif();
  }
  return null;
}

export function getGoogleCloudProjectId(): string | null {
  return getGoogleCloudProjectIdFromEnv();
}

export async function getGoogleCloudAccessToken(): Promise<string | null> {
  const mode = resolveGoogleCloudAuthMode();
  if (mode === "none") return null;

  if (cachedToken && cachedToken.mode === mode && cachedToken.expiresAtMs > Date.now() + 60_000) {
    return cachedToken.accessToken;
  }

  const accessToken = await fetchGoogleAccessTokenUncached();
  if (!accessToken) return null;

  cachedToken = {
    accessToken,
    expiresAtMs: Date.now() + 3300 * 1000,
    mode,
  };
  return accessToken;
}

export function googleCredentialsConfigured(): boolean {
  return googleCredentialsConfiguredFromEnv();
}

/** Test hook to reset in-memory token cache. */
export function resetGoogleCloudAccessTokenCacheForTests(): void {
  cachedToken = null;
}
