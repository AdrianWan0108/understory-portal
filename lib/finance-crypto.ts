import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

function encryptionKey() {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (!configured) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const decoded = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");

  if (decoded.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex.",
    );
  }
  return decoded;
}

function githubOAuthStateKey() {
  const source =
    process.env.TOKEN_ENCRYPTION_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!source) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  }

  return createHash("sha256")
    .update("understory-finance-github-pkce-v1\0", "utf8")
    .update(source, "utf8")
    .digest();
}

function encryptWithKey(plaintext: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

function decryptWithKey(encrypted: string, key: Buffer) {
  const [version, ivValue, tagValue, ciphertextValue] = encrypted.split(".");
  if (
    version !== "v1" ||
    !ivValue ||
    !tagValue ||
    ciphertextValue === undefined
  ) {
    throw new Error("Encrypted secret has an invalid format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptSecret(plaintext: string) {
  return encryptWithKey(plaintext, encryptionKey());
}

export function decryptSecret(encrypted: string) {
  return decryptWithKey(encrypted, encryptionKey());
}

export function encryptGitHubOAuthState(plaintext: string) {
  return encryptWithKey(plaintext, githubOAuthStateKey());
}

export function decryptGitHubOAuthState(encrypted: string) {
  return decryptWithKey(encrypted, githubOAuthStateKey());
}

export function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
