/**
 * FIND AN EXPEDITION — the operator directory, filtered to one group's objective.
 *
 * Moved out of `screens/explore/GroupWorkspace.tsx` unchanged (structure plan
 * §2.5, slice S7) BEFORE that screen was deleted, because the redesign keeps
 * this section. Nothing about it changed on the way.
 *
 * IT RETURNS A FRAGMENT OF `Rise` ELEMENTS AND MUST BE CALLED, NOT RENDERED.
 * `Stagger` propagates its variants to DIRECT CHILDREN ONLY, so writing
 * `<Operators peak={peak} />` inside a `Stagger` leaves every card at opacity 0
 * — in the DOM, no error, tsc green. Write `{Operators({ peak })}` instead, or
 * give it a `Stagger` of its own.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Mountain as MountainIcon } from "lucide-react";

import { Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import { OperatorCard } from "@/components/domain/OperatorCard";
import { DEMO_NOTICE, OPERATOR_DISCLAIMER, operatorsFor } from "@/services/operators";
import { operatorSearchUrl } from "@/services/expeditionAccess";
import type { GroupPeak } from "@/groups/local/useGroupPeak";

/**
 * The operator directory, filtered to this group's objective.
 *
 * Filtered by `operatorsFor`, which is the same function the mountain page
 * uses, so the listings shown are the ones that plausibly work on this ground
 * rather than the whole directory with a heading over it. Every listing carries
 * what it is — a sample, or in a development build a demo with invented figures
 * — and `OPERATOR_DISCLAIMER` states that ICEFALL has no operator partnerships
 * and vets nobody. Where the group's elevation is unknown there is no class of
 * objective to filter by, and the section says that instead of listing
 * everything.
 */
export function Operators({ peak }: { peak: GroupPeak }) {
  const elevationM = peak.elevationM;

  const listings = useMemo(
    () =>
      typeof elevationM === "number"
        ? operatorsFor({ country: peak.country, elevationM }).slice(0, 3)
        : [],
    [elevationM, peak.country],
  );

  if (typeof elevationM !== "number") {
    return (
      <Rise className="pt-3">
        <Card>
          <p className="text-[14px] text-snow">Nothing to filter by</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            This group has no elevation recorded for {peak.name}, and the directory is filtered by
            the class of objective. Listing everything under this heading would be pretending it was
            filtered.
          </p>
          <Button asChild variant="secondary" className="mt-4 w-full">
            <Link to="/explore/expeditions">Open the operator directory</Link>
          </Button>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise className="pt-3">
        <Card>
          <div className="flex items-start gap-3">
            <MountainIcon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
            <p className="min-w-0 text-[12px] leading-relaxed text-mist">
              Going with an operator is the other way to climb {peak.name}, and on serious ground it
              is the one ICEFALL defers to. These listings are filtered to this objective.
            </p>
          </div>
        </Card>
      </Rise>

      {listings.length === 0 ? (
        <Rise className="pt-3">
          <Card>
            <p className="text-[14px] text-snow">No listing covers this objective</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
              ICEFALL's directory holds a small set of illustrative listings and none of them work
              on this ground. That is the directory being thin, not a finding about the mountain —
              the local guides office and the national IFMGA association are the real answer.
            </p>
            <Button asChild variant="secondary" className="mt-4 w-full">
              <a href={operatorSearchUrl(peak.name)} target="_blank" rel="noreferrer noopener">
                Search for IFMGA operators
              </a>
            </Button>
          </Card>
        </Rise>
      ) : (
        <>
          {listings.map((operator, i) => (
            <Rise key={operator.id} className="pt-3">
              <OperatorCard
                operator={operator}
                peak={{
                  name: peak.name,
                  elevationM,
                  lat: peak.lat,
                  lon: peak.lon,
                  goalId: peak.goalId,
                }}
                rank={i + 1}
              />
            </Rise>
          ))}
          <Rise className="pt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link to="/explore/expeditions">See the whole directory</Link>
            </Button>
          </Rise>
        </>
      )}

      <Rise className="pt-4">
        <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
      </Rise>

      {listings.some((o) => o.demo) && (
        <Rise className="pt-3">
          <Disclaimer>{DEMO_NOTICE}</Disclaimer>
        </Rise>
      )}
    </>
  );
}

