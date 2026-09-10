import {
  ChevronRight,
  Cloud,
  CloudRain,
  CloudSnow,
  Heart,
  MessageSquare,
  Mountain as MountainIcon,
  Sun,
  Thermometer,
  Wind,
  Zap,
  Check,
  MapPin,
  Clock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { MODE_ICON } from "@/components/tracker/activityIcons";
import { MountainBackdrop } from "@/components/domain/MountainImage";
import { Badge, Card } from "@/components/ui/primitives";
import { ProgressRing } from "@/components/ui/charts";
import { TIER_EYEBROW } from "@/services/peakTier";
import { WATCH_PROVIDER_NAME } from "@/watch/types";
import {
  DIFFICULTY_LABELS,
  MODE_LABELS,
  fmtCountdown,
  fmtDate,
  fmtDistance,
  fmtDurationCompact,
  fmtElevation,
  fmtPrice,
  fmtRelative,
} from "@/lib/format";
import type {
  Activity,
  Conditions,
  Goal,
  IcefallEvent,
  Mountain,
  Product,
  CommunityPost,
  TrainingDay,
} from "@/types";

/* -------------------------------------------------------------------------- */
/* HeroImage — the photo + scrim treatment used across the app                */
/* -------------------------------------------------------------------------- */

export function HeroImage({
  src,
  alt,
  className,
  children,
  ratio = "aspect-[4/3]",
  scrim = "scrim-bottom",
  rounded = true,
}: {
  src: string;
  alt: string;
  className?: string;
  children?: React.ReactNode;
  ratio?: string;
  scrim?: string;
  rounded?: boolean;
}) {
  return (
    <div
      className={cn(
        "grain relative overflow-hidden bg-slate",
        ratio,
        rounded && "rounded-card",
        className,
      )}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className={cn("absolute inset-0", scrim)} />
      {children && <div className="absolute inset-0 flex flex-col justify-end p-4">{children}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* WeatherStrip                                                               */
/* -------------------------------------------------------------------------- */

const WEATHER_ICON = {
  clear: Sun,
  cloud: Cloud,
  snow: CloudSnow,
  rain: CloudRain,
  wind: Wind,
  storm: Zap,
  /** A thermometer reading off the device, and no observation of the sky. */
  device: Thermometer,
} as const;

export function WeatherStrip({
  conditions,
  className,
}: {
  conditions: Conditions;
  className?: string;
}) {
  const Icon = WEATHER_ICON[conditions.icon] ?? Cloud;
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5 text-[12px] text-mist", className)}>
      <Icon size={15} strokeWidth={1.5} className="shrink-0 text-azure" />
      <span className="tnum shrink-0 whitespace-nowrap text-snow">{conditions.tempC}°</span>
      <span className="shrink-0 text-mist-dim">·</span>
      {/* Omitted, not zeroed. See `Conditions.windKph`. */}
      {conditions.windKph != null && (
        <>
          <span className="tnum shrink-0 whitespace-nowrap">{conditions.windKph} km/h</span>
          <span className="shrink-0 text-mist-dim">·</span>
        </>
      )}
      <span className="min-w-0 truncate">{conditions.summary}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Difficulty dots                                                            */
/* -------------------------------------------------------------------------- */

export function DifficultyDots({ level, className }: { level: number; className?: string }) {
  return (
    <div
      className={cn("flex items-center gap-1.5", className)}
      title={`${level} / 5 · ${DIFFICULTY_LABELS[level]}`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn("h-1 w-3 rounded-full", i <= level ? "bg-azure" : "bg-white/12")}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ActivityCard                                                               */
/* -------------------------------------------------------------------------- */

export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Link to={`/activity/${activity.id}`} className="block">
      <Card className="transition-colors duration-200 hover:border-hairline-strong">
        <div className="flex items-start justify-between gap-3">
          {/* PH-02 — the discipline, as a mark as well as a word. A list of
              rows that differed only by a small uppercase label read as one
              undifferentiated block; the icon is what makes a hike and a ride
              distinguishable at a glance while scrolling. */}
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 text-mist">
            {(() => {
              const Icon = MODE_ICON[activity.mode];
              return <Icon size={16} strokeWidth={1.6} />;
            })()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="section-label">{MODE_LABELS[activity.mode]}</p>
              {/* Mutually exclusive by construction — an activity ICEFALL
                  simulated and one a watch account handed across can never be
                  the same row. `activity.origin` is optional on the display
                  type (DEV fixtures carry none), never on `RecordedActivity`
                  itself — this reads it only to label a card, never to decide
                  a ranking, record or verification outcome. */}
              {activity.simulated ? (
                <Badge tone="alert">Simulated</Badge>
              ) : activity.origin?.kind === "imported" ? (
                <Badge>Imported · {WATCH_PROVIDER_NAME[activity.origin.provider]}</Badge>
              ) : null}
            </div>
            <h3 className="mt-1.5 truncate text-[15px] font-normal text-snow">{activity.title}</h3>
            <p className="mt-0.5 truncate text-[12px] text-mist-dim">
              {activity.location} · {fmtDate(activity.startedAt, { year: undefined })}
            </p>
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 text-mist-dim" />
        </div>
        <div className="mt-4 flex items-center gap-5">
          <Stat value={fmtDistance(activity.distanceKm)} unit="km" />
          <Stat value={fmtElevation(activity.elevationGainM)} unit="m" />
          <Stat value={fmtDurationCompact(activity.durationSec)} />
        </div>
      </Card>
    </Link>
  );
}

function Stat({ value, unit }: { value: string; unit?: string }) {
  return (
    <div className="tnum text-[14px] font-light text-snow">
      {value}
      {unit && <span className="ml-0.5 text-[11px] text-mist">{unit}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* GoalCard                                                                   */
/* -------------------------------------------------------------------------- */

export function GoalCard({ goal, compact }: { goal: Goal; compact?: boolean }) {
  const body = (
    <div className="relative overflow-hidden rounded-card border border-hairline bg-graphite">
      <MountainBackdrop
        peak={{
          name: goal.name,
          elevationM: goal.elevationM,
          curatedId: goal.mountainId,
          wikipedia: goal.wikipedia,
          photo: goal.photo,
        }}
      />
      <div className={cn("relative flex items-center gap-4 p-4", compact ? "" : "min-h-[124px]")}>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-normal text-snow">{goal.name}</h3>
          <p className="tnum mt-1 text-[12px] text-mist">
            {goal.elevationM ? `${fmtElevation(goal.elevationM)} m · ` : ""}
            {fmtCountdown(goal.targetDate)}
          </p>
          {goal.status === "completed" && (
            <Badge tone="summit" className="mt-2">
              <Check size={10} strokeWidth={2.5} /> Completed
            </Badge>
          )}
        </div>
        {/* The ring is objective-only: a reference goal's percentage rests on
            an invented route gain (`services/peakTier.ts`), so the card names
            the tier instead of drawing a confident circle. */}
        {goal.status === "active" &&
          (goal.mountainId ? (
            <ProgressRing value={goal.preparation} size={54} stroke={2.5} />
          ) : (
            <span className="section-label shrink-0 text-right text-[8px] leading-tight text-mist-dim">
              {TIER_EYEBROW.reference}
            </span>
          ))}
      </div>
    </div>
  );

  return (
    <Link to={`/goals/${goal.id}`} className="block">
      {body}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* MountainCard                                                               */
/* -------------------------------------------------------------------------- */

export function MountainCard({ mountain }: { mountain: Mountain }) {
  return (
    <Link to={`/explore/mountain/${mountain.id}`} className="block">
      <HeroImage src={mountain.photo} alt={mountain.name} ratio="aspect-[16/10]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="section-label text-mist">{mountain.country}</p>
            <h3 className="mt-1 truncate text-[19px] font-light text-snow">{mountain.name}</h3>
            <p className="tnum mt-0.5 text-[12px] text-mist">
              {fmtElevation(mountain.elevationM)} m · {mountain.difficultyLabel}
            </p>
          </div>
          <DifficultyDots level={mountain.difficulty} className="mb-1 shrink-0" />
        </div>
      </HeroImage>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* GearCard — typographic studio tile, not a product photo                    */
/* -------------------------------------------------------------------------- */

const GEAR_TINT: Record<string, string> = {
  shell: "from-[oklch(0.26_0.02_240)]",
  insulation: "from-[oklch(0.26_0.03_60)]",
  midlayer: "from-[oklch(0.25_0.02_180)]",
  base: "from-[oklch(0.24_0.015_300)]",
  pants: "from-[oklch(0.25_0.02_140)]",
  pack: "from-[oklch(0.26_0.025_30)]",
  accessory: "from-[oklch(0.24_0.01_0)]",
};

export function GearCard({ product, rationale }: { product: Product; rationale?: boolean }) {
  return (
    <Link to={`/gear/${product.id}`} className="block">
      <Card
        inset={false}
        className="overflow-hidden transition-colors hover:border-hairline-strong"
      >
        <div className="flex gap-4 p-4">
          <div
            className={cn(
              "grid h-[72px] w-[72px] shrink-0 place-items-center rounded-tile bg-gradient-to-br to-graphite",
              GEAR_TINT[product.category] ?? GEAR_TINT.accessory,
            )}
          >
            <MountainIcon size={22} strokeWidth={1.2} className="text-snow/45" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="section-label">{product.categoryLabel}</p>
            <h3 className="mt-1.5 truncate text-[14px] font-normal text-snow">{product.name}</h3>
            <p className="tnum mt-1 text-[13px] text-azure">{fmtPrice(product.priceEur)}</p>
            {rationale && (
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-mist-dim">
                {product.rationale}
              </p>
            )}
          </div>
          <ChevronRight size={16} className="mt-1 shrink-0 self-start text-mist-dim" />
        </div>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* EventCard                                                                  */
/* -------------------------------------------------------------------------- */

export function EventCard({ event }: { event: IcefallEvent }) {
  return (
    <Link to={`/explore/events/${event.id}`} className="block">
      <Card
        inset={false}
        className="overflow-hidden transition-colors hover:border-hairline-strong"
      >
        <HeroImage src={event.photo} alt={event.title} ratio="aspect-[16/7]" rounded={false} />
        <div className="p-4">
          <div className="flex items-center gap-2">
            <span className="section-label">{fmtDate(event.date)}</span>
            {event.privateOnly && <Badge tone="azure">Private</Badge>}
          </div>
          <h3 className="mt-2 text-[15px] font-normal text-snow">{event.title}</h3>
          <p className="mt-1 text-[12px] text-mist-dim">
            {event.location}, {event.country} · {event.durationLabel}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <DifficultyDots level={event.difficulty} />
            <span className="tnum text-[13px] text-snow">
              {event.priceEur === null ? "By invitation" : fmtPrice(event.priceEur)}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* PostCard                                                                   */
/* -------------------------------------------------------------------------- */

export function PostCard({
  post,
  liked,
  onToggleKudos,
}: {
  post: CommunityPost;
  liked: boolean;
  onToggleKudos: () => void;
}) {
  return (
    <Card inset={false} className="overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <AvatarInline name={post.author.name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-snow">{post.author.name}</p>
          <p className="truncate text-[11px] text-mist-dim">
            {fmtRelative(post.postedAt)} · {post.location}
          </p>
        </div>
        <Badge>Lvl {post.author.level}</Badge>
      </div>

      {post.photo && (
        <HeroImage src={post.photo} alt="" ratio="aspect-[16/10]" rounded={false} scrim="" />
      )}

      <div className="p-4">
        {post.achievement && (
          <div className="mb-3 flex items-baseline gap-2">
            <span className="section-label">{post.achievement.label}</span>
            <span className="tnum text-[17px] font-light text-azure">{post.achievement.value}</span>
          </div>
        )}
        <p className="text-[13px] leading-relaxed text-mist">{post.body}</p>
        <div className="mt-4 flex items-center gap-5">
          <button
            type="button"
            onClick={onToggleKudos}
            aria-pressed={liked}
            className={cn(
              "flex items-center gap-1.5 text-[12px] transition-colors",
              liked ? "text-azure" : "text-mist-dim hover:text-mist",
            )}
          >
            <Heart size={14} strokeWidth={1.6} fill={liked ? "currentColor" : "none"} />
            <span className="tnum">{post.kudos + (liked ? 1 : 0)}</span>
          </button>
          <span className="flex items-center gap-1.5 text-[12px] text-mist-dim">
            <MessageSquare size={14} strokeWidth={1.6} />
            <span className="tnum">{post.comments}</span>
          </span>
        </div>
      </div>
    </Card>
  );
}

function AvatarInline({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return (
    <div
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline-strong text-[12px] font-medium text-snow/90"
      style={{
        background: `linear-gradient(145deg, oklch(0.30 0.02 ${h}), oklch(0.22 0.012 ${(h + 40) % 360}))`,
      }}
      aria-hidden
    >
      {initials}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TrainingDayRow                                                             */
/* -------------------------------------------------------------------------- */

const FOCUS_ICON: Record<string, typeof MountainIcon> = {
  recovery: Clock,
  endurance: Zap,
  strength: MountainIcon,
  intervals: Zap,
  "long-mountain": MountainIcon,
  rest: Clock,
  technical: MapPin,
};

export function TrainingDayRow({
  day,
  dayLabel,
  onToggle,
}: {
  day: TrainingDay;
  dayLabel: string;
  onToggle?: () => void;
}) {
  const Icon = FOCUS_ICON[day.focus] ?? MountainIcon;
  const isRest = day.focus === "rest";

  return (
    <div className="flex items-center gap-3.5 border-b border-hairline py-3.5 last:border-0">
      <span className="section-label w-8 shrink-0">{dayLabel}</span>
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-tile",
          isRest ? "bg-white/[0.03]" : "bg-slate",
        )}
      >
        <Icon size={14} strokeWidth={1.4} className={isRest ? "text-mist-dim" : "text-azure"} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px]", isRest ? "text-mist" : "text-snow")}>
          {day.title}
        </p>
        {(day.distanceKm || day.elevationM || day.detail) && (
          <p className="tnum truncate text-[11px] text-mist-dim">
            {day.distanceKm ? `${fmtDistance(day.distanceKm)} km` : ""}
            {day.distanceKm && day.elevationM ? " · " : ""}
            {day.elevationM ? `${fmtElevation(day.elevationM)} m` : ""}
            {!day.distanceKm && !day.elevationM && day.detail ? day.detail : ""}
          </p>
        )}
      </div>
      {!isRest && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={day.completed ? `Mark ${day.title} incomplete` : `Mark ${day.title} complete`}
          aria-pressed={day.completed}
          className={cn(
            "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all duration-200",
            day.completed
              ? "border-summit bg-summit text-obsidian"
              : "border-hairline-strong text-transparent hover:border-azure/60",
          )}
        >
          <Check size={13} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CoachInsight — the coach's voice wherever it appears outside the chat      */
/* -------------------------------------------------------------------------- */

export function CoachInsight({
  children,
  title = "ICEFALL Coach",
  className,
}: {
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-azure/20 bg-azure/[0.04]", className)}>
      <p className="section-label text-azure/80">{title}</p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-snow/85">{children}</p>
    </Card>
  );
}
