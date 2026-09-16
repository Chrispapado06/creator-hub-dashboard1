/**
 * TRIP · ITINERARY (mockup spec §8) — the day-by-day plan, one day per row.
 *
 * Lifted out of the Trip tab unchanged: the mockup's Trip tab is seven rows and
 * a button, so the days live on a screen of their own wearing the same back
 * arrow and centred title as documents, gear and the rest.
 *
 * NOTHING HERE IS INVENTED. ICEFALL holds no itinerary for a real trip
 * (plan §9.3); when there is none the screen says so and falls back to the
 * sleeping heights the athlete logged, which are measurements, not a plan.
 */

import { Link } from "react-router-dom";

import { CAMP_KIND_LABEL, HARVEST_DATE, OSM_ATTRIBUTION } from "@/data/mountainCamps";
import { cn } from "@/lib/utils";
import { useTrip } from "@/trip/trip";

import { campsAreOld } from "../mapModel";
import { MOUNTAIN_PATHS } from "../paths";
import { metresLabel } from "../sos";
import { useMountainTrip } from "../trip";
import { shortDate } from "../tripTabModel";
import { M_ROW, SectionLabel } from "../ui";
import { SubHeader, SubNote } from "./chrome";

export default function ItineraryScreen() {
  const { trip, today } = useMountainTrip();
  const { nights } = useTrip();
  const campsOld = campsAreOld(HARVEST_DATE, today);
  const ownNights = trip?.source === "trip" ? nights : [];

  return (
    <div className="pb-10">
      <SubHeader title="Itinerary" />

      {!trip ? (
        <SubNote>Start a trip in the full app to see its days here.</SubNote>
      ) : trip.itinerary ? (
        <>
          <ol>
            {trip.itinerary.map((d) => {
              const isToday = d.date === today;
              return (
                <li key={d.date} className={cn(M_ROW, "items-start py-4")}>
                  <div className="min-w-0">
                    <SectionLabel tone={isToday ? "azure" : "mist"}>
                      Day {d.dayNumber} · {shortDate(d.date)}
                      {isToday ? " · today" : ""}
                    </SectionLabel>
                    <p
                      className={cn(
                        "mt-1 m-text-body leading-snug",
                        isToday ? "text-snow" : "text-mist",
                      )}
                    >
                      {d.label}
                    </p>
                    {d.sleepAt && (
                      <p
                        className={cn(
                          "mt-1 m-text-label leading-snug",
                          campsOld ? "text-mist-dim" : "text-mist",
                        )}
                      >
                        Sleep at {d.sleepAt.name} · {CAMP_KIND_LABEL[d.sleepAt.kind].toLowerCase()}
                        {d.sleepAt.elevationM !== null && (
                          <span className="tabular-nums">
                            {" "}
                            · {metresLabel(d.sleepAt.elevationM)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  {d.summitDay && trip.peakElevationM !== null && (
                    <span className="m-text-label shrink-0 pt-5 tabular-nums text-mist">
                      {metresLabel(trip.peakElevationM)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {trip.itinerary.some((d) => d.sleepAt) && (
            <SubNote tone="dim" className="border-t border-hairline">
              {campsOld && "Hut data is over a year old. "}
              {OSM_ATTRIBUTION}
            </SubNote>
          )}
        </>
      ) : (
        <>
          <SubNote>ICEFALL holds no day-by-day plan for this trip.</SubNote>
          {ownNights.map((n) => (
            <div key={n.date} className={cn(M_ROW, "py-3")}>
              <span className="m-text-body text-mist">Night of {shortDate(n.date)}</span>
              <span className="m-text-body tabular-nums text-snow">{metresLabel(n.sleptAtM)}</span>
            </div>
          ))}
          {ownNights.length > 0 && (
            <SubNote tone="dim" className="border-t border-hairline">
              Sleeping heights you logged.
            </SubNote>
          )}
        </>
      )}

      {trip && (
        <Link to={MOUNTAIN_PATHS.tripGear} className={cn(M_ROW, "mt-8 m-text-body text-snow")}>
          Gear for these days
        </Link>
      )}
    </div>
  );
}
