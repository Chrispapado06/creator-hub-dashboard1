/**
 * A profile link that actually opens something.
 *
 * The obvious version — `icefall.app/@christofis` — needs a server that knows
 * who @christofis is, and there isn't one. A link that resolves to nothing is
 * worse than no share button: the person you sent it to sees a 404 with your
 * name on it.
 *
 * So the profile travels IN the link. The card is encoded into the URL's
 * fragment, which means:
 *
 *   · it opens on any device, with no account and no backend;
 *   · the fragment is **never sent to a server** — browsers strip everything
 *     after `#` from the request — so the card is not logged by a host, a CDN
 *     or an analytics script on the way;
 *   · it works offline, because the app is a PWA and the data is in the URL.
 *
 * What travels is only what the athlete chose to publish. There is no field
 * here for a coordinate, an address, an age, an email or a phone number, so no
 * amount of sharing can leak one.
 */

export interface SharedProfile {
  /** Schema version, so an old link can be read or refused honestly. */
  v: 1;
  name: string;
  handle: string;
  /**
   * `public.profiles.id` — WHO the card is of, as opposed to what they are
   * called.
   *
   * OPTIONAL BECAUSE OLD LINKS EXIST AND MUST STILL OPEN. It is here because a
   * handle is not a person: `profiles_update_self` lets somebody change theirs,
   * and a given-up handle can later be claimed by a different account — so a
   * card whose only identifier is a handle can, months later, send a reader to
   * a stranger's profile. `PublicProfile` sends a signed-in reader on to the
   * live profile, and that destination now carries a Message control, which
   * turns "the wrong page" into "the wrong recipient".
   *
   * A uuid costs 36 of the 2,000-character budget and the measured card is 481,
   * so it never competes with the prose `encodeProfile` drops.
   */
  id?: string;
  bio?: string;
  /** A town or region — never an address. */
  region?: string;
  /**
   * A 256 px JPEG data URL.
   *
   * ⚠ NOT PUT IN THE LINK — see `encodeProfile`. The claim that once stood here,
   * that ~25 KB is "well within what browsers and messaging apps carry", was
   * wrong and it is why sharing a profile did not work. Measured: a card with an
   * avatar encodes to a **46,039-character** URL; without one it is 481. The
   * field stays on the interface because a locally-held card still shows the
   * photo, and because an older link that carries one must still decode.
   */
  avatar?: string;
  objective?: { name: string; when: string; preparationPct: number };
  summits?: number;
  highestM?: number;
  /** Badge ids the athlete has actually been granted. Empty today, by design. */
  badges?: string[];
  /** When the card was made, so a stale one can say so. */
  at: string;
}

/* -------------------------------------------------------------------------- */
/* base64url — URL-safe, and correct for non-ASCII names                      */
/* -------------------------------------------------------------------------- */

function toBase64Url(text: string): string {
  // `btoa` is byte-oriented and throws on anything outside Latin-1, which is
  // most of the names this app will ever carry. Encode to UTF-8 bytes first.
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* -------------------------------------------------------------------------- */

/** The path the card opens at. */
export const SHARE_PATH = "/p";

/**
 * How long a shared link may be.
 *
 * Two thousand characters is the length that survives everything: a WhatsApp or
 * iMessage bubble, a pasted email, a QR code, a link parser that stops early.
 * Beyond it the failure is silent — the link is not rejected, it is delivered
 * cut in half, which is exactly what the "this card can't be read" screen was
 * built to explain and should now almost never have to.
 */
export const MAX_LINK_CHARS = 2_000;

/**
 * The card, packed into a URL fragment.
 *
 * The AVATAR IS DROPPED. A 256 px JPEG data URL is about 25 KB, and base64 in a
 * URL made the whole link 46,039 characters — long past what any messaging app
 * carries, so shared profiles arrived truncated and unreadable. Everything else
 * together is under 500. `PublicProfile` already falls back to the initial, so
 * the card still looks deliberate without it.
 *
 * If the rest ever grows past the budget the optional prose goes next, in order
 * of how much the card loses by dropping it.
 */
export function encodeProfile(profile: SharedProfile): string {
  const { avatar: _avatar, ...carried } = profile;
  let payload: SharedProfile = carried as SharedProfile;
  const fits = () => toBase64Url(JSON.stringify(payload)).length + 64 <= MAX_LINK_CHARS;

  for (const drop of ["bio", "region", "objective"] as const) {
    if (fits()) break;
    payload = { ...payload, [drop]: undefined };
  }
  return toBase64Url(JSON.stringify(payload));
}

export function decodeProfile(fragment: string): SharedProfile | null {
  const raw = fragment.replace(/^#/, "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as SharedProfile;
    // A link from a future version could contain fields this build cannot show
    // honestly; refuse it rather than render half a card.
    if (parsed?.v !== 1 || typeof parsed.name !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The full link, built from wherever the app is actually running.
 *
 * Deliberately not a hard-coded domain: on localhost it gives a localhost link
 * you can test, and on the deployed app it gives the real one — so the button
 * is never lying about where it points.
 */
export function profileLink(profile: SharedProfile, origin = window.location.origin): string {
  return `${origin}${SHARE_PATH}#${encodeProfile(profile)}`;
}

/** Roughly how long the link is — used to warn before it gets unwieldy. */
export const linkLength = (profile: SharedProfile) => profileLink(profile).length;
