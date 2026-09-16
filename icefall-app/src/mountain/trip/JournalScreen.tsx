/**
 * TRIP > JOURNAL (brief M5, plan §3.5). Notes and photos written on the hill,
 * each stamped with the time, the height and the position AT THE MOMENT OF
 * WRITING. Nothing here asks the network or an AI, so it is identical in
 * airplane mode.
 *
 * Two honesty rules show up in the markup rather than the copy:
 *   · an entry with no position says so instead of borrowing a newer fix;
 *   · a photo thumbnail is only drawn when the row is open, so a long journal
 *     never holds a hundred blob URLs open at once on a phone that is short of
 *     memory anyway.
 *
 * Glove-first: every control is at least 64 px tall and the write button sits
 * at the bottom, in thumb reach.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import type { JournalEntry, JournalPhoto } from "@/device/db";
import { useStorageStatus } from "@/device/storageStatus";
import { cn } from "@/lib/utils";

import { useLastKnownPosition } from "../position";
import { useMountainTrip } from "../trip";
import { BigButton, SectionLabel } from "../ui";
import { SubHeader, SubNote, SubRow } from "./chrome";
import {
  KEPT_ON_THIS_PHONE_LINE,
  NO_ENTRIES_LINE,
  NO_POSITION_LINE,
  STAMP_EXPLAINER,
  altitudeLine,
  downscalePhoto,
  listEntryPhotos,
  photoStorageWarning,
  photoUseLine,
  positionLine,
  stampGapNote,
  stampPosition,
  syncStateLabel,
  timeLabel,
  useJournal,
  type DownscaledPhoto,
  type JournalSyncState,
} from "./journal";

const ROW = "border-t border-hairline px-5";

export default function JournalScreen() {
  const { trip } = useMountainTrip();
  const tripId = trip?.id ?? null;
  const { entries, loading, error, photoBytes, syncStates, add, remove } = useJournal(tripId);
  const storage = useStorageStatus();
  const [writing, setWriting] = useState(false);

  const useLine = photoUseLine(photoBytes);
  const warning = photoStorageWarning(photoBytes, storage.available);

  return (
    <div className="flex min-h-full flex-col pb-6">
      <SubHeader title="Journal" />

      {error && (
        <p className="mt-6 px-5 m-text-body leading-snug text-alert" role="alert">
          {error}
        </p>
      )}

      {writing ? (
        <WriteForm
          tripId={tripId}
          onSave={add}
          onDone={() => setWriting(false)}
          onCancel={() => setWriting(false)}
        />
      ) : (
        <>
          <section className="mt-2" aria-labelledby="journal-heading">
            <SectionLabel as="h2" id="journal-heading" className="px-5 pb-2">
              On this phone
            </SectionLabel>
            {loading ? (
              <SubNote className={ROW}>Reading this phone…</SubNote>
            ) : entries.length === 0 ? (
              <SubNote className={ROW}>{NO_ENTRIES_LINE}</SubNote>
            ) : (
              <ul>
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    sync={syncStates[entry.id] ?? "kept"}
                    onDelete={() => remove(entry.id)}
                  />
                ))}
              </ul>
            )}

            {warning ? (
              <p className={cn(ROW, "pt-3 m-text-label leading-snug text-alert")} role="status">
                {warning}
              </p>
            ) : (
              useLine && (
                <p className={cn(ROW, "pt-3 m-text-label leading-snug text-mist-dim")}>{useLine}</p>
              )
            )}

            <div className="mt-4 space-y-2 px-5 m-text-label leading-snug text-mist-dim">
              <p>{KEPT_ON_THIS_PHONE_LINE}</p>
              <p>{STAMP_EXPLAINER}</p>
            </div>
          </section>

          <div className="mt-auto flex flex-col gap-3 px-5 pt-10">
            <BigButton variant="azure" onClick={() => setWriting(true)}>
              Write a note
            </BigButton>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One saved entry                                                             */
/* -------------------------------------------------------------------------- */

function EntryRow({
  entry,
  sync,
  onDelete,
}: {
  entry: JournalEntry;
  sync: JournalSyncState;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const height = altitudeLine(entry);
  const where = positionLine(entry);
  const gap = stampGapNote(entry, entry.at);

  return (
    <li>
      {/* Only photos hide behind the toggle; the words of a note are always shown in full. */}
      <SubRow
        title={
          entry.text ? (
            <span className="whitespace-pre-line">{entry.text}</span>
          ) : (
            <span className="text-mist">No words — photos only</span>
          )
        }
        detail={
          <>
            {timeLabel(entry.at)}
            {height ? ` · ${height}` : ""}
            {entry.photoIds.length > 0
              ? ` · ${entry.photoIds.length} photo${entry.photoIds.length === 1 ? "" : "s"}`
              : ""}
          </>
        }
        note={
          <>
            {where ?? NO_POSITION_LINE}
            {gap ? ` · ${gap}` : ""} · {syncStateLabel(sync)}
          </>
        }
        trailing={entry.photoIds.length > 0 ? (open ? "Close" : "Open") : undefined}
        chevron={false}
        onClick={entry.photoIds.length > 0 ? () => setOpen((o) => !o) : undefined}
        aria-expanded={entry.photoIds.length > 0 ? open : undefined}
      />

      {open && entry.photoIds.length > 0 && <EntryPhotos entryId={entry.id} />}

      {confirming ? (
        <div className="flex flex-col gap-2 px-5 pb-3">
          <p className="m-text-body leading-snug text-snow">
            Delete this note? There is no other copy.
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

/** Photos are read and their URLs made only while the row is open. */
function EntryPhotos({ entryId }: { entryId: string }) {
  const [rows, setRows] = useState<JournalPhoto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    listEntryPhotos(entryId)
      .then((r) => live && setRows(r))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [entryId]);

  if (failed)
    return (
      <p className="px-5 pb-3 m-text-label text-alert">This phone could not read the photos.</p>
    );
  if (!rows) return <p className="px-5 pb-3 m-text-label text-mist">Opening…</p>;

  return (
    <div className="flex flex-col gap-3 px-5 pb-3">
      {rows.map((p) => (
        <PhotoView key={p.id} photo={p} />
      ))}
    </div>
  );
}

function PhotoView({ photo }: { photo: JournalPhoto }) {
  const url = useBlobUrl(photo.blob);
  if (!url) return null;
  return (
    <img
      src={url}
      alt={`Photo taken at ${timeLabel(photo.at)}`}
      className="max-h-[60vh] w-full object-contain"
    />
  );
}

/** A blob URL for as long as it is on screen, revoked the moment it is not. */
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
/* Writing one                                                                 */
/* -------------------------------------------------------------------------- */

interface Picked extends DownscaledPhoto {
  key: string;
}

function WriteForm({
  tripId,
  onSave,
  onDone,
  onCancel,
}: {
  tripId: string | null;
  onSave: ReturnType<typeof useJournal>["add"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const position = useLastKnownPosition();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [shrinking, setShrinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The stamp is read for the preview only. addJournalEntry stamps again at the
  // moment of saving, so what is stored is the fix as it was THEN, not now.
  const now = Date.now();
  const preview = useMemo(() => stampPosition(position, now), [position, now]);
  const height = altitudeLine(preview);
  const where = positionLine(preview);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setShrinking(true);
    const shrunk = await downscalePhoto(file);
    setShrinking(false);
    setPicked((p) => [...p, { ...shrunk, key: `${Date.now()}_${p.length}` }]);
  };

  const save = async () => {
    setSaving(true);
    const res = await onSave({ text, photos: picked, tripId, position });
    setSaving(false);
    if (res.ok) onDone();
  };

  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) void save();
      }}
    >
      <section className="mt-8">
        <SectionLabel as="h2" className="px-5 pb-2">
          New note
        </SectionLabel>

        <div className={cn(ROW, "py-3")}>
          <label className="sr-only" htmlFor="journal-text">
            Your note
          </label>
          <textarea
            id="journal-text"
            rows={5}
            autoFocus
            value={text}
            placeholder="What happened."
            onChange={(e) => setText(e.target.value)}
            className="min-h-[9rem] w-full resize-none border-0 bg-transparent px-0 m-text-body leading-snug text-snow placeholder:text-mist-dim focus:outline-none"
          />
        </div>

        <p className={cn(ROW, "py-3 m-text-label leading-snug text-mist")}>
          Stamped {timeLabel(now)}
          {height ? ` · ${height}` : ""}
          {where ? ` · ${where}` : ""}
        </p>
        {!where && (
          <p className="px-5 m-text-label leading-snug text-mist-dim">{NO_POSITION_LINE}</p>
        )}

        {picked.length > 0 && (
          <ul>
            {picked.map((p, i) => (
              <li
                key={p.key}
                className={cn(ROW, "flex min-h-16 items-center justify-between gap-4 py-2")}
              >
                <span className="min-w-0 flex-1 m-text-body text-snow">
                  Photo {i + 1}
                  {p.reason && (
                    <span className="mt-1 block m-text-label leading-snug text-mist-dim">
                      {p.reason}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="min-h-16 shrink-0 px-2 m-text-label text-mist"
                  onClick={() => setPicked((all) => all.filter((x) => x.key !== p.key))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        {shrinking && <p className="px-5 pt-3 m-text-label text-mist">Making the photo smaller…</p>}
      </section>

      <div className="mt-auto flex flex-col gap-3 px-5 pt-10">
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Take a photo for this note"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Choose a photo for this note"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <BigButton variant="azure" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save on this phone"}
        </BigButton>
        <BigButton variant="azure-outline" onClick={() => cameraInput.current?.click()}>
          Take a photo
        </BigButton>
        <BigButton variant="azure-outline" onClick={() => fileInput.current?.click()}>
          Add a photo
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
