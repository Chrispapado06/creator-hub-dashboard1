import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Download, Link2, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { Screen, ScreenHeader } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { profileLink } from "@/profile/shareLink";
import { useProfileCard } from "@/profile/useProfileCard";
import {
  CARD_BACKGROUNDS,
  CARD_FORMATS,
  PROFILE_CARD_STYLES,
  canvasToBlob,
  renderProfileCard,
  type CardBackground,
  type CardFormat,
  type CardStyle,
} from "@/share/renderCard";

/**
 * Share — the athlete's own profile.
 *
 * WHY THIS SCREEN EXISTS AT ALL. Both share controls on `screens/Profile.tsx`
 * used to call `sharePage(name, profileLink(...))`, which hands the system sheet
 * a bare URL — so what arrived in a chat was a 500-character string of base64
 * with no picture, no name and nothing to look at. The link is not the problem;
 * being ONLY a link is. So the link survives, at the foot of this screen and in
 * every export's failure path, and above it sits an image somebody would
 * actually want to send.
 *
 * WHAT IT DRAWS AND WHAT IT REFUSES TO is decided in `share/renderCard.ts` — see
 * the long note over `ProfileCardData`. This file's job is the three choices
 * (design, ground, format) and getting the result off the device honestly.
 *
 * THE FALLBACKS ARE THE FEATURE, not an afterthought. Three separate things can
 * be missing on a given phone, and each is handled where it fails rather than
 * left to produce a control that quietly does nothing:
 *
 *   · NO CANVAS, or a render that throws. The card section says so and the link
 *     controls remain — the athlete can still share their profile.
 *   · NO FILE SHARING. `navigator.share` exists for links on browsers that
 *     refuse files, so the capability is PROBED with a real File rather than
 *     assumed, exactly as `growth/ShareReadiness.tsx` probes it. The image
 *     button then says why it cannot be used instead of opening nothing.
 *   · NO CLIPBOARD IMAGE SUPPORT. Copy falls back to a sentence, not silence.
 */

/**
 * Whether this browser can hand a PNG to the system share sheet.
 *
 * Probed with a real (empty) File: several browsers expose `share` for links and
 * refuse files, and a Share button that opens nothing is worse than one that is
 * plainly disabled and explains itself.
 */
function detectFileShare(): boolean {
  if (typeof navigator === "undefined" || typeof File === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [new File([], "icefall.png", { type: "image/png" })] });
  } catch {
    return false;
  }
}

export default function ShareProfile() {
  const { shared, card } = useProfileCard();

  const [style, setStyle] = useState<CardStyle>("classic");
  const [format, setFormat] = useState<CardFormat>("9:16");
  const [background, setBackground] = useState<CardBackground>("photo");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [drawFailed, setDrawFailed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Capability, not state: it cannot change while the screen is mounted.
  const [canShareFiles] = useState(detectFileShare);

  const link = useMemo(() => profileLink(shared), [shared]);

  /*
   * `issuedLabel` is today, because that is when this image is being made — the
   * passport layout stamps it and no other layout uses it. It is a fact about
   * the card rather than a claim about the athlete, which is the only kind of
   * date that belongs on a document-shaped design.
   *
   * Held in a memo keyed on nothing so the card does not re-render every time
   * the clock ticks past midnight mid-session; it is set once per visit.
   */
  const issuedLabel = useMemo(() => fmtDate(new Date().toISOString(), { day: undefined }), []);
  const data = useMemo(() => ({ ...card, issuedLabel }), [card, issuedLabel]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    renderProfileCard(data, style, format, background)
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreview(canvas.toDataURL("image/png"));
        setDrawFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        canvasRef.current = null;
        setPreview(null);
        setDrawFailed(true);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [data, style, format, background]);

  const withBlob = useCallback(async (fn: (b: Blob) => Promise<void> | void) => {
    if (!canvasRef.current) return;
    const blob = await canvasToBlob(canvasRef.current);
    if (blob) await fn(blob);
  }, []);

  const download = useCallback(
    (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `icefall-${shared.handle || "profile"}-${format.replace(":", "x")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked on the next tick: Safari has not finished reading the object URL
      // when click() returns, and revoking synchronously cancels the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNote("Image saved.");
    },
    [format, shared.handle],
  );

  const shareImage = useCallback(async () => {
    if (!canShareFiles) return;
    await withBlob(async (blob) => {
      const file = new File([blob], "icefall-profile.png", { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (!nav.canShare?.({ files: [file] })) {
        setNote("This browser declined to share the image. Save it instead.");
        return;
      }
      try {
        /*
         * THE LINK TRAVELS WITH THE PICTURE. A card is worth looking at; a link
         * is what turns the person looking at it into somebody who can find the
         * athlete. Sending only one of the two throws away half the point of
         * sharing a profile, so the sheet gets both and each app takes what it
         * can carry.
         */
        await nav.share({ files: [file], title: `${shared.name} · ICEFALL`, url: link });
      } catch {
        /* the athlete dismissed the sheet — not an error */
      }
    });
  }, [canShareFiles, withBlob, shared.name, link]);

  const copyImage = useCallback(async () => {
    await withBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setNote("Card copied to the clipboard.");
      } catch {
        setNote("Copying images isn't supported here — save the card instead.");
      }
    });
  }, [withBlob]);

  const shareLink = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${shared.name} · ICEFALL`, url: link });
        return;
      } catch {
        /* dismissed — fall through to the clipboard, which always works */
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2400);
    } catch {
      setNote("The link could not be copied here. Open the preview below and copy the address.");
    }
  }, [link, shared.name]);

  const fmt = CARD_FORMATS.find((f) => f.id === format) ?? CARD_FORMATS[0];
  const imageActionsDisabled = busy || drawFailed || !preview;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Share profile"
          subtitle="Pick a design. The preview is the export."
          back="/profile"
        />
      </div>

      {/* Preview — the real canvas, scaled down. What you see is what leaves. */}
      <div className="flex justify-center px-5">
        <div
          className="relative overflow-hidden rounded-card border border-hairline bg-graphite"
          style={{
            width: 232,
            height: (232 * fmt.h) / fmt.w,
            /*
             * A chequer behind the transparent card, and only behind that one.
             * The export really does keep its alpha channel, and previewing it
             * on a flat graphite panel would look identical to a card with a
             * dark background — the athlete would have no way to tell what they
             * were about to post.
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
            <img
              src={preview}
              alt={`Share card for ${shared.name}`}
              className="h-full w-full object-contain"
            />
          ) : drawFailed ? (
            <p className="grid h-full place-items-center px-4 text-center text-[11px] leading-relaxed text-mist-dim">
              This browser could not draw the card.
            </p>
          ) : (
            <div className="grid h-full place-items-center">
              <Loader2 size={18} className="animate-spin text-mist-dim" aria-hidden="true" />
            </div>
          )}
          {busy && preview && (
            <div className="absolute inset-0 grid place-items-center bg-obsidian/40">
              <Loader2 size={16} className="animate-spin text-azure" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>

      {background === "transparent" && !drawFailed && (
        <p className="mx-auto mt-3 max-w-[280px] px-5 text-center text-[11px] leading-relaxed text-mist-dim">
          The chequer is not part of the image — this card exports with a transparent background, so
          it sits over whatever you put behind it in a Story.
        </p>
      )}

      {/* Ground */}
      <div className="mt-6 px-5">
        <p className="section-label">Background</p>
        <div className="no-scrollbar -mx-1 mt-3 flex gap-2 overflow-x-auto px-1">
          {CARD_BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setBackground(b.id)}
              aria-pressed={background === b.id}
              className={cn(
                "shrink-0 rounded-pill border px-3.5 py-1.5 text-[12px] transition-colors",
                background === b.id
                  ? "border-azure/55 bg-azure/[0.12] text-azure"
                  : "border-hairline-strong text-mist hover:text-snow",
              )}
            >
              {b.label}
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
              aria-pressed={format === f.id}
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

      {/* Design */}
      <div className="mt-6 px-5">
        <p className="section-label">Design</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {PROFILE_CARD_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              aria-pressed={style === s.id}
              className={cn(
                "rounded-tile border p-3 text-left transition-colors",
                style === s.id
                  ? "border-azure/50 bg-azure/[0.06]"
                  : "border-hairline hover:border-hairline-strong",
              )}
            >
              <span
                className={cn("block text-[12.5px]", style === s.id ? "text-snow" : "text-mist")}
              >
                {s.label}
              </span>
              <span className="mt-1 block text-[10.5px] leading-tight text-mist-dim">{s.note}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-7 space-y-2.5 px-5">
        <Button
          size="lg"
          className="w-full"
          onClick={shareImage}
          disabled={imageActionsDisabled || !canShareFiles}
          aria-describedby={canShareFiles ? undefined : "share-image-unsupported"}
        >
          <Share2 size={16} strokeWidth={1.7} aria-hidden="true" />
          Share card
        </Button>

        {/* A disabled control must say why. Never a button that quietly does nothing. */}
        {!canShareFiles && (
          <p
            id="share-image-unsupported"
            className="text-center text-[11px] leading-relaxed text-mist-dim"
          >
            This browser cannot pass an image to the system share sheet. Save the card and send it
            from your photos, or share the link below.
          </p>
        )}

        <div className="flex gap-2.5">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => withBlob(download)}
            disabled={imageActionsDisabled}
          >
            <Download size={15} strokeWidth={1.7} aria-hidden="true" />
            Save image
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={copyImage}
            disabled={imageActionsDisabled}
          >
            <Copy size={15} strokeWidth={1.7} aria-hidden="true" />
            Copy
          </Button>
        </div>

        {note && (
          <p className="pt-1 text-center text-[11px] text-mist-dim" role="status">
            {note}
          </p>
        )}
      </div>

      {/*
        THE LINK, WHICH NEVER STOPS WORKING. It needs no canvas, no share sheet
        and no clipboard image support, so it is the one control on this screen
        that cannot fail to do something — which is precisely why it is here and
        not replaced by the card.
      */}
      <div className="mt-8 px-5">
        <p className="section-label">Or send the link</p>
        <button
          type="button"
          onClick={shareLink}
          className="mt-3 flex w-full items-center gap-3 py-2 text-left"
        >
          <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full border border-azure/35 text-azure">
            {linkCopied ? (
              <Check size={17} strokeWidth={2} aria-hidden="true" />
            ) : (
              <Link2 size={17} strokeWidth={1.7} aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] text-snow">
              {linkCopied ? "Link copied" : "Share your profile link"}
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist">
              Opens a card of you on any phone, with or without ICEFALL installed.
            </span>
          </span>
        </button>
      </div>

      <p className="px-5 pb-8 pt-6 text-[11px] leading-relaxed text-mist-dim">
        The card carries your name, your photograph and the figures on your profile. It carries no
        email address, no phone number and no location finer than the region you set, and your
        mountain passport stays on your own profile. The preparation percentage is not on it either
        — that figure only means something beside the explanation next to it, so it has its own card
        at Share readiness.
      </p>
    </Screen>
  );
}
