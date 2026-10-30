import { createHash, timingSafeEqual } from "node:crypto";

// The desktop AI Office reads a status snapshot with a static bearer token, so
// it never needs a Supabase session. Short tokens are refused outright.
export function verifyOfficeToken(secret: string, authorization: string | null) {
  const match = /^Bearer (\S+)$/i.exec(authorization ?? "");
  if (secret.length < 32 || !match) return false;
  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(match[1]).digest();
  return timingSafeEqual(expected, actual);
}
