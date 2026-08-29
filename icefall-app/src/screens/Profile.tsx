import {
  BadgeCheck,
  Camera,
  ChevronRight,
  Compass,
  Info,
  Lock,
  MapPin,
  Bookmark,
  MoreHorizontal,
  Pencil,
  Mountain,
  MoveUp,
  RotateCcw,
  Settings,
  Share2,
  Trash2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Divider, SectionLabel, Stat, sharePage } from "@/components/ui/primitives";
import { BadgeHex } from "@/components/domain/BadgeHex";
import { MountainThumb } from "@/components/domain/MountainImage";
import { TrailShape } from "@/components/domain/TrailShape";
import { MountainCvSheet, passportSpreads } from "@/components/passport/PassportPages";
import { UNAVAILABLE_COPY } from "@/components/coach/DataState";
import { OwnPostCard } from "@/components/domain/PostComposer";
import { SummitLogCard } from "@/components/domain/SummitLogKit";
import { useOwnPosts } from "@/social/posts";
import { useSummitLogs } from "@/social/summitLog";
import { PassportBook } from "@/components/passport/PassportBook";
import { usePassport } from "@/passport/usePassport";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { BADGES, badgeById, badgeState } from "@/badges/model";
import { useSettings } from "@/settings/store";
import { readBanner } from "@/lib/image";
import { useFollowing } from "@/profile/following";
import { encodeProfile, profileLink, type SharedProfile } from "@/profile/shareLink";
import { cn } from "@/lib/utils";
import { fmtDate, fmtDistance, fmtElevation, fmtHours } from "@/lib/format";
import { useApp } from "@/state/AppState";
import { useAthleteTotals, useLifetimePoints, useRecordedActivities } from "@/tracking/feed";
import { ACHIEVEMENT_CATALOGUE } from "@/tracking/records";
import { loadMeta } from "@/tracking/store";

type Tab = "posts" | "summits" | "activities" | "passport" | "stats";

/** The height of the photographic head, before the status-bar inset is added. */
const BANNER_H = 250;
/** The status-bar inset, resolved the way `Screen` resolves it (chrome.tsx). */
const SAFE_TOP = "var(--screen-safe-top, env(safe-area-inset-top, 0px))";

/**
 * ICEFALL has no accounts and no server, so nobody can follow anybody. Those two
 * figures are therefore unknown rather than zero — a zero would claim a real
 * count of nought. The one social number that IS real is the cards this athlete
 * has saved, which the strip prints under CONNECTIONS.
 */
const NO_SOCIAL_GRAPH =
  "ICEFALL has no accounts, so nobody can follow you and there is nobody to follow. Cards you have saved are counted under Connections.";

/** One figure in the six-across strip. An unknown value is an em dash, never 0. */
function ProfileFigure({
  value,
  unit,
  label,
  hint,
  info,
}: {
  value: string;
  unit?: string;
  label: string;
  hint?: string;
  info?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 px-[1px] text-center">
      <p className="flex items-baseline justify-center gap-[2px]" title={hint}>
        <span className="tnum text-[19px] font-light leading-none tracking-[-0.02em] text-snow">
          {value}
        </span>
        {unit && <span className="text-[10px] text-mist-dim">{unit}</span>}
      </p>
      {/* 8px rather than the mockup's 9: six labels across a 375px handset, and
          CONNECTIONS is one unbreakable word. It is the label that gives, not
          the figure above it. */}
      <p className="mt-1.5 flex items-center justify-center gap-[2px] text-[8px] uppercase leading-[1.3] tracking-[0.02em] text-mist-dim">
        {label}
        {info}
      </p>
      {hint && <span className="sr-only">{hint}</span>}
    </div>
  );
}

/** A graphite row: leading mark, two lines of text, chevron. */
function ActionRow({
  lead,
  title,
  detail,
  eyebrow,
  onClick,
  to,
}: {
  lead: React.ReactNode;
  title: string;
  detail?: string;
  eyebrow?: string;
  onClick?: () => void;
  to?: string;
}) {
  const inner = (
    <>
      {lead}
      <span className="min-w-0 flex-1">
        {eyebrow && <span className="block text-[12px] leading-tight text-azure">{eyebrow}</span>}
        <span className={cn("block truncate text-[15px] text-snow", eyebrow && "mt-0.5")}>
          {title}
        </span>
        {detail && <span className="mt-0.5 block text-[12px] text-mist">{detail}</span>}
      </span>
      <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
    </>
  );
  const cls =
    "flex w-full items-center gap-3 rounded-card border border-hairline bg-graphite p-3 text-left transition-colors hover:border-azure/40";

  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** One line of the passport summary: azure-ringed mark, caps label, value. */
function PassportRow({
  icon: Icon,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 py-2 text-left"
    >
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border border-azure/40 text-azure">
        <Icon size={12} strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] uppercase tracking-[0.12em] text-mist-dim">{label}</span>
        <span className="mt-0.5 block truncate text-[13px] text-snow">{value}</span>
      </span>
      <ChevronRight size={14} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
    </button>
  );
}

/**
 * Screen 16 — athlete identity.
 *
 * Laid out to the supplied mockup: a photographic head, the identity over it,
 * six figures, the objective, the share row, the badges, the passport, then a
 * tabbed body. The long single scroll it replaced put the passport, the stats,
 * every summit, ten achievement tiles and six link rows on one page, so nothing
 * had any weight.
 *
 * FOUR THINGS ON THE MOCKUP DO NOT EXIST AS DATA, AND NONE IS INVENTED HERE:
 *
 *   · FOLLOWERS and FOLLOWING. ICEFALL has no accounts and no server, so no
 *     count exists — both print an em dash with the reason on them. The only
 *     real social figure is the cards this athlete saved, under CONNECTIONS.
 *   · The verified tick renders only when the server-granted `verified` badge
 *     is actually earned. Nothing in this build can reach that state.
 *   · The PRO pill renders only for a genuinely held paid tier.
 *   · HIGHEST is an em dash until a summit has been logged with an elevation —
 *     the mockup shows the dash, and the dash is correct.
 */
export default function Profile() {
  const { user, goals, resetAll, currentTier } = useApp();
  const { settings, patch } = useSettings();
  const bannerInput = useRef<HTMLInputElement | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [readyInfo, setReadyInfo] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const { people } = useFollowing();
  const stats = useAthleteTotals();
  const points = useLifetimePoints();
  const recorded = useRecordedActivities();
  const myPosts = useOwnPosts();
  const myLogs = useSummitLogs();
  const [passportOpen, setPassportOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("posts");

  const passport = usePassport();
  const spreads = useMemo(() => passportSpreads(passport), [passport]);

  /* -- The three passport figures, taken from the absence layer verbatim.
        "Not reported", "Not enough data" and a self-declared level such as
        "New to the mountains" are the honest answers when there is no data;
        none of them may be swapped for a zero, a dash or an estimate. -- */
  const passportSummits =
    passport.summits.length === 0
      ? UNAVAILABLE_COPY[passport.summitsReason ?? "not-reported"].title
      : String(passport.summits.length);
  const passportHighest =
    passport.highestAltitude.metres === null
      ? UNAVAILABLE_COPY[passport.highestAltitude.reason ?? "no-data"].title
      : `${fmtElevation(passport.highestAltitude.metres)} m`;
  const passportTechnical =
    passport.technicalLevel.label ??
    UNAVAILABLE_COPY[passport.technicalLevel.reason ?? "not-reported"].title;

  const achievements = useMemo(() => {
    const earnedIds = loadMeta().earnedAchievements;
    return ACHIEVEMENT_CATALOGUE.map((a) => ({
      ...a,
      locked: !earnedIds.includes(a.id),
    })).sort((a, b) => Number(a.locked) - Number(b.locked));
  }, [recorded]);

  const objective = goals.find((g) => g.status === "active");
  const highestM = user.summits.reduce((m, s) => Math.max(m, s.elevationM ?? 0), 0);
  const handle =
    settings.username || (user.name ?? "athlete").toLowerCase().replace(/[^a-z0-9]/g, "");
  const earnedBadges = BADGES.filter(
    (b) => badgeState(b, settings, currentTier).kind === "earned",
  );

  /* -- The tick and the pill. Both are claims about this person that ICEFALL
        would have to have checked, so both read from the same places the rest
        of the app reads them: the badge model (which no client code can set to
        `earned`) and the live subscription tier. Neither is ever assumed. -- */
  const verified = badgeState(badgeById("verified"), settings, currentTier).kind === "earned";
  const tierLabel = currentTier === "free" ? null : currentTier;
  const location = settings.region || user.homeBase || undefined;

  const shared: SharedProfile = {
    v: 1,
    name: user.name,
    handle,
    bio: settings.bio || undefined,
    region: settings.region || user.homeBase || undefined,
    objective: objective
      ? {
          name: objective.name,
          when: fmtDate(objective.targetDate, { day: undefined }),
          preparationPct: objective.preparation,
        }
      : undefined,
    summits: user.summits.length,
    highestM: highestM || undefined,
    badges: earnedBadges.map((b) => b.id),
    at: new Date().toISOString(),
  };

  return (
    <Screen padded={false}>
      {/* ---- Head ---------------------------------------------------------
          The athlete's own banner when they have set one, and a bundled alpine
          plate until they do. The fallback is deliberately a photograph of a
          MOUNTAIN and not of a person: it is scenery standing in for scenery,
          which nobody can mistake for a claim about who they are. */}
      <div
        className="relative overflow-hidden"
        style={{
          // Pulled up under the status bar and given the inset back as height,
          // so the photograph bleeds to the physical top edge and the controls
          // still clear the notch. `Screen` has already applied the inset as
          // padding (the --screen-safe-top contract in chrome.tsx); cancelling
          // it here is what stops it being counted twice.
          marginTop: `calc(-1 * ${SAFE_TOP})`,
          height: `calc(${BANNER_H}px + ${SAFE_TOP})`,
        }}
      >
        <img
          src={settings.cover || "/img/mont-blanc-2.jpg"}
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-80"
        />
        {/* Fades into the canvas at the lower edge rather than stopping at it. */}
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/45 to-obsidian/10" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-obsidian to-transparent" />

        {menuOpen && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 z-10 cursor-default"
          />
        )}

        <div
          className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-5"
          style={{ paddingTop: `calc(${SAFE_TOP} + 12px)` }}
        >
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-obsidian/55 text-snow backdrop-blur transition-colors hover:bg-obsidian/80"
          >
            <Settings size={17} strokeWidth={1.6} />
          </Link>

          <div className="relative flex items-center gap-2">
            <Link
              to="/profile/saved"
              aria-label="Saved trails"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-obsidian/55 text-snow backdrop-blur transition-colors hover:bg-obsidian/80"
            >
              <Bookmark size={16} strokeWidth={1.7} />
            </Link>
            <button
              type="button"
              onClick={() => sharePage(`${user.name} · ICEFALL`, profileLink(shared))}
              aria-label="Share profile"
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-obsidian/55 text-snow backdrop-blur transition-colors hover:bg-obsidian/80"
            >
              <Share2 size={16} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More"
              aria-expanded={menuOpen}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-obsidian/55 text-snow backdrop-blur transition-colors hover:bg-obsidian/80"
            >
              <MoreHorizontal size={17} strokeWidth={1.6} />
            </button>

            {/* The banner controls the mockup has no room for. They are real
                features, so they move into the "…" rather than disappearing. */}
            {menuOpen && (
              <div className="absolute right-0 top-11 w-[188px] overflow-hidden rounded-card border border-hairline-strong bg-graphite/95 backdrop-blur">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    bannerInput.current?.click();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-slate/60"
                >
                  <Camera size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                  Change banner
                </button>
                {settings.cover && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      patch({ cover: undefined });
                    }}
                    className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-3 text-left text-[13px] text-snow transition-colors hover:bg-slate/60"
                  >
                    <Trash2 size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                    Remove banner
                  </button>
                )}
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 border-t border-hairline px-3.5 py-3 text-[13px] text-snow transition-colors hover:bg-slate/60"
                >
                  <Settings size={14} strokeWidth={1.7} className="shrink-0 text-mist" />
                  Settings
                </Link>
              </div>
            )}
          </div>
        </div>

        <input
          ref={bannerInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBannerError(null);
            try {
              patch({ cover: await readBanner(file) });
            } catch (err) {
              setBannerError((err as { message?: string })?.message ?? "That image couldn't be read.");
            }
          }}
        />
      </div>

      <Stagger className="px-5 pb-6">
        {/* ---- Identity — overlapping the foot of the photograph ----------- */}
        <Rise>
          <div className="relative -mt-[54px] w-[104px]">
            <span className="relative grid h-[104px] w-[104px] place-items-center overflow-hidden rounded-full border-[3px] border-obsidian bg-slate text-[30px] font-light text-mist ring-1 ring-snow/25">
              {/* The initial sits underneath and the photo covers it, so a
                  stored avatar that no longer decodes falls back to a letter
                  rather than to the browser's broken-image glyph. */}
              {user.name.slice(0, 1).toUpperCase()}
              {settings.avatar && !avatarBroken && (
                <img
                  src={settings.avatar}
                  alt=""
                  aria-hidden
                  onError={() => setAvatarBroken(true)}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </span>
            {/* Only for a tier the athlete actually holds. */}
            {tierLabel && (
              <span className="absolute -bottom-[7px] left-1/2 -translate-x-1/2 rounded-full border-2 border-obsidian bg-azure px-2 py-[2px] text-[10px] font-medium uppercase leading-none tracking-[0.12em] text-obsidian">
                {tierLabel}
              </span>
            )}
            {/* Direct path to editing your own profile — it existed only three
                taps deep inside Settings before this. */}
            <Link
              to="/settings/profile"
              aria-label="Edit profile"
              className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full border-2 border-obsidian bg-elevated text-snow transition-colors hover:bg-slate"
            >
              <Pencil size={13} strokeWidth={1.9} />
            </Link>
          </div>

          <div className="mt-4 flex items-center gap-1.5">
            <h1 className="min-w-0 truncate text-[30px] font-light leading-tight text-snow">
              {user.name}
            </h1>
            {/* Server-granted only. Nothing on this device can set it. */}
            {verified && (
              <span className="shrink-0 text-azure" title="Verified by ICEFALL">
                <BadgeCheck size={19} strokeWidth={1.8} aria-hidden />
                <span className="sr-only">Verified by ICEFALL</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[14px] text-mist">@{handle}</p>
          {location && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-mist">
              <MapPin size={12.5} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
              {location}
            </p>
          )}
          {settings.bio && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{settings.bio}</p>
          )}
          {bannerError && <p className="mt-2 text-[11.5px] text-danger">{bannerError}</p>}
        </Rise>

        {/* ---- The six figures --------------------------------------------- */}
        <Rise className="pt-5">
          {/* Pulled out past the page margin: six figures need every pixel. */}
          <div className="-mx-3 flex items-start">
            <ProfileFigure value="—" label="Followers" hint={NO_SOCIAL_GRAPH} />
            <ProfileFigure value="—" label="Following" hint={NO_SOCIAL_GRAPH} />
            <ProfileFigure
              value={String(people.length)}
              label="Connections"
              hint="Cards you have saved from a shared profile link. They are held on this device."
            />
            <span aria-hidden className="mx-1 mt-1 h-9 w-px shrink-0 bg-hairline-strong" />
            <ProfileFigure
              value={String(user.summits.length)}
              label="Summits"
              hint="Summits you have logged yourself. ICEFALL verifies none of them."
            />
            <ProfileFigure
              value={highestM ? fmtElevation(highestM) : "—"}
              unit={highestM ? "m" : undefined}
              label="Highest"
              hint={
                highestM
                  ? "The highest elevation among your logged summits."
                  : "No logged summit carries an elevation, so there is nothing to report."
              }
            />
            <ProfileFigure
              value={objective ? `${Math.round(objective.preparation)}%` : "—"}
              label={objective ? `${objective.name.split(" ")[0]} ready` : "Ready"}
              info={
                <button
                  type="button"
                  onClick={() => setReadyInfo((v) => !v)}
                  aria-expanded={readyInfo}
                  aria-label="What this figure means"
                  className="shrink-0 text-mist-dim transition-colors hover:text-snow"
                >
                  <Info size={10} strokeWidth={2} aria-hidden />
                </button>
              }
            />
          </div>
          {readyInfo && (
            <p className="mt-3 border-l border-azure/30 pl-3 text-[11px] leading-relaxed text-mist-dim">
              {objective
                ? `Completion of the training plan ICEFALL built for ${objective.name}. It measures the plan, not the mountain, and it clears nobody to attempt anything.`
                : "No objective is set, so there is no training plan to measure."}
            </p>
          )}
        </Rise>

        {/* ---- Objective --------------------------------------------------- */}
        {objective && (
          <Rise className="pt-5">
            <ActionRow
              to="/goals"
              eyebrow="Main objective"
              title={`${objective.name} · ${fmtDate(objective.targetDate, { day: undefined })}`}
              lead={
                <MountainThumb
                  size={44}
                  peak={{
                    name: objective.name,
                    elevationM: objective.elevationM,
                    lat: objective.lat,
                    lon: objective.lon,
                    curatedId: objective.mountainId,
                    wikipedia: objective.wikipedia,
                    photo: objective.photo,
                  }}
                />
              }
            />
          </Rise>
        )}

        {/* ---- Share ------------------------------------------------------- */}
        <Rise className="pt-3">
          <ActionRow
            onClick={() => sharePage(`${user.name} · ICEFALL`, profileLink(shared))}
            title="Share Profile"
            detail="Let others follow your journey"
            lead={
              <span className="grid h-[44px] w-[44px] shrink-0 place-items-center rounded-tile border border-azure/35 bg-azure/[0.07] text-azure">
                <Share2 size={17} strokeWidth={1.7} />
              </span>
            }
          />
          <Link
            to={`/p#${encodeProfile(shared)}`}
            className="mt-2 block text-center text-[11px] text-mist-dim underline-offset-2 hover:underline"
          >
            Preview the card other people open
          </Link>
        </Rise>

        {/* ---- Badges ------------------------------------------------------
            State comes from `badgeState` and nowhere else: no badge is earned
            on this device, and the row only ever DISPLAYS what that model says.
            Unearned reads as a dimmed, desaturated hexagon. */}
        <Rise className="pt-7">
          <div className="flex items-center justify-between">
            <SectionLabel>Badges</SectionLabel>
            <Link
              to="/profile/badges"
              className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
            >
              View all
              <ChevronRight size={13} strokeWidth={1.9} />
            </Link>
          </div>
          <div className="mt-3.5 flex items-start justify-between gap-1">
            {BADGES.slice(0, 5).map((b) => {
              const earned = badgeState(b, settings, currentTier).kind === "earned";
              return (
                <Link
                  key={b.id}
                  to="/profile/badges"
                  aria-label={`${b.name} — ${earned ? "earned" : "not earned"}`}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
                >
                  <BadgeHex
                    badge={b}
                    size={54}
                    tone="azure"
                    muted={!earned}
                    className={cn(!earned && "opacity-70 saturate-[0.4]")}
                  />
                  <span
                    className={cn(
                      "text-center text-[10px] leading-[1.25]",
                      earned ? "text-mist" : "text-mist-dim",
                    )}
                  >
                    {b.name}
                  </span>
                </Link>
              );
            })}
          </div>
          {earnedBadges.length === 0 && (
            <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
              None earned yet — ICEFALL grants no badge automatically, and none is granted on this
              device.
            </p>
          )}
        </Rise>

        {/* ---- Mountain passport -------------------------------------------
            Closed, the booklet renders as the portrait cover the mockup shows,
            with the record summarised beside it; pressed, it opens in place.
            The three values on the right are printed from the absence layer,
            so a figure ICEFALL does not hold says why rather than showing a
            number nobody supplied. */}
        <Rise className="pt-7">
          <div className="flex items-center justify-between">
            <SectionLabel>Mountain Passport</SectionLabel>
            <button
              type="button"
              onClick={() => setPassportOpen((v) => !v)}
              aria-expanded={passportOpen}
              className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
            >
              {passportOpen ? "Close passport" : "View passport"}
              <ChevronRight size={13} strokeWidth={1.9} />
            </button>
          </div>

          <div
            className={cn(
              "mt-2",
              !passportOpen && "grid grid-cols-[45%_1fr] items-start gap-1.5",
            )}
          >
            <PassportBook
              passport={passport}
              open={passportOpen}
              onOpenChange={setPassportOpen}
              spreads={spreads}
              coverDense={!passportOpen}
              className={cn(passportOpen && "mx-auto w-full max-w-[312px]")}
            />

            {!passportOpen && (
              <div className="pt-3">
                <p className="text-[12px] leading-relaxed text-mist">
                  A record you keep of your own mountaineering. ICEFALL verifies none of it.
                </p>
                <div className="mt-2 divide-y divide-hairline">
                  <PassportRow
                    icon={Mountain}
                    label="Summits"
                    value={passportSummits}
                    onClick={() => setPassportOpen(true)}
                  />
                  <PassportRow
                    icon={MoveUp}
                    label="Highest"
                    value={passportHighest}
                    onClick={() => setPassportOpen(true)}
                  />
                  <PassportRow
                    icon={Compass}
                    label="Technical"
                    value={passportTechnical}
                    onClick={() => setPassportOpen(true)}
                  />
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCvOpen(true)}
            className="mt-3 block w-full text-center text-[11.5px] text-mist-dim underline-offset-2 transition-colors hover:text-snow hover:underline"
          >
            View mountain CV
          </button>
          <MountainCvSheet passport={passport} open={cvOpen} onClose={() => setCvOpen(false)} />
        </Rise>

        {/* ---- Tabs -------------------------------------------------------- */}
        <Rise className="pt-7">
          <div className="flex gap-6 border-b border-hairline">
            {(
              [
                ["posts", "Posts"],
                ["summits", "Summits"],
                ["activities", "Activities"],
                ["passport", "Passport"],
                ["stats", "Stats"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "-mb-px border-b-2 pb-2.5 text-[11px] uppercase tracking-[0.12em] transition-colors",
                  tab === id
                    ? "border-azure text-snow"
                    : "border-transparent text-mist-dim hover:text-mist",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Rise>

        {tab === "posts" && (
          <PostsTab
            posts={myPosts}
            logs={myLogs}
            recorded={recorded}
            author={{
              name: user.name,
              region: settings.region || user.homeBase || undefined,
              avatar: settings.avatar,
            }}
          />
        )}
        {tab === "activities" && <ActivityTab recorded={recorded} />}
        {tab === "summits" && <SummitsTab summits={user.summits} />}
        {tab === "stats" && (
          <StatsTab
            stats={stats}
            points={points}
            level={user.level}
            xp={user.xp}
            xpToNext={user.xpToNext}
            achievements={achievements}
          />
        )}
        {tab === "passport" && (
          <Rise className="pt-5">
            <p className="text-[12.5px] leading-relaxed text-mist-dim">
              A record you keep of your own mountaineering. ICEFALL verifies none of it.
            </p>
          </Rise>
        )}

        {/* ---- Links ------------------------------------------------------- */}
        <Rise className="pt-7">
          <Card className="overflow-hidden p-0">
            {[
              { to: "/goals", title: "Goals", detail: `${goals.filter((g) => g.status === "active").length} active` },
              { to: "/daily", title: "Daily & Health", detail: "Steps, energy, recovery" },
              { to: "/gear", title: "Gear", detail: "Locker & catalogue" },
              { to: "/activity/history", title: "Activity history", detail: `${recorded.length} sessions` },
              { to: "/settings", title: "Settings", detail: "Account, privacy, units" },
            ].map((row, i) => (
              <Link
                key={row.to}
                to={row.to}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate/40",
                  i > 0 && "border-t border-hairline",
                )}
              >
                <span className="min-w-0 flex-1 text-[14px] text-snow">{row.title}</span>
                <span className="shrink-0 text-[12px] text-mist-dim">{row.detail}</span>
                <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
              </Link>
            ))}
          </Card>
        </Rise>

        <Rise className="pt-6">
          <button
            type="button"
            onClick={resetAll}
            className="flex items-center gap-2 text-[12px] text-mist-dim transition-colors hover:text-danger"
          >
            <RotateCcw size={13} strokeWidth={1.8} />
            Reset all local data
          </button>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

function ActivityTab({ recorded }: { recorded: ReturnType<typeof useRecordedActivities> }) {
  if (recorded.length === 0) {
    return (
      <Rise className="pt-5">
        <p className="text-[12.5px] leading-relaxed text-mist-dim">
          Nothing recorded yet. Sessions you track appear here with their line, distance, climb and
          moving time.
        </p>
      </Rise>
    );
  }
  return (
    <>
      {recorded.slice(0, 8).map((r) => (
        <Rise key={r.id} className="pt-3">
          <Link
            to={`/activity/${r.id}`}
            className="block overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-hairline-strong"
          >
            <div className="relative h-[132px] bg-slate">
              {r.points && r.points.length > 1 && (
                <div className="absolute inset-0 grid place-items-center">
                  <TrailShape
                    line={r.points.map((p) => ({ lat: p.lat, lon: p.lon }))}
                    width={280}
                    height={110}
                  />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-graphite via-transparent to-transparent" />
            </div>
            <div className="p-4">
              <p className="text-[15px] text-snow">{r.title}</p>
              <p className="mt-0.5 text-[11.5px] text-mist-dim">
                {fmtDate(r.startedAt, { day: "numeric" })}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat value={fmtDistance(r.distanceM / 1000, 1)} unit="km" label="Distance" />
                <Stat
                  value={`+${fmtElevation(r.elevationGainM)}`}
                  unit="m"
                  label="Elevation gain"
                />
                <Stat value={fmtHours(r.movingSec / 3600)} label="Moving time" />
              </div>
            </div>
          </Link>
        </Rise>
      ))}
    </>
  );
}

function SummitsTab({ summits }: { summits: { name: string; date?: string; elevationM?: number }[] }) {
  if (summits.length === 0) {
    return (
      <Rise className="pt-5">
        <p className="text-[12.5px] leading-relaxed text-mist-dim">
          No summits logged. This list is yours to keep — ICEFALL verifies none of it.
        </p>
      </Rise>
    );
  }
  return (
    <Rise className="pt-4">
      <Card className="overflow-hidden p-0">
        {summits.map((s, i) => (
          <div
            key={`${s.name}-${i}`}
            className={cn("flex items-center gap-3 px-4 py-3.5", i > 0 && "border-t border-hairline")}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] text-snow">{s.name}</span>
              {s.date && (
                <span className="mt-0.5 block text-[11.5px] text-mist-dim">
                  {fmtDate(s.date, { day: "numeric" })}
                </span>
              )}
            </span>
            {s.elevationM != null && (
              <span className="tnum shrink-0 text-[13px] text-mist">
                {fmtElevation(s.elevationM)} m
              </span>
            )}
          </div>
        ))}
      </Card>
    </Rise>
  );
}

/** Level and XP live here now — real progression, just not what the page leads with. */
function StatsTab({
  stats,
  points,
  level,
  xp,
  xpToNext,
  achievements,
}: {
  stats: ReturnType<typeof useAthleteTotals>;
  points: number;
  level: number;
  xp: number;
  xpToNext: number;
  achievements: { id: string; name: string; locked: boolean }[];
}) {
  const xpPct = Math.min(100, (xp / xpToNext) * 100);
  return (
    <>
      <Rise className="pt-5">
        <div className="grid grid-cols-2 gap-3">
          <Stat size="lg" value={String(stats.activities)} label="Activities" />
          <Stat size="lg" value={fmtDistance(stats.distanceKm, 0)} unit="km" label="Distance" />
          <Stat size="lg" value={fmtElevation(stats.elevationM)} unit="m" label="Elevation gain" />
          <Stat size="lg" value={fmtHours(stats.timeHours)} label="Time" />
        </div>

        {/* These four used to open at 128 activities, 1,245 km, 78,540 m and
            156 hours on a fresh install, inherited from the demo athlete. They
            now start at nothing, which is correct and reads harshly without a
            sentence saying what they count and what they do not. */}
        <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">
          {stats.activities === 0
            ? "Nothing recorded yet. These count what you record in ICEFALL — they do not include anything you climbed before installing it."
            : "Counted from what you have recorded in ICEFALL. Anything you climbed before installing it is not included."}
        </p>
      </Rise>

      {/* `xpToNext === 0` means no progression model is running — see the note
          in `state/AppState.tsx`. The bar is not drawn empty and the level is
          not printed as 1, because both would still be presenting a system that
          does not exist. Points are shown either way: those are awarded per
          recorded activity and are the one earned figure on this screen. */}
      <Rise className="pt-6">
        {xpToNext > 0 ? (
          <>
            <div className="flex items-baseline justify-between">
              <SectionLabel>Level {level}</SectionLabel>
              <span className="tnum text-[11.5px] text-mist-dim">
                {xp.toLocaleString("en-GB")} XP
                {points > 0 && ` · ${points.toLocaleString("en-GB")} pts`}
              </span>
            </div>
            <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-azure" style={{ width: `${xpPct}%` }} />
            </div>
            <p className="tnum mt-2 text-[10.5px] text-mist-dim">
              {(xpToNext - xp).toLocaleString("en-GB")} XP to level {level + 1}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <SectionLabel>Points</SectionLabel>
              <span className="tnum text-[11.5px] text-mist-dim">
                {points.toLocaleString("en-GB")} pts
              </span>
            </div>
            {/* Copy stays about the product. Why the level went is an argument
                for `state/AppState.tsx`, not for the athlete's Profile. */}
            <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
              Awarded for what you record. ICEFALL has no levels and no XP — a level would be a
              claim about you, and there is no system behind one to earn.
            </p>
          </>
        )}
      </Rise>

      <Rise className="pt-6">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Achievements</SectionLabel>
          <span className="tnum text-[11.5px] text-mist-dim">
            {achievements.filter((a) => !a.locked).length} / {achievements.length}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {achievements.map((a) => (
            <div key={a.id} className="text-center">
              <div
                className={cn(
                  "grid h-[68px] place-items-center rounded-tile border",
                  a.locked ? "border-hairline bg-graphite" : "border-azure/45 bg-azure/[0.07]",
                )}
              >
                {a.locked ? (
                  <Lock size={15} strokeWidth={1.7} className="text-mist-dim" />
                ) : (
                  <span className="text-[18px] text-azure">✦</span>
                )}
              </div>
              <p className="mt-1.5 text-[10px] leading-tight text-mist-dim">{a.name}</p>
            </div>
          ))}
        </div>
      </Rise>
    </>
  );
}

/**
 * The profile's own feed — rule 13: another athlete opening this sees the posts
 * directly, with no hidden section to find. Logs and posts interleave by date,
 * because from the outside they are one stream of what this person has been
 * doing.
 */
function PostsTab({
  posts,
  logs,
  recorded,
  author,
}: {
  posts: ReturnType<typeof useOwnPosts>;
  logs: ReturnType<typeof useSummitLogs>;
  recorded: ReturnType<typeof useRecordedActivities>;
  author: { name: string; region?: string; avatar?: string };
}) {
  const stream = [
    ...posts.map((p) => ({ at: p.createdAt, node: <OwnPostCard post={p} author={author} recorded={recorded} /> , key: p.id })),
    ...logs.map((l) => ({ at: l.createdAt, node: <SummitLogCard log={l} author={author} />, key: l.id })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  if (stream.length === 0) {
    return (
      <Rise className="pt-5">
        <div className="rounded-card border border-hairline bg-graphite p-6 text-center">
          <p className="text-[15px] text-snow">Start the mountain journey</p>
          <p className="mx-auto mt-2 max-w-[260px] text-[12px] leading-relaxed text-mist-dim">
            Share your first climb, route or expedition.
          </p>
          <Link
            to="/explore/social"
            className="mt-4 inline-block rounded-card bg-azure px-5 py-3 text-[12.5px] uppercase tracking-[0.08em] text-obsidian transition-colors hover:bg-azure-bright"
          >
            Create post
          </Link>
        </div>
      </Rise>
    );
  }

  return (
    <>
      {stream.map((item) => (
        <Rise key={item.key} className="pt-3">
          {item.node}
        </Rise>
      ))}
    </>
  );
}

function PhotosTab() {
  return (
    <Rise className="pt-5">
      <p className="text-[12.5px] leading-relaxed text-mist-dim">
        No photographs yet. ICEFALL has no accounts and nothing is uploaded anywhere — when photo
        support ships, pictures you attach to a session will collect here.
      </p>
      <Divider className="mt-4" />
    </Rise>
  );
}
