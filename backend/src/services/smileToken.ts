import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Smile tokens are issued by the kiosk's vision service when the customer holds a
 * smile, and redeemed here for the smile discount. The kiosk API is public, so the
 * discount must not be something a client can simply claim:
 *
 *   token = "v1.<nonce>.<issuedAtMs>.<hex HMAC-SHA256(secret, "v1.<nonce>.<issuedAtMs>")>"
 *
 * The secret (SMILE_TOKEN_SECRET) is shared only by the vision service and the API.
 * Each nonce can be redeemed once (unique column on Order), and tokens expire.
 */
const TOKEN_PATTERN = /^v1\.([a-f0-9]{32})\.(\d{13})\.([a-f0-9]{64})$/;
/** Allow for small clock differences between the kiosk PC and the server. */
const FUTURE_SKEW_MS = 60_000;

export interface VerifiedSmile {
  nonce: string;
  issuedAt: number;
}

export function signSmileToken(secret: string, nonce: string, issuedAt: number): string {
  const body = `v1.${nonce}.${issuedAt}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export function verifySmileToken(
  token: string | undefined,
  secret: string | undefined,
  maxAgeMs: number,
  now = Date.now(),
): VerifiedSmile | null {
  if (!token || !secret) return null;
  const match = TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const [, nonce, issued, signature] = match as unknown as [string, string, string, string];
  const expected = createHmac('sha256', secret).update(`v1.${nonce}.${issued}`).digest();
  const given = Buffer.from(signature, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const issuedAt = Number(issued);
  if (issuedAt > now + FUTURE_SKEW_MS || now - issuedAt > maxAgeMs) return null;
  return { nonce, issuedAt };
}
