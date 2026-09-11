// Token encryption at rest.
//
// ════════════════════════════════════════════════════════════════════════════
// THE OBLIGATION THIS FILE EXISTS TO MEET
// ════════════════════════════════════════════════════════════════════════════
//
// WHOOP's API terms, as recorded in ICEFALL-INTEGRATIONS.md §1A:
//
//     "must encrypt Whoop data at rest"
//
// A WHOOP access token is WHOOP data — it is the key to a named member's
// recovery, HRV and sleep — so the obligation reaches the token table before
// it reaches any metric. The same treatment is applied to all four vendors
// rather than to WHOOP alone: a table where three columns are plaintext and
// one is not is a table somebody will eventually widen the wrong way, and
// ICEFALL's own house rule ("encrypt tokens at rest") already asks for it.
//
// ════════════════════════════════════════════════════════════════════════════
// WHY IT IS DONE HERE AND NOT IN POSTGRES
// ════════════════════════════════════════════════════════════════════════════
//
// `pgcrypto` would encrypt with a key the database itself holds, which
// protects a stolen backup and nothing else — a SQL injection or a leaked
// service-role key reads the ciphertext and the key in the same breath. Doing
// it in the Edge Function means the key lives in `supabase secrets`, never in
// the database, and a full dump of `health_connections` is inert without it.
//
// The database therefore stores TEXT it cannot interpret, which is also why
// `health_status()` (migration) can be granted to `authenticated` without
// risk: even if that function were widened to return the token column by
// mistake, the browser would receive ciphertext for a key it does not have.
// That is defence in depth, not an excuse to widen it.
//
// ════════════════════════════════════════════════════════════════════════════
// FORMAT
// ════════════════════════════════════════════════════════════════════════════
//
//   v1.<base64url iv>.<base64url ciphertext+tag>
//
// The version prefix is there so a key rotation or an algorithm change can be
// detected rather than guessed at. AES-256-GCM: authenticated, so a tampered
// ciphertext fails to decrypt instead of yielding a token-shaped string.

const KEY_ENV = "HEALTH_TOKEN_KEY";

/**
 * Thrown when the key is absent or malformed.
 *
 * THIS IS NOT RECOVERABLE BY FALLING BACK TO PLAINTEXT. A connection that
 * cannot be stored encrypted is a connection that must not be stored, and the
 * caller turns this into "not available" rather than into a plaintext write.
 */
export class MissingKeyError extends Error {
  constructor(detail: string) {
    super(`${KEY_ENV}: ${detail}`);
  }
}

export function hasTokenKey(): boolean {
  const raw = Deno.env.get(KEY_ENV);
  if (!raw) return false;
  try {
    return decodeKeyBytes(raw).length === 32;
  } catch {
    return false;
  }
}

function decodeKeyBytes(raw: string): Uint8Array<ArrayBuffer> {
  // Accepts standard or URL-safe base64 — a key pasted from a password manager
  // has been seen in both forms, and a silent wrong-key is the worst outcome
  // here (every existing connection stops decrypting at once).
  const normalised = raw.trim().replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalised);
  /* Allocated over an explicit ArrayBuffer, not `new Uint8Array(n)`. The
     shorthand widens to `Uint8Array<ArrayBufferLike>`, which no longer
     satisfies `BufferSource` — SharedArrayBuffer is in that union and WebCrypto
     will not take one. The same applies to every buffer handed to
     crypto.subtle below. */
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

let cached: CryptoKey | null = null;

async function key(): Promise<CryptoKey> {
  if (cached) return cached;
  const raw = Deno.env.get(KEY_ENV);
  if (!raw) throw new MissingKeyError("not set");
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = decodeKeyBytes(raw);
  } catch {
    throw new MissingKeyError("not valid base64");
  }
  if (bytes.length !== 32) {
    throw new MissingKeyError(`expected 32 bytes after base64 decode, got ${bytes.length}`);
  }
  cached = await crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
  return cached;
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Encrypts one token. A fresh 12-byte IV per call — never reused, which is
 *  the one thing GCM cannot survive. */
export async function sealToken(plaintext: string): Promise<string> {
  const k = await key();
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    k,
    new TextEncoder().encode(plaintext),
  );
  return `v1.${b64url(iv)}.${b64url(new Uint8Array(ct))}`;
}

/** Nullable in, nullable out — not every vendor issues a refresh token. */
export async function sealNullable(plaintext: string | null): Promise<string | null> {
  return plaintext === null ? null : await sealToken(plaintext);
}

/**
 * Decrypts one token, or throws.
 *
 * A THROW IS THE CORRECT OUTCOME for a tampered or wrong-key value. The
 * alternative — returning the ciphertext, or an empty string — would send a
 * garbage bearer to a vendor and read their 401 as "the athlete revoked us",
 * which deletes a connection that was never broken.
 */
export async function openToken(sealed: string): Promise<string> {
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") {
    throw new Error("token_ciphertext_unrecognised");
  }
  const k = await key();
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64url(parts[1]) },
    k,
    unb64url(parts[2]),
  );
  return new TextDecoder().decode(pt);
}

export async function openNullable(sealed: string | null): Promise<string | null> {
  return sealed === null ? null : await openToken(sealed);
}
