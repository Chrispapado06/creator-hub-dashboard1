/**
 * The expedition / trek editor, built to the mockup: a section list on the left,
 * one panel at a time on the right, and the two save actions in the header.
 *
 * THE DISTINCTION SPEC §17 DEMANDS is carried by those two buttons. "Save draft"
 * and "Submit for approval" are different weights with a sentence between them
 * saying what each does — an operator who thinks Save publishes will be furious
 * when it does not, and one who thinks Submit is a save will send half-finished
 * copy to a reviewer.
 *
 * TWO WRITE PATHS MEET ON THIS SCREEN and the panels are separated so the
 * difference is legible without a paragraph:
 *
 *   Dates & availability — spaces and availability save INSTANTLY, no review.
 *   Everything else      — submitted, and reviewed by Icefall before it changes.
 *
 * A company marking a departure full on a Tuesday must not wonder whether a
 * climber can still book it.
 */

import { ArrowLeft, Eye, LayoutTemplate } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Button, Card, Field, LockedNotice, Notice, StatusChip, Tabs, formatMoney, inputClass,
} from "@/components/ui";
import { Listbox } from "@/components/controls";
import { ProductOverview } from "@/components/ProductOverview";
import { can, findContactDetails } from "@/domain/authz";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay } from "@/domain/dates";
import { chipForProduct, type DepartureAvailability } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

type Section = "basic" | "itinerary" | "dates" | "pricing" | "included" | "equipment" | "faq";

const SECTIONS: { key: Section; label: string; reviewed: boolean }[] = [
  { key: "basic", label: "Basic information", reviewed: true },
  { key: "itinerary", label: "Itinerary", reviewed: true },
  { key: "dates", label: "Dates & availability", reviewed: false },
  { key: "pricing", label: "Pricing", reviewed: true },
  { key: "included", label: "Included & excluded", reviewed: true },
  { key: "equipment", label: "Equipment", reviewed: true },
  { key: "faq", label: "FAQ", reviewed: true },
];

const AVAILABILITY_LABEL: Record<DepartureAvailability, string> = {
  available: "Available",
  limited: "Limited",
  full: "Full",
  unavailable: "Not running",
};

export default function ProductDetail() {
  const { id = "" } = useParams();
  const session = useSession();
  const { backend, mountains, revision, refresh } = useOperator();

  const product = useAsync(() => backend.getProduct(session, id), [session, id, revision], null);
  const departures = useAsync(() => backend.getDepartures(session, id), [session, id, revision], []);
  const versions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);

  const forThis = versions.filter((v) => v.entityId === id);
  const pending = forThis.find((v) => v.state === "pending");
  const rejected = forThis.find((v) => v.state === "rejected");
  const draft = forThis.find((v) => v.state === "draft" || v.state === "changes_requested");

  /*
   * TWO VIEWS OF ONE TRIP, and Overview is the one that opens.
   *
   * This screen was only ever the editor. The detail specified in
   * `icefall-sessions/requests/08-operator-product-detail-from-03.md` is a
   * different question about the same record — how is this trip doing — and an
   * operator arriving from the trips list is far more often asking that than
   * asking to rewrite the description. The editor is UNCHANGED beneath the
   * second tab; nothing about the draft, submit or availability paths moved.
   */
  const [view, setView] = useState<"overview" | "edit">("overview");
  const [section, setSection] = useState<Section>("basic");
  /*
   * NO `difficulty` AND NO `maxAltitudeM` IN THIS FORM (owner, OP-03/OP-04).
   *
   * The trip editor took both away from the seller; this screen is the OTHER
   * way into the same product, and a rule enforced on one of two doors is not
   * enforced. Difficulty is a property of the route and is the same grade
   * whoever sells it. The highest point was never editable here and stays that
   * way — it is the figure a climber judges survivability by, and it is never
   * filled in from the mountain's summit.
   */
  const [form, setForm] = useState({ description: "", priceFrom: "", duration: "" });
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected" | "pending"; text: string } | null>(null);

  useEffect(() => {
    if (!product) return;
    const o = (draft?.payload ?? {}) as Record<string, unknown>;
    setForm({
      description: (o.description as string) ?? product.description ?? "",
      duration: String((o.durationDays as number) ?? product.durationDays ?? ""),
      priceFrom:
        o.priceFromCents !== undefined
          ? String(Number(o.priceFromCents) / 100)
          : product.priceFromCents !== null
            ? String(product.priceFromCents / 100)
            : "",
    });
  }, [product, draft]);

  if (!product) {
    return (
      <>
        <Link to="/operator/expeditions" className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden /> Back
        </Link>
        <Notice>This trip either does not exist or belongs to another company.</Notice>
      </>
    );
  }

  const backTo = product.kind === "expedition" ? "/operator/expeditions" : "/operator/treks";
  const editable = can(session, "editProducts");
  const contactHits = findContactDetails(form.description);

  const payload: Record<string, unknown> = {};
  if (form.description !== (product.description ?? "")) payload.description = form.description;
  const durationDays = form.duration.trim() === "" ? null : Number(form.duration);
  if (durationDays !== product.durationDays && !Number.isNaN(durationDays)) payload.durationDays = durationDays;
  const priceCents = form.priceFrom.trim() === "" ? null : Math.round(Number(form.priceFrom) * 100);
  if (priceCents !== product.priceFromCents && !Number.isNaN(priceCents)) payload.priceFromCents = priceCents;
  const changedCount = Object.keys(payload).length;

  const baseSnapshot: Record<string, unknown> = Object.fromEntries(
    Object.keys(payload).map((k) => [k, (product as unknown as Record<string, unknown>)[k] ?? null]),
  );

  const saveDraft = async () => {
    const res = await backend.saveDraft(session, { entityType: "product", entityId: product.id, payload, baseSnapshot });
    setMessage(
      res.ok
        ? { tone: "neutral", text: "Draft saved. What climbers see has not changed." }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  const submit = async () => {
    const saved = await backend.saveDraft(session, { entityType: "product", entityId: product.id, payload, baseSnapshot });
    if (!saved.ok) {
      setMessage({ tone: "rejected", text: saved.reason });
      return;
    }
    const res = await backend.submitForApproval(session, saved.value.id);
    setMessage(
      res.ok
        ? { tone: "pending", text: "Sent to Icefall. The live version of this trip stays exactly as it is until they approve it." }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  const setAvailability = async (
    departureId: string,
    patch: { availability?: DepartureAvailability; spotsLeft?: number | null },
  ) => {
    const res = await backend.setDepartureAvailability(session, departureId, patch);
    setMessage(res.ok ? { tone: "neutral", text: "Availability updated — climbers see this straight away." } : { tone: "rejected", text: res.reason });
    refresh();
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link to={backTo} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
          <ArrowLeft size={13} aria-hidden /> Back to {product.kind === "expedition" ? "expeditions" : "treks"}
        </Link>
        <div className="flex items-center gap-2">
          <StatusChip status={chipForProduct(product.status)} />
          {pending && (
            <span className="rounded-pill bg-pending-soft px-2 py-0.5 text-[11.5px] text-pending">
              Submitted {formatDay(pending.submittedAt?.slice(0, 10) ?? null)}
            </span>
          )}
          <Link to={`/operator/products/${product.id}/edit`}>
            <Button>
              <LayoutTemplate size={13} aria-hidden /> Edit page
            </Button>
          </Link>
          <Link to={`/operator/products/${product.id}/preview`}>
            <Button>
              <Eye size={13} aria-hidden /> Preview
            </Button>
          </Link>
        </div>
      </div>

      <div className="mb-4">
        <div className="lbl">{product.kind}</div>
        <h1 className="ser mt-1 text-[26px] leading-tight text-ink">{product.name}</h1>
        <p className="mt-1 text-[12.5px] text-muted">
          {product.mountainIds.map((m) => mountains.find((x) => x.id === m)?.name ?? "—").join(", ")}
        </p>
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            { key: "overview" as const, label: "Overview" },
            { key: "edit" as const, label: "Edit details" },
          ]}
          active={view}
          onChange={setView}
        />
      </div>

      {pending && (
        <div className="mb-4">
          <Notice tone="pending" title="An edit is with Icefall">
            {OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED}
          </Notice>
        </div>
      )}
      {rejected && (
        <div className="mb-4">
          <Notice tone="rejected" title="A previous change was not approved">
            {rejected.decisionReason}
          </Notice>
        </div>
      )}

      {view === "overview" && <ProductOverview product={product} />}

      {view === "edit" && (
      <div className="grid gap-4 lg:grid-cols-[210px_1fr]">
        <Card className="h-fit p-2">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`mb-0.5 flex w-full items-center justify-between gap-2 rounded-tile px-3 py-2 text-left text-[12.5px] transition-colors ${
                section === s.key
                  ? "bg-azure-soft font-medium text-azure-ink"
                  : "text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <span>{s.label}</span>
              {/*
                The dot marks a section that publishes instantly. One mark, in
                the nav, is cheaper for the reader than a warning on each panel.
              */}
              {!s.reviewed && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-pill bg-live"
                  title="Saves immediately, without review"
                  aria-hidden
                />
              )}
            </button>
          ))}
          <p className="mt-2 border-t border-line-soft px-3 pt-2.5 text-[10.5px] leading-snug text-faint">
            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-pill bg-live align-middle" aria-hidden />
            Saves immediately. Everything else is reviewed by Icefall first.
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            {section === "basic" && (
              <div className="space-y-4">
                <h2 className="text-[14px] font-semibold text-ink">Basic information</h2>
                <Field label={`${product.kind === "expedition" ? "Expedition" : "Trek"} name`}>
                  <input className={inputClass} value={product.name} disabled readOnly />
                </Field>
                <Field label="Short description" hint="The first thing a climber reads about this trip.">
                  <textarea
                    className={`${inputClass} min-h-[110px] resize-y`}
                    value={form.description}
                    disabled={!editable}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Difficulty"
                    hint="A property of the route, not of the company selling it. Ask Icefall to correct it."
                  >
                    <input
                      className={inputClass}
                      value={product.difficulty ?? ""}
                      disabled
                      readOnly
                      placeholder="Not recorded for this trip"
                    />
                  </Field>
                  <Field label="Duration (days)">
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={form.duration}
                      disabled={!editable}
                      onChange={(e) => setForm({ ...form, duration: e.target.value })}
                    />
                  </Field>
                </div>
                <Field
                  label="Highest point (m)"
                  hint={
                    product.maxAltitudeM !== null
                      ? "The highest point this trip reaches. Not a seller's to state, and never the mountain's summit — ask Icefall to correct it."
                      : "Icefall holds no highest point for this trip, so the page shows none. It is never filled in from the mountain's summit: a base-camp trek can top out thousands of metres below the peak it sits under."
                  }
                >
                  <input
                    className={inputClass}
                    value={product.maxAltitudeM ?? ""}
                    disabled
                    readOnly
                    placeholder="Not held by Icefall"
                  />
                </Field>
              </div>
            )}

            {section === "itinerary" && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink">Itinerary</h2>
                {product.itinerary.length === 0 ? (
                  <p className="mt-3 text-[12.5px] text-muted">No itinerary added yet.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {product.itinerary.map((d) => (
                      <li key={d.day} className="rounded-tile bg-canvas p-3">
                        <div className="tnum text-[11px] text-faint">Day {d.day}</div>
                        <div className="mt-0.5 text-[12.5px] font-medium text-ink">{d.title}</div>
                        <div className="mt-0.5 text-[12px] leading-snug text-muted">{d.detail}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}

            {section === "dates" && (
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-[14px] font-semibold text-ink">Dates & availability</h2>
                    <p className="mt-0.5 text-[12px] text-muted">
                      Spaces and availability save straight away. Prices and dates go through approval.
                    </p>
                  </div>
                  <span className="rounded-pill bg-live-soft px-2 py-0.5 text-[11px] font-medium text-live">
                    No review needed
                  </span>
                </div>
                {departures.length === 0 ? (
                  <p className="mt-4 text-[12.5px] text-muted">No departures added yet.</p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {departures.map((d) => (
                      <div key={d.id} className="hairline flex flex-wrap items-center gap-3 rounded-tile px-3 py-2.5">
                        <div className="min-w-[160px] flex-1">
                          <div className="text-[13px] font-medium text-ink">{formatDay(d.departureDate)}</div>
                          <div className="tnum text-[11.5px] text-muted">
                            {d.priceCents !== null ? formatMoney(d.priceCents, product.currency) : "Not priced"}
                            {/*
                              "not stated" and "none left" are different
                              statements. A null must never render as 0.
                            */}
                            {d.spotsLeft !== null
                              ? ` · ${d.spotsLeft} of ${d.spotsTotal ?? "—"} left`
                              : " · spaces not stated"}
                          </div>
                        </div>
                        <div className="w-[150px]">
                          <Listbox
                            value={d.availability}
                            onChange={(v) =>
                              void setAvailability(d.id, { availability: v as DepartureAvailability })
                            }
                            options={(Object.keys(AVAILABILITY_LABEL) as DepartureAvailability[]).map(
                              (a) => ({ value: a, label: AVAILABILITY_LABEL[a] }),
                            )}
                          />
                        </div>
                        <input
                          className="tnum w-[96px] rounded-tile border border-line bg-elevated px-2 py-1 text-[12.5px] text-ink"
                          inputMode="numeric"
                          placeholder="Spaces"
                          defaultValue={d.spotsLeft ?? ""}
                          onBlur={(e) => {
                            const raw = e.target.value.trim();
                            void setAvailability(d.id, { spotsLeft: raw === "" ? null : Number(raw) });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  <LockedNotice>
                    Changing a departure's price or date, or adding and removing departures, goes through
                    Icefall like the rest of your trip content.
                  </LockedNotice>
                </div>
              </div>
            )}

            {section === "pricing" && (
              <div className="space-y-4">
                <h2 className="text-[14px] font-semibold text-ink">Pricing</h2>
                <Field
                  label="Price from (EUR)"
                  hint="Leave empty if this trip is quoted rather than priced. Icefall will show 'Quoted', not a zero."
                >
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={form.priceFrom}
                    disabled={!editable}
                    onChange={(e) => setForm({ ...form, priceFrom: e.target.value })}
                    placeholder="Not priced"
                  />
                </Field>
                <Notice>
                  Your current published price stays live while a change is in review, so nobody ever sees a
                  price you have not agreed to.
                </Notice>
              </div>
            )}

            {section === "included" && (
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <h2 className="text-[14px] font-semibold text-ink">Included</h2>
                  <ul className="mt-3 space-y-1.5">
                    {product.inclusions.map((x) => (
                      <li key={x} className="text-[12.5px] text-ink">{x}</li>
                    ))}
                    {product.inclusions.length === 0 && (
                      <li className="text-[12.5px] text-muted">Nothing listed.</li>
                    )}
                  </ul>
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-ink">Not included</h2>
                  <ul className="mt-3 space-y-1.5">
                    {product.exclusions.map((x) => (
                      <li key={x} className="flex items-start gap-1.5 text-[12.5px] text-muted">
                        {/*
                          A dash, never a tick. A green tick beside a NOT-INCLUDED
                          item reads as "yes, included" at a glance and the reader
                          never reaches the heading.
                        */}
                        <span aria-hidden className="mt-[7px] h-px w-2 shrink-0 bg-faint" />
                        <span>{x}</span>
                      </li>
                    ))}
                    {product.exclusions.length === 0 && (
                      <li className="text-[12.5px] text-muted">Nothing listed.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {section === "equipment" && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink">Equipment</h2>
                <ul className="mt-3 space-y-1.5">
                  {product.equipment.map((x) => (
                    <li key={x} className="text-[12.5px] text-ink">{x}</li>
                  ))}
                  {product.equipment.length === 0 && (
                    <li className="text-[12.5px] text-muted">Nothing listed.</li>
                  )}
                </ul>
              </div>
            )}

            {section === "faq" && (
              <div>
                <h2 className="text-[14px] font-semibold text-ink">FAQ</h2>
                {product.faq.length === 0 ? (
                  <p className="mt-3 text-[12.5px] text-muted">No questions added for this trip yet.</p>
                ) : (
                  <dl className="mt-3 space-y-3">
                    {product.faq.map((f) => (
                      <div key={f.q}>
                        <dt className="text-[12.5px] font-medium text-ink">{f.q}</dt>
                        <dd className="mt-1 text-[12.5px] text-muted">{f.a}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </Card>

          {contactHits.length > 0 && (
            <Notice tone="rejected" title={`Remove ${[...new Set(contactHits.map((h) => h.label))].join(" and ")}`}>
              {OPERATOR_NOTICES.NO_CONTACT_DETAILS}
            </Notice>
          )}
          {message && <Notice tone={message.tone}>{message.text}</Notice>}

          {editable && SECTIONS.find((s) => s.key === section)?.reviewed && (
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => void saveDraft()} disabled={changedCount === 0}>
                  Save draft
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void submit()}
                  disabled={changedCount === 0 || !!pending}
                  title={pending ? "An edit is already with Icefall" : undefined}
                >
                  Submit for approval
                </Button>
                <p className="w-full text-[11.5px] leading-snug text-muted sm:w-auto sm:flex-1">
                  {changedCount === 0
                    ? "No changes yet."
                    : `${changedCount} ${changedCount === 1 ? "field" : "fields"} changed. A draft stays private to your team; submitting sends it to Icefall, and the live trip does not change until they approve.`}
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
      )}
    </>
  );
}
