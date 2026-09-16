/**
 * Home, rebuilt 1:1 to the owner's eight-state mockup boards (2026-09-16).
 *
 * The previous Home lives on in `screens/HomeClassic.tsx` (Settings → Home
 * layout). The shared top bar (profile, search, messages, bell) stays above it,
 * as on every tab — the owner's call after seeing the first pass without it. What each slot prints, and where the mockup's sample words could not
 * be derived, is documented in `useHomeModel.ts`. This file is layout only.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BarChart3,
  BookUser,
  Check,
  ChevronRight,
  Clock,
  Moon,
  Triangle,
  Watch,
} from "lucide-react";
import { Screen } from "@/components/layout/chrome";
import { MountainThumb, useMountainImage } from "@/components/domain/MountainImage";
import { PromotedCard } from "@/components/domain/PromotedCard";
import { SubscribeSheet, useSubscribeSheet } from "@/components/growth/SubscribeSheet";
import { IcefallMark } from "@/components/ui/IcefallMark";
import { READINESS_TEST_ROUTE } from "@/growth/readinessTest";
import { SESSION_FEELS, saveSessionFeel, useSessionFeel } from "@/home/sessionFeel";
import { HOME_STATE_IDS, type HomeStateId } from "@/home/homeState";
import { cn } from "@/lib/utils";
import { enterMountainMode } from "@/mountain/mode";
import { MOUNTAIN_PATHS } from "@/mountain/paths";
import { MOUNTAINS } from "@/data/mock/mountains";
import { sync } from "@/services/repository";
import { usePromotedHomeCard } from "@/social/promoted";
import {
  HOME_PHOTOS,
  useHomeModel,
  type DayMark,
  type ExploreItem,
  type HomeModel,
  type Photo,
  type PrepRow,
  type TodayCard,
} from "./useHomeModel";
import { sampleHomeModel } from "./homeSamples";

/** `/home?state=rest` etc. — design previews, on dev and demo builds only. */
const PREVIEWS_ALLOWED = import.meta.env.DEV || import.meta.env.VITE_ICEFALL_DEMO === "1";

export default function HomeNew() {
  const [params] = useSearchParams();
  const forced = params.get("state");
  const preview =
    PREVIEWS_ALLOWED && forced && (HOME_STATE_IDS as readonly string[]).includes(forced)
      ? (forced as HomeStateId)
      : null;

  const live = useHomeModel();
  const model = preview && sampleHomeModel ? sampleHomeModel(preview) : live;
  const subscribe = useSubscribeSheet();
  const promo = usePromotedHomeCard();

  const s = model.state;
  const heroFirst = s === "no-objective" || s === "new";
  const dim = s === "on-trip";

  return (
    <Screen padded={false}>
      {preview && (
        <div className="flex justify-end px-4 pb-2">
          <span className="rounded-full border border-hairline px-2.5 py-1 text-[10.5px] text-mist">
            Sample state — preview only
          </span>
        </div>
      )}

      {s === "no-objective" && <PickHero />}
      {s === "new" && <StartSimplyHero />}

      <div className={cn("px-4", heroFirst ? "pt-5" : "pt-1")}>
        {model.header && <HeaderCard header={model.header} />}

        {model.resume && (
          <Link
            to={model.resume.to}
            className="mt-3 flex items-center gap-2 rounded-[12px] border border-azure/40 px-3.5 py-3 text-[14px] text-azure"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-azure" />
            Activity in progress
            <span className="ml-auto flex items-center gap-0.5">
              Resume <ChevronRight size={15} />
            </span>
          </Link>
        )}

        {model.today && <TodaySection card={model.today} labelled={labelsToday(model)} />}

        {model.passport && (
          <Link to={model.passport.to} className="mt-2 flex items-center gap-3 border-b border-hairline py-4">
            <BookUser size={24} strokeWidth={1.6} className="text-azure" />
            <span className="text-[15px] text-snow/90">{model.passport.label}</span>
          </Link>
        )}

        <div className={cn(dim && "pointer-events-none opacity-40")} aria-hidden={dim || undefined}>
          {model.readiness && <ReadinessRow r={model.readiness} />}
          {model.week && <WeekRow week={model.week} />}
        </div>

        {model.coach && <CoachRow coach={model.coach} />}

        {model.explore && (
          <div className={cn(dim && "opacity-40")}>
            <ExploreBlock section={model.explore} divided={Boolean(model.readiness || model.week || model.coach)} />
          </div>
        )}

        {s === "new" && (
          <p className="mx-auto mt-4 max-w-[30ch] text-center text-[13px] leading-snug text-mist">
            This home screen will fill out as you add an objective and your training context.
          </p>
        )}

        {!preview && promo.state === "ready" && promo.card && (
          <div className="pt-7">
            <PromotedCard
              key={promo.card.id}
              card={promo.card}
              onDismiss={promo.dismiss}
              onShown={promo.markShown}
            />
          </div>
        )}
      </div>

      {!preview && subscribe.open && <SubscribeSheet onDismiss={subscribe.dismiss} />}
    </Screen>
  );
}

/** The mockup labels TODAY above plan cards only — not over trip prep, the trip, or a return. */
function labelsToday(model: HomeModel): boolean {
  const k = model.today?.kind;
  return k === "session" || k === "feel" || k === "rest";
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function SectionLabel({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <p className="text-[12.5px] font-medium uppercase tracking-[0.14em] text-snow/80">{children}</p>
      {aside}
    </div>
  );
}

function PhotoImg({ photo, className }: { photo: Photo; className?: string }) {
  return "src" in photo ? (
    <img src={photo.src} alt="" aria-hidden loading="lazy" className={cn("h-full w-full object-cover", className)} />
  ) : (
    <PeakImg peak={photo.peak} className={className} />
  );
}

function PeakImg({ peak, className }: { peak: Extract<Photo, { peak: unknown }>["peak"]; className?: string }) {
  const image = useMountainImage(peak);
  /* The lookup can land on a curated photograph by NAME as well as by id (a
     free-text "Matterhorn"), and hands it back without its credit — so the
     credit is found from the photograph itself, not from the id. */
  const credit =
    image.credit ??
    (peak.curatedId ? sync.mountainById(peak.curatedId)?.photoCredit : undefined) ??
    MOUNTAINS.find((m) => m.photo === image.src)?.photoCredit;
  const owed = credit && !/cc0|public domain/i.test(credit) ? credit : null;
  return (
    <>
      <img
        src={image.src}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn("h-full w-full object-cover", !image.real && "opacity-50", className)}
      />
      {owed && (
        <span className="on-dark absolute right-1.5 top-1.5 z-10 max-w-[80%] truncate rounded bg-black/45 px-1.5 py-0.5 text-[8.5px] text-white/75">
          {owed}
        </span>
      )}
    </>
  );
}

function HeaderCard({ header }: { header: NonNullable<HomeModel["header"]> }) {
  return (
    <Link
      to={header.to}
      className="flex items-center gap-3.5 rounded-[14px] border border-hairline bg-graphite p-2.5 pr-3.5"
    >
      <MountainThumb peak={header.peak} size={56} className="rounded-[9px]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold uppercase tracking-[0.06em] text-snow">
          {header.title}
        </p>
        {header.subtitle && <p className="tnum mt-1 truncate text-[14px] text-mist">{header.subtitle}</p>}
      </div>
      <ChevronRight size={20} strokeWidth={1.8} className="shrink-0 text-snow/80" />
    </Link>
  );
}

function PrimaryButton({
  to,
  children,
  caps,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  caps?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "flex h-[46px] w-full items-center justify-center rounded-[10px] bg-azure text-white transition-colors hover:bg-azure-bright",
        caps ? "text-[14.5px] font-medium uppercase tracking-[0.06em]" : "text-[16px] font-medium",
      )}
    >
      {children}
    </Link>
  );
}

/** A photograph card: picture on top, type on its lower edge, controls beneath. */
function PhotoCard({
  photo,
  height,
  overlay,
  children,
}: {
  photo: Photo;
  height: number;
  overlay: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-hairline bg-graphite">
      <div className="relative" style={{ height }}>
        <PhotoImg photo={photo} className="absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0E1219] via-[#0E1219]/45 to-transparent" />
        <div className="on-dark absolute inset-x-0 bottom-0 px-3.5 pb-3 text-white">{overlay}</div>
      </div>
      {children && <div className="on-dark bg-[#0E1219] px-3.5 pb-3.5 pt-1 text-white">{children}</div>}
    </div>
  );
}

/* ---- Heroes ---------------------------------------------------------------- */

/**
 * The mockup's full-width photograph for the two states with no objective.
 *
 * It begins BELOW the shared top bar rather than running up behind it: the
 * owner wants the profile, search, messages and bell on Home like every other
 * tab (2026-09-16), and a photograph under that bar would sit behind its icons.
 */
function TopHero({ src, children }: { src: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div className="absolute inset-0 overflow-hidden">
        <img src={src} alt="" aria-hidden className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/45 to-obsidian" />
      </div>
      <div className="on-dark type-scrim relative px-4 text-white">{children}</div>
    </div>
  );
}

function PickHero() {
  return (
    <TopHero src={HOME_PHOTOS.pickHero}>
      <div className="pt-[150px]">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.01em]">
          What are you building towards?
        </h1>
        <p className="mt-1.5 text-[15px] text-white/80">A clearer, fitter, more confident you.</p>
        <div className="mt-4 pb-1">
          <PrimaryButton to="/goals">Pick your mountain</PrimaryButton>
        </div>
      </div>
    </TopHero>
  );
}

function StartSimplyHero() {
  const rows = [
    { icon: Triangle, label: "Pick your mountain", to: "/goals" },
    { icon: BarChart3, label: "Take the free readiness test", to: READINESS_TEST_ROUTE },
    { icon: Watch, label: "Connect a watch", muted: " (optional)", to: "/settings/connections" },
  ];
  return (
    <>
      <TopHero src={HOME_PHOTOS.newHero}>
        <div className="pb-2 pt-[170px]">
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.015em]">Start simply.</h1>
          <p className="mt-1 text-[16px] text-azure-bright/90">Big mountains begin with a single step.</p>
        </div>
      </TopHero>
      <div className="space-y-2.5 px-4 pt-3">
        {rows.map((r) => (
          <Link
            key={r.label}
            to={r.to}
            className="flex h-[58px] items-center gap-4 rounded-[12px] border border-hairline bg-graphite px-4"
          >
            <r.icon size={24} strokeWidth={1.7} className="shrink-0 text-azure" />
            <span className="flex-1 text-[16px] text-snow">
              {r.label}
              {r.muted && <span className="text-mist">{r.muted}</span>}
            </span>
            <ChevronRight size={18} className="text-mist" />
          </Link>
        ))}
      </div>
    </>
  );
}

/* ---- Today ----------------------------------------------------------------- */

function TodaySection({ card, labelled }: { card: TodayCard; labelled: boolean }) {
  return (
    <section className={cn(labelled ? "mt-5" : "mt-3")}>
      {labelled && (
        <div className="mb-2.5">
          <SectionLabel>Today</SectionLabel>
        </div>
      )}
      <TodayBody card={card} />
    </section>
  );
}

function TodayBody({ card }: { card: TodayCard }) {
  switch (card.kind) {
    case "session": {
      const title = (
        <>
          <h2 className="text-[21px] font-medium leading-tight tracking-[-0.01em]">{card.title}</h2>
          {card.clock && (
            <p className="tnum mt-1.5 flex items-center gap-2 text-[15px]">
              <Clock size={17} strokeWidth={1.8} /> {card.clock}
            </p>
          )}
          {card.line && <p className="mt-1.5 text-[13.5px] text-white/75">{card.line}</p>}
        </>
      );
      return (
        <PhotoCard
          photo={card.photo}
          height={card.clock ? 250 : 220}
          overlay={card.to ? <Link to={card.to} className="block">{title}</Link> : title}
        >
          {card.note && <p className="mb-2.5 text-[11px] leading-snug text-white/55">{card.note}</p>}
          <div className="pt-2">
            <PrimaryButton to={card.start.to} caps>
              {card.start.label}
            </PrimaryButton>
          </div>
        </PhotoCard>
      );
    }
    case "feel":
      return <FeelCard date={card.date} photo={card.photo} />;
    case "rest":
      return (
        <PhotoCard
          photo={card.photo}
          height={240}
          overlay={
            <>
              <Moon size={26} strokeWidth={1.6} className="mb-3" />
              <h2 className="text-[21px] font-medium leading-tight">Rest day</h2>
              {card.line && <p className="mt-1.5 max-w-[30ch] text-[13.5px] text-white/80">{card.line}</p>}
            </>
          }
        >
          <Link
            to="/coach/check-in"
            className="mt-2 flex h-[46px] items-center justify-center gap-2 rounded-[10px] border border-white/25 text-[15px] text-white"
          >
            {card.checkedIn && <Check size={16} className="text-azure-bright" />}
            {card.checkedIn ? "Sleep logged today" : "Log how you slept"}
          </Link>
        </PhotoCard>
      );
    case "trip-prep":
      return <TripPrepCard card={card} />;
    case "on-trip":
      return (
        <PhotoCard
          photo={card.photo}
          height={270}
          overlay={
            <>
              <h2 className="text-[23px] font-medium leading-tight">{card.title}</h2>
              <p className="mt-1.5 text-[14.5px] text-white/80">Everything for today is in Mountain mode</p>
            </>
          }
        >
          <div className="pt-2">
            <PrimaryButton to={MOUNTAIN_PATHS.root} onClick={enterMountainMode} caps>
              Open Mountain mode
            </PrimaryButton>
          </div>
        </PhotoCard>
      );
    case "just-back":
      return (
        <PhotoCard
          photo={card.photo}
          height={300}
          overlay={
            <>
              <h2 className="text-[22px] font-medium leading-tight">{card.title}</h2>
              {card.line && <p className="mt-1.5 text-[14.5px] text-white/80">{card.line}</p>}
            </>
          }
        >
          <div className="pt-2">
            <PrimaryButton to={card.action.to}>{card.action.label}</PrimaryButton>
          </div>
        </PhotoCard>
      );
  }
}

function FeelCard({ date, photo }: { date: string; photo: Photo }) {
  const record = useSessionFeel(date);
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <PhotoCard
      photo={photo}
      height={190}
      overlay={<h2 className="text-[21px] font-medium leading-tight">How did it feel?</h2>}
    >
      <div className="grid grid-cols-2 gap-2 pt-2">
        {SESSION_FEELS.map((f) => {
          const on = record?.feel === f.value;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={on}
              onClick={() => saveSessionFeel(date, { feel: f.value })}
              className={cn(
                "h-[46px] rounded-[10px] border text-[15px] transition-colors",
                on ? "border-azure bg-azure/20 text-white" : "border-white/15 bg-white/[0.04] text-white/90",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {writing ? (
        <div className="mt-3">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-[10px] border border-white/15 bg-white/[0.04] p-3 text-[14px] text-white outline-none focus:border-azure/60"
          />
          <div className="mt-2 flex justify-end gap-4 text-[14px]">
            <button type="button" onClick={() => setWriting(false)} className="text-white/60">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                saveSessionFeel(date, { note: draft });
                setWriting(false);
              }}
              className="text-azure-bright"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-center">
          {record?.note && <p className="mb-1.5 text-[13px] text-white/70">“{record.note}”</p>}
          <button
            type="button"
            onClick={() => {
              setDraft(record?.note ?? "");
              setWriting(true);
            }}
            className="text-[14.5px] text-azure-bright underline underline-offset-4"
          >
            {record?.note ? "Edit note" : "Add a note"}
          </button>
        </div>
      )}
    </PhotoCard>
  );
}

function TripPrepCard({ card }: { card: Extract<TodayCard, { kind: "trip-prep" }> }) {
  return (
    <PhotoCard
      photo={card.photo}
      height={170}
      overlay={<h2 className="text-[26px] font-semibold leading-tight">Trip prep</h2>}
    >
      <ul className="divide-y divide-white/[0.07]">
        {card.rows.map((row) => (
          <PrepRowItem key={row.label} row={row} />
        ))}
      </ul>
      {card.block && <p className="pb-3 pt-2.5 text-[14.5px] text-white/80">{card.block}</p>}
      <PrimaryButton to={card.to}>Open trip prep</PrimaryButton>
    </PhotoCard>
  );
}

function PrepRowItem({ row }: { row: PrepRow }) {
  return (
    <li>
      <Link to={row.to} className="flex items-center gap-3 py-2.5">
        {row.tone === "alert" ? (
          <AlertCircle size={22} strokeWidth={2} className="text-alert" />
        ) : row.tone === "done" ? (
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-azure">
            <Check size={14} strokeWidth={3} className="text-white" />
          </span>
        ) : (
          <span className="h-[22px] w-[22px] rounded-full border-2 border-azure" />
        )}
        <span className={cn("flex-1 text-[15px]", row.tone === "alert" ? "text-alert" : "text-white")}>
          {row.label}
        </span>
        <ChevronRight size={18} className="text-white/60" />
      </Link>
    </li>
  );
}

/* ---- Readiness, week, coach ------------------------------------------------ */

function ReadinessRow({ r }: { r: NonNullable<HomeModel["readiness"]> }) {
  return (
    <Link to={r.to} className="mt-2 flex items-center gap-2.5 border-b border-hairline py-4">
      <BarChart3 size={20} strokeWidth={2.2} className="shrink-0 text-azure" />
      <span className="min-w-0 truncate text-[13.5px] text-mist">
        <span className="uppercase tracking-[0.08em]">Readiness</span>
        {r.word && <span> · {r.word}</span>}
        {r.tail && <span> · {r.tail}</span>}
      </span>
      <ChevronRight size={14} className="shrink-0 text-mist" />
    </Link>
  );
}

function WeekRow({ week }: { week: NonNullable<HomeModel["week"]> }) {
  return (
    <section className="border-b border-hairline py-4">
      <SectionLabel>This week</SectionLabel>
      <div className="mt-3 flex items-end gap-3">
        <ol className="flex flex-1 justify-between">
          {week.days.map((d, i) => (
            <li key={i} className="flex flex-col items-center gap-2">
              <span className="text-[12.5px] text-mist">{d.letter}</span>
              <DayDot mark={d.mark} />
            </li>
          ))}
        </ol>
        {week.summary && (
          <p className="tnum w-[92px] shrink-0 pb-0.5 text-right text-[12.5px] leading-snug text-mist">
            {week.summary}
          </p>
        )}
      </div>
    </section>
  );
}

function DayDot({ mark }: { mark: DayMark }) {
  const base = "grid h-[23px] w-[23px] place-items-center rounded-full";
  switch (mark) {
    case "done":
      return (
        <span className={cn(base, "bg-azure")}>
          <Check size={13} strokeWidth={3} className="text-white" />
        </span>
      );
    case "today":
      return (
        <span className={cn(base, "border-2 border-mist/60")}>
          <span className="h-[7px] w-[7px] rounded-full bg-mist" />
        </span>
      );
    case "upcoming":
      return (
        <span className={cn(base, "bg-white/[0.16]")}>
          <span className="h-[7px] w-[7px] rounded-full bg-snow/85" />
        </span>
      );
    case "missed":
      return <span className={cn(base, "border border-hairline-strong")} />;
    case "rest":
      return (
        <span className={base}>
          <span className="h-[5px] w-[5px] rounded-full bg-mist-dim" />
        </span>
      );
  }
}

function CoachRow({ coach }: { coach: NonNullable<HomeModel["coach"]> }) {
  const body = (
    <div className="flex items-center gap-4">
      <span className="grid h-[58px] w-[58px] shrink-0 place-items-center rounded-full border border-hairline bg-slate text-azure">
        <IcefallMark className="h-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-snug text-snow/90">“{coach.quote}”</p>
        {!coach.chevron && (
          <Link to="/coach/chat" className="mt-1.5 inline-flex items-center gap-0.5 text-[14.5px] text-azure">
            Ask the coach <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {coach.chevron && <ChevronRight size={18} className="shrink-0 text-mist" />}
    </div>
  );
  return (
    <section className="border-b border-hairline py-4">
      <SectionLabel>From your coach</SectionLabel>
      <div className="mt-3">
        {coach.chevron ? (
          <Link to="/coach/chat" className="block">
            {body}
          </Link>
        ) : (
          body
        )}
      </div>
    </section>
  );
}

/* ---- Explore --------------------------------------------------------------- */

function ExploreBlock({ section, divided }: { section: NonNullable<HomeModel["explore"]>; divided: boolean }) {
  return (
    <section className={cn(divided ? "pt-4" : "mt-5")}>
      <SectionLabel>{section.label}</SectionLabel>
      {section.kind === "next" && (
        <p className="mt-1.5 text-[12px] leading-snug text-mist-dim">{section.caption}</p>
      )}
      <div className="mt-3">
        {section.kind === "card" && <ExploreCard item={section.item} />}
        {section.kind === "tiles" && (
          <div className="grid grid-cols-3 gap-2">
            {section.items.map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="overflow-hidden rounded-[12px] border border-hairline bg-graphite"
              >
                <div className="relative h-[84px]">
                  <PhotoImg photo={item.photo} className="absolute inset-0" />
                </div>
                <div className="px-2.5 pb-2.5 pt-2">
                  <p className="truncate text-[14px] font-medium text-snow">{item.title}</p>
                  <p className="tnum text-[12.5px] text-mist">{item.figure}</p>
                  <p className="mt-1 truncate text-[11px] text-mist-dim">{item.line}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
        {section.kind === "next" && (
          <div className="grid grid-cols-2 gap-2.5">
            {section.items.map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="overflow-hidden rounded-[12px] border border-hairline bg-graphite"
              >
                <div className="relative h-[140px]">
                  <PhotoImg photo={item.photo} className="absolute inset-0" />
                </div>
                <div className="flex items-end gap-1 px-3 pb-3 pt-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="tnum truncate text-[14.5px] text-snow">
                      {item.title} · {item.figure}
                    </p>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-mist">{item.line}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-mist" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ExploreCard({ item }: { item: ExploreItem }) {
  return (
    <Link to={item.to} className="relative block h-[170px] overflow-hidden rounded-[16px] border border-hairline">
      <PhotoImg photo={item.photo} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      <div className="on-dark absolute inset-x-0 bottom-0 flex items-end gap-2 px-3.5 pb-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="tnum truncate">
            <span className="text-[21px] font-medium">{item.title}</span>
            {item.figure && <span className="text-[15px] text-white/90"> · {item.figure}</span>}
          </p>
          <p className="mt-0.5 truncate text-[13.5px] text-white/80">{item.line}</p>
        </div>
        <ChevronRight size={18} className="mb-0.5 shrink-0 text-white/70" />
      </div>
    </Link>
  );
}
