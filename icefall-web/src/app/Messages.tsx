import { useEffect, useRef, useState } from "react";
import { peakImage } from "./peakPlate";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Building2, Info, MessageSquare, Save, Trash2, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button, GuidePhoto, VerifiedTick } from "@/components/ui";
import { GuideCredentialMark } from "@/components/marks";
import { DEMO_NOTICE, IS_DEMO, expeditionById, guideById } from "@/data/demo";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * Messages — the desktop inbox.
 *
 * ── THE COMPOSER DOES NOT SEND ──────────────────────────────────────────────
 *
 * There is no message server. Not "not connected yet" — none. So the composer
 * is not a Send button that quietly drops what you typed: it is labelled for
 * what it actually does, which is keep the text in this browser's localStorage
 * where only you can read it. Kept messages are drawn as dashed outlines and
 * marked "not sent", because a bubble that looks exactly like a delivered one
 * is a lie told in CSS.
 *
 * ── THE THREADS ARE INVENTED ────────────────────────────────────────────────
 *
 * Every conversation below is demo content built from the demo companies and
 * guides, gated on `IS_DEMO` (= `import.meta.env.DEV`). A production build has
 * no threads and says so. Nobody has written to you, because there is nobody.
 *
 * ── WHERE THAT IS SAID, AND HOW OFTEN ───────────────────────────────────────
 *
 * Once. The page used to carry the same confession in five places — a header
 * subtitle, a line under the kept drafts, a four-sentence composer notice, an
 * empty-state paragraph and a sentence per empty row. Repetition does not make
 * a disclosure more honest, it makes the page unreadable and trains the eye to
 * skip grey text, including the one grey line that matters. So the budget is
 * two blocks for the whole page: one line above the composer (the only place
 * where a user is about to act on the belief that this sends), and DEMO_NOTICE
 * at the foot. Everything else that was a paragraph is now a label — the
 * dashed bubble, the "Not sent" divider, the button that says "Keep on this
 * device" rather than "Send". The interface states its limits by what it is
 * called, not by apologising underneath itself.
 */

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

type ThreadKind = "company" | "guide" | "group";

interface Line {
  from: "them" | "you";
  /** Group threads only — which member wrote it. */
  author?: string;
  body: string;
  at: string;
  /** Display day. Fixed strings, because these conversations never happened. */
  day: string;
}

interface Thread {
  id: string;
  kind: ThreadKind;
  name: string;
  /** Under the name in the thread header. */
  context: string;
  /** The numbers line. */
  meta: string;
  /** Copied from the demo record — never minted here. See `VerifiedTick`. */
  verifiedOn?: string;
  photo?: string;
  /** One of the six peak photographs that exist. Group avatars only. */
  peak?: string;
  unread: number;
  lines: Line[];
}

interface Script {
  unread: number;
  lines: Line[];
}

/* -------------------------------------------------------------------------- */
/* Demo conversations                                                         */
/* -------------------------------------------------------------------------- */

/** Keyed by expedition id — the company thread hangs off the objective. */
const COMPANY_SCRIPTS: Record<string, Script> = {
  "e-everest": {
    unread: 2,
    lines: [
      {
        from: "them",
        day: "Mon 17 Aug",
        at: "09:12",
        body: "Your enquiry for the spring 2027 South Col team came through. We run eight climbers maximum with six Sherpa staff, and the team is fixed in October when permits open.",
      },
      {
        from: "you",
        day: "Mon 17 Aug",
        at: "11:40",
        body: "Understood. What would you want to see from me before you'd put me on the permit?",
      },
      {
        from: "them",
        day: "Yesterday",
        at: "08:05",
        body: "A 7,000 m summit inside three years, and a fortnight above 6,000 m in the twelve months before we fly. Send the logbook when you have it — we would rather turn you down now than at Camp 2.",
      },
      {
        from: "them",
        day: "Today",
        at: "09:41",
        body: "Permit paperwork opens on 1 October. Nothing is owed before then.",
      },
    ],
  },
  "e-aconcagua": {
    unread: 0,
    lines: [
      {
        from: "them",
        day: "Thu 13 Aug",
        at: "15:20",
        body: "Kit list for the Normal route attached. The one thing people consistently under-buy is the sleeping bag — −20 °C comfort rating, not limit.",
      },
      {
        from: "you",
        day: "Thu 13 Aug",
        at: "18:02",
        body: "Noted. Is the mule weight per person or per party?",
      },
      {
        from: "them",
        day: "Fri 14 Aug",
        at: "07:55",
        body: "Per person, 20 kg as far as Plaza de Mulas. Anything over that is charged by the kilo at base camp.",
      },
    ],
  },
  "e-mont-blanc": {
    unread: 1,
    lines: [
      {
        from: "them",
        day: "Sat 9 Aug",
        at: "10:30",
        body: "The Goûter couloir has been dropping stone through the middle of the day all month. We leave the hut at 02:00 and turn around at 08:30 whether or not the summit is close.",
      },
      {
        from: "them",
        day: "Today",
        at: "07:15",
        body: "Refuge du Goûter beds for late June are released in January. We hold none back — everyone books the same morning.",
      },
    ],
  },
};

/** Keyed by guide id. */
const GUIDE_SCRIPTS: Record<string, Script> = {
  "g-lama": {
    unread: 3,
    lines: [
      {
        from: "them",
        day: "Yesterday",
        at: "06:20",
        body: "Back in Kathmandu. The Ama Dablam permits for the autumn came through.",
      },
      {
        from: "them",
        day: "Yesterday",
        at: "06:21",
        body: "Ropes go on the SW ridge in the first week of October, so anything earlier is a walk to base camp and back.",
      },
      {
        from: "them",
        day: "Today",
        at: "08:03",
        body: "If you want the acclimatisation right, come ten days early and walk in over the Cho La. It costs a week and it is the difference between summiting and being sick.",
      },
    ],
  },
  "g-wehrli": {
    unread: 0,
    lines: [
      {
        from: "you",
        day: "Wed 12 Aug",
        at: "20:14",
        body: "Would you take someone up the Hörnli who has done Mont Blanc but no long rock ridges?",
      },
      {
        from: "them",
        day: "Wed 12 Aug",
        at: "21:02",
        body: "Not straight away. Two days on the Riffelhorn and a traverse of the Breithorn first, and then I would know. The Hörnli is four hours of moving together on loose ground — it is rope skill and fitness, not grade.",
      },
      {
        from: "them",
        day: "Yesterday",
        at: "17:48",
        body: "I have the last week of September free if you want those two days.",
      },
    ],
  },
  "g-falkenrath": {
    unread: 0,
    lines: [
      {
        from: "you",
        day: "Fri 8 Aug",
        at: "09:30",
        body: "Is the Goûter realistic in a heatwave week?",
      },
      {
        from: "them",
        day: "Fri 8 Aug",
        at: "12:11",
        body: "No. If the freezing level sits above 4,000 m the couloir never locks up overnight, and I will not put a client under it. We would go to the Gran Paradiso instead — same fitness, none of the stonefall.",
      },
    ],
  },
  "g-callaghan": {
    unread: 1,
    lines: [
      {
        from: "them",
        day: "Tue 5 Aug",
        at: "19:40",
        body: "Denali is 21 days and most of it is hauling. If sled work is new to you, the Kahiltna is a bad place to find that out.",
      },
      {
        from: "them",
        day: "Today",
        at: "06:58",
        body: "Talkeetna is fogged in — the whole queue for flights onto the glacier is three days behind.",
      },
    ],
  },
};

/** Keyed by expedition id — a party thread for a departure. */
const GROUP_SCRIPTS: Record<string, Script & { title: string; members: string[] }> = {
  "e-everest": {
    title: "Everest — South Col · spring 2027",
    members: ["Nima Chhiring Lama", "Sofía Halvorsen", "Marit Callaghan"],
    unread: 5,
    lines: [
      {
        from: "them",
        author: "Sofía Halvorsen",
        day: "Yesterday",
        at: "18:22",
        body: "Flights into Kathmandu booked for 28 March. Anyone else on that day?",
      },
      {
        from: "them",
        author: "Marit Callaghan",
        day: "Yesterday",
        at: "19:05",
        body: "Two days later for me. I am doing Lobuche first.",
      },
      {
        from: "you",
        day: "Yesterday",
        at: "19:30",
        body: "Same flight as Sofía, I think. I'll check the number tonight.",
      },
      {
        from: "them",
        author: "Nima Chhiring Lama",
        day: "Today",
        at: "05:50",
        body: "Bring the boots you will summit in to Kathmandu, not new ones. I want to see them at the gear check.",
      },
    ],
  },
  "e-mont-blanc": {
    title: "Mont Blanc — Goûter · late June",
    members: ["Ines Falkenrath", "Rachid Ait Benhaddou"],
    unread: 0,
    lines: [
      {
        from: "them",
        author: "Ines Falkenrath",
        day: "Thu 7 Aug",
        at: "14:00",
        body: "Hut is confirmed for the night of the 24th. Two nights would be better but there is nothing free.",
      },
      {
        from: "them",
        author: "Rachid Ait Benhaddou",
        day: "Thu 7 Aug",
        at: "16:12",
        body: "I can be in Chamonix from the 21st if anyone wants a day on the Cosmiques first.",
      },
    ],
  },
};

/**
 * Threads are assembled from the demo records rather than typed out, so a name,
 * a rate or a verification date can only ever come from one place. In a
 * production build both lookups return undefined and this is an empty list.
 */
function buildThreads(): Thread[] {
  const threads: Thread[] = [];

  for (const [id, script] of Object.entries(COMPANY_SCRIPTS)) {
    const e = expeditionById(id);
    if (!e) continue;
    threads.push({
      id: `co-${id}`,
      kind: "company",
      name: e.company,
      context: `${e.objective} · ${e.country}`,
      meta: `${e.durationDays} days · from ${formatEur(e.fromEur)}, indicative`,
      verifiedOn: e.verifiedOn,
      unread: script.unread,
      lines: script.lines,
    });
  }

  for (const [id, script] of Object.entries(GUIDE_SCRIPTS)) {
    const g = guideById(id);
    if (!g) continue;
    threads.push({
      id: `gu-${id}`,
      kind: "guide",
      name: g.name,
      context: `${g.credential} · ${g.basedIn}`,
      meta: `${g.yearsGuiding} years guiding · ${formatEur(g.dayRate)} a day, indicative`,
      verifiedOn: g.verifiedOn,
      photo: g.photo,
      unread: script.unread,
      lines: script.lines,
    });
  }

  for (const [id, script] of Object.entries(GROUP_SCRIPTS)) {
    const e = expeditionById(id);
    if (!e) continue;
    threads.push({
      id: `gr-${id}`,
      kind: "group",
      name: script.title,
      context: `${script.members.length + 1} people · ${e.objective}`,
      meta: `${script.members.join(", ")} and you`,
      peak: e.heroPeak,
      unread: script.unread,
      lines: script.lines,
    });
  }

  return threads;
}

/**
 * THE INBOX, IN ONE PLACE — and the bug that made it necessary.
 *
 * Three pages each held their own conversation list and the three disagreed
 * about the same inbox. Home counted 8 unread over 4 conversations, this page
 * counted 12 over 9, and Notifications printed a bare `const UNREAD = 2` that
 * was not derived from anything at all. A reader moving between them saw three
 * different answers to "how many messages do I have".
 *
 * `buildThreads` already existed and already did the right thing — assembling
 * threads from the demo records so a name, a rate or a verification date can
 * only come from one place. The counts simply were not travelling with it.
 * They do now: Home renders a preview of THREADS and Notifications reads
 * UNREAD_TOTAL, so the three cannot drift apart again.
 *
 * A second thing falls out of this. Home used to type its correspondents in as
 * free strings, and one of them was "Alpine Ascents" — a real US operator.
 * `RealBusiness.tsx` keys both the banner and the demo notice off the `Company`
 * record, so a bare string is invisible to it: the guard was working, the name
 * was just written somewhere it could not look. Thread names come from
 * `expeditionById()` and `guideById()`, so a real operator cannot reach the
 * inbox now without its disclosure coming too.
 */
export const THREADS: Thread[] = buildThreads();

/** Unread across the whole inbox, before any thread is opened this session. */
export const UNREAD_TOTAL = THREADS.reduce((n, t) => n + t.unread, 0);

const SECTIONS: { kind: ThreadKind; label: string; icon: LucideIcon }[] = [
  { kind: "company", label: "Companies", icon: Building2 },
  { kind: "guide", label: "Guides", icon: MessageSquare },
  { kind: "group", label: "Groups", icon: Users },
];

/** Segmented filter over the list pane. "All" keeps the grouped headers. */
type Filter = ThreadKind | "all";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "company", label: "Companies" },
  { value: "guide", label: "Guides" },
  { value: "group", label: "Groups" },
];

/* -------------------------------------------------------------------------- */
/* What you wrote, which went nowhere                                         */
/* -------------------------------------------------------------------------- */

const UNSENT_KEY = "icefall.web.messages.unsent.v1";

interface Unsent {
  id: string;
  body: string;
  at: string;
}

type UnsentMap = Record<string, Unsent[]>;

function loadUnsent(): UnsentMap {
  try {
    const raw = localStorage.getItem(UNSENT_KEY);
    return raw ? (JSON.parse(raw) as UnsentMap) : {};
  } catch {
    return {};
  }
}

/** Both panes are a viewport tall and scroll independently, as an inbox should. */
const PANE = "h-[calc(100vh-268px)] min-h-[520px]";

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function Messages() {
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      {IS_DEMO ? <Inbox /> : <NothingToRead />}
    </div>
  );
}

/**
 * Title row. What sits beside the title is counts, not a sentence — the fold
 * belongs to the inbox itself.
 */
function Head({ right }: { right: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Messages</h1>
      <div className="flex items-baseline gap-5">{right}</div>
    </div>
  );
}

function Inbox() {
  const threads = THREADS;
  const [activeId, setActiveId] = useState(() => threads[0]?.id ?? "");
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(
    () => new Set(threads[0] ? [threads[0].id] : []),
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [unsent, setUnsent] = useState<UnsentMap>(loadUnsent);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(UNSENT_KEY, JSON.stringify(unsent));
    } catch {
      /* private mode — what you wrote still lives in this tab */
    }
  }, [unsent]);

  // Land at the newest message, not the oldest, on open and after writing.
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeId, unsent]);

  const active = threads.find((t) => t.id === activeId) ?? threads[0];
  if (!active) return <NothingToRead />;

  const draft = drafts[active.id] ?? "";
  const kept = unsent[active.id] ?? [];
  const unreadTotal = threads.reduce((n, t) => n + (readIds.has(t.id) ? 0 : t.unread), 0);
  const shown = SECTIONS.filter((s) => filter === "all" || s.kind === filter);

  function open(id: string) {
    setActiveId(id);
    setReadIds((prev) => new Set(prev).add(id));
  }

  function keep() {
    const body = draft.trim();
    if (!body) return;
    const at = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const item: Unsent = { id: `u-${Date.now()}`, body, at };
    setUnsent((prev) => ({ ...prev, [active.id]: [...(prev[active.id] ?? []), item] }));
    setDrafts((prev) => ({ ...prev, [active.id]: "" }));
  }

  function discard(itemId: string) {
    setUnsent((prev) => ({
      ...prev,
      [active.id]: (prev[active.id] ?? []).filter((u) => u.id !== itemId),
    }));
  }

  return (
    <>
      <Head
        right={
          <>
            <span className="tnum text-[12.5px] text-mist">{threads.length} conversations</span>
            <span className="tnum text-[12.5px] text-azure-bright">{unreadTotal} unread</span>
          </>
        }
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ---- The list ------------------------------------------------- */}
        <aside
          className={cn(
            PANE,
            "flex flex-col overflow-hidden rounded-card border border-hairline bg-graphite",
          )}
        >
          {/* Segmented filter instead of a scroll to find the right kind. */}
          <div className="border-b border-hairline p-3">
            <div className="flex gap-0.5 rounded-pill border border-hairline bg-elevated p-0.5">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  aria-pressed={filter === f.value}
                  className={cn(
                    "flex-1 rounded-pill px-2 py-1.5 text-[11px] transition-colors",
                    filter === f.value
                      ? "bg-azure text-obsidian"
                      : "text-mist hover:bg-white/[0.04] hover:text-snow",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((section) => {
              const rows = threads.filter((t) => t.kind === section.kind);
              if (rows.length === 0) return null;
              return (
                <div key={section.kind}>
                  {/* One kind on screen already names itself in the filter. */}
                  {filter === "all" && (
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-hairline bg-graphite/95 px-5 py-2.5 backdrop-blur">
                      <section.icon size={12} strokeWidth={1.8} className="text-mist-dim" />
                      <p className="section-label">{section.label}</p>
                      <span className="tnum ml-auto text-[10.5px] text-mist-dim">{rows.length}</span>
                    </div>
                  )}
                  {rows.map((t) => (
                    <Row
                      key={t.id}
                      thread={t}
                      active={t.id === active.id}
                      unread={readIds.has(t.id) ? 0 : t.unread}
                      kept={unsent[t.id] ?? []}
                      onOpen={() => open(t.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </aside>

        {/* ---- The thread ----------------------------------------------- */}
        <section
          className={cn(
            PANE,
            "flex flex-col overflow-hidden rounded-card border border-hairline bg-graphite",
          )}
        >
          <header className="flex items-center gap-3.5 border-b border-hairline px-6 py-4">
            <Avatar thread={active} size={42} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[15px] font-normal text-snow">{active.name}</h2>
                {/*
                  The tick lives here and not in the list: the list scrolls, and
                  its tooltip — the only thing that makes a tick honest — would
                  be clipped by the overflow.
                */}
                {/* A guide's mark is the gold credential; a company keeps the plain tick
                    until the owner assigns the fourth mark — see components/marks.tsx. */}
                {active.verifiedOn && active.kind === "guide" && (
                  <GuideCredentialMark verifiedOn={active.verifiedOn} />
                )}
                {active.verifiedOn && active.kind !== "guide" && (
                  <VerifiedTick verifiedOn={active.verifiedOn} />
                )}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-mist">{active.context}</p>
            </div>
            <div className="ml-auto hidden shrink-0 items-baseline gap-4 xl:flex">
              <p className="tnum text-[11.5px] text-mist-dim">{active.meta}</p>
              <Link
                to={active.kind === "guide" ? "/app/guides" : "/app/explore"}
                className="text-[11.5px] text-mist transition-colors hover:text-snow"
              >
                {active.kind === "guide" ? "Guide directory" : "Expeditions"}
              </Link>
            </div>
          </header>

          <div ref={bodyRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {active.lines.map((line, i) => (
              <div key={`${active.id}-${i}`} className="space-y-4">
                {(i === 0 || active.lines[i - 1].day !== line.day) && <DaySplit label={line.day} />}
                <Bubble line={line} group={active.kind === "group"} />
              </div>
            ))}

            {kept.length > 0 && (
              <>
                <DaySplit label="Not sent" />
                {kept.map((u) => (
                  <div key={u.id} className="ml-auto max-w-[72%]">
                    <div className="rounded-card rounded-br-[4px] border border-dashed border-hairline-strong px-4 py-3 text-[13.5px] leading-relaxed text-mist">
                      {u.body}
                    </div>
                    <div className="mt-1 flex items-center justify-end gap-2 pr-1 text-[10.5px] text-mist-dim">
                      <span className="tnum">{u.at}</span>
                      {/* Label, not a sentence — the dashed bubble carries the rest. */}
                      <span>· This device only</span>
                      <button
                        type="button"
                        onClick={() => discard(u.id)}
                        aria-label="Delete this message from this device"
                        className="text-mist-dim transition-colors hover:text-snow"
                      >
                        <Trash2 size={12} strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* ---- The composer ------------------------------------------- */}
          <div className="border-t border-hairline px-6 py-4">
            {/*
              Block 1 of 2 for the page. It stays because this is the one spot
              where a user is about to act on the belief that this sends.
            */}
            <div className="flex items-center gap-2.5">
              <Info size={13} strokeWidth={1.8} className="shrink-0 text-azure" />
              <p id="composer-notice" className="text-[11.5px] text-mist">
                Nothing sends. Text stays in this browser, readable only by you.
              </p>
            </div>

            <textarea
              value={draft}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [active.id]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  keep();
                }
              }}
              rows={2}
              aria-describedby="composer-notice"
              placeholder={`Write to ${active.name}`}
              className="mt-3 w-full resize-none rounded-tile border border-hairline bg-elevated px-3.5 py-3 text-[13.5px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
            />

            <div className="mt-2.5 flex items-center justify-between">
              <p className="tnum text-[11px] text-mist-dim">⌘ + Enter</p>
              <Button variant="secondary" size="sm" onClick={keep} disabled={draft.trim() === ""}>
                <Save size={14} strokeWidth={1.8} />
                Keep on this device
              </Button>
            </div>
          </div>
        </section>
      </div>

      <p className="mt-8 border-l-2 border-azure/30 pl-4 text-[11px] leading-relaxed text-mist-dim">
        {DEMO_NOTICE}
      </p>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function Avatar({ thread, size }: { thread: Thread; size: number }) {
  if (thread.kind === "group" && thread.peak) {
    return (
      <span
        style={{ width: size, height: size }}
        className="block shrink-0 overflow-hidden rounded-tile border border-hairline bg-slate"
      >
        <img
          src={peakImage(thread.peak)}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
      </span>
    );
  }
  // Companies have no logo files, so `GuidePhoto` falls through to a monogram.
  return <GuidePhoto name={thread.name} src={thread.photo} size={size} />;
}

function Row({
  thread,
  active,
  unread,
  kept,
  onOpen,
}: {
  thread: Thread;
  active: boolean;
  unread: number;
  kept: Unsent[];
  onOpen: () => void;
}) {
  const last = thread.lines[thread.lines.length - 1];
  const draftLast = kept[kept.length - 1];
  const preview = draftLast
    ? `Not sent: ${draftLast.body}`
    : last.from === "you"
      ? `You: ${last.body}`
      : last.author
        ? `${last.author}: ${last.body}`
        : last.body;
  const when = draftLast ? draftLast.at : last.day === "Today" ? last.at : last.day;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active}
      className={cn(
        "flex w-full gap-3 border-l-2 border-b border-b-hairline px-4 py-3.5 text-left transition-colors",
        active ? "border-l-azure bg-azure/[0.07]" : "border-l-transparent hover:bg-white/[0.03]",
      )}
    >
      <Avatar thread={thread} size={38} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] text-snow">{thread.name}</span>
          <span className="tnum shrink-0 text-[10.5px] text-mist-dim">{when}</span>
        </span>
        <span className="mt-1 flex items-start gap-2">
          <span className="clamp-2 min-w-0 flex-1 text-[12px] leading-relaxed text-mist-dim">
            {preview}
          </span>
          {unread > 0 && (
            <span className="tnum mt-0.5 shrink-0 rounded-pill bg-azure px-1.5 py-0.5 text-[10px] text-obsidian">
              {unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

function DaySplit({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-hairline" />
      <span className="section-label">{label}</span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function Bubble({ line, group }: { line: Line; group: boolean }) {
  const mine = line.from === "you";
  return (
    <div className={cn("max-w-[72%]", mine && "ml-auto")}>
      {group && !mine && line.author && (
        <p className="mb-1 pl-1 text-[11px] text-azure">{line.author}</p>
      )}
      <div
        className={cn(
          "border px-4 py-3 text-[13.5px] leading-relaxed text-snow",
          mine
            ? "rounded-card rounded-br-[4px] border-azure/25 bg-azure/[0.10]"
            : "rounded-card rounded-bl-[4px] border-hairline bg-slate",
        )}
      >
        {line.body}
      </div>
      <p className={cn("tnum mt-1 text-[10.5px] text-mist-dim", mine ? "pr-1 text-right" : "pl-1")}>
        {line.at}
      </p>
    </div>
  );
}

/**
 * The production inbox.
 *
 * Three empty rows with a count apiece, rather than a spinner or a blank panel:
 * it shows the shape of the page without inventing a single message. The
 * paragraph that used to sit on top explained there is no message server and no
 * account; the composer already says that once, and this branch never renders
 * beside it, so one short line does the job here.
 */
function NothingToRead() {
  return (
    <>
      <Head right={<span className="tnum text-[12.5px] text-mist">0 conversations</span>} />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((s) => (
          <div key={s.kind} className="rounded-card border border-hairline bg-graphite p-5">
            <s.icon size={15} strokeWidth={1.6} className="text-mist-dim" />
            <p className="section-label mt-3">{s.label}</p>
            <p className="tnum mt-1.5 text-[22px] font-light text-mist-dim">—</p>
            <p className="mt-1 text-[11.5px] text-mist-dim">None yet</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-5 py-4">
        <MessageSquare size={14} strokeWidth={1.7} className="shrink-0 text-azure" />
        <p className="text-[12px] text-mist">Threads open when guides and companies join.</p>
      </div>
    </>
  );
}
