/**
 * "Your emergency info" on the SOS screen (plan §5.7). Shows what is saved,
 * edits it in place, deletes it. Kept on this phone only.
 *
 * The destination country is the one field here the emergency dataset reads:
 * it is what the SOS screen falls back to when there is no trip on a mountain
 * ICEFALL holds numbers for. So the row says, quietly and while you are still
 * typing, whether that name matches anything — before you are on the mountain,
 * which is the only time it is any use.
 */

import { useState } from "react";

import { destinationSentence, matchDestination } from "./destinationCountry";
import {
  MAX_CONTACTS,
  NO_HEALTH_DATA,
  deleteEmergencyInfo,
  emptyEmergencyInfo,
  saveEmergencyInfo,
  type EmergencyInfo,
} from "./emergencyInfo";
import { telHref } from "./sos";
import { M_LABEL } from "./ui";

/* The shared Mountain section label (mockup spec §0), so this heading and the
   row labels move with every other label in the mode. */
const LABEL = `${M_LABEL} text-mist`;
const ROW = "border-t border-hairline px-5 py-3";
const INPUT =
  "mt-1 min-h-16 w-full rounded-none border-0 border-b border-hairline-strong bg-transparent px-0 text-[19px] text-snow placeholder:text-mist-dim focus:border-azure focus:outline-none";
const BUTTON = "min-h-16 flex-1 rounded-full text-[17px]";

export default function EmergencyInfoSection({ info }: { info: EmergencyInfo | null }) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState<EmergencyInfo>(() => info ?? emptyEmergencyInfo());
  const [saveFailed, setSaveFailed] = useState(false);

  const startEdit = () => {
    const base = info ?? emptyEmergencyInfo();
    setDraft({ ...base, contacts: base.contacts.length ? base.contacts : [{ name: "", number: "" }] });
    setSaveFailed(false);
    setEditing(true);
  };

  const save = () => {
    const ok = saveEmergencyInfo(draft);
    setSaveFailed(!ok);
    if (ok) setEditing(false);
  };

  const set = (patch: Partial<EmergencyInfo>) => setDraft((d) => ({ ...d, ...patch }));
  const setContact = (i: number, patch: Partial<EmergencyInfo["contacts"][number]>) =>
    setDraft((d) => ({ ...d, contacts: d.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));

  const removeSavedContact = (i: number) => {
    if (!info) return;
    saveEmergencyInfo({ ...info, contacts: info.contacts.filter((_, j) => j !== i) });
  };

  return (
    <section aria-labelledby="own-info-heading" className="mt-10">
      <h2 id="own-info-heading" className={`${LABEL} px-5 pb-2`}>
        My emergency info
      </h2>

      {editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field label="Your name" value={draft.name} onChange={(v) => set({ name: v })} autoComplete="name" />
          <Field
            label="Destination country"
            value={draft.destinationCountry}
            onChange={(v) => set({ destinationCountry: v })}
            hint={destinationSentence(matchDestination(draft.destinationCountry))}
          />
          {draft.contacts.map((c, i) => (
            <div key={i} className={ROW}>
              <p className={LABEL}>Contact {i + 1}</p>
              <input
                aria-label={`Contact ${i + 1} name`}
                placeholder="Name"
                className={INPUT}
                value={c.name}
                onChange={(e) => setContact(i, { name: e.target.value })}
              />
              <input
                aria-label={`Contact ${i + 1} phone number`}
                placeholder="Phone number, with country code"
                inputMode="tel"
                type="tel"
                className={INPUT}
                value={c.number}
                onChange={(e) => setContact(i, { number: e.target.value })}
              />
              <button
                type="button"
                onClick={() => set({ contacts: draft.contacts.filter((_, j) => j !== i) })}
                className="mt-1 min-h-16 text-[17px] text-mist"
              >
                Remove contact {i + 1}
              </button>
            </div>
          ))}
          {draft.contacts.length < MAX_CONTACTS && (
            <button
              type="button"
              onClick={() => set({ contacts: [...draft.contacts, { name: "", number: "" }] })}
              className={`${ROW} flex min-h-16 w-full items-center text-left text-[17px] text-snow`}
            >
              Add a contact
            </button>
          )}
          <Field label="Insurer" value={draft.insurer} onChange={(v) => set({ insurer: v })} />
          <Field label="Policy reference" value={draft.policyRef} onChange={(v) => set({ policyRef: v })} />
          <Field
            label="Insurer's rescue line"
            value={draft.rescueHotline}
            onChange={(v) => set({ rescueHotline: v })}
            tel
          />
          <div className={ROW}>
            <label className={LABEL} htmlFor="cover-note">
              What your cover includes
            </label>
            <textarea
              id="cover-note"
              rows={3}
              className={`${INPUT} py-3`}
              value={draft.coverNote}
              onChange={(e) => set({ coverNote: e.target.value })}
            />
          </div>
          <div className="flex gap-3 border-t border-hairline px-5 py-4">
            {/* Azure, not white — the primary action on every mockup screen. */}
            <button type="submit" className={`${BUTTON} bg-azure font-medium text-obsidian`}>
              Save on this phone
            </button>
            <button type="button" onClick={() => setEditing(false)} className={`${BUTTON} text-snow`}>
              Cancel
            </button>
          </div>
          {saveFailed && (
            <p className="px-5 pb-3 text-[17px] text-alert" role="alert">
              This phone would not save it. Write it on paper.
            </p>
          )}
        </form>
      ) : info ? (
        <>
          {info.name && <Saved label="Name" value={info.name} />}
          {info.destinationCountry && (
            <Saved
              label="Destination"
              value={info.destinationCountry}
              hint={destinationSentence(matchDestination(info.destinationCountry))}
            />
          )}
          {info.contacts.map((c, i) => {
            const href = telHref(c.number);
            return (
              <div key={i} className={`${ROW} flex items-center gap-3`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[17px] text-snow">{c.name || `Contact ${i + 1}`}</p>
                  {href ? (
                    <a href={href} className="flex min-h-16 items-center text-[22px] tabular-nums text-snow underline">
                      {c.number}
                    </a>
                  ) : (
                    <p className="text-[19px] text-mist">{c.number || "No number"}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeSavedContact(i)}
                  className="min-h-16 px-2 text-[15px] text-mist"
                  aria-label={`Delete ${c.name || `contact ${i + 1}`}`}
                >
                  Delete
                </button>
              </div>
            );
          })}
          {info.insurer && <Saved label="Insurer" value={info.insurer} />}
          {info.policyRef && <Saved label="Policy" value={info.policyRef} />}
          {info.rescueHotline && <Saved label="Insurer's rescue line" value={info.rescueHotline} tel />}
          {info.coverNote && <Saved label="Cover" value={info.coverNote} stacked />}
          <div className="flex gap-3 border-t border-hairline px-5 py-4">
            <button type="button" onClick={startEdit} className={`${BUTTON} text-snow`}>
              Edit
            </button>
            {confirmDelete ? (
              <button
                type="button"
                onClick={() => {
                  deleteEmergencyInfo();
                  setConfirmDelete(false);
                }}
                className={`${BUTTON} bg-[color:var(--ice-danger-fill,#d92b1f)] font-medium`}
                style={{ color: "#fff" }}
              >
                Yes, delete all
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className={`${BUTTON} text-mist`}>
                Delete all
              </button>
            )}
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className={`${ROW} flex min-h-16 w-full items-center text-left text-[17px] text-snow`}
        >
          Add contacts and insurance
        </button>
      )}

      <p className="border-t border-hairline px-5 pt-3 text-[15px] leading-snug text-mist">
        Kept on this phone only. It is never uploaded.
      </p>
      <p className="px-5 pt-2 text-[15px] leading-snug text-mist">{NO_HEALTH_DATA}</p>
    </section>
  );
}

const HINT = "mt-2 text-[15px] leading-snug text-mist";

function Field({
  label,
  value,
  onChange,
  tel,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  tel?: boolean;
  autoComplete?: string;
  hint?: string | null;
}) {
  return (
    <label className={`${ROW} block`}>
      <span className={LABEL}>{label}</span>
      <input
        className={INPUT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={tel ? "tel" : "text"}
        inputMode={tel ? "tel" : undefined}
        autoComplete={autoComplete ?? "off"}
      />
      {hint && <span className={`block ${HINT}`}>{hint}</span>}
    </label>
  );
}

/**
 * A label/value row: label left, value right (mockup spec §5). `stacked` is for
 * a value too long to sit on one line — the cover note — which keeps the label
 * above it instead.
 */
function Saved({
  label,
  value,
  tel,
  hint,
  stacked,
}: {
  label: string;
  value: string;
  tel?: boolean;
  hint?: string | null;
  stacked?: boolean;
}) {
  const href = tel ? telHref(value) : null;
  return (
    <div className={ROW}>
      <div className={stacked ? undefined : "flex items-center justify-between gap-4"}>
        <p className={LABEL}>{label}</p>
        {href ? (
          <a href={href} className="flex min-h-16 shrink-0 items-center text-[22px] tabular-nums text-snow underline">
            {value}
          </a>
        ) : (
          <p className={`whitespace-pre-line text-[17px] text-snow ${stacked ? "mt-1" : "text-right"}`}>{value}</p>
        )}
      </div>
      {hint && <p className={HINT}>{hint}</p>}
    </div>
  );
}
