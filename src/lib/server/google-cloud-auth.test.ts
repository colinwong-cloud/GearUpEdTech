import { describe, expect, it } from "vitest";
import {
  buildDefaultGcpOidcAudience,
  buildExternalAccountClientConfig,
  getGoogleCloudProjectIdFromEnv,
  googleCredentialsConfiguredFromEnv,
  readGoogleServiceAccountJson,
  readGoogleWifEnvConfig,
  resolveGoogleCloudAuthMode,
  toStsAudience,
} from "@/lib/server/google-cloud-auth-config";

describe("google-cloud-auth-config", () => {
  const wifEnv = {
    GCP_PROJECT_NUMBER: "1234567890",
    GCP_SERVICE_ACCOUNT_EMAIL: "gearupquiz@gearupquiz.iam.gserviceaccount.com",
    GCP_WORKLOAD_IDENTITY_POOL_ID: "vercel",
    GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: "vercel",
    GCP_PROJECT_ID: "gearupquiz",
  };

  it("prefers service account JSON over WIF when both are present", () => {
    const env = {
      ...wifEnv,
      GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON: JSON.stringify({
        client_email: "local@dev.iam.gserviceaccount.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
        project_id: "dev-project",
      }),
    };
    expect(resolveGoogleCloudAuthMode(env)).toBe("service_account_json");
    expect(googleCredentialsConfiguredFromEnv(env)).toBe(true);
    expect(getGoogleCloudProjectIdFromEnv(env)).toBe("dev-project");
  });

  it("selects WIF when JSON is absent and required WIF env is complete", () => {
    expect(resolveGoogleCloudAuthMode(wifEnv)).toBe("wif");
    expect(googleCredentialsConfiguredFromEnv(wifEnv)).toBe(true);
    expect(getGoogleCloudProjectIdFromEnv(wifEnv)).toBe("gearupquiz");
  });

  it("returns none when neither JSON nor complete WIF env is set", () => {
    expect(resolveGoogleCloudAuthMode({})).toBe("none");
    expect(googleCredentialsConfiguredFromEnv({})).toBe(false);
  });

  it("builds default OIDC audience and STS audience", () => {
    const oidc = buildDefaultGcpOidcAudience({
      projectNumber: "123",
      poolId: "vercel",
      providerId: "vercel",
    });
    expect(oidc).toBe(
      "https://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/vercel/providers/vercel"
    );
    expect(toStsAudience(oidc)).toBe(
      "//iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/vercel/providers/vercel"
    );
  });

  it("honors GCP_AUDIENCE override on WIF config", () => {
    const custom = "https://iam.googleapis.com/projects/9/locations/global/workloadIdentityPools/p/providers/pr";
    const cfg = readGoogleWifEnvConfig({ ...wifEnv, GCP_AUDIENCE: custom });
    expect(cfg?.oidcAudience).toBe(custom);
    expect(cfg?.stsAudience).toBe(toStsAudience(custom));
  });

  it("builds external account client JSON without private_key", () => {
    const cfg = readGoogleWifEnvConfig(wifEnv)!;
    const external = buildExternalAccountClientConfig(cfg);
    expect(external.type).toBe("external_account");
    expect(external.audience).toContain("//iam.googleapis.com/projects/1234567890");
    expect(external.service_account_impersonation_url).toContain(
      "gearupquiz@gearupquiz.iam.gserviceaccount.com"
    );
    expect(JSON.stringify(external)).not.toContain("private_key");
  });

  it("rejects invalid service account JSON", () => {
    expect(readGoogleServiceAccountJson({ GOOGLE_SERVICE_ACCOUNT_JSON: "not-json" })).toBeNull();
    expect(
      readGoogleServiceAccountJson({
        GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: "x" }),
      })
    ).toBeNull();
  });
});
