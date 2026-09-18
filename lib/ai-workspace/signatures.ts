import { createHmac, timingSafeEqual } from "node:crypto";

export function signAiPayload(secret: string, timestamp: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyAiPayload(input: { secret: string; timestamp: string | null; signature: string | null; body: string; now?: number }) {
  const { secret, timestamp, signature, body, now = Date.now() } = input;
  if (secret.length < 32 || !timestamp || !signature || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  if (Math.abs(now - Number(timestamp) * 1000) > 300_000) return false;
  const expected = Buffer.from(signAiPayload(secret, timestamp, body), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
