import { useCallback, useEffect, useRef, useState } from "react";
import type { Company } from "@/data/companies";
import {
  applyCompanyDraft,
  PREVIEW_PROTOCOL_VERSION,
  SECTION_IDS,
  type PreviewOutbound,
  type RejectedField,
  type SectionId,
  type SectionRect,
} from "./previewProtocol";

/**
 * The `icefall-web` half of the operator portal's live preview.
 *
 * The editor embeds `/app/company/:id?preview=1` in an iframe and pushes the
 * operator's unsaved draft into it, so the thing they are editing is the real
 * page rather than a lookalike. The contract, and the argument for embedding
 * rather than rebuilding, are in `previewProtocol.ts`.
 *
 * ── THIS CANNOT BECOME A SECOND WAY INTO THE PRODUCT ────────────────────────
 *
 * `/app/*` is absent from a production build: `App.tsx` puts the `lazy()` call
 * itself inside `import.meta.env.DEV`, so Rollup drops the chunk rather than
 * shipping a route nobody can reach. This hook lives inside that chunk, so it
 * inherits the gate — and it is guarded on `import.meta.env.DEV` again anyway.
 * A query flag must never be the thing that decides whether the marketplace is
 * reachable, and belt-and-braces here costs nothing: the operator portal is not
 * deployed either, so dev-to-dev is the whole of the requirement today.
 */

/**
 * Where a draft may come from.
 *
 * The operator portal in development. An origin check stops the wrong sender
 * and is NOT the security boundary — see the threat model in
 * `previewProtocol.ts`. The payload is untrusted even from the right origin,
 * and `applyCompanyDraft` is what makes it safe.
 */
const ALLOWED_ORIGINS = ["http://localhost:5196", "http://127.0.0.1:5196"];

/** Which tab a section lives on. `null` means it is always mounted. */
const SECTION_TAB: Record<SectionId, string | null> = {
  hero: null,
  about: "Overview",
  story: "Overview",
  "why-climb": null,
  "featured-trips": "Overview",
  credentials: null,
  reviews: null,
  team: "Team",
  gallery: "Gallery",
  faq: "FAQ",
};

export interface CompanyPreview {
  /** The record to render: the stored one, or the stored one with a draft over it. */
  company: Company;
  /** Set when the editor asks for a section that lives behind a tab. */
  requestedTab: string | null;
  /** True only in preview mode, so the page can mark itself as one. */
  previewing: boolean;
  /** Called by the page after it renders, so measurements follow the DOM. */
  onRendered: (activeTab: string) => void;
}

export function useCompanyPreview(stored: Company | undefined): CompanyPreview {
  const enabled =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";

  const [draft, setDraft] = useState<unknown>(null);
  const [requestedTab, setRequestedTab] = useState<string | null>(null);
  const originRef = useRef<string | null>(null);
  const lastTabRef = useRef<string>("Overview");

  const post = useCallback((message: PreviewOutbound) => {
    const origin = originRef.current;
    if (!origin || typeof window === "undefined" || window.parent === window) return;
    window.parent.postMessage(message, origin);
  }, []);

  /** Measure every declared section and say why each one that is missing is missing. */
  const measure = useCallback(
    (activeTab: string) => {
      const rects: SectionRect[] = SECTION_IDS.map((id) => {
        const el = document.querySelector(`[data-icefall-section="${id}"]`);
        if (el) {
          const r = el.getBoundingClientRect();
          return { id, rect: { x: r.x, y: r.y, width: r.width, height: r.height } };
        }
        const tab = SECTION_TAB[id];
        // A section behind an inactive tab is not in the DOM at all — that is
        // normal for this layout and the editor can ask for it with `show`.
        if (tab !== null && tab !== activeTab) return { id, rect: null, reason: "tab-inactive" };
        // Mounted-but-absent means either the record has nothing to show, or
        // this contract has gone stale against the page. The page renders
        // nothing rather than an empty frame for the former, and we cannot tell
        // the two apart from here — so report the one that is actionable and
        // let the editor surface it. A silently missing outline is the failure
        // this whole design exists to prevent.
        return { id, rect: null, reason: "not-found" };
      });
      post({
        protocolVersion: PREVIEW_PROTOCOL_VERSION,
        type: "icefall:preview:sections",
        activeTab,
        rects,
      });
    },
    [post],
  );

  /* ---- inbound ---------------------------------------------------------- */
  useEffect(() => {
    if (!enabled) return;

    function onMessage(event: MessageEvent) {
      if (!ALLOWED_ORIGINS.includes(event.origin)) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;
      if (data.protocolVersion !== PREVIEW_PROTOCOL_VERSION) return;
      originRef.current = event.origin;

      switch (data.type) {
        case "icefall:preview:ping":
          post({
            protocolVersion: PREVIEW_PROTOCOL_VERSION,
            type: "icefall:preview:ready",
            sections: SECTION_IDS,
          });
          measure(lastTabRef.current);
          break;
        case "icefall:preview:draft":
          setDraft(data.company ?? null);
          break;
        case "icefall:preview:show": {
          const id = data.sectionId as SectionId;
          if (!SECTION_IDS.includes(id)) return;
          setRequestedTab(SECTION_TAB[id]);
          break;
        }
        default:
          break;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enabled, post, measure]);

  /* ---- re-measure when the viewport moves under us ----------------------- */
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measure(lastTabRef.current));
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [enabled, measure]);

  const onRendered = useCallback(
    (activeTab: string) => {
      lastTabRef.current = activeTab;
      if (!enabled) return;
      requestAnimationFrame(() => measure(activeTab));
    },
    [enabled, measure],
  );

  /* ---- apply the draft, and report what was refused ---------------------- */
  const rejectedRef = useRef<string>("");
  let company = stored as Company;
  let rejected: RejectedField[] = [];
  if (enabled && stored && draft) {
    const applied = applyCompanyDraft(stored, draft);
    company = applied.company;
    rejected = applied.rejected;
  }

  useEffect(() => {
    if (!enabled || rejected.length === 0) return;
    const key = JSON.stringify(rejected);
    if (key === rejectedRef.current) return;
    rejectedRef.current = key;
    post({ protocolVersion: PREVIEW_PROTOCOL_VERSION, type: "icefall:preview:rejected", rejected });
  }, [enabled, rejected, post]);

  return { company, requestedTab, previewing: enabled, onRendered };
}
