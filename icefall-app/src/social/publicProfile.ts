/**
 * ONE OTHER CLIMBER — the little ICEFALL may honestly say about somebody who is
 * not you.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * `search/people.ts` finds real accounts on `public.profiles` and every row it
 * returns is a dead end: `PERSON_ROUTE` is the empty string, and its header
 * explains why — `/social/people/:id` (`/explore/people/:id` before the move)
 * was declared twice in `App.tsx`, the
 * first declaration is a `<Navigate>` and wins, and the `AthleteProfile` behind
 * the second reads local state, so it resolved every id but the phone owner's
 * to nobody. That was CORRECT when it was written. The premise it rested on —
 * "ICEFALL has no server, no user database and no other users" — stopped being
 * true when Supabase went live. This module is the half of the fix that reads.
 *
 * ── WHAT IS ACTUALLY READABLE ABOUT SOMEBODY ELSE ────────────────────────────
 *
 * `profiles_select` (20260817120000) is
 *
 *     for select to authenticated using (true)
 *
 * so a signed-in account may read any profile ROW. The row carries more than
 * this module asks for, and the difference is deliberate:
 *
 *   · TAKEN — id, display_name, username, avatar_url, location_label,
 *     country_code, created_at. All seven are things the person typed into
 *     their own profile or that the account itself is; none is a measurement.
 *
 *   · LEFT — `role`. NOT AN OVERSIGHT AND NOT A TODO. "Guide" printed beside a
 *     name reads as ICEFALL having checked somebody's qualifications, and
 *     ICEFALL has checked nobody — not identity, not certification, not
 *     insurance, not experience. `search/people.ts` leaves the same column on
 *     the floor for the same reason, and the guide screens spend their whole
 *     credential-status vocabulary avoiding exactly this claim.
 *
 *   · LEFT — `account_status`, `suspended_reason`, `suspended_at`
 *     (20260828170000). Row-level security is not COLUMN-level security: these
 *     are readable by any signed-in account, and rendering a stranger's
 *     suspension reason would be a real privacy failure rather than a style
 *     mistake. THE SELECT LIST BELOW IS THE GUARANTEE. They are not fetched, so
 *     no screen built on this module can leak them by accident — which is
 *     stronger than asking every screen to remember not to draw them.
 *
 * ── WHAT IS NOT READABLE, AND MUST NOT BE STOOD IN FOR ───────────────────────
 *
 * `athlete_profiles` is `using (id = (select auth.uid()) or is_admin())`: you
 * can read your OWN and nobody else's. That table is where experience,
 * body_mass_kg, height_cm, birth_year, training_days, max_altitude_m and the
 * onboarding answers live — and it is a separate table precisely so that
 * `profiles_select`'s `using (true)` cannot reach them. There is also no
 * server-side objective, readiness score, summit list or activity history for
 * another person anywhere in this schema.
 *
 * A screen with empty slots for readiness or a summit count is worse than a
 * screen without them: it tells the reader those numbers exist and are merely
 * missing.
 *
 * ── WHAT GREW ON 2 SEPTEMBER, AND THE RULE THAT LET IT ───────────────────────
 *
 * This module said "seven fields and will not grow". Four arrived, and the test
 * they had to pass is worth writing down because a fifth will have to pass it
 * too: EACH IS SERVED BY A `security definer` FUNCTION RETURNING ONE VALUE, NOT
 * BY RELAXING A POLICY.
 *
 *   `follower_count` / `following_count` (20260902260000) — `follows_select`
 *     still refuses every row that does not involve the reader, so the number
 *     can never be turned back into a list of WHO, and a follower list on a
 *     mountaineering app is a list of who somebody climbs with. The aggregate
 *     is the disclosure; the graph is not.
 *   `app_owner` (20260902250000) — the WHITE mark. It lives on the server
 *     precisely because it is the one mark that claims authority over other
 *     people, so nothing on a device may decide it. See `markKindFor`.
 *   `identity_verified` — the GREY mark. Already live, and already read this
 *     way by `Comments.tsx` and `highlights.ts`.
 *
 * ONLY `identity_verified` IS PUSHED. A computed field the server does not have
 * fails the WHOLE select rather than quietly omitting itself — 20260902200000
 * records that exact failure (SQLSTATE 42883) taking two pushes down, and
 * `groupSpace.ts` leaves `identity_verified` out of its roster read for the same
 * reason. So the four are read in a SECOND, PARALLEL request that is allowed to
 * fail. The seven-column select below is untouched by them, which means no
 * unpushed migration can take a climber's NAME off the screen in the course of
 * failing to deliver a NUMBER. See `fetchExtras`.
 *
 * ── THE THREE FIGURES THE 2 SEP MOCKUP ASKS FOR THAT DO NOT EXIST ────────────
 *
 * The owner's profile drawing carries a five-across stat row — Followers,
 * Following, Connections, Summits, Highest — and an achievements chart of
 * highest elevation by year. Two of the five are now real. THE OTHER THREE ARE
 * NOT, and this module answers `null` for each rather than the `0` the drawing
 * shows, because in this app `0` is a MEASURED zero and an em dash is NOT
 * MEASURED. Which of the two a figure earns is the whole doctrine.
 *
 *   CONNECTIONS is not a server concept in any form. `profile/following.ts`
 *     defines it: cards you kept from a shared link, in localStorage, on THIS
 *     device — "the card is SAVED, not followed". Another climber's saved cards
 *     are on their phone. Nothing can count them, `Profile.tsx` prints the
 *     figure only for YOUR OWN profile, and a `0` on a stranger's page would
 *     say "this person has connected with nobody". See `CONNECTIONS_ARE_LOCAL`.
 *
 *   SUMMITS and HIGHEST cannot be derived from posts, which is where the
 *     mockup's own "SUMMIT LOG" card implies they live. `social/types.ts`
 *     states the finding and 20260831190000 confirms it: A POST HAS NO KIND.
 *     `public.posts` is `body` + optional media + timestamps; there is no
 *     summit table, no elevation column, and no writer anywhere that could
 *     fill one — `social/summitLog.ts` and the passport are both localStorage.
 *     So no post can declare itself a summit log, nobody else's summit count is
 *     readable, and the only way to produce one would be to read metres out of
 *     typed prose. That is precisely the fabrication this file exists to
 *     refuse: "turned back at 3,542 m" and "summited at 3,542 m" are the same
 *     regex and opposite facts, and the reader betting on the difference is
 *     stood on a glacier. `usePublicSummits` does the refusing in one place.
 *
 * ── NOBODY IS EVER INVENTED HERE, IN ANY BUILD ───────────────────────────────
 *
 * `social/highlights.ts` lets demo content fill an ABSENCE, and that is right
 * for a highlight — a highlight is something on a profile. A PERSON is the
 * profile. `network/directory.ts` keeps `DISCOVERABLE_ATHLETES` deliberately
 * empty and states the reason this file inherits: somebody could plan an alpine
 * objective around what they read on a climber's page, and this feature's own
 * safety copy is about meeting strangers in remote places — a fabricated
 * climbing partner is a hazard, not a placeholder.
 *
 * There is therefore no demo branch below. A DEMO or offline build constructs
 * no Supabase client at all (`backend/client.ts`), and that build gets
 * `no-backend` and the sentence that goes with it, not a plausible stranger.
 *
 * ── A HANDLE LINK IS NOT PERMANENT, AN ID LINK IS ────────────────────────────
 *
 * Both are accepted, because the owner wants a shared link to be able to read
 * `/social/people/wren.calloway` rather than a uuid. Worth knowing before that
 * link is printed on anything: `profiles_update_self` lets somebody change
 * their own `username`, so a handle can be given up and — nothing stops this —
 * later claimed by a different account. A handle link therefore points at a
 * NAME; only a uuid link points at a PERSON. Neither is wrong; they answer
 * different questions.
 */
import { useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { withTimeout } from "@/lib/netTimeout";
import type { MarkKind } from "@/components/ui/VerificationMark";
import type { Post } from "./types";

/**
 * The typed client does not know about the computed fields.
 *
 * `backend/types.ts` describes `profiles` as its COLUMNS; `follower_count`,
 * `following_count`, `app_owner` and `identity_verified` are PostgREST computed
 * fields — functions of the row, not columns — so a typed `.select()` naming
 * them does not compile. Rather than edit a hand-written schema file this
 * module does not own, the extras read goes through an untyped view of the same
 * client, exactly as `Composer.tsx`, `groupSpace.ts`, `highlights.ts` and
 * `network/interest.ts` all do. The seven-column read below stays TYPED, which
 * is the half that matters: it is the one that must not drift.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Copy — one place, so two surfaces cannot make different promises            */
/* -------------------------------------------------------------------------- */

/**
 * No client in this build. Offline and DEMO builds never construct one, and a
 * production build with no credentials would land here too.
 *
 * The last sentence is the one that matters. An account is required to use
 * ICEFALL now, so a signed-out reader is not a state this screen has to handle
 * — but a demo build genuinely has nobody to look up, and saying "this climber
 * could not be found" there would blame the person for the build.
 */
export const PROFILE_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it cannot look anybody up. Nothing is missing from this page — nothing was asked for, and nobody has been invented to fill the space.";

/** The request went out and did not come back. Never dressed as an answer. */
export const PROFILE_UNREACHABLE =
  "ICEFALL could not reach the server, so it could not look this climber up. That is different from finding nobody: this account has not actually been checked.";

/**
 * The server answered and said no, for a reason this module did not anticipate.
 *
 * KEPT SEPARATE FROM "does not exist" ON PURPOSE. `highlights.ts` records what
 * it costs to blur the two: a malformed query came back as a refusal, was read
 * as a fact about the deployment, and every highlight then announced something
 * about ICEFALL's server that was untrue. A refusal is a non-answer.
 */
export const PROFILE_READ_REFUSED =
  "ICEFALL's server refused that read, so it cannot say who this is. That is a refusal rather than an answer — this account may well exist.";

/**
 * Signed out. UNREACHABLE, NOT NOT-FOUND, and the distinction is the whole
 * reason this constant exists.
 *
 * `profiles_select` grants `to authenticated`, so an anonymous request is not
 * refused — Postgres simply returns no rows. Reporting that as `not-found`
 * would tell somebody their friend has no ICEFALL account when the truth is
 * that nobody at all is visible from here. AppShell gates on a real session, so
 * this should be unreachable in a shipped build; it is handled because the cost
 * of getting it wrong is a confident false statement about a real person.
 */
export const PROFILE_SIGNED_OUT =
  "ICEFALL only lets signed-in accounts read the climber directory, so it could not look this person up. This is not “no such climber” — nobody is visible from here at all.";

/** An id or handle that resolved to nobody. A real answer, and a dignified one. */
export const PROFILE_NOT_FOUND_HANDLE =
  "No ICEFALL account holds that handle. Handles can be changed, so an old link can end up pointing at nobody.";

export const PROFILE_NOT_FOUND_ID = "No ICEFALL account has that id.";

/**
 * A link that no account could match, whatever the server says.
 *
 * `profiles_username_shape` and the uuid type between them make this a
 * certainty rather than a guess — see `keyOf`. It is still `not-found`, because
 * "this link leads to nobody" is exactly what it means.
 */
export const PROFILE_LINK_MALFORMED =
  "That link does not point at an ICEFALL account. It is not a handle and it is not an account id, so there is nobody for it to open.";

/**
 * The server answered with a row that has no name on it.
 *
 * `display_name` is `not null` with a 1–80 character check, so this cannot
 * happen while the constraint stands. It is handled rather than trusted because
 * the alternative failure is a blank climber on screen, which reads as a real
 * person who left their profile empty.
 */
export const PROFILE_UNREADABLE =
  "ICEFALL's server answered, but the account it sent back has no name on it. Nothing is drawn rather than a blank climber — this is a fault at ICEFALL's end.";

/**
 * OPTIONAL COPY FOR THE SCREEN, exported so that the page and this module
 * cannot end up making different claims about what is missing and why.
 *
 * It says what is absent AND that it was not estimated, because the second half
 * is the part a reader cannot check for themselves.
 */
export const PUBLIC_PROFILE_LIMITS =
  "ICEFALL can show you a climber's name, their handle, where they say they are based, when they joined and how many people follow them. It cannot show you their experience, their altitude, their training, their objectives or their summits — those are readable only by the person themselves, and nothing here has been estimated to fill the gap.";

/**
 * A follower or following figure that could not be read.
 *
 * NOT "this climber has no followers". 20260902260000 is written and not
 * pushed, so today this is the ordinary case and it is a fact about ICEFALL's
 * server rather than about the person. The moment the migration lands the
 * number appears — including a real `0`, which is a measured zero and renders
 * as `0`, never as an em dash.
 */
export const PROFILE_COUNTS_NOT_LIVE =
  "ICEFALL's server cannot count followers yet, so this is unknown rather than nought. Nothing has been estimated in its place.";

/**
 * The Connections figure, which is real on YOUR profile and unknowable on
 * anybody else's.
 *
 * `profile/following.ts`: a connection is a card you kept from a shared link,
 * held in this device's storage. Another climber's kept cards are on their
 * phone and no server has ever seen them, so there is nothing to count — which
 * is why `connectionsCount` is `null` and never `0`. A zero here would say this
 * person has connected with nobody, which the app has no way of knowing.
 */
export const CONNECTIONS_ARE_LOCAL =
  "Connections are the profile cards a climber has kept on their own phone, so nobody else's can be counted. This is unknown, not nought.";

/**
 * Why another climber's summit count and highest elevation are blank, and why
 * they will stay blank until something records a summit.
 *
 * Written as one sentence a climber can act on rather than as a schema
 * complaint: what matters to the reader is that the space is empty because
 * ICEFALL has nothing, not because the person has done nothing.
 */
export const SUMMITS_NOT_RECORDED =
  "ICEFALL has no record of anybody's summits. Logs are kept on the phone that wrote them and posts carry no summit on them, so nothing here can be counted — this is an empty feature, not an empty climbing record. Nothing has been read out of anyone's words to fill it.";

/* -------------------------------------------------------------------------- */
/* Shape                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Another climber, as far as ICEFALL may honestly describe one.
 *
 * NAMED `PublicProfile` AND THERE IS ALREADY A SCREEN CALLED THAT — `screens/
 * PublicProfile.tsx`, the share card decoded out of a URL fragment at `/p`.
 * They are unrelated: that one is handed its contents in the link and cannot
 * look anybody up; this one is a server read and cannot be handed anything.
 * Import the two into one file and alias, the way `AthleteProfile.tsx` aliases
 * its model against its screen.
 */
export interface PublicProfile {
  /** `profiles.id` — the account, and the only permanent way to link to it. */
  id: string;
  /** `profiles.display_name`. Trimmed; the column guarantees 1–80 characters. */
  displayName: string;
  /**
   * `profiles.username`, canonically lowercase.
   *
   * NULL IS ORDINARY, not a gap to paper over: a Google or Apple signup has a
   * session before anybody can be asked to choose a handle, so an account can
   * legitimately sit without one. A row with no handle renders no `@` line
   * rather than an id dressed up as one.
   */
  username: string | null;
  /** `profiles.avatar_url`, or null. Null draws an initial, never a stock face. */
  avatarUrl: string | null;
  /**
   * `profiles.location_label` — a town or region THE PERSON TYPED. Never an
   * address, never geocoded, and there is no latitude or longitude on this
   * table to fall back to; see the column's own comment in 20260830100000.
   */
  locationLabel: string | null;
  /** ISO 3166-1 alpha-2, or null for "prefer not to say". `countryName` renders it. */
  countryCode: string | null;
  /**
   * `profiles.created_at` — when the ACCOUNT was made. Carried as it came, as
   * an ISO instant.
   *
   * IT IS NOT A CLIMBING HISTORY, and the way it is drawn decides whether it
   * reads as one. A month and a year ("On ICEFALL since March 2026") is the
   * honest granularity — `fmtDate(memberSince, { day: undefined, month: "long" })`
   * — because the exact minute somebody signed up says nothing about them and
   * a precise timestamp on a stranger's page invites the reader to draw
   * conclusions from it.
   */
  memberSince: string;

  /* ---- The computed fields. `null` means NOT MEASURED, never "none". ------ */

  /**
   * `follower_count(profiles)` — how many accounts follow this one.
   *
   * `null` IS NOT ZERO AND MUST NOT RENDER AS ONE. It means the figure was not
   * obtained: the migration is not pushed, the request failed, or this build
   * has no server. `0` means the aggregate ran and counted nobody, which is a
   * measured zero and renders `0`. The migration says the same thing in its
   * closing note, because the two are one line apart in a renderer and opposite
   * claims on a page. `PROFILE_COUNTS_NOT_LIVE` is the sentence for `null`.
   */
  followerCount: number | null;
  /** `following_count(profiles)`. Same null/zero rule, same sentence. */
  followingCount: number | null;
  /**
   * `app_owner(profiles)` — this person runs ICEFALL, and wears the WHITE mark.
   *
   * THREE VALUES, AND ONLY ONE OF THEM DRAWS ANYTHING. `true` is the server
   * saying so; `false` is the server saying not; `null` is nobody having asked
   * — the extras read failed, or the migration is not pushed. `false` and
   * `null` both draw no mark, so the distinction costs a renderer nothing and
   * keeps this field from claiming a check it did not make.
   *
   * Never test it for truthiness and never set it from a client condition:
   * `markKindFor` is the only thing that should read it, and the reason is in
   * `VerificationMark` — white is the one mark that is a claim about authority
   * over other people, so a device deciding it makes impersonating the founder
   * a devtools edit.
   */
  isOwner: boolean | null;
  /**
   * `identity_verified(profiles)` — the GREY mark. ICEFALL confirmed this
   * person is who they say, AND NOTHING MORE: not their credentials, not their
   * experience, not their judgement. Same three values, same rule.
   */
  identityVerified: boolean | null;
  /**
   * ALWAYS `null`, and that is the finding rather than a gap.
   *
   * The mockup's stat row asks for "0 Connections". A connection in ICEFALL is
   * a profile card kept in `localStorage` by the person who kept it
   * (`profile/following.ts`), so another climber's connections are on another
   * climber's phone and no server has ever held them. The field exists so that
   * a screen reading this shape gets `null` and is forced to draw an em dash,
   * rather than reaching for the `0` the drawing shows. Typed `number | null`
   * rather than `null` on the chance that connections ever become a server
   * concept; until they do, nothing may write anything else here.
   * `CONNECTIONS_ARE_LOCAL` is the sentence.
   */
  connectionsCount: number | null;
}

/**
 * Five facts, not one boolean, because they are five different sentences.
 *
 *   loading      — no answer yet. Also what the standalone fetch returns when
 *                  the CALLER cancelled it: there is no honest result for a
 *                  question that was withdrawn.
 *   ready        — the server answered and this is who it named.
 *   not-found    — the server answered and it is nobody. A real answer.
 *   no-backend   — this build has no client, so nothing was asked.
 *   unreachable  — ICEFALL could not ask, or asked and got no usable answer.
 *
 * `not-found` AND `unreachable` ARE THE PAIR WORTH GUARDING. "This person does
 * not exist" and "ICEFALL could not find out" are different claims and only the
 * first is something the app knows; collapsing them tells somebody their friend
 * has no account every time the wifi in a hut goes quiet.
 *
 * The three ways of not being able to ask — a dead network, a refusal, a
 * missing session — all land on `unreachable`, because the SHAPE a screen draws
 * for them is the same. Which one it was is in `message`, and the message is
 * the part the reader acts on.
 */
export type PublicProfileState = "loading" | "ready" | "not-found" | "no-backend" | "unreachable";

export interface PublicProfileResult {
  profile: PublicProfile | null;
  state: PublicProfileState;
  /** Present whenever an empty screen needs explaining. */
  message?: string;
}

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * ONE FETCH ON MOUNT NEEDS NO DEBOUNCE AND ABSOLUTELY NEEDS A DEADLINE.
 *
 * `lib/netTimeout.ts` records the failure this prevents: nothing in this
 * codebase puts a timeout on supabase-js, so with credentials present and the
 * network dead-but-not-absent — hut wifi, a captive portal, one bar — the
 * request hangs for as long as the OS allows and `useMyProfile` sits on
 * `loading` for ever. A profile screen that does that shows a spinner the
 * reader cannot interpret; six seconds and an honest sentence is better.
 *
 * Longer than the four seconds `search/people.ts` allows itself, because that
 * runs beside sources answering instantly from memory and this is the only
 * thing on the screen. Past about six seconds the reader has already decided
 * the app is broken.
 */
const PROFILE_TIMEOUT_MS = 6_000;

/**
 * SEPARATELY BUDGETED. `getSession()` can refresh a token over the network, and
 * it happens BEFORE the query — so the `.abortSignal()` on the query cannot
 * protect it. Same reasoning, same number, as `search/people.ts`.
 */
const SESSION_TIMEOUT_MS = 3_000;

/**
 * THE PRIVACY BOUNDARY, WRITTEN AS A STRING.
 *
 * `role`, `account_status`, `suspended_reason` and `suspended_at` are all on
 * this row and all readable — see the module header. They are absent here, and
 * because they are absent no screen downstream can render them. Adding a column
 * to this line is a decision about what strangers may know about each other,
 * not a fetch optimisation.
 */
const COLUMNS = "id, display_name, username, avatar_url, location_label, country_code, created_at";

/**
 * THE EXTRAS LADDER — computed fields, in descending order of optimism.
 *
 * A PostgREST computed field is a function of the row, so naming one the server
 * does not have is not a partially-satisfied request: Postgres raises (42703
 * for the name, 42883 for a missing function behind it) and NOTHING comes back.
 * One absent field therefore costs every field beside it, which is why these
 * are not simply appended to `COLUMNS`.
 *
 * Two rungs, because the four fields have two different deployment states and
 * lumping them would throw away a mark that works:
 *
 *   [0] everything. `follower_count`, `following_count` (20260902260000) and
 *       `app_owner` (20260902250000) are both written TODAY and neither is
 *       pushed, so this rung is expected to fail until they are.
 *   [1] `identity_verified` alone — live, and read exactly this way by
 *       `Comments.tsx` and `highlights.ts`. Falling to this rung keeps the grey
 *       mark on public profiles while the counts are still missing, instead of
 *       losing it as collateral.
 *
 * Off the end of the ladder means every rung was refused for a missing field,
 * and nothing is asked for at all.
 */
const EXTRA_SELECTS = [
  "id, follower_count, following_count, app_owner, identity_verified",
  "id, identity_verified",
] as const;

/**
 * WHICH RUNG THIS SESSION HAS SETTLED ON. A cache of one small integer, and it
 * can only ever change how many requests are made — never what any of them
 * returns, and never what is drawn.
 *
 * Without it every profile opened would repeat the whole ladder, so today (with
 * neither migration pushed) each page would pay a guaranteed failed request
 * before the one that works. It moves in one direction, and only on a
 * missing-FIELD error: a timeout or an RLS refusal leaves it alone, because
 * those say nothing about what the server has and the next profile deserves the
 * full attempt. The worst case if it is ever wrong is a follower count that
 * stays absent for one session — an em dash, which is honest — and never a
 * number that is wrong.
 */
let extrasRung = 0;

/** The four computed fields, resolved. `null` throughout = nobody asked. */
interface ProfileExtras {
  followerCount: number | null;
  followingCount: number | null;
  isOwner: boolean | null;
  identityVerified: boolean | null;
}

const EXTRAS_UNKNOWN: ProfileExtras = {
  followerCount: null,
  followingCount: null,
  isOwner: null,
  identityVerified: null,
};

/**
 * Is this error "the server does not have that field", as opposed to "the
 * server would not answer"?
 *
 * The distinction decides whether the ladder steps down. `42703`/`PGRST204` are
 * a missing column and `PGRST202` a missing function to PostgREST; `42883` is
 * Postgres's own undefined-function, which is what a computed field whose
 * definer function never deployed actually raises — 20260902200000 records that
 * SQLSTATE by number. `42P01`/`PGRST205` (no such table) is included because
 * `profiles` certainly exists, so seeing one means the schema cache is behind,
 * which the next rung is no more likely to satisfy.
 *
 * The test is repeated rather than imported from `groupSpace.ts` or
 * `highlights.ts` for the reason both of those files give about each other:
 * they own their copies, and reaching into a private helper in a file this
 * module does not own is how two sessions end up editing one line.
 */
function isMissingField(error: PostgrestError): boolean {
  const code = error.code ?? "";
  if (
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST202" ||
    code === "42883" ||
    code === "42P01" ||
    code === "PGRST205"
  ) {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

/** A count is a count. Anything that is not a finite, non-negative number was
    not measured, and `null` says so rather than rounding a surprise into one. */
function countOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function toExtras(row: Record<string, unknown> | null): ProfileExtras {
  if (!row) return EXTRAS_UNKNOWN;
  return {
    followerCount: countOf(row.follower_count),
    followingCount: countOf(row.following_count),
    // Strictly `boolean`. A mark is drawn from `true` and from nothing else, so
    // a field that came back as a string or a number is NOT MEASURED here
    // rather than coerced into a claim about somebody's authority.
    isOwner: typeof row.app_owner === "boolean" ? row.app_owner : null,
    identityVerified: typeof row.identity_verified === "boolean" ? row.identity_verified : null,
  };
}

/**
 * The computed fields for one profile, and THE ONLY FUNCTION IN THIS FILE THAT
 * IS ALLOWED TO FAIL SILENTLY.
 *
 * It resolves to `EXTRAS_UNKNOWN` for every failure — a missing migration, a
 * refusal, a dead network, a rejection nobody predicted — because a follower
 * count that could not be read is an em dash on a stat row, while a name that
 * could not be read is a screen with nobody on it. Those are not the same
 * severity and they must not share a fate: this runs BESIDE the profile read,
 * not before it, so nothing here can delay or cancel the read that matters.
 *
 * It matches on the same key rather than on the id the profile read returns,
 * which is what lets the two go out together — `keyOf` has already established
 * that a string is a uuid or a handle and cannot be both.
 */
async function fetchExtras(key: ProfileKey, deadline: AbortSignal | undefined): Promise<ProfileExtras> {
  if (!untyped) return EXTRAS_UNKNOWN;

  try {
    for (let rung = extrasRung; rung < EXTRA_SELECTS.length; rung += 1) {
      const query = untyped.from("profiles").select(EXTRA_SELECTS[rung]);
      const match = key.by === "id" ? query.eq("id", key.value) : query.eq("username", key.value);
      // `.abortSignal()` before `.maybeSingle()`, the same ordering the profile
      // read documents: the signal is declared on PostgrestTransformBuilder and
      // `maybeSingle()` returns a builder without it. The deadline is SHARED
      // with the profile read, so a ladder that steps down cannot spend a
      // second full budget.
      const { data, error } = await (deadline ? match.abortSignal(deadline) : match).maybeSingle();

      if (!error) {
        extrasRung = rung;
        return toExtras(data as Record<string, unknown> | null);
      }
      // Not a statement about what the server HAS — a timeout, a refusal, a
      // transport failure. Give up on this profile without touching the ladder.
      if (!isMissingField(error)) return EXTRAS_UNKNOWN;
      extrasRung = rung + 1;
    }
  } catch {
    // postgrest-js reports through `error` rather than rejecting, so this is a
    // belt-and-braces branch. It exists because an unhandled rejection here
    // would reject the `Promise.all` it sits inside and take the PROFILE down
    // with it — the one outcome this whole function is arranged to prevent.
    return EXTRAS_UNKNOWN;
  }

  return EXTRAS_UNKNOWN;
}

/* -------------------------------------------------------------------------- */
/* Which kind of link is this                                                  */
/* -------------------------------------------------------------------------- */

/** Canonical 8-4-4-4-12. `profiles.id` is a uuid column, so nothing else matches. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `profiles_username_shape`, character for character: 3–20 characters, starting
 * and ending alphanumeric, lowercase letters, digits, `_` and `.` between, and
 * no `..` (the constraint's second clause, checked separately below).
 */
const HANDLE = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;

type ProfileKey = { by: "id" | "handle"; value: string };

/**
 * A route parameter, read as either an account id or a handle.
 *
 * THE SHAPES CANNOT OVERLAP, which is what makes one query enough rather than
 * a lookup by id followed by a fallback lookup by handle: a uuid is 36
 * characters and contains hyphens, and the username CHECK allows neither
 * hyphens nor more than 20 characters. So a string is one, or the other, or
 * nobody's.
 *
 * IT ALSO KEEPS A MALFORMED LINK OFF THE WIRE, and that is not tidiness.
 * `.eq("id", "not-a-uuid")` reaches Postgres and comes back `22P02 invalid
 * input syntax for type uuid` — an ERROR, which every classifier in this
 * codebase would read as "the server could not answer". The truth is the
 * opposite: no account can hold that value, and this function knows it without
 * asking anybody.
 *
 * The handle is lowercased because `claim_username` lowercases what it stores
 * and the CHECK makes an uppercase handle impossible by any path — so `/people/
 * Wren.Calloway`, which is what somebody typing a link by hand produces, is the
 * same person as `wren.calloway`. A leading `@` is stripped for the same
 * reason: it is how people write handles and it is not part of one.
 */
function keyOf(raw: string): ProfileKey | null {
  const trimmed = raw.trim().replace(/^@/, "");
  if (UUID.test(trimmed)) return { by: "id", value: trimmed.toLowerCase() };

  const handle = trimmed.toLowerCase();
  if (HANDLE.test(handle) && !handle.includes("..")) return { by: "handle", value: handle };
  return null;
}

/**
 * Could any account hold this value at all?
 *
 * EXPORTED FOR THE SURFACES THAT DRAW LINKS, not for this module's own use.
 * A card deciding whether a byline should be a link is asking exactly what
 * `keyOf` answers, and asking it here rather than keeping a second copy of the
 * uuid type and the `profiles_username_shape` CHECK is what stops a link and
 * the screen it opens from reaching different conclusions about one string.
 *
 * `false` means no round trip is needed to know the link would land on "no
 * climber here" — see `PROFILE_LINK_MALFORMED`. `true` is not a promise that
 * the account exists; it is only a promise that the question is answerable.
 */
export const canNameAnAccount = (raw: string): boolean => keyOf(raw) !== null;

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Race a promise that has no cancellation of its own against the clock.
 *
 * Returns a sentinel rather than throwing, so the caller has to handle the
 * timeout deliberately instead of catching it by accident alongside real
 * errors. Copied from `search/people.ts` rather than imported: it is a private
 * helper in a file this module does not own, and reaching into somebody else's
 * internals is how two sessions end up editing one line.
 */
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

/** What the select above returns, one row. */
type ProfileRow = {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location_label: string | null;
  country_code: string | null;
  created_at: string;
};

/**
 * The wire row as the app's shape, or null if it cannot be read as a person.
 *
 * Fields are re-checked despite the client being typed. `backend/types.ts` is a
 * hand-written description of the schema, not a generated one — it can drift,
 * and the cost of trusting it here is a climber rendered with `undefined` where
 * their name goes.
 */
function toPublicProfile(row: ProfileRow, extras: ProfileExtras): PublicProfile | null {
  const id = typeof row.id === "string" ? row.id : "";
  const displayName = typeof row.display_name === "string" ? row.display_name.trim() : "";
  const memberSince = typeof row.created_at === "string" ? row.created_at : "";
  if (!id || !displayName || !memberSince) return null;

  return {
    id,
    displayName,
    // Every optional field falls back to null rather than to a placeholder. A
    // person with no handle has no handle; the screen renders one line fewer.
    username: typeof row.username === "string" && row.username.length > 0 ? row.username : null,
    avatarUrl: typeof row.avatar_url === "string" && row.avatar_url.length > 0 ? row.avatar_url : null,
    locationLabel:
      typeof row.location_label === "string" && row.location_label.trim().length > 0
        ? row.location_label.trim()
        : null,
    countryCode:
      typeof row.country_code === "string" && row.country_code.length === 2
        ? row.country_code.toUpperCase()
        : null,
    memberSince,
    // Spread rather than restated: the extras have exactly one origin
    // (`fetchExtras`) and exactly one failure value (`EXTRAS_UNKNOWN`), so
    // there is no second place a `0` or a `false` could be introduced.
    ...extras,
    // Not fetched, not fetchable, and not a gap — see the field's own note and
    // `CONNECTIONS_ARE_LOCAL`. Written here rather than left off the object so
    // that the shape is total and a screen cannot read `undefined` and treat
    // the absence as its own kind of answer.
    connectionsCount: null,
  };
}

/** Every non-answer, in one place, so the states cannot drift apart. */
const fail = (state: PublicProfileState, message: string): PublicProfileResult => ({
  profile: null,
  state,
  message,
});

/**
 * One climber, looked up by account id or by handle. Outside React, so it can
 * be called from a loader or a test as easily as from the hook.
 *
 * RETURNS `state: "loading"` TO MEAN "you cancelled me, I have no answer". The
 * caller's own signal is the only thing that can tell an abandoned request from
 * an expired budget — both raise the same AbortError — and `netTimeout.ts`
 * records what happens when they are conflated: either every navigation reports
 * a failure, or a real timeout renders as the honest-looking "no such climber".
 */
export async function fetchPublicProfile(
  idOrUsername: string,
  signal?: AbortSignal,
): Promise<PublicProfileResult> {
  // Checked before the client, deliberately. A link that no account could match
  // is nobody's in every build, connected or not, and saying so costs no
  // request.
  const key = keyOf(idOrUsername);
  if (!key) return fail("not-found", PROFILE_LINK_MALFORMED);

  if (!supabase) return fail("no-backend", PROFILE_NO_BACKEND);
  const client = supabase;

  const session = await withDeadline(client.auth.getSession(), SESSION_TIMEOUT_MS);
  if (signal?.aborted) return { profile: null, state: "loading" };
  if (session === TIMED_OUT || session.error) return fail("unreachable", PROFILE_UNREACHABLE);
  // See `PROFILE_SIGNED_OUT`: no session means no rows rather than an error, and
  // an empty result here must never become "no such climber".
  if (!session.data.session) return fail("unreachable", PROFILE_SIGNED_OUT);

  // The caller's signal (unmount, or a different climber) and the budget
  // combined, so both still abort the request. It comes back undefined only on
  // an engine with no `AbortSignal.timeout` AND no caller signal to fall back
  // to, which is why the call below is conditional rather than `?? signal`.
  const deadline = withTimeout(PROFILE_TIMEOUT_MS, signal);

  const query = client.from("profiles").select(COLUMNS);
  const match = key.by === "id" ? query.eq("id", key.value) : query.eq("username", key.value);

  /*
   * TWO REQUESTS, SIDE BY SIDE, AND ONLY ONE OF THEM MAY EMPTY THE SCREEN.
   *
   * The counts and the marks are PostgREST computed fields on two migrations
   * written today and not pushed, and a computed field the server does not have
   * fails the whole select — so appending them to `COLUMNS` would mean that
   * until somebody runs `supabase db push`, every climber's page said "no such
   * account". A number the page could live without would have taken the name,
   * the handle and the location with it.
   *
   * They therefore go out in parallel and are merged only if they arrive.
   * PARALLEL RATHER THAN SEQUENTIAL because the extras match on the same key
   * and do not need the id back first, so the pair costs one round trip of
   * waiting rather than two; and STRUCTURALLY SEPARATE rather than a
   * try-then-retry because that way the profile read cannot be affected by the
   * extras at all, instead of being protected by error handling somebody has to
   * keep correct.
   *
   * `fetchExtras` resolves for every failure and never rejects, which is what
   * makes `Promise.all` safe here: a rejection would take the profile with it.
   *
   * `.abortSignal()` MUST COME BEFORE `.maybeSingle()`. It is declared on
   * PostgrestTransformBuilder and returns `this`; `maybeSingle()` returns a
   * PostgrestBuilder, which has no `abortSignal` — so the other order is a
   * compile error rather than a silent loss of the deadline.
   *
   * One row by definition: `id` is the primary key and `username` carries a
   * unique index. `maybeSingle` returns null instead of raising for the empty
   * case, which is the case this whole module exists to state properly.
   */
  const [{ data, error }, extras] = await Promise.all([
    (deadline ? match.abortSignal(deadline) : match).maybeSingle(),
    fetchExtras(key, deadline),
  ]);

  // OUR OWN CANCELLATION IS A NON-EVENT — the effect that replaced this one has
  // already set its own state.
  if (signal?.aborted) return { profile: null, state: "loading" };

  if (error) {
    // An expired budget raises an AbortError through postgrest's `error` field.
    // The caller's signal is already known not to have fired, so an abort here
    // is the deadline, which is a request that did not come back.
    const text = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
    const timedOut = text.includes("abort") || text.includes("fetch");
    return fail("unreachable", timedOut ? PROFILE_UNREACHABLE : PROFILE_READ_REFUSED);
  }

  // THE ANSWER THIS MODULE EXISTS TO GET RIGHT. The server was asked, it
  // replied, and it replied that there is nobody — which is a fact, and is not
  // the same shape of empty as any of the branches above.
  if (!data) {
    return fail(
      "not-found",
      key.by === "handle" ? PROFILE_NOT_FOUND_HANDLE : PROFILE_NOT_FOUND_ID,
    );
  }

  const profile = toPublicProfile(data, extras);
  if (!profile) return fail("unreachable", PROFILE_UNREADABLE);
  return { profile, state: "ready" };
}

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One climber's public profile, for a screen opening on them.
 *
 * ONE FETCH PER PERSON, and no subscription. There is no `onAuthStateChange`
 * listener the way `useMyProfile` has one: whose profile THIS is does not
 * depend on who is signed in, an account is required to be here at all, and a
 * sign-out takes the whole app shell down rather than needing this screen to
 * notice. A listener would buy a redundant round trip per mount and nothing
 * else — `useMyProfile` records what that cost where it genuinely does need
 * one: three identical round trips for a single page, two of them redundant.
 *
 * THE PROFILE IS CLEARED WHEN THE ID CHANGES. Keeping the previous one visible
 * while the next loads is smoother and would mean showing one climber's name
 * and location on the page the reader opened for somebody else, which on a
 * screen about meeting strangers in remote places is the worst available
 * outcome.
 */
export function usePublicProfile(idOrUsername: string): PublicProfileResult {
  const [result, setResult] = useState<PublicProfileResult>({ profile: null, state: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setResult({ profile: null, state: "loading" });

    void fetchPublicProfile(idOrUsername, controller.signal)
      .then((next) => {
        // `fetchPublicProfile` answers "loading" when it noticed our abort.
        // Writing it would strand the screen on a spinner belonging to a person
        // it has navigated away from.
        if (controller.signal.aborted || next.state === "loading") return;
        setResult(next);
      })
      // NOTHING ABOVE IS EXPECTED TO THROW — postgrest-js turns an aborted fetch
      // into an `error` field rather than a rejection, and `getSession` returns
      // its error too. But an unhandled rejection here does not merely log: it
      // leaves `state` on "loading" for ever, which is the one outcome with no
      // honest sentence attached to it.
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult(fail("unreachable", PROFILE_UNREACHABLE));
      });

    return () => controller.abort();
  }, [idOrUsername]);

  return result;
}

/* -------------------------------------------------------------------------- */
/* The mark beside the name                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Which verification mark, if any, this climber wears — AND THE ONLY PLACE A
 * PUBLIC PROFILE MAY DECIDE THAT.
 *
 * `VerificationMark` fixes four claims in four colours and the whole point of
 * the ruling is that a reader can tell them apart at a glance. Two of the four
 * are reachable from a profile row and two are not:
 *
 *   WHITE  `isOwner` — runs ICEFALL. Server-granted through `app_owners`,
 *          which has no INSERT policy at all; the only way in is a definer
 *          function that requires the caller to be an owner already.
 *   GREY   `identityVerified` — they are who they say. Nothing more.
 *   GOLD   credentials ICEFALL checked. NOT AVAILABLE HERE and deliberately
 *          so: it would come from `profiles.role`, which this module refuses to
 *          fetch — "Guide" printed beside a name reads as ICEFALL having
 *          checked somebody's qualifications, and a role column is a self-
 *          declared string, not a check. See the module header.
 *   BLUE   paid member. Not readable about another account at all.
 *
 * The mockup draws the mark beside Wren's name in GOLD. It is WHITE, because
 * Wren is the owner and gold means credentials ICEFALL verified — a claim
 * nobody at ICEFALL has ever made about anybody. The colour is not a style
 * choice available to a screen; it follows from which of these fields the
 * server set, which is why this function exists rather than a condition at the
 * call site.
 *
 * `=== true`, NEVER TRUTHINESS. `null` means the extras read did not land, and
 * `false` means the server said no; both draw nothing, and the difference costs
 * a renderer nothing. Truthiness would be equivalent TODAY and would quietly
 * start drawing marks the day either field can arrive as a string.
 *
 * ORDERED, NOT COMBINED. An owner who has also verified their identity wears
 * one mark — the white one — because two ticks beside one name is a private
 * language nobody can read, and the smaller claim adds nothing to the larger.
 */
export function markKindFor(
  profile: Pick<PublicProfile, "isOwner" | "identityVerified">,
): MarkKind | null {
  if (profile.isOwner === true) return "owner";
  if (profile.identityVerified === true) return "identity";
  return null;
}

/* -------------------------------------------------------------------------- */
/* Summits, and the answer that there are none to read                         */
/* -------------------------------------------------------------------------- */

/**
 * One year of the achievements chart in the mockup: the highest elevation this
 * climber reached in that year.
 *
 * The type is written out because the chart is a real design and it should be
 * obvious what would fill it. It is not exported empty as a promise — see
 * `PublicSummits.byYear`, which is `[]` and says why.
 */
export interface PublicSummitYear {
  year: number;
  /** Metres. A year with no summit is ABSENT from the series, never plotted as 0. */
  highestM: number;
}

/**
 * ONE STATE, BECAUSE THERE IS ONE ANSWER.
 *
 * Not "loading", not "unreachable", not "empty". The answer does not depend on
 * the network, on the build, or on the climber: NOTHING ON ICEFALL'S SERVER
 * RECORDS A SUMMIT, for anybody, so no request could change it and none is
 * made. A second member of this union is what the day looks like when summits
 * become publishable — and it would arrive with a fetch, not with a regex.
 */
export type PublicSummitsState = "not-recorded";

/**
 * Another climber's summits, as far as ICEFALL may honestly describe them,
 * which is not at all.
 *
 * ── WHAT WAS CHECKED, AND WHY THE ANSWER IS THIS ─────────────────────────────
 *
 * The mockup's own post card is the reason to expect otherwise: it shows a
 * "SUMMIT LOG" chip, "Aiguille du Tour — 3,542 m", a date and a conditions box,
 * which reads exactly like a summit that is a published post — and posts ARE
 * readable about another person, through `posts_select`. It does not survive
 * contact with the table.
 *
 *   `public.posts` (20260831190000) is `id, author_id, author_kind, company_id,
 *   body, media_path, media_meta, expires_at, created_at`. No later migration
 *   adds to it. `social/types.ts` states the consequence in its own words and
 *   it is repeated rather than softened here: A POST HAS NO KIND. There is no
 *   summit flag, no peak, no elevation and no date-of-ascent; `media_meta` is
 *   an open bag but the only thing written into it is `{kind, width, height,
 *   mime}` by `Composer.tsx`, which is about the PHOTOGRAPH.
 *
 *   There is also no summit table anywhere in the schema, and nothing that
 *   writes one. `social/summitLog.ts` is `localStorage` — its own notice says
 *   "your logs live on this device… nothing is shared anywhere" — and the
 *   passport reads the same local store. So a summit has never left anybody's
 *   phone.
 *
 * The only remaining way to produce the mockup's figures would be to read
 * metres out of the words a climber typed. THAT IS THE ONE THING THIS FILE
 * EXISTS TO REFUSE. "Turned back at 3,542 m" and "summited at 3,542 m" match
 * the same pattern and are opposite facts, and the person who acts on the
 * difference is choosing who to go up a mountain with — the header calls a
 * fabricated climbing partner a hazard rather than a placeholder, and a
 * fabricated summit is the same hazard with a number on it.
 *
 * ── SO THE FIGURES ARE NULL, NOT NOUGHT ──────────────────────────────────────
 *
 * `Profile.tsx` already settled the identical question for Followers on the
 * athlete's OWN page and its reasoning is the precedent: those figures are
 * "unknown rather than zero — a zero would claim a real count of nought", and
 * it prints an em dash with the sentence "this is an empty feature rather than
 * an empty result". A `0 Summits` beside a stranger's name says they have
 * climbed nothing. ICEFALL does not know that and must not imply it.
 *
 * Note the contrast one screen over: a follower count of `0` IS a `0`, because
 * `follower_count_of` genuinely runs and genuinely counts nobody. Measured
 * nought and unmeasured are different sentences, and this app keeps them apart
 * everywhere or the distinction is worth nothing anywhere.
 */
export interface PublicSummits {
  /**
   * The summit logs this climber has published. ALWAYS EMPTY.
   *
   * Typed as `Post` — the server's own post shape — because if a summit log
   * ever becomes readable it will BE a post, and because `Post` is the honest
   * limit of the idea: it has a body, media and a time, and NO ELEVATION,
   * exactly as `public.posts` has no elevation column. That is why the list
   * could never produce `highestM` even once it fills.
   *
   * ITS LENGTH IS NOT THE SUMMIT COUNT. `[]` here means "no post can say it is
   * a summit", not "this climber has summited nothing" — read `summitCount`,
   * which is `null` and carries the difference.
   */
  summits: readonly Post[];
  /** `null` — not measured. NEVER `0`. See the interface note above. */
  summitCount: number | null;
  /** Metres. `null` — no post, and no table, carries an elevation to be highest of. */
  highestM: number | null;
  /**
   * The achievements chart's series. ALWAYS EMPTY, and an empty series must
   * draw NO CHART — not an axis with a flat line along zero, which is a picture
   * of a climber who reached sea level five years running.
   */
  byYear: readonly PublicSummitYear[];
  state: PublicSummitsState;
  /** `SUMMITS_NOT_RECORDED` — why the space is empty, in a climber's terms. */
  message: string;
}

/**
 * Frozen and shared, so every caller gets the SAME object.
 *
 * Referential stability is not a micro-optimisation here: a fresh `{}` each
 * render would re-fire any effect or memo keyed on this result, in a hook that
 * by construction can never have news.
 */
const NO_PUBLIC_SUMMITS: PublicSummits = Object.freeze({
  summits: Object.freeze([]) as readonly Post[],
  summitCount: null,
  highestM: null,
  byYear: Object.freeze([]) as readonly PublicSummitYear[],
  state: "not-recorded",
  message: SUMMITS_NOT_RECORDED,
});

/**
 * One climber's summits, for the stat row and the achievements chart.
 *
 * IT MAKES NO REQUEST, AND THAT IS THE DELIBERATE PART. Reading their posts
 * would be theatre: the rows would come back and not one of them could be
 * classified, so the answer would be identical and a round trip would have been
 * spent implying that a network failure and this emptiness are related. They
 * are not. The emptiness is structural — see `PublicSummits` — and no amount of
 * asking changes it.
 *
 * It is a HOOK, taking the profile id it does not yet use, because the shape of
 * the call is the part worth fixing now: the day a summit is recordable this
 * becomes a fetch and no screen changes. `network/directory.ts` keeps
 * `DISCOVERABLE_ATHLETES` empty on the same principle — every consumer iterates
 * it exactly as it would iterate a populated list, so the wiring is exercised
 * code rather than a branch nobody has run.
 *
 * FOR WHOEVER MAKES THIS REAL: it needs a place for a summit to live and an
 * owner ruling on what one claims. `SUMMIT_VERIFIED_MEANING` already fixes the
 * only verification ICEFALL can perform — "the summit was reached during an
 * activity recorded in ICEFALL, and the track reached the summit… not a check
 * on the person" — and `trackReachedSummit` in `social/posts.ts` already
 * performs it against a recording. What is missing is a column and a write
 * path, not a heuristic. Do not add one here.
 */
export function usePublicSummits(profileId: string): PublicSummits {
  // `profileId` is unused, and named plainly rather than underscored so the
  // signature reads as the one it will keep.
  void profileId;
  return NO_PUBLIC_SUMMITS;
}
