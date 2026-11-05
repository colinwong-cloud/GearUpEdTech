export type ServiceAccountJson = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

export type GoogleWifEnvConfig = {
  projectNumber: string;
  serviceAccountEmail: string;
  workloadIdentityPoolId: string;
  workloadIdentityPoolProviderId: string;
  /** OIDC audience passed to getVercelOidcToken (https URL). */
  oidcAudience: string;
  /** External account audience for STS (//iam.googleapis.com/...). */
  stsAudience: string;
  projectId: string | null;
};

export type GoogleCloudAuthMode = "service_account_json" | "wif" | "none";

export type EnvLike = Record<string, string | undefined>;

const TRANSLATION_SCOPES = [
  "https://www.googleapis.com/auth/cloud-translation",
  "https://www.googleapis.com/auth/cloud-platform",
];

export function readGoogleServiceAccountJson(
  env: EnvLike = process.env
): ServiceAccountJson | null {
  const raw =
    env.GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON?.trim() ||
    env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccountJson;
    if (!parsed?.client_email || !parsed?.private_key) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildDefaultGcpOidcAudience(params: {
  projectNumber: string;
  poolId: string;
  providerId: string;
}): string {
  return `https://iam.googleapis.com/projects/${params.projectNumber}/locations/global/workloadIdentityPools/${params.poolId}/providers/${params.providerId}`;
}

export function toStsAudience(oidcAudience: string): string {
  if (oidcAudience.startsWith("https://iam.googleapis.com/")) {
    return oidcAudience.replace("https://", "//");
  }
  if (oidcAudience.startsWith("//iam.googleapis.com/")) {
    return oidcAudience;
  }
  return oidcAudience;
}

export function readGoogleWifEnvConfig(
  env: EnvLike = process.env
): GoogleWifEnvConfig | null {
  const projectNumber = env.GCP_PROJECT_NUMBER?.trim();
  const serviceAccountEmail = env.GCP_SERVICE_ACCOUNT_EMAIL?.trim();
  const workloadIdentityPoolId = env.GCP_WORKLOAD_IDENTITY_POOL_ID?.trim();
  const workloadIdentityPoolProviderId =
    env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID?.trim();

  if (
    !projectNumber ||
    !serviceAccountEmail ||
    !workloadIdentityPoolId ||
    !workloadIdentityPoolProviderId
  ) {
    return null;
  }

  const oidcAudience =
    env.GCP_AUDIENCE?.trim() ||
    buildDefaultGcpOidcAudience({
      projectNumber,
      poolId: workloadIdentityPoolId,
      providerId: workloadIdentityPoolProviderId,
    });

  const projectId =
    env.GCP_PROJECT_ID?.trim() || env.GOOGLE_CLOUD_PROJECT_ID?.trim() || null;

  return {
    projectNumber,
    serviceAccountEmail,
    workloadIdentityPoolId,
    workloadIdentityPoolProviderId,
    oidcAudience,
    stsAudience: toStsAudience(oidcAudience),
    projectId,
  };
}

/** Service account JSON takes precedence when both JSON and WIF env are set. */
export function resolveGoogleCloudAuthMode(
  env: EnvLike = process.env
): GoogleCloudAuthMode {
  if (readGoogleServiceAccountJson(env)) return "service_account_json";
  if (readGoogleWifEnvConfig(env)) return "wif";
  return "none";
}

export function googleCredentialsConfiguredFromEnv(
  env: EnvLike = process.env
): boolean {
  return resolveGoogleCloudAuthMode(env) !== "none";
}

export function getGoogleCloudProjectIdFromEnv(
  env: EnvLike = process.env
): string | null {
  const sa = readGoogleServiceAccountJson(env);
  if (sa?.project_id) return sa.project_id;
  const wif = readGoogleWifEnvConfig(env);
  if (wif?.projectId) return wif.projectId;
  return env.GCP_PROJECT_ID?.trim() || env.GOOGLE_CLOUD_PROJECT_ID?.trim() || null;
}

export function getGoogleAccessTokenScopes(): string[] {
  return [...TRANSLATION_SCOPES];
}

export function buildExternalAccountClientConfig(wif: GoogleWifEnvConfig) {
  return {
    type: "external_account" as const,
    audience: wif.stsAudience,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${wif.serviceAccountEmail}:generateAccessToken`,
    scopes: getGoogleAccessTokenScopes(),
  };
}
