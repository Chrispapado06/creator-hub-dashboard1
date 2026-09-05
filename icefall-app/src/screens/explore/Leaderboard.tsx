import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ChevronDown, ChevronRight, Mountain as MountainIcon, Trophy } from "lucide-react";
import { Rise, Stagger } from "@/components/layout/chrome";
import { Avatar, SectionLabel } from "@/components/ui/primitives";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { useRecordedActivities } from "@/tracking/feed";
import { useApp } from "@/state/AppState";
import { useSettings } from "@/settings/store";
import { useSummitLogs } from "@/social/summitLog";
import {
  CATEGORY_LABEL, CATEGORY_MEANING, DEFAULT_PERIOD, EMPTY_BOARD_BODY, EMPTY_BOARD_TITLE,
  EMPTY_MOUNTAIN_BOARD_BODY, EMPTY_MOUNTAIN_BOARD_TITLE, PERIOD_LABEL, RANKING_UPDATE_NOTICE,
  SCOPE_LABEL, VERIFIED_ONLY_NOTICE, boardEntries, categoryValue, standingFor,
  type BoardCategory, type BoardEntry, type BoardPeriod, type BoardScope,
} from "@/social/leaderboard";
import { cn } from "@/lib/utils";

/**
 * LEADERBOARD — "How am I progressing compared with the community?"
 *
 * The community half of that question has no answer yet, and this screen says
 * so rather than inventing a podium. What it can answer honestly is the first
 * half: the athlete's own verified standing, computed from recorded activity,
 * shown against the category and period they choose.
 *
 * The structure is the finished one — scopes, categories, periods, podium,
 * table, your-rank card — so the day a backend fills `boardEntries()` nothing
 * here changes shape. That is the whole point of building it now.
 *
 * WHICH ALSO MEANS: the podium below renders `boardEntries()` and nothing else.
 * There is no fixture array, no `DEMO_ATHLETES`, no flag that switches one on.
 * A leaderboard of plausible strangers is a lie about the size of this app, and
 * a leaderboard of NAMED REAL ALPINISTS carrying invented summit counts and a
 * verified tick is a lie about them — it puts statistics and an ICEFALL
 * endorsement in the mouths of people who never agreed to either. The empty
 * state is not a placeholder waiting to be filled with examples; it is the
 * correct output for a board with nobody on it, and it is styled to be read as
 * deliberate rather than broken.
 */
export default function Leaderboard() {
  const { user } = useApp();
  const { settings } = useSettings();
  const recorded = useRecordedActivities();
  const logs = useSummitLogs();

  const [scope, setScope] = useState<BoardScope>("world");
  const [category, setCategory] = useState<BoardCategory>("summits");
  const [period, setPeriod] = useState<BoardPeriod>(DEFAULT_PERIOD);
  const [picker, setPicker] = useState<"category" | null>(null);

  /**
   * Which summit logs are counted here, AND WHAT THAT DOES AND DOES NOT PROVE.
   *
   * ⚠️ This said the logs were "matched to a recording whose track actually
   * reached the top." NOTHING BELOW CHECKS A TRACK. The test is that the log
   * names an activity, that the activity exists, and that it was not simulated.
   * A recording that started at the car park and stopped at the first hut
   * passes it, and the board still calls the result a "verified summit".
   *
   * The real check — the logged peak's coordinates against the recorded track —
   * is not written, and a summit log carries no coordinates to check against.
   * Until it exists the honest word for this column is RECORDED, not verified;
   * that is a copy decision, and attaching a recording to a log without the
   * coordinate check would be worse than the current state, because it would
   * mint a verified summit that nothing verified.
   *
   * A log with no recording behind it is filtered out here rather than counted
   * with an asterisk. That part was always true.
   */
  const verifiedSummits = useMemo(
    () =>
      logs
        .filter((log) => {
          if (!log.activityId) return false;
          const activity = recorded.find((r) => r.id === log.activityId);
          // The whole test: a real, non-simulated recording is attached. No
          // part of the track is examined — see the note above.
          return Boolean(activity) && !activity!.simulated;
        })
        .map((log) => ({ name: log.peakName, date: log.date })),
    [logs, recorded],
  );

  const standing = useMemo(
    () => standingFor({ recorded, verifiedSummits, period }),
    [recorded, verifiedSummits, period],
  );

  const entries = boardEntries();
  const country = settings.region?.split(",").pop()?.trim() || "Not set";
  const metricLabel = CATEGORY_LABEL[category];

  /*
   * A podium needs a field. With one or two entries there is no first, second
   * and third — there is a short list — so the rows carry them instead, and the
   * ceremony is held back until it means something.
   */
  const ranked = [...entries].sort((a, b) => a.rank - b.rank);
  const podium = ranked.length >= 3 ? ranked.slice(0, 3) : [];
  const rows = podium.length > 0 ? ranked.slice(3) : ranked;

  return (
    <>
      <Stagger className="px-5 pb-24 pt-4">
        {/* ---- Scope ------------------------------------------------------ */}
        <Rise>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(SCOPE_LABEL) as BoardScope[]).map((s) => (
              <Segment key={s} active={scope === s} onClick={() => setScope(s)}>
                {SCOPE_LABEL[s]}
              </Segment>
            ))}
          </div>
        </Rise>

        {/* ---- What is being ranked, and where --------------------------- */}
        {scope !== "world" && (
          <Rise className="pt-3">
            <div className="flex items-center gap-2.5 rounded-tile border border-hairline bg-graphite px-3.5 py-2.5">
              {scope === "mountain" ? (
                <>
                  <MountainIcon size={15} strokeWidth={1.7} className="shrink-0 text-azure" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-mist-dim">
                    Open a mountain to see its board
                  </span>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13px] text-snow">{country}</span>
              )}
            </div>
          </Rise>
        )}

        {/* ---- The thing being ranked ------------------------------------- */}
        <Rise className="pt-3">
          <button
            type="button"
            onClick={() => setPicker("category")}
            aria-haspopup="dialog"
            aria-label={`Rank by ${metricLabel}`}
            className="flex w-full items-center gap-2 rounded-tile border border-hairline bg-elevated px-3.5 py-3 text-[14px] text-snow transition-colors hover:border-azure/40"
          >
            <span className="min-w-0 flex-1 truncate text-left">{metricLabel}</span>
            <ChevronDown size={16} strokeWidth={1.8} className="shrink-0 text-mist" />
          </button>
        </Rise>

        {/* ---- Period ------------------------------------------------------ */}
        <Rise className="pt-3">
          <div className="grid grid-cols-4 gap-2">
            {(Object.keys(PERIOD_LABEL) as BoardPeriod[]).map((p) => (
              <Segment key={p} active={period === p} onClick={() => setPeriod(p)} tight>
                {PERIOD_LABEL[p]}
              </Segment>
            ))}
          </div>
        </Rise>

        {/* ---- The field --------------------------------------------------- */}
        {/*
         * One panel, two states. The podium and the empty notice occupy the
         * same frame — same graphite card, same photograph under the same heavy
         * scrim — so an empty board reads as a board that is waiting, not as a
         * component that failed to load.
         */}
        {(podium.length > 0 || entries.length === 0) && (
          <Rise className="pt-5">
            <div className="relative overflow-hidden rounded-card border border-hairline bg-graphite">
              <img
                src="/img/home-hero.jpg"
                alt=""
                aria-hidden
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-[0.13]"
              />
              {/*
               * The same gradient `.scrim-full` draws, restated in the token —
               * and deliberately NOT that class.
               *
               * `.scrim-full` is lighting for a PHOTOGRAPH: it stays dark in
               * every theme because the picture under it never got lighter, and
               * anything wearing it becomes a dark island (see index.css).
               * That is not this. The photograph here runs at 13% and is
               * texture; what is really underneath is `bg-graphite`, a card,
               * and a card follows the theme. Written in `--ice-obsidian` this
               * deepens a dark card on the dark theme and lightens a pale one
               * on the light theme, which is what the podium needs to keep its
               * own ink either way.
               */}
              <div className="absolute inset-0 bg-gradient-to-t from-obsidian/[0.97] via-obsidian/60 to-obsidian/35" />

              <div className="relative">
                {podium.length > 0 ? (
                  <div className="grid grid-cols-3 items-end gap-2 px-4 pb-6 pt-7">
                    <PodiumPlace entry={podium[1]} place={2} metricLabel={metricLabel} />
                    <PodiumPlace entry={podium[0]} place={1} metricLabel={metricLabel} />
                    <PodiumPlace entry={podium[2]} place={3} metricLabel={metricLabel} />
                  </div>
                ) : (
                  <div className="px-6 py-9 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-azure/30 bg-azure/[0.07] text-azure">
                      <Trophy size={20} strokeWidth={1.4} />
                    </span>
                    <p className="mt-3.5 text-[15px] text-snow">
                      {scope === "mountain" ? EMPTY_MOUNTAIN_BOARD_TITLE : EMPTY_BOARD_TITLE}
                    </p>
                    <p className="mx-auto mt-2 max-w-[290px] text-[12px] leading-relaxed text-mist-dim">
                      {scope === "mountain" ? EMPTY_MOUNTAIN_BOARD_BODY : EMPTY_BOARD_BODY}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </Rise>
        )}

        {/* ---- The table --------------------------------------------------- */}
        {rows.length > 0 && (
          <Rise className="pt-3">
            <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
              {rows.map((entry, i) => (
                <BoardRow
                  key={entry.athleteId}
                  entry={entry}
                  metricLabel={metricLabel}
                  first={i === 0}
                />
              ))}
            </div>
          </Rise>
        )}

        {/* ---- Your standing ----------------------------------------------- */}
        <Rise className="pt-5">
          <SectionLabel>Your standing</SectionLabel>
          <div className="mt-3 rounded-card border border-azure/35 bg-azure/[0.05] p-4">
            <div className="flex items-center gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-slate text-[15px] text-mist">
                {settings.avatar ? (
                  <img src={settings.avatar} alt="" aria-hidden className="h-full w-full object-cover" />
                ) : (
                  user.name.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] text-snow">{user.name}</p>
                <p className="text-[11.5px] text-mist-dim">
                  {settings.region || user.homeBase || "Region not set"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                {/* The rank is "—" and stays "—" until there is a field to be
                    ranked within. A "#1" for the only athlete on the board is
                    a trophy for having installed the app. */}
                <p className="tnum text-[26px] font-light leading-none text-mist-dim">—</p>
                <p className="mt-1 text-[9.5px] uppercase tracking-[0.12em] text-mist-dim">
                  Unranked
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-hairline pt-3.5">
              <Figure label="Verified summits" value={String(standing.summits)} />
              <Figure
                label="Verified vertical"
                value={`${standing.verticalM.toLocaleString("en-GB")} m`}
              />
              <Figure label={metricLabel} value={categoryValue(standing, category)} />
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-mist">
              {CATEGORY_MEANING[category]}
            </p>
          </div>
        </Rise>

        {standing.summits === 0 && standing.verticalM === 0 && (
          <Rise className="pt-3">
            <p className="text-[12px] leading-relaxed text-mist-dim">
              Nothing verified yet. Record an activity with ICEFALL and reach a summit on it, and it
              counts here — a summit typed into your logbook does not.
            </p>
          </Rise>
        )}

        {/* ---- Footer notice ------------------------------------------------ */}
        <Rise className="pt-5">
          <div className="flex gap-3 rounded-card border border-hairline bg-graphite p-4">
            <MountainIcon size={15} strokeWidth={1.7} className="mt-px shrink-0 text-azure/80" />
            <div className="min-w-0 space-y-1.5">
              <p className="text-[11px] leading-relaxed text-mist-dim">{VERIFIED_ONLY_NOTICE}</p>
              <p className="text-[11px] leading-relaxed text-mist-dim">{RANKING_UPDATE_NOTICE}</p>
            </div>
          </div>
        </Rise>
      </Stagger>

      {picker === "category" && (
        <Sheet title="Rank by" onClose={() => setPicker(null)}>
          {(Object.keys(CATEGORY_LABEL) as BoardCategory[]).map((c) => (
            <SheetRow
              key={c}
              title={CATEGORY_LABEL[c]}
              detail={CATEGORY_MEANING[c]}
              active={category === c}
              onClick={() => {
                setCategory(c);
                setPicker(null);
              }}
            />
          ))}
        </Sheet>
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Controls                                                                    */
/* -------------------------------------------------------------------------- */

/** The one segmented control on this screen — scope and period share it. */
function Segment({
  active,
  onClick,
  tight,
  children,
}: {
  active: boolean;
  onClick: () => void;
  /** Four-up rows ("This month") need the smaller type to stay on one line. */
  tight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-tile border py-2 uppercase transition-colors",
        tight ? "px-1 text-[9.5px] tracking-[0.06em]" : "text-[11px] tracking-[0.08em]",
        active
          ? "border-azure/55 bg-azure/[0.11] text-azure"
          : "border-hairline-strong text-mist hover:text-snow",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* The field                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The tick, and the only place it is drawn.
 *
 * It states that ICEFALL has confirmed who this athlete is. Nothing here
 * derives it — no name-matching, no "well-known alpinist" list — so it can only
 * appear for an entry the backend marked verified.
 */
function VerifiedTick({ name }: { name: string }) {
  return (
    <BadgeCheck
      size={13}
      strokeWidth={2}
      className="shrink-0 text-azure"
      aria-label={`${name} is verified`}
    />
  );
}

function EntryAvatar({ entry, size, ring }: { entry: BoardEntry; size: number; ring?: boolean }) {
  /* No ring offset: the podium sits on a photograph, and an offset would cut a
     graphite gap into it that lines up with nothing. */
  const cls = cn("rounded-full", ring ? "ring-2 ring-azure" : "ring-1 ring-hairline-strong");

  if (entry.avatar) {
    return (
      <img
        src={entry.avatar}
        alt=""
        aria-hidden
        loading="lazy"
        style={{ width: size, height: size }}
        className={cn("shrink-0 object-cover", cls)}
      />
    );
  }
  return <Avatar name={entry.name} size={size} className={cls} />;
}

/** One of the three places. First is larger and raised; the ring says why. */
function PodiumPlace({
  entry,
  place,
  metricLabel,
}: {
  entry: BoardEntry;
  place: 1 | 2 | 3;
  metricLabel: string;
}) {
  const first = place === 1;

  return (
    /* The grid is bottom-aligned, so first place is raised with a bottom
       margin — a negative top margin would be ignored by `items-end`. */
    <div className={cn("flex flex-col items-center text-center", first && "mb-5")}>
      <div className="relative">
        <EntryAvatar entry={entry} size={first ? 76 : 58} ring={first} />
        <span
          className={cn(
            "absolute -top-1.5 left-1/2 grid -translate-x-1/2 place-items-center rounded-full text-[10px] font-medium tnum",
            first
              ? "h-[19px] w-[19px] bg-azure text-obsidian"
              : "h-[17px] w-[17px] border border-azure/45 bg-azure/20 text-azure",
          )}
        >
          {place}
        </span>
      </div>

      <p className="mt-2.5 flex max-w-full items-center justify-center gap-1">
        <span className="min-w-0 truncate text-[14px] text-snow">{entry.name}</span>
        {entry.verified && <VerifiedTick name={entry.name} />}
      </p>
      {entry.region && (
        <p className="mt-0.5 max-w-full truncate text-[11px] text-mist-dim">{entry.region}</p>
      )}

      <p className={cn("tnum mt-2 font-light leading-none text-azure", first ? "text-[22px]" : "text-[19px]")}>
        {entry.value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-mist-dim">{metricLabel}</p>
    </div>
  );
}

/**
 * A ranked row.
 *
 * The athlete's own row is filled azure with an azure left edge, and it shows
 * whatever their real figure is — including 0. A board that hid a zero from the
 * person who scored it would be flattering them rather than telling them where
 * they stand, which is the only reason to open this screen.
 */
function BoardRow({
  entry,
  metricLabel,
  first,
}: {
  entry: BoardEntry;
  metricLabel: string;
  first: boolean;
}) {
  return (
    <Link
      to={`/social/people/${entry.athleteId}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3 transition-colors",
        !first && "border-t border-hairline",
        entry.isYou
          ? "border-l-2 border-l-azure bg-azure/[0.07] pl-[14px]"
          : "hover:bg-white/[0.03]",
      )}
    >
      <span className="tnum w-5 shrink-0 text-[13px] text-mist">{entry.rank}</span>
      <EntryAvatar entry={entry} size={34} />

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="min-w-0 truncate text-[14px] text-snow">{entry.name}</span>
          {entry.verified && <VerifiedTick name={entry.name} />}
        </span>
        {entry.region && (
          <span className="mt-0.5 block truncate text-[11px] text-mist-dim">{entry.region}</span>
        )}
      </span>

      <span className="shrink-0 text-right">
        <span className="tnum block text-[15px] font-light leading-none text-azure">
          {entry.value}
        </span>
        <span className="mt-1 block text-[9.5px] uppercase tracking-[0.1em] text-mist-dim">
          {metricLabel}
        </span>
      </span>
      <ChevronRight size={15} strokeWidth={1.6} className="shrink-0 text-mist-dim" />
    </Link>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tnum text-[17px] font-light leading-none text-snow">{value}</p>
      <p className="mt-1.5 text-[9.5px] uppercase tracking-[0.1em] text-mist-dim">{label}</p>
    </div>
  );
}
