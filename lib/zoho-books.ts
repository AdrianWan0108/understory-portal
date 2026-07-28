import "server-only";

import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, sha256 } from "@/lib/finance-crypto";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  ZOHO_READ_ONLY_SCOPES,
  buildFinanceDashboard,
  requestRefreshedZohoToken,
  safeConnectionStatus,
  validateOAuthStateRecord,
  type FinanceDashboard,
  type ZohoBill,
  type ZohoExpense,
  type ZohoInvoice,
  type ZohoTokenResponse,
} from "@/lib/zoho-core";

const CACHE_SECONDS = 5 * 60;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;
const MAX_PAGES = 100;

type ConnectionRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  organization_currency_code: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  access_token_expires_at: string;
  granted_scopes: string[];
  cached_dashboard: FinanceDashboard | null;
  cache_expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type Organization = {
  organization_id: string;
  name: string;
  currency_code?: string;
  is_default_org?: boolean;
};

type PageContext = {
  has_more_page?: boolean;
  page?: number;
};

export class ZohoBooksError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code = "ZOHO_ERROR",
  ) {
    super(message);
    this.name = "ZohoBooksError";
  }
}

function zohoConfig() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const redirectUri = process.env.ZOHO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new ZohoBooksError(
      "Zoho Books OAuth is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    accountsDomain:
      process.env.ZOHO_ACCOUNTS_DOMAIN ?? "https://accounts.zohocloud.ca",
    booksBaseUrl:
      process.env.ZOHO_BOOKS_BASE_URL ??
      "https://www.zohoapis.ca/books/v3",
    organizationName: process.env.ZOHO_ORGANIZATION_NAME?.trim() || null,
  };
}

async function connection(): Promise<ConnectionRow | null> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ZohoBooksError(
      "Finance storage is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  const { data, error } = await admin
    .from("zoho_books_connections")
    .select(
      "id, organization_id, organization_name, organization_currency_code, encrypted_access_token, encrypted_refresh_token, access_token_expires_at, granted_scopes, cached_dashboard, cache_expires_at, last_synced_at, created_at, updated_at",
    )
    .eq("singleton", true)
    .maybeSingle();

  if (error) {
    throw new ZohoBooksError(
      "Could not read the Zoho connection.",
      503,
      "STORAGE_ERROR",
    );
  }
  return data as ConnectionRow | null;
}

export async function getZohoConnectionStatus() {
  const row = await connection();
  return safeConnectionStatus(row);
}

async function refreshAccessToken(row: ConnectionRow) {
  const config = zohoConfig();
  let payload;
  try {
    payload = await requestRefreshedZohoToken(fetch, {
      accountsDomain: config.accountsDomain,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      refreshToken: decryptSecret(row.encrypted_refresh_token),
    });
  } catch {
    throw new ZohoBooksError(
      "The Zoho Books connection has expired. Reconnect it to continue.",
      502,
      "REFRESH_FAILED",
    );
  }

  const expiresAt = new Date(
    Date.now() + (payload.expires_in ?? 3600) * 1000,
  ).toISOString();
  const encryptedAccessToken = encryptSecret(payload.access_token);
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ZohoBooksError(
      "Finance storage is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  const { error } = await admin
    .from("zoho_books_connections")
    .update({
      encrypted_access_token: encryptedAccessToken,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    throw new ZohoBooksError(
      "The refreshed Zoho token could not be stored.",
      503,
      "STORAGE_ERROR",
    );
  }

  row.encrypted_access_token = encryptedAccessToken;
  row.access_token_expires_at = expiresAt;
  return payload.access_token;
}

async function accessToken(row: ConnectionRow, forceRefresh = false) {
  const needsRefresh =
    forceRefresh ||
    Date.parse(row.access_token_expires_at) <=
      Date.now() + TOKEN_REFRESH_BUFFER_MS;

  return needsRefresh
    ? refreshAccessToken(row)
    : decryptSecret(row.encrypted_access_token);
}

function mapZohoFailure(status: number) {
  if (status === 401) {
    return new ZohoBooksError(
      "Zoho Books rejected the connection. Reconnect it to continue.",
      502,
      "UNAUTHORIZED",
    );
  }
  if (status === 429) {
    return new ZohoBooksError(
      "Zoho Books is rate limiting requests. Try again shortly.",
      429,
      "RATE_LIMITED",
    );
  }
  if (status >= 500) {
    return new ZohoBooksError(
      "Zoho Books is temporarily unavailable.",
      502,
      "UPSTREAM_UNAVAILABLE",
    );
  }
  return new ZohoBooksError(
    "Zoho Books could not complete the read-only request.",
    502,
    "UPSTREAM_ERROR",
  );
}

async function booksRequest<T>(
  row: ConnectionRow,
  path: string,
  query: URLSearchParams,
  retry = true,
): Promise<T> {
  const config = zohoConfig();
  query.set("organization_id", row.organization_id);
  const url = `${config.booksBaseUrl.replace(/\/$/, "")}/${path.replace(
    /^\//,
    "",
  )}?${query.toString()}`;
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${await accessToken(row)}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new ZohoBooksError(
      "Could not reach Zoho Books.",
      502,
      "NETWORK_ERROR",
    );
  }

  if (response.status === 401 && retry) {
    await accessToken(row, true);
    return booksRequest<T>(row, path, query, false);
  }
  if (!response.ok) throw mapZohoFailure(response.status);

  const payload = (await response.json().catch(() => null)) as
    | (T & { code?: number; message?: string })
    | null;
  if (!payload || (payload.code !== undefined && payload.code !== 0)) {
    throw new ZohoBooksError(
      "Zoho Books returned an invalid response.",
      502,
      "INVALID_RESPONSE",
    );
  }
  return payload;
}

async function paginated<T>(
  row: ConnectionRow,
  path: string,
  collection: string,
) {
  const records: T[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      page: String(page),
      per_page: "200",
    });
    const payload = await booksRequest<
      Record<string, unknown> & { page_context?: PageContext }
    >(row, path, query);
    const pageRows = payload[collection];
    if (!Array.isArray(pageRows)) {
      throw new ZohoBooksError(
        "Zoho Books returned an invalid list response.",
        502,
        "INVALID_RESPONSE",
      );
    }
    records.push(...(pageRows as T[]));

    if (!payload.page_context?.has_more_page) return records;
  }

  throw new ZohoBooksError(
    "Zoho Books returned too many pages for one refresh.",
    502,
    "PAGINATION_LIMIT",
  );
}

export async function getFinanceDashboard(forceRefresh = false) {
  const row = await connection();
  if (!row) {
    throw new ZohoBooksError(
      "Zoho Books is not connected.",
      409,
      "DISCONNECTED",
    );
  }

  if (
    !forceRefresh &&
    row.cached_dashboard &&
    row.cache_expires_at &&
    Date.parse(row.cache_expires_at) > Date.now()
  ) {
    return row.cached_dashboard;
  }

  const [invoices, expenses, bills] = await Promise.all([
    paginated<ZohoInvoice>(row, "invoices", "invoices"),
    paginated<ZohoExpense>(row, "expenses", "expenses"),
    paginated<ZohoBill>(row, "bills", "bills"),
  ]);
  const dashboard = buildFinanceDashboard({
    invoices,
    expenses,
    bills,
    organizationCurrencyCode: row.organization_currency_code,
  });
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ZohoBooksError(
      "Finance storage is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  const { error } = await admin
    .from("zoho_books_connections")
    .update({
      cached_dashboard: dashboard,
      cache_expires_at: new Date(
        Date.now() + CACHE_SECONDS * 1000,
      ).toISOString(),
      last_synced_at: dashboard.lastRefreshedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    throw new ZohoBooksError(
      "Finance data loaded but its cache could not be updated.",
      503,
      "STORAGE_ERROR",
    );
  }
  return dashboard;
}

export async function createZohoAuthorizationUrl(userId: string) {
  const config = zohoConfig();
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ZohoBooksError(
      "Finance storage is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  const state = randomBytes(32).toString("base64url");
  const { error } = await admin.from("zoho_oauth_states").insert({
    state_hash: sha256(state),
    user_id: userId,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) {
    throw new ZohoBooksError(
      "Could not start the Zoho connection.",
      503,
      "STORAGE_ERROR",
    );
  }

  const url = new URL(
    "/oauth/v2/auth",
    `${config.accountsDomain.replace(/\/$/, "")}/`,
  );
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: ZOHO_READ_ONLY_SCOPES.join(","),
    access_type: "offline",
    prompt: "consent",
    state,
  }).toString();
  return url.toString();
}

async function exchangeAuthorizationCode(code: string) {
  const config = zohoConfig();
  const response = await fetch(
    `${config.accountsDomain.replace(/\/$/, "")}/oauth/v2/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        code,
      }),
      cache: "no-store",
    },
  ).catch(() => null);
  const payload = response
    ? ((await response.json().catch(() => ({}))) as ZohoTokenResponse)
    : null;

  if (!response?.ok || !payload?.access_token || payload.error) {
    throw new ZohoBooksError(
      "Zoho did not complete the OAuth connection.",
      502,
      "OAUTH_EXCHANGE_FAILED",
    );
  }
  return payload;
}

async function organizations(accessToken: string) {
  const config = zohoConfig();
  const response = await fetch(
    `${config.booksBaseUrl.replace(/\/$/, "")}/organizations`,
    {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  ).catch(() => null);
  const payload = response
    ? ((await response.json().catch(() => null)) as {
        code?: number;
        organizations?: Organization[];
      } | null)
    : null;

  if (!response?.ok || payload?.code !== 0 || !payload.organizations) {
    throw new ZohoBooksError(
      "Could not read Zoho Books organizations.",
      502,
      "ORGANIZATION_LOOKUP_FAILED",
    );
  }
  return payload.organizations;
}

function selectOrganization(rows: Organization[]) {
  const configuredName = zohoConfig().organizationName;
  if (configuredName) {
    const matches = rows.filter(
      (organization) =>
        organization.name.toLocaleLowerCase() ===
        configuredName.toLocaleLowerCase(),
    );
    if (matches.length !== 1) {
      throw new ZohoBooksError(
        "The configured Zoho Books organization was not found uniquely.",
        409,
        "ORGANIZATION_MISMATCH",
      );
    }
    return matches[0];
  }
  if (rows.length === 1) return rows[0];
  if (rows.length === 0) {
    throw new ZohoBooksError(
      "No Zoho Books organization was found.",
      409,
      "MISSING_ORGANIZATION",
    );
  }
  throw new ZohoBooksError(
    "Multiple Zoho Books organizations were found. Configure ZOHO_ORGANIZATION_NAME.",
    409,
    "MULTIPLE_ORGANIZATIONS",
  );
}

export async function completeZohoOAuth(input: {
  state: string;
  code: string;
  userId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new ZohoBooksError(
      "Finance storage is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  const stateHash = sha256(input.state);
  const { data: stateRecord, error: stateError } = await admin
    .from("zoho_oauth_states")
    .select("state_hash, user_id, expires_at, consumed_at")
    .eq("state_hash", stateHash)
    .maybeSingle();

  if (
    stateError ||
    !validateOAuthStateRecord({
      providedState: input.state,
      expectedStateHash: stateRecord?.state_hash,
      expectedUserId: stateRecord?.user_id,
      currentUserId: input.userId,
      expiresAt: stateRecord?.expires_at,
      consumedAt: stateRecord?.consumed_at,
    })
  ) {
    throw new ZohoBooksError(
      "The Zoho OAuth state is invalid or expired.",
      400,
      "INVALID_OAUTH_STATE",
    );
  }

  const consumedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await admin
    .from("zoho_oauth_states")
    .update({ consumed_at: consumedAt })
    .eq("state_hash", stateHash)
    .is("consumed_at", null)
    .select("state_hash")
    .maybeSingle();
  if (consumeError || !consumed) {
    throw new ZohoBooksError(
      "The Zoho OAuth state has already been used.",
      400,
      "INVALID_OAUTH_STATE",
    );
  }

  const tokens = await exchangeAuthorizationCode(input.code);
  const organization = selectOrganization(
    await organizations(tokens.access_token),
  );
  const existing = await connection();
  const refreshToken =
    tokens.refresh_token ||
    (existing ? decryptSecret(existing.encrypted_refresh_token) : null);
  if (!refreshToken) {
    throw new ZohoBooksError(
      "Zoho did not issue offline access. Reconnect and approve consent.",
      409,
      "MISSING_REFRESH_TOKEN",
    );
  }

  const scopes = (tokens.scope || ZOHO_READ_ONLY_SCOPES.join(" "))
    .split(/[,\s]+/)
    .filter(Boolean);
  const record = {
    singleton: true,
    organization_id: organization.organization_id,
    organization_name: organization.name,
    organization_currency_code: organization.currency_code || "CAD",
    encrypted_access_token: encryptSecret(tokens.access_token),
    encrypted_refresh_token: encryptSecret(refreshToken),
    access_token_expires_at: new Date(
      Date.now() + (tokens.expires_in ?? 3600) * 1000,
    ).toISOString(),
    granted_scopes: scopes,
    cached_dashboard: null,
    cache_expires_at: null,
    updated_at: new Date().toISOString(),
  };

  const write = existing
    ? admin.from("zoho_books_connections").update(record).eq("id", existing.id)
    : admin.from("zoho_books_connections").insert(record);
  const { error: writeError } = await write;
  if (writeError) {
    throw new ZohoBooksError(
      "The Zoho connection could not be stored.",
      503,
      "STORAGE_ERROR",
    );
  }
}
