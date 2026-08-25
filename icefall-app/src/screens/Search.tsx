import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Backpack, ChevronRight, CloudSun, Compass, Flag, Gauge, Heart, MessageCircle, Mountain,
  Salad, Search as SearchIcon, Settings as SettingsIcon, ShoppingBag, Target, Users,
} from "lucide-react";
import { Rise, Stagger } from "@/components/layout/chrome";
import { SectionLabel } from "@/components/ui/primitives";
import { fmtDistance, fmtElevation } from "@/lib/format";
import { loadPeakCatalogue, type Peak } from "@/services/peaks";
import { useActivityFeed } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * Global search — one door to everything.
 *
 * The app is 78 routes deep and ships a catalogue of thousands of peaks, but
 * every search box in it used to be local to one screen: you could only find a
 * mountain if you were already standing in the mountain library. This searches
 * across four things at once — the places in the app, your objectives, your
 * recorded activities, and the peak catalogue — so "toubkal" or "kit" gets you
 * there from anywhere.
 *
 * The peak catalogue is precached by the service worker, so this keeps working
 * with no signal.
 */

interface Place {
  label: string;
  detail: string;
  to: string;
  icon: typeof Compass;
  /** Extra words that should match this destination but aren't in its label. */
  keywords?: string;
}

/** Every destination worth reaching directly, named the way a person says it. */
const PLACES: Place[] = [
  { label: "Today's session", detail: "Coach · your plan for today", to: "/coach/today", icon: Target, keywords: "workout training plan session" },
  { label: "Ask the coach", detail: "Coach · chat", to: "/coach", icon: MessageCircle, keywords: "chat ask question advice" },
  { label: "Training plan", detail: "Coach · the full build", to: "/coach/plan", icon: Target, keywords: "weeks schedule programme" },
  { label: "Progress", detail: "Coach · how the build is going", to: "/coach/progress", icon: Gauge, keywords: "trend load" },
  { label: "Readiness", detail: "Coach · today's read, and why", to: "/coach/readiness", icon: Gauge, keywords: "score analysis" },
  { label: "Daily check-in", detail: "Coach · sleep, soreness, stress", to: "/coach/check-in", icon: Heart, keywords: "recovery wellness" },
  { label: "Recovery", detail: "Coach · what your body is saying", to: "/coach/recovery", icon: Heart, keywords: "rest fatigue" },
  { label: "Nutrition", detail: "Coach · fuelling for the session", to: "/coach/nutrition", icon: Salad, keywords: "food eat carbs hydration" },
  { label: "Activity history", detail: "Everything you've recorded", to: "/activity", icon: Mountain, keywords: "past runs hikes log" },
  { label: "Start an activity", detail: "Record a new one", to: "/activity/select", icon: Mountain, keywords: "track record gps" },
  { label: "Objectives", detail: "The mountains you're training for", to: "/goals", icon: Flag, keywords: "goals summit target" },
  { label: "Mountain library", detail: "Every peak ICEFALL holds", to: "/explore/mountains", icon: Compass, keywords: "peaks explore browse search" },
  { label: "Gear", detail: "The system for your objective", to: "/gear", icon: ShoppingBag, keywords: "kit equipment boots" },
  { label: "Health", detail: "What ICEFALL reads, and from where", to: "/health", icon: Heart, keywords: "sensors heart rate" },
  { label: "Expedition network", detail: "People and groups", to: "/explore/people", icon: Users, keywords: "partners climbers friends" },
  { label: "Settings", detail: "Units, notifications, privacy", to: "/settings", icon: SettingsIcon, keywords: "preferences account privacy" },
  { label: "Plans & pricing", detail: "What each plan includes", to: "/pricing", icon: Target, keywords: "subscription upgrade pro billing" },
];

/** Destinations that only exist once there is an objective to hang them on. */
function objectivePlaces(goalId: string, goalName: string): Place[] {
  return [
    { label: `${goalName} — command centre`, detail: "Everything held on this objective", to: `/mountain/${goalId}`, icon: Compass, keywords: "mountain intelligence overview" },
    { label: `${goalName} — conditions`, detail: "Forecast by elevation band", to: `/mountain/${goalId}/conditions`, icon: CloudSun, keywords: "weather forecast wind snow temperature" },
    { label: `${goalName} — kit & documents`, detail: "What this peak demands", to: `/mountain/${goalId}/checklist`, icon: Backpack, keywords: "checklist equipment permits insurance packing" },
    { label: `${goalName} — benchmark`, detail: "Your record against it", to: `/mountain/${goalId}/benchmark`, icon: Gauge, keywords: "compare readiness gap" },
  ];
}

export default function Search() {
  const navigate = useNavigate();
  const { goals } = useApp();
  const feed = useActivityFeed();
  const [q, setQ] = useState("");
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    void loadPeakCatalogue().then(setPeaks);
  }, []);

  const query = q.trim().toLowerCase();

  const places = useMemo(() => {
    const active = goals.filter((g) => g.status === "active");
    const all = [...PLACES, ...active.flatMap((g) => objectivePlaces(g.id, g.name))];
    if (!query) return [];
    return all
      .filter((p) => `${p.label} ${p.detail} ${p.keywords ?? ""}`.toLowerCase().includes(query))
      .slice(0, 6);
  }, [query, goals]);

  const objectives = useMemo(() => {
    if (!query) return [];
    return goals.filter((g) => g.name.toLowerCase().includes(query)).slice(0, 4);
  }, [query, goals]);

  const activities = useMemo(() => {
    if (!query) return [];
    return feed
      .filter((a) => `${a.title} ${a.location ?? ""}`.toLowerCase().includes(query))
      .slice(0, 4);
  }, [query, feed]);

  const peakHits = useMemo(() => {
    if (query.length < 2) return [];
    const starts: Peak[] = [];
    const contains: Peak[] = [];
    for (const p of peaks) {
      const n = p.name.toLowerCase();
      if (n.startsWith(query)) starts.push(p);
      else if (n.includes(query)) contains.push(p);
      if (starts.length >= 8) break;
    }
    // Highest first within each band — a bigger mountain is the likelier target.
    const by = (a: Peak, b: Peak) => b.elevationM - a.elevationM;
    return [...starts.sort(by), ...contains.sort(by)].slice(0, 8);
  }, [query, peaks]);

  const empty =
    query.length > 0 &&
    places.length === 0 &&
    objectives.length === 0 &&
    activities.length === 0 &&
    peakHits.length === 0;

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      {/* Search bar */}
      <div
        className="sticky top-0 z-10 border-b border-hairline bg-obsidian/95 px-5 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
      >
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </button>
          <label className="flex flex-1 items-center gap-2.5 rounded-tile border border-hairline bg-elevated/40 px-3.5">
            <SearchIcon size={16} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search mountains, sessions, anything"
              aria-label="Search ICEFALL"
              className="h-11 w-full bg-transparent text-[14px] text-snow outline-none placeholder:text-mist-dim"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Clear"
                className="shrink-0 text-[12px] text-mist-dim hover:text-snow"
              >
                Clear
              </button>
            )}
          </label>
        </div>
      </div>

      <Stagger className="px-5 pb-10">
        {!query && (
          <Rise className="pt-6">
            <SectionLabel>Jump to</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {PLACES.slice(0, 6).map((p) => (
                <Row key={p.to} to={p.to} icon={p.icon} title={p.label} detail={p.detail} />
              ))}
            </div>
            <p className="mt-4 text-[11.5px] leading-relaxed text-mist-dim">
              Searches the whole app — every screen, your objectives, everything you have
              recorded, and {peaks.length ? peaks.length.toLocaleString("en-GB") : "thousands of"}{" "}
              peaks. The peak catalogue works offline.
            </p>
          </Rise>
        )}

        {places.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>In the app</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {places.map((p) => (
                <Row key={p.to} to={p.to} icon={p.icon} title={p.label} detail={p.detail} />
              ))}
            </div>
          </Rise>
        )}

        {objectives.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Your objectives</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {objectives.map((g) => (
                <Row
                  key={g.id}
                  to={`/mountain/${g.id}`}
                  icon={Flag}
                  title={g.name}
                  detail={g.elevationM ? `${fmtElevation(g.elevationM)} m · your objective` : "Your objective"}
                />
              ))}
            </div>
          </Rise>
        )}

        {activities.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Your activities</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {activities.map((a) => (
                <Row
                  key={a.id}
                  to={`/activity/${a.id}`}
                  icon={Mountain}
                  title={a.title}
                  detail={`${fmtDistance(a.distanceKm)} km · ${fmtElevation(a.elevationGainM)} m${a.location ? ` · ${a.location}` : ""}`}
                />
              ))}
            </div>
          </Rise>
        )}

        {peakHits.length > 0 && (
          <Rise className="pt-6">
            <SectionLabel>Peaks</SectionLabel>
            <div className="mt-3 divide-y divide-hairline border-y border-hairline">
              {peakHits.map((p) => (
                <Row
                  key={p.id}
                  to={
                    p.curatedId
                      ? `/explore/mountain/${p.curatedId}`
                      : `/explore/peak/${encodeURIComponent(p.id)}`
                  }
                  icon={Mountain}
                  title={p.name}
                  detail={`${fmtElevation(p.elevationM)} m${p.country ? ` · ${p.country}` : ""}`}
                />
              ))}
            </div>
          </Rise>
        )}

        {empty && (
          <Rise className="pt-16">
            <p className="text-center text-[13px] text-mist">Nothing matches "{q}".</p>
            <p className="mt-1.5 text-center text-[11.5px] text-mist-dim">
              Try a mountain name, or a word like "kit", "recovery" or "settings".
            </p>
          </Rise>
        )}
      </Stagger>
    </div>
  );
}

function Row({
  to,
  icon: Icon,
  title,
  detail,
}: {
  to: string;
  icon: typeof Compass;
  title: string;
  detail: string;
}) {
  return (
    <Link to={to} className={cn("flex items-center gap-3.5 py-3")}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline text-azure/85">
        <Icon size={16} strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] text-snow">{title}</span>
        <span className="mt-0.5 block truncate tnum text-[11.5px] text-mist-dim">{detail}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-mist-dim" />
    </Link>
  );
}
