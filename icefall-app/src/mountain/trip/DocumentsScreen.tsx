/**
 * TRIP > DOCUMENTS (brief M5, plan §3.5). Permits, hut bookings and insurance
 * as files on this phone. Add, look at, delete. Nothing leaves the phone and
 * nothing here asks the network, so it is identical in airplane mode.
 *
 * Glove-first: every control is at least 64 px tall and the two add buttons
 * sit at the bottom, in thumb reach.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { DocumentKind, StoredDocument } from "@/device/db";
import { cn } from "@/lib/utils";

import { ageLabel } from "../format";
import { useMountainTrip } from "../trip";
import { BigButton, SectionLabel, buttonClass } from "../ui";
import { SAVED_HERE_LINE, SubHeader, SubNote, SubRow } from "./chrome";
import {
  CAMERA_LEAVES_APP,
  DOCUMENT_KINDS,
  IOS_CLEARING_NOTE,
  KEPT_ON_THIS_PHONE_LINE,
  KIND_LABEL,
  NO_BACKUP_NOTE,
  NO_DOCUMENTS_LINE,
  ONLY_COPY_NOTE,
  canShowInline,
  largeFileWarning,
  openNote,
  sizeLabel,
  useDocuments,
} from "./documents";

const ROW = "border-t border-hairline px-5";
const INPUT =
  "mt-1 min-h-16 w-full rounded-none border-0 border-b border-hairline-strong bg-transparent px-0 m-text-body text-snow placeholder:text-mist-dim focus:border-azure focus:outline-none";

interface Pending {
  file: File;
  name: string;
  kind: DocumentKind;
  note: string;
}

export default function DocumentsScreen() {
  const { trip } = useMountainTrip();
  const { docs, loading, error, add, remove } = useDocuments(trip?.id ?? null);
  const [pending, setPending] = useState<Pending | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  const total = docs.reduce((n, d) => n + (Number.isFinite(d.sizeBytes) ? d.sizeBytes : 0), 0);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setPending({ file, name: file.name, kind: "other", note: "" });
  };

  const save = async () => {
    if (!pending) return;
    const res = await add({
      file: pending.file,
      kind: pending.kind,
      name: pending.name,
      note: pending.note,
      tripId: trip?.id ?? null,
    });
    if (res.ok) setPending(null);
  };

  return (
    <div className="flex min-h-full flex-col pb-6">
      <SubHeader title="Documents" />

      {error && (
        <p className="mt-6 px-5 m-text-body leading-snug text-alert" role="alert">
          {error}
        </p>
      )}

      {pending ? (
        <AddForm
          pending={pending}
          onChange={setPending}
          onSave={save}
          onCancel={() => setPending(null)}
        />
      ) : (
        <>
          <section className="mt-2" aria-labelledby="saved-heading">
            <SectionLabel as="h2" id="saved-heading" className="px-5 pb-2">
              On this phone
            </SectionLabel>
            {loading ? (
              <SubNote className={ROW}>Reading this phone…</SubNote>
            ) : docs.length === 0 ? (
              <SubNote className={ROW}>{NO_DOCUMENTS_LINE}</SubNote>
            ) : (
              <ul>
                {docs.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} onDelete={() => remove(doc.id)} />
                ))}
              </ul>
            )}
            {docs.length > 0 && (
              <p className={cn(ROW, "pt-3 m-text-label leading-snug text-mist-dim")}>
                {docs.length} file{docs.length === 1 ? "" : "s"} · {sizeLabel(total)} used on this
                phone.
              </p>
            )}
            <div className="mt-4 space-y-2 px-5 m-text-label leading-snug text-mist-dim">
              <p>{KEPT_ON_THIS_PHONE_LINE}</p>
              <p>{NO_BACKUP_NOTE}</p>
              <p>{ONLY_COPY_NOTE}</p>
              <p>{IOS_CLEARING_NOTE}</p>
            </div>
          </section>

          <div className="mt-auto flex flex-col gap-3 px-5 pt-10">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Choose a file to save on this phone"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Take a photo of a document"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <BigButton variant="azure" onClick={() => fileInput.current?.click()}>
              Add a file
            </BigButton>
            <BigButton variant="azure-outline" onClick={() => cameraInput.current?.click()}>
              Take a photo
            </BigButton>
            <p className="m-text-label leading-snug text-mist-dim">{CAMERA_LEAVES_APP}</p>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One saved document                                                          */
/* -------------------------------------------------------------------------- */

function DocumentRow({ doc, onDelete }: { doc: StoredDocument; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const url = useBlobUrl(open ? doc.blob : null);
  const note = openNote(doc.mime);

  return (
    <li>
      {/* The mockup's three lines: what it is, which one it is, where it lives. */}
      <SubRow
        title={doc.name}
        detail={
          <>
            {KIND_LABEL[doc.kind]} · {sizeLabel(doc.sizeBytes)} · added{" "}
            {ageLabel(Date.now() - doc.addedAt)}
            {doc.note ? ` · ${doc.note}` : ""}
          </>
        }
        note={SAVED_HERE_LINE}
        trailing={open ? "Close" : "Open"}
        chevron={false}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      />

      {open && (
        <div className="px-5 pb-3">
          {url === null ? (
            <p className="m-text-label text-mist">Opening…</p>
          ) : canShowInline(doc.mime) ? (
            <img src={url} alt={doc.name} className="max-h-[60vh] w-full object-contain" />
          ) : (
            <a href={url} target="_blank" rel="noreferrer" className={buttonClass("azure-outline")}>
              Open in a new tab
            </a>
          )}
          {note && <p className="mt-2 m-text-label leading-snug text-mist-dim">{note}</p>}
        </div>
      )}

      {confirming ? (
        <div className="flex flex-col gap-2 px-5 pb-3">
          <p className="m-text-body leading-snug text-snow">
            Delete {doc.name}? There is no other copy.
          </p>
          <div className="flex gap-3">
            <BigButton variant="red" size="sm" className="flex-1" onClick={onDelete}>
              Delete
            </BigButton>
            <BigButton
              variant="azure-outline"
              size="sm"
              className="flex-1"
              onClick={() => setConfirming(false)}
            >
              Keep
            </BigButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex min-h-16 items-center px-5 m-text-label text-mist"
          onClick={() => setConfirming(true)}
        >
          Delete
        </button>
      )}
    </li>
  );
}

/** A blob URL for as long as the row is open, revoked the moment it closes. */
function useBlobUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => {
      URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

/* -------------------------------------------------------------------------- */
/* Naming what was just picked                                                 */
/* -------------------------------------------------------------------------- */

function AddForm({
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  pending: Pending;
  onChange: (p: Pending) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const warning = useMemo(() => largeFileWarning(pending.file.size), [pending.file.size]);

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <section className="mt-8">
        <SectionLabel as="h2" className="px-5 pb-2">
          New document
        </SectionLabel>
        <p className={cn(ROW, "py-3 m-text-body text-mist")}>
          {pending.file.name || "Photo"} · {sizeLabel(pending.file.size)}
        </p>
        {warning && <p className="px-5 pt-2 m-text-label leading-snug text-alert">{warning}</p>}

        <div className={cn(ROW, "py-3")}>
          <SectionLabel as="p" className="pb-1">
            <label htmlFor="doc-name">Name</label>
          </SectionLabel>
          <input
            id="doc-name"
            className={INPUT}
            value={pending.name}
            placeholder="Permit, hut booking, policy…"
            onChange={(e) => onChange({ ...pending, name: e.target.value })}
          />
        </div>

        <fieldset className={cn(ROW, "py-3")}>
          <legend className="section-label">What is it</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {DOCUMENT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={pending.kind === k}
                onClick={() => onChange({ ...pending, kind: k })}
                className={buttonClass(pending.kind === k ? "azure" : "azure-outline", "sm")}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={cn(ROW, "py-3")}>
          <SectionLabel as="p" className="pb-1">
            <label htmlFor="doc-note">Note (optional)</label>
          </SectionLabel>
          <input
            id="doc-note"
            className={INPUT}
            value={pending.note}
            placeholder="Reference number, who to call"
            onChange={(e) => onChange({ ...pending, note: e.target.value })}
          />
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-3 px-5 pt-10">
        <BigButton variant="azure" type="submit">
          Save on this phone
        </BigButton>
        <button
          type="button"
          className="flex min-h-16 items-center justify-center m-text-label text-mist"
          onClick={onCancel}
        >
          Discard
        </button>
      </div>
    </form>
  );
}
