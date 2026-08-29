import type { Company } from "@/data/companies";

/**
 * The live-preview contract between the operator portal's editor and this app.
 *
 * ── WHY AN IFRAME AND NOT A REBUILT PAGE ────────────────────────────────────
 *
 * The operator portal needs to show a company what its public listing will look
 * like while they edit it. It first did that by rebuilding this page inside the
 * portal, which was rejected: it looked close in isolation and visibly wrong
 * beside the real thing. A rebuilt preview is a second implementation, and this
 * codebase has already paid for that lesson twice — `peaks.ts` exists because
 * one summit altitude lived in two places and disagreed, and `RealBusiness.tsx`
 * exists because the disclosure guard lived in one component while the claim was
 * rendered by three. A preview screen's entire value is being trustworthy about
 * what a climber will see, and a copy cannot be trustworthy about that by
 * construction.
 *
 * So the editor embeds THIS page and pushes the draft into it.
 *
 * ── THE THREAT MODEL, WHICH IS NOT THE OBVIOUS ONE ──────────────────────────
 *
 * The instinct is to secure this with an origin check. An origin check is
 * necessary and it is NOT the boundary. It stops the wrong sender; it says
 * nothing about the payload. In the real product the payload originates from an
 * OPERATOR — an untrusted external party by design — so a perfectly
 * authenticated message from exactly the right origin still carries untrusted
 * content. The allowlist below is the boundary.
 *
 * Two consequences worth stating, because both are easy to get wrong:
 *
 *   • NEVER SPREAD THE DRAFT. `{ ...stored, ...draft }` is how a field nobody
 *     audited reaches a sink nobody checked. Every field is copied explicitly
 *     or it does not arrive.
 *
 *   • THE DANGEROUS FIELD IS NOT THE EXOTIC ONE. It is `realBusiness`, a
 *     boolean. It decides whether the page carries the "this is a real company,
 *     ICEFALL has no partnership with it" banner and whether the demo notice is
 *     swapped for the wording that does not falsely claim the company is
 *     invented. A draft that could clear it would render a real operator's page
 *     with the disclosure removed. It is read from the STORED record only.
 *
 * `id` is likewise never taken from a draft — the preview renders the company in
 * the route, and an id is a lookup key, not content.
 */
export const PREVIEW_PROTOCOL_VERSION = 1;

/**
 * The section contract, in ONE place.
 *
 * The page derives its measurable sections from this list rather than each
 * section naming itself, so the list and the page cannot quietly disagree. If a
 * section is renamed or restructured and this list is not updated, the page
 * reports `not-found` for it rather than silently omitting it — a missing
 * outline that looks like a working editor is the failure this is designed
 * against.
 */
export const SECTION_IDS = [
  "hero",
  "about",
  "story",
  "why-climb",
  "featured-trips",
  "credentials",
  "reviews",
  "team",
  "gallery",
  "faq",
] as const;

/*
 * ── DO NOT ADD AN ID HERE BEFORE THE SECTION RENDERS ────────────────────────
 *
 * `video` belongs in this list and is deliberately not in it yet.
 *
 * A company-page film block was approved (decision 16: the page lists the films
 * an operator has already published against their mountain placements, rather
 * than introducing a company-level film). The block has not been built, because
 * the session that designed it cannot write to `Company.tsx`.
 *
 * Adding `video` to this list before the block exists would make the page report
 * `not-found` for it on every single measurement, forever — and `not-found` is
 * defined as the loud case, the one the editor is supposed to treat as an error
 * and surface. So the editor would show a permanent, unfixable error about a
 * section nobody can build yet.
 *
 * That is the ordering rule that produced this whole episode, wearing its third
 * costume: an editor control that writes into nothing (Session 04's shipped
 * "Promotional film" row), a page block no data can reach (what decisions 14 and
 * 15 together would have produced), and now a declared section id with no
 * section behind it. **The id and the block land in the same change.**
 */

export type SectionId = (typeof SECTION_IDS)[number];

/**
 * Why a declared section has no rectangle.
 *
 * The distinction matters: two of these are normal and one is a bug, and an
 * editor that cannot tell them apart either cries wolf or misses the real
 * failure.
 *
 *   • `tab-inactive` — normal. This page is TABBED and unselected tabs are not
 *     in the DOM at all. Ask for the section with a `show` message first.
 *   • `empty`        — normal. The record has no data for it (a company with no
 *     team), and the page deliberately renders nothing rather than an empty
 *     frame.
 *   • `not-found`    — a bug. The id is in `SECTION_IDS` and the page could not
 *     find it, which means this contract has gone stale against the layout.
 */
export type MissingReason = "tab-inactive" | "empty" | "not-found";

export interface SectionRect {
  id: SectionId;
  /** Relative to the iframe's own viewport — add the iframe offset yourself. */
  rect: { x: number; y: number; width: number; height: number } | null;
  reason?: MissingReason;
}

export interface RejectedField {
  field: string;
  why: string;
}

export type PreviewInbound =
  | { protocolVersion: number; type: "icefall:preview:draft"; company: unknown }
  | { protocolVersion: number; type: "icefall:preview:show"; sectionId: string }
  | { protocolVersion: number; type: "icefall:preview:ping" };

export type PreviewOutbound =
  | { protocolVersion: number; type: "icefall:preview:ready"; sections: readonly SectionId[] }
  | {
      protocolVersion: number;
      type: "icefall:preview:sections";
      activeTab: string;
      rects: SectionRect[];
    }
  | { protocolVersion: number; type: "icefall:preview:rejected"; rejected: RejectedField[] };

/* -------------------------------------------------------------------------- */
/* The validator — the actual security boundary                               */
/* -------------------------------------------------------------------------- */

const MAX_TEXT = 2000;
const MAX_SHORT = 200;
const MAX_ITEMS = 40;

function str(v: unknown, cap: number): string | undefined {
  return typeof v === "string" ? v.slice(0, cap) : undefined;
}

/** A finite number inside a range, or undefined. Never NaN, never Infinity. */
function num(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.min(max, Math.max(min, v));
}

function int(v: unknown, min: number, max: number): number | undefined {
  const n = num(v, min, max);
  return n === undefined ? undefined : Math.round(n);
}

/**
 * A URL a draft is allowed to put in an `<img src>`.
 *
 * `https:` and app-relative paths only. Not `http:` (mixed content), not
 * `data:` (an SVG data URI executes script if it is ever navigated to rather
 * than merely rendered), not `blob:`, and not `javascript:` — which cannot run
 * from `img src` in a current browser but must never be allowed to survive into
 * a future `href`. A protocol-relative `//host/x` is rejected because it
 * inherits the page's scheme rather than declaring one.
 */
function url(v: unknown): string | undefined {
  const s = str(v, 2048);
  if (!s) return undefined;
  if (s.startsWith("//")) return undefined;
  if (s.startsWith("/")) return s;
  return /^https:\/\//i.test(s) ? s : undefined;
}

function list<T>(v: unknown, each: (item: unknown) => T | undefined): T[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: T[] = [];
  for (const item of v.slice(0, MAX_ITEMS)) {
    const parsed = each(item);
    if (parsed !== undefined) out.push(parsed);
  }
  return out;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Merge an untrusted draft over a stored company record.
 *
 * Returns the record to render plus everything that was refused, so the editor
 * can tell the operator WHY their image did not appear rather than leaving them
 * to guess. Media is validated at the drop in the portal; this is the backstop
 * for anything that gets past it, and a backstop that fails silently is not one.
 *
 * Fields absent from the draft fall through to the stored record, so a partial
 * draft is valid and an editor need not know about every field to preview one.
 */
export function applyCompanyDraft(
  stored: Company,
  raw: unknown,
): { company: Company; rejected: RejectedField[] } {
  const draft = obj(raw);
  const rejected: RejectedField[] = [];
  if (!draft) return { company: stored, rejected };

  const next: Company = { ...stored };

  // ── Identity and disclosure: never from a draft ──────────────────────────
  // Explicit rather than merely absent, so a reader can see the decision.
  if ("realBusiness" in draft) {
    rejected.push({
      field: "realBusiness",
      why: "Set by ICEFALL, never by a draft. It decides whether this listing carries its real-business disclosure.",
    });
  }
  if ("id" in draft) {
    rejected.push({ field: "id", why: "The preview renders the company in the route." });
  }
  if ("verifiedOn" in draft) {
    rejected.push({
      field: "verifiedOn",
      why: "A verification date is a record of what ICEFALL checked, not something a listing can assert.",
    });
  }

  // ── Text ────────────────────────────────────────────────────────────────
  const name = str(draft.name, MAX_SHORT);
  if (name !== undefined) next.name = name;
  const tagline = str(draft.tagline, MAX_SHORT);
  if (tagline !== undefined) next.tagline = tagline;
  const city = str(draft.city, MAX_SHORT);
  if (city !== undefined) next.city = city;
  const about = str(draft.about, MAX_TEXT);
  if (about !== undefined) next.about = about;

  // ── Figures ─────────────────────────────────────────────────────────────
  const years = int(draft.yearsExperience, 0, 200);
  if (years !== undefined) next.yearsExperience = years;
  const expeditions = int(draft.expeditionCount, 0, 1_000_000);
  if (expeditions !== undefined) next.expeditionCount = expeditions;
  const summiteers = int(draft.summiteerCount, 0, 1_000_000);
  if (summiteers !== undefined) next.summiteerCount = summiteers;
  const reviewCount = int(draft.reviewCount, 0, 1_000_000);
  if (reviewCount !== undefined) next.reviewCount = reviewCount;
  const rating = num(draft.rating, 0, 5);
  if (rating !== undefined) next.rating = rating;
  const success = num(draft.summitSuccessPct, 0, 100);
  if (success !== undefined) next.summitSuccessPct = success;

  // ── Imagery ─────────────────────────────────────────────────────────────
  /*
   * A REAL BUSINESS'S LOGO NEVER RENDERS, draft or not.
   *
   * `Company.logo` is documented as only ever being set for an invented
   * company: a real business's mark is its trademark and does not ship here at
   * all, which is why a real listing draws a monogram instead. A draft logo on
   * a real-business record would walk straight past that rule, so it is refused
   * on exactly the same condition the rule is written against.
   */
  if ("logo" in draft) {
    if (stored.realBusiness) {
      rejected.push({
        field: "logo",
        why: "This listing names a real business, and ICEFALL does not host a real business's trademark. The page draws a monogram instead.",
      });
    } else {
      const logo = url(draft.logo);
      if (logo !== undefined) next.logo = logo;
      else rejected.push({ field: "logo", why: "Not an https: or app-relative URL." });
    }
  }

  if ("gallery" in draft) {
    const gallery = list(draft.gallery, (item) => url(item));
    if (gallery !== undefined) {
      const supplied = Array.isArray(draft.gallery) ? draft.gallery.length : 0;
      if (gallery.length < Math.min(supplied, MAX_ITEMS)) {
        rejected.push({
          field: "gallery",
          why: "Some images were not https: or app-relative URLs and were dropped.",
        });
      }
      next.gallery = gallery;
    }
  }

  // ── Lists ───────────────────────────────────────────────────────────────
  const team = list(draft.team, (item) => {
    const o = obj(item);
    if (!o) return undefined;
    const memberName = str(o.name, MAX_SHORT);
    const role = str(o.role, MAX_SHORT);
    if (memberName === undefined || role === undefined) return undefined;
    const photo = url(o.photo);
    return { name: memberName, role, ...(photo !== undefined ? { photo } : {}) };
  });
  if (team !== undefined) next.team = team as Company["team"];

  const pillars = list(draft.pillars, (item) => {
    const o = obj(item);
    if (!o) return undefined;
    const label = str(o.label, MAX_SHORT);
    const detail = str(o.detail, MAX_SHORT);
    return label !== undefined && detail !== undefined ? { label, detail } : undefined;
  });
  if (pillars !== undefined) next.pillars = pillars;

  const highlights = list(draft.highlights, (item) => {
    const o = obj(item);
    if (!o) return undefined;
    const label = str(o.label, MAX_SHORT);
    const detail = str(o.detail, MAX_SHORT);
    return label !== undefined && detail !== undefined ? { label, detail } : undefined;
  });
  if (highlights !== undefined) next.highlights = highlights;

  const faq = list(draft.faq, (item) => {
    const o = obj(item);
    if (!o) return undefined;
    const q = str(o.q, MAX_SHORT);
    const a = str(o.a, MAX_TEXT);
    return q !== undefined && a !== undefined ? { q, a } : undefined;
  });
  if (faq !== undefined) next.faq = faq;

  const credentials = list(draft.credentials, (item) => {
    const o = obj(item);
    if (!o) return undefined;
    const mark = str(o.mark, 24);
    const note = str(o.note, MAX_SHORT);
    const full = str(o.full, MAX_SHORT);
    return mark !== undefined && note !== undefined && full !== undefined
      ? { mark, note, full }
      : undefined;
  });
  if (credentials !== undefined) next.credentials = credentials as Company["credentials"];

  /*
   * A FILM IS NEVER TAKEN FROM A DRAFT.
   *
   * `videoId` is the one field on this record that is not rendered as text but
   * used to BUILD A URL, which is a different and worse category: a string that
   * becomes markup pointing at a third party. It is hard-validated wherever it
   * is stored (`^[A-Za-z0-9_-]{11}$`, an exact YouTube id) and it is refused
   * here regardless, so a preview shows the operator's published films or the
   * honest empty state and never an embed assembled from something typed into
   * an editor thirty seconds ago.
   *
   * The cost of refusing it is small and worth naming: an operator laying out
   * their page cannot see a film they have just added until they save it. They
   * do not need it playing to judge the layout, and the block reserves its space
   * either way.
   */
  if ("videoId" in draft || "videos" in draft) {
    rejected.push({
      field: "videoId",
      why: "A film is published against a mountain placement and read from there. A preview will not build an embed from a draft.",
    });
  }

  /*
   * REVIEWS ARE REFUSED WHOLESALE, and this is a product rule rather than a
   * security one.
   *
   * A review is a statement by a climber about a company. Letting the company
   * edit its own reviews in its own editor — even in a preview only they can
   * see — models a marketplace where an operator authors its own testimonials.
   * The stored reviews render unchanged.
   */
  if ("reviews" in draft) {
    rejected.push({
      field: "reviews",
      why: "A review is a climber's statement about a company, not something the company can edit.",
    });
  }

  return { company: next, rejected };
}
