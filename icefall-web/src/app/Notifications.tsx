import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, Ban, BellOff, CalendarClock, CloudSun, Compass, EyeOff,
  FileClock, Inbox, Mail, MessageSquare, Phone, RotateCcw, X,
} from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { DEMO_NOTICE, EXPEDITIONS, IS_DEMO, type Expedition } from "@/data/demo";
import { cn } from "@/lib/utils";
import { DEPARTURE_ISO as SHARED_DEPARTURE_ISO } from "./trip";
import { UNREAD_TOTAL } from "./Messages";

/**
 * Notifications — what needs you today.
 *
 * ── THE WORD "NOTIFICATION" IS THE PROBLEM ──────────────────────────────────
 *
 * A page with this title claims something ICEFALL cannot do: that it watched
 * for you while you were away and will tell you when something changes. There
 * is no server, so nothing was watched and nothing can be sent — every line
 * below is worked out in this browser at the moment the page opens, from data
 * the app already had. That is a summary you came and read, not an alert that
 * found you, and a climber who believes ICEFALL will warn them about a moved
 * departure will stop checking the email that actually carries it. It will not
 * ring a phone, land in an inbox or buzz a watch, and it will certainly not
 * reach anyone on the mountain. Leave the road assuming this page is not there.
 *
 * That whole paragraph used to be on screen, twice over, in a banner above the
 * fold. It is now ONE line at the top — "Nothing is pushed to you. No server,
 * no inbox, no alerts." — which is the only budget this page spends on
 * explaining itself, apart from DEMO_NOTICE at the foot. Everything a reader
 * cannot act on today lives in comments like this one instead.
 *
 * ── WHAT IS DELIBERATELY MISSING ────────────────────────────────────────────
 *
 * No profile views, no streaks, no "you have not opened ICEFALL in five days",
 * no other climbers' activity. Those are written to bring someone back, not to
 * tell them anything, and mixing them into a list that also holds a departure
 * date trains the reader to skim past the departure date. The test each notice
 * has to pass is whether a climber could act on it today. The "Never shown" tab
 * names the exclusions out loud — as four short labels, not as an essay — so the
 * absence reads as a decision rather than an unfinished feature.
 *
 * ── LAYOUT ──────────────────────────────────────────────────────────────────
 *
 * A segmented control rather than one long column with an explanatory rail: the
 * notices are two-up and above the fold, and the two editorial panels (what is
 * never shown, how you would really be told) are one click away instead of
 * competing with the departure date for the same screenful.
 */

/**
 * The demo booking's first day — the same constant Bookings.tsx counts from.
 *
 * Two pages disagreeing about when the same trip leaves is the sort of small
 * inconsistency that makes everything around it look invented, so if this moves
 * there it moves here.
 */
const DEPARTURE_ISO = SHARED_DEPARTURE_ISO;

/**
 * Invented, like the rest of the demo — but invented in ONE place.
 *
 * This was a bare `const UNREAD = 2`, derived from nothing. Home said 8 and
 * Messages said 12, about the same inbox. See the note above `THREADS` in
 * `Messages.tsx`.
 */
const UNREAD = UNREAD_TOTAL;

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MS = 86_400_000;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Whole calendar days between today and a departure.
 *
 * `now` is local and the departure is a calendar day, so today is projected onto
 * the same UTC midnight grid before subtracting. Comparing the two directly
 * reads a day short for any browser west of Greenwich, and a countdown that is
 * wrong by a day is worse than no countdown.
 */
function daysUntil(iso: string, now: Date): number {
  const target = Date.parse(`${iso}T00:00:00Z`);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / DAY_MS);
}

/**
 * `verifiedOn` is a display string ("2 Mar 2026") because printing it is all any
 * card has needed. Parsing it here beats adding a second date field to the demo
 * data that could drift away from the one every card already shows.
 */
function monthsSinceVerified(verifiedOn: string, now: Date): number | null {
  const parts = verifiedOn.trim().split(/\s+/);
  if (parts.length !== 3) return null;
  const day = Number(parts[0]);
  const month = MONTH_ABBR.indexOf(parts[1].slice(0, 3));
  const year = Number(parts[2]);
  if (!Number.isFinite(day) || !Number.isFinite(year) || month < 0) return null;

  let months = (now.getFullYear() - year) * 12 + (now.getMonth() - month);
  if (now.getDate() < day) months -= 1;
  return Math.max(0, months);
}

function departureLine(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days out`;
}

interface Notice {
  id: string;
  icon: typeof MessageSquare;
  title: string;
  /**
   * The computed fact that put this on the list — never a fabricated "2 hours
   * ago". Nothing arrived, so nothing has an arrival time.
   */
  meta: string;
  /** One line, fifteen words at the outside. What to do, not why we cannot. */
  detail: string;
  /** Scannable chips: numbers and dates the reader may want without reading. */
  facts?: string[];
  to: string;
  action: string;
}

/**
 * Ordered by what is waiting on you, not by recency. Recency ordering is for
 * feeds, where the newest thing is assumed to matter most; here the newest thing
 * is nothing, and a person waiting on a reply outranks a plan that has waited
 * six months already.
 */
function buildNotices(openedAt: Date): Notice[] {
  // Empty in a production build — `EXPEDITIONS` is itself gated on IS_DEMO.
  const expedition: Expedition | undefined = EXPEDITIONS[0];
  if (expedition === undefined) return [];

  const notices: Notice[] = [];

  // The thread is demo data — nobody has ever written to ICEFALL and nothing
  // typed into it leaves the browser. Said once, at the foot, by DEMO_NOTICE.
  notices.push({
    id: "messages",
    icon: MessageSquare,
    title: `${expedition.company} answered you`,
    meta: `${UNREAD} unread`,
    detail: "The kit list, and how the acclimatisation rotations are paced.",
    to: "/app/messages",
    action: "Open the thread",
  });

  // A departure that has already left is not something you can act on today, so
  // it drops off the list rather than lingering as a countdown running backwards.
  const daysOut = daysUntil(DEPARTURE_ISO, openedAt);
  if (daysOut >= 0) {
    notices.push({
      id: "departure",
      icon: CalendarClock,
      title: `${expedition.objective} departs`,
      meta: departureLine(daysOut),
      // The slowest parts of an expedition have no mountain in them: the permit,
      // insurance written to cover the altitude, and vaccinations that need a
      // course rather than an appointment. That is the actionable half.
      detail: "Permit, insurance and vaccinations take longest to arrange.",
      facts: [expedition.months, `${expedition.durationDays} days door to door`],
      to: "/app/bookings",
      action: "Open the booking",
    });
  }

  const age = monthsSinceVerified(expedition.verifiedOn, openedAt);
  if (age !== null) {
    // Somebody at ICEFALL read this company's paperwork on that date and has not
    // looked since. Nothing re-checks itself, and a licence or an insurance
    // certificate can lapse in the months between. The tick beside their name
    // never meant more than "read, on that date".
    notices.push({
      id: "documents",
      icon: FileClock,
      title: `${expedition.company}'s documents are ${plural(age, "month")} old`,
      meta: expedition.verifiedOn,
      detail: "Ask for current documents before a deposit leaves your account.",
      to: "/app/bookings",
      action: "See what was checked",
    });
  }

  // No activity of yours has been recorded and no climbing history is held, so
  // any readiness figure would be invented. The chip says "Not measured" and the
  // meta is an em-dash — never a number.
  notices.push({
    id: "plan",
    icon: Compass,
    title: "No training plan for this objective",
    meta: "—",
    detail: "A plan starts from what you tell the coach.",
    facts: ["Readiness — not measured"],
    to: "/app/coach",
    action: "Open Coach",
  });

  return notices;
}

type Tab = "waiting" | "never" | "channels";

export default function Notifications() {
  // Fixed at mount, so the timestamp printed in the header is the moment the
  // page opened rather than the moment of the last re-render. The claim on
  // screen has to be literally true.
  const [openedAt] = useState(() => new Date());
  const notices = useMemo(() => buildNotices(openedAt), [openedAt]);

  const [tab, setTab] = useState<Tab>("waiting");
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const visible = notices.filter((n) => !dismissed.has(n.id));
  const cleared = notices.length > 0 && visible.length === 0;

  // Dismissing edits this tab and nothing else: there is no read state to store
  // and nowhere to store it, so a reload works the whole list out again.
  const dismiss = (id: string) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Notifications</h1>
          <p className="mt-1.5 text-[13px] text-mist">What needs you today.</p>
        </div>
        <span className="tnum text-[11.5px] text-mist-dim">
          Worked out {STAMP.format(openedAt)}
        </span>
      </div>

      {/*
        The one explanatory block this page is allowed, besides DEMO_NOTICE at the
        foot. It stays in every state, demo or production, because it is a fact
        about ICEFALL rather than a detail of a notice.
      */}
      <p className="mt-5 flex items-start gap-2.5 rounded-tile border border-azure/25 bg-azure/[0.05] px-4 py-3 text-[12.5px] leading-relaxed text-mist">
        <BellOff size={15} strokeWidth={1.7} aria-hidden className="mt-[3px] shrink-0 text-azure" />
        <span>Nothing is pushed to you. No server, no inbox, no alerts.</span>
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <Segmented
          tab={tab}
          onChange={setTab}
          counts={{ waiting: visible.length, never: EXCLUDED.length, channels: CHANNELS.length }}
        />
        {tab === "waiting" && dismissed.size > 0 && !cleared && (
          <button
            type="button"
            onClick={() => setDismissed(new Set())}
            className="inline-flex items-center gap-1.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
          >
            <RotateCcw size={12.5} strokeWidth={1.9} />
            Show dismissed
          </button>
        )}
      </div>

      {tab === "waiting" &&
        (!IS_DEMO || notices.length === 0 ? (
          <NothingToTell />
        ) : cleared ? (
          <div className="mt-6 max-w-[520px] rounded-card border border-hairline bg-graphite p-5">
            <h2 className="text-[15px] text-snow">List cleared</h2>
            <p className="mt-2 text-[13px] text-mist">A reload brings them back.</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={() => setDismissed(new Set())}
            >
              <RotateCcw size={14} strokeWidth={1.8} />
              Bring them back
            </Button>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2">
            {visible.map((n) => (
              <NoticeRow key={n.id} notice={n} onDismiss={() => dismiss(n.id)} />
            ))}
          </ul>
        ))}

      {tab === "never" && <NeverShown />}
      {tab === "channels" && <HowYouWouldBeTold />}

      {IS_DEMO && notices.length > 0 && (
        <p className="mt-8 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE}
        </p>
      )}
    </div>
  );
}

function Segmented({
  tab,
  onChange,
  counts,
}: {
  tab: Tab;
  onChange: (next: Tab) => void;
  counts: Record<Tab, number>;
}) {
  const items: { id: Tab; label: string }[] = [
    { id: "waiting", label: "Waiting on you" },
    { id: "never", label: "Never shown" },
    { id: "channels", label: "Real channels" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-pill border border-hairline bg-graphite p-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          aria-pressed={tab === item.id}
          className={cn(
            "rounded-pill px-3.5 py-1.5 text-[12px] transition-colors",
            tab === item.id ? "bg-elevated text-snow" : "text-mist hover:text-snow",
          )}
        >
          {item.label}
          <span className="tnum ml-1.5 text-[10.5px] text-mist-dim">{counts[item.id]}</span>
        </button>
      ))}
    </div>
  );
}

function NoticeRow({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const Icon = notice.icon;
  return (
    <li className="rounded-card border border-hairline bg-graphite p-5 transition-colors hover:border-hairline-strong">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-slate text-azure"
        >
          <Icon size={16} strokeWidth={1.7} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h3 className="text-[14.5px] leading-snug text-snow">{notice.title}</h3>
            <Badge className="tnum">{notice.meta}</Badge>
          </div>

          <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{notice.detail}</p>

          {notice.facts !== undefined && (
            <ul className="tnum mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-mist-dim">
              {notice.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          )}

          <Link
            to={notice.to}
            className="mt-3.5 inline-flex items-center gap-1.5 text-[12.5px] text-azure transition-colors hover:text-azure-bright"
          >
            {notice.action}
            <ArrowRight size={13} strokeWidth={1.9} />
          </Link>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label={`Dismiss: ${notice.title}`}
          title="Dismiss"
          className={cn(
            "grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hairline-strong",
            "text-mist transition-colors hover:bg-elevated hover:text-snow",
          )}
        >
          <X size={13} strokeWidth={1.9} />
        </button>
      </div>
    </li>
  );
}

/**
 * Production build, or a demo with nothing left to say. None is being withheld
 * and none is loading — there is simply nothing yet. One line, then a way out.
 */
function NothingToTell() {
  return (
    <div className="mt-6 max-w-[520px] rounded-card border border-hairline bg-graphite p-6">
      <Inbox size={20} strokeWidth={1.6} aria-hidden className="text-mist-dim" />
      <h2 className="mt-3 text-[15px] text-snow">Nothing to tell you</h2>
      <p className="mt-2 text-[13px] text-mist">No bookings, threads or plans exist yet.</p>
      <Link
        to="/app/explore"
        className="mt-5 inline-flex items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure transition-colors hover:bg-azure/10"
      >
        Explore expeditions
        <ArrowRight size={14} strokeWidth={1.9} />
      </Link>
    </div>
  );
}

const EXCLUDED = [
  "Profile views",
  "Streaks, badges, days since you last opened",
  "Other climbers' activity",
  "Places left, or a price that expires tonight",
];

/**
 * Every one of those is written to bring you back, not to tell you something.
 * Put them in the same list as a departure date and you train yourself to skim
 * past the departure date — so the list stays short, and stays this short.
 */
function NeverShown() {
  return (
    <Card className="mt-6 max-w-[620px] p-5">
      <div className="flex items-center gap-2">
        <EyeOff size={15} strokeWidth={1.7} aria-hidden className="text-azure" />
        <p className="section-label">What this page will never show</p>
      </div>
      <p className="mt-1.5 text-[11.5px] text-mist-dim">Engagement, not information.</p>

      <ul className="mt-4 grid gap-2.5">
        {EXCLUDED.map((line) => (
          <li key={line} className="flex gap-2.5 text-[12.5px] leading-relaxed text-mist">
            <Ban size={12.5} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0 text-mist-dim" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const CHANNELS = [
  {
    icon: Mail,
    title: "The company emails you",
    body: "A place confirmed, a date moved, a departure cancelled — in writing.",
  },
  {
    icon: Phone,
    title: "The guide calls you",
    body: "A start time that moves with the freeze level, the night before.",
  },
  {
    icon: CloudSun,
    title: "The forecast finds you",
    body: "The service you already trust, and the hut warden reading it.",
  },
];

/**
 * ICEFALL sits outside all three and is not trying to get inside them. This page
 * is somewhere to read what the app knows, on a screen big enough to see it,
 * before you go — it is not a channel anybody can reach you on.
 */
function HowYouWouldBeTold() {
  return (
    <Card className="mt-6 max-w-[620px] p-5">
      <div className="flex items-center gap-2">
        <Mail size={15} strokeWidth={1.7} aria-hidden className="text-azure" />
        <p className="section-label">How you would actually be told</p>
      </div>
      <p className="mt-1.5 text-[11.5px] text-mist-dim">Not by ICEFALL.</p>

      <ul className="mt-4 grid gap-4">
        {CHANNELS.map((c) => (
          <li key={c.title} className="flex gap-3">
            <c.icon size={14} strokeWidth={1.7} aria-hidden className="mt-[3px] shrink-0 text-azure/70" />
            <div className="min-w-0">
              <p className="text-[12.5px] text-snow">{c.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
