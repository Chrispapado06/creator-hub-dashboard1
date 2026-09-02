/**
 * PROMOTIONS — the read that finally asks the ad table, and the disclosure that
 * travels with every row it returns.
 *
 * ── WHAT WAS MISSING ─────────────────────────────────────────────────────────
 *
 * `public.promoted_placements` has been live since 20260831190000 and no line of
 * this app has ever read it. `StoryRail.tsx` says so in its own words — "this
 * app has no read of `promoted_placements` … so a promotion cannot appear" —
 * and fills the gap with one gated demo row. This module is the read. Nothing
 * else about the arrangement changes: the schema still decides what a climber
 * may see, and this file still decides nothing about that.
 *
 * ── THE SERVER IS THE BOUNDARY, AND THIS FILE IS NOT ─────────────────────────
 *
 * `promoted_select` is
 *
 *     using ( (status = 'active' and current_date between starts_on and ends_on)
 *             or is_company_member(company_id) or is_staff() )
 *
 * so ACTIVE-AND-IN-DATE IS ENFORCED BY POSTGRES. A climber with a patched
 * client cannot read a draft campaign or an expired one; there is nothing here
 * to defeat, because the check is not here. Read `isLive` before adding any
 * condition to this module: the one date test below exists for a completely
 * different reason and it is written where it cannot be mistaken for a guard.
 *
 * ── WHY AN AD ROW COULD NOT BE DRAWN, AND WHAT FIXED IT ──────────────────────
 *
 * An ad row had no words of its own. It got them by pointing at a company, a
 * post or a product — and the pointer path is a dead end from a phone, which is
 * not a row-count problem and does not go away when the tables fill:
 *
 *     companies_select  using (is_staff() or is_company_member(id))
 *
 * A CLIMBER CANNOT READ `companies` AT ALL. So the advertiser's name — the
 * single fact a promoted card is legally obliged to carry — can never be
 * resolved by a join from this app. 20260903000000 moves the name onto the
 * placement (`creative_company_name` and four siblings), which is what makes a
 * self-contained card possible.
 *
 * THAT MIGRATION IS NOT PUSHED. Every field it adds may be absent right now, so
 * this module is built to work before and after `supabase db push` with no code
 * change — see THE SPLIT below, which is the whole shape of the fetch.
 *
 * ── THE SPLIT: TWO REQUESTS, AND ONLY ONE OF THEM IS ALLOWED TO FAIL ─────────
 *
 * `publicProfile.ts` established the pattern and states the failure it prevents:
 * a PostgREST select naming a field the server does not have does not come back
 * partially satisfied — Postgres raises (42703 for a column, 42883 for a
 * missing function behind a computed field) and NOTHING comes back. One absent
 * field costs every field beside it.
 *
 * So the read is two requests over the same rows, joined by id afterwards:
 *
 *   BASE      `id, company_id, post_id, product_id, audience_mode,
 *              declared_goals, countries, creative_path, starts_on, ends_on,
 *              status` — every one of these is deployed today. This request is
 *              not allowed to fail quietly and it is the one that answers the
 *              only question the app can answer before the push.
 *   CREATIVE   the five `creative_*` fields and `surfaces`. Expected to fail
 *              until 20260903000000 lands. Failing costs the WORDS, never the
 *              ANSWER.
 *
 * THE SPLIT IS ALSO WHAT MAKES A MEASURED ZERO REACHABLE TODAY, and that is the
 * reason it is worth two round trips rather than a single ladder. With the
 * table live and empty, the base request comes back with zero rows and this
 * module can say, truthfully, NO PROMOTIONS ARE RUNNING — a fact, measured,
 * from a server that answered. A single combined select would have failed on
 * the missing creative columns and the only honest thing left to say would have
 * been "ICEFALL could not find out", which is a different sentence about a
 * different thing. `state: "none"` and `state: "not-provisioned"` are one line
 * apart in a renderer and opposite claims about the business.
 *
 * ── EVERY STATE DRAWS NOTHING EXCEPT ONE ─────────────────────────────────────
 *
 * READ THIS BEFORE WRITING THE COMPONENT. Unlike `publicProfile.ts`, whose
 * messages are written FOR the reader, NONE of the copy in this file is for a
 * climber. A promotion that could not be loaded must leave no trace on the
 * screen: no skeleton, no empty rectangle, no "couldn't load this", no reserved
 * height that collapses a beat later. An advertisement is the one thing on the
 * page nobody came for, and a failure to deliver one is not news.
 *
 * `state: "ready"` draws the card. EVERY OTHER STATE DRAWS NOTHING. The
 * messages exist so that a developer, a test or a log can tell the eight
 * silences apart — because "nobody is advertising" and "we could not ask" must
 * never be the same fact, even when they look identical to the reader.
 *
 * ── DISCLOSURE ───────────────────────────────────────────────────────────────
 *
 * If money changed hands the card says Promoted. UK/EU law, not a house style.
 * `StoryRail.tsx` makes it structural in the only place it can be made
 * structural — "StoryViewer cannot draw one of these without drawing the word
 * Promoted, because the branch that draws it is the branch that draws the
 * label" — and `toStoryPlacement` below feeds exactly that branch, so the story
 * surface inherits the property intact.
 *
 * WHAT THIS MODULE CAN AND CANNOT GUARANTEE, said plainly rather than implied. A
 * data layer cannot make a component render a word. What it can do, and does:
 *
 *   · `disclosure` is a REQUIRED field with a single literal type. There is no
 *     shape in this file that carries a headline without carrying the label,
 *     and no constructor here that can produce one.
 *   · `PromotedSlot` is the arm a mixed list takes, so a promotion cannot be
 *     pushed in among somebody's posts without naming what it is — the shape
 *     `StoryRail.tsx` already uses, for the reason it already gives.
 *   · A card with no advertiser name IS NOT RETURNED AT ALL — see
 *     `toCreative`. "Promoted" without a "by whom" is not a disclosure.
 *
 * The last mile belongs to the component, and the Home card must reproduce
 * StoryViewer's arrangement: the branch that draws the headline is the branch
 * that draws the label. Do not put an `if` around the label.
 *
 * ── NOTHING IS INVENTED, AND NO REAL BUSINESS IS RENDERED AS PROMOTED ────────
 *
 * There is no demo branch here and there must never be one. `StoryRail.tsx` may
 * carry a gated demo promotion because it is showing a DESIGN; this module is
 * the claim that somebody paid, and an invented advertiser is a lie about
 * commerce rather than a placeholder.
 *
 * Elite Exped, 14 Peaks and 8K Expeditions are real businesses named in ICEFALL
 * on checkable facts alone. Two things keep them off a promoted card and both
 * are structural rather than a list of names to remember:
 *
 *   1. THE ONLY SOURCE OF AN ADVERTISER'S NAME IS `creative_company_name` ON
 *      THE ROW. `services/operators.ts` is a local file with its own ids and it
 *      is never consulted here — its header is explicit that "ICEFALL has no
 *      operator partnerships of either kind, vets nobody" — so there is no path
 *      by which a directory entry becomes an advertisement.
 *   2. `promoted_real_business_deal` (20260903000000) refuses to let a
 *      placement for a company marked `real_business` go active without a
 *      recorded deal, and that trigger ships in the same migration as the
 *      column this module needs to draw anything at all. So there is no window
 *      in which a card is renderable and the guard is absent. That is worth
 *      knowing precisely because the client CANNOT check it: `companies` is
 *      unreadable from here, so a client-side version of this rule would be a
 *      guard that fails open, which is not a guard.
 *
 * ── WHAT IS DELIBERATELY NOT FETCHED ─────────────────────────────────────────
 *
 * Row-level security is not column-level security: every column on a visible
 * placement is readable by the reader. THE SELECT LIST IS THE GUARANTEE, the
 * same doctrine `publicProfile.ts` applies to `role` and `suspended_reason`.
 *
 *   · `daily_budget_cents` — what the advertiser spends. Not the reader's
 *     business, and one screenshot away from being a competitor's.
 *   · `deal_reference`, `deal_confirmed_by`, `deal_confirmed_at` — ICEFALL's
 *     commercial paperwork and the name of a colleague.
 *   · `created_by` — which person at the company built the campaign.
 *   · `viewer_count` / `dismissal_count` — the aggregates exist for the buyer,
 *     on the company's own surfaces. Nothing in the phone app asks how many
 *     people saw an ad, and NOTHING ANYWHERE ASKS WHO: a count is not a list.
 *
 * And a vocabulary rule that outlives this file: nothing built on it may label
 * a figure an IMPRESSION, a REACH or a DELIVERY. ICEFALL cannot see a screen.
 * It can see that a client asked to record a view, and "view" is the only word
 * that describes what was actually measured. ("Delivery" appears below as a
 * plain English verb for choosing who is shown a campaign — never as the name
 * of a number.)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/backend/client";
import { classifyBackendError } from "@/backend/pgErrors";
import { withTimeout } from "@/lib/netTimeout";
import type { TierId } from "@/growth/tiers";
import { useApp, type SavedObjective } from "@/state/AppState";
/*
 * TYPE ONLY, AND THAT IS LOAD-BEARING.
 *
 * `StoryRail.tsx` imports from `@/social/*`; a VALUE import back the other way
 * would close a runtime cycle. `import type` is erased entirely, so this is a
 * compile-time agreement and nothing more.
 *
 * The direction is an inversion — `src/social/` owns shapes and a component
 * file should not — and it is deliberate and temporary. StoryRail's own header
 * says the assembly "moves to `src/social/stories.ts`" when a fetch exists;
 * this is the fetch, and the move is the next session's, not this one's. Until
 * then, importing THEIR declaration rather than restating it is what keeps the
 * two from drifting: if `PromotedPlacement` grows a field, `toStoryPlacement`
 * stops compiling instead of quietly handing over a slide with a hole in it.
 */
import type { PromotedPlacement as StoryPromotedPlacement } from "@/components/social/StoryRail";

/**
 * The typed client does not know about this table.
 *
 * `backend/types.ts` describes the tables the app already reads and
 * `promoted_placements` is not among them — nor are `promoted_placement_views`
 * or `promoted_dismissals`, which do not exist on the server yet. Rather than
 * edit a hand-written schema file this module does not own, the reads go
 * through an untyped view of the same client, exactly as `highlights.ts`,
 * `groupSpace.ts`, `publicProfile.ts` and `network/interest.ts` all do.
 *
 * The cost is that every field arrives as `unknown` and has to be re-checked on
 * the way in. `toCreative` does that, and it would have to anyway: a
 * hand-written schema file can drift, and the failure here is not a wrong type
 * but an advertisement with `undefined` where the advertiser's name goes.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/* -------------------------------------------------------------------------- */
/* Copy — none of it for a climber. See the header.                            */
/* -------------------------------------------------------------------------- */

/**
 * The disclosure. One word, one place, one literal type.
 *
 * Exported so that the Home card, the story viewer and any future surface draw
 * the SAME word — a card labelled "Sponsored" beside one labelled "Promoted"
 * invites the reader to think the two mean different things.
 */
export const PROMOTED_LABEL = "Promoted";

/** No client in this build. DEMO and offline builds never construct one. */
export const PROMOTED_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so it did not ask whether anything is being promoted. Nothing is drawn and nothing has been invented to fill the space.";

/**
 * Signed out. NOT "nothing is running" — the grants are `to authenticated`, so
 * an anonymous request is refused rather than answered, and nobody has been
 * asked anything.
 */
export const PROMOTED_SIGNED_OUT =
  "Promotions are a signed-in surface, so ICEFALL did not ask. This is not “nothing is running”: nothing was visible from here to run.";

/** The request went out and did not come back. Never dressed as an answer. */
export const PROMOTED_UNREACHABLE =
  "ICEFALL could not reach the server, so it does not know whether anything is being promoted. That is different from nothing running.";

/**
 * 42501 or PGRST301.
 *
 * `backend/pgErrors.ts` exists because six modules read this code as "the
 * feature is not deployed" and it never means that. Every grant in this schema
 * is `to authenticated`, so a lapsed JWT is served as `anon` and gets 42501
 * from a perfectly healthy server.
 */
export const PROMOTED_READ_REFUSED =
  "ICEFALL's server refused that read. Most often that is a session that has lapsed rather than anything about the campaigns themselves — it is a non-answer either way.";

/** The server answered with something this module did not anticipate. */
export const PROMOTED_NO_USABLE_ANSWER =
  "ICEFALL's server answered in a way this build did not understand, so nothing is known about what is running.";

/**
 * `promoted_placements` itself is absent. Should be unreachable — the table has
 * been live since 20260831190000 — so seeing this means the schema cache is
 * behind, or the app is pointed at a database that never ran the migrations.
 */
export const PROMOTED_TABLE_NOT_PROVISIONED =
  "ICEFALL's server has no promotions table, so there was nothing to ask. This is a fact about the deployment, not about whether anybody is advertising.";

/**
 * THE ORDINARY STATE UNTIL 20260903000000 IS PUSHED, and the one worth reading
 * twice.
 *
 * The table answered and it holds campaigns. What it does not hold is the
 * columns a campaign needs to say anything: `creative_company_name`,
 * `creative_headline`, `creative_cta_label`, `creative_cta_href`. Drawing a
 * card here would be drawing an empty rectangle with the word Promoted on it.
 */
export const PROMOTED_WORDS_NOT_PROVISIONED =
  "Campaigns are running, but ICEFALL's server does not yet hold the words a campaign carries — 20260903000000 is written and not pushed. Nothing is drawn rather than a blank card with a label on it.";

/**
 * A MEASURED ZERO. The server was asked, it answered, and the answer is that
 * nobody is advertising.
 *
 * This app's whole doctrine turns on the difference between this and
 * `PROMOTED_UNREACHABLE`, and this is the only sentence in the file that is a
 * statement about the BUSINESS rather than about the software.
 */
export const PROMOTED_NONE_RUNNING =
  "No promotions are running. ICEFALL asked and the answer was none — a measured zero, not a failure to find out.";

/** Also measured: things are running, none of them bought this surface. */
export const PROMOTED_NONE_ON_SURFACE =
  "Nothing is running on this surface. Campaigns name the surfaces they run on, and none of the live ones names this one.";

/**
 * SUBSCRIBERS SEE NO PROMOTIONS — and read `PROMOTED_SUBSCRIBER_RULE` before
 * calling that a guarantee.
 */
export const PROMOTED_SUBSCRIBER =
  "This account is on a paid plan, so ICEFALL did not ask what is being promoted. No request was made and nothing about this athlete was sent anywhere.";

/**
 * THE HONEST LABEL ON THE SUBSCRIBER RULE. Exported so it cannot be softened in
 * a component's copy while this file quietly knows better.
 *
 * It is a CLIENT-SIDE COURTESY, not a guarantee, and it is weaker than that
 * phrase usually implies. Three separate reasons, none of them a bug to fix:
 *
 *   1. THE SERVER CANNOT ENFORCE IT. 20260903000000 says so in its own opening:
 *      billing state is not in this database, so `promoted_select` has no
 *      column to test. There is nowhere to move this rule to.
 *   2. THE TIER IS A VALUE IN THIS PHONE'S localStorage. `AppState` reads
 *      `subscription.tier` out of the device's own store; anything on the
 *      device can change it, and a modified client can simply not ask.
 *   3. THERE IS NO SUBSCRIPTION. ICEFALL has no payment processor, nobody has
 *      ever been charged, and `startTrial()` grants Pro for fourteen days on
 *      nothing at all — so "paid plan" today means "this device says so".
 *
 * What it DOES buy, which is real and worth keeping: a device that believes it
 * is on a paid plan makes no request to the ad table at all, so no promotion is
 * fetched, none is counted, and nothing about that athlete's objectives leaves
 * the phone in order to select one. The courtesy is honoured where it can be
 * honoured. It is simply not a wall, and no surface may describe it as one.
 */
export const PROMOTED_SUBSCRIBER_RULE =
  "“Subscribers see no promotions” is enforced by this app, not by ICEFALL's server: billing state is not in the database, so there is no policy that could refuse the row. Today it rests on a tier held in this phone's own storage, for a subscription nobody has ever been charged for.";

/** Everything running here has been closed by this person. */
export const PROMOTED_ALL_DISMISSED =
  "Every promotion running on this surface has been closed by this account. Closing one is permanent — it does not come back tomorrow.";

/**
 * A targeted campaign that names goals this athlete has not declared, or a
 * country-scoped one they are not in.
 *
 * Nothing was inferred to reach this. See `matchesGoals` — the match is against
 * objectives the athlete typed into their own app, by exact normalised
 * equality, and nothing else about them is read.
 */
export const PROMOTED_NOT_TARGETED =
  "Nothing running here is aimed at this athlete's declared objectives or country. Nothing was inferred to decide that — only the objectives they chose themselves.";

/**
 * Rows are running on this surface and this app cannot draw them: they carry no
 * creative of their own and point at a post, a product or a company that a
 * climber cannot read.
 *
 * A REAL AND EXPECTED STATE AFTER THE PUSH, not a bug.
 * `promoted_renderable_when_active` lets a placement go live on the strength of
 * a pointer, and the pointer path is the RICHER one the migration expects to
 * become normal — live prices, real departures, the post's own media. It is
 * simply not wired into this app, and until it is, a placement that uses it
 * draws nothing.
 */
export const PROMOTED_UNREADABLE =
  "Campaigns are running on this surface and this build cannot draw them: they carry no words of their own and point at something a climber's app cannot read. Nothing is drawn rather than a card with the advertiser missing.";

/**
 * WHAT A DISMISSAL MEANS. Exported so a component's copy and this module cannot
 * end up promising different things.
 *
 * `UpgradePrompt.tsx:16` forbids "an x that dismisses a thing which then
 * returns tomorrow", so the dismissal has to be durable — and durable means
 * server-side. The honest account of what happens on a NEW DEVICE is in the
 * dismissal store's own note below, and it has two halves because it depends on
 * something not yet pushed.
 */
export const PROMOTED_DISMISS_IS_FOREVER =
  "Closing a promotion closes it for good. It is not hidden until tomorrow and it does not come back when the app is reopened.";

/* -------------------------------------------------------------------------- */
/* Shapes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Where a placement runs — `promoted_placements.surfaces`, exactly.
 *
 * The column defaults to `'{}'`, which means NOWHERE, and the migration is
 * explicit about why: the bug being fixed was one ad appearing on Home, in the
 * story run and in the feed simultaneously, so the replacement default is
 * silence rather than a guess. A row that names no surface is drawn on none of
 * them, here as there.
 */
export type PromotedSurface = "home" | "story" | "feed";

/**
 * One promotion, complete enough to draw without reading anything else.
 *
 * EVERY FIELD IS EITHER ON THE ROW OR ABSENT. Nothing here is resolved from the
 * local operator directory, from a company row, or from anywhere else — see the
 * header. If a required field is missing the card is not returned at all.
 */
export interface PromotedCreative {
  /** `promoted_placements.id`. The key for a view, a dismissal, and nothing else. */
  id: string;
  /**
   * `promoted_placements.company_id`.
   *
   * CARRIED BUT NOT RESOLVABLE. `companies_select` refuses that row to every
   * climber, so this is an opaque key — never a way to look the advertiser up,
   * and never a link. The name is `companyName`, and it came off the placement.
   */
  companyId: string;
  /**
   * THE DISCLOSURE, and it is a required field with one possible value.
   *
   * There is no shape in this module that carries a headline and not this, and
   * no way to build one — which is as close to structural as a data layer can
   * get. The rest is the component's job and the header says what that job is.
   */
  disclosure: typeof PROMOTED_LABEL;
  /**
   * `creative_company_name` — WHO PAID. The card does not exist without it.
   *
   * Not a join to `companies.name`, for the three reasons the migration gives:
   * the join is refused to every climber, a rename would silently rewrite copy
   * nobody re-approved, and a trading name is not the name a campaign was sold
   * under.
   */
  companyName: string;
  /** `creative_headline` — the one line the card leads with. Required. */
  headline: string;
  /** `creative_body` — up to two lines of elaboration, or null. Never required. */
  body: string | null;
  /** `creative_cta_label` — the button's words, in the advertiser's voice. */
  ctaLabel: string;
  /**
   * `creative_cta_href` — an in-app path. Re-checked here as well as in the
   * database: starts with a single "/", no whitespace, at most 300 characters.
   * A promoted card ICEFALL rendered may not send a climber to another host.
   */
  ctaHref: string;
  /**
   * `creative_path` — the image, as a REFERENCE. A storage path or a bundled
   * asset path; this module does not turn it into a URL and does not know which
   * bucket it belongs to. Null is ordinary: a card with no picture is a card
   * with no picture, never a placeholder photograph of a mountain.
   */
  imagePath: string | null;
  /**
   * `audience_mode`. Carried so a surface can say how this athlete came to see
   * it — the story viewer already does — and never so a screen can re-decide
   * it. The delivery rule has already been applied.
   */
  audienceMode: "targeted" | "general";
  /**
   * WHETHER THE READER'S COUNTRY NARROWED WHO SAW THIS.
   *
   * `audienceMode` alone was not enough to disclose honestly, and the card was
   * saying so falsely. `countries` is applied to EVERY campaign, targeted or
   * not — so a `general` placement carrying `countries = {'GB'}` reaches only
   * profiles whose `country_code` is GB, and the card then printed "Nothing
   * about you was used to choose it". Their own declared country was used.
   *
   * A disclosure that is wrong is worse than no disclosure, because it is the
   * one line on the card whose entire job is to be true.
   */
  countryScoped: boolean;
  /**
   * `declared_goals` — the objectives this campaign asked for, as the advertiser
   * typed them. Carried for the same reason as `audienceMode`: it is the
   * evidence behind a delivery, not an input to one.
   */
  declaredGoals: readonly string[];
  /** `countries` — ISO-3166 alpha-2, upper case. Empty means worldwide. */
  countries: readonly string[];
  /** `starts_on` / `ends_on`, bare `YYYY-MM-DD` as the columns hold them. */
  startsOn: string;
  endsOn: string;
}

/**
 * A promotion, wrapped so it cannot enter a mixed list without naming itself.
 *
 * The same arm `StoryRail.tsx` defines for its slide union, and for the reason
 * it gives: "a client that renders it got it from here and knows what it is".
 * A feed that interleaves promotions among posts should hold THIS, not a bare
 * creative, so that no branch can draw one while believing it is drawing
 * somebody's post.
 */
export type PromotedSlot = { kind: "promoted"; placement: PromotedCreative };

/**
 * NINE STATES, BECAUSE THEY ARE NINE DIFFERENT SENTENCES — and eight of them
 * draw exactly the same thing, which is nothing.
 *
 * The five this module was asked to distinguish map on as follows; the extras
 * are splits the app's own doctrine forces.
 *
 *   an ad             → `ready`
 *   no ads running    → `none`      A MEASURED ZERO. The server answered.
 *   not provisioned   → `not-provisioned`
 *   signed out        → `signed-out`
 *   offline           → `unreachable` (the network went quiet) and
 *                       `no-backend` (this build has no client at all — a DEMO
 *                       or offline build never constructs one, so nothing was
 *                       even attempted)
 *
 *   plus `withheld`   — things may well be running; THIS READER is not being
 *                       shown them, for a reason about them rather than about
 *                       the server: a subscriber, a card they closed, a
 *                       targeted campaign not aimed at them. It claims nothing
 *                       about how many campaigns exist.
 *   plus `unreadable` — rows are running here and this build cannot draw them.
 *                       Not a zero, not a failure, and not a deployment gap:
 *                       see `PROMOTED_UNREADABLE`.
 *
 * `none` AND `unreachable` ARE THE PAIR THAT MATTERS. "Nobody is advertising"
 * is a fact about ICEFALL's business; "we could not ask" is a fact about a
 * network. They look identical on screen and they are opposite claims, which is
 * exactly why the fetch is split in two.
 */
export type PromotedState =
  | "loading"
  | "ready"
  | "none"
  | "withheld"
  | "unreadable"
  | "not-provisioned"
  | "signed-out"
  | "no-backend"
  | "unreachable";

export interface PromotedResult {
  /**
   * Everything drawable on this surface, in the order below. Empty for every
   * state except `ready`, and `ready` is never empty.
   */
  placements: readonly PromotedCreative[];
  state: PromotedState;
  /** Why the space is empty. FOR A LOG OR A TEST, never for a climber. */
  message?: string;
}

/** The Home card: one promotion or none, with the x and the view. */
export interface PromotedCardResult {
  /** The card to draw, or null. Null for every state except `ready`. */
  card: PromotedCreative | null;
  state: PromotedState;
  message?: string;
  /**
   * Close this card, for this account, permanently. Safe to call with no card
   * on screen (it does nothing). See `dismissPromotion` for what "permanently"
   * survives, and what it does not survive yet.
   */
  dismiss: () => void;
  /**
   * Record that this client drew the card. Call it when it is actually
   * rendered, not when it is fetched.
   *
   * IT IS NOT AN IMPRESSION AND NOT A DELIVERY. ICEFALL cannot see a screen.
   * The row it writes claims one thing — a client asked to record a view — and
   * the primary key on `(placement_id, profile_id)` is what makes the count
   * distinct PEOPLE rather than a tally that drifts upward on every scroll.
   */
  markShown: () => void;
}

/** The story rail's list, in the shape the rail already declares. */
export interface PromotedStoryResult {
  /** Hand straight to the rail's assembly. Empty except in `ready`. */
  placements: readonly StoryPromotedPlacement[];
  state: PromotedState;
  message?: string;
}

/** The feed's list, plus the slot form for interleaving among posts. */
export interface PromotedFeedResult extends PromotedResult {
  /** The same promotions, each already named as one. See `PromotedSlot`. */
  slots: readonly PromotedSlot[];
  /** Close one. The others on this surface are undisturbed. */
  dismiss: (placementId: string) => void;
  /** Record that this client drew one. Fire and forget; see `recordPromotedView`. */
  markShown: (placementId: string) => void;
}

/**
 * Who this athlete is, as far as delivery is concerned. Two facts, and both of
 * them were volunteered by the person themselves.
 */
export interface PromotedAudience {
  /** From `AppState`. `free` is the only tier that is shown promotions. */
  tier: TierId;
  /**
   * The athlete's own saved objectives, normalised. Typed by them, into their
   * own app. Nothing is inferred from a location, a search, a route they
   * opened, a training history, or anything else they did.
   */
  declaredGoals: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Six seconds, matching `publicProfile.ts`. Nothing in this codebase puts a
 * timeout on supabase-js by default, and `netTimeout.ts` records the failure
 * that causes: with credentials present and the network dead-but-not-absent —
 * hut wifi, a captive portal, one bar — the request hangs for as long as the OS
 * allows.
 *
 * A hung advertisement request is cheaper than a hung profile request, and the
 * deadline is still not optional: this runs on Home, and a promise that never
 * settles is a `loading` state that never clears.
 */
const PROMOTED_TIMEOUT_MS = 6_000;

/**
 * SEPARATELY BUDGETED. `getSession()` can refresh a token over the network and
 * it happens BEFORE the query, so the query's own `.abortSignal()` cannot
 * protect it. Same reasoning and same number as `publicProfile.ts` and
 * `search/people.ts`.
 */
const SESSION_TIMEOUT_MS = 3_000;

/**
 * How many placements are read at once.
 *
 * A page size, not a business rule. ICEFALL runs no auction and no bidding, so
 * there is no ranking being truncated here — the cap only stops a pathological
 * table from being pulled onto a phone. Both requests use the same ordering and
 * the same cap, so they describe the same rows.
 */
const MAX_PLACEMENTS = 50;

/**
 * The columns that certainly exist on the deployed server today.
 *
 * ADDING TO THIS LINE IS A DECISION ABOUT WHAT AN ADVERTISER'S READER MAY SEE,
 * not a fetch optimisation — see the header's list of what is deliberately
 * absent. Row-level security is not column-level security, and this select list
 * is the only thing standing between a climber and `daily_budget_cents`.
 */
const BASE_COLUMNS =
  "id, company_id, post_id, product_id, audience_mode, declared_goals, countries, creative_path, starts_on, ends_on, status";

/**
 * The columns 20260903000000 adds. This request is ALLOWED TO FAIL, and is
 * expected to until somebody runs `supabase db push`.
 */
const CREATIVE_COLUMNS =
  "id, creative_company_name, creative_headline, creative_body, creative_cta_label, creative_cta_href, surfaces";

/**
 * WHETHER THIS SESSION HAS SETTLED THE QUESTION of the creative columns.
 *
 * A cache of one small enum, and it can only ever change how many requests are
 * made — never what any of them returns, and never what is drawn. Without it,
 * every Home mount before the push would pay a guaranteed-failing request.
 *
 * It moves on a MISSING-FIELD error only. A timeout or a refusal leaves it
 * alone, because neither says anything about what the server has and the next
 * mount deserves the full attempt. Same reasoning and same one-way movement as
 * `extrasRung` in `publicProfile.ts`.
 *
 * THE COST OF BEING WRONG IS ONE SESSION. If the migration is pushed while the
 * app is open, this stays `absent` until the next reload and the module keeps
 * answering `not-provisioned` — which is honest, merely stale. It can never
 * produce a card that should not exist.
 */
let creativeColumns: "unknown" | "present" | "absent" = "unknown";

/* -------------------------------------------------------------------------- */
/* The dismissal store                                                         */
/* -------------------------------------------------------------------------- */

/**
 * WHERE A DISMISSAL LIVES, AND WHAT HAPPENS ON A NEW DEVICE. Read this before
 * changing anything below it.
 *
 * `UpgradePrompt.tsx:16` forbids "an x that dismisses a thing which then
 * returns tomorrow", and the constitution forbids the modal it would otherwise
 * be. So the x has to mean THIS PLACEMENT, FOR GOOD.
 *
 * THE RECORD OF TRUTH IS THE SERVER. `promoted_dismissals` is one row per
 * person per placement with SELECT and INSERT grants and no DELETE and no
 * UPDATE — the absence of those privileges is what makes "for good" structural
 * rather than a promise in a comment. It is keyed on the ACCOUNT, so it follows
 * the person to a new phone.
 *
 * THE LOCAL MIRROR IS NOT THE RECORD. It exists for two cases and no others:
 *
 *   · the write has not landed yet, or failed — a tunnel, a lapsed session —
 *     and the card must still be gone the moment the x is tapped, because a
 *     dismiss that visibly fails is exactly what UpgradePrompt forbids;
 *   · `promoted_dismissals` IS NOT PUSHED YET, so today the server write always
 *     fails and the mirror is the only thing holding the promise at all.
 *
 * SO, PLAINLY, WHAT A NEW DEVICE SEES:
 *
 *   BEFORE the migration is pushed — A DISMISSAL DOES NOT FOLLOW. Sign in on a
 *     second phone and the card is back. That is a real breach of the promise,
 *     stated here rather than papered over; it is also the strongest argument
 *     for pushing 20260903000000, and it repairs itself the moment that
 *     happens, with no code change on this side.
 *   AFTER the push — the dismissal follows the account, because the read below
 *     unions the server's rows with this device's. Sign out and back in, clear
 *     the app's storage, change phones: still gone.
 *
 * The mirror is KEYED BY ACCOUNT rather than kept as a flat list, because two
 * people share a phone more often than anybody plans for and one person's
 * dismissal must not silence a card for the other. It is also, deliberately,
 * never cleared by this module: there is no code path here that un-dismisses
 * anything, on either side of the boundary.
 */
const DISMISSED_KEY = "icefall.promoted.dismissed.v1";

/** Accounts, to the placement ids that account has closed on this device. */
type DismissedByAccount = Record<string, string[]>;

function readDismissedStore(): DismissedByAccount {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: DismissedByAccount = {};
    for (const [uid, ids] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(ids)) out[uid] = ids.filter((v): v is string => typeof v === "string");
    }
    return out;
  } catch {
    /* Private mode, a full quota, a hostile value somebody pasted in. An
       unreadable store is an empty one — never a thrown error on Home. */
    return {};
  }
}

/** What this account has closed on this device. */
function dismissedOnThisDevice(uid: string): string[] {
  return readDismissedStore()[uid] ?? [];
}

function rememberDismissedLocally(uid: string, placementId: string): void {
  try {
    const store = readDismissedStore();
    const mine = store[uid] ?? [];
    if (mine.includes(placementId)) return;
    /* Capped oldest-first. A campaign ends and its row is eventually deleted,
       so an uncapped list is a storage leak with no reader; 300 is far past any
       plausible number one person can close. Trimming can only ever un-hide the
       OLDEST dismissal, never a recent one, and only on a device that has
       closed three hundred advertisements. */
    const next = [...mine, placementId];
    store[uid] = next.length > 300 ? next.slice(next.length - 300) : next;
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(store));
  } catch {
    /* The server row is the record; this was the mirror. Nothing to report. */
  }
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Race a promise that has no cancellation of its own against the clock.
 *
 * Returns a sentinel rather than throwing, so a timeout has to be handled
 * deliberately instead of caught by accident alongside real errors. Copied from
 * `publicProfile.ts` rather than imported, for the reason that file gives about
 * `search/people.ts`: it is a private helper in a file this module does not
 * own, and reaching into somebody else's internals is how two sessions end up
 * editing one line.
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

/** One row of either request, untyped because the client is. */
type Row = Record<string, unknown>;

/** A non-empty trimmed string, or null. Anything else was not provided. */
function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * An in-app path, or null.
 *
 * The database enforces exactly this (`promoted_creative_cta_href_is_in_app`)
 * and it is checked again here — not because the constraint is doubted, but
 * because the two arrive together and only one of them lives in this
 * repository. The failure this prevents is not a wrong type: it is a card
 * ICEFALL drew, carrying ICEFALL's own disclosure, that sends a climber to
 * somebody else's host.
 *
 * Written as separate tests rather than one expression, the same way the
 * constraint is, so each refusal can be read on its own: a scheme, a
 * protocol-relative link that LOOKS like a path, a token with something hidden
 * after a space, and a length.
 */
function inAppPath(value: unknown): string | null {
  const href = text(value);
  if (!href) return null;
  if (href.length > 300) return null;
  if (!href.startsWith("/")) return null;
  if (href.startsWith("//")) return null;
  if (/\s/.test(href)) return null;
  return href;
}

/**
 * A row pair — base fields and creative fields — as a drawable promotion, or
 * null if it is not one.
 *
 * NULL IS NOT AN ERROR AND MOST NULLS HERE WILL BE ORDINARY. A placement that
 * points at a post or a product legitimately carries no creative of its own;
 * the migration is explicit that the pointer path is the RICHER one and is
 * expected to become normal. This app cannot follow a pointer — `posts`,
 * `products` and `companies` are all out of a climber's reach — so such a row
 * returns null here and the surface draws nothing. `PROMOTED_UNREADABLE` is the
 * sentence for it.
 *
 * THE ADVERTISER'S NAME IS NOT OPTIONAL. A card that says "Promoted" without
 * saying by whom is not a disclosure, it is a shape that looks like one, and it
 * is worse than no card. The same goes for the button: a call to action whose
 * destination did not survive `inAppPath` is a button that cannot be honoured.
 */
function toCreative(base: Row, creative: Row | undefined): PromotedCreative | null {
  const id = text(base.id);
  const companyId = text(base.company_id);
  const startsOn = text(base.starts_on);
  const endsOn = text(base.ends_on);
  if (!id || !companyId || !startsOn || !endsOn) return null;

  const companyName = text(creative?.creative_company_name);
  const headline = text(creative?.creative_headline);
  const ctaLabel = text(creative?.creative_cta_label);
  const ctaHref = inAppPath(creative?.creative_cta_href);
  if (!companyName || !headline || !ctaLabel || !ctaHref) return null;

  return {
    id,
    companyId,
    /* Written from the constant rather than typed out, so there is one spelling
       of the word in the app and a rename cannot leave two behind. */
    disclosure: PROMOTED_LABEL,
    companyName,
    headline,
    body: text(creative?.creative_body),
    ctaLabel,
    ctaHref,
    imagePath: text(base.creative_path),
    /* Anything that is not one of the two known modes reads as `general`.
       `promoted_audience_mode_known` makes a third value impossible; if one
       ever appeared, treating it as "targeted" would silently withhold a paid
       campaign on the strength of a string nobody recognised. */
    audienceMode: base.audience_mode === "targeted" ? "targeted" : "general",
    /* Set from the row, not from whether a filter happened to run: the column
       is what narrowed the audience, and it is true even for a reader who
       matched. See `countryScoped`. */
    countryScoped: textArray(base.countries).length > 0,
    declaredGoals: textArray(base.declared_goals),
    countries: textArray(base.countries).map((c) => c.toUpperCase()),
    startsOn,
    endsOn,
  };
}

/**
 * Is this error the server saying "no such column"?
 *
 * DELEGATED TO `backend/pgErrors.ts` RATHER THAN RE-DERIVED, which is the whole
 * reason that file exists: six modules classified `42501` as "not deployed
 * yet", and it is never a deployment fact — every grant in this schema is `to
 * authenticated`, so a lapsed JWT is served as `anon` and refused by a
 * perfectly healthy server. Telling a climber a feature is not built because
 * their token expired is a confident, checkable, false claim; the same mistake
 * here would have Home conclude that ICEFALL sells no advertising.
 */
function isMissingField(error: PostgrestError | null): boolean {
  return classifyBackendError(error) === "not-provisioned";
}

/**
 * A dead network or an expired deadline, as opposed to a verdict.
 *
 * `pgErrors.ts` classifies what the SERVER said; an abort is what happened
 * instead of the server saying anything, and it arrives through postgrest's
 * `error` field rather than as a rejection. `AbortSignal.timeout` raises a
 * TimeoutError and a cancelled controller an AbortError, so both words are
 * tested. Deliberately kept out of `pgErrors.ts`: that module is about codes
 * measured against the live project, and this is about the client.
 */
function isAbort(error: PostgrestError | null): boolean {
  const detail = `${error?.message ?? ""} ${error?.code ?? ""}`.toLowerCase();
  return detail.includes("abort") || detail.includes("timeout") || detail.includes("timed out");
}

/** One read failure, as a state and a sentence. Never as an empty list. */
function readFailure(error: PostgrestError | null): { state: PromotedState; message: string } {
  if (isAbort(error)) return { state: "unreachable", message: PROMOTED_UNREACHABLE };
  switch (classifyBackendError(error)) {
    case "not-provisioned":
      return { state: "not-provisioned", message: PROMOTED_TABLE_NOT_PROVISIONED };
    case "refused":
      return { state: "unreachable", message: PROMOTED_READ_REFUSED };
    case "unreachable":
      return { state: "unreachable", message: PROMOTED_UNREACHABLE };
    default:
      return { state: "unreachable", message: PROMOTED_NO_USABLE_ANSWER };
  }
}

const NO_PLACEMENTS: readonly PromotedCreative[] = Object.freeze([]);

/** Every non-answer, in one place, so the states cannot drift apart. */
const fail = (state: PromotedState, message: string): PromotedResult => ({
  placements: NO_PLACEMENTS,
  state,
  message,
});

/**
 * Today, on the athlete's own calendar, as `YYYY-MM-DD`.
 *
 * LOCAL, NOT UTC, and this repository has already paid for the difference:
 * commit f2cb54c, "fmtDate showed every bare date a day early across the
 * Americas". `starts_on` and `ends_on` are bare dates, so they must be compared
 * against a bare local date; `toISOString()` would shift somebody in Denver by
 * a day and end a campaign early.
 *
 * Compared lexicographically, which is exact for zero-padded ISO dates and
 * avoids constructing a Date from a bare date string — parsed as UTC midnight,
 * which is the same bug reintroduced by another door.
 */
function todayLocal(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * Active and in date — AND THIS IS NOT THE SECURITY BOUNDARY. Read the header.
 *
 * `promoted_select` already refuses a draft and an expired campaign to every
 * climber, on the server, where a patched client cannot reach it. This test
 * exists for the ONE reader the policy deliberately shows extra rows to: its
 * `or is_company_member(company_id) or is_staff()` branch means a company's own
 * staff can read their own drafts and their own finished campaigns. Without
 * this, an operator opening the phone app would find their unpublished draft
 * drawn on Home as a live advertisement — an advert nobody bought, addressed to
 * the person who wrote it.
 *
 * SO THE WORST CASE OF A WRONG DEVICE CLOCK IS UNDER-DELIVERY, and that is what
 * makes this safe to do on the client. For everybody who is not the advertiser
 * the server has already applied the same test, so this can only ever remove
 * rows from a set the server already vetted — never add one.
 */
function isLive(row: Row, today: string): boolean {
  if (row.status !== "active") return false;
  const startsOn = text(row.starts_on);
  const endsOn = text(row.ends_on);
  if (!startsOn || !endsOn) return false;
  return startsOn <= today && today <= endsOn;
}

/** Lower case, single-spaced, with the local `curated:` prefix taken off. */
function normaliseGoal(value: string): string {
  return value.trim().toLowerCase().replace(/^curated:/, "").replace(/\s+/g, " ");
}

/**
 * Does this athlete's own declared objective match what the campaign asked for?
 *
 * TARGETING IS BY DECLARED GOALS AND NOTHING ELSE — the table's own comment,
 * and the reading app is where the schema puts the rule. Nothing here reads a
 * location, a search, a route that was opened, a training history or any other
 * behaviour, and the whole test runs on the device, so no objective is sent
 * anywhere in order to choose an advertisement.
 *
 * EXACT NORMALISED EQUALITY, NEVER A SUBSTRING. ICEFALL's CRM has not fixed the
 * vocabulary an advertiser types into `declared_goals`, so this compares the
 * athlete's objective id, curated id and name against each declared goal with
 * case, spacing and the `curated:` prefix normalised away — and stops there. A
 * prefix or substring match would deliver an advertisement about a DIFFERENT
 * mountain and label it targeted, which is worse than not delivering it.
 *
 * A TARGETED CAMPAIGN NAMING NO GOALS REACHES NOBODY, deliberately: `{}` is the
 * column default, and it is the same "the default is silence, not a guess"
 * ruling the migration makes about `surfaces`.
 */
function matchesGoals(placementGoals: readonly string[], declaredGoals: readonly string[]): boolean {
  if (placementGoals.length === 0 || declaredGoals.length === 0) return false;
  const mine = new Set(declaredGoals);
  return placementGoals.some((goal) => mine.has(normaliseGoal(goal)));
}

/**
 * The athlete's objectives as goal tokens.
 *
 * Three tokens per objective — the id, the curated id where there is one, and
 * the name — because an advertiser might reasonably name a mountain any of
 * those ways and none of the three is more canonical than the others today.
 *
 * A SUMMITED OBJECTIVE STILL COUNTS. Somebody who reached Mont Blanc last month
 * is not less interested in Mont Blanc, and dropping it would be this module
 * inferring something about them, which is the one thing targeting here is not
 * allowed to do.
 */
function goalTokensOf(objectives: readonly SavedObjective[]): string[] {
  const out = new Set<string>();
  for (const objective of objectives) {
    for (const raw of [objective.id, objective.curatedId, objective.name]) {
      const token = typeof raw === "string" ? normaliseGoal(raw) : "";
      if (token) out.add(token);
    }
  }
  return [...out];
}

/**
 * The signed-in athlete's own country, cached for the session.
 *
 * ALLOWED TO FAIL, and both a failure and a genuine null collapse to the same
 * answer: unknown. `profiles.country_code` is nullable precisely so somebody
 * can decline to say, and this module does not get to treat declining as a
 * different kind of missing.
 *
 * Cached per account because it changes about as often as somebody moves
 * country, and three surfaces asking on one screen would otherwise be three
 * requests for the same string. Only a SUCCESSFUL read is cached: a failure
 * must not freeze "unknown" in for the session.
 */
const countryByAccount = new Map<string, string | null>();

async function fetchCountry(
  client: SupabaseClient,
  uid: string,
  deadline: AbortSignal | undefined,
): Promise<string | null> {
  const cached = countryByAccount.get(uid);
  if (cached !== undefined) return cached;
  try {
    const query = client.from("profiles").select("country_code").eq("id", uid);
    /* `.abortSignal()` BEFORE `.maybeSingle()`. It is declared on
       PostgrestTransformBuilder and returns `this`; `maybeSingle()` returns a
       builder without it, so the other order is a compile error rather than a
       quietly lost deadline. */
    const { data, error } = await (deadline ? query.abortSignal(deadline) : query).maybeSingle();
    if (error) return null;
    const code = text((data as Row | null)?.country_code);
    const value = code && code.length === 2 ? code.toUpperCase() : null;
    countryByAccount.set(uid, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Which placement ids this account has closed, from the server.
 *
 * ALLOWED TO FAIL, and the consequence of failing is stated rather than
 * shrugged at: this device's own mirror still applies, so a card closed HERE
 * stays closed, but one closed on another phone can come back for this session.
 * That is the honest cost of a read that did not land, and it is better than
 * the alternative of refusing to draw anything because the dismissal list is
 * unknown.
 *
 * `promoted_dismissals_select` is `profile_id = auth.uid()` with no company
 * branch and no staff branch, so this can only ever return this person's own
 * rows. The `.eq` is for the index, not for the boundary.
 */
async function fetchDismissed(
  client: SupabaseClient,
  uid: string,
  deadline: AbortSignal | undefined,
): Promise<string[]> {
  try {
    const query = client
      .from("promoted_dismissals")
      .select("placement_id")
      .eq("profile_id", uid)
      .limit(500);
    const { data, error } = await (deadline ? query.abortSignal(deadline) : query);
    if (error) return [];
    const rows = Array.isArray(data) ? (data as Row[]) : [];
    return rows.map((row) => text(row.placement_id)).filter((id): id is string => id !== null);
  } catch {
    return [];
  }
}

/** What either request resolves to, once the failing one is allowed to fail. */
type Answered = { data: unknown; error: PostgrestError | null };

/**
 * The promotions running on one surface for one athlete, or an honest account
 * of why there are none.
 *
 * Outside React, so a loader or a test can call it as easily as a hook can.
 *
 * RETURNS `state: "loading"` TO MEAN "you cancelled me, I have no answer". The
 * caller's own signal is the only thing that can tell an abandoned request from
 * an expired budget — both raise the same AbortError — and conflating them
 * either reports a failure on every navigation or renders a real timeout as a
 * confident "nobody is advertising".
 */
export async function fetchPromotedPlacements(
  surface: PromotedSurface,
  audience: PromotedAudience,
  signal?: AbortSignal,
): Promise<PromotedResult> {
  /*
   * THE SUBSCRIBER RULE, APPLIED BEFORE ANYTHING IS ASKED. Read
   * `PROMOTED_SUBSCRIBER_RULE` for what this is and is not — a courtesy this
   * app performs, not a boundary the server holds, and it cannot be moved to
   * the server because billing state is not in that database.
   *
   * Placing it first is the part that is genuinely worth something: a device
   * that believes it is on a paid plan sends NO request, so no campaign is
   * fetched, nothing is counted against anybody, and no objective leaves the
   * phone in order to select an advertisement.
   *
   * `tier !== "free"` rather than a list of paid plans, so a tier added to
   * `growth/tiers.ts` tomorrow lands on the right side of this line without
   * anybody remembering to come back. A TRIAL COUNTS: it grants `pro` for
   * fourteen days and takes no payment, so a trialing athlete sees no
   * promotions — a commercial choice, written down rather than discovered.
   */
  if (audience.tier !== "free") return fail("withheld", PROMOTED_SUBSCRIBER);

  if (!supabase || !untyped) return fail("no-backend", PROMOTED_NO_BACKEND);
  const client = untyped;

  const session = await withDeadline(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
  if (signal?.aborted) return { placements: NO_PLACEMENTS, state: "loading" };
  if (session === TIMED_OUT || session.error) return fail("unreachable", PROMOTED_UNREACHABLE);
  const uid = session.data.session?.user.id ?? null;
  /* Cached for the dismiss, which cannot afford to ask. Set only once the
     result is known to be a real one — a timeout must not clear a good id.
     See `lastKnownUid`. */
  if (uid) lastKnownUid = uid;
  /* Not "nothing is running": the grants are `to authenticated`, so an
     anonymous request is refused rather than answered. Nobody was asked. */
  if (!uid) return fail("signed-out", PROMOTED_SIGNED_OUT);

  /* The caller's signal (an unmount, a surface change) and the budget combined,
     so both still abort the requests. It comes back undefined only on an engine
     with neither `AbortSignal.timeout` nor a caller signal to fall back to,
     which is why every call below is conditional rather than `?? signal`. */
  const deadline = withTimeout(PROMOTED_TIMEOUT_MS, signal);

  /*
   * THE BASE REQUEST — the one that is not allowed to fail quietly.
   *
   * No `status` or date filter goes to the server. `promoted_select` has
   * already applied both for everybody who is not the advertiser, and a second
   * copy here would suggest this is where the rule lives. `isLive` applies the
   * client's version afterwards, where its actual purpose — a company member's
   * own drafts — is written down beside it.
   *
   * Ordered by `starts_on` then `id` so the row set is STABLE and identical
   * across the two requests, and so that which advertisement a person sees is a
   * stated rule rather than whatever Postgres happened to return first. ICEFALL
   * runs no auction: the campaign that started earliest goes first.
   */
  const baseQuery = client
    .from("promoted_placements")
    .select(BASE_COLUMNS)
    .order("starts_on", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_PLACEMENTS);

  /*
   * THE CREATIVE REQUEST — allowed to fail, and expected to until the push.
   *
   * Skipped entirely once this session has established that the columns are
   * absent, so a build running against an un-pushed server pays for one failed
   * request rather than one per mount.
   *
   * `surfaces` is NOT filtered server-side with `.contains()`, deliberately:
   * that would make the two requests describe different row sets, and the merge
   * below joins them by id on the assumption that they describe the same one.
   * Filtering a page of at most fifty rows on the device costs nothing and
   * removes a whole class of "the base row is here and its words are not".
   */
  const creativeQuery =
    creativeColumns === "absent"
      ? null
      : client
          .from("promoted_placements")
          .select(CREATIVE_COLUMNS)
          .order("starts_on", { ascending: true })
          .order("id", { ascending: true })
          .limit(MAX_PLACEMENTS);

  /*
   * FOUR REQUESTS SIDE BY SIDE, AND ONLY THE FIRST MAY DECIDE THE ANSWER.
   *
   * Parallel rather than sequential because none of them needs another's
   * result: the creative rows match by id, and the country and the dismissals
   * are facts about the reader rather than about the campaigns. The three that
   * may fail resolve to a benign value instead of rejecting, which is what
   * makes `Promise.all` safe — a rejection would take the base read with it,
   * and that is the one outcome this arrangement exists to prevent.
   */
  const skipped: Answered = { data: null, error: null };
  const [baseResponse, creativeResponse, dismissedRemote, country] = await Promise.all([
    (deadline ? baseQuery.abortSignal(deadline) : baseQuery).then(
      (r): Answered => ({ data: r.data, error: r.error }),
      (): Answered => ({ data: null, error: null }),
    ),
    creativeQuery
      ? (deadline ? creativeQuery.abortSignal(deadline) : creativeQuery).then(
          (r): Answered => ({ data: r.data, error: r.error }),
          (): Answered => ({ data: null, error: null }),
        )
      : Promise.resolve(skipped),
    fetchDismissed(client, uid, deadline),
    fetchCountry(client, uid, deadline),
  ]);

  /* OUR OWN CANCELLATION IS A NON-EVENT — the effect that replaced this one has
     already set its own state. */
  if (signal?.aborted) return { placements: NO_PLACEMENTS, state: "loading" };

  if (baseResponse.error) {
    const { state, message } = readFailure(baseResponse.error);
    return fail(state, message);
  }
  /* The base request rejected outright rather than reporting through `error`.
     postgrest-js is not supposed to do this; if it ever does, the honest answer
     is that ICEFALL did not find out, never that nothing is running. */
  if (!Array.isArray(baseResponse.data)) return fail("unreachable", PROMOTED_UNREACHABLE);

  const today = todayLocal();
  const baseRows = (baseResponse.data as Row[]).filter((row) => isLive(row, today));

  /*
   * THE MEASURED ZERO. The server was asked and it answered: nothing is
   * running. This is a statement about ICEFALL's business, it is true today,
   * and it is reachable ONLY because the creative columns were asked for
   * separately — a combined select would have failed on a missing column and
   * left nothing honest to say.
   */
  if (baseRows.length === 0) return fail("none", PROMOTED_NONE_RUNNING);

  /* Campaigns exist. Whether their words do is the next question. */
  if (creativeQuery === null) return fail("not-provisioned", PROMOTED_WORDS_NOT_PROVISIONED);
  if (creativeResponse.error) {
    if (isMissingField(creativeResponse.error)) {
      creativeColumns = "absent";
      return fail("not-provisioned", PROMOTED_WORDS_NOT_PROVISIONED);
    }
    /* A refusal, a timeout, a transport failure. Says nothing about what the
       server HAS, so the cache is left alone and the next mount tries again. */
    const { state, message } = readFailure(creativeResponse.error);
    return fail(state, message);
  }
  if (!Array.isArray(creativeResponse.data)) return fail("unreachable", PROMOTED_UNREACHABLE);
  creativeColumns = "present";

  const creativeById = new Map<string, Row>();
  for (const row of creativeResponse.data as Row[]) {
    const id = text(row.id);
    if (id) creativeById.set(id, row);
  }

  /*
   * SURFACE. `surfaces` defaults to `'{}'` — nowhere — and an active row must
   * name at least one, so an empty array here means either a row written before
   * the column existed or a state the constraint forbids. Both draw nothing,
   * which is the answer that default was chosen to give.
   */
  const onSurface = baseRows.filter((row) => {
    const id = text(row.id);
    const creative = id ? creativeById.get(id) : undefined;
    return textArray(creative?.surfaces).includes(surface);
  });
  if (onSurface.length === 0) return fail("none", PROMOTED_NONE_ON_SURFACE);

  /* The two lists of closed placements, unioned. See the dismissal store's own
     note for which of them is the record and which is the mirror. */
  const dismissed = new Set([...dismissedRemote, ...dismissedOnThisDevice(uid)]);
  const openHere = onSurface.filter((row) => {
    const id = text(row.id);
    return id !== null && !dismissed.has(id);
  });
  if (openHere.length === 0) return fail("withheld", PROMOTED_ALL_DISMISSED);

  /*
   * AUDIENCE. Two tests, both fail-closed, both of them the reading app
   * performing a rule the schema explicitly delegates to it.
   *
   * COUNTRY: an empty `countries` is worldwide and delivers. A campaign that
   * named countries is delivered only to somebody whose country is both KNOWN
   * and NAMED — "ICEFALL does not know where you are" is not France, and a
   * campaign bought for France must not be delivered on the strength of a
   * blank. `country_code` is self-declared and often null, so this genuinely
   * withholds country-scoped campaigns from most accounts. That is
   * under-delivery; it is visible to the advertiser in their own viewer count,
   * and it is the right direction to be wrong in.
   *
   * GOALS: `matchesGoals`, which reads only what the athlete declared.
   */
  const forThisReader = openHere.filter((row) => {
    const countries = textArray(row.countries).map((c) => c.toUpperCase());
    if (countries.length > 0 && (!country || !countries.includes(country))) return false;
    if (row.audience_mode !== "targeted") return true;
    return matchesGoals(textArray(row.declared_goals), audience.declaredGoals);
  });
  if (forThisReader.length === 0) return fail("withheld", PROMOTED_NOT_TARGETED);

  const placements = forThisReader
    .map((row) => {
      const id = text(row.id);
      return toCreative(row, id ? creativeById.get(id) : undefined);
    })
    .filter((card): card is PromotedCreative => card !== null);

  /* Running here, and unreadable from a phone — the pointer path. Not a zero,
     not a failure, and emphatically not "nobody is advertising". */
  if (placements.length === 0) return fail("unreadable", PROMOTED_UNREADABLE);

  return { placements, state: "ready" };
}

/* -------------------------------------------------------------------------- */
/* Writing — a view, and a dismissal                                           */
/* -------------------------------------------------------------------------- */

/**
 * Placements this session has already asked to record a view for.
 *
 * The primary key on `(placement_id, profile_id)` is what makes the count
 * distinct people, so a repeat is refused by the database and nothing breaks
 * without this — it merely saves a guaranteed-failing round trip on every
 * re-render of a card that stays on screen.
 */
const viewsRecorded = new Set<string>();

/**
 * Record that this client drew a placement. FIRE AND FORGET, ALWAYS.
 *
 * NOTHING ON SCREEN MAY DEPEND ON THIS, and the migration says why: a company
 * member scrolling past their own campaign has this insert refused on purpose,
 * because a number the buyer can inflate is not a number they can be invoiced
 * against. That refusal is correct and must be invisible.
 *
 * WHAT THE ROW CLAIMS, exactly: a client asked to record a view. Not an
 * impression, not a reach, not a delivery — ICEFALL cannot see a screen, and
 * each of those words would be a measurement this app never made.
 */
/**
 * The signed-in id this module has ALREADY seen, with no request of any kind.
 *
 * Exists for exactly one caller: the dismiss. Every other read in this file can
 * afford to ask the auth client and wait — a card arriving a moment late costs
 * nothing. A dismissal cannot: the card is already off the screen when this
 * runs, so a `getSession()` that hangs on hut wifi loses the record silently and
 * the promotion comes back. That is the one behaviour `UpgradePrompt.tsx:16`
 * names and forbids.
 *
 * It is populated as a side effect of the fetch, which resolves the session
 * under its own deadline anyway. So by the time a card is on screen to be
 * dismissed, this is set — and if it somehow is not, the dismiss falls back to
 * asking, bounded, rather than pretending it knows.
 */
let lastKnownUid: string | null = null;

function knownUidWithoutAsking(): string | null {
  return lastKnownUid;
}

export async function recordPromotedView(placementId: string): Promise<void> {
  if (!supabase || !untyped || !placementId) return;
  if (viewsRecorded.has(placementId)) return;
  viewsRecorded.add(placementId);
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await untyped
      .from("promoted_placement_views")
      .insert({ placement_id: placementId, profile_id: uid });
  } catch {
    /* The table is not pushed yet, the session lapsed, the tunnel closed. A
       view that was not counted is a view that was not counted: there is
       nothing to tell anybody and nothing to retry into. */
  }
}

/**
 * Close a promotion for this account, permanently.
 *
 * TWO WRITES, IN THIS ORDER, AND THE LOCAL ONE IS UNCONDITIONAL. The mirror is
 * written first and is never gated on the server's answer, because the promise
 * being kept is that the x WORKS — `UpgradePrompt.tsx:16` forbids the
 * alternative in as many words. A dismissal that quietly failed because a
 * tunnel ate the request is exactly the x this app refuses to ship.
 *
 * The server row is the record: no DELETE grant and no UPDATE grant, so a
 * dismissal cannot be un-made by anybody, ICEFALL's own app included. See the
 * dismissal store's note above for precisely what a new device sees, before and
 * after 20260903000000 is pushed.
 *
 * Resolves either way and never throws. The caller has already taken the card
 * off the screen, and there is no outcome here that should put it back.
 */
export async function dismissPromotion(placementId: string): Promise<void> {
  if (!placementId) return;
  try {
    /*
       THE LOCAL WRITE CANNOT WAIT ON THE NETWORK, and it used to.
       `getSession()` refreshes an expired token over the wire — this file says
       so where it gives that call its own SESSION_TIMEOUT_MS budget, and
       `lib/netTimeout.ts` documents the hut-wifi case where such a request
       never answers at all. This one had no budget, so on one bar of signal the
       athlete tapped the x, the card left the screen, nothing was recorded, and
       it returned on the next mount — which is precisely the "x that dismisses
       a thing which then returns tomorrow" that UpgradePrompt.tsx forbids.

       So the local record is written against whatever identity is already known
       WITHOUT a request. Only the server mirror waits. */
    let uid = knownUidWithoutAsking();
    if (uid) rememberDismissedLocally(uid, placementId);
    if (!untyped || !supabase) return;
    if (!uid) {
      /* Never seen a session — bounded, so a dead tunnel cannot hang here. */
      const late = await withDeadline(supabase.auth.getSession(), SESSION_TIMEOUT_MS);
      uid = late === TIMED_OUT ? null : (late.data.session?.user.id ?? null);
      if (uid) {
        lastKnownUid = uid;
        rememberDismissedLocally(uid, placementId);
      }
    }
    if (!uid) return;
    await untyped.from("promoted_dismissals").insert({ placement_id: placementId, profile_id: uid });
  } catch {
    /* Not pushed yet, or unreachable. The mirror already holds the promise on
       this device; the server row is what would carry it to the next one. */
  }
}

/* -------------------------------------------------------------------------- */
/* The hooks                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * This athlete, as far as delivery is concerned.
 *
 * Both facts come from `AppState`, which is this device's own storage: the tier
 * (see `PROMOTED_SUBSCRIBER_RULE` for how much that is worth) and the
 * objectives they saved themselves. Nothing is read from the server about the
 * person except their country, and that happens inside the fetch.
 */
export function usePromotedAudience(): PromotedAudience {
  const { currentTier, objectives } = useApp();
  const goals = useMemo(() => goalTokensOf(objectives), [objectives]);
  return useMemo(() => ({ tier: currentTier, declaredGoals: goals }), [currentTier, goals]);
}

/**
 * A separator that a normalised goal cannot contain.
 *
 * `normaliseGoal` collapses every run of whitespace to a single space, so no
 * token can hold a newline. The effect below keys on the joined string rather
 * than on the array, because `AppState` hands back a fresh array identity often
 * enough that a dependency on it would re-fetch on almost every render — and
 * joining on a space would have split "mont blanc" into two goals that match
 * nothing.
 */
const GOAL_SEPARATOR = "\n";

/**
 * The promotions running on one surface. The engine behind all three surfaces,
 * so Home, the story rail and the feed cannot end up disagreeing about what is
 * live.
 *
 * ONE FETCH PER SURFACE PER MOUNT, and no subscription. The tier is in the
 * dependency list because it changes inside a session — a trial starts, a plan
 * lapses — and that flips delivery on or off.
 *
 * Dismissals are applied here as well as in the fetch, so a card disappears in
 * the same tick as the tap rather than on the next round trip.
 */
function usePromotedSurface(surface: PromotedSurface): PromotedResult & {
  dismiss: (placementId: string) => void;
} {
  const audience = usePromotedAudience();
  const [result, setResult] = useState<PromotedResult>({
    placements: NO_PLACEMENTS,
    state: "loading",
  });
  const [closed, setClosed] = useState<readonly string[]>([]);

  const goalKey = audience.declaredGoals.join(GOAL_SEPARATOR);
  const tier = audience.tier;

  useEffect(() => {
    const controller = new AbortController();
    setResult({ placements: NO_PLACEMENTS, state: "loading" });

    const declaredGoals = goalKey.length > 0 ? goalKey.split(GOAL_SEPARATOR) : [];
    void fetchPromotedPlacements(surface, { tier, declaredGoals }, controller.signal)
      .then((next) => {
        /* `fetchPromotedPlacements` answers "loading" when it noticed our
           abort. Writing it would strand this surface on a state belonging to a
           request nobody is waiting for. */
        if (controller.signal.aborted || next.state === "loading") return;
        setResult(next);
      })
      /* Nothing above is expected to throw — postgrest-js reports through
         `error` rather than rejecting. But an unhandled rejection here would
         leave `state` on "loading" for ever, and a promotion stuck loading is a
         space on Home that never resolves into anything. */
      .catch(() => {
        if (controller.signal.aborted) return;
        setResult(fail("unreachable", PROMOTED_UNREACHABLE));
      });

    return () => controller.abort();
  }, [surface, tier, goalKey]);

  const dismiss = useCallback((placementId: string) => {
    if (!placementId) return;
    setClosed((prev) => (prev.includes(placementId) ? prev : [...prev, placementId]));
    void dismissPromotion(placementId);
  }, []);

  const visible = useMemo<PromotedResult>(() => {
    if (result.state !== "ready" || closed.length === 0) return result;
    const placements = result.placements.filter((p) => !closed.includes(p.id));
    if (placements.length > 0) return { placements, state: "ready" };
    /* The last one was closed. `withheld`, never `none`: campaigns are running
       and this person has closed them, which are different facts. */
    return { placements: NO_PLACEMENTS, state: "withheld", message: PROMOTED_ALL_DISMISSED };
  }, [result, closed]);

  return { ...visible, dismiss };
}

/**
 * THE HOME CARD — one promotion or none, for the inline block between the
 * greeting and the weather strip.
 *
 * WHICH ONE, WHEN SEVERAL ARE RUNNING: the first, and the order is `starts_on`
 * then `id`, fixed in the query. ICEFALL sells no auction and runs no bidding,
 * so the campaign that started earliest is the one shown; a random pick or a
 * rotation would make the count each advertiser is shown depend on something
 * nobody agreed to.
 *
 * ── A NOTE FOR THE COMPONENT, AND IT HAS BITTEN THIS CODEBASE BEFORE ─────────
 *
 * `Home.tsx` renders inside `<Stagger>`, a framer-motion parent whose variants
 * animate its DIRECT CHILDREN. A card wrapped in a plain `<div>` is not a
 * direct child, never receives the `show` variant, and sits at opacity 0 —
 * invisible, with no error and no warning. The card must be a direct `<Rise>`
 * child of the `<Stagger>`, or conditionally rendered as one:
 *
 *     {promo.state === "ready" && promo.card && (
 *       <Rise className="px-5"><PromotedCard card={promo.card} … /></Rise>
 *     )}
 *
 * ── AND THE OTHER TWO THINGS THE COMPONENT OWES ──────────────────────────────
 *
 * Every state except `ready` draws NOTHING — no skeleton, no reserved height,
 * no explanation. And the branch that draws the headline must be the branch
 * that draws `card.disclosure`; see the header for why that is the one part of
 * the disclosure a data module cannot hold on its own.
 */
export function usePromotedHomeCard(): PromotedCardResult {
  const { placements, state, message, dismiss } = usePromotedSurface("home");
  const card = state === "ready" ? (placements[0] ?? null) : null;

  const dismissThis = useCallback(() => {
    if (card) dismiss(card.id);
  }, [card, dismiss]);

  const markShown = useCallback(() => {
    if (card) void recordPromotedView(card.id);
  }, [card]);

  return { card, state, message, dismiss: dismissThis, markShown };
}

/**
 * ONE PROMOTION AS A STORY SLIDE.
 *
 * The rail's shape carries no body and no button label — a story slide is a
 * full-screen image with one line on it — so those are dropped rather than
 * folded into the headline. `creativePath` is `imagePath` unchanged: it is a
 * reference, and turning it into a URL is the viewer's job, because only the
 * viewer knows which bucket it is reading from.
 */
export function toStoryPlacement(card: PromotedCreative): StoryPromotedPlacement {
  return {
    id: card.id,
    companyId: card.companyId,
    companyName: card.companyName,
    audienceMode: card.audienceMode,
    creativePath: card.imagePath,
    headline: card.headline,
    href: card.ctaHref,
  };
}

/**
 * THE STORY RAIL'S PROMOTIONS, in the shape the rail already declares.
 *
 * `StoryRail.tsx` currently builds `DEMO_PROMOTIONS` from an invented operator
 * behind a dev gate. This replaces the SOURCE, not the arrangement: the
 * interleaving, the "never last" rule and — most importantly — StoryViewer's
 * structural label all stay exactly as they are, which is why this returns the
 * rail's own `PromotedPlacement` rather than something it would have to adapt.
 *
 * The rail's own tier check becomes redundant when it uses this (the fetch
 * already refuses to ask on a paid plan) and it should still be left in place.
 * Two independent refusals to show an advertisement to a paying member is the
 * right number.
 */
export function usePromotedStorySlides(): PromotedStoryResult {
  const { placements, state, message } = usePromotedSurface("story");
  const slides = useMemo(() => placements.map(toStoryPlacement), [placements]);
  return { placements: slides, state, message };
}

/**
 * THE FEED'S PROMOTIONS.
 *
 * Returns the list and leaves the placing to the feed, which is the only thing
 * that knows how many posts it has. Two rules the feed owes, both of which the
 * story rail already keeps and neither of which this module can enforce from
 * here: a promotion is never the first thing in the feed, and never two in a
 * row.
 *
 * `slots` is the form to interleave — `{ kind: "promoted", placement }` — so a
 * promotion cannot end up in a list of posts without the branch that draws it
 * naming what it is. `dismiss` and `markShown` take an id because the feed can
 * hold several, and closing one must not disturb the others.
 */
export function usePromotedFeedPlacements(): PromotedFeedResult {
  const { placements, state, message, dismiss } = usePromotedSurface("feed");
  const slots = useMemo<readonly PromotedSlot[]>(
    () => placements.map((placement) => ({ kind: "promoted", placement })),
    [placements],
  );
  const markShown = useCallback((placementId: string) => {
    void recordPromotedView(placementId);
  }, []);
  return { placements, slots, state, message, dismiss, markShown };
}
