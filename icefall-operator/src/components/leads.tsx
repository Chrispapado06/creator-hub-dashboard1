/**
 * Lead furniture shared by the inbox and the pipeline.
 *
 * Tags, the origin mark, and the add-a-lead dialog live here because both
 * screens show all three and a second spelling of any of them would be a second
 * meaning. The rules they enforce are the domain's, not this file's — every
 * write goes through the backend, which is where the refusals are.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, Tag as TagIcon, X } from "lucide-react";
import type { Lead, LeadStatus, Mountain, Product } from "@/domain/types";
import { LEAD_PIPELINE } from "@/domain/types";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { useOperator, useSession } from "@/state/OperatorContext";

/* -------------------------------------------------------------------------- */
/* Stage vocabulary                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The words the operator asked for — "who's interested, who booked" — mapped
 * onto the pipeline the schema already has. The stage NAMES are unchanged;
 * only the column headings speak plainly.
 */
export const STAGE_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Interested",
  quoted: "Quoted",
  booked: "Booked",
  lost: "Lost",
  disputed: "Disputed",
};

export const STAGE_HINT: Record<LeadStatus, string> = {
  new: "Just arrived. Nobody has replied yet.",
  contacted: "You have replied; they have not committed.",
  qualified: "Genuinely interested — right trip, right dates.",
  quoted: "A price is with them.",
  booked: "They are going.",
  lost: "Not proceeding.",
  disputed: "Icefall is reviewing this one.",
};

/** Tone per stage. Booked is the only green; lost the only red. */
export const STAGE_CLASS: Record<LeadStatus, string> = {
  new: "text-azure-ink bg-azure-soft",
  contacted: "text-muted bg-draft-soft",
  qualified: "text-pending bg-pending-soft",
  quoted: "text-expired bg-expired-soft",
  booked: "text-live bg-live-soft",
  lost: "text-rejected bg-rejected-soft",
  disputed: "text-rejected bg-rejected-soft",
};

export function StageChip({ status }: { status: LeadStatus }) {
  return (
    <span
      title={STAGE_HINT[status]}
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] uppercase whitespace-nowrap ${STAGE_CLASS[status]}`}
    >
      {STAGE_LABEL[status]}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Origin                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Marks a lead the company added themselves.
 *
 * Deliberately shown on the lead and NOT as a decoration: it is the reason this
 * row is missing from the dashboard's figures, and an operator who cannot see
 * which rows those are will read the difference as a bug.
 */
export function OriginMark({ lead }: { lead: Lead }) {
  if (lead.origin !== "company") return null;
  return (
    <span
      title="You added this lead. Icefall did not send it, so it is not counted in your Icefall figures."
      className="inline-flex items-center rounded-pill bg-draft-soft px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] text-muted uppercase whitespace-nowrap"
    >
      Added by you
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

export function TagChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-azure-soft py-0.5 pr-1.5 pl-2 text-[11px] font-medium text-azure-ink">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag ${label}`}
          className="rounded-pill p-0.5 text-azure-ink/70 transition-colors hover:bg-azure-glow hover:text-azure-ink"
        >
          <X size={10} aria-hidden />
        </button>
      )}
    </span>
  );
}

/** Read-only tag row for cards and lists. */
export function TagRow({ tags, max = 3 }: { tags: readonly string[]; max?: number }) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, max);
  const rest = tags.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <TagChip key={t} label={t} />
      ))}
      {rest > 0 && <span className="text-[10.5px] text-faint">+{rest}</span>}
    </span>
  );
}

/**
 * THE READY-MADE TAGS (OP-05).
 *
 * The owner's own words: "tags should be ready so cold lead, waste of time,
 * interested, inquired etc". These four are theirs verbatim; the rest are the
 * ordinary sales shorthand that was already here and still earns its place.
 *
 * NOTE WHAT THESE ARE NOT. They are not stages. `LEAD_PIPELINE` already carries
 * new → contacted → qualified → quoted → booked → lost, and a lead is in exactly
 * one of those. A tag is the operator's own judgement laid ON TOP of that — a
 * lead can be Quoted AND a waste of time, and the two facts do not contradict.
 * Collapsing them into one axis would lose whichever the pipeline did not use.
 */
export const PRESET_TAGS = [
  "Enquired",
  "Interested",
  "Cold lead",
  "Waste of time",
  "Deposit paid",
  "Repeat client",
  "Awaiting quote reply",
  "Needs dates",
  "Group booking",
  "First-timer",
  "Referral",
  "Phone enquiry",
] as const;

/** The owner's four, offered first because they are the ones asked for. */
export const PRIMARY_TAGS: readonly string[] = PRESET_TAGS.slice(0, 4);

const SUGGESTED_TAGS: readonly string[] = PRESET_TAGS;

/**
 * Add and remove a lead's tags.
 *
 * Writes immediately — no Save button. A tag is a sticky note, and a sticky
 * note that needs confirming does not get written. The backend normalises and
 * refuses; a refusal is shown here rather than swallowed.
 */
export function TagEditor({ lead, onChanged }: { lead: Lead; onChanged?: () => void }) {
  const session = useSession();
  const { backend, refresh } = useOperator();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) input.current?.focus();
  }, [adding]);

  const commit = async (tags: string[]) => {
    setError(null);
    const res = await backend.setLeadTags(session, lead.id, tags);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    refresh();
    onChanged?.();
  };

  const add = (raw: string) => {
    const t = raw.trim();
    setDraft("");
    if (!t) return;
    if (lead.tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    void commit([...lead.tags, t]);
  };

  const unused = SUGGESTED_TAGS.filter(
    (s) => !lead.tags.some((t) => t.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <TagIcon size={12} className="shrink-0 text-faint" aria-hidden />
        {lead.tags.map((t) => (
          <TagChip
            key={t}
            label={t}
            onRemove={() => void commit(lead.tags.filter((x) => x !== t))}
          />
        ))}
        {adding ? (
          <input
            ref={input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              add(draft);
              setAdding(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
              if (e.key === "Escape") {
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="Tag name"
            aria-label="New tag"
            className="w-[110px] rounded-pill border border-line bg-elevated px-2 py-0.5 text-[11px] text-ink outline-none focus:border-azure"
          />
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-0.5 rounded-pill border border-dashed border-line px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-azure hover:text-azure-ink"
          >
            <Plus size={10} aria-hidden />
            Add tag
          </button>
        )}
      </div>

      {adding && unused.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {unused.slice(0, 5).map((s) => (
            <button
              key={s}
              type="button"
              // onMouseDown, not onClick: the input's onBlur fires first
              // otherwise and the suggestion is gone before the click lands.
              onMouseDown={(e) => {
                e.preventDefault();
                add(s);
              }}
              className="rounded-pill bg-raised px-2 py-0.5 text-[10.5px] text-muted transition-colors hover:bg-azure-soft hover:text-azure-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-1.5 text-[11.5px] text-rejected">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Add a lead                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Record a lead the company got themselves.
 *
 * The dialog states the attribution consequence UP FRONT rather than in a
 * footnote after saving: this row will not appear in the Icefall figures. An
 * operator who discovers that later reasonably concludes the numbers are
 * broken.
 */
export function AddLeadDialog({
  products,
  mountains,
  onClose,
  onCreated,
}: {
  products: readonly Product[];
  mountains: readonly Mountain[];
  onClose: () => void;
  onCreated?: (lead: Lead) => void;
}) {
  const session = useSession();
  const { backend, refresh } = useOperator();
  const [name, setName] = useState("");
  const [productId, setProductId] = useState("");
  const [mountainId, setMountainId] = useState("");
  const [source, setSource] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const res = await backend.createLead(session, {
      customerName: name,
      productId: productId || null,
      mountainId: productId ? null : mountainId || null,
      source: source || null,
      note: note || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    refresh();
    onCreated?.(res.value);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add a lead"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="max-h-[85vh] overflow-y-auto p-5">
          <h2 className="text-[14px] font-semibold text-ink">Add a lead</h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            For an enquiry that reached you directly — a phone call, a referral, a returning
            client. It joins your pipeline like any other.
          </p>

          <div className="mt-4 space-y-3.5">
            <Field label="Customer name">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Who got in touch"
                className={inputClass}
              />
            </Field>

            <Field label="Trip" hint="Leave blank if they have not chosen one yet.">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className={inputClass}
              >
                <option value="">Not decided</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>

            {!productId && (
              <Field label="Mountain" hint="Optional, if you know where they want to go.">
                <select
                  value={mountainId}
                  onChange={(e) => setMountainId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Not decided</option>
                  {mountains.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="How they reached you" hint="Your own words — Phone, Referral, Walk-in.">
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Phone"
                className={inputClass}
              />
            </Field>

            <Field label="First note" hint="Optional. Saved as the first note on this lead.">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="What they asked about"
                className={`${inputClass} resize-y`}
              />
            </Field>
          </div>

          {/*
           * Said BEFORE saving, not after. This is the one consequence an
           * operator cannot infer from the form.
           */}
          <p className="mt-3.5 rounded-tile bg-canvas px-3 py-2 text-[11.5px] leading-relaxed text-muted">
            Icefall did not send this enquiry, so it stays out of your Icefall enquiry and
            booking figures. It appears in your pipeline and counts as your own.
          </p>

          {error && <p className="mt-2.5 text-[12px] text-rejected">{error}</p>}

          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3.5">
            <Button variant="primary" onClick={() => void submit()} disabled={!name.trim() || saving}>
              {saving ? "Adding…" : "Add lead"}
            </Button>
            <Button variant="quiet" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/** The stages a board shows, in order. `disputed` is ICEFALL's, not a column. */
export const BOARD_STAGES: readonly LeadStatus[] = LEAD_PIPELINE;
