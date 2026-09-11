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
 * SIX ROLES — the owner's decision, brief §4.
 *
 * The union expresses all six. The LIVE DATABASE STORES TWO. Those are two
 * different statements and this file makes both of them, because collapsing
 * them is how a permission model starts lying:
 *
 *   `company_users.company_role text not null check (company_role in ('admin', 'sales'))`
 *   — icefall-supabase/migrations/20260828100000_crm_foundation.sql:333
 *
 * That constraint was deliberate ("Two roles, deliberately", line 331) and it
 * belongs to the schema session, not this one. So until it widens, a member row
 * can only come back holding `admin` or `sales`, and the four new values below
 * are a model of what the product means, not a description of what is stored.
 *
 * `roleFromStored()` in `authz.ts` is the ONE place that crosses between the
 * two, and it refuses to guess: nothing may treat an unreadable role as admin.
 * `icefall-sessions/requests/13-operator-six-roles.md` asks for the widening.
 */
export type CompanyRole =
  | "owner"
  | "admin"
  | "sales"
  | "operations"
  | "guide_coordinator"
  | "finance_read_only";

/**
 * The subset `company_users.company_role` can hold TODAY.
 *
 * Derived from `CompanyRole` with `Extract`, so it cannot drift into naming a
 * value the wider union does not have. Every write path that ends in a database
 * row should take THIS type, not `CompanyRole` — a role the schema will reject
 * should fail to compile rather than fail at 3am against Postgres.
 */
export type StoredCompanyRole = Extract<CompanyRole, "admin" | "sales">;

/** All six, in the order the brief lists them. Most powers first. */
export const COMPANY_ROLES = [
  "owner",
  "admin",
  "sales",
  "operations",
  "guide_coordinator",
  "finance_read_only",
] as const satisfies readonly CompanyRole[];

/** The two the check constraint permits. Widen the migration before this list. */
export const STORED_COMPANY_ROLES = ["admin", "sales"] as const satisfies readonly StoredCompanyRole[];

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

  /*
   * ---- Brief §4 Departure: the OPERATIONS side --------------------------
   *
   * The same row, extended — not a second departure type. The split write path
   * above is UNCHANGED: `availability` / `spotsTotal` / `spotsLeft` stay the
   * direct write, `departureDate` / `endDate` / `priceCents` stay staff-only via
   * a version. The fields below are a THIRD group — the company's own
   * operational record, which no climber ever sees and which lives on no live
   * column yet — written through `updateDepartureOperations` /
   * `setDepartureRoster` and nothing else.
   *
   * ALL OPTIONAL because `src/offline/fixtures.ts` and
   * `src/backend/supabaseBackend.ts` are frozen and build departures without
   * them; the memory seed fills them on the departures it operates. A departure
   * with `status === undefined` has NO operational record — screens say "not
   * set up", never "draft".
   */
  status?: DepartureStatus;
  /** The operator's own name for the trip — "South Col 2027, Team A". */
  name?: string | null;
  /**
   * The operational headcount limit — distinct from `spotsTotal`, which is the
   * ADVERTISED figure a climber reads. The roster is refused past this.
   */
  capacity?: number | null;
  meetingPoint?: string | null;
  /** PRIVATE to the company. Never reaches a climber; no contact guard. */
  internalNotes?: string | null;
  /** THE ROSTER: `Participant` ids. Guide/staff assignments are `Task`s. */
  participantIds?: string[];
  /** The proposal this departure was set up to deliver, when there was one. */
  proposalId?: string | null;
}

/** Brief §4 Departure.status. Describes the OPERATION, not the advertisement. */
export type DepartureStatus =
  | "draft"
  | "planning"
  | "confirmed"
  | "ready"
  | "underway"
  | "completed"
  | "cancelled";

export const DEPARTURE_STATUSES = [
  "draft",
  "planning",
  "confirmed",
  "ready",
  "underway",
  "completed",
  "cancelled",
] as const satisfies readonly DepartureStatus[];

/** The columns `authenticated` actually holds an UPDATE grant on. */
export const DEPARTURE_DIRECT_FIELDS = ["availability", "spotsTotal", "spotsLeft"] as const;

/**
 * The operational fields — the third write group described on the interface.
 * Neither the direct grant nor the version path; a CRM record of the company's
 * own. `participantIds` is deliberately NOT here: the roster has its own
 * method, because who is on a trip is checked against capacity and ownership.
 */
export const DEPARTURE_OPERATIONS_FIELDS = ["status", "name", "capacity", "meetingPoint", "internalNotes", "proposalId"] as const;

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
   * `createPost` runs `guardContactDetails("published", …)` over it and
   * refuses, verbatim.
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
  /**
   * The CRM `Contact` this enquiry belongs to (brief §4 Inquiry.contact_id).
   *
   * OPTIONAL only because two frozen implementations of the seam
   * (`src/offline/fixtures.ts`, `src/backend/supabaseLeads.ts`) build leads
   * without it and the live `leads` table has no such column yet. The memory
   * seed sets it on every named lead; `undefined` and `null` both read as
   * "not linked to a contact record".
   */
  contactId?: string | null;
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

/**
 * THE FOUR WORDS THE LIVE `bookings.status` COLUMN CAN HOLD TODAY, as this
 * portal reads them (`supabaseLeads.ts` maps the column's `reported` to
 * `pending`). Every frozen implementation of the seam writes one of these.
 */
export type StoredBookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

/**
 * The commercial lifecycle, brief §4 Booking / Commercial Record — TEN states,
 * plus the one legacy word.
 *
 * `pending` is NOT in the brief's set. It stays in this union because it is
 * what the live column and both frozen seams produce, and a type that could
 * not hold the stored value would make every live booking unreadable. It
 * means exactly what `deposit_pending` means — a booking recorded, no deposit
 * seen — and `normaliseBookingStatus()` says so in one place. New code writes
 * `deposit_pending`; old rows read as `pending`; nothing is invented either
 * way.
 *
 * NONE OF THESE WORDS IS PROOF MONEY MOVED. `paid` in the memory adapter
 * requires confirmed `FinancialEvent`s that add up to the quoted total, and a
 * financial event is only `confirmed` when its `source` names who saw the
 * money. Read the notes on `FinancialEvent` below.
 */
export type BookingStatus =
  | "inquiry"
  | "provisional"
  | "deposit_pending"
  | "confirmed"
  | "balance_pending"
  | "paid"
  | "cancelled"
  | "completed"
  | "refunded"
  | "disputed"
  | StoredBookingStatus;

/** The brief's ten, in lifecycle order. `pending` is absent: it maps to `deposit_pending`. */
export const BOOKING_STATUSES = [
  "inquiry",
  "provisional",
  "deposit_pending",
  "confirmed",
  "balance_pending",
  "paid",
  "cancelled",
  "completed",
  "refunded",
  "disputed",
] as const satisfies readonly BookingStatus[];

/** The ONE translation between the stored legacy word and the brief's set. */
export function normaliseBookingStatus(status: BookingStatus): Exclude<BookingStatus, "pending"> {
  return status === "pending" ? "deposit_pending" : status;
}

export interface Booking {
  id: string;
  status: BookingStatus;
  leadId: string | null;
  companyId: string;
  productId: string | null;
  mountainId: string | null;
  /*
   * ---- Brief §4 commercial fields --------------------------------------
   *
   * ALL OPTIONAL, for one reason and no other: `src/offline/fixtures.ts` and
   * `src/backend/supabaseLeads.ts` are frozen this wave and build `Booking`
   * literals without them, and the live `bookings` table does not carry these
   * columns (asked for in `icefall-sessions/requests/17-operator-crm-operating-system-schema.md`).
   * The memory seed fills every one. `undefined` reads as "not recorded" —
   * never as zero, never as "no deposit".
   */
  /** The accepted proposal this booking came from, when there was one. */
  proposalId?: string | null;
  /** The dated departure the customer is booked onto. */
  departureId?: string | null;
  /** The `Contact` who holds the booking. */
  primaryContactId?: string | null;
  /** Integer minor units. `null` is "not quoted", never 0. */
  quotedTotalMinor?: Cents | null;
  depositDueMinor?: Cents | null;
  balanceDueMinor?: Cents | null;
  /** UTC timestamps. */
  depositDueAt?: string | null;
  balanceDueAt?: string | null;
  /** The operator's own reference — their invoice or booking number. */
  externalReference?: string | null;
  /**
   * A payment provider's reference for this booking. NULL UNTIL A PROVIDER IS
   * CONNECTED — nothing in this app can produce one, and a screen must not
   * render its absence as "unpaid".
   */
  paymentProviderReference?: string | null;
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

/* ========================================================================== */
/* THE CRM OPERATING SYSTEM — brief §4, camelCased field for field            */
/* ========================================================================== */

/*
 * THE COMPANY'S OWN OPERATING SYSTEM. Everything above this line is ICEFALL's
 * side of the relationship — what a company publishes, what ICEFALL sends it.
 * Everything below is the company's own record of its own business: its
 * customers, proposals, participants, departures, suppliers and money. Brief
 * §1: ICEFALL is one SECTION of that system, not the system.
 *
 * FOUR RULES HOLD FOR EVERY TYPE IN THIS BLOCK, stated once:
 *
 *   1. FIELD NAMES ARE THE BRIEF'S, camelCased, in the brief's order. The one
 *      translation: the brief's `organization_id` is `companyId`, because this
 *      app has called the tenant `companyId` on every row since the schema
 *      contract. One word for one thing; the translation is written here and
 *      nowhere else.
 *   2. NO LIVE TABLE EXISTS FOR ANY OF THEM. They run against the memory
 *      adapter, in these shapes, so the Supabase implementation is a repoint —
 *      the route `leads.tags`, treks, posts and channels each took. The schema
 *      is asked for in `icefall-sessions/requests/17-operator-crm-operating-system-schema.md`.
 *      Until it lands the live seam simply lacks these methods and a screen
 *      says "not connected yet", never drawing an empty list as a fact.
 *   3. PRIVATE SURFACE. A contact's own email and phone, an emergency contact,
 *      a supplier's details, an internal note — these are the company's own
 *      data about its own people, and `guardContactDetails("private", …)` is a
 *      documented no-op. The published rule is enforced where text LEAVES the
 *      company (a channel message, a reply, an offer), not where it is stored.
 *      See the header of `contactGuard.ts`.
 *   4. MONEY IS INTEGER MINOR UNITS (`Cents`), always. A timestamp is UTC ISO.
 *      A `YYYY-MM-DD` is a LOCAL calendar day — `@/domain/dates`, never
 *      `new Date("YYYY-MM-DD")`.
 */

/* ---- Shared vocabularies ------------------------------------------------- */

/**
 * The completeness of ONE required item — brief §4 Document.status, and the
 * value of each of a `Participant`'s eight information fields (they share the
 * seven words exactly).
 *
 * THIS DESCRIBES WHETHER INFORMATION HAS ARRIVED AND BEEN LOOKED AT. It is not
 * a verdict. `reviewed` means a person on the operator's team has read what was
 * supplied; it does not mean the participant is fit, insured adequately, or
 * safe to go. No screen may render any of these seven as "cleared", "approved"
 * or "passed" — brief §3.1 and §4 ("These statuses describe information
 * completeness, not medical or safety approval").
 */
export type RequirementStatus =
  | "not_requested"
  | "requested"
  | "received"
  | "reviewed"
  | "expired"
  | "rejected"
  | "unavailable";

export const REQUIREMENT_STATUSES = [
  "not_requested",
  "requested",
  "received",
  "reviewed",
  "expired",
  "rejected",
  "unavailable",
] as const satisfies readonly RequirementStatus[];

/**
 * WHAT A VIEWER WITHOUT `viewSensitiveParticipantData` READS IN A SENSITIVE
 * FIELD. Brief §3.1 names `forbidden` as an explicit state, and it is the
 * honest one here: the value exists, this person may not see it. It is NEVER
 * STORED — every write path takes `RequirementStatus`, so it cannot be — and
 * it is never the same thing as `null` or `unavailable`, which mean the
 * information itself is missing. The adapter substitutes it at read time;
 * screens render it as "hidden from your role", never as a blank.
 */
export type RedactedFieldStatus = "forbidden";
export const REDACTED: RedactedFieldStatus = "forbidden";

/** Brief §4 Organization.verification_status — reused wherever verification is a word. */
export type VerificationStatus = "not_submitted" | "in_review" | "verified" | "expired" | "rejected";

/**
 * Consent, as the CRM records it for a contact or a referral. Brief §4 names
 * the field and not its values; these four are the minimum that lets a screen
 * distinguish "never asked" from "asked and said no", which the honesty rule
 * requires.
 */
export type ConsentStatus = "not_asked" | "given" | "declined" | "withdrawn";

export const CONSENT_STATUSES = ["not_asked", "given", "declined", "withdrawn"] as const satisfies readonly ConsentStatus[];

/* ---- Contact / Customer -------------------------------------------------- */

export type ContactChannel = "email" | "phone" | "message";

/** Brief §4 Contact.communication_preferences — how they asked to be reached. */
export interface CommunicationPreferences {
  preferredChannel: ContactChannel | null;
  /** They asked not to be contacted. Honoured by the operator; this app sends nothing anyway. */
  doNotContact: boolean;
}

/**
 * Brief §4 Contact / Customer. THE COMPANY'S OWN CUSTOMER RECORD.
 *
 * `email` and `phone` are PRIVATE SURFACE and stored freely — a CRM that cannot
 * hold a customer's phone number is not a CRM (see `contactGuard.ts`). Nothing
 * in this app forwards them to a climber-facing surface.
 *
 * Deduplication is a REVIEW, never a merge: `findDuplicateContacts` returns
 * candidates and `mergeContacts` is an explicit, audited act (brief §4: "Do
 * not merge contacts automatically based only on a similar name or email").
 */
export interface Contact {
  id: string;
  /** The brief's `organization_id`. */
  companyId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  /** The language they want to be written to in — "en", "es", "no". */
  language: string | null;
  consentStatus: ConsentStatus;
  /** When marketing consent was GIVEN. Null unless `consentStatus` records it. */
  marketingConsentAt: string | null;
  communicationPreferences: CommunicationPreferences;
  createdAt: string;
  updatedAt: string;
}

/** A party travelling together — one leader, every member a `Contact`. */
export interface ContactGroup {
  id: string;
  companyId: string;
  name: string;
  /** Always one of `memberContactIds`; the adapter refuses otherwise. */
  leaderContactId: string;
  memberContactIds: string[];
}

/* ---- Communication / Activity ------------------------------------------ */

export type ActivityType = "email" | "call" | "message" | "note" | "meeting" | "system_event";
export type ActivityDirection = "inbound" | "outbound" | "internal";
export type ActivityStatus = "draft" | "scheduled" | "sent" | "received" | "failed" | "cancelled";

export const ACTIVITY_TYPES = ["email", "call", "message", "note", "meeting", "system_event"] as const satisfies readonly ActivityType[];
export const ACTIVITY_DIRECTIONS = ["inbound", "outbound", "internal"] as const satisfies readonly ActivityDirection[];
export const ACTIVITY_STATUSES = ["draft", "scheduled", "sent", "received", "failed", "cancelled"] as const satisfies readonly ActivityStatus[];

/**
 * Brief §4 Communication / Activity — the timeline entry on a contact, an
 * inquiry or a booking.
 *
 * `status` CAN NEVER REACH `sent` FROM THIS APP. External sending requires a
 * provider connection, consent and a user-controlled send action (brief §4),
 * and no provider is connected. The memory adapter refuses `sent` on create and
 * on every status change, with the reason shown. `received` is different: an
 * inbound email the operator is LOGGING arrived by their own mail — recording
 * that it arrived is a fact about the past, not a claim about a connection.
 *
 * `inquiryId` IS A `Lead` ID. The brief's Inquiry is this app's `Lead`; the
 * field keeps the brief's name so the two vocabularies meet in one place.
 */
export interface Activity {
  id: string;
  companyId: string;
  contactId: string | null;
  /** A `Lead.id`. */
  inquiryId: string | null;
  bookingId: string | null;
  type: ActivityType;
  direction: ActivityDirection;
  status: ActivityStatus;
  subject: string;
  /** The text itself, or a reference to where it lives. PRIVATE surface. */
  bodyOrReference: string | null;
  scheduledAt: string | null;
  /** Null in this app, always — nothing here sends. */
  sentAt: string | null;
  /** A `CompanyUser.id`. */
  createdBy: string;
  createdAt: string;
}

/* ---- Assignment / Operational Task -------------------------------------- */

export type TaskType = "guide" | "supplier" | "permit" | "transport" | "document" | "participant_follow_up" | "other";
export type TaskStatus = "open" | "in_progress" | "blocked" | "completed" | "cancelled";

export const TASK_TYPES = ["guide", "supplier", "permit", "transport", "document", "participant_follow_up", "other"] as const satisfies readonly TaskType[];
export const TASK_STATUSES = ["open", "in_progress", "blocked", "completed", "cancelled"] as const satisfies readonly TaskStatus[];

/**
 * Brief §4 Assignment / Operational Task. A guide assignment IS a task of type
 * `guide` on a departure — there is no separate assignment table, per the brief.
 */
export interface Task {
  id: string;
  companyId: string;
  /** A `ProductDeparture.id`, or null for a task not tied to one trip. */
  departureId: string | null;
  type: TaskType;
  /** A `CompanyUser.id` on the caller's own team. */
  assigneeId: string;
  /** A `Supplier.id`, for supplier / transport / permit work. */
  supplierId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: string | null;
  /** Set exactly when `status === "completed"`. */
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ---- Trip Brief --------------------------------------------------------- */

/** Brief §4 TripBrief.preferred_dates — LOCAL days, `YYYY-MM-DD`, either end open. */
export interface PreferredDates {
  startDay: string | null;
  endDay: string | null;
}

/**
 * Brief §4 Trip Brief — the qualified inquiry restated as what the operator
 * will actually plan for, without retyping the core fields.
 *
 * `objectiveId` IS A `Mountain.id` (the slug — "ama-dablam"). The brief's
 * Objective / Mountain maps onto this app's `Mountain`, and `Lead.mountainId`
 * already carries the same id, so a brief is created from an inquiry without a
 * second lookup. It is NOT a product id: a brief describes what the customer
 * wants to undertake, and the product is the operator's answer to it.
 *
 * `companyId` is not in the brief's field list. It is here because every scoped
 * read in this adapter goes through one tenant filter and the brief's own rule
 * — "Every organization-owned query must be tenant-scoped" — is not satisfiable
 * through a join the memory store does not have.
 */
export interface TripBrief {
  id: string;
  companyId: string;
  /** A `Lead.id`. */
  inquiryId: string;
  /** A `Mountain.id`. */
  objectiveId: string | null;
  preferredDates: PreferredDates;
  flexibilitySummary: string | null;
  groupSummary: string | null;
  experienceSummary: string | null;
  /** What the operator is ASSUMING and has not confirmed — stated, so it can be checked. */
  operatorAssumptions: string | null;
  /** Open questions the customer must answer before a proposal is honest. */
  requirementsToConfirm: string[];
  /** PRIVATE surface. */
  internalNotes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ---- Proposal + Proposal Version --------------------------------------- */

export type ProposalStatus = "draft" | "internal_review" | "sent" | "accepted" | "declined" | "expired" | "superseded";

export const PROPOSAL_STATUSES = ["draft", "internal_review", "sent", "accepted", "declined", "expired", "superseded"] as const satisfies readonly ProposalStatus[];

/**
 * Brief §4 Proposal — the commercial offer to one inquiry.
 *
 * THREE RULES THE MEMORY ADAPTER ENFORCES, and a schema must too:
 *
 *   1. `sent` REQUIRES `approvedBy`. Internal approval (`approveProposals` —
 *      owner/admin) comes first; `setProposalStatus(…, "sent")` is refused
 *      without it. A price a company commits to is approved by somebody who
 *      may commit the company.
 *   2. A SENT PROPOSAL IS NEVER OVERWRITTEN. `updateProposal` is refused once
 *      the status is `sent` or later; the only route is `createProposalVersion`,
 *      which appends a new `ProposalVersion`, applies the header change with
 *      it, clears the approval (a changed commitment needs approving again) and
 *      returns the proposal to `draft`. The prior version is untouched — it is
 *      SUPERSEDED BY DERIVATION (see `ProposalVersion`), never edited.
 *   3. `depositMinor + balanceMinor === totalMinor`, in integers, on every write.
 *
 * `sent` MEANS THE CUSTOMER HAS IT — a fact the operator records about their
 * own commercial process, sent through their own channels. It is not a claim
 * that this app delivered anything; nothing here sends (see `Activity`).
 */
export interface Proposal {
  id: string;
  companyId: string;
  /** A `Lead.id`. */
  inquiryId: string;
  tripBriefId: string | null;
  status: ProposalStatus;
  /** ISO 4217 — "EUR". Explicit on every proposal; never assumed. */
  currency: string;
  totalMinor: Cents;
  depositMinor: Cents;
  balanceMinor: Cents;
  /** A LOCAL day, `YYYY-MM-DD`. */
  validUntil: string | null;
  cancellationPolicyReference: string | null;
  createdBy: string;
  /** A `CompanyUser.id` holding `approveProposals`. Required before `sent`. */
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Brief §4 Proposal Version — one immutable statement of what was offered.
 *
 * VERSIONS ARE APPEND-ONLY. There is no update method for a version anywhere
 * in this app, and there must not be one: "Never overwrite a sent proposal
 * without preserving the previous version" is satisfied by there being nothing
 * that can overwrite any version at all.
 *
 * WHICH VERSION IS CURRENT IS DERIVED, NOT STORED — the highest
 * `versionNumber` on the proposal. Every lower number is superseded. The brief
 * gives a version no status field, and this app adds none: `isCurrentVersion()`
 * in `@/domain/crm` is the one definition, the same way placement expiry and
 * story expiry are derived rather than written by a timer.
 *
 * `pricingSnapshot` IS THE SHARED `Quote` from `src/money/model.ts` — one
 * money model in the family, not a second one. Null while the version carries
 * no priced breakdown; the header totals on `Proposal` are still explicit.
 */
export interface ProposalVersion {
  id: string;
  proposalId: string;
  /** 1, 2, 3 … — assigned by the adapter, never by the caller. */
  versionNumber: number;
  itineraryContent: ItineraryDay[];
  inclusions: string[];
  exclusions: string[];
  /** What the customer must have or do — experience, kit, insurance. Words, not verdicts. */
  requirements: string[];
  pricingSnapshot: import("../money/model").Quote | null;
  /** Why this version exists, in the author's words. Required from version 2. */
  changeSummary: string | null;
  createdBy: string;
  createdAt: string;
}

/* ---- Financial Event ---------------------------------------------------- */

export type FinancialEventType =
  | "quote"
  | "invoice"
  | "deposit_due"
  | "deposit_received"
  | "balance_due"
  | "balance_received"
  | "refund_requested"
  | "refund_issued"
  | "commission_due"
  | "commission_received";

export type FinancialEventStatus = "draft" | "issued" | "reported" | "confirmed" | "cancelled" | "unavailable";

export const FINANCIAL_EVENT_TYPES = [
  "quote",
  "invoice",
  "deposit_due",
  "deposit_received",
  "balance_due",
  "balance_received",
  "refund_requested",
  "refund_issued",
  "commission_due",
  "commission_received",
] as const satisfies readonly FinancialEventType[];

export const FINANCIAL_EVENT_STATUSES = ["draft", "issued", "reported", "confirmed", "cancelled", "unavailable"] as const satisfies readonly FinancialEventStatus[];

/**
 * WHO SAYS THIS MONEY MOVED — brief §4 FinancialEvent.source, typed so the
 * question cannot go unanswered.
 *
 *   `provider`               a connected payment provider reported it. NONE IS
 *                            CONNECTED; the memory adapter accepts the shape so
 *                            the seam is ready, and the seed never uses it.
 *   `operator_confirmation`  a named member of the company saw the money — a
 *                            bank statement, a receipt in hand.
 *   `manual_entry`           a named member typed it in on somebody's word —
 *                            "the customer says they paid". Not confirmation.
 *   `customer_report`        the customer told us. Not confirmation either.
 *
 * ONLY THE FIRST TWO CAN CARRY AN EVENT TO `confirmed`. The other two stop at
 * `reported`, and the adapter refuses otherwise. "A recorded amount is not
 * proof that money moved. Payment status must identify its source."
 */
export type FinancialEventSource =
  | { kind: "provider"; provider: string }
  | { kind: "operator_confirmation"; confirmedBy: string }
  | { kind: "manual_entry"; enteredBy: string }
  | { kind: "customer_report"; reportedBy: string };

/** Brief §4 Financial Event / Invoice / Payment Status — one auditable line. */
export interface FinancialEvent {
  id: string;
  companyId: string;
  bookingId: string;
  type: FinancialEventType;
  status: FinancialEventStatus;
  /** Integer minor units; `null` when the amount is genuinely not known. */
  amountMinor: Cents | null;
  currency: string;
  source: FinancialEventSource;
  /** Invoice number, bank reference, provider id — the operator's or the provider's. */
  externalReference: string | null;
  /** When it took / takes effect — a due date, a receipt date. UTC. */
  effectiveAt: string | null;
  createdAt: string;
}

/* ---- Participant + Document / Requirement -------------------------------- */

export type ParticipantStatus =
  | "lead"
  | "invited"
  | "information_incomplete"
  | "ready_for_review"
  | "ready_for_departure"
  | "completed"
  | "cancelled";

export const PARTICIPANT_STATUSES = [
  "lead",
  "invited",
  "information_incomplete",
  "ready_for_review",
  "ready_for_departure",
  "completed",
  "cancelled",
] as const satisfies readonly ParticipantStatus[];

/**
 * The three statuses NO SCREEN MAY SET. They are derived from the eight
 * information fields by `deriveParticipantStatus()` in `@/domain/crm`, inside
 * the adapter, every time a field moves. `setParticipantStatus` refuses them.
 */
export const DERIVED_PARTICIPANT_STATUSES = [
  "information_incomplete",
  "ready_for_review",
  "ready_for_departure",
] as const satisfies readonly ParticipantStatus[];

/** The eight information fields, by their `Participant` key. */
export type ParticipantInformationField =
  | "emergencyContactStatus"
  | "insuranceStatus"
  | "waiverStatus"
  | "identityDocumentStatus"
  | "experienceInformationStatus"
  | "fitnessInformationStatus"
  | "medicalInformationStatus"
  | "consentStatus";

export const PARTICIPANT_INFORMATION_FIELDS = [
  "emergencyContactStatus",
  "insuranceStatus",
  "waiverStatus",
  "identityDocumentStatus",
  "experienceInformationStatus",
  "fitnessInformationStatus",
  "medicalInformationStatus",
  "consentStatus",
] as const satisfies readonly ParticipantInformationField[];

/**
 * THE SENSITIVE TWO (brief §3.3, and the brief's instruction for this wave).
 * Read by roles holding `viewSensitiveParticipantData` only; everyone else
 * receives `REDACTED` in these two fields, substituted by the adapter, not the
 * screen.
 */
export type ParticipantSensitiveField = Extract<
  ParticipantInformationField,
  "fitnessInformationStatus" | "medicalInformationStatus"
>;

export const PARTICIPANT_SENSITIVE_FIELDS = [
  "fitnessInformationStatus",
  "medicalInformationStatus",
] as const satisfies readonly ParticipantSensitiveField[];

/**
 * Brief §4 Participant — a person going on a trip, and how complete their
 * paperwork is.
 *
 * `status` IS DERIVED between `invited` and `ready_for_departure`. Only `lead`,
 * `invited`, `completed` and `cancelled` are set by a person; the three in
 * between are computed from the eight fields (see `deriveParticipantStatus`).
 * A screen cannot set `ready_for_departure`, and the adapter refuses if asked.
 *
 * `ready_for_departure` MEANS EVERY ITEM HAS BEEN REVIEWED. It does not mean
 * the person is fit, safe, insured enough or approved. No wording anywhere in
 * this portal may say a participant has been "cleared" — brief §3.2 forbids
 * the verdict, and §4 says what these fields are: information completeness.
 *
 * `fitnessInformationStatus` and `medicalInformationStatus` are typed to admit
 * `REDACTED` because a read by a role without `viewSensitiveParticipantData`
 * returns it there. The write path takes `RequirementStatus` only.
 */
export interface Participant {
  id: string;
  companyId: string;
  contactId: string;
  /** A `Lead.id`. */
  inquiryId: string | null;
  proposalId: string | null;
  status: ParticipantStatus;
  emergencyContactStatus: RequirementStatus;
  insuranceStatus: RequirementStatus;
  waiverStatus: RequirementStatus;
  identityDocumentStatus: RequirementStatus;
  experienceInformationStatus: RequirementStatus;
  /** SENSITIVE. `REDACTED` for a viewer without `viewSensitiveParticipantData`. */
  fitnessInformationStatus: RequirementStatus | RedactedFieldStatus;
  /** SENSITIVE. `REDACTED` for a viewer without `viewSensitiveParticipantData`. */
  medicalInformationStatus: RequirementStatus | RedactedFieldStatus;
  consentStatus: RequirementStatus;
  /**
   * A LOCAL day, `YYYY-MM-DD`: the operator's stated retention date for this
   * person's data. Recorded so the deletion duty is visible; nothing in this
   * app deletes on it yet, and no screen may imply otherwise.
   */
  retentionUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType =
  | "waiver"
  | "insurance"
  | "identity"
  | "passport"
  | "permit"
  | "medical_information"
  | "emergency_contact"
  | "other";

export const DOCUMENT_TYPES = [
  "waiver",
  "insurance",
  "identity",
  "passport",
  "permit",
  "medical_information",
  "emergency_contact",
  "other",
] as const satisfies readonly DocumentType[];

/** The document types whose CONTENT is read only under `viewSensitiveParticipantData`. */
export const SENSITIVE_DOCUMENT_TYPES = ["medical_information"] as const satisfies readonly DocumentType[];

/**
 * Brief §4 Document / Requirement — one required item for one participant.
 *
 * `storageReference` IS A REFERENCE, NEVER A URL. A path in a private store,
 * resolved by a signed read that does not exist yet; nothing here may hold or
 * build a public link (brief §4: "Do not store sensitive documents in an
 * unprotected public bucket"). A missing document renders as missing, never as
 * approved.
 *
 * For a `medical_information` document read by a role without
 * `viewSensitiveParticipantData`, BOTH `status` and `storageReference` come
 * back `REDACTED` — a medical status is itself information about a person's
 * health. Every other type keeps its status visible to every role, because
 * completeness is what the readiness screen exists to show.
 */
export interface Document {
  id: string;
  companyId: string;
  participantId: string;
  type: DocumentType;
  status: RequirementStatus | RedactedFieldStatus;
  /** A LOCAL day, `YYYY-MM-DD`. */
  expiresAt: string | null;
  storageReference: string | null | RedactedFieldStatus;
  /** A `CompanyUser.id`. Set exactly when `status === "reviewed"`. */
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** The consent record under which this was collected. A reference, never the content. */
  consentReference: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ---- Supplier / Partner and Guide / Staff Resource ---------------------- */

export type SupplierType = "ground_handler" | "transport" | "lodging" | "permit_authority" | "equipment" | "referral_partner" | "other";
export type SupplierStatus = "prospect" | "active" | "paused" | "archived";

export const SUPPLIER_TYPES = ["ground_handler", "transport", "lodging", "permit_authority", "equipment", "referral_partner", "other"] as const satisfies readonly SupplierType[];
export const SUPPLIER_STATUSES = ["prospect", "active", "paused", "archived"] as const satisfies readonly SupplierStatus[];

/** Brief §4 Supplier / Partner. `contactDetails` is PRIVATE surface. */
export interface Supplier {
  id: string;
  companyId: string;
  name: string;
  type: SupplierType;
  country: string | null;
  contactDetails: string | null;
  contractReference: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
}

export type AvailabilityStatus = "not_stated" | "available" | "unavailable";

/**
 * Brief §4 Guide / Staff Resource.
 *
 * `verificationStatus` DEFAULTS TO `not_submitted` AND THIS APP CANNOT RAISE IT
 * TO `verified`. "Do not create or display qualifications that have not been
 * verified" — and nobody in an operator's portal is the verifying party.
 * `qualificationsReference` is where the guide's OWN claim is filed, and a
 * screen labels it as a claim on file until the status says otherwise.
 *
 * `insuranceStatus` is a `RequirementStatus` — the same completeness word as
 * a participant's, for the same reason: it says whether the paper arrived.
 */
export interface GuideResource {
  id: string;
  companyId: string;
  /** A profile id when the guide has an ICEFALL account, else an external contact reference. */
  profileIdOrExternalContactId: string;
  role: string;
  qualificationsReference: string | null;
  verificationStatus: VerificationStatus;
  insuranceStatus: RequirementStatus;
  availabilityStatus: AvailabilityStatus;
  /** PRIVATE surface. */
  contactPreferences: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ---- Referral Event (the ICEFALL section) ------------------------------- */

/**
 * Brief §4 Referral Event — ICEFALL's record that it introduced a climber to
 * this company. WRITTEN BY ICEFALL, READ HERE. There is no operator create
 * method: a company cannot record its own referrals from ICEFALL.
 *
 * NO BOOKING AND NO COMMISSION IS RECORDED FROM ONE OF THESE. It is an
 * introduction. Money follows only when a real `FinancialEvent` of type
 * `commission_due` is raised against a real booking, with a source.
 *
 * `operatorCompanyId` keeps the brief's exact name rather than collapsing to
 * `companyId`, because it is the one row in this file scoped to a company that
 * did not author it.
 */
export interface ReferralEvent {
  id: string;
  icefallUserId: string;
  /** The brief's `operator_organization_id` — this company. */
  operatorCompanyId: string;
  /** A `Lead.id`. */
  inquiryId: string | null;
  /** Where on ICEFALL the introduction happened — "app:expedition-detail". */
  sourceSurface: string;
  attributionToken: string;
  consentStatus: ConsentStatus;
  createdAt: string;
}

/* ---- Audit Event -------------------------------------------------------- */

export type AuditEntityType =
  | "contact"
  | "contact_group"
  | "activity"
  | "task"
  | "trip_brief"
  | "proposal"
  | "proposal_version"
  | "booking"
  | "financial_event"
  | "participant"
  | "document"
  | "departure"
  | "supplier"
  | "guide_resource"
  /*
   * The pre-existing records this adapter also mutates. The brief's rule is
   * "every mutating method", so the trail covers the ICEFALL side too.
   */
  | "inquiry"
  | "company_user"
  | "product"
  | "content_version"
  | "conversation"
  | "post"
  | "promo_video"
  | "channel"
  | "channel_message";

/**
 * Brief §4 Audit Event — one row per mutating call, written by the adapter's
 * `audit()` helper and by the seed through the same builder.
 *
 * SNAPSHOTS CARRY NO SENSITIVE CONTENT. `buildAuditEvent` in `@/domain/crm`
 * strips medical and fitness statuses, storage and consent references, contact
 * details and free-text bodies, recording `"[redacted]"` where a value changed
 * — so the fact of a change is kept and its content is not. Ids and ordinary
 * statuses stay.
 *
 * `beforeSnapshotOrDiff` / `afterSnapshotOrDiff` hold ONLY the keys that
 * changed (a diff) on an update, the full stripped record on a create, and
 * null where there was nothing before or nothing after.
 */
export interface AuditEvent {
  id: string;
  companyId: string;
  /** A `CompanyUser.id`. */
  actorId: string;
  entityType: AuditEntityType;
  entityId: string;
  /** "created", "updated", "status_changed", "merged", "version_created", … */
  action: string;
  beforeSnapshotOrDiff: Record<string, unknown> | null;
  afterSnapshotOrDiff: Record<string, unknown> | null;
  createdAt: string;
}
