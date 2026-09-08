/**
 * THE PROFILE EDIT THAT ACTUALLY LEAVES THE PHONE.
 *
 * ── THE BUG THIS EXISTS TO END ───────────────────────────────────────────────
 *
 * `screens/settings/Sections.tsx` edits every profile field through `patch()`
 * from `settings/store.ts`, which is `localStorage.setItem`. Nothing in `src/`
 * has ever issued an UPDATE against `public.profiles` — every `from("profiles")`
 * in this codebase is a `.select()`. So somebody changes their name, their bio
 * and their photograph, watches all three change on the screen in front of them,
 * and NO OTHER HUMAN BEING EVER SEES ANY OF IT: `social/publicProfile.ts` reads
 * the row, the share link reads the row, and the row still says whatever signup
 * put there.
 *
 * This module is the write path. It does not touch the local store — the caller
 * hands it fields — so it cannot fight with `patch()`, and `patch()` cannot make
 * a claim on its behalf.
 *
 * ── THE THING THAT MAKES THIS AWKWARD, AND THE PATTERN THAT SOLVES IT ────────
 *
 * The eight fields somebody can edit depend on THREE different migrations, and
 * a module that assumed they all landed together would be broken on arrival in
 * one direction or the other.
 *
 * ⚠️ WHAT THIS BLOCK NO LONGER DOES IS TELL YOU WHICH ARE APPLIED. It used to
 * ("NEEDS 20260903020000 — written, NOT pushed"), and it was wrong: measured
 * against the live database on 2026-09-04, `profiles.bio`, `languages`,
 * `interests` and `banner_url` all answer `42501 permission denied` rather than
 * `42703 column does not exist`, which is PostgREST's way of saying the columns
 * are there. A deployment state written into a comment is out of date the next
 * time somebody runs `supabase db push`, and this one was — while the paragraph
 * below still described a fault that had already been fixed. If you need to
 * know what is applied, ask the database; the recipe is one curl and it is in
 * the audit plan's Appendix B.
 *
 * What is durable is the DEPENDENCY, which is what this module is built on:
 *
 *   NO MIGRATION NEEDED
 *     `display_name`, `location_label`, `country_code`, `avatar_url` — four
 *     columns that have been on `profiles` from the start, with
 *     `profiles_update_self` permitting an account to update its own row.
 *
 *   NEEDS 20260903020000
 *     `bio`, `languages`, `interests`, `banner_url`.
 *
 *   NEEDS 20260903020000's STORAGE BLOCK, which can be skipped independently
 *     The `profile-media` bucket. Its whole `do $$ … $$` is wrapped in an
 *     `insufficient_privilege` handler precisely so a refusal cannot take the
 *     columns down with it — so "the columns arrived" and "the bucket arrived"
 *     are genuinely two facts, and a photograph is gated on the second.
 *
 * A PostgREST UPDATE naming a column the server does not have is not partially
 * satisfied: it comes back `PGRST204` and NOTHING is written. Putting all eight
 * in one request would therefore mean that until somebody runs `supabase db
 * push`, changing your display name silently fails because you also have a bio.
 *
 * So this file uses the UNPUSHED-FIELD PATTERN that `social/publicProfile.ts`
 * established for reads, applied to a write: TWO REQUESTS, and the one that
 * works today cannot be harmed by the one that does not. The pending request is
 * still attempted EVERY TIME, with no session memo and no feature flag —
 * `social/safety.ts` argues that case exactly and the argument holds here: the
 * cost of naming a column that is missing is one failed request; the benefit is
 * that the day the migration lands, bios start saving on phones nobody has
 * updated and with nothing redeployed.
 *
 * ── WHAT IS NEVER CLAIMED ────────────────────────────────────────────────────
 *
 * Every write reads its row back with `.select()`, and only what came back is
 * reported as saved. A missing error is NOT evidence: PostgREST answers an
 * UPDATE that matched no row with `data: null` and no error at all, which is
 * what a broken RLS predicate looks like from here, and reporting that as a
 * save is the exact failure this app exists to avoid.
 *
 * The result is PER FIELD. A single boolean would let a screen print "Saved"
 * over a form in which the name reached the server and the bio did not.
 *
 * ── ONE FAULT THIS MODULE RECOGNISES, SO NOBODY DEBUGS IT TWICE ──────────────
 *
 * IN ONE COMBINATION OF MIGRATIONS — `20260903010000_block_and_report.sql`
 * applied and `20260903020000` not — EVERY profile update fails for EVERY
 * account with `42P17 infinite recursion detected in policy for relation
 * "profiles"`. (This paragraph used to open "one fault that is already
 * waiting", which asserted that combination was the live state. It was not:
 * both had landed by 2026-09-04. The failure mode is real; whether the
 * database is currently in it is a question for the database.)
 * `profiles_update_self`
 * pins `role` and `username` with subqueries on `profiles`, which only ever
 * worked because `profiles_select` was `using (true)`, and block-and-report
 * makes that a real expression. Section 0 of 20260903020000 is the fix. This
 * module cannot repair it; it recognises the code so the sentence a person sees
 * blames ICEFALL rather than their connection. See `sentenceFor`.
 *
 * ── WHAT THIS MODULE WILL NOT DO ─────────────────────────────────────────────
 *
 * IT DOES NOT WRITE `username`, and `ProfileEdit` has no field for one. The
 * policy's WITH CHECK pins the handle to its current value, so an UPDATE that
 * carries a new one is refused outright — and it is pinned deliberately: a
 * handle is how other people reach somebody, and changing it goes through
 * `claim_username` (SECURITY DEFINER, with the 14-day reclaim hold from
 * 20260903030000) so that a released name cannot be grabbed the same afternoon
 * by somebody impersonating its owner. Edit-profile currently renders the
 * handle as an ordinary text field; wiring that field to this module would
 * refuse every save. It needs the RPC, and the RPC returns a verdict
 * (`format` / `reserved` / `taken`) that a text field has nowhere to put.
 *
 * IT DOES NOT WRITE `role` or `account_status`. Both are pinned on the server —
 * `role` by the policy, the suspension columns by a trigger — and both are
 * pinned because they are claims about a person that a person may not make
 * about themselves.
 *
 * IT DOES NOT GUESS A COUNTRY. See `COUNTRY_IS_NEVER_PARSED`.
 */
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError, type BackendFailure } from "@/backend/pgErrors";
import type { Database, Profile } from "@/backend/types";
/* Type-only, so nothing of `AppState` reaches this module at runtime. The two
   unions live there because that is where the onboarding answers are declared;
   they are the same vocabulary the migration's CHECK and lookup table hold, and
   writing them down a third time here is how the three drift apart. */
import type { Gender, HeardAboutChannel } from "@/state/AppState";
/* A SECOND import line from the same module rather than a third name added to
   the one above it. `sex_at_birth` arrived after that line was written and
   after this file had been queued for review, and this module is edited by
   several sessions at once with no branch between them — so every change made
   for it is an INSERTION and touches no existing line. Merge the two the day
   this file is committed and nothing is racing it. */
import type { SexAtBirth } from "@/state/AppState";
import { withTimeout } from "@/lib/netTimeout";

/**
 * `backend/types.ts` knows `profiles` as it exists TODAY — it has no `bio`, no
 * `languages`, no `interests` and no `banner_url`, because those columns are in
 * a migration nobody has pushed. A typed `.update()` naming them does not
 * compile.
 *
 * Rather than edit a hand-written schema file this module does not own (and
 * thereby claim, in the type system, that four columns exist when they do not),
 * the pending half goes through an untyped view of the same client — exactly as
 * `publicProfile.ts`, `groupSpace.ts`, `highlights.ts` and `safety.ts` all do
 * for the same reason. THE LIVE HALF STAYS TYPED, which is the half that
 * matters: it is the one that must not drift.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Copy — one place, so two surfaces cannot make different promises            */
/* -------------------------------------------------------------------------- */

/** No client in this build (DEMO, offline, or no credentials). */
export const SYNC_NO_BACKEND =
  "This build of ICEFALL is not connected to a server, so your profile is saved on this phone and nowhere else. Nobody else can see it, and no amount of signal will change that in this build.";

/** Signed out. A profile edit is a statement about an account. */
export const SYNC_SIGNED_OUT =
  "A profile belongs to an account, so ICEFALL needs you signed in to save this. It is kept on this phone in the meantime and has reached nobody.";

/** No network interface at all. */
export const SYNC_OFFLINE =
  "No signal, so this has not reached ICEFALL's server. It is kept on this phone and will be sent the next time a save succeeds — nothing has been lost and nothing has been sent.";

/** The request went out and did not come back. */
export const SYNC_UNREACHABLE =
  "ICEFALL could not reach the server, so this has not been saved anywhere but on this phone. That is different from a refusal: the server has not actually been asked.";

/** The server answered and said no. */
export const SYNC_REFUSED =
  "ICEFALL's server refused that change, so nothing was saved there. Your account may need signing in again.";

/**
 * The recursion fault described in the header. Named separately because a
 * person told "check your connection" would go looking for signal on a mountain
 * when the fault is a policy on ICEFALL's server.
 */
export const SYNC_POLICY_FAULT =
  "ICEFALL's server has a fault in the rules that decide who may change a profile, so nothing was saved. This is at ICEFALL's end — your connection and your account are fine, and there is nothing to try differently.";

/** The columns for this field are not on this deployment yet. */
export const SYNC_NOT_DEPLOYED =
  "ICEFALL's server has nowhere to keep this yet. It is kept on this phone and will be sent as soon as the server can take it — you do not need to type it again.";

/**
 * A SIGNUP answer whose column is not on this deployment yet.
 *
 * DELIBERATELY NOT `SYNC_NOT_DEPLOYED`, and the difference is the whole reason
 * this constant exists. That sentence ends "will be sent as soon as the server
 * can take it", which is a promise the profile outbox actually keeps: a queued
 * profile edit is written to `OUTBOX_KEY` and re-sent by `flushProfile` after
 * the next save that succeeds. THERE IS NO OUTBOX FOR SIGNUP ANSWERS. They are
 * asked once, on a screen nobody returns to, so there is no later save to ride
 * along with and nothing anywhere retries this write. Saying "will be sent"
 * about it would be the same class of lie as a "Saved" that was never read
 * back, which is the fault this entire module was written to end.
 *
 * What IS true is the middle clause: the answer is not lost. It lives in the
 * app's own onboarding record — on the phone, and inside the `answers` blob
 * that `auth/account.ts` upserts, a column that has existed since 20260830100000
 * and needs no migration. What the missing column costs is not the answer, it
 * is the ability to COUNT the answers, because `heard_about_tally()` reads the
 * typed column and knows nothing about the blob. So the sentence says exactly
 * that and claims nothing further.
 */
export const SIGNUP_ANSWER_NOT_DEPLOYED =
  "ICEFALL's server has nowhere to file this answer yet, so nothing at ICEFALL can count it. It is kept with the rest of your signup answers and nothing here tries again — the column has to arrive first.";

/** No `profile-media` bucket. Photographs specifically. */
export const SYNC_NO_PHOTO_STORE =
  "ICEFALL's server has nowhere to keep a photograph yet, so this one has not left your phone. It is kept, and will be sent as soon as there is somewhere to put it.";

/**
 * The update ran and matched no row. NOT a save, and not obviously a refusal.
 *
 * PostgREST answers this with `data: null` and no error, which is why it has to
 * be checked for explicitly — treating "no error" as success here is the whole
 * class of bug this module was written to end.
 */
export const SYNC_NO_ROW =
  "ICEFALL's server ran the change and no profile matched your account, so nothing was saved. Signing out and in again is the thing most likely to fix it.";

/** The phone had no room to keep the edit. The one genuinely bad outcome. */
export const SYNC_NOT_KEPT =
  "This phone had no room to keep that, so it is neither saved on ICEFALL's server nor queued. It is still in the box you typed it in until you leave the screen.";

/** A photograph the phone could not keep queued. Stated separately: it is big. */
export const SYNC_PHOTO_NOT_KEPT =
  "This phone had no room to keep that picture while it waits to be sent, so it has not been queued. Choose it again when you have signal.";

/**
 * WHY A COUNTRY IS NEVER DERIVED FROM WHAT SOMEBODY TYPED, exported so a screen
 * can say it in the same words the migration uses.
 *
 * The app has ONE box, `settings.region`, hinted "A town or region" and
 * placeheld "Athens, Greece". The server has TWO fields. The honest mapping is
 * not a split:
 *
 *     settings.region  ->  profiles.location_label, verbatim
 *     settings.region  ->  profiles.country_code,   NOTHING. It stays null.
 *
 * "Chamonix" names no country. "Georgia" names a country and a US state.
 * "Vienna" is in Austria and in Virginia. A code parsed out of free text is a
 * measurement that never happened, and this one would go on to drive currency
 * and regional filtering — decisions somebody would feel without ever having
 * been asked. 20260830100000 refused to geocode the same label for the same
 * reason, and the column's own comment says it in the database.
 *
 * So `countryCode` is only ever written when a caller passes an explicit
 * two-letter code, which today means a picker that does not exist yet. Until it
 * does, the field stays null and renders as not stated.
 */
export const COUNTRY_IS_NEVER_PARSED =
  "ICEFALL does not work out a country from what you typed. “Georgia” is a country and a US state, “Vienna” is in Austria and in Virginia, and a wrong country on a profile is worse than none — so this stays blank until you pick one.";

/**
 * Words in the Interests box that ICEFALL's list does not hold.
 *
 * `interests` is a CLOSED vocabulary on the server (`interest_tags`), because
 * the point of the column is that it can be filtered. The app's own placeholder
 * — "Alpine climbing, ski touring, long days" — is two facets and a piece of
 * personality, and the personality half belongs in the bio.
 */
export const INTERESTS_NOT_IN_LIST =
  "ICEFALL keeps interests as a fixed list so people can be found by them, and these words are not on it. They have not been saved as interests — the bio is the place for anything the list has no word for.";

/** Languages that could not be resolved to a language code. */
export const LANGUAGES_NOT_RECOGNISED =
  "ICEFALL stores languages as codes so a search matches the language rather than the spelling, and it did not recognise these. They have not been saved.";

/* -------------------------------------------------------------------------- */
/* The shape a caller works in                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The eight editable things, named as `settings/store.ts` names them rather
 * than as the database names them.
 *
 * The caller is a settings screen holding `SettingsState`; it should not have
 * to know that `region` is `location_label`, or that one text box becomes an
 * array of slugs. That translation is this module's job and it happens in
 * exactly one place, which is the point.
 */
export type ProfileFieldName =
  | "displayName"
  | "region"
  | "countryCode"
  | "bio"
  | "languages"
  | "interests"
  | "avatar"
  | "banner"
  | "website"
  | "instagram"
  | "facebook"
  | "youtube"
  | "tiktok"
  | "strava";

/**
 * What to save. ONLY THE KEYS PRESENT ARE TOUCHED — an absent key is "not being
 * edited", which is different from `null`, which is "clear this".
 *
 * There is deliberately no `username`. See the module header.
 */
export interface ProfileEdit {
  /** `profiles.display_name`. 1–80 characters after trimming; NOT NULL. */
  displayName?: string;
  /** `settings.region` → `profiles.location_label`, verbatim. "" clears it. */
  region?: string;
  /**
   * ISO 3166-1 alpha-2, from an explicit choice ONLY. Never derived from
   * `region` — see `COUNTRY_IS_NEVER_PARSED`. `null` clears it.
   */
  countryCode?: string | null;
  /** `profiles.bio`. 300 characters, at most four line breaks. "" clears it. */
  bio?: string;
  /** The local comma-separated box. Mapped to language codes here. */
  languages?: string;
  /** The local comma-separated box. Mapped to `interest_tags` slugs here. */
  interests?: string;
  /** A data URL from `lib/image.ts`. Uploaded, never stored as text. `null` removes. */
  avatar?: string | null;
  /** `settings.cover`, same treatment. `null` removes. */
  banner?: string | null;

  /*
   * THE LINKS — `20260907090000_profile_links.sql`.
   *
   * HANDLES, NOT URLS, for the five social ones: the migration refuses anything
   * carrying a scheme, a slash or a colon, and the app builds the address. A
   * public profile that renders a URL somebody typed is an open redirect with a
   * face beside it. `website` is the one URL, https only.
   *
   * "" clears, exactly like `bio`.
   */
  website?: string;
  instagram?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  strava?: string;
}

/**
 * WHAT HAPPENED TO ONE FIELD. Five states, because they are five different
 * sentences and a screen that collapses any two of them lies about one.
 *
 *   saved             — the server has it, and the row was read back to prove
 *                       it. THE ONLY STATE A SCREEN MAY DESCRIBE AS SAVED.
 *   not-yet-on-server — this deployment has no column (or no bucket) for it.
 *                       Kept on the phone; it will go the moment the migration
 *                       lands, with no new build.
 *   queued            — kept on the phone and reached nobody, for a reason that
 *                       may pass: no signal, no session, a refusal, a timeout.
 *   not-storable      — ICEFALL cannot store this VALUE as given. A bio over
 *                       300 characters, a country code that is not two letters,
 *                       an interests box containing nothing on the list.
 *                       Retrying changes nothing; the person has to change it.
 *   failed            — reached nobody AND could not be kept, because this
 *                       phone's storage refused. The only state that loses
 *                       something, and it says so.
 */
export type FieldState = "saved" | "not-yet-on-server" | "queued" | "not-storable" | "failed";

export interface FieldResult {
  state: FieldState;
  /** Always safe to print as-is. */
  message: string;
  /**
   * Is this edit waiting on this phone to be sent later? True for `queued` and
   * `not-yet-on-server`, false for the rest. Spelled out rather than inferred
   * from `state`, so a screen offering "try again" does not have to know which
   * states imply a retry.
   */
  keptOnDevice: boolean;
  /**
   * WHAT THE SERVER NOW HOLDS, read back off the row. Present only on `saved`.
   *
   * It is not always what was sent: the server trims, lowercases, deduplicates
   * and sorts. A screen should render THIS rather than what the person typed —
   * that is what makes normalising safe, and it is what the migration's own
   * note relies on.
   */
  stored?: string | string[] | null;
  /**
   * Words that were dropped on the way, in the person's own spelling. Interests
   * and languages only. An empty array is never returned; the key is absent
   * when nothing was dropped.
   *
   * A field can be `saved` AND carry `dropped` — three interests stored and one
   * word discarded is exactly that, and saying "saved" without naming the
   * fourth would be the small lie this whole file is against.
   */
  dropped?: string[];
}

export interface SaveProfileResult {
  /** One entry per field the caller asked for. Never more, never fewer. */
  fields: Partial<Record<ProfileFieldName, FieldResult>>;
  /** At least one field reached the server. */
  savedAny: boolean;
  /** EVERY field asked for reached the server. The only "Saved" a screen earns. */
  allSaved: boolean;
  /** Something is waiting on this phone. A screen may offer "try again". */
  pending: boolean;
}

/* -------------------------------------------------------------------------- */
/* Budgets                                                                     */
/* -------------------------------------------------------------------------- */

/** `getSession()` can refresh a token over the network, and it runs BEFORE the
    query — so the query's own `.abortSignal()` cannot protect it. Same number
    as `publicProfile.ts` and `safety.ts`. */
const SESSION_TIMEOUT_MS = 3_000;
/** A small UPDATE returning one row. */
const WRITE_TIMEOUT_MS = 8_000;
/** An image of up to a few hundred kilobytes on hut wifi. */
const UPLOAD_TIMEOUT_MS = 20_000;
/** Twenty-one rows of vocabulary. */
const TAGS_TIMEOUT_MS = 6_000;

/** Race work that cannot cancel itself against the clock. Returns a sentinel
    rather than throwing, so a timeout has to be handled deliberately instead of
    being caught by accident beside real errors. Copied from `publicProfile.ts`
    rather than imported: it is a private helper in a file this module does not
    own, and reaching into somebody else's internals is how two sessions end up
    editing one line. */
const TIMED_OUT = Symbol("timed-out");
async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* -------------------------------------------------------------------------- */
/* The session gate                                                            */
/* -------------------------------------------------------------------------- */

type GateFailure = "no-backend" | "signed-out" | "unreachable";
type Gate =
  | { ok: true; uid: string; client: SupabaseClient<Database>; loose: SupabaseClient }
  | { ok: false; failure: GateFailure; message: string };

/**
 * Nothing here touches the network without going through this. It also narrows
 * both views of the client, so no call site carries a `!` a later edit can get
 * wrong.
 *
 * A session refresh that never answered is NOT a signed-out person and gets its
 * own failure: reported as signed-out it would send somebody to a sign-in
 * screen they are already past.
 */
async function gate(): Promise<Gate> {
  if (!supabase || !untyped) {
    return { ok: false, failure: "no-backend", message: SYNC_NO_BACKEND };
  }
  const session = await withDeadline(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  if (session === TIMED_OUT || session.error) {
    return { ok: false, failure: "unreachable", message: SYNC_UNREACHABLE };
  }
  const uid = session.data.session?.user.id ?? null;
  if (!uid) return { ok: false, failure: "signed-out", message: SYNC_SIGNED_OUT };
  return { ok: true, uid, client: supabase, loose: untyped };
}

/**
 * A Postgres failure as a sentence.
 *
 * `classifyBackendError` decides WHAT KIND of failure this is — this module
 * does not re-derive that, because six modules once hand-classified `42501` as
 * "not deployed yet" and told people whose token had merely lapsed a confident,
 * checkable, false thing about ICEFALL's server.
 *
 * The one code read directly is `42P17`, and it is NOT a reclassification: the
 * outcome is still whatever the classifier said. It only changes the sentence,
 * because "infinite recursion in a policy" is a fault in ICEFALL's own rules
 * that no person can act on, and the generic sentence would send somebody
 * looking for signal. See the module header.
 */
function sentenceFor(error: { code?: string | null; message?: string | null } | null): string {
  if (error?.code === "42P17") return SYNC_POLICY_FAULT;
  switch (classifyBackendError(error)) {
    case "not-provisioned":
      return SYNC_NOT_DEPLOYED;
    case "refused":
      return SYNC_REFUSED;
    case "unreachable":
      return SYNC_UNREACHABLE;
    default:
      return "ICEFALL's server did not complete that and did not say why. Nothing was saved there.";
  }
}

/* -------------------------------------------------------------------------- */
/* Text, and the limits the columns actually carry                             */
/* -------------------------------------------------------------------------- */

/** One box of comma-separated words as the words, in the person's spelling.
    Newlines count as separators too — a phone keyboard offers one. */
function words(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n;]/)) {
    const word = raw.trim().replace(/\s+/g, " ");
    if (word.length === 0) continue;
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out;
}

/** Lowercase, hyphenated, no punctuation — the shape `interest_tags.slug` has. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * `profiles_bio_shape`, checked here so the person is told which rule they hit
 * instead of the whole request failing on a constraint name.
 *
 * CRLF IS FOLDED TO LF AND NOTHING ELSE IS TOUCHED. The constraint refuses any
 * control character other than the line break, and a bio pasted from a desktop
 * note arrives full of invisible carriage returns that would refuse a save with
 * no visible cause. Folding them changes nothing a reader could see. A bio over
 * 300 characters is NOT truncated: cutting somebody's words in half and calling
 * it saved is precisely the lie this module exists to prevent.
 */
function checkBio(
  raw: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  const text = raw
    .replace(/\r\n?/g, "\n")
    // A tab is refused by the column too, and a bio pasted out of a note is
    // full of them. It is folded to a space rather than refused because a card
    // renders the two identically — no word is lost and nothing is shortened,
    // which is the line between normalising and editing somebody's sentence.
    .replace(/\t/g, " ")
    .trim();
  if (text.length === 0) return { ok: true, value: null };
  if (text.length > 300) {
    return {
      ok: false,
      message: `ICEFALL keeps a bio to 300 characters and this one is ${text.length}. It has not been saved — nothing was cut, because half a sentence saved as if it were the whole one is worse than nothing.`,
    };
  }
  if ((text.match(/\n/g)?.length ?? 0) > 4) {
    return {
      ok: false,
      message:
        "ICEFALL keeps a bio to five lines, because it is drawn on a card. This one has more, so it has not been saved.",
    };
  }
  // Every control character except the line break, which the column allows.
  // Written as escapes rather than as literal characters: a literal control
  // character in source is invisible to whoever edits this next.
  if (/[\u0000-\u0009\u000B-\u001F\u007F]/.test(text)) {
    return {
      ok: false,
      message:
        "There are invisible control characters in that bio — usually from pasting out of another app — and ICEFALL's server will not store them. Retyping the line they are on will fix it.",
    };
  }
  return { ok: true, value: text };
}

/* -------------------------------------------------------------------------- */
/* Languages — codes, from the platform's own language data                    */
/* -------------------------------------------------------------------------- */

/**
 * EVERY ISO 639-1 CODE. A fact, written out, not a guess.
 *
 * It exists to be the domain of the reverse lookup below: `Intl.DisplayNames`
 * turns a code into a name and there is no API that goes the other way, so the
 * only honest way to map "Greek" to `el` is to ask the platform what each code
 * is called and match. Without the list there is nothing to iterate.
 *
 * It also bounds what may be typed directly: `profiles_languages_shape` accepts
 * any two or three lowercase letters, so a person typing "abc" would otherwise
 * store "abc" as a language they speak.
 */
const ISO_639_1 =
  "aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(
    " ",
  );

/**
 * THE ONE THREE-LETTER CODE, AND WHY IT IS HERE.
 *
 * The migration says it in its own words: three letters are accepted "because
 * 639-1 has no code for Sherpa". `xsr` is that code. It is the language of the
 * Khumbu, and an app whose expedition catalogue is full of Everest that could
 * not record somebody speaking it would be quietly absurd.
 *
 * NOTHING ELSE IS ADDED. Seeding more 639-3 codes because they seemed plausible
 * would be inventing product in a lookup table; each one is a line away when a
 * screen asks for it.
 */
const LANGUAGE_EXTRAS: Record<string, string> = { sherpa: "xsr" };

/** `profiles_languages_shape`: at most twelve. */
const MAX_LANGUAGES = 12;

let languageIndex: Map<string, string> | null = null;

/**
 * name → code, built once from the platform's own ICU data.
 *
 * Built in ENGLISH AND IN THE READER'S OWN LOCALE, so a phone set to Greek maps
 * "Ελληνικά" as readily as "Greek" — which is the whole reason to use ICU
 * rather than a hand-typed English table that would quietly only work for
 * English speakers.
 *
 * FIRST CODE WINS on a collision and nothing is overwritten, so the mapping is
 * deterministic rather than dependent on iteration order. If `Intl.DisplayNames`
 * is missing (a very old engine), the map holds the codes alone and a typed
 * NAME simply does not resolve — which is reported, not guessed at.
 */
function buildLanguageIndex(): Map<string, string> {
  if (languageIndex) return languageIndex;
  const index = new Map<string, string>();

  const add = (key: string, code: string) => {
    const k = key.trim().toLowerCase();
    if (k.length > 0 && !index.has(k)) index.set(k, code);
  };

  for (const code of ISO_639_1) add(code, code);
  for (const [name, code] of Object.entries(LANGUAGE_EXTRAS)) {
    add(name, code);
    add(code, code);
  }

  try {
    const locales: (string | undefined)[] = ["en", undefined];
    for (const locale of locales) {
      const dn = new Intl.DisplayNames(locale ? [locale] : undefined, { type: "language" });
      for (const code of ISO_639_1) {
        const name = dn.of(code);
        // ICU answers with the code itself when it has no name for it. That is
        // not a name, and storing it as one would map "aa" to "aa" twice.
        if (typeof name === "string" && name.toLowerCase() !== code) add(name, code);
      }
    }
  } catch {
    /* No Intl.DisplayNames. Codes still resolve; names do not, and say so. */
  }

  languageIndex = index;
  return index;
}

/** The Languages box as codes, plus every word that did not resolve. */
function languageCodes(text: string): { codes: string[]; dropped: string[] } {
  const index = buildLanguageIndex();
  const codes: string[] = [];
  const dropped: string[] = [];

  for (const word of words(text)) {
    const code = index.get(word.toLowerCase());
    if (!code) {
      dropped.push(word);
      continue;
    }
    if (!codes.includes(code)) codes.push(code);
  }

  // The constraint is a hard twelve. Sending thirteen fails the whole request
  // and takes the bio with it, so the overflow is reported as dropped instead —
  // and it is reported, not silently trimmed.
  if (codes.length > MAX_LANGUAGES) {
    for (const code of codes.slice(MAX_LANGUAGES)) dropped.push(code);
    codes.length = MAX_LANGUAGES;
  }
  return { codes, dropped };
}

/* -------------------------------------------------------------------------- */
/* Interests — a closed vocabulary that lives on the server                    */
/* -------------------------------------------------------------------------- */

/** `profiles_interests_shape`: at most ten. */
const MAX_INTERESTS = 10;

export interface InterestTag {
  slug: string;
  label: string;
}

/**
 * The vocabulary, cached for the session ON SUCCESS ONLY.
 *
 * A failed read is never cached: today it fails because `interest_tags` does
 * not exist yet, and caching that would mean the first save of a session
 * decides that interests are impossible for the whole session — the exact
 * "broken until you restart the app" behaviour the no-memo rule above avoids.
 * A success is cached because the vocabulary changes by migration, not by
 * minute.
 */
let cachedTags: InterestTag[] | null = null;

/**
 * ICEFALL's interest vocabulary, for this module and for the picker somebody
 * will eventually build.
 *
 * RETIRED TAGS ARE NOT FILTERED OUT, and that is deliberate rather than an
 * oversight: a retired tag is still valid on a row that holds it (that is the
 * difference between retiring and deleting), so refusing to match one here
 * would reject a word the server would happily have stored. A picker should
 * filter them; a matcher must not.
 */
export async function fetchInterestTags(): Promise<
  { ok: true; tags: InterestTag[] } | { ok: false; failure: BackendFailure }
> {
  if (cachedTags) return { ok: true, tags: cachedTags };
  if (!untyped) return { ok: false, failure: "unknown" };

  const deadline = withTimeout(TAGS_TIMEOUT_MS);
  const query = untyped.from("interest_tags").select("slug, label").order("sort_order");
  const { data, error } = await (deadline ? query.abortSignal(deadline) : query);

  if (error) return { ok: false, failure: classifyBackendError(error as PostgrestError) };

  const tags = (Array.isArray(data) ? data : [])
    .map((row) => row as { slug?: unknown; label?: unknown })
    .filter(
      (row): row is { slug: string; label: string } =>
        typeof row.slug === "string" && typeof row.label === "string",
    )
    .map(({ slug, label }) => ({ slug, label }));

  // An empty vocabulary is not a usable one — it would report every word the
  // person typed as "not on ICEFALL's list", which would be a statement about
  // the list rather than about them. Treated as a failure and not cached.
  if (tags.length === 0) return { ok: false, failure: "unknown" };

  cachedTags = tags;
  return { ok: true, tags };
}

/**
 * Typed words as tag slugs.
 *
 * THREE WAYS TO MATCH AND NOT ONE OF THEM IS A SYNONYM TABLE: the slug itself
 * (`ski-touring`), the server's own label (`Ice climbing`), and the typed words
 * slugified (`Ski touring` → `ski-touring`). That is enough to accept every
 * word the app itself puts in front of people — the onboarding disciplines and
 * the guide specialities are the same fifteen slugs, spelled identically, which
 * is exactly why the migration seeded them that way.
 *
 * WHAT IS DELIBERATELY NOT MATCHED, using the app's own placeholder as the
 * example: "Alpine climbing". `climbing` and `mountaineering` are both real
 * tags, and choosing between them on somebody's behalf is a guess about what
 * they meant, printed on their profile as if they had said it. It is reported
 * as not stored, and the fix is a picker rather than a cleverer matcher.
 */
function interestSlugs(text: string, tags: InterestTag[]): { slugs: string[]; dropped: string[] } {
  const index = new Map<string, string>();
  for (const tag of tags) {
    index.set(tag.slug, tag.slug);
    index.set(tag.label.toLowerCase(), tag.slug);
    index.set(slugify(tag.label), tag.slug);
  }

  const slugs: string[] = [];
  const dropped: string[] = [];
  for (const word of words(text)) {
    const slug = index.get(word.toLowerCase()) ?? index.get(slugify(word));
    if (!slug) {
      dropped.push(word);
      continue;
    }
    if (!slugs.includes(slug)) slugs.push(slug);
  }

  if (slugs.length > MAX_INTERESTS) {
    for (const slug of slugs.slice(MAX_INTERESTS)) dropped.push(slug);
    slugs.length = MAX_INTERESTS;
  }
  return { slugs, dropped };
}

/* -------------------------------------------------------------------------- */
/* Photographs                                                                 */
/* -------------------------------------------------------------------------- */

const PROFILE_MEDIA_BUCKET = "profile-media";

/**
 * `profile_media_insert` writes the path rule into the database, and this is
 * the same rule in TypeScript:
 *
 *     <uid>/<avatar|banner>/<uuid>.<jpg|jpeg|png|webp>
 *
 * The first segment is the owner's id, which is what separates accounts inside
 * the bucket. THE FILENAME IS A FRESH UUID AND THAT IS LOAD-BEARING, not
 * decoration: the bucket is PUBLIC — deliberately, because a signed URL changes
 * on every request and could therefore never be cached by the offline service
 * worker, and this app is built for a hut at 4am — so the only thing stopping
 * somebody who knows an account id (every signed-in account can read one) from
 * fetching that person's photograph is that they cannot guess the name. The
 * policy enforces the shape; this only has to produce it.
 */
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * A cheap, stable fingerprint of a data URL. FNV-1a, the same hash
 * `settings/store.ts` uses for `memberId`.
 *
 * It is not a checksum and does not need to be: its only job is to answer "is
 * this the same picture I already uploaded?" so that saving a profile five
 * times does not put five copies of one photograph in the bucket. A collision
 * would reuse the wrong URL, which is why it is only ever compared against a
 * value this device wrote itself, for this account, one field at a time.
 */
function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ":" + text.length.toString(36);
}

/**
 * WHAT HAPPENS TO THE OLD FILE WHEN A NEW ONE IS UPLOADED — stated plainly,
 * because a comment that pretended otherwise would be worse than none.
 *
 * Every upload writes a NEW object under a new uuid; nothing overwrites. So on
 * each change there is a previous file that no row points at any more.
 *
 *   · IF THIS DEVICE UPLOADED THE PREVIOUS ONE, it is deleted — best effort,
 *     after the column write has succeeded, never before. The memo below is
 *     what remembers the path. Deleting first would mean a failed column write
 *     left the profile pointing at a file that no longer exists.
 *   · IF THE COLUMN WRITE FAILED after a successful upload, the new file stays
 *     and nothing points at it yet. It is deliberately NOT deleted: the edit is
 *     queued, and the fingerprint below means the retry reuses that very object
 *     instead of uploading a third copy over hut wifi.
 *   · IF ANOTHER DEVICE UPLOADED IT, or this device uploaded it before this
 *     memo existed, or `localStorage` was cleared in between, THE FILE IS
 *     ORPHANED AND NOTHING EVER REMOVES IT. It is not referenced and not
 *     served, but it occupies the bucket for ever.
 *
 * That is a slow leak — one file per photograph change per device, bounded by
 * the bucket's 5 MB per-object limit and by how often people change their
 * picture. Closing it properly needs the OLD url read off the row before the
 * write (one more round trip on every save) or a server-side sweep; both are
 * decisions with costs, and neither is this file's to make quietly. It is
 * written down here so the next person finds it in the code rather than in the
 * storage bill.
 */
const MEDIA_MEMO_KEY = "icefall.profile.media.v1";

interface MediaMemoEntry {
  /** `fingerprint()` of the data URL that produced this object. */
  hash: string;
  /** The object path inside `profile-media`, for the delete. */
  path: string;
  /** The public URL that went into the column. */
  url: string;
}
type MediaMemo = Partial<Record<"avatar" | "banner", MediaMemoEntry>>;

function readMediaMemo(): MediaMemo {
  try {
    const raw = localStorage.getItem(MEDIA_MEMO_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const memo: MediaMemo = {};
    // Each entry is checked rather than cast. A half-written memo would
    // otherwise hand `remove()` an `undefined` path, or match a picture against
    // a missing hash and reuse a URL that is not the one on the row.
    for (const kind of ["avatar", "banner"] as const) {
      const entry = (parsed as Record<string, unknown>)[kind] as
        | Partial<MediaMemoEntry>
        | undefined;
      if (
        entry &&
        typeof entry.hash === "string" &&
        typeof entry.path === "string" &&
        typeof entry.url === "string"
      ) {
        memo[kind] = { hash: entry.hash, path: entry.path, url: entry.url };
      }
    }
    return memo;
  } catch {
    return {};
  }
}

function writeMediaMemo(memo: MediaMemo): void {
  try {
    localStorage.setItem(MEDIA_MEMO_KEY, JSON.stringify(memo));
  } catch {
    /* No memo is survivable: the next save re-uploads and the old file leaks.
       Failing the save over it would be the wrong trade. */
  }
}

type UploadOutcome =
  | {
      ok: true;
      /** The https URL to put in the column. */
      url: string;
      /**
       * The object this upload SUPERSEDES, if this device uploaded that one and
       * still remembers where it is. Null when there is nothing to replace, and
       * null when the picture was unchanged and no new object was written — in
       * both cases there is nothing to delete, and deleting on a reuse would
       * remove the very file the column is about to point at.
       */
      replaces: string | null;
    }
  | { ok: false; state: "not-yet-on-server" | "queued" | "not-storable"; message: string };

/**
 * One picture into `profile-media`, and its public URL back.
 *
 * A DATA URL IS NEVER WRITTEN INTO THE COLUMN. `profiles` is read by every
 * signed-in account on the platform, constantly; a base64 JPEG in that row is a
 * download for all of them. 20260903020000 adds a constraint that refuses it
 * loudly, and this function is why that constraint should never fire.
 *
 * NO BUCKET IS `not-yet-on-server`, NOT AN ERROR. The bucket ships in a
 * migration nobody has pushed, and its whole block is wrapped in an
 * `insufficient_privilege` handler so it can be skipped even when the columns
 * arrive. That is a deployment fact and the person's photograph is queued, not
 * lost.
 */
async function uploadPicture(
  client: SupabaseClient<Database>,
  uid: string,
  kind: "avatar" | "banner",
  dataUrl: string,
): Promise<UploadOutcome> {
  const memo = readMediaMemo();
  const hash = fingerprint(dataUrl);
  const known = memo[kind];
  // The same picture as last time. Reuse the object rather than making another
  // copy of it, and supersede nothing — the file being reused IS the file the
  // column will point at. Without this, saving a profile twice would put two
  // identical photographs in the bucket and delete the one in use.
  if (known && known.hash === hash) return { ok: true, url: known.url, replaces: null };

  const match = /^data:(image\/[a-z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) {
    return {
      ok: false,
      state: "not-storable",
      message:
        "ICEFALL could not read that picture as an image, so it has not been sent. Choosing it again is the fix.",
    };
  }
  const mime = match[1].toLowerCase();
  const ext = IMAGE_EXT[mime];
  if (!ext) {
    return {
      ok: false,
      state: "not-storable",
      message:
        "ICEFALL's server takes JPEG, PNG and WebP pictures. That one is in another format and has not been sent.",
    };
  }

  let blob: Blob;
  try {
    const binary = atob(match[2].replace(/\s+/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } catch {
    return {
      ok: false,
      state: "not-storable",
      message:
        "That picture could not be read back off this phone, so it has not been sent. Choosing it again is the fix.",
    };
  }

  /*
   * THE FILENAME MUST BE UNGUESSABLE, AND THERE IS NO FALLBACK IF IT CANNOT BE.
   *
   * The bucket is public — see the note above — so the ONLY thing keeping one
   * account's photograph from being fetched by anybody who knows their id (and
   * every signed-in account can read an id) is that the object's name cannot be
   * guessed. `Math.random()` is not a cryptographic source, so an engine
   * without `crypto.randomUUID` gets a refusal rather than a weaker name: the
   * policy's regex would happily accept the shape, and the person would never
   * learn that their picture was reachable.
   */
  const name =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : null;
  if (!name) {
    return {
      ok: false,
      state: "not-storable",
      message:
        "This browser cannot generate a secure name for the file, and ICEFALL will not store a picture under a guessable one. The photograph has not been sent.",
    };
  }
  const path = `${uid}/${kind}/${name}.${ext}`;
  const upload = client.storage.from(PROFILE_MEDIA_BUCKET).upload(path, blob, {
    contentType: mime,
    upsert: false,
    // A YEAR, and it is safe because the name is a fresh uuid: this URL can
    // never point at different bytes, so nothing can go stale. It is also what
    // lets the offline service worker keep a face on screen in a hut.
    cacheControl: "31536000",
  });

  const result = await withDeadline(upload, UPLOAD_TIMEOUT_MS);
  if (result === TIMED_OUT) {
    return { ok: false, state: "queued", message: SYNC_UNREACHABLE };
  }
  if (result.error) {
    /*
     * STORAGE ERRORS ARE NOT POSTGREST ERRORS, which is why this does not go
     * through `classifyBackendError` — that module classifies SQLSTATEs and
     * PGRST codes, and storage answers with HTTP statuses and prose. The one
     * distinction that matters here has no code in either vocabulary: "there is
     * no such bucket" is a deployment fact and everything else is not.
     */
    const err = result.error as { message?: string; status?: number; statusCode?: string };
    const text = (err.message ?? "").toLowerCase();
    const status = err.status ?? Number(err.statusCode ?? NaN);
    // "Bucket not found" is what hosted storage answers, with a 404 beside it.
    // A bare "not found" is deliberately NOT matched: on an upload it would
    // almost always be the bucket, and "almost always" is how a refusal ends up
    // described to somebody as a missing feature.
    const noBucket = status === 404 || (text.includes("bucket") && text.includes("not found"));
    if (noBucket) {
      return { ok: false, state: "not-yet-on-server", message: SYNC_NO_PHOTO_STORE };
    }
    if (status === 401 || status === 403 || text.includes("row-level security")) {
      return { ok: false, state: "queued", message: SYNC_REFUSED };
    }
    return { ok: false, state: "queued", message: SYNC_UNREACHABLE };
  }

  /*
   * `getPublicUrl` BUILDS A STRING. It contacts nothing and verifies nothing.
   *
   * So this URL is evidence that an object was uploaded to that path, and the
   * column read-back below is evidence that the row now holds the URL. NEITHER
   * IS EVIDENCE THAT A STRANGER CAN FETCH IT — that depends on the bucket being
   * public, which the migration sets and which nothing here re-checks. If
   * somebody creates the bucket by hand and leaves it private, avatars will
   * 404 for readers while every save reports success. Verifying it would cost a
   * HEAD request on every photograph change; the trade is recorded here rather
   * than made silently.
   */
  const url = client.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
    return { ok: false, state: "queued", message: SYNC_UNREACHABLE };
  }

  writeMediaMemo({ ...memo, [kind]: { hash, path, url } });
  // The previous object is named but NOT deleted here. It is still what the
  // profile row points at until the column write succeeds, and that write can
  // fail.
  return { ok: true, url, replaces: known?.path ?? null };
}

/**
 * The superseded file, removed. BEST EFFORT, AFTER THE COLUMN WRITE, NEVER
 * BEFORE — until the row holds the new URL, the old object is the photograph on
 * that profile, and deleting it first would empty somebody's avatar in exchange
 * for a save that then failed.
 *
 * Failure is silent by design: the person's picture is on their profile, which
 * is what they asked for, and a message about tidying a file they cannot see
 * would be noise. What is NOT removed is documented at `MEDIA_MEMO_KEY`, and it
 * is a real leak rather than a theoretical one.
 */
async function removeSupersededPicture(
  client: SupabaseClient<Database>,
  path: string | null,
): Promise<void> {
  if (!path) return;
  try {
    await client.storage.from(PROFILE_MEDIA_BUCKET).remove([path]);
  } catch {
    /* Silent by design — see above. */
  }
}

/* -------------------------------------------------------------------------- */
/* The outbox                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * ONE ENTRY, NOT A LIST, AND THE DIFFERENCE FROM `social/safety.ts` IS THE
 * POINT.
 *
 * A report is an EVENT: two reports about the same post are two things that
 * happened and both must be delivered, so that outbox is an array and nothing
 * is ever dropped from it. A profile is a STATE: editing your bio twice while
 * offline does not mean two bios need sending, it means the second one is the
 * bio. So this holds one entry, merged field by field, last write wins — and
 * replaying an older edit over a newer one is a thing it cannot do.
 *
 * IT IS NEVER DRAINED ON A TIMER, AT STARTUP, OR ON RECONNECT, and nothing in
 * this file says otherwise. `flushProfile()` runs after a save that SUCCEEDED —
 * the one moment the server has proved it will take a write — and it is
 * exported so a settings screen can offer "try again" as something a person
 * chooses. A queue that claimed to drain itself and did not would be worse than
 * no queue.
 */
const OUTBOX_KEY = "icefall.profile.outbox.v1";

/**
 * WHICH ACCOUNT THIS DEVICE'S PROFILE AND OUTBOX BELONG TO.
 *
 * It lives here rather than in `settings/hydrate.ts`, where it was first
 * written, because the outbox is here and the outbox is what it protects.
 * `flushProfile()` sends whatever is queued to WHOEVER IS SIGNED IN, and on a
 * shared phone that is not necessarily the person who typed it — so every entry
 * is stamped with its owner (below) and every send checks the stamp. A record
 * of the owner that a screen keeps and this module cannot read would leave the
 * one function that can do the damage unable to tell.
 *
 * IT CAN FAIL, and the failure is not silently better or worse: a phone that
 * cannot write this has no owner recorded, and an unstamped entry is treated as
 * belonging to whoever is signed in — which is the assumption the whole app
 * made before any of this existed, and the only one available.
 */
const OWNER_KEY = "icefall.settings.owner.v1";

/** The account this device's profile fields describe, if it has been recorded. */
export function profileOwner(): string | null {
  try {
    const raw = localStorage.getItem(OWNER_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

/** Returns whether the claim was actually recorded. See `OWNER_KEY`. */
export function rememberProfileOwner(uid: string): boolean {
  try {
    localStorage.setItem(OWNER_KEY, uid);
    return true;
  } catch {
    return false;
  }
}

interface PendingEdit extends ProfileEdit {
  /** When the person made the edit. ISO. Not when it will be sent. */
  at: string;
  /**
   * WHOSE EDIT THIS IS, when the phone knew at the time it was queued.
   *
   * `undefined` means it was queued by a build that did not stamp it, or on a
   * phone with no owner recorded. That is read as "this account's" — see
   * `OWNER_KEY` — because refusing to send every legacy entry would strand
   * work that in the overwhelming case belongs to the only person who has ever
   * used the phone.
   */
  uid?: string;
}

export function pendingProfileEdit(): PendingEdit | null {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const entry = parsed as PendingEdit;
    return typeof entry.at === "string" ? entry : null;
  } catch {
    return null;
  }
}

/**
 * Returns whether the write actually happened. THE CALLER MUST NOT CLAIM THE
 * EDIT WAS KEPT UNLESS THIS SAID SO — a swallowed quota error and a cheerful
 * "saved on your phone" is the same class of lie as a swallowed insert error
 * and "sent". `social/safety.ts` makes the same point about the same API.
 */
function writeOutbox(entry: PendingEdit | null): boolean {
  try {
    if (!entry) localStorage.removeItem(OUTBOX_KEY);
    else localStorage.setItem(OUTBOX_KEY, JSON.stringify(entry));
    return true;
  } catch {
    return false;
  }
}

/**
 * Only keys the caller actually set. `undefined` is "not editing this";
 * `null` is "clear this", and the two must not be confused by a merge.
 *
 * EVERY FIELD NAME BELONGS IN THIS LIST, INCLUDING THE LINKS. The first draft
 * left the six link fields out, and the omission was not cosmetic: `saveProfile`
 * uses this as its list of fields worth attempting, so an edit containing only
 * an Instagram handle — which is exactly what the edit screen sends on blur —
 * returned before touching the network and reported nothing at all. The handle
 * stayed on the phone, the column stayed null, and the screen said the field
 * was untouched. `clearFromOutbox` and `runFlush` ask the same question, so a
 * queued link was dropped from the outbox as well. Anything added to
 * `ProfileFieldName` has to be added here in the same edit.
 */
function present(edit: ProfileEdit): ProfileFieldName[] {
  const keys: ProfileFieldName[] = [
    "displayName",
    "region",
    "countryCode",
    "bio",
    "languages",
    "interests",
    "avatar",
    "banner",
    ...LINK_FIELDS,
  ];
  return keys.filter((key) => edit[key] !== undefined);
}

function pick(edit: ProfileEdit, keys: readonly ProfileFieldName[]): ProfileEdit {
  const out: Record<string, unknown> = {};
  for (const key of keys) if (edit[key] !== undefined) out[key] = edit[key];
  return out as ProfileEdit;
}

/**
 * Keep what did not get through, merged over whatever was already waiting.
 *
 * IF THE PICTURES ARE WHAT WILL NOT FIT, THE WORDS ARE STILL KEPT. A banner is
 * a 1024×384 JPEG held as a data URL — of the order of 120 KB, in a
 * `localStorage` budget of about 5 MB that this app shares with every activity,
 * goal and setting. When the quota refuses the whole entry, the text is written
 * again without the images: a bio that survived is worth more than an
 * all-or-nothing failure, and the fields that were dropped are told the truth
 * about themselves rather than being quietly included in a "queued".
 */
function keepOnDevice(
  edit: ProfileEdit,
  keys: readonly ProfileFieldName[],
): { kept: Set<ProfileFieldName> } {
  const owner = profileOwner();
  let previous = pendingProfileEdit();

  /*
   * A QUEUED EDIT BELONGING TO SOMEBODY ELSE IS NEVER MERGED INTO.
   *
   * `settings/hydrate.ts` parks the previous account's edit when the account
   * changes, so this is the case where that park could not be written. Merging
   * this person's bio into a stranger's entry would produce one edit with two
   * authors and one stamp — and whichever stamp it kept, half of it would be
   * sent to the wrong row or thrown away. So the stranger's entry is parked
   * here instead, and if it cannot be parked this reports keeping NOTHING,
   * which is the honest answer: the phone has no room to hold this safely.
   */
  if (previous && previous.uid !== undefined && owner !== null && previous.uid !== owner) {
    if (parkPendingProfileEdit(previous.uid) !== "parked") return { kept: new Set() };
    previous = null;
  }

  /* The stamp `runFlush` checks. `previous.uid` first so an entry that already
     knows whose it is cannot be quietly re-attributed; `undefined` when this
     phone has no owner recorded, which is a state with its own reading. */
  const stamp = previous?.uid ?? owner ?? undefined;

  const merged: PendingEdit = {
    ...(previous ?? {}),
    ...pick(edit, keys),
    at: new Date().toISOString(),
    uid: stamp,
  };

  if (writeOutbox(merged)) return { kept: new Set(keys) };

  const textOnly = keys.filter((key) => key !== "avatar" && key !== "banner");
  if (textOnly.length > 0 && textOnly.length < keys.length) {
    /*
     * The second attempt drops THIS EDIT'S pictures and nothing else. A picture
     * queued by an EARLIER edit is left exactly where it is: this call did not
     * touch it, nobody has been told it was discarded, and quietly dropping it
     * would mean a photograph the person believes is waiting to be sent has
     * silently stopped waiting.
     *
     * If that older picture is what will not fit, this attempt fails too and
     * every field in this edit is reported `failed`. That is the honest end of
     * it — worse for the person than a partial keep, and true.
     */
    const smaller: PendingEdit = {
      ...(previous ?? {}),
      ...pick(edit, textOnly),
      at: new Date().toISOString(),
      uid: stamp,
    };
    if (writeOutbox(smaller)) return { kept: new Set(textOnly) };
  }
  return { kept: new Set() };
}

/* -------------------------------------------------------------------------- */
/* Typed and not yet sent — the window the outbox cannot see                    */
/* -------------------------------------------------------------------------- */

/**
 * FIELD NAMES ONLY, AND THAT IS ENOUGH.
 *
 * The outbox records what FAILED to go. It records nothing about text that has
 * been typed and not yet sent at all — the edit screen patches the phone on
 * every keystroke and sends when the box is left, so between those two moments
 * the new words are in `settings/store.ts` and nowhere else. Reload the app in
 * that window and `settings/hydrate.ts` would take the server's older value,
 * with nothing anywhere to restore the typed one from.
 *
 * WHY THE NAME IS ENOUGH AND THE VALUE IS NOT NEEDED: the value is already
 * persisted — `settings/store.ts` writes the whole store to `localStorage` on
 * every patch, so the words survive the reload. The only thing missing is the
 * KNOWLEDGE that they are unsent, and that is one short field name.
 *
 * IT IS CLEARED THE MOMENT A SEND HAS BEEN ATTEMPTED, whatever the answer:
 * after an attempt the outbox is the record — a failure is queued there and a
 * refusal has been reported to the person — so a mark that outlived the attempt
 * would block that field from ever being fetched again on this phone.
 */
const UNSENT_KEY = "icefall.profile.unsent.v1";

function readUnsent(): ProfileFieldName[] {
  try {
    const raw = localStorage.getItem(UNSENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed)
      ? (parsed.filter((v) => typeof v === "string") as ProfileFieldName[])
      : [];
  } catch {
    return [];
  }
}

function writeUnsent(fields: readonly ProfileFieldName[]): void {
  try {
    if (fields.length === 0) localStorage.removeItem(UNSENT_KEY);
    else localStorage.setItem(UNSENT_KEY, JSON.stringify(fields));
  } catch {
    /* No room for a list of field names. Nothing is claimed on the strength of
       it — `hydrate` simply has one fewer reason to keep a device value, which
       is the behaviour before this record existed. */
  }
}

/** Somebody has typed into this field and nothing has been sent. */
export function noteUnsentField(field: ProfileFieldName): void {
  const fields = readUnsent();
  if (fields.includes(field)) return;
  writeUnsent([...fields, field]);
}

/** A send has been attempted for this field, so the outbox now speaks for it. */
export function forgetUnsentField(field: ProfileFieldName): void {
  const fields = readUnsent();
  if (!fields.includes(field)) return;
  writeUnsent(fields.filter((f) => f !== field));
}

/** Fields typed on this phone and not yet sent to anybody. */
export function unsentProfileFields(): readonly ProfileFieldName[] {
  return readUnsent();
}

/** The marks describe one person's typing. On an account change they go. */
export function forgetAllUnsentFields(): void {
  writeUnsent([]);
}

/** Drop the fields that made it, keep the rest waiting. */
function clearFromOutbox(saved: readonly ProfileFieldName[]): void {
  const entry = pendingProfileEdit();
  if (!entry) return;
  const next = { ...entry };
  for (const key of saved) delete next[key];
  const stillWaiting = present(next).length > 0;
  writeOutbox(stillWaiting ? next : null);
}

/* -------------------------------------------------------------------------- */
/* The two requests                                                            */
/* -------------------------------------------------------------------------- */

/**
 * WHICH FIELDS TRAVEL TOGETHER, AND WHY IT IS EXACTLY THIS SPLIT.
 *
 * LIVE — `display_name`, `location_label`, `country_code`, `avatar_url` are all
 * columns on the deployed database today. Nothing in this group can fail for a
 * schema reason, so grouping them is free.
 *
 * PENDING — `bio`, `languages`, `interests`, `banner_url` arrive together in
 * ONE migration. There is no ladder between them for that reason: no deployment
 * can have three of the four, so probing per column would spend up to four
 * round trips discovering something already known. If that ever stops being
 * true, this is the comment that was wrong and the place to add rungs.
 *
 * `avatar_url` sits in the LIVE group even though a photograph needs the
 * pending BUCKET, because the two are separately deployable: the bucket block
 * is wrapped in its own exception handler. An avatar whose upload failed is
 * simply absent from the payload, so the name beside it still saves.
 */
/*
 * `username` IS READ AND NEVER WRITTEN. A handle is given away by changing it,
 * so it is claimed through `claim_username` and never through an UPDATE — but
 * `settings/hydrate.ts` CLEARS the device's copy on an account change, and a
 * field that is cleared and never refilled is a field the share card falls back
 * to guessing from a display name. So it rides along with the read.
 */
const LIVE_COLUMNS = "display_name, location_label, country_code, avatar_url, username";
const PENDING_COLUMNS = "bio, languages, interests, banner_url";

/**
 * THE LINK COLUMNS — `20260907090000_profile_links.sql` — AND WHY THEY ARE A
 * THIRD REQUEST RATHER THAN SIX MORE NAMES IN `PENDING_COLUMNS`.
 *
 * The module header states the rule this follows: a PostgREST UPDATE naming a
 * column the server does not have is not partially satisfied — it comes back
 * `PGRST204` and NOTHING is written. Two migrations are two independent facts
 * about a server, so folding these in with `bio` would mean that until somebody
 * runs `supabase db push` for the NEWER migration, saving a bio silently fails
 * because the same request also mentioned Instagram.
 *
 * One request per migration. It is the same reasoning that split request one
 * from request two, applied a third time, and it will need a fourth the next
 * time a column is added by a migration that can land separately.
 */
const LINK_COLUMNS = "website, instagram, facebook, youtube, tiktok, strava";

/** The link fields, in the order the form shows them. */
const LINK_FIELDS = ["website", "instagram", "facebook", "youtube", "tiktok", "strava"] as const;

/** `settings` key → `profiles` column. Identical today; named so it stays honest
    if either side is ever renamed. */
const LINK_COLUMN_OF: Record<(typeof LINK_FIELDS)[number], string> = {
  website: "website",
  instagram: "instagram",
  facebook: "facebook",
  youtube: "youtube",
  tiktok: "tiktok",
  strava: "strava",
};

type Row = Record<string, unknown>;

type WriteOutcome =
  | { ok: true; row: Row }
  | { ok: false; state: "not-yet-on-server" | "queued"; message: string };

/**
 * A finished UPDATE, interpreted.
 *
 * IT TAKES THE PROMISE RATHER THAN BUILDING THE QUERY, so that the live half
 * can be built on the TYPED client — `display_name`, `location_label`,
 * `country_code` and `avatar_url` are then checked against `backend/types.ts`
 * at compile time, which is exactly the half that must not drift — while the
 * pending half is built on the untyped view, because the columns it names do
 * not exist in that file yet and a typed `.update()` naming them would not
 * compile. One interpreter, two builders, and no cast pretending the untyped
 * one is typed.
 */
async function interpretWrite(
  work: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<WriteOutcome> {
  const { data, error } = await work;

  if (error) {
    const pgError = error as PostgrestError;
    const state =
      classifyBackendError(pgError) === "not-provisioned" ? "not-yet-on-server" : "queued";
    return { ok: false, state, message: sentenceFor(pgError) };
  }
  /*
   * NO ERROR IS NOT A SAVE. PostgREST answers an UPDATE that matched no row
   * with `data: null` and no error at all — which is what a broken policy, a
   * suspended account or a profile row that was never created looks like from
   * here. Reporting that as success is the precise failure this module exists
   * to end, so the row itself is the evidence and nothing else is accepted as
   * one.
   */
  if (!data || typeof data !== "object") {
    return { ok: false, state: "queued", message: SYNC_NO_ROW };
  }
  return { ok: true, row: data as Row };
}

/** A value off the read-back row, as a string or null — never `undefined`,
    which a screen would have to test for separately. */
function textOf(row: Row, column: string): string | null {
  const value = row[column];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** An array off the read-back row. Anything else is not a list of anything and
    is reported as an empty one rather than coerced. */
function listOf(row: Row, column: string): string[] {
  const value = row[column];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/* -------------------------------------------------------------------------- */
/* Saving                                                                      */
/* -------------------------------------------------------------------------- */

const saved = (stored: string | string[] | null, dropped?: string[]): FieldResult => ({
  state: "saved",
  keptOnDevice: false,
  message: "Saved to your ICEFALL profile.",
  stored,
  ...(dropped && dropped.length > 0 ? { dropped } : {}),
});

const notStorable = (message: string, dropped?: string[]): FieldResult => ({
  state: "not-storable",
  keptOnDevice: false,
  message,
  ...(dropped && dropped.length > 0 ? { dropped } : {}),
});

/**
 * Save a profile edit, and say per field exactly what became of it.
 *
 * It never throws. Every failure is a field result with a sentence attached,
 * because a rejected promise on a settings screen is a spinner that never
 * stops.
 *
 * THE CALLER STILL OWNS THE LOCAL STORE. This module reads nothing from
 * `settings/store.ts` and writes nothing to it — a screen calls `patch()` for
 * the device and this for the server, and decides for itself whether to replace
 * what it holds with the `stored` values that came back. Those two are not
 * always identical: the server trims, lowercases, deduplicates and sorts, and
 * `stored` is what other people will actually see.
 */
export async function saveProfile(edit: ProfileEdit): Promise<SaveProfileResult> {
  const asked = present(edit);
  const fields: Partial<Record<ProfileFieldName, FieldResult>> = {};

  if (asked.length === 0) {
    // `allSaved` is FALSE for an empty edit rather than vacuously true: a screen
    // that prints "Saved" on `allSaved` would otherwise announce a save for a
    // form nobody changed.
    return { fields, savedAny: false, allSaved: false, pending: pendingProfileEdit() !== null };
  }

  /* ---- Values ICEFALL cannot store, settled before anything goes near the
         network. Each is removed from the attempt so the rest still saves. --- */

  const attempt: ProfileFieldName[] = [];

  let displayName: string | undefined;
  if (edit.displayName !== undefined) {
    const name = edit.displayName.trim().replace(/\s+/g, " ");
    if (name.length === 0) {
      fields.displayName = notStorable(
        "A profile has to have a name on it, so ICEFALL cannot save an empty one. What was there before is unchanged.",
      );
    } else if (name.length > 80) {
      fields.displayName = notStorable(
        `ICEFALL keeps a name to 80 characters and this one is ${name.length}. It has not been saved.`,
      );
    } else {
      displayName = name;
      attempt.push("displayName");
    }
  }

  let region: string | null | undefined;
  if (edit.region !== undefined) {
    const label = edit.region.trim().replace(/\s+/g, " ");
    if (label.length > 80) {
      fields.region = notStorable(
        `ICEFALL keeps a location to 80 characters and this one is ${label.length}. It has not been saved.`,
      );
    } else {
      region = label.length > 0 ? label : null;
      attempt.push("region");
    }
  }

  let countryCode: string | null | undefined;
  if (edit.countryCode !== undefined) {
    const code = (edit.countryCode ?? "").trim().toUpperCase();
    if (code.length === 0) {
      countryCode = null;
      attempt.push("countryCode");
    } else if (/^[A-Z]{2}$/.test(code)) {
      countryCode = code;
      attempt.push("countryCode");
    } else {
      // NOTHING IS INFERRED HERE. A caller passing "Greece" or "Athens, Greece"
      // is asking this module to guess, and the answer is no — see
      // `COUNTRY_IS_NEVER_PARSED`.
      fields.countryCode = notStorable(COUNTRY_IS_NEVER_PARSED);
    }
  }

  let bio: string | null | undefined;
  if (edit.bio !== undefined) {
    const checked = checkBio(edit.bio);
    if (checked.ok) {
      bio = checked.value;
      attempt.push("bio");
    } else {
      fields.bio = notStorable(checked.message);
    }
  }

  let languages: string[] | undefined;
  let languagesDropped: string[] = [];
  if (edit.languages !== undefined) {
    const mapped = languageCodes(edit.languages);
    languagesDropped = mapped.dropped;
    if (mapped.codes.length === 0 && mapped.dropped.length > 0) {
      // Everything they typed was unrecognisable. Writing `{}` would clear the
      // column and report a save, which would read as ICEFALL having accepted
      // the words and stored nothing.
      fields.languages = notStorable(LANGUAGES_NOT_RECOGNISED, mapped.dropped);
    } else {
      languages = mapped.codes;
      attempt.push("languages");
    }
  }

  /*
   * INTERESTS ARE RESOLVED AFTER THE GATE, NOT HERE, and the reason is not
   * tidiness: mapping typed words to slugs needs `interest_tags`, which is
   * itself a read against the same server. Doing it during local validation
   * would mean a phone with no signal spent a failed request discovering
   * something the offline check below already knows, and — worse — the first
   * draft of this file reported "kept on your phone" from that branch without
   * ever writing to the outbox, which is precisely the claim-without-evidence
   * this module exists to prevent. The mapping happens after the gate, just
   * before the second request.
   */
  if (edit.interests !== undefined) attempt.push("interests");

  if (edit.avatar !== undefined) attempt.push("avatar");
  if (edit.banner !== undefined) attempt.push("banner");

  /*
   * THE LINKS COUNT AS AN ATTEMPT TOO, and leaving them out of this list was
   * the second half of the same bug as `present()`. `attempt` is what the guard
   * below tests and what `queueAll` queues — so with the links missing, a
   * handle typed with no signal reached neither the server nor the outbox, and
   * the screen reported nothing. Nothing is validated here: the trimming and
   * the shape of a handle are settled at request three, against the migration's
   * own constraint rather than a second copy of it written in this file.
   */
  for (const key of LINK_FIELDS) if (edit[key] !== undefined) attempt.push(key);

  if (attempt.length === 0) {
    return {
      fields,
      savedAny: false,
      allSaved: false,
      pending: pendingProfileEdit() !== null,
    };
  }

  /* ---- Is there anywhere to send it at all? ------------------------------- */

  const queueAll = (message: string) => {
    const { kept } = keepOnDevice(edit, attempt);
    for (const key of attempt) {
      fields[key] = kept.has(key)
        ? { state: "queued", keptOnDevice: true, message }
        : {
            state: "failed",
            keptOnDevice: false,
            message: key === "avatar" || key === "banner" ? SYNC_PHOTO_NOT_KEPT : SYNC_NOT_KEPT,
          };
    }
    return {
      fields,
      savedAny: false,
      allSaved: false,
      pending: pendingProfileEdit() !== null,
    } satisfies SaveProfileResult;
  };

  const session = await gate();
  if (!session.ok) return queueAll(session.message);

  // Checked before the call so an attempt with no network says "no signal"
  // rather than whatever a dropped fetch happens to look like on this engine.
  // `navigator.onLine` is honest about exactly one thing: there is no network
  // interface at all.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return queueAll(SYNC_OFFLINE);
  }

  /* ---- Pictures first: their URLs are what the columns carry -------------- */

  let avatarUrl: string | null | undefined;
  let avatarSuperseded: string | null = null;
  if (edit.avatar !== undefined) {
    if (edit.avatar === null || edit.avatar.length === 0) {
      // Removing a photograph needs no bucket and works today.
      avatarUrl = null;
    } else {
      const uploaded = await uploadPicture(session.client, session.uid, "avatar", edit.avatar);
      if (uploaded.ok) {
        avatarUrl = uploaded.url;
        avatarSuperseded = uploaded.replaces;
      } else if (uploaded.state === "not-storable") {
        fields.avatar = notStorable(uploaded.message);
      } else {
        const { kept } = keepOnDevice(edit, ["avatar"]);
        fields.avatar = kept.has("avatar")
          ? { state: uploaded.state, keptOnDevice: true, message: uploaded.message }
          : { state: "failed", keptOnDevice: false, message: SYNC_PHOTO_NOT_KEPT };
      }
    }
  }

  let bannerUrl: string | null | undefined;
  let bannerSuperseded: string | null = null;
  if (edit.banner !== undefined) {
    if (edit.banner === null || edit.banner.length === 0) {
      bannerUrl = null;
    } else {
      const uploaded = await uploadPicture(session.client, session.uid, "banner", edit.banner);
      if (uploaded.ok) {
        bannerUrl = uploaded.url;
        bannerSuperseded = uploaded.replaces;
      } else if (uploaded.state === "not-storable") {
        fields.banner = notStorable(uploaded.message);
      } else {
        const { kept } = keepOnDevice(edit, ["banner"]);
        fields.banner = kept.has("banner")
          ? { state: uploaded.state, keptOnDevice: true, message: uploaded.message }
          : { state: "failed", keptOnDevice: false, message: SYNC_PHOTO_NOT_KEPT };
      }
    }
  }

  /* ---- Request one: the columns this server already has ------------------- */

  /* TYPED, deliberately: every column named here exists in `backend/types.ts`
     and on the live database, so a typo is a compile error rather than a save
     that silently does nothing. */
  const liveValues: Partial<Profile> = {};
  const liveFields: ProfileFieldName[] = [];
  if (displayName !== undefined) {
    liveValues.display_name = displayName;
    liveFields.push("displayName");
  }
  if (region !== undefined) {
    liveValues.location_label = region;
    liveFields.push("region");
  }
  if (countryCode !== undefined) {
    liveValues.country_code = countryCode;
    liveFields.push("countryCode");
  }
  if (avatarUrl !== undefined) {
    liveValues.avatar_url = avatarUrl;
    liveFields.push("avatar");
  }

  if (liveFields.length > 0) {
    const deadline = withTimeout(WRITE_TIMEOUT_MS);
    /* `.abortSignal()` MUST COME BEFORE `.maybeSingle()`: it is declared on
       PostgrestTransformBuilder and returns `this`, while `maybeSingle()`
       returns a builder without it — so the other order is a compile error
       rather than a silently lost deadline. */
    const query = session.client
      .from("profiles")
      .update(liveValues)
      .eq("id", session.uid)
      .select(LIVE_COLUMNS);
    const result = await interpretWrite(
      (deadline ? query.abortSignal(deadline) : query).maybeSingle(),
    );
    if (result.ok) {
      for (const key of liveFields) {
        if (key === "displayName") fields.displayName = saved(textOf(result.row, "display_name"));
        if (key === "region") fields.region = saved(textOf(result.row, "location_label"));
        if (key === "countryCode") fields.countryCode = saved(textOf(result.row, "country_code"));
        if (key === "avatar") fields.avatar = saved(textOf(result.row, "avatar_url"));
      }
      // Only now, with the row proved to hold the new URL, is the file it
      // replaced safe to remove. See `MEDIA_MEMO_KEY` for what is NOT removed.
      void removeSupersededPicture(session.client, avatarSuperseded);
    } else {
      const { kept } = keepOnDevice(edit, liveFields);
      for (const key of liveFields) {
        fields[key] = kept.has(key)
          ? { state: result.state, keptOnDevice: true, message: result.message }
          : {
              state: "failed",
              keptOnDevice: false,
              message: key === "avatar" ? SYNC_PHOTO_NOT_KEPT : SYNC_NOT_KEPT,
            };
      }
    }
  }

  /* ---- Interests, now that there is a session to read the vocabulary with -- */

  let interests: string[] | undefined;
  let interestsDropped: string[] = [];
  if (edit.interests !== undefined) {
    const vocabulary = await fetchInterestTags();
    if (!vocabulary.ok) {
      /*
       * No list means no way to map words to slugs — and sending the raw words
       * instead would make the server's trigger raise `unknown interest tag`,
       * which fails the WHOLE request and would take the bio and the languages
       * down with it. So interests wait, alone, and nothing else is harmed.
       *
       * The keep is CHECKED, not assumed: `keepOnDevice` returns whether the
       * phone actually took it.
       */
      const { kept } = keepOnDevice(edit, ["interests"]);
      const state = vocabulary.failure === "not-provisioned" ? "not-yet-on-server" : "queued";
      fields.interests = kept.has("interests")
        ? {
            state,
            keptOnDevice: true,
            message:
              state === "not-yet-on-server"
                ? SYNC_NOT_DEPLOYED
                : "ICEFALL could not read its own list of interests, so it could not check yours against it. Your interests are kept on this phone and have not been saved.",
          }
        : { state: "failed", keptOnDevice: false, message: SYNC_NOT_KEPT };
    } else {
      const mapped = interestSlugs(edit.interests, vocabulary.tags);
      interestsDropped = mapped.dropped;
      if (mapped.slugs.length === 0 && mapped.dropped.length > 0) {
        // Every word they typed is off the list. Writing `{}` would clear the
        // column and report a save, which reads as ICEFALL having taken the
        // words and stored them — when it took none of them.
        fields.interests = notStorable(INTERESTS_NOT_IN_LIST, mapped.dropped);
      } else {
        interests = mapped.slugs;
      }
    }
  }

  /* ---- Request two: the columns 20260903020000 adds ----------------------- */

  /* UNTYPED, because `backend/types.ts` does not describe these columns — they
     are in a migration nobody has pushed, and adding them to that file would
     claim in the type system that they exist. The names are written out once,
     here and in `PENDING_COLUMNS`. */
  const pendingValues: Row = {};
  const pendingFields: ProfileFieldName[] = [];
  if (bio !== undefined) {
    pendingValues.bio = bio;
    pendingFields.push("bio");
  }
  if (languages !== undefined) {
    pendingValues.languages = languages;
    pendingFields.push("languages");
  }
  if (interests !== undefined) {
    pendingValues.interests = interests;
    pendingFields.push("interests");
  }
  if (bannerUrl !== undefined) {
    pendingValues.banner_url = bannerUrl;
    pendingFields.push("banner");
  }

  if (pendingFields.length > 0) {
    const deadline = withTimeout(WRITE_TIMEOUT_MS);
    const query = session.loose
      .from("profiles")
      .update(pendingValues)
      .eq("id", session.uid)
      .select(PENDING_COLUMNS);
    const result = await interpretWrite(
      (deadline ? query.abortSignal(deadline) : query).maybeSingle(),
    );
    if (result.ok) {
      for (const key of pendingFields) {
        if (key === "bio") fields.bio = saved(textOf(result.row, "bio"));
        if (key === "languages")
          fields.languages = saved(listOf(result.row, "languages"), languagesDropped);
        if (key === "interests")
          fields.interests = saved(listOf(result.row, "interests"), interestsDropped);
        if (key === "banner") fields.banner = saved(textOf(result.row, "banner_url"));
      }
      void removeSupersededPicture(session.client, bannerSuperseded);
    } else {
      const { kept } = keepOnDevice(edit, pendingFields);
      for (const key of pendingFields) {
        fields[key] = kept.has(key)
          ? { state: result.state, keptOnDevice: true, message: result.message }
          : {
              state: "failed",
              keptOnDevice: false,
              message: key === "banner" ? SYNC_PHOTO_NOT_KEPT : SYNC_NOT_KEPT,
            };
      }
    }
  }

  /* ---- Request three: the columns 20260907090000 adds --------------------- */

  const linkValues: Row = {};
  const linkFields: ProfileFieldName[] = [];
  for (const key of LINK_FIELDS) {
    const value = edit[key];
    if (value === undefined) continue;
    /* Trimmed here as well as in the trigger. The trigger is what makes it
       true for every client; this is what stops a stray space being sent as an
       edit and coming back "saved" with a different value than was typed. */
    linkValues[LINK_COLUMN_OF[key]] = value.trim() === "" ? null : value.trim();
    linkFields.push(key);
  }

  if (linkFields.length > 0) {
    const deadline = withTimeout(WRITE_TIMEOUT_MS);
    const query = session.loose
      .from("profiles")
      .update(linkValues)
      .eq("id", session.uid)
      .select(LINK_COLUMNS);
    const result = await interpretWrite(
      (deadline ? query.abortSignal(deadline) : query).maybeSingle(),
    );
    if (result.ok) {
      for (const key of linkFields) {
        fields[key] = saved(
          textOf(result.row, LINK_COLUMN_OF[key as (typeof LINK_FIELDS)[number]]),
        );
      }
    } else {
      const { kept } = keepOnDevice(edit, linkFields);
      for (const key of linkFields) {
        fields[key] = kept.has(key)
          ? { state: result.state, keptOnDevice: true, message: result.message }
          : { state: "failed", keptOnDevice: false, message: SYNC_NOT_KEPT };
      }
    }
  }

  /*
   * A FIELD WITH NO RESULT IS A BUG, AND IT IS STILL NOT ALLOWED TO BE SILENT.
   *
   * Every path above sets a result for every field it was given, so this loop
   * should never fire. It is here for the same reason `publicProfile.ts` handles
   * a row with no name on it: the failure mode if the reasoning is ever wrong is
   * a field that quietly reports nothing, which a screen would render as
   * "unchanged" — and this module's whole job is that an edit is never quietly
   * anything. An unknown outcome is reported as not saved, which is the safe
   * direction to be wrong in.
   */
  for (const key of asked) {
    if (fields[key]) continue;
    fields[key] = {
      state: "failed",
      keptOnDevice: false,
      message:
        "ICEFALL cannot say what became of this one, so treat it as not saved. This is a fault at ICEFALL's end rather than anything you did.",
    };
  }

  // `asked`, not `attempt`: a field that was never sent because ICEFALL cannot
  // store the value is still a field the caller asked about, and `allSaved` must
  // be false while one of them is unsaved.
  const savedKeys = asked.filter((key) => fields[key]?.state === "saved");

  /*
   * A VALUE THE SERVER WILL NEVER TAKE DOES NOT WAIT IN THE QUEUE FOR EVER.
   *
   * `not-storable` means, by that state's own definition, that retrying changes
   * nothing — the words are not on the interests list, the code is not two
   * letters. An entry that can never be sent and is never removed sits in the
   * outbox permanently, and `settings/hydrate.ts` reads the outbox as "the
   * device is holding this unsent", so that field could never be fetched from
   * the server on this phone again — including the correct value the athlete
   * later set from another one.
   *
   * WHAT THIS COSTS, SAID PLAINLY: the words stay in the box on this phone —
   * nothing is deleted from `settings/store.ts` — but they stop being retried,
   * and a later fetch may replace them with what the server holds. The person
   * has been told, in `FieldResult.message`, exactly why they were not saved.
   */
  const settledKeys = asked.filter(
    (key) => fields[key]?.state === "saved" || fields[key]?.state === "not-storable",
  );
  if (settledKeys.length > 0) clearFromOutbox(settledKeys);
  if (savedKeys.length > 0) {
    // The server has just proved it takes writes, which is the only moment this
    // module has evidence that draining is worth attempting. Fire and forget:
    // the edit the person is waiting on has already succeeded and must not be
    // held up by an older one.
    void flushProfile();
  }

  return {
    fields,
    savedAny: savedKeys.length > 0,
    allSaved: savedKeys.length === asked.length,
    pending: pendingProfileEdit() !== null,
  };
}

let flushing = false;

/**
 * Send whatever is waiting on this phone.
 *
 * It re-runs the ordinary save path, so a queued edit is subject to exactly the
 * same rules and the same read-back as a fresh one — there is no second, weaker
 * write path that could report a success the first one would not.
 *
 * `saveProfile` already removes what it saved from the outbox, so this needs no
 * bookkeeping of its own. It returns the result for a screen that wants to say
 * what happened; a screen that does not can ignore it.
 *
 * IT IS NOT CALLED ON A TIMER, AT STARTUP, OR ON RECONNECT. See `OUTBOX_KEY`.
 */
export async function flushProfile(): Promise<SaveProfileResult | null> {
  // Re-entrancy guard, not a lock. `saveProfile` calls this after a success, so
  // a flush that saves something would otherwise call itself; each pass strictly
  // shrinks the outbox so it would terminate, but two overlapping passes would
  // send the same edit twice. `null` here means "a flush is already running",
  // which is why it is not reported as a failure.
  if (flushing) return null;
  flushing = true;
  try {
    return await runFlush();
  } finally {
    flushing = false;
  }
}

async function runFlush(): Promise<SaveProfileResult | null> {
  const entry = pendingProfileEdit();
  if (!entry) return null;

  /*
   * A QUEUE HAS AN OWNER, AND THIS IS THE ONE PLACE THAT CAN ENFORCE IT.
   *
   * `saveProfile` writes `.eq("id", session.uid)` — whoever is signed in NOW.
   * So an edit typed by the previous person on a shared phone would be written
   * onto the arriving person's row, silently, on the arriving person's first
   * successful save. `settings/hydrate.ts` parks the previous account's edit
   * when it notices the change, but it cannot be the only guard: it runs once
   * per app load, and its park can fail on a phone with no room. The stamp is
   * checked here because here is where the send happens.
   *
   * A stranger's entry is parked under its own owner rather than deleted — the
   * same reasoning as `parkPendingProfileEdit`. If the park cannot be written
   * it stays where it is and this refuses again next time, which is the safe
   * direction to be stuck in.
   */
  if (entry.uid !== undefined) {
    const session = await gate();
    if (session.ok && session.uid !== entry.uid) {
      parkPendingProfileEdit(entry.uid);
      return null;
    }
  }

  const { at, uid, ...edit } = entry;
  void at;
  void uid;
  if (present(edit).length === 0) {
    writeOutbox(null);
    return null;
  }
  return saveProfile(edit);
}

/* -------------------------------------------------------------------------- */
/* Reading — the half of this module that did not exist                        */
/* -------------------------------------------------------------------------- */

/**
 * THE PROFILE FOLLOWS THE PERSON, NOT THE PHONE.
 *
 * ── THE BUG THIS EXISTS TO END, WHICH IS THE MIRROR OF THE ONE ABOVE ────────
 *
 * Everything above this line SENDS. Nothing in this module — and nothing in
 * `src/` outside the identity header — ever ASKED the server what this athlete's
 * profile says. The only round trip that read these columns was the `.select()`
 * on the end of an `.update()`, which reads back what it has just written.
 *
 * So: somebody sets their photograph, their region and their bio on one phone,
 * every one of them reaches `public.profiles`, and then they sign in on a second
 * phone and their face is gone. `avatar_url` is a LIVE column and has held the
 * URL the whole time; nothing was ever fetched. `auth/useMyProfile.ts` reads the
 * handle and the display name for the identity header, and `Auth.tsx` reads a
 * name and an email — neither seeds `settings/store.ts`, which is what actually
 * draws the athlete's own avatar, cover, region, bio, languages, interests and
 * links.
 *
 * ── ONE REQUEST PER MIGRATION, EXACTLY AS THE WRITE PATH DOES ───────────────
 *
 * A select naming a column the server does not have fails with `42703` and
 * returns NOTHING — the same all-or-nothing the module header describes for an
 * update. Folding `bio` into the live select would therefore mean that on a
 * deployment missing one migration, an athlete's PHOTOGRAPH does not come back
 * because the same request also asked for their bio. So the read is split on
 * the same three seams the write is split on, the three run in parallel, and a
 * seam that fails costs its own fields and nothing else.
 *
 * ── AND `undefined` IS NOT `null` HERE EITHER ───────────────────────────────
 *
 * On `ServerProfile`, `null` is a MEASURED empty — the row was read and that
 * column holds nothing — while `undefined` means NOT ANSWERED: the column is
 * not on this deployment, or that one request failed. The merge must never
 * clear a field on the strength of a question that was never answered, which is
 * the read-side form of the rule that a missing error is not a save.
 */

/** One row of four to fourteen small columns. Shorter than a write: nothing is
    typed into a box while this runs, so a long wait is a blank screen rather
    than a saved edit. */
const READ_TIMEOUT_MS = 6_000;

/** No signal at all. The device keeps rendering what it holds. */
export const PROFILE_NOT_FETCHED_OFFLINE =
  "No signal, so ICEFALL could not fetch your profile from its server. What you can see is what this phone was already holding.";

/** The request went out and did not come back. */
export const PROFILE_NOT_FETCHED_UNREACHABLE =
  "ICEFALL could not reach its server, so your profile has not been fetched. What you can see is what this phone was already holding — nothing has been lost, and nothing has been checked either.";

/** The server answered and would not hand the row over. */
export const PROFILE_NOT_FETCHED_REFUSED =
  "ICEFALL's server would not hand over your profile, so it has not been fetched. Signing out and in again is the thing most likely to fix it; until then this is what this phone was holding.";

/**
 * The select ran and matched no row. Stated separately from a refusal, because
 * they are different facts and only one of them is about the account's rules.
 */
export const PROFILE_NOT_ON_SERVER =
  "ICEFALL's server holds no profile for this account, so there was nothing to fetch. Anything you can see here is what this phone was holding.";

/** Answered, and not in any way this module recognises. */
export const PROFILE_FETCH_FAILED =
  "ICEFALL could not fetch your profile and its server did not say why. What you can see is what this phone was already holding.";

/**
 * WHY A FETCH DID NOT HAPPEN. `no-backend` and `signed-out` are conditions of
 * the build and the session rather than faults, and a screen should say nothing
 * about either — see `useProfileHydration` in `settings/hydrate.ts`, which is
 * the one place that decides what is worth telling somebody.
 */
export type ProfileFetchFailure =
  | "no-backend"
  | "signed-out"
  | "offline"
  | "unreachable"
  | "refused"
  | "no-row"
  | "unknown";

/**
 * THIS ATHLETE'S ROW, AS THE SERVER HOLDS IT.
 *
 * Named as `settings/store.ts` names things rather than as the database does,
 * for the same reason `ProfileEdit` is: the translation belongs in this module
 * and in one direction only, so a screen never learns that `region` is
 * `location_label`.
 */
export interface ServerProfile {
  /** LIVE columns. Always answered when the fetch is `ok`; `null` is measured. */
  displayName: string | null;
  region: string | null;
  countryCode: string | null;
  /**
   * The claimed handle. READ-ONLY on this path — there is no `username` on
   * `ProfileEdit` and there must not be; see `LIVE_COLUMNS`.
   */
  username: string | null;
  /**
   * `avatar_url` — AN https URL INTO THE PUBLIC `profile-media` BUCKET, never a
   * data URL. `uploadPicture` is what guarantees that and 20260903020000 adds a
   * constraint that refuses anything else. It goes into `settings.avatar`
   * unchanged: every surface in the app puts that value straight into an
   * `<img src>`, which takes either form.
   *
   * IT REPLACES A DATA URL WITH A NETWORK URL, WHICH IS ONLY SAFE BECAUSE THE
   * SERVICE WORKER KEEPS IT. On the athlete's own phone `settings.avatar` used
   * to be a self-contained data URL that always rendered; a bucket URL renders
   * only if the bytes are somewhere. `vite.config.ts` has a CacheFirst rule for
   * `*.supabase.co/storage/v1/object/public/profile-media/*` for exactly this
   * reason — the face is on screen in a hut with no signal because it was
   * cached the first time it loaded. That rule and this line are one fact
   * written in two places; neither may be removed alone.
   * See `PROFILE_MEDIA_BUCKET`.
   */
  avatar: string | null;
  /** 20260903020000. `undefined` — the key absent — means NOT ANSWERED. */
  bio?: string | null;
  languages?: string[];
  interests?: string[];
  banner?: string | null;
  /** 20260907090000. Same rule: absent is not an answer. */
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  strava?: string | null;
}

export type FetchProfileResult =
  | { ok: true; uid: string; profile: ServerProfile }
  | { ok: false; failure: ProfileFetchFailure; message: string };

/** A Postgres failure on a READ, as one of the failures above plus its sentence.
    `not-provisioned` cannot reach here for the live select — those four columns
    have been on `profiles` from the start — so it is folded into `unknown`
    rather than given a sentence claiming the athlete's own profile is a feature
    that has not shipped. */
function readFailureFor(error: PostgrestError): { failure: ProfileFetchFailure; message: string } {
  switch (classifyBackendError(error)) {
    case "refused":
      return { failure: "refused", message: PROFILE_NOT_FETCHED_REFUSED };
    case "unreachable":
      return { failure: "unreachable", message: PROFILE_NOT_FETCHED_UNREACHABLE };
    default:
      return { failure: "unknown", message: PROFILE_FETCH_FAILED };
  }
}

/**
 * Fetch the signed-in athlete's own profile row.
 *
 * It never throws, for the same reason `saveProfile` does not: this runs while
 * the app is opening, and a rejected promise there is a screen that never
 * settles.
 *
 * IT WRITES NOTHING — not the store, not the outbox, not the media memo. What
 * to do with a server value that disagrees with the device is a decision with
 * an athlete's unsent work on the other side of it, and it is made in exactly
 * one place: `settings/hydrate.ts`.
 */
export async function fetchMyProfile(): Promise<FetchProfileResult> {
  const session = await gate();
  if (!session.ok) {
    if (session.failure === "unreachable") {
      return { ok: false, failure: "unreachable", message: PROFILE_NOT_FETCHED_UNREACHABLE };
    }
    /* `no-backend` and `signed-out` keep the gate's own sentences, which are
       written for a SAVE ("it is kept on this phone in the meantime"). That is
       the wrong voice for a read, and it is deliberately not fixed here with a
       second pair of near-identical constants: the only caller
       (`settings/hydrate.ts`) marks both as not worth telling anybody, because
       one is the permanent condition of a demo build and the other is a state
       the route gate has already handled. A caller that ever DOES want to print
       these needs read-side copy written for it. */
    return { ok: false, failure: session.failure, message: session.message };
  }

  // Same check, same reason as the write path: `navigator.onLine` is honest
  // about exactly one thing, and it is better than whatever a dropped fetch
  // happens to look like on this engine.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, failure: "offline", message: PROFILE_NOT_FETCHED_OFFLINE };
  }

  /* ONE deadline across all three, not three budgets: this is one act from the
     athlete's point of view, and `publicProfile.ts` shares its deadline across
     its parallel reads for the same reason. */
  const deadline = withTimeout(READ_TIMEOUT_MS);

  /* TYPED for the live half — those four columns are in `backend/types.ts` and
     on the database, so a typo here is a compile error rather than a profile
     that silently comes back short. UNTYPED for the other two, because that
     file does not describe their columns and must not be made to claim it does.
     The same split, and the same reasons, as the three writes above. */
  const live = session.client.from("profiles").select(LIVE_COLUMNS).eq("id", session.uid);
  const pending = session.loose.from("profiles").select(PENDING_COLUMNS).eq("id", session.uid);
  const links = session.loose.from("profiles").select(LINK_COLUMNS).eq("id", session.uid);

  const [liveRes, pendingRes, linkRes] = await Promise.all([
    (deadline ? live.abortSignal(deadline) : live).maybeSingle(),
    (deadline ? pending.abortSignal(deadline) : pending).maybeSingle(),
    (deadline ? links.abortSignal(deadline) : links).maybeSingle(),
  ]);

  if (liveRes.error) return { ok: false, ...readFailureFor(liveRes.error) };
  /*
   * NO ROW IS NOT AN EMPTY PROFILE. `maybeSingle` answers `null` for a select
   * that matched nothing, which here means a suspended account, a policy that
   * refused without saying so, or a row signup never created. Returning an
   * all-null `ServerProfile` from this branch would let the merge below clear a
   * photograph off a phone on the strength of a row that does not exist.
   */
  if (!liveRes.data) return { ok: false, failure: "no-row", message: PROFILE_NOT_ON_SERVER };

  const row = liveRes.data as Row;
  const profile: ServerProfile = {
    displayName: textOf(row, "display_name"),
    region: textOf(row, "location_label"),
    countryCode: textOf(row, "country_code"),
    username: textOf(row, "username"),
    avatar: textOf(row, "avatar_url"),
  };

  /* A failed request here leaves these keys ABSENT rather than null — the
     difference between "this athlete has no bio" and "nobody asked". The day
     20260903020000 is pushed, this request starts succeeding and the fields
     start arriving with no other change anywhere. */
  if (!pendingRes.error && pendingRes.data) {
    const pendingRow = pendingRes.data as Row;
    profile.bio = textOf(pendingRow, "bio");
    profile.languages = listOf(pendingRow, "languages");
    profile.interests = listOf(pendingRow, "interests");
    profile.banner = textOf(pendingRow, "banner_url");
  }

  if (!linkRes.error && linkRes.data) {
    const linkRow = linkRes.data as Row;
    for (const key of LINK_FIELDS) profile[key] = textOf(linkRow, LINK_COLUMN_OF[key]);
  }

  return { ok: true, uid: session.uid, profile };
}

/* -------------------------------------------------------------------------- */
/* The outbox when the ACCOUNT changes — a queue has an owner                   */
/* -------------------------------------------------------------------------- */

/**
 * WHY A QUEUED EDIT HAS TO BE PUT SOMEWHERE WHEN SOMEBODY ELSE SIGNS IN.
 *
 * `OUTBOX_KEY` holds one edit and says nothing about whose it is, and
 * `saveProfile` fires `flushProfile()` after any successful write. So on a
 * shared phone — which `AppState.signOut` deliberately supports by keeping
 * everything on the device — the first person's unsent bio would be sent to the
 * SECOND person's profile the moment they saved anything of their own. Nobody
 * would see it happen, on either side.
 *
 * DELETING IT WOULD BE THE OTHER FAILURE. That edit is on this phone because
 * this module told its owner, in `SYNC_OFFLINE`, that it "will be sent the next
 * time a save succeeds". Discarding it to make room for the new account would
 * break that promise silently, which is the same class of lie as a "Saved" that
 * was never read back.
 *
 * So it is PARKED under the account it belongs to, and handed back if that
 * account signs in on this phone again. Neither sent to a stranger nor thrown
 * away.
 */
const PARKED_OUTBOX_PREFIX = "icefall.profile.outbox.parked.";

/**
 * Move whatever is queued out of the live outbox and file it under `uid`.
 *
 * Returns what actually happened, and `not-kept` is not decoration: if the park
 * cannot be written the queued edit is STILL LIVE and would be flushed to the
 * next account to save. The caller has to be able to say so.
 */
export function parkPendingProfileEdit(uid: string): "parked" | "nothing" | "not-kept" {
  const entry = pendingProfileEdit();
  if (!entry) return "nothing";
  try {
    localStorage.setItem(PARKED_OUTBOX_PREFIX + uid, JSON.stringify(entry));
  } catch {
    /*
     * No room for the copy. The live outbox is left exactly as it is: losing
     * the edit here would be worse than the caller having to report a failure.
     *
     * BUT IT IS AT LEAST MADE IDENTIFIABLE. The entry stays live, so the one
     * thing that must never happen — sending it to whoever signs in next — is
     * now down to the stamp `runFlush` reads. Writing the owner ONTO the entry
     * costs a few bytes against a copy that needed the whole thing, so it can
     * succeed where the park did not; if it also fails, this is unchanged and
     * the caller is told the same thing either way.
     */
    if (entry.uid === undefined) writeOutbox({ ...entry, uid });
    return "not-kept";
  }
  return writeOutbox(null) ? "parked" : "not-kept";
}

/**
 * Hand back an edit parked for `uid`, if there is one.
 *
 * IT REFUSES TO OVERWRITE A LIVE OUTBOX. Something queued right now is this
 * account's current work and is newer than anything parked; the parked copy is
 * left where it is rather than merged over it, so nothing is lost either way
 * and the next sign-in can still find it.
 */
export function restoreParkedProfileEdit(uid: string): "restored" | "nothing" | "not-kept" {
  const key = PARKED_OUTBOX_PREFIX + uid;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return "nothing";
  }
  if (!raw) return "nothing";
  if (pendingProfileEdit()) return "nothing";

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "nothing";
    const entry = parsed as PendingEdit;
    if (typeof entry.at !== "string") return "nothing";
    if (!writeOutbox(entry)) return "not-kept";
    localStorage.removeItem(key);
    return "restored";
  } catch {
    return "not-kept";
  }
}

/**
 * Forget which files THIS DEVICE uploaded for the account that was signed in.
 *
 * The memo matches a picture by a hash of its bytes and answers with a URL
 * under the previous owner's uid. Two people who happen to choose the same
 * photograph — a team picture, a flag, an app icon — would otherwise have the
 * second one's row pointed at the first one's file, and the first one's file
 * deleted underneath them when the second changed their picture. The cost of
 * clearing it is one re-upload; nothing is lost.
 */
export function forgetProfileMedia(): void {
  try {
    localStorage.removeItem(MEDIA_MEMO_KEY);
  } catch {
    /* Storage refused a removal. The memo stays and the case above stays
       possible; there is nothing further this can do about it. */
  }
}

/* -------------------------------------------------------------------------- */
/* Signup answers — a different table, and a different promise                 */
/* -------------------------------------------------------------------------- */

/**
 * THE TWO ANSWERS THE SIGNUP FLOW COLLECTS THAT NOTHING ELSE EDITS.
 *
 * ── WHY THIS IS NOT PART OF `saveProfile` ───────────────────────────────────
 *
 * `saveProfile` updates `public.profiles`. Neither of these columns is on that
 * table and neither ever may be: `profiles_select` is `using (true)`, so a
 * column added there is published to every signed-in account on the platform.
 * Where somebody heard about ICEFALL is business data about a signup, and no
 * version of this product has a stranger opening a profile and learning that
 * its owner arrived from a Reddit thread. Gender fails the same test for the
 * plainer reason that ICEFALL prints it nowhere at all. Both therefore live on
 * `public.athlete_profiles`, whose SELECT policy is already `id = auth.uid() or
 * public.is_admin()` — private by construction, with no new policy to keep in
 * step and nothing for a future reader to remember.
 *
 * Two tables is also why this is a separate exported function rather than four
 * more keys on `ProfileEdit`. `SaveProfileResult` answers "what happened to the
 * fields on the edit-profile form"; folding a signup-only answer into it would
 * make `allSaved` — the only "Saved" a screen earns — depend on a question that
 * screen does not ask.
 *
 * ── WHY IT IS UNTYPED, LIKE THE PENDING HALF ABOVE ──────────────────────────
 *
 * `backend/types.ts` describes the columns this app may rely on unconditionally,
 * and `gender` and `heard_about` are not among them: they arrive with
 * `20260903040000_gender_and_heard_about.sql`. Adding them there would be this
 * module claiming, in the type system, that two columns exist — a claim the
 * type system cannot check and that goes stale the moment the migration state
 * changes in either direction, while `backend/types.ts` is the one place in the
 * app whose job is to be right about that. So the same trick the
 * pending profile columns use applies here: the untyped view of the same
 * client, and a `.select()` read-back that proves the write rather than
 * assuming it.
 *
 * ── THE ORDERING THIS DEPENDS ON, WHICH IS THE CALLER'S TO GET RIGHT ────────
 *
 * This is an UPDATE, not an upsert, and it therefore needs the athlete's row to
 * already exist. `auth/account.ts:syncOnboarding` is what creates it, with an
 * upsert carrying the whole `answers` blob. So the caller must run this AFTER
 * that has settled — `Onboarding.tsx` chains it — and if the upsert failed, the
 * update here matches no row and is reported as `SYNC_NO_ROW`, not as a save.
 *
 * An upsert here would remove that ordering constraint and was rejected anyway:
 * two upserts racing on one row is a way to write a half-formed athlete record
 * with a gender and no `onboarded_at`, and a row like that would make
 * `storedOnboarding()` believe somebody had signed up when they had not.
 *
 * ── WHAT IT NEVER CLAIMS ────────────────────────────────────────────────────
 *
 * `keptOnDevice` is FALSE on every failure path, which looks wrong beside
 * `saveProfile` and is not. That flag means "this is waiting on this phone to
 * be sent later, so a screen may offer to try again". Nothing retries a signup
 * answer: there is no outbox for one, `flushProfile` drains `ProfileEdit`s and
 * knows nothing about these, and the screen that asked is one nobody returns
 * to. The answer is not lost — it is in the app's own onboarding record and in
 * the `answers` blob — but it is not QUEUED, and a screen told it was queued
 * would offer a retry against a queue that does not exist.
 */

/** The columns, named once. Read back to prove the write, never assumed. */
const SIGNUP_ANSWER_COLUMNS = "gender, heard_about";

export type SignupAnswerFieldName = "gender" | "heardAbout";

export interface SignupAnswerEdit {
  /**
   * `"prefer-not-to-say"` is a VALUE, not an absence — it is the answer given
   * by somebody who read the question and declined it, and the column's CHECK
   * accepts it as one of four. Leaving the key off means the question was not
   * asked. The two are different facts and this module keeps them different.
   */
  gender?: Gender;
  /** A slug from `heard_about_channels`, which the column has a real FK to. */
  heardAbout?: HeardAboutChannel;
}

/** One entry per answer the caller passed. Never more, never fewer. */
export type SignupAnswerResult = Partial<Record<SignupAnswerFieldName, FieldResult>>;

/** Reached nobody. See the note on `keptOnDevice` in the block above. */
const notReached = (state: FieldState, message: string): FieldResult => ({
  state,
  keptOnDevice: false,
  message,
});

/**
 * Write the signup answers to the athlete's own row.
 *
 * Never throws. It is called fire-and-forget from the last step of onboarding,
 * where an unhandled rejection would be an error thrown at somebody in the act
 * of finishing signup, over a write whose failure costs them nothing.
 */
export async function saveSignupAnswers(edit: SignupAnswerEdit): Promise<SignupAnswerResult> {
  const asked: SignupAnswerFieldName[] = [];
  if (edit.gender !== undefined) asked.push("gender");
  if (edit.heardAbout !== undefined) asked.push("heardAbout");

  const fields: SignupAnswerResult = {};
  if (asked.length === 0) return fields;

  let session: Gate;
  try {
    session = await gate();
  } catch {
    // `gate()` awaits a token refresh, which can reject outright rather than
    // resolving with an error. Treated as unreachable, which is what it is: the
    // server was never actually asked.
    session = { ok: false, failure: "unreachable", message: SYNC_UNREACHABLE };
  }
  if (!session.ok) {
    for (const key of asked) fields[key] = notReached("queued", session.message);
    return fields;
  }

  const values: Row = {};
  if (edit.gender !== undefined) values.gender = edit.gender;
  if (edit.heardAbout !== undefined) values.heard_about = edit.heardAbout;

  const deadline = withTimeout(WRITE_TIMEOUT_MS);
  /* `.abortSignal()` BEFORE `.maybeSingle()`, for the reason spelled out at the
     live-columns write above: the other order compiles away the deadline. */
  const query = session.loose
    .from("athlete_profiles")
    .update(values)
    .eq("id", session.uid)
    .select(SIGNUP_ANSWER_COLUMNS);

  let result: WriteOutcome;
  try {
    result = await interpretWrite((deadline ? query.abortSignal(deadline) : query).maybeSingle());
  } catch {
    result = { ok: false, state: "queued", message: SYNC_UNREACHABLE };
  }

  if (result.ok) {
    /*
     * Reported off the READ-BACK ROW, like everything else in this file. It
     * matters more than usual here: both columns are constrained on the server
     * — gender by a CHECK, `heard_about` by a foreign key to
     * `heard_about_channels` — so a value this app offered that the database
     * does not recognise is a real possibility the day one vocabulary is edited
     * without the other. That arrives as `23514` or `23503`, which
     * `classifyBackendError` calls "unknown", so it lands on the generic
     * sentence below rather than being mistaken for a missing column.
     */
    if (edit.gender !== undefined) {
      fields.gender = {
        state: "saved",
        keptOnDevice: false,
        message: "Recorded on your ICEFALL account.",
        stored: textOf(result.row, "gender"),
      };
    }
    if (edit.heardAbout !== undefined) {
      fields.heardAbout = {
        state: "saved",
        keptOnDevice: false,
        message: "Recorded on your ICEFALL account.",
        stored: textOf(result.row, "heard_about"),
      };
    }
    return fields;
  }

  const message =
    result.state === "not-yet-on-server" ? SIGNUP_ANSWER_NOT_DEPLOYED : result.message;
  for (const key of asked) fields[key] = notReached(result.state, message);
  return fields;
}

/* -------------------------------------------------------------------------- */
/* Sex at birth — the same table, and a separate call for an ugly reason       */
/* -------------------------------------------------------------------------- */

/**
 * WHY THIS IS NOT ONE MORE KEY ON `SignupAnswerEdit`, WHICH IS WHERE IT BELONGS.
 *
 * It belongs there. `sex_at_birth` is a third column on the same table, written
 * at the same moment in the same flow by the same person, and one UPDATE
 * carrying all three would be one round trip, one read-back and one result
 * shape instead of two of each. Nothing about the problem wanted two functions.
 *
 * The reason there are two is mechanical and it is about this repository, not
 * about the schema. `saveSignupAnswers` above is UNCOMMITTED work by an earlier
 * pass, several sessions edit this tree simultaneously with no branch and no
 * index between them, and folding a third field into it means editing lines
 * that another session may be holding a stale copy of — `SignupAnswerFieldName`
 * is one line, `SIGNUP_ANSWER_COLUMNS` is one line, and both would have to
 * change. Every rewritten line is a chance to silently delete somebody else's
 * work with no merge conflict to warn anyone. An appended function cannot do
 * that. So the cost is paid in a second HTTP request rather than in a class of
 * data loss that leaves no evidence.
 *
 * THIS IS A TEMPORARY SHAPE AND IT SHOULD BE MERGED. The day `sync.ts` is
 * committed and nothing is racing it, fold `sexAtBirth` into `SignupAnswerEdit`,
 * add `sex_at_birth` to `SIGNUP_ANSWER_COLUMNS`, and delete this function and
 * its caller's second `await`. Nothing about the columns argues for keeping
 * them apart; only the tree does, and that is temporary.
 *
 * WHAT IS SHARED, DELIBERATELY, SO THE TWO CANNOT DRIFT ON THE THINGS THAT
 * MATTER: the same `gate()`, the same `WRITE_TIMEOUT_MS`, the same
 * `interpretWrite`, the same `FieldResult` states, the same `notReached`
 * helper, and the same `SIGNUP_ANSWER_NOT_DEPLOYED` sentence. There is no
 * second, weaker write path here — only a second call site into the same one.
 *
 * ── THE SAME ORDERING CONSTRAINT AS ABOVE ─────────────────────────────────
 *
 * An UPDATE, not an upsert, so the athlete's row must already exist.
 * `auth/account.ts:syncOnboarding` creates it. The caller runs this after that
 * has settled, and if the upsert failed this matches no row and is reported as
 * `SYNC_NO_ROW` — never as a save.
 *
 * ── AND THE SAME PROMISE IT REFUSES TO MAKE ───────────────────────────────
 *
 * `keptOnDevice` is FALSE on every failure path. Nothing retries a signup
 * answer: there is no outbox for one, `flushProfile` drains `ProfileEdit`s and
 * knows nothing about this, and the screen that asked is one nobody returns to.
 *
 * A FAILURE HERE LOSES THE ANSWER OUTRIGHT, AND THE PHRASE "IT IS STILL IN THE
 * APP'S OWN ONBOARDING RECORD" IS NOT AVAILABLE AS A CONSOLATION. It was
 * checked rather than assumed, because it is the obvious thing to assume:
 * `AppState.completeOnboarding` receives the whole `OnboardingAnswers` object
 * and persists exactly four things out of it — `onboarded`, `name`,
 * `disciplines`, `experience`, plus any goal it creates. Gender, sex at birth
 * and the acquisition channel are not among them and are never written to
 * localStorage at all. `storedOnboarding()` reads the answers back FROM THE
 * SERVER, out of `athlete_profiles.answers`, so it is not a local copy either.
 *
 * So the only two homes for this answer are the `answers` blob that
 * `syncOnboarding` upserts and the typed column this function writes — both on
 * the server, and both reached over the same network in the same second. If
 * that network is down, the answer is gone the moment the screen unmounts.
 * That is the honest description, it is the reason `keptOnDevice` is false, and
 * it is why NO SCREEN MAY EVER SAY THIS ANSWER WILL BE SENT LATER.
 *
 * WHAT THAT COSTS THE ATHLETE, STATED PLAINLY: the typed column is what
 * `fuelDay.ts` reads to narrow the energy band. So a failure here means their
 * estimate keeps spanning both sex terms after they answered — a wider band,
 * with the sentence that explains why still on screen. Wrong, but not
 * misleading, and it fails in the direction that invents nothing. That is the
 * correct way for this to fail, and it is the reason this write is allowed to
 * be fire-and-forget at all.
 */

/**
 * ── CORRECTION TO THE TWO PARAGRAPHS ABOVE, 2026-09-03 ────────────────────
 *
 * APPENDED RATHER THAN APPLIED IN PLACE, on purpose. Several sessions edit this
 * file at once with no branch between them, so every change made here is an
 * insertion that touches no existing line. The paragraphs above are left
 * standing and wrong rather than rewritten and possibly clobbering somebody
 * else's work. Fold this into them the day this file is committed and nothing
 * is racing it.
 *
 * TWO CLAIMS UP THERE ARE NO LONGER TRUE, AND ONE OF THEM NEVER WAS.
 *
 * 1. "Gender, sex at birth and the acquisition channel … are never written to
 *    localStorage at all." Sex at birth now is. `AppState.completeOnboarding`
 *    passes it to `rememberSexForEnergyFromSignup`, which writes it into the
 *    `icefall.fuel.v1` record through `coach/fuelRecord.ts`. Gender and the
 *    channel are unchanged: still server-only, still lost by a failed send.
 *
 * 2. "the typed column is what `fuelDay.ts` reads to narrow the energy band."
 *    IT NEVER DID. Nothing in the app has ever read `sex_at_birth` back —
 *    grep it. `screens/Nutrition.tsx` passes `fuel.sexForEnergy` into
 *    `dailyEnergyFor`, and that comes from the local fuel record and from
 *    nowhere else. This column is write-only today. It is the durable copy of
 *    the answer, and the reason it is still worth writing is the second device:
 *    sign-in restores the `answers` blob and seeds the fuel record there.
 *
 * WHAT A FAILURE HERE ACTUALLY COSTS, THEN. Not this athlete's estimate on this
 * phone — that narrowed before the request was made. It costs the server's
 * record of the answer, so a new device re-asks the question. Still a real
 * cost, still a reason `keptOnDevice` is false for the COLUMN, and still no
 * grounds for any screen to say the answer will be sent later.
 */

/**
 * ── SECOND CORRECTION, SAME DAY, APPENDED FOR THE SAME REASON ─────────────
 *
 * The block above says the local write HAPPENS — "writes it into the
 * `icefall.fuel.v1` record", and "that narrowed before the request was made".
 * Both are true only when the record was empty. They are not always true, and
 * this note is the correction; nothing above is deleted, because this file is
 * still being edited by more than one session at once.
 *
 * `rememberSexForEnergy` REFUSES TO OVERWRITE AN EXISTING ANSWER, deliberately:
 * an answer given on the Fuel screen, next to the number it moves, outranks one
 * given during signup. And storage can refuse the write outright — private mode,
 * or a full quota. So there are three local outcomes, not one:
 *
 *   - the record was empty and the answer landed. The estimate narrowed here,
 *     exactly as the block above describes.
 *   - the record already held an answer. NOTHING was written locally, and the
 *     estimate is still computed from whatever was already there. This is
 *     reachable in ordinary use: `signOut` keeps everything on the device on
 *     purpose, so the second person to use a phone meets the first person's
 *     answer, and `screens/auth/Auth.tsx` replays `completeOnboarding` with the
 *     restored blob on every sign-in.
 *   - storage refused. The answer is on neither the device nor, if this send
 *     fails too, the server.
 *
 * `AppState.completeOnboarding` now RETURNS which of those happened (see
 * `SexNarrowing` there) and the signup payoff panel says so. Nothing in this
 * file changes: the column write is the same write with the same failure
 * meaning, and it is still worth making in all three cases, because the server
 * copy is what a NEW device restores. But no comment here — including the two
 * paragraphs above — may be read as a promise that the local narrowing happened.
 */

/** The column, named once. Read back to prove the write, never assumed. */
const SEX_AT_BIRTH_COLUMN = "sex_at_birth";

export type SexAtBirthFieldName = "sexAtBirth";

export interface SexAtBirthEdit {
  /**
   * `"prefer-not-to-say"` is a VALUE, not an absence — the answer given by
   * somebody who read the question and declined it, and the column's CHECK
   * accepts it as one of three. Leaving the key off means the question was not
   * asked. The database keeps those two apart on purpose; `sexTermFor` in
   * `state/AppState.tsx` is the single place they collapse, on the way OUT.
   */
  sexAtBirth?: SexAtBirth;
}

/** One entry, and only when the caller passed an answer. */
export type SexAtBirthResult = Partial<Record<SexAtBirthFieldName, FieldResult>>;

/**
 * Write the sex-at-birth answer to the athlete's own row.
 *
 * Never throws. Called fire-and-forget from the last step of onboarding, where
 * an unhandled rejection would be an error thrown at somebody in the act of
 * finishing signup, over a write whose failure costs them a wider estimate and
 * nothing else.
 */
export async function saveSexAtBirth(edit: SexAtBirthEdit): Promise<SexAtBirthResult> {
  const fields: SexAtBirthResult = {};
  if (edit.sexAtBirth === undefined) return fields;

  let session: Gate;
  try {
    session = await gate();
  } catch {
    // `gate()` awaits a token refresh, which can reject outright rather than
    // resolving with an error. Treated as unreachable, which is what it is: the
    // server was never actually asked.
    session = { ok: false, failure: "unreachable", message: SYNC_UNREACHABLE };
  }
  if (!session.ok) {
    fields.sexAtBirth = notReached("queued", session.message);
    return fields;
  }

  const values: Row = { sex_at_birth: edit.sexAtBirth };

  const deadline = withTimeout(WRITE_TIMEOUT_MS);
  /* `.abortSignal()` BEFORE `.maybeSingle()`, for the reason spelled out at the
     live-columns write above: the other order compiles away the deadline. */
  const query = session.loose
    .from("athlete_profiles")
    .update(values)
    .eq("id", session.uid)
    .select(SEX_AT_BIRTH_COLUMN);

  let result: WriteOutcome;
  try {
    result = await interpretWrite((deadline ? query.abortSignal(deadline) : query).maybeSingle());
  } catch {
    result = { ok: false, state: "queued", message: SYNC_UNREACHABLE };
  }

  if (result.ok) {
    /*
     * Reported off the READ-BACK ROW, like everything else in this file, and it
     * earns its keep here: the column is constrained by a CHECK naming three
     * strings, so a value this app offered that the database does not recognise
     * is a real possibility the day one vocabulary is edited without the other.
     * That arrives as `23514`, which `classifyBackendError` calls "unknown", so
     * it lands on the generic sentence below rather than being mistaken for a
     * missing column.
     */
    fields.sexAtBirth = {
      state: "saved",
      keptOnDevice: false,
      message: "Recorded on your ICEFALL account.",
      stored: textOf(result.row, SEX_AT_BIRTH_COLUMN),
    };
    return fields;
  }

  fields.sexAtBirth = notReached(
    result.state,
    result.state === "not-yet-on-server" ? SIGNUP_ANSWER_NOT_DEPLOYED : result.message,
  );
  return fields;
}
