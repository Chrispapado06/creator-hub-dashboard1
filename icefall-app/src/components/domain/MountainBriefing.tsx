import { ExternalLink, Mountain as MountainIcon, ShieldCheck } from "lucide-react";
import { Badge, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import { DifficultyDots, GearCard } from "@/components/domain/cards";
import { sync } from "@/services/repository";
import { ASSESSMENT_DISCLAIMER, assessPeak } from "@/services/peakAssessment";
import { ACCESS_DISCLAIMER, accessFor, operatorSearchUrl } from "@/services/expeditionAccess";
import { fmtElevation } from "@/lib/format";
import type { Season } from "@/types";

/**
 * Everything ICEFALL can honestly say about a mountain.
 *
 * Lived only on the peak page before, which meant a mountain you'd committed to
 * as a goal told you *less* than one you were browsing. Both surfaces render
 * this now, so the depth follows the mountain rather than the route you took
 * to reach it.
 */

const SEASON_LABEL: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  autumn: "Autumn",
  winter: "Winter",
};

export interface BriefingPeak {
  name: string;
  elevationM: number;
  /** Latitude drives the season window; without it the estimate is Alpine-biased. */
  lat?: number;
  /** Longitude separates the monsoon Himalaya from the Karakoram. */
  lon?: number;
  country?: string;
}

export function MountainBriefing({
  peak,
  showGrade = true,
}: {
  peak: BriefingPeak;
  /** The goal page already states the grade in its header. */
  showGrade?: boolean;
}) {
  const assessment = assessPeak(peak.elevationM, peak.lat ?? 46, peak.lon);
  const access = accessFor({
    country: peak.country,
    requiresGuide: assessment.requiresGuide,
    elevationM: peak.elevationM,
  });
  const products = assessment.equipmentIds
    .map((id) => sync.productById(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <>
      {showGrade && (
        <Rise className="pt-6">
          <SectionLabel>Grade</SectionLabel>
          <Card className="mt-3">
            <div className="flex items-center gap-3">
              <p className="flex-1 text-[15px] text-snow">{assessment.label}</p>
              <DifficultyDots level={assessment.difficulty} />
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-mist">{assessment.summary}</p>
            <p className="tnum mt-2.5 text-[12px] text-mist-dim">
              {fmtElevation(peak.elevationM)} m{peak.country ? ` · ${peak.country}` : ""}
            </p>
          </Card>
        </Rise>
      )}

      <Rise className="pt-5">
        <Disclaimer>{ASSESSMENT_DISCLAIMER}</Disclaimer>
      </Rise>

      {/* Skills */}
      <Rise className="pt-6">
        <SectionLabel>What you need</SectionLabel>
        <Card className="mt-3">
          <ul className="space-y-2.5">
            {assessment.skills.map((s) => (
              <li key={s} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {s}
              </li>
            ))}
          </ul>
          {assessment.requiresGuide && (
            <Disclaimer className="mt-4">
              At this grade ICEFALL recommends a certified mountain guide unless you already hold
              the skills above and have current experience on comparable ground.
            </Disclaimer>
          )}
        </Card>
      </Rise>

      {/* Technical kit */}
      <Rise className="pt-6">
        <SectionLabel>Technical equipment</SectionLabel>
        <div className="mt-3 flex flex-wrap gap-2">
          {assessment.technicalKit.map((k) => (
            <Badge key={k} size="md">
              {k}
            </Badge>
          ))}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          ICEFALL doesn't make these — they're listed so the kit list is complete.
        </p>
      </Rise>

      {/* ICEFALL clothing system */}
      {products.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>Recommended ICEFALL system</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {products.map((p) => (
              <GearCard key={p.id} product={p} />
            ))}
          </div>
        </Rise>
      )}

      {/* Season */}
      <Rise className="pt-6">
        <SectionLabel>Season</SectionLabel>
        <Card className="mt-3">
          <div className="flex flex-wrap gap-2">
            {assessment.seasons.map((s) => (
              <Badge key={s} tone="azure" size="md">
                {SEASON_LABEL[s]}
              </Badge>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-mist">{assessment.seasonNote}</p>
        </Card>
      </Rise>

      {/* Altitude */}
      {assessment.acclimatisation && (
        <Rise className="pt-6">
          <SectionLabel>Acclimatisation</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">{assessment.acclimatisation}</p>
            <Disclaimer className="mt-4">
              Altitude illness can become life-threatening quickly. Discuss any high-altitude plan
              with a doctor experienced in altitude medicine.
            </Disclaimer>
          </Card>
        </Rise>
      )}

      {/* Access, permits and operators */}
      {access.professionalSupportExpected && (
        <Rise className="pt-6">
          <SectionLabel>Access, permits & operators</SectionLabel>
          <Card className="mt-3">
            {access.authority ? (
              <div className="flex gap-3">
                <ShieldCheck size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
                <div className="min-w-0">
                  <p className="text-[13px] leading-relaxed text-snow">{access.authority}</p>
                  {access.authorityNote && (
                    <p className="mt-1 text-[12px] leading-relaxed text-mist">
                      {access.authorityNote}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-mist">
                ICEFALL has no verified permit information for this peak. Start with the national
                park or land authority that governs it, and the nearest guides office.
              </p>
            )}

            {access.notes.length > 0 && (
              <ul className={access.authority ? "mt-4 space-y-2.5" : "mt-3 space-y-2.5"}>
                {access.notes.map((n) => (
                  <li key={n} className="flex gap-3 text-[12px] leading-relaxed text-mist">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mist-dim" />
                    {n}
                  </li>
                ))}
              </ul>
            )}

            <a
              href={operatorSearchUrl(peak.name)}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-4 flex items-center gap-2.5 rounded-tile border border-hairline px-3.5 py-3 text-[12px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
            >
              <ExternalLink size={14} strokeWidth={1.6} className="shrink-0" />
              <span className="flex-1">Find certified operators for {peak.name}</span>
            </a>

            <Disclaimer className="mt-4">{ACCESS_DISCLAIMER}</Disclaimer>
          </Card>
        </Rise>
      )}
    </>
  );
}

/** The data-source footer that goes under a briefing. */
export function PeakSourceCard({
  attribution,
  wikipedia,
}: {
  attribution: string;
  wikipedia?: string;
}) {
  const article = wikipedia ? parseArticle(wikipedia) : null;
  return (
    <Card>
      <div className="flex items-center gap-3">
        <MountainIcon size={15} strokeWidth={1.5} className="shrink-0 text-mist-dim" />
        <p className="flex-1 text-[11px] leading-relaxed text-mist-dim">{attribution}</p>
      </div>
      {article && (
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 flex items-center gap-2 text-[12px] text-mist transition-colors hover:text-snow"
        >
          <ExternalLink size={13} strokeWidth={1.6} />
          Read about {article.title} on Wikipedia
        </a>
      )}
    </Card>
  );
}

function parseArticle(tag: string) {
  const m = /^([a-z-]{2,12}):(.+)$/i.exec(tag.trim());
  if (!m) return null;
  return {
    title: m[2],
    url: `https://${m[1].toLowerCase()}.wikipedia.org/wiki/${encodeURIComponent(m[2])}`,
  };
}
