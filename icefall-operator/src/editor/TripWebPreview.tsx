/**
 * TripWebPreview — the REAL trip page on the Icefall website, embedded.
 *
 * The twin of `LivePreview.tsx`, for a product instead of a company, and it
 * borrows that file's mechanics deliberately rather than re-deriving them: the
 * ping-until-answered loop, the bounded retry, the absent `sandbox` attribute
 * and the refusal to say "Loading…" forever were all paid for once already.
 *
 * ── THE ONE THING THAT IS DIFFERENT, AND IT IS THE POINT ────────────────────
 *
 * `icefall-web` implements the preview protocol on its COMPANY page only.
 * Verified 2026-08-30: `icefall:preview:ping` appears in `previewProtocol.ts`
 * and `useCompanyPreview.ts`, and `src/app/TripDetail.tsx` imports neither. The
 * trip page therefore loads perfectly and never answers.
 *
 * That makes THREE honest states here where the company preview has two:
 *
 *   (a) reached AND answering — impossible today. The path is left in place, so
 *       the day request 05 lands the pane starts working without a rewrite.
 *   (b) reached and NOT answering the protocol — the page is fine, it simply
 *       cannot receive a draft. It is shown, with a PERSISTENT banner saying
 *       that what is on screen is the published page and that unsaved edits are
 *       not in it.
 *   (c) unreachable — the site is not running. LivePreview's failure state.
 *
 * (b) MUST NOT BORROW (c)'s WORDS. "Cannot reach your live page" in front of a
 * page that loaded fine is the same class of lie as the "Loading…" spinner that
 * never ended: it sends an operator to restart a server that is already up, and
 * it teaches them that this pane's statements are guesses. So reachability is
 * MEASURED, not inferred from silence — see the probe below.
 *
 * ── WHOSE PAGE IS ON SCREEN ─────────────────────────────────────────────────
 *
 * Until both apps read one database they hold different catalogues: this portal
 * seeds `p-everest-south-col`, the website seeds `e-everest`. An id the site
 * does not know renders its own "No such expedition" page, which tells the
 * operator nothing about their layout. So, exactly as `LivePreview` does for
 * companies, a known trip stands in — and the substitution is stated in the
 * frame, permanently, because a preview quietly showing somebody else's record
 * is the failure this whole pane exists to avoid.
 *
 * BOTH ENDS ARE DEV-ONLY. `/app/*` is dropped from icefall-web production
 * builds. Stated rather than hidden, as in `LivePreview`.
 */

import { useEffect, useRef, useState } from "react";
import { OFFLINE } from "@/offline/offline";
import { OfflinePreviewNotice } from "@/offline/OfflinePreviewNotice";

/** Frozen with the company protocol — one version across both previews. */
const PROTOCOL_VERSION = 1;

/** Where icefall-web is served. Dev-only by construction — see the header. */
const WEB_ORIGIN = import.meta.env.VITE_ICEFALL_WEB_ORIGIN ?? "http://localhost:5194";

/**
 * Trips the website's demo catalogue actually holds (`icefall-web/src/data/demo.ts`).
 * Not a lookup — a stand-in until both apps read one database, at which point
 * this constant and `FALLBACK_WEB_TRIP` are deleted together.
 *
 * `e-ee-everest` and `e-ee-ama` are Elite Exped's — a REAL company — and are
 * deliberately not the fallback: a preview must never park a real operator's
 * published listing in front of somebody editing a different trip.
 */
const KNOWN_WEB_TRIPS = new Set([
  "e-everest", "e-ama", "e-ee-everest", "e-ee-ama", "e-ebc", "e-aconcagua", "e-mont-blanc",
]);
const FALLBACK_WEB_TRIP = "e-everest";

/** Reachability of the site itself, measured rather than assumed. */
type Reach = "checking" | "up" | "down";

export function TripWebPreview({
  productId,
  /**
   * The draft, pushed the moment the page can take it. Nothing receives it
   * today; it is wired now so that (a) needs no second pass.
   */
  draft,
  selected,
}: {
  productId: string;
  draft: Record<string, unknown>;
  selected: string | null;
}) {
  /*
   * OFFLINE, BEFORE ANY HOOK RUNS — see the twin note in `LivePreview`. It
   * matters more here: this pane fires a real `fetch` on mount purely to
   * measure reachability, and offline that request is one we already know the
   * answer to. Returning first means it is never made.
   */
  if (OFFLINE) return <OfflinePreviewNotice what="trip page" />;

  const frame = useRef<HTMLIFrameElement | null>(null);
  const [connected, setConnected] = useState(false);
  /** True once the retry budget is spent — the page is up and stayed silent. */
  const [silent, setSilent] = useState(false);
  const [reach, setReach] = useState<Reach>("checking");

  const standIn = !KNOWN_WEB_TRIPS.has(productId);
  const effectiveId = standIn ? FALLBACK_WEB_TRIP : productId;
  const src = `${WEB_ORIGIN}/app/trip/${encodeURIComponent(effectiveId)}?preview=1`;

  /*
   * IS THE SITE THERE AT ALL?
   *
   * The iframe cannot answer this. A cross-origin frame fires `load` for the
   * browser's own connection-refused page just as it does for a real one, so
   * "did it load" is not the same question as "is the server up" — and telling
   * the two apart is the entire difference between (b) and (c).
   *
   * `mode: "no-cors"` gives an opaque response we are not allowed to read, and
   * we do not want to read it: the only fact needed is whether the request
   * completed at all. A refused connection rejects; a served page resolves.
   */
  useEffect(() => {
    let cancelled = false;
    setReach("checking");
    (async () => {
      try {
        await fetch(src, { mode: "no-cors", cache: "no-store" });
        if (!cancelled) setReach("up");
      } catch {
        if (!cancelled) setReach("down");
      }
    })();
    return () => { cancelled = true; };
  }, [src]);

  // Receive. Origin-checked — and, as in LivePreview, the origin check is not
  // the security boundary: the web side's own draft allowlist is.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== WEB_ORIGIN) return;
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.protocolVersion !== PROTOCOL_VERSION) {
        console.error(
          `[trip preview] protocolVersion mismatch: page sent ${m.protocolVersion}, this editor speaks ${PROTOCOL_VERSION}.`,
        );
        return;
      }
      if (m.type === "icefall:preview:ready" || m.type === "icefall:preview:sections") {
        setConnected(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const post = (msg: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage({ protocolVersion: PROTOCOL_VERSION, ...msg }, WEB_ORIGIN);

  /**
   * PING UNTIL ANSWERED — never once on load.
   *
   * `onLoad` fires for the iframe's INITIAL EMPTY DOCUMENT, whose origin is
   * `null`, and a targeted postMessage to a `null` recipient is refused. One
   * ping on load is a ping into the void; the page only ever replies when asked.
   * LivePreview shipped that bug once and this is the fix, copied intact.
   *
   * The budget is spent, not abandoned: when it runs out we do not conclude the
   * page is broken — only that it does not speak the protocol, which for the
   * trip page is the expected, documented answer.
   */
  useEffect(() => {
    if (connected) return;
    let attempts = 0;
    const MAX = 20; // ~6s at 300ms
    const t = setInterval(() => {
      if (attempts++ >= MAX) { clearInterval(t); setSilent(true); return; }
      post({ type: "icefall:preview:ping" });
    }, 300);
    return () => clearInterval(t);
  }, [connected]);

  // Push on change, once there is anything listening. Until then this is inert
  // by design rather than by accident, and the banner says so.
  useEffect(() => {
    if (connected) post({ type: "icefall:preview:draft", product: draft });
  }, [draft, connected]);

  useEffect(() => {
    if (connected && selected) post({ type: "icefall:preview:show", sectionId: selected });
  }, [selected, connected]);

  const down = reach === "down";
  /*
   * CASE (b). The page is up, we have asked it enough times, and it has not
   * answered. Shown as soon as both facts are established — not left to a
   * spinner, because there is nothing further to wait for.
   *
   * WHILE THE ASKING IS STILL GOING ON the slot is not left blank. A published
   * page sitting unlabelled under a heading that says "Your draft" is the exact
   * confusion this pane exists to prevent, and six seconds is long enough to
   * read a paragraph off it. So the banner is present throughout and its
   * sentence follows what is known: first that we are still asking, then that
   * the page did not answer.
   */
  const asking = !connected && reach === "up" && !silent;
  const publishedOnly = !connected && reach === "up" && silent;

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={frame}
        src={src}
        title="Your Icefall trip page"
        className="h-full w-full border-0 bg-canvas"
        onLoad={() => post({ type: "icefall:preview:ping" })}
        /*
         * NO `sandbox` ATTRIBUTE, DELIBERATELY — LivePreview's reasoning, which
         * is not stylistic: `sandbox="allow-scripts"` without `allow-same-origin`
         * hands the frame an OPAQUE origin, every localStorage read inside it
         * throws, and the embedded app dies on mount.
         *
         * The isolation that matters is already stronger and already present:
         * the page is served from a different origin (5194 vs 5196), so the
         * same-origin policy keeps it out of this document regardless.
         */
      />

      {/*
        Banners stack: whose page, then which version. Both are permanent.

        The stack is painted on `bg-surface` and not straight onto the frame.
        The state tints are translucent by design — `--op-pending-soft` is a 12%
        wash — and a 12% wash over a DARK trip page is unreadable, which turns a
        statement the operator must not miss into decoration.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col bg-surface empty:hidden">
        {standIn && (
          <div className="bg-pending-soft px-5 py-2 text-[11px] leading-relaxed text-pending">
            This trip is not in the Icefall website's catalogue, so the page below is another
            listing — you are seeing the LAYOUT of a trip page, not your own content. The two apps
            hold separate records until they read one database.
          </div>
        )}
        {asking && (
          <div className="border-b border-line px-5 py-2 text-[11px] leading-relaxed text-muted">
            Asking the website whether this page can show your draft…
          </div>
        )}
        {publishedOnly && (
          <div className="border-b border-line px-5 py-2 text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-ink">This is the published page.</span> The website's
            trip page cannot receive a draft yet, so nothing you have typed appears below. Switch to
            App to see your own unsaved work.
          </div>
        )}
      </div>

      {down && (
        /*
         * CASE (c) — and only ever this case. "Loading…" rendered identically at
         * 200ms and at forever, which made a stopped server indistinguishable
         * from a silent one. Reachability is measured above, so this sentence is
         * only shown when it is true.
         */
        <div className="absolute inset-0 grid place-items-center bg-canvas/80 px-8 text-center">
          <div className="flex max-w-[380px] flex-col gap-2">
            <span className="text-[13px] text-ink">Cannot reach your live page.</span>
            <span className="text-[12px] leading-relaxed text-muted">
              The preview needs the Icefall site running on port 5194. Everything you type is still
              saved — only this preview is unavailable.
            </span>
          </div>
        </div>
      )}

      {reach === "checking" && (
        <div className="absolute inset-0 grid place-items-center bg-canvas/80 px-8 text-center">
          <span className="text-[12.5px] text-muted">Checking whether the Icefall site is running…</span>
        </div>
      )}
    </div>
  );
}
