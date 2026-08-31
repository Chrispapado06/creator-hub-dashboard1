/**
 * The centre pane: the company's real public page, on both surfaces.
 *
 * NOT A SUMMARY AND NOT AN APPROXIMATION. The section order, the tab strip and
 * the stat row follow `icefall-web/src/app/Company.tsx`, which carries eight
 * tabs — Overview, Expeditions, Treks, Reviews, Team, Gallery, About, FAQ. The
 * phone is a different layout rather than the same page narrowed: shorter hero,
 * actions in thumb reach, four tabs.
 *
 * THREE THINGS THE PREVIEW REFUSES TO DO, and each is the reason a preview can
 * be trusted at all:
 *
 * 1. IT NEVER SHOWS A DRAFT AS THOUGH IT WERE PUBLISHED. What surface you are
 *    looking at — your unsent draft, or what climbers actually see — is stated
 *    in the frame itself, permanently, not in a banner above it. A live preview
 *    that renders typed text as published is the publication boundary leaking
 *    through the preview.
 *
 * 2. IT DOES NOT INVENT THE VERIFICATION BADGE. The reference design shows
 *    "DOCUMENTS CHECKED" on the hero unconditionally. It renders here only when
 *    `documentsCheckedAt` is actually set — which for a company ICEFALL has not
 *    checked means no badge at all, because the badge is the entire basis on
 *    which a climber decides to trust the listing.
 *
 * 3. IT DOES NOT FILL THE STAT ROW. Summit rate is not something ICEFALL
 *    measures, so it renders as a dash rather than a number.
 *
 * GILT, DELIBERATELY. The portal's chrome is azure — decision 10 excludes the
 * CRMs from the gilt rule. But this pane shows what a CLIMBER sees, and on that
 * surface a company's own block IS the commercial layer. So the preview renders
 * its accents in gilt while the editor around it stays azure. That is the rule
 * working, not an exception to it.
 */

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import type { StagedFile } from "./MediaDrop";
import { Monogram } from "@/components/Shell";
import type { Company } from "@/domain/types";

/** The climber-facing commercial accent. Only ever used inside this pane. */
const GILT = "oklch(0.7938 0.1274 84.5)";

export interface PreviewData {
  name: string;
  tagline: string;
  city: string;
  country: string;
  foundedYear: string;
  description: string;
  about: string;
  whyChooseUs: Company["whyChooseUs"];
  certifications: Company["certifications"];
  team: Company["team"];
  faq: Company["faq"];
  documentsCheckedAt: string | null;
  productCount: number;
  /**
   * A RESOLVED, LOADABLE URL for the company's own logo, or null/absent.
   *
   * Optional because nothing can supply one yet: `Company.logoMediaId` points
   * into the private media bucket and no backend method resolves an id to a
   * URL. When one exists, the caller passes it and this pane and the trip hero
   * draw the same thing — `TripAppPreview`'s `companyLogoUrl` carries the same
   * contract and the same refusal.
   *
   * NEVER a mark ICEFALL made. A real business's logo is its trademark and does
   * not ship here; the fallback is the operator's initials, set in type, and
   * nothing else.
   */
  logoUrl?: string | null;
}

/**
 * The company's own mark, or its initials. The trip preview's `CompanyMark`
 * makes the same choice in the same order, so the two panes cannot disagree
 * about what a company looks like.
 *
 * WHAT WAS HERE BEFORE: a gilt mountain glyph, drawn identically for every
 * operator. It looked like a logo and identified nobody — the same placeholder
 * the consumer web app still puts on its trip hero, and the reason this work
 * exists. A logo that fails to load falls back too, as `ListingPhoto` does.
 */
function CompanyMark({ name, logoUrl, size }: { name: string; logoUrl: string | null; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const trimmed = name.trim();

  if (logoUrl !== null && failedUrl !== logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        onError={() => setFailedUrl(logoUrl)}
        className="shrink-0 rounded-pill bg-raised object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  // No logo and no name is "nothing known yet", which is an empty tile — not a
  // monogram of no initials, which would be a blank circle posing as a mark.
  if (trimmed === "") {
    return (
      <span
        className="hairline shrink-0 rounded-pill bg-raised"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return <Monogram name={trimmed} size={size} />;
}

/* -------------------------------------------------------------------------- */
/* The frame around each section                                              */
/* -------------------------------------------------------------------------- */

function SectionFrame({
  id,
  label,
  selected,
  onSelect,
  present = true,
  children,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
  present?: boolean;
  children: ReactNode;
}) {
  if (!present) return <>{children}</>;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(id);
        }
      }}
      className={`relative cursor-pointer rounded-card transition-all ${
        selected ? "" : "opacity-50 hover:opacity-80"
      }`}
      style={
        selected
          ? { outline: "2px solid var(--op-azure)", boxShadow: "0 0 0 4px var(--op-azure-soft)" }
          : undefined
      }
    >
      {selected && (
        <span
          className="absolute -top-px left-3.5 z-10 -translate-y-1/2 rounded-pill bg-azure px-2.5 py-0.5 text-[9.5px] font-semibold tracking-[0.1em] text-canvas uppercase"
          aria-hidden
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

/** The drawn hero, or the operator's own banner when they have staged one. */
function Hero({ banner, height }: { banner: StagedFile | null; height: number }) {
  if (banner) {
    return <img src={banner.objectUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />;
  }
  return (
    <svg viewBox="0 0 760 176" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`hz${height}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.30 0.05 250)" />
          <stop offset="1" stopColor="oklch(0.15 0.02 260)" />
        </linearGradient>
      </defs>
      <rect width="760" height="176" fill={`url(#hz${height})`} />
      <g fill="none" stroke="oklch(1 0 0)" strokeWidth="1" opacity="0.1">
        <path d="M-20 150 C 130 122, 230 66, 360 70 C 500 74, 560 140, 700 128 C 760 123, 790 110, 800 108" />
        <path d="M-20 130 C 122 100, 218 44, 350 48 C 490 52, 548 118, 690 106 C 752 101, 786 88, 800 86" />
        <path d="M-20 110 C 114 78, 206 22, 340 26 C 480 30, 536 96, 680 84 C 744 79, 782 66, 800 64" />
      </g>
      <rect width="760" height="176" fill="oklch(0.1277 0.0108 259.6)" opacity="0.42" />
    </svg>
  );
}

/**
 * Only ever rendered when a check was actually recorded.
 *
 * A climber reads this badge as the reason to trust the listing at all. The
 * consumer web app already hardcodes a fabricated `verifiedOn` date on its demo
 * operators; this preview does not repeat that.
 */
function DocumentsBadge({ checkedAt, small }: { checkedAt: string | null; small?: boolean }) {
  if (!checkedAt) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 self-start rounded-pill border px-2.5 py-0.5 tracking-[0.1em] uppercase ${
        small ? "text-[8px]" : "text-[9px]"
      }`}
      style={{ borderColor: "oklch(0.6687 0.1119 149.6 / 40%)", color: "oklch(0.6687 0.1119 149.6)" }}
    >
      Documents checked
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Web                                                                        */
/* -------------------------------------------------------------------------- */

export function WebCompanyPreview({
  d,
  banner,
  selected,
  onSelect,
}: {
  d: PreviewData;
  banner: StagedFile | null;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const years = d.foundedYear ? new Date().getFullYear() - Number(d.foundedYear) : null;

  return (
    <div className="px-6 py-5">
      <div className="mb-3 flex gap-2 text-[9px] tracking-[0.14em] text-faint uppercase">
        <span>Explore</span>
        <span>›</span>
        <span>Expeditions</span>
        <span>›</span>
        <span className="text-muted">{d.name || "Your company"}</span>
      </div>

      <SectionFrame id="hero" label="Hero" selected={selected === "hero"} onSelect={onSelect}>
        <div className="relative overflow-hidden rounded-card">
          <Hero banner={banner} height={176} />
          <div className="relative flex items-center gap-4 p-5">
            <div className="hairline grid h-[84px] w-[84px] shrink-0 place-items-center rounded-card bg-surface">
              <CompanyMark name={d.name} logoUrl={d.logoUrl ?? null} size={56} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <DocumentsBadge checkedAt={d.documentsCheckedAt} />
              <span className="ser text-[33px] leading-none tracking-[-0.015em] text-ink">
                {d.name || "Your company"}
              </span>
              <span className="text-[13px] text-muted">{d.tagline || "—"}</span>
              <div className="flex items-center gap-3 text-[11.5px] text-faint">
                <span>{[d.city, d.country].filter(Boolean).join(", ") || "—"}</span>
                {years !== null && years >= 0 && (
                  <>
                    <span>·</span>
                    <span className="tnum">{years} years experience</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </SectionFrame>

      <div className="mt-3.5 flex gap-5 border-b border-line px-1 pb-3 text-[9.5px] tracking-[0.13em] text-faint uppercase">
        <span className="-mb-[13px] border-b-2 pb-[9px] text-ink" style={{ borderColor: GILT }}>
          Overview
        </span>
        {["Expeditions", "Treks", "Reviews", "Team", "Gallery", "About", "FAQ"].map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>

      <div className="mt-4 grid gap-3.5" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
        <SectionFrame id="about" label="About" selected={selected === "about"} onSelect={onSelect}>
          <div className="hairline rounded-card p-4">
            <span className="lbl mb-2 block">About {d.name || "your company"}</span>
            <p className="text-[12px] leading-relaxed text-muted">{d.description || "—"}</p>
            <div className="mt-3.5 grid grid-cols-3 gap-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="ser tnum text-[20px] text-ink">{years !== null ? `${years}+` : "—"}</span>
                <span className="lbl" style={{ fontSize: 8 }}>Years</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="ser tnum text-[20px] text-ink">{d.productCount}</span>
                <span className="lbl" style={{ fontSize: 8 }}>Trips run</span>
              </div>
              <div className="flex flex-col gap-0.5">
                {/* Not measured by ICEFALL. A dash, never a percentage. */}
                <span className="ser text-[20px] text-faint">—</span>
                <span className="lbl" style={{ fontSize: 8 }}>Summit rate</span>
              </div>
            </div>
          </div>
        </SectionFrame>

        <SectionFrame id="why" label="Why climb with us" selected={selected === "why"} onSelect={onSelect}>
          <div className="hairline rounded-card p-4">
            <span className="lbl mb-2.5 block">Why climb with us</span>
            <div className="flex flex-col gap-2.5">
              {d.whyChooseUs.length === 0 && <span className="text-[11px] text-faint">Nothing added yet.</span>}
              {d.whyChooseUs.map((w) => (
                <div key={w.label} className="flex flex-col gap-0.5">
                  <span className="text-[12px] text-ink">{w.label}</span>
                  <span className="text-[10.5px] text-faint">{w.detail}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionFrame>
      </div>

      <div className="mt-3.5 grid gap-3.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <SectionFrame id="credentials" label="Certifications" selected={selected === "credentials"} onSelect={onSelect}>
          <div className="hairline rounded-card p-4">
            <span className="lbl mb-2.5 block">Certifications</span>
            <div className="flex flex-wrap gap-2">
              {d.certifications.length === 0 && <span className="text-[11px] text-faint">None recorded.</span>}
              {d.certifications.map((c) => (
                <span key={c.mark} className="hairline rounded-tile px-2.5 py-1.5">
                  <span className="block text-[11.5px] font-semibold text-ink">{c.mark}</span>
                  <span className="block text-[10px] text-faint">{c.note}</span>
                </span>
              ))}
            </div>
          </div>
        </SectionFrame>

        <SectionFrame id="team" label="Team" selected={selected === "team"} onSelect={onSelect}>
          <div className="hairline rounded-card p-4">
            <span className="lbl mb-2.5 block">Team</span>
            <div className="flex flex-col gap-1.5">
              {d.team.length === 0 && <span className="text-[11px] text-faint">Nobody listed.</span>}
              {d.team.map((t) => (
                <div key={t.name} className="flex items-baseline justify-between gap-3">
                  <span className="text-[11.5px] text-ink">{t.name}</span>
                  <span className="text-[10.5px] text-faint">{t.role}</span>
                </div>
              ))}
            </div>
          </div>
        </SectionFrame>
      </div>

      <div className="mt-3.5">
        <SectionFrame id="faq" label="FAQ" selected={selected === "faq"} onSelect={onSelect}>
          <div className="hairline rounded-card p-4">
            <span className="lbl mb-2.5 block">Common questions</span>
            {d.faq.length === 0 ? (
              <span className="text-[11px] text-faint">No questions added.</span>
            ) : (
              <dl className="flex flex-col gap-2.5">
                {d.faq.map((f) => (
                  <div key={f.q}>
                    <dt className="text-[11.5px] text-ink">{f.q}</dt>
                    <dd className="mt-0.5 text-[10.5px] leading-snug text-faint">{f.a}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </SectionFrame>
      </div>

      <SectionFrameIcefall selected={selected === "icefall"} onSelect={onSelect} />
    </div>
  );
}

/**
 * The strip a climber sees that the operator does not control.
 *
 * Present in the preview, padlocked, so the operator can see exactly what
 * ICEFALL says about them on their own page — rather than discovering it from a
 * customer.
 */
function SectionFrameIcefall({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mt-3.5">
      <SectionFrame id="icefall" label="Set by Icefall" selected={selected} onSelect={onSelect}>
        <div className="hairline flex items-center gap-2.5 rounded-card px-4 py-3">
          <Lock size={12} className="shrink-0 text-faint" aria-hidden />
          <span className="text-[11px] text-faint">
            Placement, verification and the mountain photograph on this page are Icefall's, not yours to set.
          </span>
        </div>
      </SectionFrame>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* App                                                                        */
/* -------------------------------------------------------------------------- */

export function AppCompanyPreview({
  d,
  banner,
  selected,
  onSelect,
}: {
  d: PreviewData;
  banner: StagedFile | null;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const years = d.foundedYear ? new Date().getFullYear() - Number(d.foundedYear) : null;

  return (
    <div className="flex justify-center pt-4">
      <div
        className="relative w-[300px] overflow-hidden bg-canvas"
        style={{
          borderRadius: "30px 30px 0 0",
          border: "7px solid oklch(0.2213 0.0192 262.1)",
          borderBottom: 0,
          // Content, not chrome — but the shadow falls on the PORTAL's canvas,
          // which is now light: the 45%-black glow that separated the bezel
          // from a dark pane reads as a smudge on white.
          boxShadow: "0 -8px 40px oklch(0 0 0 / 14%)",
        }}
      >
        <SectionFrame id="hero" label="Hero" selected={selected === "hero"} onSelect={onSelect}>
          <div className="relative h-[172px] overflow-hidden">
            <Hero banner={banner} height={172} />
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(180deg, transparent 40%, var(--op-canvas) 100%)" }}
            />
            <div className="absolute right-4 bottom-3 left-4 flex flex-col gap-1.5">
              <DocumentsBadge checkedAt={d.documentsCheckedAt} small />
              <span className="ser text-[24px] leading-[1.08] text-ink">{d.name || "Your company"}</span>
              <span className="text-[11px] leading-snug text-muted">{d.tagline || "—"}</span>
            </div>
          </div>
        </SectionFrame>

        <div className="flex flex-col gap-3 px-4 pt-3">
          <div className="flex items-center gap-2 text-[10.5px] text-faint">
            <span>{[d.city, d.country].filter(Boolean).join(", ") || "—"}</span>
            {years !== null && years >= 0 && (
              <>
                <span>·</span>
                <span className="tnum">{years} yrs</span>
              </>
            )}
          </div>

          {/* Actions in thumb reach — the phone is not the desktop page narrowed. */}
          <div className="flex gap-2">
            <span
              className="flex-1 rounded-pill py-2.5 text-center text-[11.5px] font-medium text-canvas"
              style={{ background: GILT }}
            >
              Contact
            </span>
            <span className="hairline rounded-pill px-4 py-2.5 text-[11.5px] text-ink">Save</span>
          </div>

          <div className="flex gap-3.5 overflow-hidden border-b border-line pb-2 text-[8.5px] tracking-[0.11em] text-faint uppercase">
            <span className="text-ink">Overview</span>
            <span>Trips</span>
            <span>Team</span>
            <span>About</span>
          </div>
        </div>

        <div className="px-4 pt-3 pb-5">
          <SectionFrame id="about" label="About" selected={selected === "about"} onSelect={onSelect}>
            <div className="flex flex-col gap-1.5 py-1">
              <span className="lbl" style={{ fontSize: 8 }}>About</span>
              <p className="text-[11px] leading-relaxed text-muted">{d.description || "—"}</p>
            </div>
          </SectionFrame>

          <div className="mt-3">
            <SectionFrame id="why" label="Why climb with us" selected={selected === "why"} onSelect={onSelect}>
              <div className="flex flex-col gap-2 py-1">
                <span className="lbl" style={{ fontSize: 8 }}>Why climb with us</span>
                {d.whyChooseUs.length === 0 && <span className="text-[10.5px] text-faint">Nothing added.</span>}
                {d.whyChooseUs.slice(0, 3).map((w) => (
                  <div key={w.label} className="flex flex-col">
                    <span className="text-[11px] text-ink">{w.label}</span>
                    <span className="text-[10px] text-faint">{w.detail}</span>
                  </div>
                ))}
              </div>
            </SectionFrame>
          </div>

          <div className="mt-3">
            <SectionFrame id="credentials" label="Certifications" selected={selected === "credentials"} onSelect={onSelect}>
              <div className="flex flex-col gap-1.5 py-1">
                <span className="lbl" style={{ fontSize: 8 }}>Certifications</span>
                <div className="flex flex-wrap gap-1.5">
                  {d.certifications.length === 0 && <span className="text-[10.5px] text-faint">None.</span>}
                  {d.certifications.map((c) => (
                    <span key={c.mark} className="hairline rounded-pill px-2 py-0.5 text-[10px] text-ink">
                      {c.mark}
                    </span>
                  ))}
                </div>
              </div>
            </SectionFrame>
          </div>

          <div className="mt-3">
            <SectionFrame id="team" label="Team" selected={selected === "team"} onSelect={onSelect}>
              <div className="flex flex-col gap-1.5 py-1">
                <span className="lbl" style={{ fontSize: 8 }}>Team</span>
                {d.team.length === 0 && <span className="text-[10.5px] text-faint">Nobody listed.</span>}
                {d.team.slice(0, 3).map((t) => (
                  <div key={t.name} className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-ink">{t.name}</span>
                    <span className="text-[10px] text-faint">{t.role}</span>
                  </div>
                ))}
              </div>
            </SectionFrame>
          </div>

          <div className="mt-3">
            <SectionFrameIcefall selected={selected === "icefall"} onSelect={onSelect} />
          </div>
        </div>
      </div>
    </div>
  );
}
