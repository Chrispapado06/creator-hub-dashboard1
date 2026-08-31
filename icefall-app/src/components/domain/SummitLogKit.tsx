import { useRef, useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { Link } from "react-router-dom";
import { Camera, MessageCircle, Mountain, Trash2, X } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { readBanner } from "@/lib/image";
import { fmtDate, fmtElevation } from "@/lib/format";
import {
  addSummitLog, removeSummitLog, type SummitLog,
} from "@/social/summitLog";
import { cn } from "@/lib/utils";

/**
 * The summit log's two faces: the sheet that writes one and the card that
 * shows one. Kept together so the fields can never drift apart — what the
 * sheet asks for is exactly what the card can render.
 */

/* -------------------------------------------------------------------------- */
/* Compose                                                                     */
/* -------------------------------------------------------------------------- */

export function LogSummitSheet({
  prefill,
  onClose,
  onLogged,
}: {
  /** From a peak page: the mountain is already known. */
  prefill?: { peakName: string; peakId?: string; elevationM?: number };
  onClose: () => void;
  onLogged?: (log: SummitLog) => void;
}) {
  const [peakName, setPeakName] = useState(prefill?.peakName ?? "");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [route, setRoute] = useState("");
  const [conditions, setConditions] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const canLog = peakName.trim().length > 0 && date.length === 10;

  const field =
    "mt-1.5 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50";

  return (
    <Sheet title="Log a summit" onClose={onClose}>
      <div className="space-y-4 px-1 pb-2">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">Mountain</span>
          <input
            value={peakName}
            onChange={(e) => setPeakName(e.target.value)}
            placeholder="Which summit?"
            readOnly={Boolean(prefill)}
            className={cn(field, prefill && "opacity-70")}
          />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">
            Date of the ascent
          </span>
          <DateField label="Date of the ascent" value={date} onChange={setDate} className="mt-1.5" />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">Route</span>
          <input
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            placeholder="NE ridge · normal route from the hut"
            className={field}
          />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">
            Conditions — the sentence another climber needs
          </span>
          <textarea
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="Snow from 1,900 m, ice on the summit ridge, crampons from the col…"
            rows={2}
            className={cn(field, "resize-none leading-relaxed")}
          />
        </label>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.1em] text-mist-dim">
            Anything else
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional"
            rows={2}
            className={cn(field, "resize-none leading-relaxed")}
          />
        </label>

        {/* ---- Photo ---------------------------------------------------- */}
        {photo ? (
          <div className="relative overflow-hidden rounded-tile border border-hairline">
            <img src={photo} alt="" aria-hidden className="h-[120px] w-full object-cover" />
            <button
              type="button"
              onClick={() => setPhoto(undefined)}
              aria-label="Remove photo"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-tile border border-hairline-strong py-3 text-[12.5px] text-mist transition-colors hover:border-azure/45 hover:text-snow"
          >
            <Camera size={15} strokeWidth={1.7} />
            Add a photo from the day
          </button>
        )}
        {photoError && <p className="text-[11.5px] text-danger">{photoError}</p>}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setPhotoError(null);
            try {
              setPhoto(await readBanner(file));
            } catch (err) {
              setPhotoError((err as { message?: string })?.message ?? "That image couldn't be read.");
            }
          }}
        />

        <button
          type="button"
          disabled={!canLog}
          onClick={() => {
            const log = addSummitLog({
              peakName: peakName.trim(),
              peakId: prefill?.peakId,
              elevationM: prefill?.elevationM,
              date,
              route: route.trim() || undefined,
              conditions: conditions.trim() || undefined,
              note: note.trim() || undefined,
              photo,
            });
            onLogged?.(log);
            onClose();
          }}
          className="w-full rounded-card bg-azure py-3.5 text-[13.5px] uppercase tracking-[0.1em] text-obsidian transition-colors hover:bg-azure-bright disabled:opacity-40"
        >
          Log it
        </button>

        <p className="text-[10.5px] leading-relaxed text-mist-dim">
          Be honest — your log is what another climber plans their day on. ICEFALL verifies none of
          it, and until accounts exist it stays on this device.
        </p>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function SummitLogCard({
  log,
  author,
  showPeakLink = true,
  compact = false,
  onRemove,
}: {
  log: SummitLog;
  /** The athlete's own identity, rendered as the byline. */
  author?: { name: string; region?: string; avatar?: string };
  /** Off on the peak's own page, where the link would point at itself. */
  showPeakLink?: boolean;
  /** The mountain page's row form: one line, chip first. */
  compact?: boolean;
  onRemove?: () => void;
}) {
  if (compact) {
    return (
      <div className="flex items-start gap-3 rounded-tile border border-hairline bg-graphite px-3.5 py-3">
        <span className="mt-0.5 shrink-0 rounded-pill border border-azure/50 bg-azure/[0.10] px-2 py-[3px] text-[9px] uppercase tracking-[0.12em] text-azure">
          Summit
        </span>
        <div className="min-w-0 flex-1">
          <p className="tnum text-[12px] text-mist-dim">{fmtDate(log.date, { day: "numeric" })}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-snow">
            {log.conditions ?? log.route ?? "Summited"}
          </p>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Delete this log"
            className="shrink-0 p-1 text-mist-dim transition-colors hover:text-danger"
          >
            <Trash2 size={13} strokeWidth={1.7} />
          </button>
        )}
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-card border border-hairline bg-graphite">
      {/* ---- Photo, with the kind chip over it --------------------------- */}
      {log.photo ? (
        <div className="relative h-[190px]">
          <img src={log.photo} alt="" aria-hidden className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-obsidian/30" />
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-pill bg-obsidian/75 px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] text-snow backdrop-blur">
            <Mountain size={11} strokeWidth={1.8} className="text-azure" />
            Summit log
          </span>
        </div>
      ) : (
        <div className="flex items-center justify-between px-4 pt-3.5">
          <span className="flex items-center gap-1.5 rounded-pill border border-hairline-strong px-2.5 py-1 text-[9.5px] uppercase tracking-[0.14em] text-mist">
            <Mountain size={11} strokeWidth={1.8} className="text-azure" />
            Summit log
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Delete this log"
              className="p-1 text-mist-dim transition-colors hover:text-danger"
            >
              <Trash2 size={14} strokeWidth={1.7} />
            </button>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[18px] font-light leading-snug text-snow">
              {log.peakName}
              {log.elevationM ? (
                <span className="tnum text-[14px] text-mist"> · {fmtElevation(log.elevationM)} m</span>
              ) : null}
            </p>
            <p className="tnum mt-1 text-[12px] text-mist-dim">
              Summited {fmtDate(log.date, { day: "numeric" })}
              {log.route ? ` · ${log.route}` : ""}
            </p>
          </div>
          {log.photo && onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="Delete this log"
              className="shrink-0 p-1.5 text-mist-dim transition-colors hover:text-danger"
            >
              <Trash2 size={14} strokeWidth={1.7} />
            </button>
          )}
        </div>

        {log.conditions && (
          <div className="mt-3 rounded-tile border border-azure/30 bg-azure/[0.05] px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-azure/85">Conditions</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-snow">{log.conditions}</p>
          </div>
        )}
        {log.note && <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{log.note}</p>}

        {/* ---- Byline. The mockup pairs it with "Respect 128" — counts that
            cannot exist for a log that has never left this phone. The row
            carries the author and the truth instead; the tally arrives with
            the network that can produce one. */}
        {(author || showPeakLink) && (
          <div className="mt-3.5 flex items-center gap-2.5 border-t border-hairline pt-3">
            {author && (
              <>
                <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-slate text-[11px] text-mist">
                  {author.avatar ? (
                    <img src={author.avatar} alt="" aria-hidden className="h-full w-full object-cover" />
                  ) : (
                    author.name.slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-snow">{author.name}</span>
                  {author.region && (
                    <span className="block text-[10.5px] text-mist-dim">Around {author.region.split(",")[0]}</span>
                  )}
                </span>
              </>
            )}
            {!author && <span className="flex-1" />}
            <Link
              to={`/social/post/${log.id}`}
              className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-mist transition-colors hover:text-snow"
            >
              <MessageCircle size={13} strokeWidth={1.7} />
              Comment
            </Link>
            {showPeakLink && log.peakId && (
              <Link
                to={`/explore/peak/${encodeURIComponent(log.peakId)}`}
                className="shrink-0 text-[11.5px] text-azure underline-offset-2 hover:underline"
              >
                View peak →
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
