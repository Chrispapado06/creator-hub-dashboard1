/**
 * LivePreview — the REAL company page, embedded, with the draft pushed into it.
 *
 * WHY AN IFRAME AND NOT A REBUILD. This replaced a careful reconstruction of the
 * page inside this app. The reconstruction read as the same page and was visibly
 * a different one, and it broke the moment a real banner image went into it.
 *
 * The deeper reason is the one that matters: a rebuilt preview is a SECOND
 * IMPLEMENTATION of the page, and it drifts the first time somebody changes the
 * real one. This screen's entire value is being trustworthy about what a climber
 * will see — and a copy cannot be trustworthy about that by construction, not
 * because anyone is careless but because two implementations are two things.
 *
 * The same argument already appears twice in this codebase: `peaks.ts` exists
 * because one summit altitude lived in two places and disagreed about Ama Dablam
 * by two metres, and `RealBusiness.tsx` exists because a disclosure guard lived
 * in one component while the claim was rendered by three.
 *
 * PROTOCOL. `icefall-sessions/requests/04-company-preview-protocol-from-02.md`,
 * protocolVersion 1, frozen. The web side validates every draft field against an
 * allowlist and NEVER accepts `realBusiness` or `id` — a draft able to clear
 * `realBusiness` would render a real operator's page with its disclosure gone.
 *
 * BOTH ENDS ARE DEV-ONLY. `/app/*` is dropped from icefall-web production
 * builds, so this preview is honest in development and unshippable until the
 * marketplace gate lifts. That is stated rather than hidden.
 */
import { useEffect, useRef, useState } from "react";

const PROTOCOL_VERSION = 1;

/** Where icefall-web is served. Dev-only by construction — see the header. */
const WEB_ORIGIN = import.meta.env.VITE_ICEFALL_WEB_ORIGIN ?? "http://localhost:5194";

export type SectionRect = { x: number; y: number; width: number; height: number };
export type RectEntry = {
  id: string;
  rect: SectionRect | null;
  reason?: "tab-inactive" | "empty" | "not-found";
};

export type PreviewBridge = {
  /** Section ids the page declared on ready. Empty until it answers. */
  known: string[];
  rects: RectEntry[];
  activeTab: string | null;
  /** Fields the page refused, so the inspector can say why. */
  rejected: { field: string; why: string }[];
  connected: boolean;
};

/**
 * Companies icefall-web currently seeds. Not a real lookup — a stand-in until
 * both apps read one database, at which point this constant is deleted.
 */
const KNOWN_WEB_COMPANIES = new Set([
  "solukhumbu-expeditions", "elite-exped", "cordillera-ascents", "chamonix-alpine-guides",
]);
const FALLBACK_WEB_COMPANY = "solukhumbu-expeditions";

/**
 * An id we know and never receive is silent; an id we receive and do not know is
 * an error. The asymmetry runs in our favour, so we may list ids ahead of the
 * page declaring them — `video` is listed here deliberately, before the company
 * page renders a video block, and its absence is therefore not a fault.
 */
const KNOWN_IDS = new Set([
  "hero", "about", "story", "why-climb", "featured-trips",
  "credentials", "reviews", "team", "gallery", "faq", "video",
]);

export function LivePreview({
  companyId,
  draft,
  selected,
  requestTab,
  onBridge,
}: {
  companyId: string;
  draft: Record<string, unknown>;
  selected: string | null;
  requestTab: string | null;
  onBridge?: (b: PreviewBridge) => void;
}) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [bridge, setBridge] = useState<PreviewBridge>({
    known: [], rects: [], activeTab: null, rejected: [], connected: false,
  });
  const [unreachable, setUnreachable] = useState(false);

  /**
   * UNTIL THERE IS A SHARED DATABASE, THE TWO APPS HOLD DIFFERENT COMPANIES.
   *
   * This portal seeds `co-lantern`; icefall-web seeds `solukhumbu-expeditions`
   * and friends. Neither is real, they simply were seeded separately — which is
   * precisely the duplication `icefall-supabase` exists to end. So the preview
   * may be showing the LAYOUT of your page against another company's content.
   *
   * That is said out loud in the frame rather than papered over, because a
   * preview quietly showing somebody else's record is the same failure as a
   * rebuilt page: it looks right and it is not what it claims to be.
   */
  const standIn = !KNOWN_WEB_COMPANIES.has(companyId);
  const effectiveId = standIn ? FALLBACK_WEB_COMPANY : companyId;
  const src = `${WEB_ORIGIN}/app/company/${encodeURIComponent(effectiveId)}?preview=1`;

  // Receive. Origin-checked — but note the origin check is NOT the boundary:
  // it stops the wrong sender and says nothing about the payload. The web side's
  // allowlist is the boundary, and it has to be, because in the real product the
  // draft originates from an operator: an untrusted external party by design.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== WEB_ORIGIN) return;
      const m = e.data;
      if (!m || typeof m !== "object") return;
      if (m.protocolVersion !== PROTOCOL_VERSION) {
        // Refuse loudly rather than interpret.
        console.error(
          `[preview] protocolVersion mismatch: page sent ${m.protocolVersion}, this editor speaks ${PROTOCOL_VERSION}.`,
        );
        return;
      }

      setBridge((prev) => {
        if (m.type === "icefall:preview:ready") {
          const unknown = (m.sections ?? []).filter((id: string) => !KNOWN_IDS.has(id));
          if (unknown.length) {
            // An id we do not know is an ERROR, not something to ignore — that is
            // what makes an added section surface immediately instead of silently.
            console.error(`[preview] page declared unknown section ids: ${unknown.join(", ")}`);
          }
          return { ...prev, known: m.sections ?? [], connected: true };
        }
        if (m.type === "icefall:preview:sections") {
          const notFound = (m.rects ?? []).filter((r: RectEntry) => r.reason === "not-found");
          if (notFound.length) {
            // The loud case: the contract has gone stale against the page.
            console.error(
              `[preview] declared but not found in the page: ${notFound.map((r: RectEntry) => r.id).join(", ")}`,
            );
          }
          return { ...prev, rects: m.rects ?? [], activeTab: m.activeTab ?? null, connected: true };
        }
        if (m.type === "icefall:preview:rejected") {
          return { ...prev, rejected: [...prev.rejected, { field: m.field, why: m.why }] };
        }
        return prev;
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => { onBridge?.(bridge); }, [bridge, onBridge]);

  const post = (msg: Record<string, unknown>) =>
    frame.current?.contentWindow?.postMessage({ protocolVersion: PROTOCOL_VERSION, ...msg }, WEB_ORIGIN);

  /**
   * PING UNTIL ANSWERED — do not ping once on load.
   *
   * `onLoad` fires for the iframe's INITIAL EMPTY DOCUMENT, whose origin is
   * `null`. A targeted postMessage to :5194 against a `null` recipient is
   * refused, and the page never announces itself unprompted — it only replies
   * when asked. So a single onLoad ping is fired into the void, never retried,
   * and `connected` stays false forever while a perfectly good page sits behind
   * the overlay. That is exactly what shipped first time.
   */
  useEffect(() => {
    if (bridge.connected) return;
    let attempts = 0;
    const MAX = 20; // ~6s at 300ms
    const t = setInterval(() => {
      if (attempts++ >= MAX) { clearInterval(t); setUnreachable(true); return; }
      post({ type: "icefall:preview:ping" });
    }, 300);
    return () => clearInterval(t);
  }, [bridge.connected]);

  // Push the draft on every change. The page falls back to the stored record for
  // any field we omit, so a partial draft is legitimate.
  useEffect(() => {
    if (bridge.connected) post({ type: "icefall:preview:draft", company: draft });
  }, [draft, bridge.connected]);

  // The page is TABBED and inactive tabs are not in the DOM, so a section can be
  // legitimately unmeasurable. Ask for it before outlining it.
  useEffect(() => {
    if (bridge.connected && requestTab) post({ type: "icefall:preview:show", sectionId: requestTab });
  }, [requestTab, bridge.connected]);

  const sel = bridge.rects.find((r) => r.id === selected);
  const selReason = sel?.reason;

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={frame}
        src={src}
        title="Your Icefall page"
        className="h-full w-full border-0 bg-canvas"
        onLoad={() => post({ type: "icefall:preview:ping" })}
        /*
         * NO `sandbox` ATTRIBUTE, DELIBERATELY.
         *
         * `sandbox="allow-scripts"` without `allow-same-origin` gives the frame
         * an OPAQUE origin, so every localStorage read inside it throws and the
         * app dies on mount — which is exactly what happened here first time.
         *
         * The isolation that matters is already present and is stronger: the
         * page is served from a DIFFERENT ORIGIN (5194 vs 5196), so the browser's
         * same-origin policy prevents it reaching into this document regardless.
         * The security boundary for what it renders is the web side's draft
         * allowlist, not this attribute.
         */
      />

      {/* The selection outline is drawn OVER the page, never inside it. */}
      {sel?.rect && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-azure"
          style={{
            left: sel.rect.x, top: sel.rect.y,
            width: sel.rect.width, height: sel.rect.height,
            boxShadow: "0 0 0 4px var(--op-azure-soft)",
          }}
        />
      )}

      {/* A section that cannot be measured says WHY, rather than showing nothing. */}
      {selected && !sel?.rect && selReason && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line bg-surface/95 px-5 py-2.5 text-[11.5px] text-muted">
          {selReason === "tab-inactive" && "That section is on another tab. Switching to it…"}
          {selReason === "empty" && "Nothing published in that section yet, so there is nothing to outline."}
          {selReason === "not-found" && "This section is missing from the page — the editor and the page have gone out of step. Reported."}
        </div>
      )}

      {standIn && (
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-pending-soft px-5 py-2 text-[11px] leading-relaxed text-pending">
          Showing the layout against another company's published content — your own
          record does not exist in the web app until both read one database.
        </div>
      )}

      {!bridge.connected && (
        <div className="absolute inset-0 grid place-items-center bg-canvas/80 px-8 text-center">
          {unreachable ? (
            /*
             * A REAL FAILURE STATE.
             *
             * "Loading…" rendered identically at 200ms and at forever — a lie in
             * a spinner's grammar, since "loading" implies progress and an end.
             * A stopped web server was indistinguishable from a broken protocol.
             */
            <div className="flex max-w-[380px] flex-col gap-2">
              <span className="text-[13px] text-ink">Cannot reach your live page.</span>
              <span className="text-[12px] leading-relaxed text-muted">
                The preview needs the Icefall site running on port 5194. Everything you
                type is still saved — only this preview is unavailable.
              </span>
            </div>
          ) : (
            <span className="text-[12.5px] text-muted">Loading your live page…</span>
          )}
        </div>
      )}
    </div>
  );
}
