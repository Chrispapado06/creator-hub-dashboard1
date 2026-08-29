/**
 * The company profile editor — a Shopify-theme-editor pattern.
 *
 * Three panes: the sections of the real page on the left with their status, the
 * real page itself in the centre, and the fields for the selected section on the
 * right. Typing updates the centre immediately.
 *
 * THE ONE RULE THIS SCREEN IS BUILT AROUND. An in-layout editor makes it very
 * easy to show an operator their own typing dressed as a published page, and
 * that is the publication boundary leaking through the preview — the operator
 * comes away believing climbers can see something they cannot. So:
 *
 *   - The frame states WHICH VERSION is on screen at all times, in the frame,
 *     never only in a banner above it.
 *   - "Your draft" and "Live now" are a real toggle, so the two can be compared
 *     rather than confused.
 *   - A section ICEFALL is reviewing cannot be edited at all — the fields go
 *     read-only and say why, because editing a submission mid-review changes
 *     what the reviewer is looking at.
 *
 * "EDITING FOR" IS NOT "PREVIEW". Choosing App selects the phone surface as the
 * thing being edited: the section list changes, because the phone renders fewer
 * sections than the web page and a row that edits something you cannot see is
 * worse than an absent one.
 */

import { ArrowLeft, Lock, MonitorSmartphone, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppCompanyPreview, type PreviewData } from "@/editor/CompanyPreview";
import { LivePreview } from "@/editor/LivePreview";
import { MediaDrop, type StagedFile } from "@/editor/MediaDrop";
import {
  SECTION_STATE_COLOUR, SECTION_STATE_LABEL, pendingFields, sectionState, sectionsFor,
  type SectionState, type Surface,
} from "@/editor/sections";
import { Button, Notice, inputClass } from "@/components/ui";
import { can, findContactDetails } from "@/domain/authz";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay } from "@/domain/dates";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

interface Draft {
  name: string;
  tagline: string;
  city: string;
  country: string;
  foundedYear: string;
  description: string;
  about: string;
}

export default function CompanyEditor() {
  const session = useSession();
  const navigate = useNavigate();
  const { backend, company, revision, refresh } = useOperator();

  const versions = useAsync(() => backend.getVersions(session, "company"), [session, revision], []);
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);

  const pending = versions.find((v) => v.state === "pending");
  const rejected = versions.find((v) => v.state === "rejected");
  const savedDraft = versions.find((v) => v.state === "draft" || v.state === "changes_requested");

  const [surface, setSurface] = useState<Surface>("web");
  const [viewing, setViewing] = useState<"draft" | "live">("draft");
  const [selected, setSelected] = useState("hero");
  const [banner, setBanner] = useState<StagedFile | null>(null);
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected" | "pending"; text: string } | null>(null);

  const [draft, setDraft] = useState<Draft>({
    name: "", tagline: "", city: "", country: "", foundedYear: "",
    description: "", about: "",
  });

  // Seed from the LIVE record, then overlay any saved draft, so an operator
  // returning to half-finished work sees their own words rather than a reset.
  useEffect(() => {
    if (!company) return;
    const o = (savedDraft?.payload ?? {}) as Partial<Draft>;
    setDraft({
      name: company.name,
      tagline: o.tagline ?? company.tagline ?? "",
      city: o.city ?? company.city ?? "",
      country: o.country ?? company.country ?? "",
      foundedYear: String(o.foundedYear ?? company.foundedYear ?? ""),
      description: o.description ?? company.description ?? "",
      about: o.about ?? company.about ?? "",
    });
  }, [company, savedDraft]);

  const sections = useMemo(() => sectionsFor(surface), [surface]);
  const pendingSet = useMemo(() => pendingFields(versions), [versions]);

  // Keep the selection valid when the surface changes — the phone has fewer
  // sections, and a stale selection would leave the inspector editing nothing.
  useEffect(() => {
    if (!sections.some((s) => s.key === selected)) setSelected(sections[0]?.key ?? "hero");
  }, [sections, selected]);

  if (!company) return null;

  const changed: Record<string, unknown> = {};
  if (draft.tagline !== (company.tagline ?? "")) changed.tagline = draft.tagline;
  if (draft.description !== (company.description ?? "")) changed.description = draft.description;
  if (draft.about !== (company.about ?? "")) changed.about = draft.about;
  if (draft.city !== (company.city ?? "")) changed.city = draft.city;
  if (draft.country !== (company.country ?? "")) changed.country = draft.country;
  const year = draft.foundedYear.trim() === "" ? null : Number(draft.foundedYear);
  if (year !== company.foundedYear && !Number.isNaN(year)) changed.foundedYear = year;

  const editedSet = new Set(Object.keys(changed));
  const changedCount = editedSet.size;

  const stateOf = (key: string): SectionState => {
    const def = sections.find((s) => s.key === key);
    return def ? sectionState(def, pendingSet, editedSet) : "live";
  };

  const selectedDef = sections.find((s) => s.key === selected);
  const sectionLocked = selectedDef ? stateOf(selected) === "pending" : false;
  const canEdit = can(session, "editCompanyProfile") && !sectionLocked && !selectedDef?.readOnly;

  const contactHits = [
    ...findContactDetails(draft.tagline),
    ...findContactDetails(draft.description),
    ...findContactDetails(draft.about),
  ];

  // WHAT THE CENTRE PANE IS SHOWING. On "Live now" it is the published record,
  // untouched by anything typed — which is the whole point of being able to
  // switch to it.
  const shown: PreviewData = {
    name: viewing === "live" ? company.name : draft.name,
    tagline: viewing === "live" ? (company.tagline ?? "") : draft.tagline,
    city: viewing === "live" ? (company.city ?? "") : draft.city,
    country: viewing === "live" ? (company.country ?? "") : draft.country,
    foundedYear: viewing === "live" ? String(company.foundedYear ?? "") : draft.foundedYear,
    description: viewing === "live" ? (company.description ?? "") : draft.description,
    about: viewing === "live" ? (company.about ?? "") : draft.about,
    whyChooseUs: company.whyChooseUs,
    certifications: company.certifications,
    team: company.team,
    faq: company.faq,
    documentsCheckedAt: company.documentsCheckedAt,
    productCount: products.length,
  };
  const shownBanner = viewing === "live" ? null : banner;

  const baseSnapshot = Object.fromEntries(
    Object.keys(changed).map((k) => [k, (company as unknown as Record<string, unknown>)[k] ?? null]),
  );

  const saveDraft = async () => {
    const res = await backend.saveDraft(session, {
      entityType: "company",
      entityId: company.id,
      payload: changed,
      baseSnapshot,
    });
    setMessage(
      res.ok
        ? { tone: "neutral", text: "Draft saved. Nothing on your public profile has changed." }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  const submit = async () => {
    const saved = await backend.saveDraft(session, {
      entityType: "company",
      entityId: company.id,
      payload: changed,
      baseSnapshot,
    });
    if (!saved.ok) {
      setMessage({ tone: "rejected", text: saved.reason });
      return;
    }
    const res = await backend.submitForApproval(session, saved.value.id);
    setMessage(
      res.ok
        ? { tone: "pending", text: "Sent to Icefall. Your published profile stays exactly as it is until they approve it." }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  const chip: { dot: string; text: string; fg: string } = pending
    ? { dot: "var(--op-pending)", text: "Waiting on Icefall", fg: "var(--op-pending)" }
    : changedCount > 0
      ? { dot: "var(--op-faint)", text: "Edited, not sent", fg: "var(--op-muted)" }
      : { dot: "var(--op-live)", text: "Live", fg: "var(--op-live)" };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-5 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            onClick={() => navigate("/operator/company")}
            className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
          <span className="h-3.5 w-px bg-line-soft" aria-hidden />
          <span className="text-[13px] text-muted">Company profile</span>
          <span
            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-0.5 text-[10.5px]"
            style={{ color: chip.fg }}
          >
            <span className="h-1.5 w-1.5 rounded-pill" style={{ background: chip.dot }} aria-hidden />
            {chip.text}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/*
            Not decoration. Being able to put the draft and the published page
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
                {v === "draft" ? "Your draft" : "Live now"}
              </button>
            ))}
          </div>
          <Button onClick={() => void saveDraft()} disabled={changedCount === 0}>
            Save draft
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={changedCount === 0 || !!pending || contactHits.length > 0}
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
                style={{ background: viewing === "live" ? "var(--op-live)" : "var(--op-azure)" }}
                aria-hidden
              />
              <span className="tracking-[0.14em] text-faint uppercase">
                {viewing === "live"
                  ? "What climbers see now"
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
               * THE REAL PAGE, EMBEDDED — not a rebuild of it.
               *
               * This replaced a reconstruction that read as the same page and was
               * visibly a different one. A second implementation drifts from the
               * real page the first time anybody changes it, and this screen's
               * whole value is being trustworthy about what a climber will see.
               */
              <LivePreview
                companyId={company.id}
                draft={viewing === "live" ? {} : {
                  name: draft.name,
                  tagline: draft.tagline,
                  city: draft.city,
                  about: draft.about,
                }}
                selected={selected}
                requestTab={selected}
              />
            ) : (
              <AppCompanyPreview d={shown} banner={shownBanner} selected={selected} onSelect={setSelected} />
            )}
          </div>
        </div>

        {/* ── INSPECTOR ───────────────────────────────────────────────────── */}
        <div className="flex w-[320px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex items-center justify-between px-4.5 pt-4 pb-2.5">
            <span className="lbl">{selectedDef?.label ?? "Section"}</span>
            <span className="text-[10.5px]" style={{ color: SECTION_STATE_COLOUR[stateOf(selected)] }}>
              {selectedDef?.readOnly ? "Icefall's" : SECTION_STATE_LABEL[stateOf(selected)]}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-4.5 pb-5">
            {sectionLocked && (
              <div className="rounded-tile border border-pending-soft bg-pending-soft px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-pending">
                  Editing is closed while Icefall reviews this section. Withdraw the submission to change it.
                </p>
                {pending && (
                  <button
                    onClick={async () => {
                      await backend.withdrawSubmission(session, pending.id);
                      refresh();
                    }}
                    className="mt-2 text-[11px] font-medium text-azure-ink hover:underline"
                  >
                    Withdraw submission
                  </button>
                )}
              </div>
            )}

            {selected === "hero" && (
              <>
                <Locked label="Company name" value={draft.name} note="Icefall sets this." />
                <FieldRow label="Tagline">
                  <input
                    className={inputClass}
                    value={draft.tagline}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
                  />
                </FieldRow>
                <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
                  <FieldRow label="Based in">
                    <input
                      className={inputClass}
                      value={draft.city}
                      disabled={!canEdit}
                      onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                    />
                  </FieldRow>
                  <FieldRow label="Founded">
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      value={draft.foundedYear}
                      disabled={!canEdit}
                      onChange={(e) => setDraft({ ...draft, foundedYear: e.target.value })}
                    />
                  </FieldRow>
                </div>
                <FieldRow label="Country">
                  <input
                    className={inputClass}
                    value={draft.country}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, country: e.target.value })}
                  />
                </FieldRow>
                <MediaDrop
                  label="Banner image"
                  hint="Sits behind your name on both surfaces."
                  staged={banner}
                  onStage={setBanner}
                  onClear={() => setBanner(null)}
                  disabled={!canEdit}
                />
              </>
            )}

            {selected === "about" && (
              <>
                <FieldRow label="Short description" hint="The first thing a climber reads.">
                  <textarea
                    className={`${inputClass} min-h-[100px] resize-y`}
                    value={draft.description}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </FieldRow>
                <FieldRow label="About" hint="Your longer story. Web only — the phone shows the short one.">
                  <textarea
                    className={`${inputClass} min-h-[130px] resize-y`}
                    value={draft.about}
                    disabled={!canEdit}
                    onChange={(e) => setDraft({ ...draft, about: e.target.value })}
                  />
                </FieldRow>
              </>
            )}

            {(selected === "why" || selected === "credentials" || selected === "team" || selected === "faq") && (
              <Notice>
                This section's content is edited on the company profile screen. It appears here so you can see
                where it sits on the page.
              </Notice>
            )}

            {selected === "icefall" && (
              <p className="text-[11px] leading-relaxed text-muted">
                Everything below is Icefall's statement about your company rather than yours. Your placement is
                commercial, and your verification is a record of documents we checked — neither can be changed
                from here.
              </p>
            )}

            {/* ── THE BOUNDARY ─────────────────────────────────────────── */}
            <div className="my-1 h-px bg-line" aria-hidden />
            <div className="flex flex-col gap-2">
              <span className="lbl">Set by Icefall</span>
              <Locked
                label="Verification"
                value={
                  OPERATOR_NOTICES.documentsChecked(
                    company.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null,
                  ) ?? "No document check recorded"
                }
              />
              <Locked label="Placement" value="Set per mountain — see My Mountains" />
              <Locked label="Company name" value={company.name} />
              <p className="text-[10.5px] leading-relaxed text-faint">
                These are Icefall's statements, not yours to set. A locked line says what is true — it is not a
                control waiting to be unlocked.
              </p>
            </div>

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
              <Link to="/operator/company" className="text-azure-ink hover:underline">
                Back to profile
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

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
