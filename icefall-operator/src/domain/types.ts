/**
 * The Operator CRM's entity model.
 *
 * These types mirror the SHIPPED schema in `icefall-supabase/migrations/`
 * (`20260828100000_crm_foundation.sql`, `20260828110000_crm_marketplace.sql`),
 * as specified back to this session in
 * `icefall-sessions/requests/03-schema-contract-for-operator-crm.md`. Where the
 * database uses a word, this file uses the same word — `kind` not `type`,
 * `state` not `status` on a version, `admin`/`sales` not
 * `company_admin`/`sales_employee`. A translation layer between the client and
 * the schema is a place for two vocabularies to drift, and this app is one of
 * two interfaces onto one backend.
 *
 * Three corrections from the contract are load-bearing and easy to get wrong:
 *
 *   1. A MOUNTAIN'S ID IS ITS SLUG. `mountains.id` is `text` — "everest",
 *      "ama-dablam". Not a uuid, and there is no separate slug column, because
 *      `icefall-web` already keys 52 peaks and every trek record by exactly
 *      these strings.
 *   2. AUTHORIZATION AND PLACEMENT ARE TWO TABLES. `CompanyMountain` decides
 *      what an operator may edit; `Placement` is the paid slot. They have
 *      different lifecycles — a placement can expire without touching a
 *      company's right to edit its own trips, which is exactly what spec §18
 *      requires.
 *   3. PLACEMENT EXPIRY IS DERIVED, NEVER STORED. Nothing writes to the
 *      placements table on a timer. `PlacementStatus` is the view.
 */

import type { BookingValue, Cents } from "./honesty";

/* ========================================================================== */
/* Publication                                                                */
/* ========================================================================== */

/** `products.status`. Note `pending_review`, not `pending`. */
export type ProductStatus = "draft" | "pending_review" | "live" | "archived";

/** `content_versions.state` — the per-change lifecycle. */
export type ContentVersionState =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "superseded";

export type ContentEntityType = "company" | "product" | "media_asset";

/**
 * The five chips spec §17 requires, as one closed union for the UI.
 *
 * Deliberately its own type rather than a reuse of `ProductStatus`: "Expired"
 * belongs to a placement and never to a product, and a single union would let a
 * screen render a product as expired, which would tell an operator their trip
 * had been withdrawn when only a commercial arrangement had lapsed.
 */
export type ChipStatus = "live" | "draft" | "pending" | "rejected" | "expired" | "archived";

export function chipForProduct(status: ProductStatus): ChipStatus {
  return status === "pending_review" ? "pending" : status;
}

/* ========================================================================== */
/* People and companies                                                       */
/* ========================================================================== */

/**
 * Two roles. That is the whole permission model (spec §3), and the union cannot
 * express a third, so it cannot grow one by accident.
 */
export type CompanyRole = "admin" | "sales";

export type CompanyUserStatus = "active" | "invited" | "disabled";

export interface CompanyUser {
  id: string;
  companyId: string;
  profileId: string;
  displayName: string;
  email: string;
  role: CompanyRole;
  status: CompanyUserStatus;
  invitedBy: string | null;
  createdAt: string;
}

export interface Certification {
  /** The body's short form, set typographically. Never a reproduced logo. */
  mark: string;
  /** "Certified", "Member", "Bonded" — what the relationship actually is. */
  note: string;
  full: string;
}

export interface TeamMember {
  name: string;
  role: string;
}

export interface FaqEntry {
  q: string;
  a: string;
}

/**
 * The canonical company record — the LIVE, approved values.
 *
 * NOTE WHAT IS ABSENT. No `phone`, no `email`, no `whatsapp`, no `bookingUrl`.
 * Spec §2 and §5 forbid customer escape routes in operator content, and the
 * cheapest enforcement is for the fields not to exist: you cannot render, leak
 * or forget to strip a property that was never modelled.
 *
 * ALSO ABSENT, AND MORE IMPORTANTLY: everything on `company_internal` — account
 * owner, source, priority, tags, ICEFALL's internal notes. That is a separate
 * table in the schema precisely because RLS is row-level; had those columns
 * stayed on `companies`, an operator reading their own row would read ICEFALL's
 * commercial position on them. There is no operator-facing policy on it, and
 * nothing in this app may grow a field from it.
 */
export interface Company {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  logoMediaId: string | null;
  tagline: string | null;
  description: string | null;
  about: string | null;
  city: string | null;
  country: string | null;
  certifications: Certification[];
  team: TeamMember[];
  faq: FaqEntry[];
  /**
   * The operator's own claims about itself, reviewed by ICEFALL like any other
   * content. DATA, never hardcoded: `icefall-web` currently asserts "24/7
   * Support" for every operator including a real one, which is ICEFALL making a
   * promise on a company's behalf that the company never made.
   */
  whyChooseUs: { label: string; detail: string }[];
  foundedYear: number | null;
  languages: string[];
  /** The wide image behind the company's name on its public page. */
  bannerMediaId: string | null;
  /*
   * NO `video` FIELD, deliberately. Owner decision #15 (2026-08-29): the
   * promotional film belongs to the mountain surface, not the company. The
   * `PromoVideo` type survives below because products and mountains still use
   * it — only the company lost the field.
   */
  /**
   * When ICEFALL checked this company's documents.
   *
   * Named `documents_checked_at` in the schema — Session 03 adopted this from
   * the request, replacing `verified_at`, because "verified" can be misread as
   * "the issuing association confirmed it" and ICEFALL has contacted nobody.
   * Null until a staff action recorded a real check; there is no operator write
   * path, and a coherence constraint makes a date on an unchecked company
   * unstorable.
   */
  documentsCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ========================================================================== */
/* Mountains, authorization, and placement — three separate things            */
/* ========================================================================== */

/** `mountains.id` IS the slug: "everest", "ama-dablam", "mont-blanc". */
export interface Mountain {
  id: string;
  name: string;
  elevationM: number | null;
  range: string | null;
  country: string | null;
  region: string | null;
}

/** `company_mountains.status` — what an operator may EDIT. Not a placement. */
export type MountainAccessStatus = "active" | "suspended" | "ended";

/**
 * THE AUTHORIZATION BOUNDARY (spec §16), and nothing else.
 *
 * No position, no price, no term. Those live on `Placement`. Keeping them apart
 * is what lets spec §18's two edge cases behave independently: a placement can
 * expire while the operator keeps editing their trips, and access can be
 * withdrawn while the placement record stays intact for the audit trail.
 *
 * In the database `authenticated` gets SELECT here and no write of any kind.
 */
export interface CompanyMountain {
  readonly id: string;
  readonly companyId: string;
  /** Text — the mountain's slug. */
  readonly mountainId: string;
  readonly status: MountainAccessStatus;
  readonly assignedAt: string;
}

/** `placements.status`. There is no stored `expired` — see `PlacementStatus`. */
export type PlacementStatus = "reserved" | "active" | "cancelled";

/**
 * The paid slot, #1–#5.
 *
 * OPERATORS CANNOT WRITE THIS, AND NEITHER CAN STAFF BY PLAIN UPDATE. In the
 * shipped schema `authenticated` holds SELECT only — ICEFALL administrators
 * included — and all four write paths are functions that record an audit event
 * in the same statement. That closed a hole a policy could not: a policy can
 * permit a write but cannot compel the writer to log it.
 *
 * Every field is `readonly` here for the same reason it is unwritable there.
 */
export interface Placement {
  readonly id: string;
  readonly companyId: string;
  readonly mountainId: string;
  readonly slotPosition: 1 | 2 | 3 | 4 | 5;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: PlacementStatus;
  readonly priceCents: Cents | null;
  readonly currency: string;
}

/**
 * The `placement_status` view.
 *
 * `effectiveStatus` is DERIVED at read time, which is why an expired placement
 * still holds its position: nothing ran on a timer to take it away. Spec §2 —
 * expiry creates a reminder and never reorders the mountain.
 */
export interface PlacementStatusRow {
  readonly placementId: string;
  readonly effectiveStatus: PlacementStatus | "expired";
  readonly needsReview: boolean;
  readonly daysRemaining: number | null;
}

/* ========================================================================== */
/* Treks — the second catalogue, with its own authorization boundary          */
/* ========================================================================== */

/**
 * THE TREK SCALE IS NOT THE EXPEDITION SCALE, and must never be merged with it.
 * The mildest expedition in the catalogue is a 4,000 m alpine ascent; the
 * mildest thing here is a valley walk. Reusing "Extreme" for the Snowman Trek
 * and for K2 would flatten the distinction a walker most needs.
 *
 * DIFFICULTY COMES FROM THIS RECORD (owner, OP-04: "difficulty should be
 * already there since doesnt change"). It is a property of the route, not a
 * sentence the seller composes.
 */
export type TrekDifficulty = "Easy" | "Moderate" | "Strenuous" | "Very strenuous";

/** What kind of route it is. The web catalogue's own vocabulary, unchanged. */
export type TrekStyle =
  | "Base camp"
  | "Circuit"
  | "Traverse"
  | "Valley"
  | "High pass"
  | "Pilgrimage"
  | "Coastal"
  | "Long distance";

/**
 * THE TREK CATALOGUE ROW, mirrored from `icefall-web/src/data/trekTypes.ts`.
 *
 * A trek is not a variety of expedition and it is not a mountain. It is a ROUTE
 * — to, around or between peaks — and 207 of the web catalogue's 252 routes are
 * on no mountain at all. That is why it needs its own catalogue rather than
 * being expressed as a mountain assignment: the Camino Frances and the West
 * Highland Way have no summit to be granted access to.
 *
 * THE FIELDS ARE THE WEB RECORD'S FIELDS AND NOTHING MORE. Two of that record's
 * columns are deliberately absent here rather than carried across empty:
 *
 *   `priceFromEur` is null on all 252 routes, because a starting price is an
 *   operator's commercial claim and no operator has quoted one. A column whose
 *   only possible value is null is a column that invites somebody to fill it in.
 *
 *   `operatorIds` is likewise empty on all 252. `operatorsForTrek()` in the web
 *   app answers "who runs this route" from a hand-written region map over three
 *   INVENTED companies — demo scaffolding, not a relation. Copying an empty
 *   relation into a second app would make it look like a fact that had simply
 *   not been filled in yet. `CompanyTrek` below is the real relation, and it is
 *   a grant Icefall makes, not a region a company happens to work in.
 *
 * `region` is the region's display name from the web app's `TREK_REGIONS`,
 * denormalised for the same reason `Mountain.region` is: a raw slug is not a
 * thing to show a person, and this portal has no regions table to join to.
 */
export interface Trek {
  /** The slug, and the id in every relation — exactly as `mountains.id` is. */
  id: string;
  name: string;
  regionId: string;
  /** The region's display name. See the note above. */
  region: string;
  country: string;
  /**
   * Peaks in the mountain catalogue this route touches, by id. OFTEN EMPTY, and
   * an empty list is a fact about the route, not a gap to be filled.
   */
  mountainIds: string[];
  /** Typical days on the route, as a range. Null where it varies too widely. */
  durationDays: [number, number] | null;
  difficulty: TrekDifficulty | null;
  season: string | null;
  style: TrekStyle;
  summary: string;
  /**
   * THE HIGHEST POINT ON THE ROUTE, AND NEVER A PARENT PEAK'S SUMMIT.
   *
   * The single most dangerous substitution in this codebase. An Everest Base
   * Camp trek tops out at 5,364 m and the Kala Patthar variant at 5,545 m,
   * where the mountain the route is named after stands at 8,849 m — an
   * overstatement of about 3,485 m in the one number a person uses to judge
   * whether they can survive the trip.
   *
   * Where no true per-route figure is published this is NULL and every screen
   * says there is none. It is never defaulted, never inferred, never borrowed
   * from the peak beside it. `tests/authz.test.ts` scans this app's source for
   * exactly that substitution.
   */
  maxAltitudeM: number | null;
}

/** `company_treks.status` — what an operator may EDIT. Mirrors the mountain one. */
export type TrekAccessStatus = "active" | "suspended" | "ended";

/**
 * THE AUTHORIZATION BOUNDARY FOR TREKS, and nothing else.
 *
 * A one-for-one mirror of `CompanyMountain`, carrying PERMISSION AND NOTHING
 * ELSE — no spots, no itinerary, no pitch, no position, no price, no term. It
 * answers one question: may this company list trips on this route?
 *
 * The reason is the reason `CompanyMountain` gives, unchanged. The moment a
 * grant row grows a content field, an operator's writing lives in a record that
 * nothing publishes and nobody reviews, and two lifecycles that must be able to
 * move independently — the grant, and the thing being sold — are welded into
 * one row. What the company authors stays on `Product`, which has a publication
 * boundary; what Icefall grants stays here, which has none because it needs
 * none.
 *
 * DELIBERATELY A SEPARATE TABLE FROM `company_mountains` rather than a shared
 * `company_destinations` with a kind column: a route and a peak are granted,
 * suspended and ended on different commercial conversations, and one row cannot
 * hold two lifecycles honestly.
 *
 * In the database `authenticated` will get SELECT here and no write of any kind,
 * the same grant shape as `company_mountains` — proposed in
 * `icefall-sessions/requests/09-company-treks-migration.md`, not yet applied.
 */
export interface CompanyTrek {
  readonly id: string;
  readonly companyId: string;
  /** Text — the trek's slug. */
  readonly trekId: string;
  readonly status: TrekAccessStatus;
  readonly assignedAt: string;
}

/* ========================================================================== */
/* Products                                                                   */
/* ========================================================================== */

/** `products.kind`. Expedition and Trek are distinct types, one infrastructure. */
export type ProductKind = "expedition" | "trek";

export interface ItineraryDay {
  day: number;
  title: string;
  detail: string;
}

/**
 * The live product record.
 *
 * THE PUBLICATION BOUNDARY IS ON THIS TABLE'S UPDATE POLICY: it matches only
 * rows whose `status = 'draft'`. So while a product is a draft the operator
 * edits it directly, and the moment it is live or in review every write is
 * refused and the only route is a `ContentVersion`. Screens must branch on
 * exactly that, which is what `isDirectlyEditable` below is for.
 */
export interface Product {
  id: string;
  companyId: string;
  kind: ProductKind;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string | null;
  durationDays: number | null;
  difficulty: string | null;
  /**
   * The highest point the trip actually reaches, when that is not the summit.
   *
   * An Everest Base Camp trek tops out at 5,364 m. Without this the page reads
   * the mountain's altitude and tells a climber they are going to 8,849 m: an
   * overstatement of about 3,485 m, roughly 65% higher than the trip actually
   * goes, in the one number that decides whether they can do it.
   */
  maxAltitudeM: number | null;
  priceFromCents: Cents | null;
  priceToCents: Cents | null;
  currency: string;
  seasonality: string | null;
  itinerary: ItineraryDay[];
  equipment: string[];
  inclusions: string[];
  exclusions: string[];
  faq: FaqEntry[];
  mountainIds: string[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Can this row be written directly, or does it need a version?
 *
 * One function, used by every screen, so the rule lives in one place and matches
 * the UPDATE policy's `USING` clause exactly.
 */
export const isDirectlyEditable = (p: Product): boolean => p.status === "draft";

export type DepartureAvailability = "available" | "limited" | "full" | "unavailable";

/**
 * A dated departure, with a SPLIT WRITE PATH — the owner's decision of
 * 2026-08-28, enforced in the database as column privileges:
 *
 *   availability / spotsTotal / spotsLeft   operator writes directly
 *   departureDate / endDate / priceCents    staff only, via set_departure_terms
 *
 * Availability is a fact about the operator's own logistics and going stale
 * hurts the climber who enquires on a sold-out trip. Price and the existence of
 * a departure are advertised claims, and they are what an operator has most
 * reason to overstate.
 */
export interface ProductDeparture {
  id: string;
  productId: string;
  departureDate: string;
  endDate: string | null;
  availability: DepartureAvailability;
  /** Null is "not stated". Never defaulted to 0 — that would read as sold out. */
  spotsTotal: number | null;
  spotsLeft: number | null;
  priceCents: Cents | null;
}

/** The columns `authenticated` actually holds an UPDATE grant on. */
export const DEPARTURE_DIRECT_FIELDS = ["availability", "spotsTotal", "spotsLeft"] as const;

/* ========================================================================== */
/* Media                                                                      */
/* ========================================================================== */

/**
 * A promotional film, and its source.
 *
 * A CLOSED UNION WITH AN EXPLICIT `none`, not a nullable id. "No video" is a
 * choice the operator made, and it has to be distinguishable from "a video whose
 * source we failed to record" — the same reason a booking's missing value is a
 * status rather than a null.
 *
 * `youtubeId` is an id, never a URL: the player builds a youtube-nocookie embed
 * from it and mounts that iframe ONLY after a click, exactly as
 * `icefall-web/src/app/TripDetail.tsx` does. Storing a full URL would invite
 * somebody to render it directly and quietly reintroduce a third-party request
 * on page load for every reader who never presses play.
 */
export type PromoVideo =
  | { source: "none" }
  | { source: "youtube"; youtubeId: string }
  | { source: "upload"; mediaId: string };

/**
 * `media_assets.kind`. `document` covers certifications and insurance papers.
 *
 * `logo` IS SEPARATE FROM `image` ON PURPOSE. A listing photograph and a company
 * mark are different objects with different rules — a real logo is usually square
 * and often 512 px, which the photograph's 1200×800 floor would reject outright.
 * Folding the two together meant either refusing real logos or lowering the floor
 * for photographs. See `MEDIA_RULES` in `src/domain/media.ts`.
 */
export type MediaKind = "image" | "logo" | "video" | "document";

/** `media_assets.state`. Three, not the five publication chips. */
export type MediaState = "pending" | "approved" | "rejected";

export interface MediaAsset {
  id: string;
  companyId: string;
  /** Null when the asset belongs to the company rather than one trip. */
  productId: string | null;
  kind: MediaKind;
  /** `<company_id>/<company|product_id>/<file>` in the private bucket. */
  storagePath: string;
  mimeType: string | null;
  byteSize: number | null;
  widthPx: number | null;
  heightPx: number | null;
  altText: string | null;
  /**
   * Both required before ICEFALL can approve a photograph — the database
   * refuses an approval without them. Never invent either: an unattributed
   * image is one nobody has established we may publish.
   */
  licence: string | null;
  credit: string | null;
  state: MediaState;
  /** Non-empty whenever `state` is rejected; a refusal without one is refused. */
  decisionReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/* ========================================================================== */
/* Social — the S2 surface (OP-01)                                            */
/* ========================================================================== */

/*
 * THE S2 TABLES ARE NOT LIVE. These shapes mirror the S2 contract in
 * `icefall-sessions/10-BUILD-OUT-PLAN.md` — `posts` (author = profile |
 * company | guide; media; caption; optional expiry = a story),
 * `post_comments`, `follows` — field for field, so that when the CRM session's
 * migration lands the swap is a repoint of the adapter, not a rewrite. The
 * same route `leads.tags` took: built against the in-memory backend in the
 * contract's own shape, then re-pointed.
 *
 * The feed these rows feed is STRICTLY CHRONOLOGICAL. Nothing here carries a
 * score, a rank or an engagement weight, and nothing may grow one — a ranking
 * column would be an algorithmic claim the platform does not make.
 */

/**
 * Who wrote a post. This portal only ever writes `"company"`, but the union
 * carries all three values because the S2 `posts` table serves three apps —
 * the phone app posts as a profile, the guide app as a guide — and a shape
 * that could not represent the shared table would not survive the repoint.
 */
export type PostAuthorKind = "profile" | "company" | "guide";

/**
 * What a post shows, when it shows anything.
 *
 * NO MEDIA STORE IS CONNECTED, so a post cannot carry uploaded bytes — the
 * same fact the logo precedent in `CompanyEditor` states on screen. What a
 * seeded post MAY reference is the app's existing media idioms, and nothing
 * else:
 *
 *   `asset` — a `MediaAsset` this company owns (the `logoMediaId` idiom),
 *             resolved through `getMediaUrl` like every other asset.
 *   `peak` / `trek` — the ALREADY-CREDITED photo libraries served by
 *             icefall-web (`peakPhotoUrl` / `trekPhotoUrl` in
 *             `src/components/ui.tsx`, licences tracked in that app). Stored
 *             as the catalogue id, never a URL, so the origin stays in one
 *             place and `ListingPhoto`'s fallback drawing still applies.
 *
 * A discriminated union rather than a bare string for the reason `PromoVideo`
 * is one: "which library is this from" has to survive into the renderer, or
 * somebody will treat an id as a URL.
 */
export type PostMedia =
  | { source: "asset"; mediaId: string }
  | { source: "peak"; mountainId: string }
  | { source: "trek"; trekId: string };

/**
 * One row of the S2 `posts` table, as this portal sees it.
 *
 * A STORY IS A POST WITH AN EXPIRY, not a second type — `expiresAt` set is the
 * whole difference, exactly as the contract writes it ("optional expiry = a
 * story"). Whether a story is still showing is DERIVED from the app clock
 * (`NOW` in `@/domain/dates`) at read time, never stored: nothing runs on a
 * timer to flip a flag, the same reasoning as placement expiry.
 *
 * `removedAt` / `removedReason` are ICEFALL MODERATION and nothing else. There
 * is no operator write path to either — the moderation queue is the CRM's
 * (CR-17), and this portal neither approves posts nor pretends to. A post is
 * public the moment it is created, and may later be removed by Icefall; those
 * are the only states, and no "pending review" exists because nothing reviews
 * one.
 */
export interface Post {
  id: string;
  authorKind: PostAuthorKind;
  /** The company id when `authorKind` is `"company"`. */
  authorId: string;
  /**
   * OPERATOR-AUTHORED PUBLIC TEXT, and guarded like every other such field:
   * `createPost` runs `findContactDetailsIn` over it and refuses, verbatim.
   */
  caption: string;
  media: PostMedia | null;
  /** Set = this post is a story. Derived against `NOW`, never mutated. */
  expiresAt: string | null;
  createdAt: string;
  /** Icefall's removal, when it happened. No operator write path. */
  removedAt: string | null;
  /** Non-null exactly when `removedAt` is — shown to the operator verbatim. */
  removedReason: string | null;
}

/** A story is a post with an expiry. One definition, used everywhere. */
export const isStory = (p: Post): boolean => p.expiresAt !== null;

/**
 * Where a story stands against the app clock. `null` for a plain post.
 * Callers pass `NOW` from `@/domain/dates` — never `new Date()`.
 */
export function storyState(p: Post, nowIso: string): "active" | "expired" | null {
  if (p.expiresAt === null) return null;
  return Date.parse(p.expiresAt) > Date.parse(nowIso) ? "active" : "expired";
}

/**
 * One row of S2 `post_comments`.
 *
 * `authorName` is a climber's display name — DEMO WORLD. Climbers are not rows
 * this portal owns (they live on the phone app's side of the shared tables),
 * so a comment carries the name to render and nothing an operator could act
 * on. There is no operator write path to comments here at all: a company reads
 * what climbers said under its posts, it does not author comments.
 */
export interface PostComment {
  id: string;
  postId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/**
 * One row of S2 `follows`: a climber following a company.
 *
 * `followerName` for the same demo-world reason as `PostComment.authorName` —
 * the follower is a phone-app account, not a record this portal owns. The
 * follower COUNT anywhere on screen is `getFollowerCount`, which is arithmetic
 * over these rows — never a literal in a component, per the honesty doctrine.
 */
export interface Follow {
  id: string;
  followerName: string;
  companyId: string;
  createdAt: string;
}

/**
 * THE COMPANY SOCIAL SURFACE'S PROMOTIONAL-VIDEO SLOT — and NOT a resurrection
 * of `Company.video`.
 *
 * The reconciliation, recorded here so nobody reads this as decision 15
 * reversed: owner decision #15 (2026-08-29) removed `video` from the canonical
 * `Company` record, and it stays removed — see the note inside `Company`
 * above. The owner's OP-01 wording (2026-08-31, "creating promotional psots or
 * videos") is the LATER ruling and it is about THIS surface: the promotional
 * film lives on the company's SOCIAL presence, in its own store, S2-shaped.
 * The mountain-film request (06) stays open, unchanged, on the mountain
 * surface. `PromoVideo` — the existing closed union above — finally gets this
 * consumer back.
 */
export interface PromoVideoSlot {
  companyId: string;
  video: PromoVideo;
}

/* ========================================================================== */
/* Channels — a company broadcasts, members listen                            */
/* ========================================================================== */

/*
 * THE OWNER'S MODEL, in their words: "like on instagram when creators create
 * channels". A company posts promotional content, a climber joins if they want
 * to hear it, MEMBERS CANNOT REPLY, and the company sees how many people saw
 * each message.
 *
 * These shapes mirror `20260902180000_company_channels.sql` column for column.
 * The migration is the truth; when it is pushed, the Supabase implementation of
 * these methods is a repoint and nothing here changes.
 *
 * FIVE RULES LIVE IN THE DATABASE AND ARE VISIBLE HERE AS ABSENCES. Read the
 * absences as deliberate, because each one is:
 *
 *   1. No reply type, no comment type, no member-writable field. "Members
 *      cannot reply" is enforced by there being nowhere to put a reply. A
 *      read-only channel built as a chat with the reply box hidden is one
 *      forgotten prop away from being a chat again; two-way conversation is
 *      `Conversation`/`Message`, a different feature with a different name.
 *   2. `ChannelMessageStats.views` is COUNTED — one row per person per message
 *      in `channel_message_views` — so it is distinct people, never a counter
 *      that double-counts somebody re-reading.
 *   3. `ChannelMessageStats` carries a message id and a number and NOTHING
 *      ELSE. See the note on it.
 *   4. There is no member type in this file at all. See the note on
 *      `ChannelMessageStats`, and `CHANNEL_MEMBERS` in `memory/seed.ts`.
 *   5. No edit shape and no `updatedAt` on `ChannelMessage`: a promotional
 *      claim is stood behind or deleted, exactly as `Post` is.
 */

/**
 * One row of `channels`.
 *
 * `archivedAt` is the whole lifecycle. THERE IS NO DELETED STATE and no delete
 * method anywhere in this app: members joined something, and a company must not
 * be able to make it vanish from under them. An archived channel stops
 * accepting messages and stays readable — which is why this is a timestamp
 * rather than a boolean, so "when did this stop" survives too.
 *
 * `coverPath` is a path in the existing `operator-media` bucket, which is
 * already company-scoped. There is no equivalent on `ChannelMessage`, and that
 * is a real blocker rather than an omission: message media has no bucket yet,
 * so a channel message is text plus a product promotion and nothing else.
 */
export interface Channel {
  id: string;
  companyId: string;
  /** 1..60 after trimming, and unique within the company. */
  name: string;
  /** ≤300 after trimming. Null is "none written", never an empty string. */
  description: string | null;
  coverPath: string | null;
  /** Set = archived: no new messages, still readable. Never deleted. */
  archivedAt: string | null;
  createdAt: string;
}

/**
 * One row of `channel_messages`.
 *
 * WHAT A MESSAGE PROMOTES IS A PRODUCT, NEVER AN OFFER — and the migration was
 * corrected mid-build to say so, so the reasoning is worth carrying here. An
 * `offers` row is a PERSONAL, ADDRESSED, ONE-OUTCOME instrument: `thread_id`
 * NOT NULL, exactly one `recipient_id`, one acceptance. A broadcast to 1,200
 * members has no thread and cannot be accepted 1,200 times; decision 19 in the
 * offers migration forbids a cold offer outright; and broadcasting an existing
 * offer would show every member the best price that company privately quoted to
 * one named climber. So a message promotes something PURCHASABLE, and a member
 * who wants it enquires — which opens a thread, which is where a real offer
 * belongs. Broadcast and quote stay different objects because they behave
 * differently.
 *
 * `promoNote` IS TERMS, NEVER A PRICE. "15% off if you book before March", in
 * the seller's own words. A number here would be an unenforceable commitment
 * sitting outside the money model, and every real figure belongs to the product
 * or to an offer made in a thread — which is why this is free text and not a
 * `discountPct` or a `promoPriceCents` column. Do not format it as money.
 *
 * NO `updatedAt`, deliberately: there is no UPDATE policy on the table and no
 * edit method in the adapter, so nothing can be quietly reworded after people
 * have read it and the view count has accrued against the old words.
 */
export interface ChannelMessage {
  id: string;
  channelId: string;
  /**
   * The person who pressed send — a company does not press buttons. Kept so a
   * promotional claim traces to a human, exactly as `Post` does.
   */
  authorId: string;
  /**
   * The author's display name, carried for rendering — the same demo-world
   * convenience as `PostComment.authorName`. It names a colleague on the
   * caller's own team, never a member: see `ChannelMessageStats`.
   */
  authorName: string;
  /** 1..2000 after trimming. */
  body: string;
  /** The product being promoted, or null. */
  productId: string | null;
  /**
   * One departure of that product, or null. NEVER SET WITHOUT `productId` —
   * `channel_messages_departure_needs_product` in the migration. The write
   * side makes the invalid pair unrepresentable rather than validating it
   * late: see `ChannelPromotion` in `adapter.ts`.
   */
  departureId: string | null;
  /** Promotional terms in words. ≤300. Never a price — see above. */
  promoNote: string | null;
  createdAt: string;
}

/**
 * The ONLY thing a company learns about who read a message: how many.
 *
 * THIS SHAPE IS THE RULE. A count is not a list. The underlying
 * `channel_message_views` rows are readable by the viewer and by nobody else;
 * the company reads the `channel_message_stats` aggregate, and this interface
 * is that view's two useful columns. A company learning that a named climber
 * opened a named promotional offer at a named time is surveillance, not
 * analytics, and nobody joining a channel expects it.
 *
 * So there is no `viewers`, no `profileIds`, no `lastViewedAt` and no member
 * type in this file to hang one off — not because a screen would misuse them,
 * but so that a screen CANNOT: if a control were added tomorrow that wanted to
 * expand a count into a list, there would be no data behind it to leak. That
 * is the difference between a rule and a habit.
 *
 * `views` is a plain number rather than a `Reading` for one reason: it is
 * always counted. Zero views is a MEASURED ZERO — nobody opened it — and the
 * screen renders "0 views", never a blank and never a dash. It is also the
 * only engagement figure that exists here; there is no reach, no delivery
 * count and no open rate, because nothing measures those.
 */
export interface ChannelMessageStats {
  messageId: string;
  views: number;
}

/* ========================================================================== */
/* ContentVersion — the publication boundary                                  */
/* ========================================================================== */

/**
 * A proposed change and its decision.
 *
 * `payload` is a PARTIAL PATCH — only the fields being changed. That is what
 * makes two pending versions on one product able to coexist while their field
 * sets are disjoint, so an operator fixing a typo is not blocked behind a price
 * change waiting on review.
 *
 * `baseSnapshot` records the live values of those same fields as they stood when
 * editing started. At approval, if any has moved, the change is refused rather
 * than applied over the top — which catches the case a version counter misses:
 * ICEFALL editing a field directly while an operator's change to it sits
 * pending.
 *
 * `changedFields` is derived by a trigger. DO NOT SET IT; it will be overwritten.
 *
 * `decisionReason` is guaranteed non-empty on a rejection — a refusal without a
 * reason is refused by a constraint, so the screen can render it without a
 * fallback.
 */
export interface ContentVersion {
  id: string;
  entityType: ContentEntityType;
  entityId: string;
  companyId: string;
  payload: Record<string, unknown>;
  baseSnapshot: Record<string, unknown>;
  changedFields: string[];
  state: ContentVersionState;
  /** Set by the advisory contact-details validator; surfaced in review. */
  flags: string[];
  submittedBy: string | null;
  submittedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ========================================================================== */
/* Conversations, leads, bookings                                             */
/* ========================================================================== */

/**
 * A customer conversation — the existing `threads` table, extended.
 *
 * Not a second messaging system. The message an operator reads here is the same
 * row the climber sent, so the two cannot drift.
 */
export interface Conversation {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  productId: string | null;
  mountainId: string | null;
  leadId: string | null;
  /**
   * The product name as it stood when the enquiry was written.
   *
   * Spec §18: a conversation about an archived product keeps its history and
   * shows the name the customer actually saw.
   */
  productNameAtCreation: string | null;
  sourcePage: string | null;
  lastMessageAt: string;
  /** Per-person, so "unread" is a fact about a user, not about a message. */
  unread: boolean;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  fromCompany: boolean;
  body: string;
  createdAt: string;
}

/**
 * An internal sales note.
 *
 * A SEPARATE TABLE FROM `messages`, and Session 03 confirmed this was a real
 * hole in the original plan: the existing `messages_select` policy shows every
 * thread participant every row, so an internal note stored as a message reaches
 * the customer it is about. It also stays out of the realtime publication.
 */
export interface ConversationNote {
  id: string;
  conversationId: string;
  companyId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** Spec §10's pipeline, plus `disputed` from the shipped shape. */
export type LeadStatus = "new" | "contacted" | "qualified" | "quoted" | "booked" | "lost" | "disputed";

/** The six stages an operator moves a lead through. `disputed` is ICEFALL's. */
export const LEAD_PIPELINE: readonly LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "quoted",
  "booked",
  "lost",
] as const;

/**
 * WHO PRODUCED THIS LEAD — and therefore whose result it is.
 *
 * `icefall`: a climber enquired through an ICEFALL surface. These are the only
 * leads that may be counted in the scorecard screens, because those screens
 * exist to answer "is ICEFALL worth what I pay for it".
 *
 * `company`: the operator typed it in themselves — a phone call, a referral, a
 * repeat client. Legitimate CRM data, theirs to keep in one pipeline, and
 * NEVER attributable to ICEFALL. Mixing the two would let a busy season read as
 * ICEFALL performance, and a booking from one would land in a screen headed
 * "attributed to Icefall because the enquiry started here" — which would be
 * false, and the sort of false that has money attached to it.
 */
export type LeadOrigin = "icefall" | "company";

export interface Lead {
  id: string;
  companyId: string;
  customerId: string;
  customerName: string;
  conversationId: string | null;
  productId: string | null;
  mountainId: string | null;
  status: LeadStatus;
  origin: LeadOrigin;
  /**
   * The operator's own labels. Free text, theirs alone.
   *
   * Distinct from `company_internal.tags`, which is ICEFALL's commercial view
   * of a COMPANY and which this app may never read (see the Company comment).
   * These are a company's labels on their own customers.
   */
  tags: string[];
  /** The sales employee who owns it. */
  ownerId: string | null;
  bookingId: string | null;
  source: string | null;
  createdAt: string;
  firstResponseAt: string | null;
  qualifiedAt: string | null;
  quotedAt: string | null;
  bookedAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
}

export interface LeadNote {
  id: string;
  leadId: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/** `bookings.status`. What the Bookings screen filters on. */
export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Booking {
  id: string;
  status: BookingStatus;
  leadId: string | null;
  companyId: string;
  productId: string | null;
  mountainId: string | null;
  /**
   * Spec §18: a booking may be recorded without a value.
   *
   * A discriminated union rather than `number | null`, mirroring the schema's
   * `value_cents` + `value_status` pair and its coherence constraint: `reported`
   * requires a figure, the other two require NULL. Storing an unknown value as 0
   * is unrepresentable in the database, and unrepresentable here too.
   */
  value: BookingValue;
  currency: string;
  bookedAt: string;
  startsOn: string | null;
  /**
   * The referral rate as it stood at conversion.
   *
   * Written once, never looked up at read time, so settling the rate later
   * cannot rewrite historical revenue. Null while the rate is unset — the owner
   * has deliberately not chosen between two figures, and a placeholder must read
   * as a placeholder.
   */
  referralPctAtBooking: number | null;
}

/* ========================================================================== */
/* Notifications                                                              */
/* ========================================================================== */

export type NotificationType =
  | "enquiry_new"
  | "message_new"
  | "lead_assigned"
  | "lead_status_changed"
  | "booking_recorded"
  /** An edit went to Icefall and is awaiting review. The submitter's receipt. */
  | "content_submitted"
  | "content_approved"
  | "content_rejected"
  | "content_changes_requested"
  | "info_missing"
  | "admin_message"
  /**
   * Spec §2: when a placement expires the system creates a reminder and does NOT
   * reorder the mountain. These two are that reminder. Nothing in this codebase
   * may write a placement position in response to either — and in the shipped
   * schema nothing could, because the write path does not exist.
   */
  | "placement_expiring"
  | "placement_expired";

export interface OperatorNotification {
  id: string;
  companyUserId: string;
  companyId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

/* ========================================================================== */
/* Analytics                                                                  */
/* ========================================================================== */

export type AnalyticsEventType =
  | "listing_view"
  | "enquiry_started"
  | "lead_qualified"
  | "booking_recorded";

/**
 * Where an event came from, and therefore whether it may be believed.
 *
 * `client` rows are emitted by a consumer app with the public anon key, so
 * anyone holding that key — including the company the row flatters — can write
 * one. `server` rows come from a trusted emitter.
 *
 * THE SCHEMA ENFORCES THE ASYMMETRY: the insert policy on `analytics_events`
 * has `with check (source = 'client' or is_staff())`, so a signed-in user
 * cannot claim a row came from the server.
 *
 * ANYTHING COMMERCIAL MUST FILTER TO `server`. An operator's view count feeds a
 * renewal decision, and a figure the operator could inflate themselves is not a
 * measurement — it is the fabricated-number failure with extra steps, and worse
 * than the honest empty state because it looks real.
 */
export type AnalyticsSource = "client" | "server";

export interface AnalyticsEvent {
  id: string;
  occurredAt: string;
  eventType: AnalyticsEventType;
  /** Trust level. Not the page — see `sourcePage`. */
  source: AnalyticsSource;
  companyId: string;
  mountainId: string | null;
  productId: string | null;
  conversationId: string | null;
  leadId: string | null;
  /** The page the event happened on. */
  sourcePage: string | null;
}

/**
 * The counted funnel for a window.
 *
 * There is no `views` here on purpose — it is a `Reading` on the summary types,
 * because NOTHING IN THE ICEFALL FAMILY EMITS A LISTING-VIEW EVENT YET. Typing
 * it as a number would make rendering a zero the path of least resistance, and
 * an operator weighing paid placement would read that zero as a measurement.
 */
export interface FunnelCounts {
  enquiries: number;
  qualified: number;
  bookings: number;
}
