import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Loader2, Share2 } from "lucide-react";
import { Navigate, useParams } from "react-router-dom";
import { Button, Card } from "@/components/ui/primitives";
import { Screen, ScreenHeader } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { loadActivities } from "@/tracking/store";
import { haversine } from "@/tracking/filters";
import { recordedToActivity } from "@/tracking/adapt";
import { activityById as trackedType } from "@/tracking/activities";
import { sync } from "@/services/repository";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import {
  CARD_FORMATS,
  CARD_STYLES,
  canvasToBlob,
  renderShareCard,
  CARD_BACKGROUNDS,
  type CardBackground,
  type CardFormat,
  type CardStyle,
  type CardStyleGroup,
  type ShareCardData,
} from "@/share/renderCard";

/**
 * Screens 09–10 — share card selection and export.
 *
 * The preview is the real canvas, scaled down: what you see is byte-for-byte
 * what gets shared.
 */
export default function ShareActivity() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();
  const goal = usePrimaryGoal();

  const [style, setStyle] = useState<CardStyle>("classic");
  // The design-sheet tabs: All / Minimal / Summit / Passport / Photo.
  const [designTab, setDesignTab] = useState<"all" | CardStyleGroup>("all");
  const [format, setFormat] = useState<CardFormat>("9:16");
  /*
   * The ground, chosen separately from the layout. Splitting the two turns
   * eleven designs into eleven × five without writing another layout — and it
   * is what lets any design export transparent, rather than transparency being
   * a design you have to give up your favourite layout to get.
   */
  const [background, setBackground] = useState<CardBackground>("photo");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const data = useMemo<ShareCardData | null>(() => {
    if (!id) return null;

    const recorded = loadActivities().find((a) => a.id === id);
    const goalMountain = goal?.mountainId ? sync.mountainById(goal.mountainId) : undefined;

    if (recorded) {
      const view = recordedToActivity(recorded);
      // Only name a mountain if the activity actually happened near it. Stamping
      // the current goal's peak on any recording would put "MONT BLANC" over a
      // run round the valley — a claim the card has no business making.
      const start = recorded.points[0];
      const nearGoalMountain =
        goalMountain && start
          ? haversine(start, { lat: goalMountain.coords.lat, lon: goalMountain.coords.lon }) <
            25_000
          : false;
      const mountain = nearGoalMountain ? goalMountain : undefined;

      return {
        activityLabel: recorded.title || trackedType(recorded.activityTypeId).label,
        // Where it happened and the highest point reached are both REAL fields
        // on the recording — the Summit template leads with them.
        locationLabel: recorded.location,
        highestAltitudeM: recorded.maxAltitudeM ?? undefined,
        distanceKm: view.distanceKm,
        durationSec: recorded.movingSec || recorded.durationSec,
        elevationGainM: view.elevationGainM,
        paceSecPerKm: recorded.avgPaceSecPerKm,
        dateLabel: fmtDate(recorded.startedAt),
        track: view.track,
        athleteName: user.name,
        mountainName: mountain?.name,
        mountainElevationM: mountain?.elevationM,
        // The photo stays decorative even when the peak isn't claimed by name.
        photoSrc: goalMountain?.photo ?? "/img/home-hero.jpg",
        simulated: recorded.simulated,
        // Passed through only as recorded. The grid drops any that are absent
        // rather than printing a zero — see `drawStatGrid`.
        caloriesKcal: recorded.calories,
        caloriesForKg: recorded.caloriesForKg,
        avgHeartRateBpm: recorded.avgHeartRateBpm,
      };
    }

    const mock = sync.activityById(id);
    if (!mock) return null;
    return {
      activityLabel: mock.title,
      locationLabel: mock.location,
      distanceKm: mock.distanceKm,
      durationSec: mock.durationSec,
      elevationGainM: mock.elevationGainM,
      paceSecPerKm: mock.avgPaceSecPerKm ?? null,
      dateLabel: fmtDate(mock.startedAt),
      track: mock.track,
      athleteName: user.name,
      // Seeded activities carry no coordinates, so no mountain can be verified.
      photoSrc: mock.photo ?? goalMountain?.photo ?? "/img/home-hero.jpg",
    };
  }, [id, goal, user.name]);

  // Re-render the card whenever style or format changes.
  useEffect(() => {
    let cancelled = false;
    if (!data) return;
    setBusy(true);
    renderShareCard(data, style, format, background)
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreview(canvas.toDataURL("image/png"));
      })
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [data, style, format, background]);

  const withBlob = useCallback(async (fn: (b: Blob) => Promise<void> | void) => {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    if (blob) await fn(blob);
  }, []);

  const share = useCallback(async () => {
    await withBlob(async (blob) => {
      const file = new File([blob], "icefall-activity.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: "ICEFALL" });
        } catch {
          /* user dismissed the sheet */
        }
      } else {
        setNote("Sharing isn't available in this browser — the image has been downloaded instead.");
        download(blob);
      }
    });
  }, [withBlob]);

  const download = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icefall-${style}-${format.replace(":", "x")}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = useCallback(async () => {
    await withBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setNote("Card copied to the clipboard.");
      } catch {
        setNote("Copying images isn't supported here — try Save instead.");
      }
    });
  }, [withBlob]);

  if (!id) return <Navigate to="/activity" replace />;
  if (!data) return <Navigate to="/activity" replace />;

  const fmt = CARD_FORMATS.find((f) => f.id === format)!;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Share"
          subtitle="Pick a style. The preview is the export."
          back={`/activity/${id}`}
        />
      </div>

      {/* Preview */}
      <div className="flex justify-center px-5">
        <div
          className="relative overflow-hidden rounded-card border border-hairline bg-graphite"
          style={{
            width: 232,
            height: (232 * fmt.h) / fmt.w,
            /*
             * A checkerboard behind the transparent card, and only behind that
             * one. The export really does have an alpha channel, and previewing
             * it on a flat graphite panel would look identical to a card with a
             * dark background — the athlete would have no way to tell what they
             * were about to post. The chequer is the universal "this is see
             * through" signal, which is why Strava uses it too.
             */
            ...(background === "transparent"
              ? {
                  backgroundColor: "#2A2D31",
                  backgroundImage:
                    "linear-gradient(45deg, #3A3E43 25%, transparent 25%, transparent 75%, #3A3E43 75%), linear-gradient(45deg, #3A3E43 25%, transparent 25%, transparent 75%, #3A3E43 75%)",
                  backgroundSize: "18px 18px",
                  backgroundPosition: "0 0, 9px 9px",
                }
              : {}),
          }}
        >
          {preview ? (
            <img src={preview} alt="Share card preview" className="h-full w-full object-contain" />
          ) : (
            <div className="grid h-full place-items-center">
              <Loader2 size={18} className="animate-spin text-mist-dim" />
            </div>
          )}
          {busy && preview && (
            <div className="absolute inset-0 grid place-items-center bg-obsidian/40">
              <Loader2 size={16} className="animate-spin text-azure" />
            </div>
          )}
        </div>
      </div>

      {background === "transparent" && (
        <p className="mx-auto mt-3 max-w-[280px] px-5 text-center text-[11px] leading-relaxed text-mist-dim">
          The chequer is not part of the image — this card exports with a transparent background, so
          it sits over whatever you put behind it in a Story.
        </p>
      )}

      {/* Background — the mockup's own section, and the reason the design
          list no longer has to carry "transparent" as a layout. */}
      <div className="mt-6 px-5">
        <p className="section-label">Background style</p>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          {CARD_BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBackground(b.id)}
              className={cn(
                "w-[92px] shrink-0 overflow-hidden rounded-tile border text-left transition-colors",
                background === b.id
                  ? "border-azure/55"
                  : "border-hairline hover:border-hairline-strong",
              )}
            >
              <BackgroundSwatch id={b.id} />
              <span
                className={cn(
                  "block px-2 py-1.5 text-[10.5px]",
                  background === b.id ? "text-azure" : "text-snow",
                )}
              >
                {b.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Format */}
      <div className="mt-6 px-5">
        <p className="section-label">Format</p>
        <div className="mt-3 flex gap-2">
          {CARD_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFormat(f.id)}
              className={cn(
                "flex-1 rounded-tile border px-3 py-2.5 text-center transition-colors",
                format === f.id
                  ? "border-azure/50 bg-azure/[0.06]"
                  : "border-hairline hover:border-hairline-strong",
              )}
            >
              <span
                className={cn("block text-[12px]", format === f.id ? "text-snow" : "text-mist")}
              >
                {f.label}
              </span>
              <span className="tnum block text-[10px] text-mist-dim">{f.id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Design gallery — grouped the way the design sheet groups them. */}
      <div className="mt-6 px-5">
        <p className="section-label">Choose a design</p>
        <div className="no-scrollbar mt-3 overflow-x-auto">
          <div className="flex w-max gap-2">
            {(
              [
                { id: "all", label: "All designs" },
                { id: "transparent", label: "Transparent" },
                { id: "cinematic", label: "Cinematic" },
                { id: "performance", label: "Performance" },
                { id: "route", label: "Route" },
                { id: "elevation", label: "Elevation" },
                { id: "passport", label: "Passport" },
                { id: "photo", label: "Photo" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDesignTab(t.id)}
                className={cn(
                  "shrink-0 rounded-pill border px-3.5 py-1.5 text-[12px] transition-colors",
                  designTab === t.id
                    ? "border-azure/55 bg-azure/[0.12] text-azure"
                    : "border-hairline-strong text-mist hover:text-snow",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {CARD_STYLES.filter((cs) => designTab === "all" || cs.group === designTab).map((cs) => (
            <button
              key={cs.id}
              type="button"
              onClick={() => setStyle(cs.id)}
              className={cn(
                "rounded-tile border p-3 text-left transition-colors",
                style === cs.id
                  ? "border-azure/50 bg-azure/[0.06]"
                  : "border-hairline hover:border-hairline-strong",
              )}
            >
              <span
                className={cn("block text-[12.5px]", style === cs.id ? "text-snow" : "text-mist")}
              >
                {cs.label}
              </span>
              <span className="mt-1 block text-[10.5px] leading-tight text-mist-dim">
                {cs.note}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-7 space-y-2.5 px-5">
        <Button size="lg" className="w-full" onClick={share} disabled={busy}>
          <Share2 size={16} strokeWidth={1.7} />
          Share
        </Button>
        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => withBlob(download)}
            disabled={busy}
          >
            <Download size={15} strokeWidth={1.7} />
            Save image
          </Button>
          <Button variant="secondary" className="flex-1" onClick={copy} disabled={busy}>
            <Copy size={15} strokeWidth={1.7} />
            Copy
          </Button>
        </div>
        {note && <p className="pt-1 text-center text-[11px] text-mist-dim">{note}</p>}
      </div>

      <div className="px-5 pt-6">
        <Card>
          <p className="text-[11px] leading-relaxed text-mist-dim">
            The share sheet routes to Instagram, TikTok, WhatsApp, Messages or anywhere else you
            have installed — ICEFALL exports a standard PNG rather than integrating with each
            network separately.
          </p>
        </Card>
      </div>
    </Screen>
  );
}

/**
 * A real preview of each ground, drawn in CSS rather than rendered through the
 * canvas: five live card renders just to populate a picker would cost more than
 * the card the athlete actually wants.
 */
function BackgroundSwatch({ id }: { id: CardBackground }) {
  const base = "block h-[54px] w-full";
  if (id === "photo") {
    return (
      <span className={base}>
        <img
          src="/img/mont-blanc-2.jpg"
          alt=""
          aria-hidden
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  if (id === "gradient") {
    return (
      <span
        className={base}
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(167,139,92,0.30), rgba(8,11,13,1) 70%)",
        }}
      />
    );
  }
  if (id === "topographic") {
    return (
      <span className={cn(base, "relative bg-obsidian")}>
        <svg viewBox="0 0 92 54" className="h-full w-full" aria-hidden>
          {[10, 17, 24, 31].map((r) => (
            <ellipse
              key={r}
              cx="46"
              cy="27"
              rx={r * 1.25}
              ry={r * 0.72}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="1"
            />
          ))}
        </svg>
      </span>
    );
  }
  if (id === "solid") return <span className={cn(base, "bg-obsidian")} />;
  return (
    <span
      className={base}
      style={{
        backgroundColor: "#2A2D31",
        backgroundImage:
          "linear-gradient(45deg, #3A3E43 25%, transparent 25%, transparent 75%, #3A3E43 75%), linear-gradient(45deg, #3A3E43 25%, transparent 25%, transparent 75%, #3A3E43 75%)",
        backgroundSize: "12px 12px",
        backgroundPosition: "0 0, 6px 6px",
      }}
    />
  );
}
