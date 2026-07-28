import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  decryptGitHubOAuthState,
  encryptGitHubOAuthState,
} from "@/lib/finance-crypto";

export const FINANCE_GITHUB_PKCE_COOKIE =
  "understory_finance_github_pkce";
export const FINANCE_GITHUB_CALLBACK_PATH =
  "/api/team-hub/finance/session/github/callback";

const PKCE_STORAGE_KEY = "understory-finance-github";
const PKCE_TTL_MS = 10 * 60 * 1000;

type StorageValues = Record<string, string>;

type SealedPkceState = {
  version: 1;
  callbackUrl: string;
  expiresAt: number;
  storage: StorageValues;
};

export class FinanceGitHubAuthError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 403 | 500 | 503,
    public readonly code: string,
  ) {
    super(message);
    this.name = "FinanceGitHubAuthError";
  }
}

function supabaseConfiguration() {
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new FinanceGitHubAuthError(
      "Supabase authentication is not configured.",
      503,
      "NOT_CONFIGURED",
    );
  }
  return { supabaseUrl, anonKey };
}

function memoryStorage(initial: StorageValues = {}) {
  const values = new Map(Object.entries(initial));
  return {
    storage: {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
      removeItem(key: string) {
        values.delete(key);
      },
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

function authClient(storage: ReturnType<typeof memoryStorage>["storage"]) {
  const { supabaseUrl, anonKey } = supabaseConfiguration();
  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
      persistSession: true,
      storage,
      storageKey: PKCE_STORAGE_KEY,
    },
  });
}

function parseSealedState(value: string, callbackUrl: string) {
  let state: SealedPkceState;
  try {
    state = JSON.parse(decryptGitHubOAuthState(value)) as SealedPkceState;
  } catch {
    throw new FinanceGitHubAuthError(
      "The GitHub sign-in attempt is invalid or expired.",
      400,
      "INVALID_PKCE_STATE",
    );
  }

  if (
    typeof state !== "object" ||
    state === null ||
    state.version !== 1 ||
    state.callbackUrl !== callbackUrl ||
    state.expiresAt <= Date.now() ||
    typeof state.storage !== "object" ||
    state.storage === null
  ) {
    throw new FinanceGitHubAuthError(
      "The GitHub sign-in attempt is invalid or expired.",
      400,
      "INVALID_PKCE_STATE",
    );
  }
  return state;
}

export async function startFinanceGitHubOAuth(callbackUrl: string) {
  const store = memoryStorage();
  const client = authClient(store.storage);
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
    },
  });
  const storage = store.snapshot();
  const hasCodeVerifier = Object.keys(storage).some((key) =>
    key.endsWith("-code-verifier"),
  );

  if (error || !data.url || !hasCodeVerifier) {
    throw new FinanceGitHubAuthError(
      "Could not start GitHub sign-in.",
      503,
      "OAUTH_START_FAILED",
    );
  }

  return {
    authorizationUrl: data.url,
    sealedState: encryptGitHubOAuthState(
      JSON.stringify({
        version: 1,
        callbackUrl,
        expiresAt: Date.now() + PKCE_TTL_MS,
        storage,
      } satisfies SealedPkceState),
    ),
    expiresAt: new Date(Date.now() + PKCE_TTL_MS),
  };
}

export async function completeFinanceGitHubOAuth(input: {
  code: string;
  callbackUrl: string;
  sealedState: string;
}) {
  const state = parseSealedState(input.sealedState, input.callbackUrl);
  const store = memoryStorage(state.storage);
  const client = authClient(store.storage);
  const { data, error } = await client.auth.exchangeCodeForSession(input.code);

  if (error || !data.session?.access_token || !data.user) {
    throw new FinanceGitHubAuthError(
      "GitHub sign-in could not be completed. Start again.",
      400,
      "OAUTH_EXCHANGE_FAILED",
    );
  }

  const { data: verified, error: verifyError } = await client.auth.getUser(
    data.session.access_token,
  );
  const isGitHubIdentity = verified.user?.identities?.some(
    (identity) => identity.provider === "github",
  );

  if (verifyError || !verified.user || !isGitHubIdentity) {
    throw new FinanceGitHubAuthError(
      "A verified GitHub account is required.",
      403,
      "GITHUB_IDENTITY_REQUIRED",
    );
  }

  return { userId: verified.user.id };
}
