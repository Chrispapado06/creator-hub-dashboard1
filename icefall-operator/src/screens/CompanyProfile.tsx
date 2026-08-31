/**
 * Company profile editing — and the first place the publication boundary is
 * visible to an operator.
 *
 * THE DISTINCTION SPEC §17 DEMANDS: "Save Draft" and "Submit for Approval" must
 * be obviously different actions. They are rendered as two separate buttons with
 * different weights and a sentence between them saying what each one does,
 * because an operator who thinks Save publishes will be furious when it doesn't,
 * and an operator who thinks Submit is a save will send half-finished copy to a
 * reviewer.
 *
 * The live version stays on screen throughout. What is being edited is a
 * proposal, and the page never pretends otherwise.
 */

import { Circle, CircleCheck, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Field, inputClass, Notice, PageHeader, ProgressBar, SectionHeading, StatusChip, Tabs } from "@/components/ui";
import { Monogram } from "@/components/Shell";
import { findContactDetails } from "@/domain/authz";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { formatDay } from "@/domain/dates";
import type { Company } from "@/domain/types";
import { COMPANY_SECTIONS, pendingFields } from "@/editor/sections";
/*
 * OP-01: the company's social surface lives here as the Posts tab — the
 * owner's words are "company profile posts", and no operator mockup places it
 * anywhere else. The surface itself is its own file; this screen only hosts it.
 */
import PostsSurface from "@/screens/Posts";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/** Only the free-text fields an operator edits here. */
interface Editable {
  tagline: string;
  description: string;
  about: string;
}

/** A value counts as filled when it would actually render something. */
const hasContent = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim().length > 0 : v != null;

const sectionFields = (key: string): readonly (keyof Company)[] =>
  COMPANY_SECTIONS.find((s) => s.key === key)?.fields ?? [];

/**
 * The completeness checklist, tied to the SAME section model the editor uses
 * (src/editor/sections.ts) so the two can never disagree about what a section
 * is. The percentage is filled-sections over total — computed from the live
 * record every render, never stored, never invented.
 */
const CHECKLIST_ROWS: { label: string; fields: readonly (keyof Company)[]; need: "all" | "any" }[] = [
  // The banner and the logo belong to "Media & photos" below, so they do not
  // also fail this row. Both are hero fields — the logo is what sits above the
  // company name — but "Basic information" is need:"all", and scoring an image
  // twice would make written details unfinishable until artwork arrived.
  {
    label: "Basic information",
    fields: sectionFields("hero").filter((f) => f !== "bannerMediaId" && f !== "logoMediaId"),
    need: "all",
  },
  { label: "About your company", fields: sectionFields("about"), need: "all" },
  { label: "Media & photos", fields: ["bannerMediaId", "logoMediaId"], need: "any" },
  { label: "Certifications", fields: sectionFields("credentials"), need: "all" },
  { label: "Team members", fields: sectionFields("team"), need: "all" },
];

export default function CompanyProfile() {
  const session = useSession();
  const { backend, company, revision, refresh } = useOperator();

  const versions = useAsync(() => backend.getVersions(session, "company"), [session, revision], []);
  const pending = versions.find((v) => v.state === "pending");
  const rejected = versions.find((v) => v.state === "rejected");
  const draft = versions.find((v) => v.state === "draft" || v.state === "changes_requested");

  const [form, setForm] = useState<Editable>({ tagline: "", description: "", about: "" });
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected" | "pending"; text: string } | null>(null);
  // The inline form is superseded by the in-layout editor at /company/edit.
  const editing = false;
  const [tab, setTab] = useState<"overview" | "posts" | "certifications" | "team" | "faq">("overview");
  const checklistRef = useRef<HTMLUListElement>(null);

  // Seed the editor from the LIVE record, then overlay any saved draft — so an
  // operator returning to a half-finished edit sees their own words, not a reset.
  useEffect(() => {
    if (!company) return;
    const overlay = (draft?.payload ?? {}) as Partial<Editable>;
    setForm({
      tagline: overlay.tagline ?? company.tagline ?? "",
      description: overlay.description ?? company.description ?? "",
      about: overlay.about ?? company.about ?? "",
    });
  }, [company, draft]);

  if (!company) return null;

  /* ---- Profile completeness, derived honestly from the live record ---- */
  const pendSet = pendingFields(versions);
  const checklist = CHECKLIST_ROWS.map((r) => ({
    ...r,
    filled:
      r.need === "any"
        ? r.fields.some((f) => hasContent(company[f]))
        : r.fields.every((f) => hasContent(company[f])),
    withIcefall: r.fields.some((f) => pendSet.has(f as string)),
  }));
  const filledCount = checklist.filter((r) => r.filled).length;
  const percent = Math.round((filledCount / checklist.length) * 100);
  const missingCount = checklist.length - filledCount;

  /*
   * The meta grid the mockup asks for. Headquarters is real data; website,
   * email and phone are NOT modelled on `Company` — spec §2/§5 keep contact
   * escape routes out of operator content — so they render an honest "—",
   * never an invented address.
   */
  const meta: { label: string; value: string | null }[] = [
    { label: "Headquarters", value: [company.city, company.country].filter(Boolean).join(", ") || null },
    { label: "Website", value: null },
    { label: "Email", value: null },
    { label: "Phone", value: null },
  ];

  const changed = (
    ["tagline", "description", "about"] as const
  ).filter((k) => (form[k] || null) !== ((company[k] as string | null) ?? null));

  const contactHits = [
    ...findContactDetails(form.tagline),
    ...findContactDetails(form.description),
    ...findContactDetails(form.about),
  ];

  const payload = Object.fromEntries(changed.map((k) => [k, form[k]]));
  /**
   * What the live record said when this edit started.
   *
   * Sent with the submission so approval can refuse a change whose ground has
   * moved — including the case a version counter misses, where ICEFALL edited
   * the same field directly while this sat pending.
   */
  const baseSnapshot = Object.fromEntries(changed.map((k) => [k, company[k] ?? null]));

  const saveDraft = async () => {
    const res = await backend.saveDraft(session, {
      entityType: "company",
      entityId: company.id,
      payload,
      baseSnapshot,
    });
    setMessage(
      res.ok
        ? { tone: "neutral", text: "Draft saved. Nothing has changed on your public profile." }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  const submit = async () => {
    const saved = await backend.saveDraft(session, {
      entityType: "company",
      entityId: company.id,
      payload,
      baseSnapshot,
    });
    if (!saved.ok) {
      setMessage({ tone: "rejected", text: saved.reason });
      return;
    }
    const res = await backend.submitForApproval(session, saved.value.id);
    setMessage(
      res.ok
        ? { tone: "pending", text: "Sent to Icefall for review. Your current profile stays live until it is approved." }
        : { tone: "rejected", text: res.reason },
    );
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Company Profile"
        detail="Manage your company information and settings."
        action={
          <div className="flex items-center gap-2">
            <StatusChip status="live" />
            {/*
              One editor, not two. Editing happens in the three-pane in-layout
              editor — a second form here would be a place for the two to drift.
            */}
            <Link to="/operator/company/edit">
              <Button variant="primary">
                <Pencil size={13} aria-hidden /> Edit profile
              </Button>
            </Link>
          </div>
        }
      />

      {!editing && (
        <div className="mb-4">
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "overview" as const, label: "Overview" },
              { key: "posts" as const, label: "Posts" },
              { key: "certifications" as const, label: "Certifications", count: company.certifications.length },
              { key: "team" as const, label: "Team", count: company.team.length },
              { key: "faq" as const, label: "FAQ", count: company.faq.length },
            ]}
          />
        </div>
      )}

      {pending && (
        <div className="mb-4">
          <Notice tone="pending" title="An edit is with Icefall">
            {OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED} Submitted {formatDay(pending.submittedAt?.slice(0, 10) ?? null)}.
          </Notice>
        </div>
      )}

      {rejected && (
        <div className="mb-4">
          {/* Spec §17: show ICEFALL's reason next to the affected item. */}
          <Notice tone="rejected" title="A previous change was not approved">
            {rejected.decisionReason}
          </Notice>
        </div>
      )}

      {!editing && tab === "overview" && (
        <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* LEFT — completeness, then the identity card. */}
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[13px] font-semibold text-ink">Profile overview</h2>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    Your profile is {percent}% complete.
                  </p>
                </div>
                <span className="ser tnum text-[24px] leading-none text-ink">{percent}%</span>
              </div>
              <div className="mt-3">
                <ProgressBar percent={percent} />
              </div>
              <p className="mt-2 text-[11.5px] text-faint">
                {filledCount} of {checklist.length} sections filled.
              </p>
            </Card>

            <Card className="p-5">
              <div className="flex items-start gap-4">
                {/*
                  A monogram, not a logo file. No company has supplied artwork,
                  and an invented mark on a real company's profile is a
                  fabricated identity — the same rule the consumer apps follow.

                  NO "Verified Company" pill, deliberately: the domain has no
                  verification flag. `documentsCheckedAt` was renamed AWAY from
                  `verified_at` precisely because "verified" overclaims, so a
                  badge here would invent a status Icefall never granted.
                */}
                <Monogram name={company.name} size={64} />
                <div className="min-w-0">
                  <div className="ser text-[24px] leading-tight text-ink">{company.name}</div>
                  <div className="mt-1 text-[12.5px] text-muted">{company.tagline ?? "—"}</div>
                </div>
              </div>
              {company.description && (
                <p className="mt-4 text-[13px] leading-relaxed text-muted">{company.description}</p>
              )}
              <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-line-soft pt-4 sm:grid-cols-2">
                {meta.map(({ label, value }) => (
                  <div key={label}>
                    <div className="lbl">{label}</div>
                    {value ? (
                      <div className="mt-1 text-[13px] text-ink">{value}</div>
                    ) : (
                      <div className="mt-1 text-[13px] text-muted">
                        — <span className="text-[11px] text-faint">not provided</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
                Contact details are not shown on Icefall — climbers reach you through Icefall leads and
                bookings.
              </p>
            </Card>
          </div>

          {/* RIGHT — where the profile stands, and the checklist behind the percentage. */}
          <Card className="p-5">
            <h2 className="text-[13px] font-semibold text-ink">Profile status</h2>
            <div className="mt-3">
              {missingCount > 0 ? (
                /*
                 * Wording follows the data. The seeded company IS published
                 * with sections missing, so "not live" would be false here —
                 * that line is reserved for a company that actually isn't.
                 */
                <div className="rounded-tile bg-pending-soft p-3">
                  <div className="text-[12.5px] font-semibold text-pending">
                    {company.status === "active" ? "Your profile is incomplete" : "Your profile is not live"}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-pending">
                    {company.status === "active"
                      ? "Climbers see your page without the missing sections. Complete them all to finish setup."
                      : "Complete all required sections to get published."}
                  </p>
                  <div className="mt-2.5">
                    <Button
                      variant="primary"
                      onClick={() =>
                        checklistRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
                      }
                    >
                      Finish setup
                    </Button>
                  </div>
                </div>
              ) : pending ? (
                <Notice tone="pending" title="An edit is with Icefall">
                  {OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED}
                </Notice>
              ) : company.status === "active" ? (
                <div className="rounded-tile bg-live-soft p-3">
                  <div className="text-[12.5px] font-semibold text-live">All sections complete</div>
                  <p className="mt-0.5 text-[12px] leading-snug text-live">
                    Your profile is live on Icefall.
                  </p>
                </div>
              ) : (
                <Notice tone="neutral">All sections are complete.</Notice>
              )}
            </div>

            <ul ref={checklistRef} className="mt-4 space-y-2.5 border-t border-line-soft pt-4">
              {checklist.map((row) => (
                <li key={row.label} className="flex items-center gap-2.5 text-[12.5px]">
                  {row.filled ? (
                    <CircleCheck size={15} className="shrink-0 text-live" aria-hidden />
                  ) : (
                    <Circle size={15} className="shrink-0 text-faint" aria-hidden />
                  )}
                  <span className={row.filled ? "text-ink" : "text-muted"}>{row.label}</span>
                  {row.withIcefall && (
                    <span className="ml-auto text-[11px] font-medium text-pending">With Icefall</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
              This lists what your profile contains. It is not a score — Icefall will not rank your company
              by how full a form is.
            </p>
          </Card>
        </div>
      )}

      {!editing && tab === "posts" && <PostsSurface />}

      {!editing && tab === "certifications" && (
        <Card className="p-4">
          <h2 className="text-[13px] font-semibold text-ink">Certifications</h2>
          {company.certifications.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted">None recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {company.certifications.map((c) => (
                <li key={c.mark} className="rounded-tile bg-canvas p-3">
                  <div className="text-[13px] font-semibold text-ink">{c.mark}</div>
                  <div className="text-[12px] text-muted">
                    {c.note} — {c.full}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
            {OPERATOR_NOTICES.documentsChecked(
              company.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null,
            ) ?? "Icefall has not recorded a document check for your company yet."}{" "}
            Icefall checks the documents you supply. It does not contact the issuing body.
          </p>
        </Card>
      )}

      {!editing && tab === "team" && (
        <Card className="p-4">
          <h2 className="text-[13px] font-semibold text-ink">Team</h2>
          {company.team.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted">Nobody listed yet.</p>
          ) : (
            <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {company.team.map((t) => (
                <li key={t.name} className="rounded-tile bg-canvas p-3">
                  <div className="text-[12.5px] font-medium text-ink">{t.name}</div>
                  <div className="text-[11.5px] text-muted">{t.role}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!editing && tab === "faq" && (
        <Card className="p-4">
          <h2 className="text-[13px] font-semibold text-ink">FAQ</h2>
          {company.faq.length === 0 ? (
            <p className="mt-2 text-[12.5px] text-muted">No questions added yet.</p>
          ) : (
            <dl className="mt-3 space-y-3">
              {company.faq.map((f) => (
                <div key={f.q} className="border-b border-line-soft pb-3 last:border-0">
                  <dt className="text-[12.5px] font-medium text-ink">{f.q}</dt>
                  <dd className="mt-1 text-[12.5px] leading-relaxed text-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      )}

      {editing && (
      <div className="grid gap-5 lg:grid-cols-[1fr_310px]">
        <div className="space-y-4">
          <Card className="p-4">
            <SectionHeading title="Your words" detail="These appear on your public company page." />
            <div className="space-y-4">
              <Field label="Tagline" hint="One line under your company name.">
                <input
                  className={inputClass}
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                />
              </Field>
              <Field label="Short description" hint="Two or three sentences on what you run and where.">
                <textarea
                  className={`${inputClass} min-h-[86px] resize-y`}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </Field>
              <Field label="About" hint="Your longer story — how the company started, how you work.">
                <textarea
                  className={`${inputClass} min-h-[130px] resize-y`}
                  value={form.about}
                  onChange={(e) => setForm({ ...form, about: e.target.value })}
                />
              </Field>
            </div>

            {/*
              Caught while typing, not at submission and not by a reviewer a week
              later. The rule is explained rather than merely enforced — an
              operator who understands WHY loses nothing by complying.
            */}
            {contactHits.length > 0 && (
              <div className="mt-4">
                <Notice tone="rejected" title={`Remove ${[...new Set(contactHits.map((h) => h.label))].join(" and ")}`}>
                  {OPERATOR_NOTICES.NO_CONTACT_DETAILS}
                </Notice>
              </div>
            )}

            {message && (
              <div className="mt-4">
                <Notice tone={message.tone}>{message.text}</Notice>
              </div>
            )}

            {/* The two actions, deliberately unequal in weight. */}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
              <Button onClick={() => void saveDraft()} disabled={changed.length === 0}>
                Save draft
              </Button>
              <Button
                variant="primary"
                onClick={() => void submit()}
                disabled={changed.length === 0 || contactHits.length > 0 || !!pending}
                title={pending ? "An edit is already with Icefall" : undefined}
              >
                Submit for approval
              </Button>
              <p className="w-full text-[11.5px] leading-snug text-muted sm:w-auto sm:flex-1">
                {changed.length === 0
                  ? "No changes yet."
                  : `${changed.length} ${changed.length === 1 ? "field" : "fields"} changed. Saving a draft keeps it private to your team; submitting sends it to Icefall.`}
              </p>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Currently live</h2>
            <div className="mt-2"><StatusChip status="live" /></div>
            <dl className="mt-3 space-y-2.5 text-[12.5px]">
              <div>
                <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">Name</dt>
                <dd className="mt-0.5 text-ink">{company.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">Based in</dt>
                <dd className="mt-0.5 text-ink">
                  {[company.city, company.country].filter(Boolean).join(", ") || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-medium tracking-wide text-faint uppercase">Tagline</dt>
                <dd className="mt-0.5 text-muted">{company.tagline ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
              Your company name and location are set by Icefall. Ask your Icefall contact to change them.
            </p>
          </Card>

          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-ink">Credentials</h2>
            {company.certifications.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-muted">None recorded.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {company.certifications.map((c) => (
                  <li key={c.mark} className="text-[12.5px]">
                    <span className="font-semibold text-ink">{c.mark}</span>{" "}
                    <span className="text-muted">— {c.note}</span>
                    <div className="text-[11px] text-faint">{c.full}</div>
                  </li>
                ))}
              </ul>
            )}
            {/*
              Verification is a statement about what ICEFALL did, and only when
              it did it. No date is rendered when no check has been recorded —
              a fabricated "checked on" line is the exact violation already
              shipping in the consumer web app's demo data.
            */}
            <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
              {OPERATOR_NOTICES.documentsChecked(
                company.documentsCheckedAt ? formatDay(company.documentsCheckedAt.slice(0, 10)) : null,
              ) ?? "Icefall has not recorded a document check for your company yet."}
            </p>
          </Card>
        </div>
      </div>
      )}
    </>
  );
}