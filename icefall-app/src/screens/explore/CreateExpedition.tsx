import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, Loader2, Mountain as MountainIcon, Plus, Search, X } from "lucide-react";

import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { PEAK_ATTRIBUTION, rememberPeaks, searchPeaks, type Peak } from "@/services/peaks";
import { useApp } from "@/state/AppState";
import {
  EXPERIENCE_LABELS,
  LOOKING_FOR_LABELS,
  NETWORK_NOT_CONNECTED_NOTICE,
  experienceFromAppLevel,
  type ExperienceLevel,
  type ExpeditionPrivacy,
  type LookingFor,
} from "@/network/types";
import { GroupCard } from "@/components/network/GroupCard";

/**
 * Create an expedition.
 *
 * This screen genuinely works, and it is the whole reason the feature ships at
 * zero users: it lets the first athlete create the thing everybody else will
 * later join. What it creates is REAL — a record written to this device through
 * `createExpedition` — and it is also, for now, the only expedition in
 * existence anywhere in ICEFALL.
 *
 * Three rules the form enforces rather than merely mentions:
 *
 *   1. ELEVATION IS NEVER TYPED. The mountain is resolved live through
 *      `searchPeaks` against OpenStreetMap, so its elevation comes from the map
 *      rather than from memory — the class of objective, the skills it demands
 *      and every readiness figure downstream are derived from that number. When
 *      a peak cannot be resolved the name may still be used, and the expedition
 *      then carries NO elevation and says so, rather than a plausible guess.
 *   2. NOTHING IS PUBLISHED. There is no server, no directory and no other
 *      members, so creating an expedition posts nothing and notifies nobody.
 *      That is stated before the form, not after it.
 *   3. PRIVACY IS INTENT, NOT ENFORCEMENT. "Invite-only" cannot be enforced
 *      against anybody, because there is nobody it could be enforced against
 *      and nothing to enforce it with. The field says so beside itself.
 *
 * The party is created with ONE member — the athlete — because one member is
 * who exists. It is never padded towards the minimum size to look populated.
 */

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

/** Two is a rope team; beyond eight it stops being a party and becomes a trip. */
const SIZE_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

const EXPERIENCE_OPTIONS: ExperienceLevel[] = ["beginner", "intermediate", "advanced", "expert"];

const LOOKING_FOR_OPTIONS: LookingFor[] = [
  "expedition-partners",
  "training-partners",
  "hiking-partners",
  "expedition-group",
  "friends",
  "networking",
];

const PRIVACY_OPTIONS: { id: ExpeditionPrivacy; label: string; note: string }[] = [
  {
    id: "public",
    label: "Public",
    note: "Open to anyone, if there is ever anyone.",
  },
  {
    id: "invite-only",
    label: "Invite-only",
    note: "Your intention to pick the party yourself.",
  },
];

/** Local date components, never toISOString(): a UTC key is yesterday's date west of Greenwich. */
function todayKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function CreateExpedition() {
  const [params] = useSearchParams();
  const { user, myProfile, expeditions, createExpedition } = useApp();

  /* ---- The mountain ------------------------------------------------------ */

  // Prefilled from the empty state's "Create <peak> expedition", which passes
  // the athlete's OWN objective. It seeds the search box only: the elevation
  // still has to come back from the map before it is stored.
  const [query, setQuery] = useState(() => params.get("peak")?.trim() ?? "");
  const [peak, setPeak] = useState<Peak | null>(null);
  const [nameOnly, setNameOnly] = useState<string | null>(null);

  /* ---- Everything else --------------------------------------------------- */

  const [fromKey, setFromKey] = useState("");
  const [toKey, setToKey] = useState("");
  const [sizeMin, setSizeMin] = useState(2);
  const [sizeMax, setSizeMax] = useState(4);
  // Defaults to what the athlete already told ICEFALL about themselves, on the
  // network's scale. A pure relabelling of their own answer — nothing inferred.
  const [experience, setExperience] = useState<ExperienceLevel>(
    () => myProfile?.experience ?? experienceFromAppLevel(user.experience),
  );
  const [lookingFor, setLookingFor] = useState<LookingFor[]>(() => myProfile?.lookingFor ?? []);
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<ExpeditionPrivacy>("public");

  const [createdId, setCreatedId] = useState<string | null>(null);
  const created = createdId ? expeditions.find((e) => e.id === createdId) : undefined;

  const peakName = peak?.name ?? nameOnly;
  const today = todayKey();

  const dateProblem = useMemo(() => {
    if (!fromKey || !toKey) return null;
    return toKey < fromKey ? "The last day cannot fall before the first." : null;
  }, [fromKey, toKey]);

  const canCreate = Boolean(peakName) && Boolean(fromKey) && Boolean(toKey) && dateProblem === null;

  function create() {
    if (!peakName || !fromKey || !toKey || dateProblem !== null) return;
    const id = createExpedition({
      peakName,
      // Only ever the figure OpenStreetMap returned. Left unset when the peak
      // could not be resolved, and every surface then says it is not recorded.
      elevationM: peak?.elevationM,
      window: { fromIso: fromKey, toIso: toKey },
      sizeMin,
      sizeMax,
      experience,
      lookingFor,
      description: description.trim() || undefined,
      privacy,
    });
    setCreatedId(id);
  }

  /* ---- After creation ---------------------------------------------------- */

  if (created) {
    return (
      <Screen>
        <ScreenHeader
          title="Expedition created"
          subtitle="Saved on this device"
          back="/explore/crew"
        />

        <Stagger>
          <Rise>
            {/* The card the group list draws, linking where it links there —
                into the workspace, which is where the group is planned. */}
            <GroupCard group={created} to={`/explore/groups/${created.id}`} />
          </Rise>

          <Rise className="pt-5">
            <Card>
              <p className="text-[13px] leading-relaxed text-mist">
                It exists here and nowhere else. Nothing has been posted, nobody has been notified,
                and no one can find it — sharing exports a written card you send yourself.
              </p>
            </Card>
          </Rise>

          <Rise className="pt-4">
            <Button asChild className="w-full">
              <Link to={`/explore/groups/${created.id}`}>Open the workspace</Link>
            </Button>
          </Rise>

          <Rise className="pt-3">
            <Button asChild variant="secondary" className="w-full">
              <Link to="/explore/crew">Back to your groups</Link>
            </Button>
          </Rise>

          <Rise className="pt-5">
            <Disclaimer>{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  /* ---- The form ---------------------------------------------------------- */

  return (
    <Screen>
      <ScreenHeader
        title="New expedition"
        subtitle="One mountain, one window, the party you want"
        back="/explore/crew"
      />

      <Stagger>
        <Rise>
          <Disclaimer>{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>
        </Rise>

        {/* ---- Mountain --------------------------------------------------- */}

        <Rise className="pt-6">
          <SectionLabel>Mountain</SectionLabel>
          {peakName ? (
            <ChosenPeak
              name={peakName}
              elevationM={peak?.elevationM}
              country={peak?.country}
              onChange={() => {
                setPeak(null);
                setNameOnly(null);
              }}
            />
          ) : (
            <PeakSearch
              query={query}
              onQuery={setQuery}
              onPick={(p) => {
                setPeak(p);
                setNameOnly(null);
              }}
              onUseNameOnly={(name) => {
                setNameOnly(name);
                setPeak(null);
              }}
            />
          )}
        </Rise>

        {/* ---- Dates ------------------------------------------------------ */}

        <Rise className="pt-7">
          <SectionLabel>Date window</SectionLabel>
          <div className="mt-3 flex gap-2.5">
            <DateField
              label="First day"
              value={fromKey}
              min={today}
              onChange={(v) => {
                setFromKey(v);
                // Keeps the pair coherent instead of leaving an impossible
                // window on screen for the athlete to untangle.
                if (toKey && v && toKey < v) setToKey(v);
              }}
            />
            <DateField label="Last day" value={toKey} min={fromKey || today} onChange={setToKey} />
          </div>
          {dateProblem && <p className="mt-2 text-[11px] text-danger">{dateProblem}</p>}
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            The window people plan around, not a summit date. Weather moves alpine plans by days.
          </p>
        </Rise>

        {/* ---- Party size ------------------------------------------------- */}

        <Rise className="pt-7">
          <SectionLabel>Party size</SectionLabel>
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            You are the first member. The rest are places, not people.
          </p>

          <p className="section-label mt-4">Smallest party</p>
          <NumberPills
            value={sizeMin}
            onChange={(n) => {
              setSizeMin(n);
              // A minimum above the maximum is not a party, so the maximum
              // follows rather than the form rejecting a reasonable tap.
              if (n > sizeMax) setSizeMax(n);
            }}
          />

          <p className="section-label mt-4">Largest party</p>
          <NumberPills
            value={sizeMax}
            onChange={(n) => {
              setSizeMax(n);
              if (n < sizeMin) setSizeMin(n);
            }}
          />
        </Rise>

        {/* ---- Experience ------------------------------------------------- */}

        <Rise className="pt-7">
          <SectionLabel>Experience</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {EXPERIENCE_OPTIONS.map((id) => (
              <ChoiceTile
                key={id}
                label={EXPERIENCE_LABELS[id]}
                selected={experience === id}
                onSelect={() => setExperience(id)}
              />
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            What you would want of the party, in your own words and on your own scale. ICEFALL does
            not check anyone's ability, and nothing here is a qualification.
          </p>
        </Rise>

        {/* ---- Looking for ------------------------------------------------ */}

        <Rise className="pt-7">
          <SectionLabel>Looking for</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {LOOKING_FOR_OPTIONS.map((id) => {
              const selected = lookingFor.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setLookingFor((current) =>
                      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
                    )
                  }
                  className={cn(
                    "rounded-full border px-3.5 py-2 text-[12px] transition-colors",
                    selected
                      ? "border-azure/55 bg-azure/[0.12] text-azure"
                      : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
                  )}
                >
                  {LOOKING_FOR_LABELS[id]}
                </button>
              );
            })}
          </div>
        </Rise>

        {/* ---- Description ------------------------------------------------ */}

        <Rise className="pt-7">
          <SectionLabel>Description</SectionLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="The route you have in mind, how you plan to acclimatise, what you expect of the party…"
            className="mt-3 w-full resize-none rounded-card border border-hairline bg-graphite p-4 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            Never put a phone number, an email address or where you live in here. Nothing is sent
            anywhere today, but this text is what travels when you share the expedition.
          </p>
        </Rise>

        {/* ---- Privacy ---------------------------------------------------- */}

        <Rise className="pt-7">
          <SectionLabel>Privacy</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {PRIVACY_OPTIONS.map((o) => (
              <ChoiceTile
                key={o.id}
                label={o.label}
                note={o.note}
                selected={privacy === o.id}
                onSelect={() => setPrivacy(o.id)}
              />
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
            Both describe your intention rather than something ICEFALL enforces. With no server
            there is nothing to enforce it against, and nobody who could see the expedition either
            way — it is stored on this device.
          </p>
        </Rise>

        {/* ---- Create ----------------------------------------------------- */}

        <Rise className="pt-8">
          <Button size="lg" className="w-full" disabled={!canCreate} onClick={create}>
            <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
            Create expedition
          </Button>
          {!canCreate && (
            <p className="mt-2.5 text-center text-[11px] leading-relaxed text-mist-dim">
              {!peakName
                ? "Choose the mountain first — everything else is derived from it."
                : dateProblem !== null
                  ? dateProblem
                  : "Set both ends of the date window."}
            </p>
          )}
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Peak search                                                                 */
/* -------------------------------------------------------------------------- */

function PeakSearch({
  query,
  onQuery,
  onPick,
  onUseNameOnly,
}: {
  query: string;
  onQuery: (q: string) => void;
  onPick: (p: Peak) => void;
  onUseNameOnly: (name: string) => void;
}) {
  const [results, setResults] = useState<Peak[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    // Debounced: the geocoder behind searchPeaks allows roughly one request a
    // second, and typing "matterhorn" would otherwise fire ten.
    const timer = setTimeout(() => {
      searchPeaks(q, ctrl.signal)
        .then((r) => {
          rememberPeaks(r);
          setResults(r.slice(0, 8));
          setSearched(true);
        })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 550);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
      setSearching(false);
    };
  }, [query]);

  return (
    <div className="mt-3">
      <label className="relative block">
        <span className="sr-only">Search for a mountain</span>
        <Search
          size={16}
          strokeWidth={1.6}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim"
        />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search any peak on earth"
          spellCheck={false}
          className="h-12 w-full rounded-tile border border-hairline bg-elevated/40 pl-10 pr-10 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        />
        {searching && (
          <Loader2
            size={16}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-mist-dim"
            aria-hidden="true"
          />
        )}
        {!searching && query.length > 0 && (
          <button
            type="button"
            onClick={() => onQuery("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        )}
      </label>

      {results.length > 0 && (
        <ul className="mt-2.5 space-y-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="w-full rounded-tile border border-hairline p-3 text-left transition-colors hover:border-azure/50"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-mist">
                    <MountainIcon size={15} strokeWidth={1.4} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-snow">{p.name}</p>
                    <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                      {fmtElevation(p.elevationM)} m{p.country ? ` · ${p.country}` : ""}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !searching && results.length === 0 && (
        <div className="mt-3">
          <p className="text-[11px] leading-relaxed text-mist-dim">
            Nothing found. Search runs against OpenStreetMap and needs a connection; peaks without a
            recorded elevation are left out, because elevation is what every assessment is derived
            from.
          </p>
          {/* An unresolved peak may still be used — under its name alone. The
              expedition then carries no elevation and says so wherever it
              appears, which is honest; a typed-in figure would not be. */}
          <button
            type="button"
            onClick={() => onUseNameOnly(query.trim())}
            className="mt-2.5 text-[12px] text-azure transition-colors hover:text-azure-bright"
          >
            Use the name “{query.trim()}” without an elevation
          </button>
        </div>
      )}

      <p className="mt-3 text-[10px] text-mist-dim">{PEAK_ATTRIBUTION}</p>
    </div>
  );
}

function ChosenPeak({
  name,
  elevationM,
  country,
  onChange,
}: {
  name: string;
  elevationM?: number;
  country?: string;
  onChange: () => void;
}) {
  return (
    <Card className="mt-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-tile border border-hairline bg-white/[0.02] text-azure">
          <MountainIcon size={16} strokeWidth={1.4} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-snow">{name}</p>
          <p className="tnum mt-0.5 text-[11px] text-mist-dim">
            {typeof elevationM === "number"
              ? `${fmtElevation(elevationM)} m${country ? ` · ${country}` : ""} · OpenStreetMap`
              : "Elevation not recorded — ICEFALL will not guess one"}
          </p>
        </div>
        <button
          type="button"
          onClick={onChange}
          className="section-label shrink-0 text-mist-dim transition-colors hover:text-snow"
        >
          Change
        </button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Small controls                                                              */
/* -------------------------------------------------------------------------- */

function DateField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="min-w-0 flex-1">
      <span className="section-label">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        // The native picker follows the page, not the system, without this.
        style={{ colorScheme: "dark" }}
        className="tnum mt-2 h-11 w-full rounded-tile border border-hairline bg-elevated/40 px-3 text-[13px] text-snow outline-none transition-colors focus:border-azure/50"
      />
    </label>
  );
}

function NumberPills({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {SIZE_OPTIONS.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "tnum h-10 w-10 rounded-full border text-[13px] transition-colors",
            value === n
              ? "border-azure/55 bg-azure/[0.12] text-azure"
              : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function ChoiceTile({
  label,
  note,
  selected,
  onSelect,
}: {
  label: string;
  note?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-tile border p-3 text-left transition-colors",
        selected ? "border-azure/50 bg-azure/[0.06]" : "border-hairline hover:border-hairline-strong",
      )}
    >
      <span className="flex items-center gap-2">
        <span className={cn("text-[13px]", selected ? "text-snow" : "text-mist")}>{label}</span>
        {selected && <Check size={13} strokeWidth={2.2} className="text-azure" aria-hidden="true" />}
      </span>
      {note && <span className="mt-1 block text-[11px] leading-tight text-mist-dim">{note}</span>}
    </button>
  );
}
