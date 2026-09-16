/**
 * TRIP · CONTACTS (brief M5, plan §3.5) — the numbers you need on the hill.
 *
 * Typed here, saved on the phone, dialable with one big tap. The athlete's own
 * emergency contacts are not copied: they are shown from the emergency info the
 * SOS screen already owns, with a link to edit them there.
 */

import { useState } from "react";
import { Link } from "react-router-dom";

import type { StoredContact } from "@/device/db";
import { cn } from "@/lib/utils";

import { useEmergencyInfo } from "../emergencyInfo";
import { MOUNTAIN_PATHS } from "../paths";
import {
  EMERGENCY_INFO_SOURCE,
  KEPT_ON_THIS_PHONE,
  NO_SIGNAL_CALL_SENTENCE,
  ROLE_LABEL,
  ROLE_ORDER,
  contactProblem,
  draftFrom,
  emergencyInfoContacts,
  emptyContactDraft,
  undialableNote,
  useTripContacts,
  type ContactDraft,
} from "./contacts";
import { telHref } from "../sos";
import { useMountainTrip } from "../trip";
import { BigButton, SectionLabel, buttonClass } from "../ui";
import { SAVED_HERE_LINE, SubHeader, SubNote } from "./chrome";

const ROW = "border-t border-hairline px-5 py-4";
const INPUT =
  "mt-1 min-h-16 w-full rounded-none border-0 border-b border-hairline-strong bg-transparent px-0 m-text-body text-snow placeholder:text-mist-dim focus:border-azure focus:outline-none";
/* A plain text control, not a bordered pill: the only bordered rectangles on
   these screens are the real buttons (mockup spec §0). */
const TEXT_BUTTON = "flex min-h-16 flex-1 items-center justify-center m-text-label";

export default function ContactsScreen() {
  const { trip } = useMountainTrip();
  const tripId = trip?.id ?? null;
  const { contacts, loading, storageProblem, full, save, remove } = useTripContacts(tripId);
  const info = useEmergencyInfo();
  const own = emergencyInfoContacts(info);

  const [draft, setDraft] = useState<ContactDraft | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);

  const startAdd = () => {
    setSaveFailed(false);
    setDraft(emptyContactDraft(contacts.length === 0 ? "guide" : "other"));
  };

  const onSave = async (d: ContactDraft) => {
    const ok = await save(d);
    setSaveFailed(!ok);
    if (ok) setDraft(null);
  };

  return (
    <div className="pb-10">
      <SubHeader title="Contacts" />
      <SubNote>
        Your guide, your operator and anyone else you may need to call. {KEPT_ON_THIS_PHONE}
      </SubNote>

      {storageProblem && (
        <p className={cn(ROW, "mt-6 m-text-body leading-snug text-alert")} role="alert">
          {storageProblem} Write these numbers on paper.
        </p>
      )}

      <section className="mt-4" aria-labelledby="saved-heading">
        <SectionLabel as="h2" id="saved-heading" className="px-5 pb-2">
          Saved here
        </SectionLabel>

        {loading ? (
          <p className={cn(ROW, "m-text-body text-mist")}>Reading this phone…</p>
        ) : contacts.length === 0 ? (
          <p className={cn(ROW, "m-text-body leading-snug text-mist")}>
            No numbers saved yet. Add your guide before you leave the valley — you cannot add one
            with no signal if you have not written it down.
          </p>
        ) : (
          <ul>
            {contacts.map((c) =>
              draft?.id === c.id ? (
                <li key={c.id}>
                  <ContactForm
                    draft={draft}
                    onChange={setDraft}
                    onSave={onSave}
                    onCancel={() => setDraft(null)}
                    failed={saveFailed}
                  />
                </li>
              ) : (
                <li key={c.id}>
                  <ContactRow
                    contact={c}
                    onEdit={() => {
                      setSaveFailed(false);
                      setDraft(draftFrom(c));
                    }}
                    onDelete={() => void remove(c.id)}
                  />
                </li>
              ),
            )}
          </ul>
        )}

        {draft && draft.id === null && (
          <ContactForm
            draft={draft}
            onChange={setDraft}
            onSave={onSave}
            onCancel={() => setDraft(null)}
            failed={saveFailed}
          />
        )}

        {!draft && !full && (
          <button
            type="button"
            onClick={startAdd}
            className={cn(ROW, "flex min-h-16 w-full items-center text-left m-text-body text-snow")}
          >
            Add a contact
          </button>
        )}
        {full && !draft && (
          <p className={cn(ROW, "m-text-label leading-snug text-mist")}>
            That is as many as this screen holds. Delete one to add another.
          </p>
        )}
      </section>

      {own.length > 0 && (
        <section className="mt-10" aria-labelledby="own-heading">
          <SectionLabel as="h2" id="own-heading" className="px-5 pb-2">
            Your emergency info
          </SectionLabel>
          {own.map((c) => (
            <div key={c.key} className={ROW}>
              <p className="m-text-body leading-snug text-snow">{c.label}</p>
              <p className="mt-1 m-text-label text-mist">
                {EMERGENCY_INFO_SOURCE}
                {c.note ? ` · ${c.note}` : ""}
              </p>
              <CallButton label={c.label} number={c.number} />
            </div>
          ))}
          <Link
            to={MOUNTAIN_PATHS.sos}
            className={cn(ROW, "flex min-h-16 items-center m-text-body text-snow")}
          >
            Edit these on the SOS screen
          </Link>
        </section>
      )}

      <section className="mt-10">
        <Link
          to={MOUNTAIN_PATHS.sos}
          className={cn(ROW, "flex min-h-16 items-center m-text-body text-snow")}
        >
          Rescue numbers and your position · SOS
        </Link>
        <p className="px-5 pt-3 m-text-label leading-snug text-mist">{NO_SIGNAL_CALL_SENTENCE}</p>
        <p className="px-5 pt-2 m-text-label leading-snug text-mist">
          These numbers are kept on this phone only. Nothing is uploaded, so there is no copy if you
          lose it.
        </p>
      </section>
    </div>
  );
}

function ContactRow({
  contact,
  onEdit,
  onDelete,
}: {
  contact: StoredContact;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = contact.name || ROLE_LABEL[contact.role];

  return (
    <div className={ROW}>
      {/* The mockup's three lines: who it is, which one, where it lives. */}
      <p className="m-text-body leading-snug text-snow">{name}</p>
      <p className="mt-1 m-text-label leading-snug text-mist">
        {ROLE_LABEL[contact.role]}
        {contact.note ? ` · ${contact.note}` : ""}
      </p>
      <p className="mt-1 m-text-label text-mist-dim">{SAVED_HERE_LINE}</p>
      <CallButton label={name} number={contact.number} />
      <div className="mt-2 flex gap-3">
        <button type="button" onClick={onEdit} className={cn(TEXT_BUTTON, "text-snow")}>
          Edit
        </button>
        {confirming ? (
          <BigButton
            variant="red"
            size="sm"
            className="flex-1"
            onClick={() => {
              setConfirming(false);
              onDelete();
            }}
          >
            Yes, delete
          </BigButton>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={cn(TEXT_BUTTON, "text-mist")}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/** One tap, the number on the button, and never a dead tap on something no phone can dial (plan §5.1). */
function CallButton({ label, number }: { label: string; number: string }) {
  const href = telHref(number);
  if (!number) return <p className="mt-2 m-text-body text-mist">No number saved.</p>;
  if (!href) {
    return (
      <>
        <p className="mt-2 m-text-number leading-tight tabular-nums text-snow">{number}</p>
        <p className="mt-1 m-text-label leading-snug text-mist">{undialableNote(number)}</p>
      </>
    );
  }
  return (
    <a
      href={href}
      aria-label={`Call ${label}, ${number}`}
      className={cn(buttonClass("azure"), "mt-3 tabular-nums")}
    >
      Call {number}
    </a>
  );
}

function ContactForm({
  draft,
  onChange,
  onSave,
  onCancel,
  failed,
}: {
  draft: ContactDraft;
  onChange: (d: ContactDraft) => void;
  onSave: (d: ContactDraft) => void;
  onCancel: () => void;
  failed: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const problem = contactProblem(draft);

  return (
    <form
      className={ROW}
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!problem) onSave(draft);
      }}
    >
      <SectionLabel>Who is it</SectionLabel>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROLE_ORDER.map((role) => (
          <button
            key={role}
            type="button"
            aria-pressed={draft.role === role}
            onClick={() => onChange({ ...draft, role })}
            className={buttonClass(draft.role === role ? "azure" : "azure-outline", "sm")}
          >
            {ROLE_LABEL[role]}
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="section-label">Name</span>
        <input
          className={INPUT}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          autoComplete="off"
          placeholder="Who you are calling"
        />
      </label>

      <label className="mt-3 block">
        <span className="section-label">Number</span>
        <input
          className={INPUT}
          value={draft.number}
          onChange={(e) => onChange({ ...draft, number: e.target.value })}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="With the country code"
        />
      </label>

      <label className="mt-3 block">
        <span className="section-label">Note</span>
        <input
          className={INPUT}
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          autoComplete="off"
          placeholder="Optional"
        />
      </label>

      {touched && problem && (
        <p className="mt-3 m-text-body text-alert" role="alert">
          {problem}
        </p>
      )}
      {failed && (
        <p className="mt-3 m-text-body leading-snug text-alert" role="alert">
          This phone would not save it. Write the number on paper.
        </p>
      )}

      <div className="mt-4 flex gap-3">
        <BigButton variant="azure" size="sm" type="submit" className="flex-1">
          Save on this phone
        </BigButton>
        <button type="button" onClick={onCancel} className={cn(TEXT_BUTTON, "text-snow")}>
          Cancel
        </button>
      </div>
    </form>
  );
}
