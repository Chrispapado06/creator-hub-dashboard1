/**
 * The trip editor — the company editor's twin, for one expedition or trek.
 *
 * Three panes: the sections of the real trip page on the left with their status,
 * the page itself in the centre, and the fields for the selected section on the
 * right. Typing updates the centre immediately.
 *
 * Everything load-bearing here is `CompanyEditor.tsx`'s, on purpose — the rail,
 * the state dots, the "Your draft / Live now" toggle, the padlocked statement
 * instead of a disabled input, the closed-allowlist payload. Two editors that
 * behave differently are two products, and an operator who learns one has
 * learned nothing about the other.
 *
 * WHAT IS DIFFERENT, AND WHY:
 *
 *   THE DEFAULT SURFACE IS THE APP, not the web. The website's trip page does
 *   not implement the preview protocol (see `TripWebPreview.tsx` and request
 *   05), so it can be shown but cannot be given a draft. The phone preview is
 *   therefore the only surface on this screen that shows an operator their own
 *   unsaved work — and a preview that cannot show your edits is a poor thing to
 *   open on.
 *
 *   TWO WRITE PATHS MEET HERE, and constitution decision 12 splits them down
 *   the middle: a departure's SEATS and OPEN/CLOSED state save immediately,
 *   because stale availability hurts the climber who enquires on a full trip,
 *   while a departure's DATE and PRICE are advertised claims and go to Icefall
 *   like any other change. The Departures inspector is built around that seam.
 *
 *   THE PUBLICATION BOUNDARY IS A PROPERTY OF THE TRIP, not of the screen. A
 *   trip still in draft has nothing published to protect; a LIVE trip's edits
 *   go into a content version and the live row is never touched. Both are
 *   stated in the frame rather than left to be inferred.
 */

import {
  ArrowDown, ArrowLeft, ArrowUp, Lock, MonitorSmartphone, Plus, Smartphone, Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TripAppPreview, type TripPreviewData } from "@/editor/TripAppPreview";
import { TripWebPreview } from "@/editor/TripWebPreview";
import {
  PRODUCT_SECTIONS, productSectionState, productSectionsFor,
} from "@/editor/productSections";
import {
  SECTION_STATE_COLOUR, SECTION_STATE_LABEL, pendingFields,
  type SectionState, type Surface,
} from "@/editor/sections";
import { Listbox } from "@/components/controls";
import { Button, LockedNotice, Notice, formatMoney, inputClass } from "@/components/ui";
import { can, canEditProductDirectly, findContactDetails } from "@/domain/authz";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay } from "@/domain/dates";
import type { DepartureAvailability, FaqEntry, ItineraryDay, ProductDeparture } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/**
 * The editable half of a product, as the operator types it.
 *
 * Numbers and money live here as STRINGS because that is what an input holds. A
 * half-typed "58" is not the number 58 yet, and coercing on every keystroke is
 * how a price briefly becomes something nobody meant. They are parsed once, at
 * the bottom, where a value that is not a number can be refused out loud.
 */
interface Draft {
  description: string;
  durationDays: string;
  /*
   * NO `difficulty` AND NO `maxAltitudeM`, and their absence is the feature.
   *
   * Owner decision, OP-03/OP-04: neither is the seller's to state.
   *
   *   DIFFICULTY is a property of the route. It does not change with who is
   *   selling the trip, so it is read off the record and shown padlocked.
   *
   *   HIGHEST POINT is the number a climber uses to decide whether they can
   *   survive the trip, and it is the one a seller has most reason to round up.
   *   It is shown as it stands on the record and can no longer be typed here.
   *   Where the record holds none, the screen says so — it is NEVER filled in
   *   from the mountain's summit. An Everest Base Camp trek tops out at 5,364 m
   *   against Everest's 8,849 m: substituting would overstate the altitude by
   *   3,485 m, roughly 65% higher than the trip goes.
   *
   * Keeping them out of this type is what makes that enforcement rather than
   * intent: with no field there is no input to disable, nothing to parse and
   * nothing that can reach `changed` and be submitted.
   */
  /** Euros as typed. Converted to integer minor units on the way out. */
  priceFrom: string;
  priceTo: string;
  seasonality: string;
  itinerary: ItineraryDay[];
  equipment: string[];
  inclusions: string[];
  exclusions: string[];
  faq: FaqEntry[];
}

const AVAILABILITY_LABEL: Record<DepartureAvailability, string> = {
  available: "Available",
  limited: "Limited",
  full: "Full",
  unavailable: "Not running",
};


/* -------------------------------------------------------------------------- */
/* Parsing — every one of these can refuse                                     */
/* -------------------------------------------------------------------------- */

/**
 * `undefined` means "what is typed is not a number", and it is deliberately a
 * third answer rather than a silent fallback to null. An operator who types
 * "sixty" must not have their duration quietly cleared.
 */
function parseNumber(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Euros in, integer minor units out. Never a float, never a `toFixed`. */
function parseMoney(text: string): number | null | undefined {
  const n = parseNumber(text);
  if (n === undefined || n === null) return n;
  return Math.round(n * 100);
}

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

const sameItinerary = (a: readonly ItineraryDay[], b: readonly ItineraryDay[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => x.day === b[i].day && x.title === b[i].title && x.detail === b[i].detail);

const sameFaq = (a: readonly FaqEntry[], b: readonly FaqEntry[]): boolean =>
  a.length === b.length && a.every((x, i) => x.q === b[i].q && x.a === b[i].a);

/* -------------------------------------------------------------------------- */

export default function ProductEditor() {
  const { id = "" } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const { backend, company, mountains, revision, refresh } = useOperator();

  const product = useAsync(() => backend.getProduct(session, id), [session, id, revision], null);
  const departures = useAsync(() => backend.getDepartures(session, id), [session, id, revision], []);
  /*
   * The company's mark. Resolved through the backend rather than composed at a
   * call site: `getMediaUrl` is session-scoped and returns null for an asset
   * that is not this company's or is not yet approved — so an unapproved logo
   * cannot appear on a preview whose whole job is to show what a climber sees.
   */
  const companyLogoUrl = useAsync(
    () => backend.getMediaUrl(session, company?.logoMediaId ?? null),
    [session, company?.logoMediaId, revision],
    null,
  );
  const allVersions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);

  const versions = useMemo(() => allVersions.filter((v) => v.entityId === id), [allVersions, id]);
  const pending = versions.find((v) => v.state === "pending");
  const rejected = versions.find((v) => v.state === "rejected");
  const savedDraft = versions.find((v) => v.state === "draft" || v.state === "changes_requested");

  /*
   * APP IS THE DEFAULT SURFACE FOR A TRIP, and this is not a preference.
   *
   * The website's trip page cannot receive a draft — it does not implement the
   * preview protocol (request 05; `icefall-web/src/app/TripDetail.tsx` imports
   * none of `previewProtocol.ts`). So Web can only ever show what is already
   * published, and App is the only surface on this screen that shows the
   * operator their own unsaved work. Opening on Web would open on a page that
   * cannot answer the question the editor is for.
   */
  const [surface, setSurface] = useState<Surface>("app");
  const [viewing, setViewing] = useState<"draft" | "live">("draft");
  const [selected, setSelected] = useState("hero");
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected" | "pending"; text: string } | null>(null);

  const [draft, setDraft] = useState<Draft>({
    description: "", durationDays: "",
    priceFrom: "", priceTo: "", seasonality: "",
    itinerary: [], equipment: [], inclusions: [], exclusions: [], faq: [],
  });

  // Seed from the stored record, then overlay any saved draft, so an operator
  // returning to half-finished work meets their own words rather than a reset.
  useEffect(() => {
    if (!product) return;
    const o = (savedDraft?.payload ?? {}) as Partial<Record<keyof Draft | string, unknown>>;
    const money = (v: unknown, live: number | null): string => {
      const cents = typeof v === "number" ? v : live;
      return cents === null ? "" : String(cents / 100);
    };
    setDraft({
      description: (o.description as string) ?? product.description ?? "",
      durationDays: String((o.durationDays as number) ?? product.durationDays ?? ""),
      priceFrom: money(o.priceFromCents, product.priceFromCents),
      priceTo: money(o.priceToCents, product.priceToCents),
      seasonality: (o.seasonality as string) ?? product.seasonality ?? "",
      itinerary: (o.itinerary as ItineraryDay[]) ?? product.itinerary,
      equipment: (o.equipment as string[]) ?? product.equipment,
      inclusions: (o.inclusions as string[]) ?? product.inclusions,
      exclusions: (o.exclusions as string[]) ?? product.exclusions,
      faq: (o.faq as FaqEntry[]) ?? product.faq,
    });
  }, [product, savedDraft]);

  const sections = useMemo(() => productSectionsFor(surface), [surface]);
  const pendingSet = useMemo(() => pendingFields(versions), [versions]);

  // Keep the selection valid when the surface changes — the phone draws fewer
  // sections, and a stale selection would leave the inspector editing nothing.
  useEffect(() => {
    if (!sections.some((s) => s.key === selected)) setSelected(sections[0]?.key ?? "hero");
  }, [sections, selected]);

  if (!product) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-8 text-center">
        <p className="text-[13.5px] text-ink">This trip either does not exist or belongs to another company.</p>
        <Link to="/operator/expeditions" className="text-[12.5px] text-azure-ink hover:underline">
          Back to your trips
        </Link>
      </div>
    );
  }

  /* ---- the parsed draft, and what it refuses ---------------------------- */

  const durationDays = parseNumber(draft.durationDays);
  const priceFromCents = parseMoney(draft.priceFrom);
  const priceToCents = parseMoney(draft.priceTo);

  const notNumbers = [
    durationDays === undefined ? "Duration" : null,
    priceFromCents === undefined ? "Price from" : null,
    priceToCents === undefined ? "Price to" : null,
  ].filter((x): x is string => x !== null);

  /*
   * A DRAFT SAVED BEFORE THE SELLER LOST THESE TWO FIELDS.
   *
   * `saveDraft` MERGES into the stored payload, so a `maxAltitudeM` or
   * `difficulty` typed under the old editor would still be sitting in an
   * unsent draft and would still go to Icefall on the next submit — while
   * nothing on this screen showed it. That is precisely the silent claim this
   * change exists to remove, so it is named to the operator instead.
   */
  const staleLocked = (["maxAltitudeM", "difficulty"] as const).filter(
    (k) => savedDraft?.payload !== undefined && k in savedDraft.payload,
  );

  /*
   * ── THE PAYLOAD IS A CLOSED ALLOWLIST ─────────────────────────────────────
   *
   * One explicit line per field, exactly as `CompanyEditor` builds its own. No
   * spread, no `Object.assign`, no computed keys — so `id`, `slug`, `status`,
   * `companyId` and `mountainIds` cannot reach a write BY CONSTRUCTION rather
   * than by review. Adding a field to this object is a deliberate act that
   * shows up in a diff as one readable line.
   *
   * A value that failed to parse is simply not here: it was refused above and
   * is named to the operator, not written as null.
   */
  const changed: Record<string, unknown> = {};
  if (draft.description !== (product.description ?? "")) changed.description = draft.description;
  if (draft.seasonality !== (product.seasonality ?? "")) changed.seasonality = draft.seasonality;
  if (durationDays !== undefined && durationDays !== product.durationDays) changed.durationDays = durationDays;
  /* No `difficulty` line and no `maxAltitudeM` line — see `Draft` above. */
  if (priceFromCents !== undefined && priceFromCents !== product.priceFromCents) changed.priceFromCents = priceFromCents;
  if (priceToCents !== undefined && priceToCents !== product.priceToCents) changed.priceToCents = priceToCents;
  if (!sameItinerary(draft.itinerary, product.itinerary)) changed.itinerary = draft.itinerary;
  if (!sameList(draft.equipment, product.equipment)) changed.equipment = draft.equipment;
  if (!sameList(draft.inclusions, product.inclusions)) changed.inclusions = draft.inclusions;
  if (!sameList(draft.exclusions, product.exclusions)) changed.exclusions = draft.exclusions;
  if (!sameFaq(draft.faq, product.faq)) changed.faq = draft.faq;

  const editedSet = new Set(Object.keys(changed));
  const changedCount = editedSet.size;

  const stateOf = (key: string): SectionState => {
    const def = sections.find((s) => s.key === key);
    return def ? productSectionState(def, pendingSet, editedSet) : "live";
  };

  const selectedDef = sections.find((s) => s.key === selected);
  const sectionLocked = selectedDef ? stateOf(selected) === "pending" : false;
  const mayEdit = can(session, "editProducts");
  const canEdit = mayEdit && !sectionLocked && !selectedDef?.readOnly;

  /**
   * DRAFT TRIP OR LIVE TRIP — the publication boundary, read from one place.
   *
   * `canEditProductDirectly` mirrors the schema's UPDATE policy on `products`,
   * which matches `status = 'draft'` only.
   *
   * A NOTE THE NEXT PERSON NEEDS. `OperatorBackend` exposes no product-update
   * method today — `createProduct`, `getDepartures` and
   * `setDepartureAvailability` are the whole product write surface — so even in
   * the direct case there is nothing to call, and this screen saves through
   * `saveDraft` either way. That is stated in the code and NOT dressed up in the
   * interface: nothing here tells an operator their trip row was written when it
   * was not. What changes with the branch is what is TRUE to say about the
   * consequence, and the wording below follows the branch rather than leading it.
   */
  const direct = canEditProductDirectly(session, product);

  const contactHits = [
    ...findContactDetails(draft.description),
    ...findContactDetails(draft.seasonality),
    ...draft.itinerary.flatMap((d) => [...findContactDetails(d.title), ...findContactDetails(d.detail)]),
    ...draft.equipment.flatMap((x) => findContactDetails(x)),
    ...draft.inclusions.flatMap((x) => findContactDetails(x)),
    ...draft.exclusions.flatMap((x) => findContactDetails(x)),
    ...draft.faq.flatMap((f) => [...findContactDetails(f.q), ...findContactDetails(f.a)]),
  ];

  /*
   * WHAT THE CENTRE PANE IS SHOWING. On "Live now" it is the stored record,
   * untouched by anything typed — which is the whole point of being able to
   * switch to it. A field whose text is not a number falls back to the stored
   * value here too, because the preview must show what would actually publish.
   */
  const live = viewing === "live";
  const shown: TripPreviewData = {
    name: product.name,
    kind: product.kind,
    /*
     * THE COMPANY IDENTITY ON THE HERO — the line above the trip name.
     *
     * The name is the operator's own record, never the product's; a trip
     * belongs to whoever is signed in and there is no second source for it.
     *
     * THE LOGO IS RESOLVED THROUGH THE BACKEND, never composed here.
     * `Company.logoMediaId` is an id into the private media store, and
     * `getMediaUrl` is the one thing allowed to turn it into something a
     * browser can load — session-scoped, and null for an asset that is not this
     * company's or not yet approved. Building a URL from the storage path at
     * this call site would invent a scheme the app cannot honour: a broken
     * image at best, another company's object at worst. Null still reaches the
     * preview honestly, and it draws the monogram.
     */
    companyName: company?.name ?? "",
    companyLogoUrl,
    mountainName:
      mountains.find((m) => m.id === product.mountainIds[0])?.name ?? null,
    description: live ? product.description : draft.description,
    durationDays: live || durationDays === undefined ? product.durationDays : durationDays,
    /*
     * THE SAME VALUE ON BOTH SIDES OF THE DRAFT/LIVE TOGGLE, because neither is
     * editable here any more: whatever the record holds is what publishes.
     *
     * `maxAltitudeM` is passed straight through INCLUDING ITS NULL.
     * `TripAppPreview` draws "—" for a null altitude and the phone's real hero
     * does the same. Nothing on the path from here to the preview may reach for
     * `mountains.find(...).elevationM` to fill that gap — the summit of the
     * mountain is not the highest point of a trip on it.
     */
    difficulty: product.difficulty,
    maxAltitudeM: product.maxAltitudeM,
    seasonality: live ? product.seasonality : draft.seasonality,
    priceFromCents: live || priceFromCents === undefined ? product.priceFromCents : priceFromCents,
    priceToCents: live || priceToCents === undefined ? product.priceToCents : priceToCents,
    currency: product.currency,
    itinerary: live ? product.itinerary : draft.itinerary,
    equipment: live ? product.equipment : draft.equipment,
    inclusions: live ? product.inclusions : draft.inclusions,
    exclusions: live ? product.exclusions : draft.exclusions,
    faq: live ? product.faq : draft.faq,
  };

  const baseSnapshot = Object.fromEntries(
    Object.keys(changed).map((k) => [k, (product as unknown as Record<string, unknown>)[k] ?? null]),
  );

  /** What is true after a save, which is not the same sentence for both cases. */
  const savedText = direct
    ? "Saved. This trip is not published, so nothing about it has changed for climbers."
    : "Draft saved. Your published trip page is exactly as it was.";

  const saveDraftNow = async () => {
    const res = await backend.saveDraft(session, {
      entityType: "product",
      entityId: product.id,
      payload: changed,
      baseSnapshot,
    });
    setMessage(res.ok ? { tone: "neutral", text: savedText } : { tone: "rejected", text: res.reason });
    refresh();
  };

  const submit = async () => {
    const saved = await backend.saveDraft(session, {
      entityType: "product",
      entityId: product.id,
      payload: changed,
      baseSnapshot,
    });
    if (!saved.ok) {
      // A refusal is a rule being explained. It is shown, never swallowed.
      setMessage({ tone: "rejected", text: saved.reason });
      return;
    }
    const res = await backend.submitForApproval(session, saved.value.id);
    setMessage(
      res.ok
        ? {
            tone: "pending",
            text: direct
              ? "Sent to Icefall. This trip stays unpublished until they approve it."
              : "Sent to Icefall. Your published trip stays exactly as it is until they approve it.",
          }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  /**
   * The direct half of the split write path (constitution decision 12).
   *
   * Availability and seats only — the method's own type cannot carry a date or a
   * price, which is what keeps this honest. Both roles may do it.
   */
  const setAvailability = async (
    departureId: string,
    patch: {
      availability?: DepartureAvailability;
      spotsTotal?: number | null;
      spotsLeft?: number | null;
    },
  ) => {
    const res = await backend.setDepartureAvailability(session, departureId, patch);
    if (!res.ok) {
      // A refusal is a rule being explained. It is shown, never swallowed.
      setMessage({ tone: "rejected", text: res.reason });
      refresh();
      return;
    }
    /*
     * "OK" IS NOT "IT SAVED WHAT YOU SENT".
     *
     * The method returns the STORED row, so the confirmation is checked against
     * it rather than against the patch that was posted. An implementation that
     * accepts a write and quietly keeps part of the old value — a backend
     * running behind this one's field set, say — would otherwise be reported to
     * the operator as a success while the number on screen snapped back, which
     * is the worst of the three possible outcomes: not saved, and told it was.
     */
    const kept = (Object.keys(patch) as (keyof typeof patch)[]).filter(
      (k) => patch[k] !== undefined && res.value[k] !== patch[k],
    );
    setMessage(
      kept.length === 0
        ? { tone: "neutral", text: "Saved — climbers see this straight away, with no review." }
        : {
            tone: "rejected",
            text: `Icefall accepted the change but did not store ${kept
              .map((k) =>
                k === "spotsTotal" ? "the places on this departure" : k === "spotsLeft" ? "the places left" : "the availability",
              )
              .join(" or ")}. The figure shown is what is actually stored — tell Icefall rather than retyping it.`,
          },
    );
    refresh();
  };

  const chip: { dot: string; text: string; fg: string } = pending
    ? { dot: "var(--op-pending)", text: "Waiting on Icefall", fg: "var(--op-pending)" }
    : changedCount > 0
      ? { dot: "var(--op-faint)", text: "Edited, not sent", fg: "var(--op-muted)" }
      : product.status === "live"
        ? { dot: "var(--op-live)", text: "Live", fg: "var(--op-live)" }
        : product.status === "pending_review"
          ? { dot: "var(--op-pending)", text: "Waiting on Icefall", fg: "var(--op-pending)" }
          : product.status === "archived"
            ? { dot: "var(--op-expired)", text: "Archived", fg: "var(--op-expired)" }
            : { dot: "var(--op-draft)", text: "Draft, not published", fg: "var(--op-muted)" };

  /**
   * Clicking a block in the preview selects the section that edits it.
   *
   * The phone preview draws Equipment and Documents even though the rail lists
   * them for the web only. Selecting them silently would do nothing at all, so
   * the surface follows the click: those blocks ARE editable, just not on this
   * surface, and moving is the honest answer to "why is nothing happening".
   */
  const selectFromPreview = (key: string) => {
    if (sections.some((s) => s.key === key)) {
      setSelected(key);
      return;
    }
    if (PRODUCT_SECTIONS.some((s) => s.key === key)) {
      setSurface("web");
      setSelected(key);
    }
  };

  const kindWord = product.kind === "expedition" ? "Expedition" : "Trek";

  /*
   * The mountain this trip sits on, used in the Hero inspector for ONE purpose:
   * to name the summit figure the page is declining to borrow. It is never read
   * into `shown`, and `TripPreviewData` has no field it could be read into.
   */
  const heroMountain = mountains.find((m) => m.id === product.mountainIds[0]) ?? null;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-5 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            onClick={() => navigate(`/operator/products/${product.id}`)}
            className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
          <span className="h-3.5 w-px bg-line-soft" aria-hidden />
          <span className="truncate text-[13px] text-muted">
            {kindWord} · <span className="text-ink">{product.name}</span>
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line px-2.5 py-0.5 text-[10.5px]"
            style={{ color: chip.fg }}
          >
            <span className="h-1.5 w-1.5 rounded-pill" style={{ background: chip.dot }} aria-hidden />
            {chip.text}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/*
            Not decoration. Being able to put the draft and the published trip
            side by side is what stops an operator mistaking one for the other.
          */}
          <div className="flex rounded-pill border border-line bg-surface p-0.5">
            {(["draft", "live"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setViewing(v)}
                className={`rounded-pill px-3.5 py-1.5 text-[11.5px] font-medium transition-colors ${
                  viewing === v ? "bg-azure text-canvas" : "text-muted hover:text-ink"
                }`}
              >
                {v === "draft" ? "Your draft" : direct ? "Saved now" : "Live now"}
              </button>
            ))}
          </div>
          <Button onClick={() => void saveDraftNow()} disabled={changedCount === 0 || !mayEdit}>
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={changedCount === 0 || !!pending || contactHits.length > 0 || !mayEdit}
            title={pending ? "An edit is already with Icefall" : undefined}
          >
            Submit for approval
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── SECTIONS RAIL ───────────────────────────────────────────────── */}
        <div className="flex w-[236px] shrink-0 flex-col border-r border-line bg-surface">
          <div className="px-4.5 pt-4 pb-2.5">
            <span className="lbl">Sections</span>
          </div>
          <div className="flex flex-1 flex-col gap-px overflow-auto px-2.5">
            {sections.map((s) => {
              const st = stateOf(s.key);
              const active = selected === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSelected(s.key)}
                  className={`relative flex items-center gap-2.5 rounded-tile px-3 py-2.5 text-left text-[12.5px] transition-colors ${
                    active ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-pill bg-azure"
                      style={{ boxShadow: "0 0 10px var(--op-azure-glow)" }}
                    />
                  )}
                  <span className="flex-1 truncate">{s.label}</span>
                  {s.readOnly ? (
                    <Lock size={11} className="shrink-0 text-faint" aria-hidden />
                  ) : (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-pill"
                      style={{ background: SECTION_STATE_COLOUR[st] }}
                      title={SECTION_STATE_LABEL[st]}
                      aria-label={SECTION_STATE_LABEL[st]}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* The legend. Without it the dots are decoration. */}
          <div className="mt-auto flex flex-col gap-1.5 border-t border-line px-4.5 py-3.5">
            {(["live", "pending", "edited"] as const).map((st) => (
              <div key={st} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-pill"
                  style={{ background: SECTION_STATE_COLOUR[st] }}
                  aria-hidden
                />
                <span className="text-[11px] text-faint">{SECTION_STATE_LABEL[st]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── PREVIEW ─────────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
          <div className="flex items-center justify-between gap-3.5 border-b border-line-soft px-5 py-2">
            {/*
              The version label lives HERE, in the frame, permanently — not in a
              banner above the editor that scrolls away or gets dismissed.
            */}
            <span className="flex items-center gap-2 text-[10.5px]">
              <span
                className="h-1.5 w-1.5 rounded-pill"
                style={{ background: live ? "var(--op-live)" : "var(--op-azure)" }}
                aria-hidden
              />
              <span className="tracking-[0.14em] text-faint uppercase">
                {live
                  ? direct
                    ? "Saved — not published to climbers"
                    : "What climbers see now"
                  : pending
                    ? "Your draft — not yet public"
                    : "Your draft — not sent to Icefall"}
              </span>
            </span>

            <div className="flex items-center gap-2.5">
              <span className="text-[10.5px] text-faint">Editing for</span>
              <div className="flex gap-0.5 rounded-tile border border-line bg-surface p-0.5">
                {(
                  [
                    ["web", "Web", MonitorSmartphone],
                    ["app", "App", Smartphone],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setSurface(key)}
                    className={`flex items-center gap-1.5 rounded-[7px] px-3 py-1.5 text-[11.5px] transition-colors ${
                      surface === key ? "bg-azure text-canvas" : "text-muted hover:text-ink"
                    }`}
                  >
                    <Icon size={12} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {surface === "web" ? (
              /*
               * THE REAL PAGE, EMBEDDED — not a rebuild of it. A second
               * implementation drifts from the page the first time anybody
               * changes it, and this screen's whole value is being trustworthy
               * about what a climber will see.
               *
               * It cannot take a draft yet, and it says so in its own frame
               * rather than here, where the notice would scroll away.
               */
              <TripWebPreview
                productId={product.id}
                draft={live ? {} : changed}
                selected={selected}
              />
            ) : (
              <TripAppPreview d={shown} selected={selected} onSelect={selectFromPreview} />
            )}
          </div>
        </div>

        {/* ── INSPECTOR ─────────────────────────────────────────────────────
            THE COLUMN THE WORK HAPPENS IN, so it gets the width (owner, OP-03:
            "make Edit page bigger to be seen"). 340px was narrower than a
            phone: an itinerary day, a FAQ answer and a departure card were all
            being written through a slot.

            It GROWS WITH THE WINDOW and the preview is what gives way — the
            preview is a 300px phone plus air, so at 1280px the rail (236) and
            this column (500) still leave it 544px, which is more than it needs.
            Nothing here is a percentage: a fraction of a wide monitor would
            make the inspector absurd and a fraction of a laptop would undo the
            whole point. ─────────────────────────────────────────────────── */}
        <div className="flex w-[400px] shrink-0 flex-col border-l border-line bg-surface xl:w-[500px] 2xl:w-[600px]">
          <div className="flex items-center justify-between px-4.5 pt-4 pb-2.5">
            <span className="lbl">{selectedDef?.label ?? "Section"}</span>
            <span className="text-[10.5px]" style={{ color: SECTION_STATE_COLOUR[stateOf(selected)] }}>
              {selectedDef?.readOnly ? "Icefall's" : SECTION_STATE_LABEL[stateOf(selected)]}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-4.5 pb-5">
            {selectedDef?.hint && (
              <p className="text-[11px] leading-relaxed text-faint">{selectedDef.hint}</p>
            )}

            {sectionLocked && (
              <div className="rounded-tile border border-pending-soft bg-pending-soft px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-pending">
                  Editing is closed while Icefall reviews this section. Withdraw the submission to change it.
                </p>
                {pending && (
                  <button
                    onClick={async () => {
                      const res = await backend.withdrawSubmission(session, pending.id);
                      if (!res.ok) setMessage({ tone: "rejected", text: res.reason });
                      refresh();
                    }}
                    className="mt-2 text-[11px] font-medium text-azure-ink hover:underline"
                  >
                    Withdraw submission
                  </button>
                )}
              </div>
            )}

            {selectedDef?.readOnly && (
              <Notice>
                This section is on the page but is not yours to write. It is listed so you can see where
                it sits, not so it can be filled in.
              </Notice>
            )}

            {/* ---- HERO ------------------------------------------------- */}
            {selected === "hero" && (
              <>
                <Locked
                  label={`${kindWord} name`}
                  value={product.name}
                  note="Set when this trip was created."
                />
                <Locked
                  label="Mountain"
                  value={
                    product.mountainIds
                      .map((m) => mountains.find((x) => x.id === m)?.name ?? m)
                      .join(", ") || "None linked"
                  }
                  note="Which mountains a trip sits on is part of what Icefall assigned you."
                />
                <FieldRow
                  label="Duration (days)"
                  hint="How long your trip runs. This one IS yours — it is your itinerary, not the mountain's."
                >
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={draft.durationDays}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, durationDays: e.target.value })}
                  />
                </FieldRow>

                {/*
                  ── DIFFICULTY: LOCKED, READ OFF THE RECORD ───────────────────
                  A grade is a property of the route. It is the same grade
                  whoever is selling it, so there is nothing here for a company
                  to decide and the padlocked statement says which.
                */}
                <Locked
                  label="Difficulty"
                  value={
                    product.difficulty && product.difficulty.trim() !== ""
                      ? product.difficulty
                      : "Not recorded for this trip"
                  }
                  note={
                    product.difficulty && product.difficulty.trim() !== ""
                      ? "A property of the route, not of the company selling it. Ask Icefall to correct it."
                      : "Icefall holds no grade for this route. The page leaves it blank rather than guessing one."
                  }
                />

                {/*
                  ── HIGHEST POINT: THE ONE THAT MUST NOT BE GUESSED ───────────

                  Two branches and they say DIFFERENT things, because "the
                  record holds 5,364 m" and "the record holds nothing" are
                  different facts and collapsing them is how a gap becomes a
                  number. Neither branch reads the mountain's elevation, and
                  there is no input in either.
                */}
                {product.maxAltitudeM !== null ? (
                  <>
                    <Locked
                      label="Highest point"
                      value={`${product.maxAltitudeM.toLocaleString("en-GB")} m`}
                      note="The highest point this trip reaches. Never the mountain's summit."
                    />
                    <LockedNotice>
                      This is no longer a company's to set. Sellers can no longer state their own highest
                      point, because it is the number a climber uses to decide whether they can survive
                      the trip. If the figure above is wrong for your route, ask Icefall to correct it —
                      it is not editable here and it is not taken from the mountain.
                    </LockedNotice>
                  </>
                ) : (
                  <>
                    <Locked
                      label="Highest point"
                      value="Not held by Icefall"
                      note="Both pages leave the altitude blank rather than showing a figure nobody established."
                    />
                    <LockedNotice>
                      It is NOT filled in from{" "}
                      {heroMountain?.name ? `${heroMountain.name}'s summit` : "the mountain's summit"}
                      {heroMountain?.elevationM !== null && heroMountain?.elevationM !== undefined
                        ? ` of ${heroMountain.elevationM.toLocaleString("en-GB")} m`
                        : ""}
                      , and it is not yours to type: a trip can top out thousands of metres below the peak
                      it is named after, and the summit figure would overstate what you are asking a
                      climber to survive. A per-route highest point on the mountain and trek records is
                      with Icefall as a request.
                    </LockedNotice>
                  </>
                )}

                {staleLocked.length > 0 && (
                  <Notice
                    tone="rejected"
                    title={`An unsent draft still carries ${staleLocked
                      .map((k) => (k === "maxAltitudeM" ? "a highest point" : "a difficulty"))
                      .join(" and ")}`}
                  >
                    It was typed here before companies lost these fields, and it is still part of what a
                    submit would send to Icefall even though nothing above shows it. Ask Icefall to
                    discard it rather than submitting.
                  </Notice>
                )}
              </>
            )}

            {/* ---- ABOUT ------------------------------------------------ */}
            {selected === "about" && (
              <FieldRow label="About this trip" hint="The first thing a climber reads.">
                <textarea
                  className={`${inputClass} min-h-[150px] resize-y`}
                  value={draft.description}
                  disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </FieldRow>
            )}

            {/* ---- PRICE ------------------------------------------------ */}
            {selected === "price" && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <FieldRow label={`Price from (${product.currency})`}>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={draft.priceFrom}
                      disabled={!canEdit}
                      placeholder="Not priced"
                      onChange={(e) => setDraft({ ...draft, priceFrom: e.target.value })}
                    />
                  </FieldRow>
                  <FieldRow label={`Price to (${product.currency})`}>
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      value={draft.priceTo}
                      disabled={!canEdit}
                      placeholder="No upper bound"
                      onChange={(e) => setDraft({ ...draft, priceTo: e.target.value })}
                    />
                  </FieldRow>
                </div>
                <p className="text-[10.5px] leading-relaxed text-faint">
                  Leave both empty if this trip is quoted rather than priced — the page says so instead of
                  showing a zero. Fill only the first and it reads "From".
                </p>
                <FieldRow label="Best season" hint='The "Best season" line beside the price.'>
                  <input
                    className={inputClass}
                    value={draft.seasonality}
                    disabled={!canEdit}
                    placeholder="e.g. April – May"
                    onChange={(e) => setDraft({ ...draft, seasonality: e.target.value })}
                  />
                </FieldRow>
                <Locked
                  label="Currency"
                  value={product.currency}
                  note="Every price on this trip is in this currency."
                />
              </>
            )}

            {/* ---- DEPARTURES: THE SPLIT WRITE PATH ---------------------- */}
            {selected === "departures" && (
              <>
                {/*
                  ── THE SEAM, STATED BEFORE IT IS MET ──────────────────────────
                  Two halves of one card behave differently, which is confusing
                  unless the difference is named first. Constitution decision 12.
                */}
                <div className="rounded-tile border border-line-soft">
                  <div className="flex items-start gap-2 rounded-t-tile bg-live-soft px-3 py-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-pill bg-live" aria-hidden />
                    <span className="text-[11px] leading-snug text-live">
                      <strong className="font-semibold">Places and availability save immediately.</strong>{" "}
                      No review, no waiting — because a climber enquiring on a trip that filled up last
                      week is the thing stale availability actually costs you.
                    </span>
                  </div>
                  <div className="flex items-start gap-2 px-3 py-2">
                    <Lock size={12} className="mt-0.5 shrink-0 text-faint" aria-hidden />
                    <span className="text-[11px] leading-snug text-muted">
                      <strong className="font-semibold text-ink">Dates and prices go to Icefall.</strong>{" "}
                      They are advertised claims, so they are reviewed like the rest of your trip content
                      and are shown padlocked below rather than as inputs you cannot use.
                    </span>
                  </div>
                </div>

                {departures.length === 0 ? (
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    No departures on this trip yet. Adding one is a date and a price, so it goes through
                    Icefall — it cannot be done from here.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {departures.map((d) => (
                      <DepartureCard
                        key={d.id}
                        departure={d}
                        currency={product.currency}
                        canWrite={can(session, "setDepartureAvailability")}
                        onSave={(patch) => setAvailability(d.id, patch)}
                        onRefuse={(text) => setMessage({ tone: "rejected", text })}
                      />
                    ))}
                  </div>
                )}

                {!can(session, "setDepartureAvailability") && (
                  <Notice>
                    Your account cannot change availability. Both Company Admin and Sales normally can —
                    this is what an inactive account looks like.
                  </Notice>
                )}
              </>
            )}

            {/* ---- ITINERARY -------------------------------------------- */}
            {selected === "itinerary" && (
              <ItineraryEditor
                days={draft.itinerary}
                disabled={!canEdit}
                onChange={(itinerary) => setDraft({ ...draft, itinerary })}
              />
            )}

            {/* ---- INCLUDED / EXCLUDED ---------------------------------- */}
            {selected === "included" && (
              <>
                <ListEditor
                  label="Included"
                  placeholder="e.g. All permits and fees"
                  items={draft.inclusions}
                  disabled={!canEdit}
                  onChange={(inclusions) => setDraft({ ...draft, inclusions })}
                />
                <div className="my-1 h-px bg-line" aria-hidden />
                <ListEditor
                  label="Not included"
                  placeholder="e.g. International flights"
                  items={draft.exclusions}
                  disabled={!canEdit}
                  onChange={(exclusions) => setDraft({ ...draft, exclusions })}
                />
              </>
            )}

            {/* ---- EQUIPMENT (web only) --------------------------------- */}
            {selected === "equipment" && (
              <ListEditor
                label="Equipment"
                placeholder="e.g. Double boots rated to −40 °C"
                items={draft.equipment}
                disabled={!canEdit}
                onChange={(equipment) => setDraft({ ...draft, equipment })}
              />
            )}

            {/* ---- FAQ -------------------------------------------------- */}
            {selected === "faq" && (
              <FaqEditor
                entries={draft.faq}
                disabled={!canEdit}
                onChange={(faq) => setDraft({ ...draft, faq })}
              />
            )}

            {/* ── THE BOUNDARY ─────────────────────────────────────────── */}
            <div className="my-1 h-px bg-line" aria-hidden />
            <div className="flex flex-col gap-2">
              <span className="lbl">Set by Icefall</span>
              <Locked label="Publication" value={direct ? "Not published yet" : "Published"} />
              <Locked label="Reviews" value="Written by climbers, about your company" />
              <p className="text-[10.5px] leading-relaxed text-faint">
                {direct
                  ? "Nothing on this trip is public yet. Submitting it asks Icefall to publish it."
                  : OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED}
              </p>
            </div>

            {notNumbers.length > 0 && (
              <Notice tone="rejected" title={`${notNumbers.join(" and ")} must be a number`}>
                What is typed there is not a number, so it will not be saved. The preview shows the stored
                value instead of a guess.
              </Notice>
            )}
            {contactHits.length > 0 && (
              <Notice tone="rejected" title={`Remove ${[...new Set(contactHits.map((h) => h.label))].join(" and ")}`}>
                {OPERATOR_NOTICES.NO_CONTACT_DETAILS}
              </Notice>
            )}
            {rejected && (
              <Notice tone="rejected" title="A previous change was not approved">
                {rejected.decisionReason}
              </Notice>
            )}
            {message && <Notice tone={message.tone}>{message.text}</Notice>}

            <p className="text-[10.5px] leading-relaxed text-faint">
              {changedCount === 0
                ? "No changes yet."
                : `${changedCount} ${changedCount === 1 ? "field" : "fields"} changed and not sent. Saving a draft keeps it private to your team.`}{" "}
              <Link to={`/operator/products/${product.id}`} className="text-azure-ink hover:underline">
                Back to the trip
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inspector pieces                                                           */
/* -------------------------------------------------------------------------- */

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="lbl">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] leading-snug text-faint">{hint}</span>}
    </label>
  );
}

/**
 * A padlocked statement, never a disabled input.
 *
 * A greyed-out control says "ask us and we'll enable it" and invites exactly the
 * negotiation the approval system exists to prevent. This says what is true.
 */
function Locked({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-tile border border-line bg-raised px-2.5 py-2">
      <div className="min-w-0">
        <div className="text-[11px] text-faint">{label}</div>
        <div className="truncate text-[12.5px] text-ink">{value}</div>
        {note && <div className="text-[10px] text-faint">{note}</div>}
      </div>
      <Lock size={13} className="shrink-0 text-faint" aria-hidden />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Departures — the direct half of the split write path                       */
/* -------------------------------------------------------------------------- */

/**
 * One number of places, written directly.
 *
 * THE INPUT IS NOT THE RECORD, and this component is careful about which of the
 * two it is drawing. While the operator is typing it shows their text; the
 * moment they commit it drops back to showing `value`, which is whatever the
 * BACKEND said after the write. So a refused or partially-applied write shows
 * as the figure not moving — the truth — rather than the field agreeing with
 * itself about something that never reached the database.
 *
 * EMPTY IS A STATEMENT, NOT A ZERO. `null` is "we do not state a number" and 0
 * is "there are none left". Clearing the box sends null; it never sends 0, and
 * a value that is not a whole number is refused out loud instead of rounded.
 */
function SpotsField({
  label,
  hint,
  value,
  disabled,
  onCommit,
  onRefuse,
}: {
  label: string;
  hint: string;
  value: number | null;
  disabled: boolean;
  onCommit: (n: number | null) => void;
  onRefuse: (text: string) => void;
}) {
  const [typed, setTyped] = useState<string | null>(null);
  const shown = typed ?? (value === null ? "" : String(value));

  const commit = () => {
    if (typed === null) return;
    const t = typed.trim();
    setTyped(null);
    if (t === "") {
      onCommit(null);
      return;
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n < 0) {
      onRefuse(
        `${label} must be a whole number of places, or empty to say you do not state one. “${t}” was not saved.`,
      );
      return;
    }
    onCommit(n);
  };

  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="lbl">{label}</span>
      <input
        className={`tnum ${inputClass}`}
        inputMode="numeric"
        placeholder="Not stated"
        value={shown}
        disabled={disabled}
        onChange={(e) => setTyped(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setTyped(null);
        }}
      />
      <span className="text-[10.5px] leading-snug text-faint">{hint}</span>
    </label>
  );
}

/**
 * One departure, with the seam drawn down the middle of the card.
 *
 * Top half padlocked and read-only — the DATE and the PRICE, which are
 * advertised claims and go through Icefall. Bottom half live — availability and
 * the two place counts, which are the operator's own logistics and save on the
 * spot. Same card, so the operator sees that they are two halves of one thing
 * rather than wondering why one of their edits vanished.
 */
function DepartureCard({
  departure: d,
  currency,
  canWrite,
  onSave,
  onRefuse,
}: {
  departure: ProductDeparture;
  currency: string;
  canWrite: boolean;
  onSave: (patch: { availability?: DepartureAvailability; spotsTotal?: number | null; spotsLeft?: number | null }) => void;
  onRefuse: (text: string) => void;
}) {
  /*
   * Stated, and impossible. Not blocked — the operator may be mid-way through
   * fixing both numbers — but never left silent, because "9 of 6 left" is a
   * claim about seats that cannot be true and a climber will read it.
   */
  const impossible =
    d.spotsTotal !== null && d.spotsLeft !== null && d.spotsLeft > d.spotsTotal;

  return (
    <div className="rounded-tile border border-line">
      {/* ---- with Icefall ---------------------------------------------- */}
      <div className="flex items-baseline justify-between gap-2 rounded-t-tile bg-raised px-3 py-2">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Lock size={11} className="shrink-0 self-center text-faint" aria-hidden />
          <span className="truncate text-[12.5px] text-ink">{formatDay(d.departureDate)}</span>
          {d.endDate && (
            <span className="shrink-0 text-[11px] text-faint">to {formatDay(d.endDate)}</span>
          )}
        </span>
        <span className="tnum shrink-0 text-[11.5px] text-muted">
          {d.priceCents !== null ? formatMoney(d.priceCents, currency) : "Not priced"}
        </span>
      </div>
      <div className="border-b border-line-soft px-3 pb-2">
        <span className="text-[10px] text-faint">Date and price — with Icefall, not editable here</span>
      </div>

      {/* ---- yours, and immediate --------------------------------------- */}
      <div className="px-3 py-2.5">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-live" aria-hidden />
          <span className="text-[10px] text-live">Yours — saves the moment you leave the box</span>
        </div>

        {/*
          The kit's Listbox, NOT inside a <label> — a click within a label
          forwards to its first labelable control, which would re-toggle the
          trigger when an option is picked. The kit's own `label` prop carries
          the accessible name instead. Values stay the exact
          DepartureAvailability strings the backend's allowlist checks.
        */}
        <div>
          <Listbox
            label="Availability"
            value={d.availability}
            disabled={!canWrite}
            onChange={(v) => onSave({ availability: v as DepartureAvailability })}
            options={(Object.keys(AVAILABILITY_LABEL) as DepartureAvailability[]).map((a) => ({
              value: a,
              label: AVAILABILITY_LABEL[a],
            }))}
          />
        </div>

        <div className="mt-2.5 flex gap-2.5">
          <SpotsField
            label="Places on this departure"
            hint="How many you run. Empty means you do not state it."
            value={d.spotsTotal}
            disabled={!canWrite}
            onCommit={(n) => onSave({ spotsTotal: n })}
            onRefuse={onRefuse}
          />
          <SpotsField
            label="Places left"
            hint="Empty is “not stated”. 0 is “none left”."
            value={d.spotsLeft}
            disabled={!canWrite}
            onCommit={(n) => onSave({ spotsLeft: n })}
            onRefuse={onRefuse}
          />
        </div>

        <p className="mt-2 text-[10.5px] text-faint">
          {d.spotsLeft !== null
            ? `Climbers see: ${d.spotsLeft} of ${d.spotsTotal ?? "—"} left`
            : d.spotsTotal !== null
              ? `Climbers see: ${d.spotsTotal} places, none stated as left`
              : "Climbers see: spaces not stated"}
        </p>

        {impossible && (
          <p className="mt-1.5 text-[10.5px] leading-snug text-rejected">
            {d.spotsLeft} left out of {d.spotsTotal} places cannot both be true. It is saved as typed —
            correct whichever of the two is wrong.
          </p>
        )}
      </div>
    </div>
  );
}

/** Move, remove, add — the three controls every list here needs. */
function RowTools({
  index,
  count,
  disabled,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  disabled: boolean;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const btn =
    "rounded-[6px] p-1 text-faint transition-colors hover:bg-raised hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-faint";
  return (
    <div className="flex items-center gap-0.5">
      <button
        className={btn}
        disabled={disabled || index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label="Move up"
      >
        <ArrowUp size={12} aria-hidden />
      </button>
      <button
        className={btn}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label="Move down"
      >
        <ArrowDown size={12} aria-hidden />
      </button>
      <button className={btn} disabled={disabled} onClick={() => onRemove(index)} aria-label="Remove">
        <Trash2 size={12} aria-hidden />
      </button>
    </div>
  );
}

function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function AddButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center gap-1.5 rounded-tile border border-dashed border-line py-2 text-[11.5px] text-muted transition-colors hover:border-azure hover:text-azure-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-muted"
    >
      <Plus size={12} aria-hidden />
      {label}
    </button>
  );
}

/**
 * A list of lines — equipment, inclusions, exclusions.
 *
 * An EMPTY list is left empty. There is no starter row and no example line: an
 * example an operator forgets to replace is published as their own claim, and
 * the page has a sentence for a list nobody filled in.
 */
function ListEditor({
  label,
  placeholder,
  items,
  disabled,
  onChange,
}: {
  label: string;
  placeholder: string;
  items: string[];
  disabled: boolean;
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="lbl">{label}</span>
      {items.length === 0 && (
        <p className="text-[11px] leading-relaxed text-faint">
          Nothing listed. The page tells climbers so rather than filling the space.
        </p>
      )}
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            className={inputClass}
            value={item}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <RowTools
            index={i}
            count={items.length}
            disabled={disabled}
            onMove={(from, to) => onChange(move(items, from, to))}
            onRemove={(idx) => onChange(items.filter((_, j) => j !== idx))}
          />
        </div>
      ))}
      <AddButton label={`Add to ${label.toLowerCase()}`} disabled={disabled} onClick={() => onChange([...items, ""])} />
    </div>
  );
}

/**
 * The day-by-day.
 *
 * The day NUMBER is typed, not derived from position. Reordering does not
 * renumber, because an itinerary that pairs "Day 3–4" or rests on a numbered day
 * is the operator's to describe and a helpful auto-renumber would silently
 * rewrite their schedule.
 */
function ItineraryEditor({
  days,
  disabled,
  onChange,
}: {
  days: ItineraryDay[];
  disabled: boolean;
  onChange: (days: ItineraryDay[]) => void;
}) {
  const set = (i: number, patch: Partial<ItineraryDay>) =>
    onChange(days.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  return (
    <div className="flex flex-col gap-2.5">
      {days.length === 0 && (
        <p className="text-[11px] leading-relaxed text-faint">
          No itinerary yet. The tab says nothing has been published rather than showing an example day.
        </p>
      )}
      {days.map((d, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-tile border border-line px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="lbl shrink-0">Day</span>
            <input
              className="tnum w-[54px] rounded-tile border border-line bg-elevated px-2 py-1 text-[12px] text-ink"
              inputMode="numeric"
              value={String(d.day)}
              disabled={disabled}
              onChange={(e) => {
                const n = Number(e.target.value.trim());
                if (e.target.value.trim() !== "" && !Number.isFinite(n)) return;
                set(i, { day: e.target.value.trim() === "" ? 0 : n });
              }}
            />
            <span className="flex-1" />
            <RowTools
              index={i}
              count={days.length}
              disabled={disabled}
              onMove={(from, to) => onChange(move(days, from, to))}
              onRemove={(idx) => onChange(days.filter((_, j) => j !== idx))}
            />
          </div>
          <input
            className={inputClass}
            value={d.title}
            placeholder="Where the day goes"
            disabled={disabled}
            onChange={(e) => set(i, { title: e.target.value })}
          />
          <textarea
            className={`${inputClass} min-h-[60px] resize-y`}
            value={d.detail}
            placeholder="What happens (optional)"
            disabled={disabled}
            onChange={(e) => set(i, { detail: e.target.value })}
          />
        </div>
      ))}
      <AddButton
        label="Add a day"
        disabled={disabled}
        onClick={() =>
          onChange([...days, { day: (days[days.length - 1]?.day ?? 0) + 1, title: "", detail: "" }])
        }
      />
    </div>
  );
}

function FaqEditor({
  entries,
  disabled,
  onChange,
}: {
  entries: FaqEntry[];
  disabled: boolean;
  onChange: (entries: FaqEntry[]) => void;
}) {
  const set = (i: number, patch: Partial<FaqEntry>) =>
    onChange(entries.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  return (
    <div className="flex flex-col gap-2.5">
      {entries.length === 0 && (
        <p className="text-[11px] leading-relaxed text-faint">
          Nothing answered yet. The FAQ tab stays empty until you write something — it invents no questions.
        </p>
      )}
      {entries.map((f, i) => (
        <div key={i} className="flex flex-col gap-1.5 rounded-tile border border-line px-2.5 py-2">
          <div className="flex items-center gap-2">
            <span className="lbl flex-1">Question {i + 1}</span>
            <RowTools
              index={i}
              count={entries.length}
              disabled={disabled}
              onMove={(from, to) => onChange(move(entries, from, to))}
              onRemove={(idx) => onChange(entries.filter((_, j) => j !== idx))}
            />
          </div>
          <input
            className={inputClass}
            value={f.q}
            placeholder="What a climber asks"
            disabled={disabled}
            onChange={(e) => set(i, { q: e.target.value })}
          />
          <textarea
            className={`${inputClass} min-h-[70px] resize-y`}
            value={f.a}
            placeholder="Your answer"
            disabled={disabled}
            onChange={(e) => set(i, { a: e.target.value })}
          />
        </div>
      ))}
      <AddButton label="Add a question" disabled={disabled} onClick={() => onChange([...entries, { q: "", a: "" }])} />
    </div>
  );
}
