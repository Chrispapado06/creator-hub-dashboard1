import { useEffect, useMemo, useState } from "react";
import { peakImage } from "./peakPlate";
import { Link } from "react-router-dom";
import {
  Bookmark, CalendarDays, ChevronRight, Compass, Globe, MapPin, Mountain, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_NOTICE, EXPEDITIONS, IS_DEMO, monogram } from "@/data/demo";
import { formatEur } from "@/money/model";
import { useAuth } from "@/lib/auth";
import { DEPARTURE } from "./trip";
import { THREADS, UNREAD_TOTAL } from "./Messages";

/**
 * The signed-in home page.
 *
 * ── EVERY FIGURE HERE IS INVENTED ───────────────────────────────────────────
 *
 * The preparation percentage, the countdown, the "expeditions completed" row,
 * the suggestions and the conversations are all demo content, gated on
 * `IS_DEMO` — which is `import.meta.env.DEV`, so a production build of this
 * page has nothing in it. That gate is deliberately harder than a flag: the
 * whole dashboard is a design under review, not a product with data behind it.
 *
 * ── WHY THERE IS NO "START ACTIVITY" ────────────────────────────────────────
 *
 * Recording a climb needs the sensors in your pocket. A button here would
 * either do nothing or invite someone to log a session from a desk, and a
 * training record is only worth anything if everything in it happened.
 *
 * ── WHY THE HONESTY LIVES DOWN HERE AND NOT ON SCREEN ───────────────────────
 *
 * This page used to carry five grey paragraphs apologising for what ICEFALL
 * cannot do yet, and the apologies pushed the actual content below the fold.
 * The constraints have not changed — only where they are written. In the UI
 * they are now labels ("Not measured", "None yet", "—", "Not sponsored"); the
 * reasoning is kept here and at each site:
 *
 *   • Preparation shows no bar because preparation is computed from training
 *     sessions the athlete recorded, and the web app records none. A filled
 *     bar would be a number invented about somebody's readiness for an
 *     8,000 m mountain.
 *   • The record row is all em-dashes because it counts real bookings, real
 *     conversations and summits logged in the phone app. Nothing has happened,
 *     so nothing is claimed.
 *   • "Suggested" is ordered by fit with the stated objective. There are no
 *     commercial relationships, so no placement here was ever sold.
 *   • DEMO_NOTICE appears exactly once, at the foot. That is the whole budget
 *     for explaining the demo — do not add a second paragraph anywhere.
 */



interface Remaining {
  days: number;
  hours: number;
  mins: number;
  secs: number;
}

function remaining(target: Date, now: Date): Remaining | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

const JOURNEY = IS_DEMO
  ? [
      { id: "j1", name: "K2 Base Camp Trek", days: 14, grade: "Moderate", pct: 26, peak: "everest" },
      { id: "j2", name: "Ama Dablam Expedition", days: 18, grade: "Challenging", pct: 40, peak: "matterhorn" },
      { id: "j3", name: "Manaslu Circuit Trek", days: 16, grade: "Moderate", pct: 12, peak: "eiger" },
    ]
  : [];

/**
 * The inbox preview reads the real inbox — see the note above `THREADS` in
 * `Messages.tsx`.
 *
 * This card used to hold its own four conversations, which is how the same
 * inbox came to report 8 unread here, 12 on Messages and 2 on Notifications.
 * It also typed its correspondents in as free strings, and one of them was
 * "Alpine Ascents" — a real US operator with no `Company` record behind it, so
 * the real-business guard could not see it to attach a disclosure. Both
 * problems had the same cause: a second copy of data that already existed.
 */
const CONVERSATIONS = THREADS.slice(0, 4).map((t) => {
  const last = t.lines[t.lines.length - 1];
  return { id: t.id, who: t.name, last: last?.body ?? "", when: last?.day ?? "", unread: t.unread };
});

const UNREAD = UNREAD_TOTAL;

export default function AppHome() {
  const { session } = useAuth();
  const first = (session?.name ?? "there").split(" ")[0];

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const left = useMemo(() => remaining(DEPARTURE, now), [now]);

  // The trips-in-planning list and the message list are both "what you have in
  // flight", and stacked they cost a second screenful of scroll. A segmented
  // control puts them in the same slot so the page stays scannable.
  const [panel, setPanel] = useState<"journey" | "messages">("journey");

  const next = EXPEDITIONS[0];
  const suggested = EXPEDITIONS.slice(1, 5);

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Welcome back, {first}</h1>
      <p className="mt-1.5 text-[13px] text-mist">The mountains are calling. Where will you go next?</p>

      {/*
        Production build: no accounts, no bookings, no messages — so there is
        nothing to count down to and nobody to have written. One line, not the
        old paragraph; the "why" belongs in this comment.
      */}
      {!IS_DEMO && (
        <div className="mt-6 rounded-card border border-hairline bg-graphite p-8 text-center">
          <p className="text-[13.5px] text-snow">Nothing here yet</p>
          <p className="mt-1.5 text-[11.5px] text-mist-dim">Needs an account</p>
        </div>
      )}

      {IS_DEMO && next !== undefined && (
        <>
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* ---- Your next adventure ---------------------------------- */}
            <section className="relative overflow-hidden rounded-card border border-hairline">
              <img
                src={peakImage(next.heroPeak)}
                alt=""
                aria-hidden
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/25" />
              <div className="relative p-7">
                <p className="section-label text-azure/80">Your next adventure</p>
                <h2 className="mt-2.5 text-[27px] font-light tracking-[-0.02em] text-snow">
                  {next.objective}
                </h2>
                <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-mist">
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} strokeWidth={1.8} className="text-azure" />
                    {next.country}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={13} strokeWidth={1.8} className="text-azure" />
                    {next.months}
                  </span>
                  <span className="tnum flex items-center gap-1.5">
                    <Mountain size={13} strokeWidth={1.8} className="text-azure" />
                    {next.durationDays} days
                  </span>
                </div>

                {/*
                  An empty bar, on purpose. The design shows "65%", and there is
                  nothing on this device to compute it from — preparation comes
                  from training the athlete recorded, and the web app
                  deliberately records none. A filled bar would be a number
                  invented about somebody's readiness for an 8,000 m mountain.
                  The old caption explaining that is gone; the label carries it.
                */}
                <div className="mt-6 max-w-[420px]">
                  <div className="flex items-baseline justify-between text-[11.5px]">
                    <span className="text-mist">Preparation</span>
                    <span className="text-mist-dim">Not measured</span>
                  </div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full w-0 rounded-full bg-azure" />
                  </div>
                </div>

                <Link
                  to="/app/explore"
                  className="mt-6 inline-flex items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure transition-colors hover:bg-azure/10"
                >
                  View expedition
                  <ChevronRight size={14} strokeWidth={1.9} />
                </Link>
              </div>
            </section>

            {/* ---- Upcoming --------------------------------------------- */}
            <aside className="rounded-card border border-hairline bg-graphite p-5">
              <div className="flex items-baseline justify-between">
                <p className="section-label">Upcoming expedition</p>
                <Link to="/app/bookings" className="text-[11.5px] text-azure hover:text-azure-bright">
                  View all
                </Link>
              </div>

              <div className="mt-4 flex gap-3.5">
                <span className="h-[68px] w-[68px] shrink-0 overflow-hidden rounded-tile border border-hairline">
                  <img src={peakImage(next.heroPeak)} alt="" aria-hidden className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-snow">{next.objective}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{next.company}</span>
                  <span className="mt-1.5 block text-[11px] text-mist">{next.months} · {next.country}</span>
                </span>
              </div>

              {left !== null && (
                <div className="mt-5 grid grid-cols-4 gap-1 rounded-tile border border-hairline bg-obsidian/60 py-3.5">
                  {[
                    [left.days, "Days"],
                    [left.hours, "Hrs"],
                    [left.mins, "Mins"],
                    [String(left.secs).padStart(2, "0"), "Secs"],
                  ].map(([v, l]) => (
                    <div key={String(l)} className="text-center">
                      <p className="tnum text-[19px] font-light leading-none text-azure">{v}</p>
                      <p className="section-label mt-1.5">{l}</p>
                    </div>
                  ))}
                </div>
              )}

              <Link
                to="/app/bookings"
                className="mt-4 block rounded-tile bg-azure py-2.5 text-center text-[12.5px] font-medium text-obsidian transition-colors hover:bg-azure-bright"
              >
                View itinerary
              </Link>
            </aside>
          </div>

          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              {/* ---- Journey / Messages, one slot --------------------- */}
              <div className="flex items-center justify-between gap-4">
                <div className="inline-flex shrink-0 rounded-pill border border-hairline bg-graphite p-[3px]">
                  {(
                    [
                      ["journey", "Journey"],
                      ["messages", "Messages"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPanel(id)}
                      aria-pressed={panel === id}
                      className={cn(
                        "flex items-center gap-1.5 rounded-pill px-4 py-1.5 text-[12px] transition-colors",
                        panel === id ? "bg-elevated text-snow" : "text-mist hover:text-snow",
                      )}
                    >
                      {label}
                      {id === "messages" && UNREAD > 0 && (
                        <span className="tnum grid h-[16px] min-w-[16px] place-items-center rounded-full bg-azure px-1 text-[9.5px] font-medium text-obsidian">
                          {UNREAD}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <Link
                  to={panel === "journey" ? "/app/saved" : "/app/messages"}
                  className="text-[11.5px] text-azure hover:text-azure-bright"
                >
                  See all
                </Link>
              </div>

              <div className={cn("mt-4 grid gap-4 sm:grid-cols-3", panel !== "journey" && "hidden")}>
                {JOURNEY.map((j) => (
                  <article
                    key={j.id}
                    className="overflow-hidden rounded-card border border-hairline bg-graphite"
                  >
                    <div className="relative aspect-[16/9]">
                      <img src={peakImage(j.peak)} alt="" aria-hidden className="h-full w-full object-cover" />
                      <Bookmark
                        size={15}
                        strokeWidth={1.8}
                        aria-hidden
                        className="absolute right-3 top-3 text-snow/80"
                      />
                    </div>
                    <div className="p-3.5">
                      <p className="truncate text-[13.5px] text-snow">{j.name}</p>
                      <p className="tnum mt-1 text-[11.5px] text-mist-dim">
                        {j.days} days · {j.grade}
                      </p>
                      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-azure" style={{ width: `${j.pct}%` }} />
                      </div>
                      <p className="tnum mt-1.5 text-[10.5px] text-mist-dim">{j.pct}% planned</p>
                    </div>
                  </article>
                ))}
              </div>

              {/* ---- Conversations ------------------------------------- */}
              <div
                className={cn(
                  "mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4",
                  panel !== "messages" && "hidden",
                )}
              >
                {CONVERSATIONS.map((c) => (
                  <Link
                    key={c.id}
                    to="/app/messages"
                    className="rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-[10px] text-mist">
                        {monogram(c.who)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-snow">{c.who}</span>
                      {c.unread > 0 && (
                        <span className="tnum grid h-[17px] min-w-[17px] shrink-0 place-items-center rounded-full bg-azure px-1 text-[9.5px] font-medium text-obsidian">
                          {c.unread}
                        </span>
                      )}
                    </div>
                    <p className="clamp-2 mt-2.5 text-[11.5px] leading-snug text-mist">{c.last}</p>
                    <p className="tnum mt-2 text-[10px] text-mist-dim">{c.when}</p>
                  </Link>
                ))}
              </div>

              {/*
                Every figure is an em-dash. These count real bookings, real
                conversations and summits logged in the phone app — none of
                which exist. "None yet" is the whole explanation on screen;
                ICEFALL will not print a number nobody earned.
              */}
              <div className="mt-5 rounded-card border border-hairline bg-graphite p-5">
                <div className="flex items-baseline justify-between">
                  <p className="section-label">Your record</p>
                  <span className="text-[10.5px] text-mist-dim">None yet</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Figure icon={Mountain} value="—" label="Expeditions completed" />
                  <Figure icon={Compass} value="—" label="Mountains viewed" />
                  <Figure icon={Users} value="—" label="Guides connected" />
                  <Figure icon={Globe} value="—" label="Countries explored" />
                </div>
              </div>
            </div>

            {/* ---- Suggested ------------------------------------------- */}
            {/*
              Ordering is fit with the stated objective, nothing else. There are
              no commercial relationships, so no slot here was ever sold — the
              "Not sponsored" chip says that in two words instead of a caption.
            */}
            <aside className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-[15px] text-snow">Suggested for you</h2>
                  <span className="section-label rounded-pill border border-hairline px-2 py-0.5 text-mist-dim">
                    Not sponsored
                  </span>
                </div>
                <Link to="/app/explore" className="shrink-0 text-[11.5px] text-azure hover:text-azure-bright">
                  View all
                </Link>
              </div>
              <div className="mt-3 divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-graphite">
                {suggested.map((e) => (
                  <Link
                    key={e.id}
                    to="/app/explore"
                    className="flex items-start gap-3 p-3.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <span className="h-11 w-11 shrink-0 overflow-hidden rounded-tile border border-hairline">
                      <img src={peakImage(e.heroPeak)} alt="" aria-hidden className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-snow">{e.objective}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-mist-dim">{e.company}</span>
                      <span className="tnum mt-1 block text-[11px] text-mist-dim">
                        {e.durationDays} days · {e.country}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[10px] text-mist-dim">From</span>
                      <span className="tnum block text-[12px] text-snow">
                        {formatEur(e.fromEur)}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </aside>
          </div>

          <p className="mt-8 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
            {DEMO_NOTICE}
          </p>
        </>
      )}
    </div>
  );
}

function Figure({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Mountain;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={20} strokeWidth={1.5} className="shrink-0 text-azure/70" />
      <div className="min-w-0">
        <p className="tnum text-[19px] font-light leading-none text-snow">{value}</p>
        <p className="mt-1.5 truncate text-[10.5px] text-mist-dim">{label}</p>
      </div>
    </div>
  );
}
