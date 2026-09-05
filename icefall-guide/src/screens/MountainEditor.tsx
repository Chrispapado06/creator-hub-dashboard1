import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, Trash2 } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Button, Card } from "@/components/ui/primitives";
import { Field, Notice, inputClass } from "@/components/guide";
import { Photo } from "@/components/Photo";
import { peakById } from "@/data/peaks";
import { trekById } from "@/data/treks";
import { GRADES, removeRoute, upsertRoute, type Grade, type RouteKind } from "@/data/listingStore";
import { listing, seedListing } from "@/domain/listing";
import { cn } from "@/lib/utils";

/**
 * ONE MOUNTAIN, ON THE GUIDE'S TERMS.
 *
 * PREREQUISITES ARE REQUIRED AND THE FORM WILL NOT SAVE WITHOUT THEM. "What the
 * client must already be able to do" is not marketing copy — a guide
 * advertising the Hörnli ridge with that box empty is how somebody books a route
 * they cannot climb and finds out at 3,000 m. It is the one field here that is
 * about safety rather than commerce, so it is the one the form refuses to skip.
 *
 * The day rate is the guide's OWN fee. What ICEFALL keeps is shown against it,
 * computed by the shared money model rather than here, so a guide can see what
 * actually reaches them before they set a price rather than after their first
 * payout.
 */
export default function MountainEditor() {
  const { kind: kindParam = "mountain", id = "" } = useParams();
  const kind: RouteKind = kindParam === "trek" ? "trek" : "mountain";
  const navigate = useNavigate();

  const peak = kind === "mountain" ? peakById(id) : undefined;
  const trek = kind === "trek" ? trekById(id) : undefined;
  const found = kind === "mountain" ? peak !== undefined : trek !== undefined;
  const name = peak?.name ?? trek?.name ?? id;
  const detail =
    kind === "mountain"
      ? [
          peak?.elevationM ? `${peak.elevationM.toLocaleString("en-GB")} m` : "",
          peak?.range,
          peak?.country,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          trek?.maxAltitudeM ? `${trek.maxAltitudeM.toLocaleString("en-GB")} m high point` : "",
          trek?.country,
        ]
          .filter(Boolean)
          .join(" · ");

  const existing = listing().routes.find((m) => m.kind === kind && m.routeId === id);

  const [routes, setRoutes] = useState(existing?.routes ?? "");
  const [grade, setGrade] = useState<Grade>(existing?.grade ?? "Moderate");
  const [dayRate, setDayRate] = useState(String(existing?.dayRateEur ?? ""));
  /**
   * PREFILLED FROM THE CATALOGUE, NOT ASSUMED. A trek's typical duration is
   * known — the Tour du Mont Blanc is 10 to 11 days — so a guide starts from
   * that rather than a blank box. It is a starting point they can change,
   * because how long THEY run it is their decision and not the catalogue's.
   */
  const [days, setDays] = useState(
    String(existing?.typicalDays ?? (kind === "trek" ? (trek?.minDays ?? "") : "")),
  );
  const [requires, setRequires] = useState(existing?.requires ?? "");
  const [touched, setTouched] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!found) {
    return (
      <Screen>
        <div className="pt-8">
          <Link to="/mountains" className="inline-flex items-center gap-1 text-[12.5px] text-mist">
            <ChevronLeft size={16} strokeWidth={1.7} /> My mountains
          </Link>
          <Card className="mt-5">
            <p className="text-[12.5px] text-mist">
              ICEFALL does not have that {kind === "trek" ? "trek" : "peak"} in its catalogue.
            </p>
          </Card>
        </div>
      </Screen>
    );
  }

  const rate = Number(dayRate);
  const nDays = Number(days);
  const problems = [
    !requires.trim() && "what a client must already be able to do",
    !routes.trim() && "the route or routes you take",
    !(rate > 0) && "a day rate",
    !(nDays > 0) && "how many days it usually takes",
  ].filter((x): x is string => typeof x === "string");

  const save = () => {
    setTouched(true);
    if (problems.length > 0) return;
    const ok = upsertRoute(
      {
        kind,
        routeId: id,
        routes: routes.trim(),
        grade,
        dayRateEur: Math.round(rate),
        typicalDays: Math.round(nDays),
        requires: requires.trim(),
      },
      seedListing(),
    );
    setFailed(!ok);
    if (ok) navigate("/mountains");
  };

  const remove = () => {
    removeRoute(kind, id, seedListing());
    navigate("/mountains");
  };

  return (
    <Screen padded={false}>
      <Stagger>
        <Rise className="relative">
          <Photo peak={id} kind={kind} alt="" className="h-36 w-full" rounded="rounded-none" />
          <div className="scrim-bottom absolute inset-x-0 bottom-0 h-20" />
          <Link
            to="/mountains"
            aria-label="Back"
            className="absolute left-4 top-6 grid h-9 w-9 place-items-center rounded-full bg-obsidian/70 text-snow backdrop-blur"
          >
            <ChevronLeft size={20} strokeWidth={1.8} />
          </Link>
        </Rise>

        <Rise className="px-5 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-[20px] font-light leading-tight text-snow">{name}</h1>
            <span className="mt-1 shrink-0 rounded-[5px] border border-hairline-strong px-1.5 py-[2px] text-[9px] uppercase tracking-[0.1em] text-mist-dim">
              {kind === "trek" ? "Trek" : "Peak"}
            </span>
          </div>
          <p className="tnum mt-1 text-[12px] text-mist-dim">{detail}</p>
        </Rise>

        <Rise className="px-5 pt-5">
          <Card>
            <div className="space-y-4">
              <Field label="Routes you take" hint="Your own words. A climber reads this first.">
                <input
                  value={routes}
                  onChange={(e) => setRoutes(e.target.value)}
                  placeholder={kind === "trek" ? "Anti-clockwise, hut to hut" : "Hörnli ridge"}
                  className={inputClass}
                />
              </Field>

              <div>
                <span className="section-label">How hard you grade it</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGrade(g)}
                      aria-pressed={grade === g}
                      className={cn(
                        "h-9 rounded-tile border text-[12px] transition-colors",
                        grade === g
                          ? "border-azure bg-azure/15 text-azure"
                          : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
                      )}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Day rate €">
                  <input
                    value={dayRate}
                    onChange={(e) => setDayRate(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="690"
                    className={inputClass}
                  />
                </Field>
                <Field label="Typical days">
                  <input
                    value={days}
                    onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
                    inputMode="numeric"
                    placeholder="3"
                    className={inputClass}
                  />
                </Field>
              </div>

              <Field
                label="What the client must already be able to do"
                hint="Required. This is what stops somebody booking a route they cannot climb."
              >
                <textarea
                  value={requires}
                  onChange={(e) => setRequires(e.target.value)}
                  rows={3}
                  placeholder="Crampon-confident, comfortable with 1,200 m of ascent in a day"
                  className={cn(
                    inputClass,
                    "resize-none",
                    touched && !requires.trim() && "border-danger",
                  )}
                />
              </Field>
            </div>
          </Card>
        </Rise>

        {touched && problems.length > 0 && (
          <Rise className="px-5 pt-3">
            <Notice tone="danger">
              <p className="text-snow">Not saved yet</p>
              <p className="mt-1.5">Still needed: {problems.join(", ")}.</p>
            </Notice>
          </Rise>
        )}

        {failed && (
          <Rise className="px-5 pt-3">
            <Notice tone="danger">That did not save — this device is refusing to store it.</Notice>
          </Rise>
        )}

        <Rise className="px-5 pt-5">
          <Button size="lg" className="w-full" onClick={save}>
            {existing ? "Save changes" : "Add to my listing"}
          </Button>
          {existing && (
            <button
              type="button"
              onClick={remove}
              className="mt-3 flex w-full items-center justify-center gap-1.5 text-[12.5px] text-danger"
            >
              <Trash2 size={14} strokeWidth={1.8} />
              Remove from my listing
            </button>
          )}
        </Rise>

        <Rise className="px-5 pb-3 pt-4">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Saved on this phone. ICEFALL cannot publish a guide's listing yet.
          </p>
        </Rise>
      </Stagger>
    </Screen>
  );
}
