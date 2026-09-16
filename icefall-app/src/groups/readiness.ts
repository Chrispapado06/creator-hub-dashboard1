/**
 * READINESS FOR ONE PERSON, AGAINST ONE MOUNTAIN.
 *
 * Moved out of `screens/explore/GroupWorkspace.tsx` unchanged (structure plan
 * §2.5, slice S7) BEFORE that screen was deleted, because the redesign shows a
 * readiness band per member and this is where the figure behind that band comes
 * from. Nothing about it changed on the way: same inputs, same withholding,
 * same wording.
 *
 * IT IS THE READER'S OWN FIGURE AND NOBODY ELSE'S. It reads this device's
 * recorded sessions and what the athlete told ICEFALL, so it can only ever
 * answer for the person holding the phone. Another member's readiness comes
 * from the server, with that member's consent, and never from here.
 */
import { useMemo } from "react";

import { type DataQualifier } from "@/components/coach/DataState";
import { isKnown, unavailable, type Score } from "@/coach/types";
import { assessObjectiveReadiness } from "@/coach/mountainReadiness";
import { REFERENCE_NO_READINESS } from "@/services/peakTier";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import type { GroupPeak } from "@/groups/local/useGroupPeak";

export interface DerivedReadiness {
  /** A value or the reason there isn't one. Never a zero standing in for either. */
  score: Score;
  qualifier: DataQualifier;
  note: string;
}

/**
 * The local athlete's readiness for this group's mountain.
 *
 * DERIVED from the sessions they recorded and from what they told ICEFALL, and
 * never measured — which is why every row that draws it carries a qualifier
 * badge and this note. It is not a clearance either: the engine withholds a
 * composite whenever a dimension the objective turns on is unknown, and this
 * hook passes that absence straight through rather than substituting a figure.
 */
export function useMemberReadiness(peak: GroupPeak): DerivedReadiness {
  const { objectives, coachProfile } = useApp();
  const activities = useRecordedActivities();
  const { name, elevationM, lat, lon, curatedId } = peak;

  return useMemo<DerivedReadiness>(() => {
    if (typeof elevationM !== "number" || !Number.isFinite(elevationM)) {
      return {
        score: unavailable("no-data"),
        qualifier: "estimated",
        note: `No elevation is recorded for ${name}, and ICEFALL reads the class of an objective from its elevation. There is nothing to assess against rather than a guess at one.`,
      };
    }
    if (!curatedId) {
      return {
        score: unavailable("no-data"),
        qualifier: "estimated",
        note: `${name} is a reference entry. ${REFERENCE_NO_READINESS}`,
      };
    }

    // Simulated recordings are excluded, as everywhere else that answers "has
    // this person been on that kind of ground". A labelled simulation is not
    // evidence that they have.
    const recorded = activities.filter((a) => !a.simulated);
    const summits = objectives
      .filter((o): o is typeof o & { summitedAt: string } => typeof o.summitedAt === "string")
      .map((o) => ({ name: o.name, elevationM: o.elevationM, date: o.summitedAt }));

    const readiness = assessObjectiveReadiness({
      peak: { name, elevationM, lat, lon },
      activities: recorded,
      summitsLogged: summits,
      selfReported: {
        technicalSkills: coachProfile.technicalSkills,
        maxAltitudeM: coachProfile.maxAltitudeM,
        disciplineExperience: coachProfile.disciplineExperience,
      },
    });

    // Disclosed conservatively: if anything the athlete told us could have
    // reached the figure, it is labelled self-reported. Over-disclosing costs
    // nothing; under-disclosing puts an unearned number next to a name.
    const selfReported =
      readiness.dimensions.some((d) => d.provenance === "self-reported") ||
      coachProfile.technicalSkills.length > 0 ||
      typeof coachProfile.maxAltitudeM === "number" ||
      Object.keys(coachProfile.disciplineExperience).length > 0 ||
      summits.length > 0;

    const note = isKnown(readiness.overall)
      ? `Derived from the sessions you have recorded${selfReported ? " and what you have told ICEFALL" : ""}, against ICEFALL's training benchmarks for this class of objective. Never measured, and not a statement that you are ready to climb ${name}.`
      : `No single figure: ${
          readiness.biggestGap
            ? `${readiness.biggestGap.label.toLowerCase()} is unknown`
            : "a dimension this objective turns on is unknown"
        }, and a number built from the parts that happen to be known would read as a verdict on the whole mountain.`;

    return {
      score: readiness.overall,
      qualifier: selfReported ? "self-reported" : "estimated",
      note,
    };
  }, [curatedId, name, elevationM, lat, lon, activities, objectives, coachProfile]);
}
