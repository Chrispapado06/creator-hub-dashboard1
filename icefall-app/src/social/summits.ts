/**
 * SUMMIT LOGS — the first thing ICEFALL has ever been told about a climb.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 *
 * The owner's profile mockup drew a card reading "SUMMIT LOG · Aiguille du Tour
 * · 3,542 m". Nothing behind it existed. `public.posts` is author, body, one
 * photo, a timestamp — `social/types.ts` says it in capitals, A POST HAS NO
 * KIND — and the athlete's own summit list and passport are `localStorage`
 * (`social/summitLog.ts`: "your logs live on this device… nothing is shared
 * anywhere"). So a profile could not show a summit count because ICEFALL had
 * never been told one, and `publicProfile.ts` was right to answer `null` to
 * every summit question rather than read metres out of typed prose.
 *
 * `20260902270000_summit_logs.sql` is the table that changes the answer, and
 * this module is the only thing that writes it or reads it.
 *
 * ── A SUMMIT LOG IS SELF-REPORTED. NOTHING HERE MAY SAY OTHERWISE ────────────
 *
 * There is deliberately NO `verified` column on `summit_logs` and no way to
 * earn one, so nothing built on this module may draw a tick, a badge, a shield
 * or the word "verified" beside a summit. The app already fixed the meaning of
 * that word, in `social/community.ts`:
 *
 *   "Verified means the summit was reached during an activity recorded in
 *    ICEFALL, and the track reached the summit. It is not a check on the person."
 *
 * Nothing can satisfy it. Recorded activities live on the device and no track
 * has ever reached a server, so there is no evidence here to check a claim
 * against — `trackReachedSummit` in `social/posts.ts` performs the real check,
 * against a recording that never leaves the phone. A mark nobody can earn is
 * the `verified: false` literal `network/types.ts` already carries with the
 * note "MUST RENDER AS NOTHING". The owner's own mockup footer has the
 * sentence every surface should use instead, and it is exported below as
 * `SUMMITS_SELF_REPORTED`: **ICEFALL does not verify achievements.**
 *
 * ── A COUNT OF WHAT WAS PUBLISHED, NEVER OF WHAT WAS CLIMBED ─────────────────
 *
 * `useSummitStats` returns how many logs somebody has PUBLISHED. A private
 * diary is not in the figure, because ICEFALL was not told about it — which is
 * why `SUMMIT_COUNT_LABEL` is "Summits published" and not "Summits". A screen
 * that shortens the label is making a different claim from the one the number
 * supports.
 *
 * And the app's oldest rule holds throughout: `0` IS A MEASURED ZERO and
 * renders `0`; `null` is NOT MEASURED and renders an em dash. They are one line
 * apart in a renderer and opposite statements on a page. `highestM` is `null`
 * when nothing is published AND when every published log was filed without an
 * elevation — `max()` over no numbers is null, which is exactly right: not one
 * of those logs claims a height, so neither may the profile.
 *
 * ── SURVIVING A MIGRATION THAT IS NOT PUSHED ─────────────────────────────────
 *
 * The owner gates migrations, so at the time of writing 20260902270000 is
 * written, tested and NOT pushed. Every read below therefore answers
 * `not-provisioned`, and that is the correct, honest state rather than a
 * failure to handle — it says the FEATURE is missing, never that the CLIMBER
 * has done nothing.
 *
 * `publicProfile.ts` learned the mechanics the hard way and they are copied
 * here: a PostgREST computed field the server does not have fails the WHOLE
 * select rather than quietly omitting itself (42883 / 42703, recorded by
 * SQLSTATE in 20260902200000). So `summit_count` and `highest_summit_m` are
 * never appended to a select that also carries something a screen needs; they
 * go out in a SECOND, PARALLEL request that is allowed to fail, and the rows
 * answer on their own if it does. See `fetchTotals`.
 *
 * ── THE DATE BUG THIS PROJECT HAS PAID FOR SEVERAL TIMES ─────────────────────
 *
 * `summited_on` is a DATE — a bare `YYYY-MM-DD`, the day somebody stood on top.
 * `new Date("2026-08-27")` parses as UTC midnight, which is the 26th anywhere
 * west of Greenwich, and commit f2cb54c fixed exactly that across ~70 call
 * sites. Nothing in this module or downstream of it may build a `Date` from
 * `summitedOn`: render it with `summitDateLabel`, which goes through the app's
 * own `fmtDate` and its strict local parse.
 *
 * ── NOTHING PUBLISHED HERE IS EDITABLE ───────────────────────────────────────
 *
 * `summit_logs` has a DELETE policy and NO UPDATE POLICY, matching `posts`,
 * `channel_messages` and `group_messages`. A published claim about a mountain
 * is stood behind or deleted — silently editing "3,542 m" to "4,542 m" under
 * the replies, after people have read it and perhaps planned around it, is the
 * thing that rule exists to prevent. So this module exports no update path and
 * no screen may build an edit control (`NO_EDIT_AFTER_PUBLISH` is the sentence
 * to show instead).
 *
 * It exports no delete either, and that is not an omission: `post_id` is
 * `on delete cascade`, so deleting the POST takes the claim with it through
 * whatever already deletes posts. A second delete path would be a second way
 * for the two rows to disagree.
 *
 * ── AN ACCOUNT IS REQUIRED ───────────────────────────────────────────────────
 *
 * The owner ruled on 2 September that ICEFALL requires an account, `AppShell`
 * gates on a session, and DEMO builds are exempt. So "signed out" is not a
 * state to design for — it is handled only because `summit_logs_select` grants
 * `to authenticated`, which means an anonymous read is not refused, it returns
 * NO ROWS. Reporting that as "this climber has published nothing" would be a
 * confident false statement about a real person. "No server in this build" IS a
 * real state, and `SUMMITS_NO_BACKEND` says so.
 */
import { useEffect, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { fmtDate } from "@/lib/format";
import { withTimeout } from "@/lib/netTimeout";

/**
 * The typed client does not know about `posts` or `summit_logs`.
 *
 * `backend/types.ts` is a hand-written description of the schema written before
 * the social migration, it belongs to another session, and it has neither
 * table on it — so a typed `.from("summit_logs")` does not compile. Every other
 * social module opened the same untyped view of the SAME client for the same
 * reason (`Composer.tsx`, `highlights.ts`, `groupSpace.ts`, `Comments.tsx`),
 * and the consequence is accepted deliberately: the rows come back as `any`, so
 * every field is re-checked below rather than trusted. A coerced value is an
 * invented one.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* ========================================================================== */
/* Copy — one place, so two surfaces cannot make different promises            */
/* ========================================================================== */

/**
 * THE FOOTER SENTENCE, AND THE MOST IMPORTANT STRING IN THIS FILE.
 *
 * It is the owner's own words from the profile mockup. Any surface that draws
 * a summit log — the feed card, the profile list, the achievements chart —
 * carries it, because a card with a peak, a height and a date on it looks like
 * a record somebody checked, and nobody checked it.
 */
export const SUMMITS_SELF_REPORTED = "ICEFALL does not verify achievements.";

/**
 * The long form, for a screen with room for it: what a summit log IS, said
 * plainly enough that a reader knows what weight to put on one.
 */
export const SUMMITS_SELF_REPORTED_LONG =
  "Summit logs are written by the climber who says they were there. ICEFALL does not check them — not the peak, not the height, not the day — and there is no way for anybody to earn a tick on one. Read them the way you would read a note in a hut book.";

/**
 * THE LABEL FOR THE COUNT. Not "Summits".
 *
 * `summit_count_of` counts the logs somebody has PUBLISHED here. Somebody with
 * forty ascents in a paper notebook and none on ICEFALL is a `0`, and a stat
 * tile reading "0 Summits" beside their name would say something about their
 * climbing that this app has no way of knowing. The word "published" is what
 * makes the number true.
 */
export const SUMMIT_COUNT_LABEL = "Summits published";

/** The same correction, as a sentence, for a tooltip or a footnote. */
export const SUMMIT_COUNT_MEANING =
  "How many summits this climber has published on ICEFALL — not how many they have climbed. A summit kept to yourself is not counted, because ICEFALL was never told about it.";

/** `highest_summit_m`, and what its absence means. Never "they have climbed nothing". */
export const HIGHEST_SUMMIT_MEANING =
  "The highest elevation among the summits this climber has published. A dash means no published log carries an elevation — logging one is optional, because a required height would only produce guessed numbers.";

/**
 * THE ORDINARY STATE UNTIL THE MIGRATION IS PUSHED.
 *
 * It is a fact about ICEFALL's server, and it is written so that it can never
 * be read as a fact about the person whose page it appears on.
 */
export const SUMMITS_NOT_PROVISIONED =
  "ICEFALL's server cannot record summits yet, so there is nothing to read. This is a missing feature rather than an empty climbing record — nobody's summits have been counted, including yours.";

/** No client in this build. Offline and DEMO builds never construct one. */
export const SUMMITS_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so no summit can be published and none can be read. Nothing is missing from this page — nothing was asked for.";

/** The request went out and did not come back. Never dressed as an answer. */
export const SUMMITS_UNREACHABLE =
  "ICEFALL could not reach the server, so it does not know what this climber has published. That is a read that did not come back rather than an empty list.";

/**
 * The server answered and said no, for a reason this module did not anticipate.
 *
 * KEPT SEPARATE FROM AN EMPTY ANSWER, the distinction `highlights.ts` records
 * the cost of blurring: a refusal read as a fact about the deployment made
 * every screen announce something untrue about ICEFALL's server.
 */
export const SUMMITS_READ_REFUSED =
  "ICEFALL's server refused that read, so this climber's summits cannot be shown. A refusal is not an answer — they may well have published some.";

/**
 * Signed out. UNREADABLE, NOT EMPTY.
 *
 * `summit_logs_select` grants `to authenticated`, so an anonymous request is
 * not refused — it simply returns no rows, which is indistinguishable from a
 * climber who has published nothing unless it is caught here. `AppShell` gates
 * on a session so this should be unreachable in a shipped build; it is handled
 * because the cost of getting it wrong is a false statement about a real person.
 */
export const SUMMITS_SIGNED_OUT =
  "ICEFALL only lets signed-in accounts read summit logs, so nothing could be looked up. This is not “no summits” — nothing is visible from here at all.";

/* ---- Writing ------------------------------------------------------------- */

export const PUBLISH_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so this cannot be published. Nothing has been stored and nobody has seen it — what you wrote is still here.";

export const PUBLISH_SIGNED_OUT =
  "A summit log carries your name, so it needs your account. Nothing has been published.";

export const PUBLISH_BODY_EMPTY =
  "A summit log is a post, and a post is always words. Say something about the day — one line is enough — and it will publish with the peak, the height and the date.";

export const PUBLISH_BODY_TOO_LONG =
  "That is longer than a post can be. ICEFALL keeps posts to 4,000 characters; nothing has been published yet, so nothing has been lost.";

export const PUBLISH_PEAK_EMPTY =
  "A summit log needs the name of the peak. Choose one from ICEFALL's catalogue or type it — a mountain ICEFALL has not heard of is still a mountain you climbed.";

export const PUBLISH_PEAK_TOO_LONG =
  "That peak name is longer than ICEFALL stores (120 characters). Nothing has been published.";

/**
 * OUT OF RANGE IS REFUSED, NEVER CLAMPED.
 *
 * The column allows 0–9,000 m, matching `destinations.elevation_m`; anything
 * above Everest is a typo. Quietly clamping 9,500 to 9,000 would publish a
 * number nobody typed, on a card other climbers read as a fact.
 */
export const PUBLISH_ELEVATION_RANGE =
  "That elevation is outside the range ICEFALL stores — 0 to 9,000 metres. Nothing has been published and nothing has been rounded to fit: check the figure, or leave it off, which is allowed.";

export const PUBLISH_DATE_MALFORMED =
  "That is not a date ICEFALL can read. Choose the day you stood on the summit; nothing has been published.";

/**
 * A future date is refused before it is sent, so the climber gets a sentence
 * rather than a database error. `summit_not_in_the_future` would refuse it
 * anyway — this just gets there first, and in English.
 */
export const PUBLISH_DATE_FUTURE =
  "That day has not happened yet. A summit in the future is a plan rather than an ascent, so ICEFALL will not publish it as one — nothing has been stored.";

/**
 * The narrow case where the client's calendar is ahead of the server's.
 *
 * `summit_not_in_the_future` compares against `(now() at time zone 'utc')::date`
 * — the UTC day. East of Greenwich, late in the evening, the climber's own
 * today is already the server's tomorrow, so a summit logged on the day it
 * happened is refused. It is a real refusal with a real reason, and it is a
 * few hours long, so it says exactly that rather than "invalid date".
 */
export const PUBLISH_DATE_AHEAD_OF_SERVER =
  "ICEFALL's server keeps its clock in UTC, and your today has not started there yet, so it will not accept this summit as already climbed. Nothing has been published — it will go through in a few hours, or now if you log it as yesterday and that is genuinely the day.";

export const PUBLISH_ROUTE_TOO_LONG =
  "That route description is longer than ICEFALL stores (200 characters). Nothing has been published.";

export const PUBLISH_CONDITIONS_TOO_LONG =
  "That conditions report is longer than ICEFALL stores (1,000 characters). Nothing has been published — shortening it is worth the trouble, because conditions are the part other climbers actually use.";

export const PUBLISH_PEAK_UNKNOWN =
  "ICEFALL's catalogue does not hold that peak, so the log could not be attached to it. Publishing with the name typed out works — nothing has been stored yet.";

/**
 * Only a photograph. Video is gated on identity by the storage policy
 * (20260902200000), and this module does not read identity — so rather than
 * let an upload fail at the bucket with a storage error, it refuses here with
 * the reason. `Composer.tsx` is where video is offered, to the accounts that
 * may have it.
 */
export const PUBLISH_PHOTO_ONLY =
  "A summit log takes a photograph. Video on ICEFALL is for accounts whose identity has been checked, and it is posted from the feed composer rather than from here — nothing has been published.";

export const PUBLISH_PHOTO_FAILED =
  "That photo could not be stored, so nothing was published — not the photo and not the summit. Everything you typed is still here; publishing without the photo will work.";

export const PUBLISH_NOT_PROVISIONED =
  "ICEFALL's server cannot record summits yet, so this could not be published and nothing was stored. Nobody has seen it. This is a missing feature rather than a mistake you made.";

export const PUBLISH_REFUSED =
  "ICEFALL refused this. That usually means the session ended — signing in again is worth a try. Nothing has been stored and nobody has seen it.";

export const PUBLISH_UNREACHABLE =
  "This could not be sent — ICEFALL could not reach the server. Nothing has been stored, nothing is waiting in the background, and nobody has seen it. What you wrote is still here.";

export const PUBLISH_FAILED =
  "ICEFALL could not publish this, and nothing has been stored. What you wrote is still here — trying again is worth a go.";

/**
 * THE WORST OUTCOME, AND THE ONE THE PERSON MUST BE TOLD ABOUT.
 *
 * The post went up, the summit log did not, and the attempt to take the post
 * down again ALSO failed. What is now on the feed is an ordinary post — the
 * climber's words with no peak, no height and no date attached — which claims
 * nothing and cannot be turned into a summit log later, because there is no
 * update path and the log's insert already failed once. So the message names
 * the situation and points at the only fix, which is theirs: delete the post.
 */
export const PUBLISH_STRANDED_POST =
  "Your words posted, but the summit itself did not, and ICEFALL could not take the post back down. What is on the feed now is an ordinary post with no peak, height or date on it. Delete it from your profile and publish the summit again — nothing was half-recorded, there is simply a post there that says less than you meant it to.";

/** Why there is no edit button on a published summit log. Shown, not implied. */
export const NO_EDIT_AFTER_PUBLISH =
  "A published summit log cannot be edited. Other climbers may have read it and planned around it, so a claim about a mountain is stood behind or deleted — deleting the post removes the summit with it.";

/* ========================================================================== */
/* Shapes                                                                      */
/* ========================================================================== */

/**
 * One row of `public.summit_logs`, checked.
 *
 * NAMED `PublishedSummit` AND NOT `SummitLog`, WHICH IS THE POINT. `social/
 * summitLog.ts` already exports a `SummitLog`: the device-local record ICEFALL
 * has always had, held in `localStorage`, with a `note`, a data-URL `photo` and
 * an `activityId`. This one is a server row, has none of those, and is READABLE
 * BY OTHER PEOPLE — which is the entire difference between them. Importing both
 * into one file needs no alias precisely because they are named apart, the same
 * fix `social/types.ts` applied to its two `Comment`s.
 */
export interface PublishedSummit {
  /** `summit_logs.id`. */
  id: string;
  /** `summit_logs.post_id` — UNIQUE, so a post carries at most one claim. */
  postId: string;
  /** `summit_logs.author_id`. A trigger pins it to the post's author. */
  authorId: string;
  /**
   * `destinations.id` when the peak came from ICEFALL's catalogue, so two
   * climbers' Mont Blanc is the same Mont Blanc and the card can link to it.
   * `null` is ordinary: the catalogue is 22 countries and somebody will climb
   * something that is not in it.
   */
  destinationId: string | null;
  /** Always set, catalogue or not. The name is what a card draws. */
  peakName: string;
  /**
   * Metres, or `null` for NOT STATED — which is not the same as sea level and
   * must never render as `0`. Logging a height is optional on purpose: a
   * required field would produce guessed numbers.
   */
  elevationM: number | null;
  /**
   * Bare `YYYY-MM-DD`, the day they stood on top.
   *
   * NEVER `new Date(summitedOn)`. It parses as UTC midnight and renders a day
   * early west of Greenwich — the bug f2cb54c fixed across ~70 call sites.
   * `summitDateLabel` is the way to draw it.
   */
  summitedOn: string;
  /** The way up, in the climber's words. `null` when they did not say. */
  route: string | null;
  /** What the mountain was like — the part other climbers actually use. */
  conditions: string | null;
  /** `summit_logs.created_at` — when it was PUBLISHED, not when it was climbed. */
  createdAt: string;
}

/**
 * One column of the achievements chart: the highest elevation this climber
 * published for that year.
 *
 * Deliberately the same shape as `PublicSummitYear` in `publicProfile.ts`,
 * which was written as the placeholder for this data and belongs to another
 * session — so it is restated here rather than imported, and that file's
 * `usePublicSummits` (which answers "not-recorded" to everything) is what this
 * module supersedes once 20260902270000 is pushed.
 *
 * A YEAR WITH NO PUBLISHED ELEVATION IS ABSENT FROM THE SERIES, never plotted
 * as `0`. A flat line along zero is a picture of a climber who reached sea
 * level five years running.
 */
export interface SummitYear {
  year: number;
  /** Metres. The highest of that year's published logs that carried a height. */
  highestM: number;
}

/**
 * Five states, because they are five different sentences.
 *
 *   loading          — no answer yet.
 *   ready            — the server answered, and this is what it said. An empty
 *                      list here is a REAL empty: this climber has published
 *                      no summits.
 *   not-provisioned  — `summit_logs` is not on the server. The ordinary state
 *                      until the owner pushes 20260902270000, and a fact about
 *                      ICEFALL rather than about the climber.
 *   no-backend       — this build has no client, so nothing was asked.
 *   unreachable      — ICEFALL could not ask, or asked and got no usable answer.
 *
 * `ready` AND THE OTHER FOUR ARE THE PAIR WORTH GUARDING. "They have published
 * nothing" and "ICEFALL could not find out" are different claims and only the
 * first is something the app knows.
 */
export type SummitReadState =
  | "loading"
  | "ready"
  | "not-provisioned"
  | "no-backend"
  | "unreachable";

export interface SummitLogResult {
  /**
   * The log for this post, or `null`.
   *
   * `null` WITH `state: "ready"` MEANS THE POST IS NOT A SUMMIT LOG — an
   * ordinary post, which is most posts. The card renders it as one. `null` with
   * any other state means nobody found out, and the card renders it as an
   * ordinary post too, because a post whose summit could not be read is exactly
   * a post with no summit visible on it — it just must not say "no summit".
   */
  summit: PublishedSummit | null;
  state: SummitReadState;
  /** Present whenever an absence needs explaining. */
  message?: string;
}

export interface SummitLogsResult {
  /** Newest ascent first. Empty with `state: "ready"` is a real empty. */
  summits: readonly PublishedSummit[];
  /**
   * The read hit its limit, so this is the most recent page and not everything.
   * A list that stops short must SAY it stopped short — otherwise its length
   * reads as a total, and the total is what `useSummitStats` is for.
   */
  truncated: boolean;
  state: SummitReadState;
  message?: string;
}

export interface SummitStatsResult {
  /**
   * How many summits this climber has PUBLISHED — `SUMMIT_COUNT_LABEL`.
   *
   * `0` is a measured zero and renders `0`. `null` is NOT MEASURED and renders
   * an em dash; it means the table is not there, the read failed, or the list
   * came back truncated so counting it would have produced a floor dressed as
   * a total.
   */
  count: number | null;
  /**
   * The highest published elevation, in metres. `null` when nothing is
   * published AND when nothing published carries an elevation — `max()` over no
   * numbers is null, and the migration's own closing note says the same:
   * "NULL … is NOT MEASURED and renders an em dash". NEVER `0`.
   */
  highestM: number | null;
  /** Oldest year first, so a chart reads left to right. Empty draws NO chart. */
  byYear: readonly SummitYear[];
  state: SummitReadState;
  message?: string;
}

/** What `publishSummit` was given. Everything optional is genuinely optional. */
export interface PublishSummitInput {
  /** `posts.body` — 1–4,000 characters. A summit log is still words. */
  body: string;
  /** Always required, catalogue or not. 1–120 characters. */
  peakName: string;
  /** `destinations.id`, when the peak came from ICEFALL's catalogue. */
  destinationId?: string | null;
  /** Metres, 0–9,000. Omitted is normal and is not a gap to fill in. */
  elevationM?: number | null;
  /** Bare `YYYY-MM-DD`, not in the future. */
  summitedOn: string;
  /** Up to 200 characters. */
  route?: string | null;
  /** Up to 1,000 characters — the field other climbers read. */
  conditions?: string | null;
  /** A photograph. Images only — see `PUBLISH_PHOTO_ONLY`. */
  file?: File | null;
}

export type PublishSummitResult =
  | { ok: true; postId: string; summit: PublishedSummit }
  | {
      ok: false;
      message: string;
      /**
       * Set ONLY in the one case where the post is live and the summit is not
       * and the rollback failed too. A caller holding this id can offer the
       * delete that fixes it; a caller ignoring it still shows the message,
       * which says what happened in words. Every other failure leaves NOTHING
       * on the server, and this field is absent to prove it.
       */
      strandedPostId?: string;
    };

/* ========================================================================== */
/* Tuning                                                                      */
/* ========================================================================== */

/**
 * One read on mount, and it absolutely needs a deadline.
 *
 * `lib/netTimeout.ts` records the failure this prevents: nothing in this
 * codebase puts a timeout on supabase-js, so with credentials present and the
 * network dead-but-not-absent — hut wifi, a captive portal, one bar — the
 * request hangs for as long as the OS allows and the hook sits on `loading`
 * for ever. Six seconds, matching the other profile-side reads.
 */
const SUMMITS_TIMEOUT_MS = 6_000;

/**
 * SEPARATELY BUDGETED. `getSession()` can refresh a token over the network and
 * it happens BEFORE the query, so the query's `.abortSignal()` cannot protect
 * it. Same reasoning and same number as `publicProfile.ts` and `search/people.ts`.
 */
const SESSION_TIMEOUT_MS = 3_000;

/**
 * How many logs one profile read returns.
 *
 * A hundred is far more than a climbing career publishes in this app's
 * lifetime, and it is a limit rather than a page because there is no "all
 * summits" screen to page into yet. When it is hit the result says `truncated`
 * and the count falls to `null` rather than reporting 100 as a total.
 */
const SUMMITS_LIMIT = 100;

/**
 * The stats read asks for more, and for two columns instead of ten.
 *
 * It exists to produce a count, a maximum and a per-year series, so it is the
 * one read where the LIMIT genuinely bounds the truth. Five hundred bare
 * (date, elevation) pairs is a small response and puts the limit somewhere no
 * real profile reaches.
 */
const STATS_LIMIT = 500;

/** Every column of the row, in the order the migration declares them. */
const SUMMIT_COLUMNS =
  "id, post_id, author_id, destination_id, peak_name, elevation_m, summited_on, route, conditions, created_at";

/** The two fields a count, a maximum and a chart are made of. Nothing else. */
const STATS_COLUMNS = "summited_on, elevation_m";

/**
 * `post-media`, from 20260902160000. PRIVATE — a path is not a picture, which
 * is why `PostMedia.url` is required and `PostMedia.path` is not.
 *
 * `Composer.tsx` still holds `POST_MEDIA_BUCKET = null` with a comment saying
 * no bucket exists; that comment predates this migration and the file belongs
 * to another session, so it is left alone rather than corrected from here.
 * `highlights.ts`, `CreateHighlight.tsx` and `AthleteProfile.tsx` all read and
 * write this bucket by this name.
 */
const POST_MEDIA_BUCKET = "post-media";

/* ========================================================================== */
/* Classifying what came back                                                  */
/* ========================================================================== */

/**
 * Is this error "the server does not have that table or that field", as opposed
 * to "the server would not answer"?
 *
 * The distinction decides whether a screen says `SUMMITS_NOT_PROVISIONED` (a
 * fact about the build) or `SUMMITS_READ_REFUSED` / `SUMMITS_UNREACHABLE` (a
 * non-answer), and those are different sentences to a reader. `42P01`/`PGRST205`
 * is a missing table, `42703`/`PGRST204` a missing column, `PGRST202` a missing
 * function to PostgREST, and `42883` is Postgres's own undefined-function —
 * which is what a computed field whose definer function never deployed actually
 * raises; 20260902200000 records that SQLSTATE by number after it took two
 * pushes down.
 *
 * The test is repeated here rather than imported from `publicProfile.ts` or
 * `highlights.ts` for the reason both of those give about each other: they own
 * their copies, and reaching into a private helper in a file this module does
 * not own is how two sessions end up editing one line.
 */
function isNotProvisioned(error: PostgrestError): boolean {
  const code = error.code ?? "";
  if (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST202" ||
    code === "42883"
  ) {
    return true;
  }
  const message = (error.message ?? "").toLowerCase();
  return message.includes("does not exist") || message.includes("schema cache");
}

/** A transport failure or an expired deadline, as opposed to a server verdict. */
function isUnreachable(error: PostgrestError): boolean {
  const text = `${error.message ?? ""} ${error.code ?? ""}`.toLowerCase();
  return text.includes("fetch") || text.includes("abort") || text.includes("network");
}

/** One read failure, as a state and a sentence a climber can act on. */
function readFailure(error: PostgrestError): { state: SummitReadState; message: string } {
  if (isNotProvisioned(error)) {
    return { state: "not-provisioned", message: SUMMITS_NOT_PROVISIONED };
  }
  if (isUnreachable(error)) return { state: "unreachable", message: SUMMITS_UNREACHABLE };
  return { state: "unreachable", message: SUMMITS_READ_REFUSED };
}

/**
 * Postgres speaks to operators, not to climbers — the rule `Composer.tsx` and
 * `support/tickets.ts` both follow. `new row violates row-level security policy
 * for table "summit_logs"` is accurate and unusable; every branch below ends in
 * something a person can act on, and every branch says what did or did not
 * reach the server.
 */
function writeFailure(error: PostgrestError | null): string {
  if (!error) return PUBLISH_FAILED;
  const code = error.code ?? "";
  const message = (error.message ?? "").toLowerCase();

  if (isNotProvisioned(error)) return PUBLISH_NOT_PROVISIONED;
  // `summit_not_in_the_future`. The client already refused a future date
  // against the LOCAL calendar, so reaching this means the server's UTC day is
  // behind the climber's — see `PUBLISH_DATE_AHEAD_OF_SERVER`.
  if (code === "23514") return PUBLISH_DATE_AHEAD_OF_SERVER;
  // `destination_id` references a peak the catalogue does not hold.
  if (code === "23503") return PUBLISH_PEAK_UNKNOWN;
  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("permission denied")
  ) {
    return PUBLISH_REFUSED;
  }
  if (isUnreachable(error)) return PUBLISH_UNREACHABLE;
  return PUBLISH_FAILED;
}

/* ========================================================================== */
/* Rows in, shapes out                                                         */
/* ========================================================================== */

/** Metres, or `null`. Anything that is not a finite number was not measured. */
function metresOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

/** A trimmed string, or `null`. An empty string is an absence, not a value. */
function textOf(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Bare `YYYY-MM-DD`, and nothing else. `summited_on` is a DATE column. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The wire row as the app's shape, or `null` if it cannot be read as a summit.
 *
 * Every field is re-checked despite the migration's constraints, because the
 * client is untyped here and the cost of trusting it is a card reading
 * "undefined — undefined m". A row missing an id, a post, a peak or a date is
 * DROPPED rather than coerced: a coerced value is an invented one, and this is
 * a claim about a mountain.
 */
function toSummit(row: Record<string, unknown>): PublishedSummit | null {
  const id = typeof row.id === "string" ? row.id : "";
  const postId = typeof row.post_id === "string" ? row.post_id : "";
  const authorId = typeof row.author_id === "string" ? row.author_id : "";
  const peakName = textOf(row.peak_name);
  const summitedOn = typeof row.summited_on === "string" ? row.summited_on.slice(0, 10) : "";
  if (!id || !postId || !authorId || !peakName || !ISO_DAY.test(summitedOn)) return null;

  return {
    id,
    postId,
    authorId,
    destinationId: textOf(row.destination_id),
    peakName,
    elevationM: metresOf(row.elevation_m),
    summitedOn,
    route: textOf(row.route),
    conditions: textOf(row.conditions),
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/**
 * The summit's date, drawn the one safe way.
 *
 * EXPORTED SO NO CALL SITE REACHES FOR `new Date`. `fmtDate` parses a bare
 * `YYYY-MM-DD` with the local constructor — see its own header, which is where
 * f2cb54c's fix lives — and passing the string anywhere else re-introduces the
 * off-by-one that made summit dates render a day early for everyone west of
 * Greenwich.
 */
export function summitDateLabel(summitedOn: string): string {
  return fmtDate(summitedOn);
}

/* ========================================================================== */
/* The local calendar                                                          */
/* ========================================================================== */

/**
 * `Date` → bare `YYYY-MM-DD`, LOCAL.
 *
 * Never `toISOString().slice(0,10)`, which is the UTC day and therefore
 * tomorrow for anyone east of Greenwich in the evening — the mirror of the bug
 * fixed at the render end. `Onboarding.tsx` carries the same helper with the
 * same warning.
 */
function localDay(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Is this a real calendar day? Strict — `2027-02-31` is refused rather than
 * rolled silently into March, which is what `new Date(2027, 1, 31)` would do.
 */
function isRealDay(iso: string): boolean {
  if (!ISO_DAY.test(iso)) return false;
  const [y, mo, d] = iso.split("-").map(Number);
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/* ========================================================================== */
/* The session gate                                                            */
/* ========================================================================== */

/**
 * A failure carries BOTH the reading copy and the reason, because the two
 * callers need different halves. A hook wants `state` and `message` — the
 * sentence under an empty list. A publish wants the reason, so it can say what
 * happened to the words somebody just typed: "nothing is visible from here" is
 * the right sentence in front of an empty profile and the wrong one in front of
 * a climber who pressed Publish.
 */
type Gate =
  | { ok: true; uid: string; client: SupabaseClient }
  | {
      ok: false;
      reason: "no-backend" | "signed-out" | "unreachable";
      state: SummitReadState;
      message: string;
    };

/**
 * Nothing in this module touches the network without going through here.
 *
 * It also narrows `untyped` to non-null for the caller, which is why every
 * query below reads `gate.client` rather than the module constant — the same
 * reason `highlights.ts` gives: a `!` at eight call sites is eight places a
 * later edit can be wrong.
 *
 * The session is fetched under its own deadline. `getSession` can go to the
 * network to refresh a token, and a hook that hangs there never reaches the
 * query whose `.abortSignal()` would have saved it.
 */
async function gate(): Promise<Gate> {
  if (!supabase || !untyped) {
    return { ok: false, reason: "no-backend", state: "no-backend", message: SUMMITS_NO_BACKEND };
  }

  const session = await withDeadline(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  if (session === TIMED_OUT || session.error) {
    return { ok: false, reason: "unreachable", state: "unreachable", message: SUMMITS_UNREACHABLE };
  }
  const uid = session.data.session?.user.id;
  // `unreachable` rather than a state of its own: a signed-out reader is not a
  // state this app designs for (an account is required and `AppShell` gates on
  // one), and the SHAPE a screen draws is the same. Which it was is in the
  // message, and the message is the part the reader acts on.
  if (!uid) {
    return { ok: false, reason: "signed-out", state: "unreachable", message: SUMMITS_SIGNED_OUT };
  }

  return { ok: true, uid, client: untyped };
}

/**
 * Race a promise that has no cancellation of its own against the clock.
 *
 * Returns a sentinel rather than throwing, so the caller handles the timeout
 * deliberately instead of catching it by accident alongside real errors.
 * Copied from `publicProfile.ts` and `search/people.ts` rather than imported:
 * it is a private helper in files this module does not own.
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

/* ========================================================================== */
/* Publishing                                                                  */
/* ========================================================================== */

/** `posts_body_check` — `length(trim(body)) between 1 and 4000`. Matched, not guessed. */
const MAX_BODY = 4000;
/** `length(trim(peak_name)) between 1 and 120`. */
const MAX_PEAK_NAME = 120;
/** `length(trim(route)) <= 200`. */
const MAX_ROUTE = 200;
/** `length(trim(conditions)) <= 1000`. */
const MAX_CONDITIONS = 1000;
/** `elevation_m between 0 and 9000` — matches `destinations.elevation_m`. */
const MIN_ELEVATION_M = 0;
const MAX_ELEVATION_M = 9000;

/** What the two inserts will be given, once everything has been checked. */
interface Checked {
  body: string;
  peakName: string;
  destinationId: string | null;
  elevationM: number | null;
  summitedOn: string;
  route: string | null;
  conditions: string | null;
}

/**
 * Every rule the two tables enforce, checked here first so that a climber gets
 * a sentence instead of a constraint violation.
 *
 * The constraints are still the authority — this does not replace them, and it
 * must not drift from them, which is why each limit above names the check it
 * mirrors. What it buys is the difference between "That day has not happened
 * yet" and `new row for relation "summit_logs" violates check constraint
 * "summit_not_in_the_future"`.
 */
function check(input: PublishSummitInput): { ok: true; value: Checked } | { ok: false; message: string } {
  const body = input.body.trim();
  if (body.length === 0) return { ok: false, message: PUBLISH_BODY_EMPTY };
  if (body.length > MAX_BODY) return { ok: false, message: PUBLISH_BODY_TOO_LONG };

  const peakName = input.peakName.trim();
  if (peakName.length === 0) return { ok: false, message: PUBLISH_PEAK_EMPTY };
  if (peakName.length > MAX_PEAK_NAME) return { ok: false, message: PUBLISH_PEAK_TOO_LONG };

  const summitedOn = input.summitedOn.trim();
  if (!isRealDay(summitedOn)) return { ok: false, message: PUBLISH_DATE_MALFORMED };
  // Compared as STRINGS, which is exact for `YYYY-MM-DD` and needs no `Date` at
  // all — so this check cannot itself acquire the UTC-midnight bug it exists
  // beside. Against the LOCAL day: the climber's own today is not the future,
  // whatever UTC thinks, and the narrow case where the server disagrees has its
  // own sentence in `writeFailure`.
  if (summitedOn > localDay(new Date())) return { ok: false, message: PUBLISH_DATE_FUTURE };

  let elevationM: number | null = null;
  if (input.elevationM !== undefined && input.elevationM !== null) {
    if (!Number.isFinite(input.elevationM)) return { ok: false, message: PUBLISH_ELEVATION_RANGE };
    // Rounded to the metre because the column is metres — that is not an
    // invention. Out of range is REFUSED rather than clamped: see
    // `PUBLISH_ELEVATION_RANGE`.
    const metres = Math.round(input.elevationM);
    if (metres < MIN_ELEVATION_M || metres > MAX_ELEVATION_M) {
      return { ok: false, message: PUBLISH_ELEVATION_RANGE };
    }
    elevationM = metres;
  }

  const route = input.route?.trim() ?? "";
  if (route.length > MAX_ROUTE) return { ok: false, message: PUBLISH_ROUTE_TOO_LONG };

  const conditions = input.conditions?.trim() ?? "";
  if (conditions.length > MAX_CONDITIONS) return { ok: false, message: PUBLISH_CONDITIONS_TOO_LONG };

  return {
    ok: true,
    value: {
      body,
      peakName,
      destinationId: input.destinationId?.trim() || null,
      elevationM,
      summitedOn,
      // Empty optional text is sent as NULL rather than as "". The column is
      // nullable precisely so that "they did not say" and "they said nothing"
      // are the same thing, and an empty string renders as a present-but-blank
      // field on a card.
      route: route.length > 0 ? route : null,
      conditions: conditions.length > 0 ? conditions : null,
    },
  };
}

/**
 * The photograph, into the private post-media bucket.
 *
 * The owner's id is the first path segment, mirroring the storage policy:
 * `(storage.foldername(name))[1] = auth.uid()::text` is the only thing standing
 * between accounts in that bucket, so whoever owns the object has to be the
 * first segment.
 *
 * It refuses video before touching the network. The insert policy from
 * 20260902200000 allows `video/%` only for identity-verified accounts, and this
 * module does not read identity — so an upload would fail at the bucket with a
 * storage error where a sentence belongs.
 */
async function uploadPhoto(
  client: SupabaseClient,
  uid: string,
  file: File,
): Promise<{ ok: true; path: string; meta: Record<string, unknown> } | { ok: false; message: string }> {
  if (!file.type.startsWith("image/")) return { ok: false, message: PUBLISH_PHOTO_ONLY };

  /*
   * The extension is taken from the file name and then DISTRUSTED.
   *
   * A phone's camera roll gives "IMG_4021.HEIC", but a file picked from a
   * download folder can carry anything — no dot at all, a query string, spaces,
   * a name in a script storage will not accept in a key. The name is never
   * shown to anybody (the object is `uid/uuid.ext`), so the only job the
   * extension has is not to break the upload; anything that is not a short
   * plain-alphanumeric suffix falls back to the mime type's own, and then to
   * `bin`. The object's real type travels in `contentType` regardless.
   */
  const suffix = file.name.split(".").pop()?.toLowerCase() ?? "";
  const fromMime = file.type.slice("image/".length).toLowerCase();
  const ext = /^[a-z0-9]{1,5}$/.test(suffix)
    ? suffix
    : /^[a-z0-9]{1,5}$/.test(fromMime)
      ? fromMime
      : "bin";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await client.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) return { ok: false, message: PUBLISH_PHOTO_FAILED };

  return {
    ok: true,
    path,
    // Everything here was MEASURED from the file the person chose. No
    // dimensions and no duration: this module does not decode media, so it does
    // not describe what it has not read. `Composer.tsx` writes the same shape,
    // and the cards read `kind` off it.
    meta: { kind: "image", mime: file.type, bytes: file.size },
  };
}

/**
 * Publish a summit: a post, and the claim attached to it.
 *
 * ── TWO INSERTS, AND WHY THE ORDER IS FORCED ─────────────────────────────────
 *
 * `summit_logs.post_id` is `not null references posts(id)`, so the post must
 * exist before the log can point at it. There is no transaction available: this
 * is PostgREST over HTTP, and the only way to make the pair atomic is a
 * `security definer` function doing both — which is a MIGRATION, and migrations
 * are the owner's to gate. So there is a window, one round trip long, in which
 * the post exists and the claim does not.
 *
 * ── IF THE LOG FAILS, THE POST IS DELETED ────────────────────────────────────
 *
 * This is the part worth being deliberate about. A post with no summit log
 * renders as AN ORDINARY POST CLAIMING NOTHING — the climber's words, with the
 * peak, the height and the date silently gone, sitting on the feed looking
 * finished. That is worse than nothing at all: nothing at all is a failure the
 * person can see and retry, while a half-published summit is a post they
 * believe carries a claim it does not, on a mountain other people may be
 * planning around. And it cannot be repaired in place, because `summit_logs`
 * has no update path and `posts` has no edit.
 *
 * So the post is deleted and the whole publish is reported as failed. If the
 * DELETE also fails, the failure carries `strandedPostId` and
 * `PUBLISH_STRANDED_POST`, which is the one case where the person has to be
 * told to go and tidy something up — because the alternative is leaving them
 * with a post they did not knowingly write.
 *
 * The uploaded photograph is removed on the same path, best effort. An orphaned
 * object in a private bucket is invisible to everyone and costs storage; an
 * orphaned post is visible to everyone and costs the truth. They are not
 * treated with the same urgency and the failure of the former is not reported.
 */
export async function publishSummit(input: PublishSummitInput): Promise<PublishSummitResult> {
  // Checked before the client, deliberately: a summit dated next Tuesday is
  // refused in every build, connected or not, and saying so costs no request.
  const checked = check(input);
  if (!checked.ok) return { ok: false, message: checked.message };

  const session = await gate();
  if (!session.ok) {
    // The gate's own copy is written for a READ ("nothing is visible from
    // here"), which is the wrong sentence in front of somebody who just pressed
    // Publish. Every failure here says what happened to their words instead.
    return {
      ok: false,
      message:
        session.reason === "no-backend"
          ? PUBLISH_NO_BACKEND
          : session.reason === "signed-out"
            ? PUBLISH_SIGNED_OUT
            : PUBLISH_UNREACHABLE,
    };
  }
  const { uid, client } = session;
  const value = checked.value;

  let media: { path: string; meta: Record<string, unknown> } | null = null;
  if (input.file) {
    const uploaded = await uploadPhoto(client, uid, input.file);
    // Media that cannot be stored stops the whole publish rather than being
    // silently dropped from it — the same rule `Composer.tsx` states. A summit
    // log that quietly lost its photograph is a post the person did not write.
    if (!uploaded.ok) return { ok: false, message: uploaded.message };
    media = { path: uploaded.path, meta: uploaded.meta };
  }

  /*
   * `.select("id")` is not decoration: the returned id is the only evidence the
   * row exists, and it is what the second insert points at. A screen that says
   * "published" on the strength of a missing error is claiming a delivery it
   * did not witness.
   *
   * `expires_at` is left null on purpose. A story is a post with an expiry, and
   * a summit log that disappears in 24 hours would take its claim — and the
   * profile's count of it — with it. A summit is not a story.
   */
  const { data: postRow, error: postError } = await client
    .from("posts")
    .insert({
      author_id: uid,
      // The phone app posts as a person. Speaking for a company needs an active
      // membership the policy checks, and a summit is climbed by a human being.
      author_kind: "profile",
      body: value.body,
      expires_at: null,
      media_path: media?.path ?? null,
      media_meta: media?.meta ?? null,
    })
    .select("id")
    .single();

  const postId = (postRow as { id?: unknown } | null)?.id;
  if (postError || typeof postId !== "string") {
    // Nothing reached the server but the photograph, if there was one. Take it
    // back out; there is no post for it to belong to.
    await discardPhoto(client, media?.path);
    return { ok: false, message: writeFailure(postError) };
  }

  const { data: logRow, error: logError } = await client
    .from("summit_logs")
    .insert({
      post_id: postId,
      // Sent because the INSERT needs a value; the policy then requires it to
      // equal `auth.uid()` and the `summit_log_author_matches_post` trigger
      // requires it to equal the post's author — so a client that sent somebody
      // else's is refused rather than believed.
      author_id: uid,
      destination_id: value.destinationId,
      peak_name: value.peakName,
      elevation_m: value.elevationM,
      summited_on: value.summitedOn,
      route: value.route,
      conditions: value.conditions,
    })
    .select(SUMMIT_COLUMNS)
    .single();

  const summit = logRow ? toSummit(logRow as Record<string, unknown>) : null;

  if (logError || !summit) {
    /*
     * THE ROLLBACK. See the header above: a post with no log claims nothing and
     * cannot be repaired, so it must not be left behind.
     *
     * It runs for an unreadable echo (`!summit`) as well as for a real error,
     * and that is deliberate even though the row may genuinely have inserted.
     * A claim ICEFALL cannot read back is a claim it cannot show — and leaving
     * it up while telling the climber the publish failed is how one ascent
     * becomes two summit logs on a profile. The table's own constraints make
     * this near-impossible (`peak_name` and `summited_on` are NOT NULL), which
     * is why the destructive branch is the safe one.
     *
     * `.select("id")` ON THE DELETE IS THE WHOLE POINT OF THIS BLOCK. PostgREST
     * returns success with ZERO ROWS when row-level security silently declines
     * a delete — an expired session is enough — so a missing error is not
     * evidence the post went away. Without the echo this would report "nothing
     * was stored" over a post that is live on the feed, which is the one
     * outcome the rollback exists to prevent.
     */
    const { data: undone, error: undoError } = await client
      .from("posts")
      .delete()
      .eq("id", postId)
      .select("id");
    await discardPhoto(client, media?.path);

    const removed = Array.isArray(undone) && undone.length > 0;
    if (undoError || !removed) {
      return {
        ok: false,
        message: PUBLISH_STRANDED_POST,
        strandedPostId: postId,
      };
    }
    return { ok: false, message: writeFailure(logError) };
  }

  changed();
  return { ok: true, postId, summit };
}

/**
 * Removes an uploaded object after the publish it belonged to failed.
 *
 * BEST EFFORT, AND SILENT ON PURPOSE. Reporting a failed cleanup would replace
 * the message that explains what actually went wrong with one about storage
 * housekeeping, and there is nothing the climber could do about it either way.
 * An orphan in a private bucket is invisible; an orphan post is not, which is
 * why only the post's failed deletion is escalated.
 */
async function discardPhoto(client: SupabaseClient, path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await client.storage.from(POST_MEDIA_BUCKET).remove([path]);
  } catch {
    /* Nothing useful to do, and nothing the person needs to know. */
  }
}

/* ========================================================================== */
/* A write in one place has to be visible in another                           */
/* ========================================================================== */

/**
 * NO POLLING AND NO REALTIME SUBSCRIPTION — the posture `highlights.ts` and
 * `interest.ts` both take. A summit log appears because somebody just published
 * one, so the hooks re-read on mount and after every write this module makes,
 * and no socket is held open on a phone that may be on a mountain.
 */
let revision = 0;
const listeners = new Set<() => void>();

function changed() {
  revision += 1;
  listeners.forEach((l) => l());
}

function useRevision(): number {
  const [value, setValue] = useState(revision);
  useEffect(() => {
    const listener = () => setValue(revision);
    listeners.add(listener);
    // A write between the render and this effect would otherwise be missed.
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

/* ========================================================================== */
/* Reading                                                                     */
/* ========================================================================== */

/**
 * The summit log attached to one post, for the feed card.
 *
 * `null` WITH `state: "ready"` IS THE COMMON ANSWER AND IS NOT A FAILURE: most
 * posts are not summit logs, and `post_id` is UNIQUE so a post has at most one.
 * The card renders the post as an ordinary post — it must not draw an empty
 * summit frame, which would tell the reader a claim exists and is merely
 * missing.
 *
 * A CARD BUILT ON THIS MUST NEVER DRAW A TICK. There is no `verified` column to
 * read and no way to earn one; `SUMMITS_SELF_REPORTED` is the line that belongs
 * under it instead.
 */
export function useSummitLog(postId: string | null | undefined): SummitLogResult {
  const [result, setResult] = useState<SummitLogResult>({ summit: null, state: "loading" });

  useEffect(() => {
    let alive = true;
    setResult({ summit: null, state: "loading" });

    // No post yet — the card has not resolved one. Nothing is asked, and the
    // state stays on `loading` rather than reporting "not a summit" about a
    // post nobody has named.
    if (!postId) return;

    const controller = new AbortController();

    void (async () => {
      const session = await gate();
      if (!alive || controller.signal.aborted) return;
      if (!session.ok) {
        setResult({ summit: null, state: session.state, message: session.message });
        return;
      }

      const deadline = withTimeout(SUMMITS_TIMEOUT_MS, controller.signal);
      const query = session.client
        .from("summit_logs")
        .select(SUMMIT_COLUMNS)
        .eq("post_id", postId);

      // `.abortSignal()` MUST COME BEFORE `.maybeSingle()`. It is declared on
      // PostgrestTransformBuilder and returns `this`; `maybeSingle()` returns a
      // PostgrestBuilder, which has no `abortSignal` — so the other order is a
      // compile error rather than a silent loss of the deadline.
      const { data, error } = await (deadline ? query.abortSignal(deadline) : query).maybeSingle();

      if (!alive || controller.signal.aborted) return;
      if (error) {
        const failure = readFailure(error);
        setResult({ summit: null, state: failure.state, message: failure.message });
        return;
      }

      // The server answered and there is no log. A REAL ANSWER: this is an
      // ordinary post.
      if (!data) {
        setResult({ summit: null, state: "ready" });
        return;
      }

      const summit = toSummit(data as Record<string, unknown>);
      // A row that came back unreadable is not "no summit". Something is there
      // and ICEFALL could not make sense of it, which is a fault at ICEFALL's
      // end rather than a fact about the post.
      if (!summit) {
        setResult({ summit: null, state: "unreachable", message: SUMMITS_READ_REFUSED });
        return;
      }
      setResult({ summit, state: "ready" });
    })();

    return () => {
      alive = false;
      controller.abort();
    };
    /*
     * DELIBERATELY NOT SUBSCRIBED TO `useRevision`, unlike the two hooks below.
     *
     * A summit log cannot change once it is published — there is no UPDATE
     * policy — and the only way to remove one is to delete its post, which
     * takes this card off the screen with it. So a broadcast could never bring
     * this hook news. Subscribing anyway would re-read the log for EVERY post
     * on the feed each time anybody published anything: a dozen queries and a
     * dozen session checks to learn nothing.
     */
  }, [postId]);

  return result;
}

/**
 * One climber's published summit logs, newest ascent first.
 *
 * ORDERED BY `summited_on`, NOT BY `created_at`, because the list is a climbing
 * history and not a posting history — somebody writing up three ascents from
 * last spring in one evening should see them in the order they happened.
 * `created_at` is the tie-break so that two summits on one day have a stable
 * order rather than a different one on every read.
 *
 * An empty list with `state: "ready"` is a REAL empty and may be said plainly:
 * this climber has published no summits. Every other state means ICEFALL did
 * not find out, and `message` is the sentence for it.
 */
export function useSummitLogs(profileId: string | null | undefined): SummitLogsResult {
  const nonce = useRevision();
  const [result, setResult] = useState<SummitLogsResult>({
    summits: [],
    truncated: false,
    state: "loading",
  });

  useEffect(() => {
    let alive = true;
    setResult({ summits: [], truncated: false, state: "loading" });

    if (!profileId) return;

    const controller = new AbortController();

    void (async () => {
      const session = await gate();
      if (!alive || controller.signal.aborted) return;
      if (!session.ok) {
        setResult({
          summits: [],
          truncated: false,
          state: session.state,
          message: session.message,
        });
        return;
      }

      const deadline = withTimeout(SUMMITS_TIMEOUT_MS, controller.signal);
      const query = session.client
        .from("summit_logs")
        .select(SUMMIT_COLUMNS)
        .eq("author_id", profileId)
        .order("summited_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(SUMMITS_LIMIT);

      const { data, error } = await (deadline ? query.abortSignal(deadline) : query);

      if (!alive || controller.signal.aborted) return;
      if (error) {
        const failure = readFailure(error);
        setResult({ summits: [], truncated: false, state: failure.state, message: failure.message });
        return;
      }

      // Double cast: supabase-js parses the select string at the type level and
      // an untyped client cannot resolve it, so it falls back to a shape that is
      // not comparable in one step. The honest admission that these rows are
      // unchecked — which is why `toSummit` checks every field.
      const raw = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
      const summits: PublishedSummit[] = [];
      for (const row of raw) {
        const summit = toSummit(row);
        if (summit) summits.push(summit);
      }

      setResult({
        summits,
        // Measured on the RAW length, not on the checked one: a dropped
        // unreadable row does not mean the server had fewer to give.
        truncated: raw.length >= SUMMITS_LIMIT,
        state: "ready",
      });
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [profileId, nonce]);

  return result;
}

/* -------------------------------------------------------------------------- */
/* Stats                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * `summit_count(profiles)` and `highest_summit_m(profiles)` — the two computed
 * fields the migration added so a profile can show a total without the reader
 * running a query over somebody else's climbs.
 *
 * THEY GO OUT IN THEIR OWN REQUEST AND IT IS ALLOWED TO FAIL. A PostgREST
 * computed field is a function of the row, so naming one the server does not
 * have is not a partially-satisfied request: Postgres raises and NOTHING comes
 * back. Appending them to the `summit_logs` read would mean that until the
 * migration is pushed, a profile lost its whole summit list in the course of
 * failing to deliver a number. `publicProfile.ts` documents the same trade at
 * length and pays for it with a stat row that is merely blank.
 *
 * `null` for either means NOBODY ASKED SUCCESSFULLY — never "none".
 */
const TOTALS_SELECT = "id, summit_count, highest_summit_m";

interface SummitTotals {
  count: number | null;
  highestM: number | null;
}

const TOTALS_UNKNOWN: SummitTotals = { count: null, highestM: null };

/**
 * THE ONLY FUNCTION HERE ALLOWED TO FAIL SILENTLY.
 *
 * It resolves to `TOTALS_UNKNOWN` for every failure — a missing migration, a
 * refusal, a dead network — because a count that could not be read is an em
 * dash, while a list that could not be read is a profile with no climbing on
 * it. Those are not the same severity and must not share a fate, which is why
 * this runs BESIDE the rows read rather than before it, and why it never
 * rejects: a rejection would take the `Promise.all` and the rows with it.
 */
async function fetchTotals(
  client: SupabaseClient,
  profileId: string,
  deadline: AbortSignal | undefined,
): Promise<SummitTotals> {
  try {
    const query = client.from("profiles").select(TOTALS_SELECT).eq("id", profileId);
    const { data, error } = await (deadline ? query.abortSignal(deadline) : query).maybeSingle();
    if (error || !data) return TOTALS_UNKNOWN;

    const row = data as Record<string, unknown>;
    return {
      // A count is a count: anything that is not a finite, non-negative number
      // was not measured, and `null` says so rather than rounding a surprise
      // into a total somebody reads as a climbing record.
      count:
        typeof row.summit_count === "number" &&
        Number.isFinite(row.summit_count) &&
        row.summit_count >= 0
          ? Math.round(row.summit_count)
          : null,
      highestM: metresOf(row.highest_summit_m),
    };
  } catch {
    // postgrest-js reports through `error` rather than rejecting, so this is
    // belt and braces — but an unhandled rejection here would take the rows
    // down, which is the one outcome this function exists to prevent.
    return TOTALS_UNKNOWN;
  }
}

/**
 * The highest published elevation per year, oldest year first.
 *
 * A YEAR WITH NO PUBLISHED ELEVATION IS ABSENT FROM THE SERIES. Logs without a
 * height are common and legitimate — the column is nullable so that nobody has
 * to guess one — and a year whose only summits were logged without heights has
 * no measured highest, so it is left out rather than plotted at 0. A chart must
 * draw nothing for an empty series: an axis with a flat line along zero is a
 * picture of a climber who reached sea level five years running.
 *
 * The year comes from the first four characters of the DATE STRING, never from
 * `new Date(...).getFullYear()`, which would parse UTC midnight and put a
 * 1 January summit into the previous year for every climber west of Greenwich.
 */
function yearsOf(rows: { summitedOn: string; elevationM: number | null }[]): SummitYear[] {
  const highest = new Map<number, number>();
  for (const row of rows) {
    if (row.elevationM === null) continue;
    const year = Number(row.summitedOn.slice(0, 4));
    if (!Number.isFinite(year)) continue;
    const current = highest.get(year);
    if (current === undefined || row.elevationM > current) highest.set(year, row.elevationM);
  }
  return [...highest.entries()]
    .map(([year, highestM]) => ({ year, highestM }))
    .sort((a, b) => a.year - b.year);
}

/**
 * One climber's summit figures — the profile stat row and the achievements
 * chart, from one read.
 *
 * ── WHERE EACH NUMBER COMES FROM ─────────────────────────────────────────────
 *
 * `byYear` can only come from the rows, so the rows are fetched regardless.
 * `count` and `highestM` come from the server's own aggregates when they are
 * available, because `summit_count_of` counts EVERY log the person has
 * published while this read sees only the ones whose posts the reader may
 * currently read — and the label says "published".
 *
 * When the aggregates are not available (the ordinary case until the migration
 * is pushed, at which point the rows are unavailable too) they are derived from
 * the rows instead, BUT ONLY IF THE READ WAS NOT TRUNCATED. A count taken from
 * a capped list is a floor wearing a total's clothes, and a maximum taken from
 * the most recent 500 of more is not the highest — so both fall to `null`,
 * which renders an em dash and claims nothing.
 *
 * ── WHAT THE NUMBERS MEAN ────────────────────────────────────────────────────
 *
 * `count` is HOW MANY THEY PUBLISHED (`SUMMIT_COUNT_LABEL`), never how many
 * they climbed. `0` is a measured zero and renders `0`; `null` renders an em
 * dash. `highestM` is `null` when nothing published carries an elevation, which
 * is a different thing from a low summit and must never be shown as `0`.
 */
export function useSummitStats(profileId: string | null | undefined): SummitStatsResult {
  const nonce = useRevision();
  const [result, setResult] = useState<SummitStatsResult>({
    count: null,
    highestM: null,
    byYear: [],
    state: "loading",
  });

  useEffect(() => {
    let alive = true;
    setResult({ count: null, highestM: null, byYear: [], state: "loading" });

    if (!profileId) return;

    const controller = new AbortController();

    void (async () => {
      const session = await gate();
      if (!alive || controller.signal.aborted) return;
      if (!session.ok) {
        setResult({
          count: null,
          highestM: null,
          byYear: [],
          state: session.state,
          message: session.message,
        });
        return;
      }

      const deadline = withTimeout(SUMMITS_TIMEOUT_MS, controller.signal);
      const rowsQuery = session.client
        .from("summit_logs")
        .select(STATS_COLUMNS)
        .eq("author_id", profileId)
        .order("summited_on", { ascending: false })
        .limit(STATS_LIMIT);

      /*
       * TWO REQUESTS, SIDE BY SIDE, AND ONLY ONE OF THEM MAY EMPTY THE CHART.
       *
       * The totals are computed fields on a migration that is not pushed, and a
       * computed field the server does not have fails the whole select — so
       * they are structurally separate rather than protected by error handling
       * somebody has to keep correct, and parallel rather than sequential
       * because neither needs the other's answer. `fetchTotals` resolves for
       * every failure and never rejects, which is what makes `Promise.all` safe.
       */
      const [rowsResult, totals] = await Promise.all([
        deadline ? rowsQuery.abortSignal(deadline) : rowsQuery,
        fetchTotals(session.client, profileId, deadline),
      ]);

      if (!alive || controller.signal.aborted) return;

      if (rowsResult.error) {
        const failure = readFailure(rowsResult.error);
        setResult({
          count: null,
          highestM: null,
          byYear: [],
          state: failure.state,
          message: failure.message,
        });
        return;
      }

      const raw = Array.isArray(rowsResult.data)
        ? (rowsResult.data as unknown as Record<string, unknown>[])
        : [];

      const rows: { summitedOn: string; elevationM: number | null }[] = [];
      for (const row of raw) {
        const summitedOn = typeof row.summited_on === "string" ? row.summited_on.slice(0, 10) : "";
        // A row whose date cannot be read cannot be placed in a year, and a
        // guessed year is an invented one. It is dropped from the series, which
        // is also why `count` prefers the server's aggregate.
        if (!ISO_DAY.test(summitedOn)) continue;
        rows.push({ summitedOn, elevationM: metresOf(row.elevation_m) });
      }

      const truncated = raw.length >= STATS_LIMIT;
      const measured = rows.map((r) => r.elevationM).filter((m): m is number => m !== null);

      setResult({
        count: totals.count ?? (truncated ? null : rows.length),
        highestM:
          totals.highestM ?? (truncated || measured.length === 0 ? null : Math.max(...measured)),
        // The series is drawn from what was read either way. Truncated, it is
        // the most recent 500 ascents — which is every ascent for every real
        // profile, and the count above is the figure that refuses to guess.
        byYear: yearsOf(rows),
        state: "ready",
      });
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [profileId, nonce]);

  return result;
}
