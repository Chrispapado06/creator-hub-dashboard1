import { Link } from "react-router-dom";
import {
  ChevronLeft,
  CloudOff,
  Crown,
  Info,
  KeyRound,
  Lock,
  RotateCw,
  SearchX,
  ShieldAlert,
  Unplug,
  type LucideIcon,
} from "lucide-react";

import { Avatar, Button, Card } from "@/components/ui/primitives";
import { useDetailBack } from "@/components/layout/chrome";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import type { GroupSpaceStatus } from "@/social/groupSpace";

/**
 * THE GROUP PAGE'S CHROME — the cover, the round actions, the meta row and the
 * avatar stack, drawn once and used by both halves of `GroupWorkspace`.
 *
 * The owner supplied a mockup of a competitor's group page and said "heres how
 * I want the group page to look like". WHAT WAS TAKEN FROM IT IS THE LAYOUT:
 * a full-bleed cover with the name over it, a row of round actions under it, a
 * meta row, an overlapping avatar stack, About, then the feed. WHAT WAS NOT
 * TAKEN IS ANYTHING ELSE — the mockup is a light screen in purple and teal with
 * somebody else's type, and a page that looked like it would be a failure even
 * with every box in the right place. Everything below is obsidian, azure and
 * Inter Tight, out of `index.css`, with the hairline as the only border.
 *
 * AND TWO THINGS IN THE MOCKUP ARE NOT DRAWN HERE AT ALL, because ICEFALL has
 * no answer for them:
 *
 *   - THE "INVITE" PRIMARY. There is no invite anywhere in this app or its
 *     schema: no table, no call, no screen. Membership is only ever
 *     self-initiated — you join a public group, or you ask to join a private
 *     one and wait. So the accent-filled slot holds the control the database
 *     will actually accept, and never the word Invite.
 *   - A DISCIPLINE ("Sport Climbing"). No group record carries a sport. An
 *     ICEFALL group is about a mountain — it is in the schema, `destination_id`
 *     NOT NULL with a trigger keeping it one — so the mountain is what that
 *     slot holds.
 */

/* -------------------------------------------------------------------------- */
/* Absence — the house shorthand, lifted out of GroupWorkspace so the new      */
/* sections share one copy rather than growing a second                        */
/* -------------------------------------------------------------------------- */

export type Absence = Exclude<GroupSpaceStatus, "ready" | "loading">;

/**
 * A heading per absence, and every one of them names what actually happened.
 *
 * `members-only` is in this table but it is NOT a failure — the server did its
 * job and the answer is that this is not the reader's to read. It is drawn with
 * a padlock rather than a broken plug for exactly that reason.
 */
export const ABSENCE_TITLE: Record<Absence, string> = {
  "no-backend": "No server in this build",
  "signed-out": "Your session ended",
  "not-provisioned": "Groups are not live on the server yet",
  unreachable: "ICEFALL could not reach the server",
  refused: "The server refused that",
  "not-found": "No group under that link",
  "members-only": "Members only",
};

export const ABSENCE_ICON: Record<Absence, LucideIcon> = {
  "no-backend": Unplug,
  "signed-out": KeyRound,
  "not-provisioned": CloudOff,
  unreachable: CloudOff,
  refused: ShieldAlert,
  "not-found": SearchX,
  "members-only": Lock,
};

/** The house shorthand for an empty slot: a dashed ring, never a warning. */
export function AbsenceMark({ icon: Icon, size = 48 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full border border-dashed border-hairline-strong text-mist-dim"
    >
      <Icon size={Math.round(size * 0.42)} strokeWidth={1.4} />
    </span>
  );
}

/**
 * Everything ICEFALL cannot show, drawn the same way every time.
 *
 * The sentence is the one the data layer wrote — never a second copy composed
 * here, because two screens with two copies of the same explanation is how they
 * end up disagreeing about what went wrong.
 *
 * TRYING AGAIN IS OFFERED ONLY WHERE IT COULD CHANGE THE ANSWER. A build with
 * no server, and a server that has not had the migration pushed to it, will
 * answer identically for ever; a Retry there is a control that exists to look
 * reassuring.
 */
export function SpaceAbsence({
  title,
  icon,
  status,
  message,
  detail,
  onRetry,
}: {
  /** Overrides the table above where a section needs its own heading. */
  title?: string;
  icon?: LucideIcon;
  status: Absence;
  message: string | undefined;
  detail?: React.ReactNode;
  onRetry?: () => void;
}) {
  const Icon = icon ?? ABSENCE_ICON[status];
  const heading = title ?? ABSENCE_TITLE[status];
  const retryable = status === "unreachable" || status === "refused";

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Icon size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-mist-dim" />
        <div className="min-w-0">
          <p className="text-[13px] text-snow">{heading}</p>
          {message && <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{message}</p>}
          {detail}
        </div>
      </div>

      {retryable && onRetry && (
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={onRetry}>
          <RotateCw size={14} strokeWidth={1.8} aria-hidden="true" />
          Try again
        </Button>
      )}

      {status === "signed-out" && (
        <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
          <Link to="/auth/signin">Sign in again</Link>
        </Button>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The cover                                                                   */
/* -------------------------------------------------------------------------- */

/** What `useMountainImage` needs. Never reconstructed from a catalogue slug. */
export interface CoverPeak {
  name: string;
  elevationM?: number;
  lat?: number;
  lon?: number;
  curatedId?: string;
  photo?: string;
  wikipedia?: string;
}

/**
 * THE PHOTOGRAPH, AND WHAT IT IS HONEST ABOUT.
 *
 * No group anywhere in ICEFALL carries a cover picture of its own — not the
 * local `Expedition`, not the server `GroupSpace`. So the cover is the
 * MOUNTAIN's, through the one resolver that marks its own stand-ins: a verified
 * photograph where ICEFALL holds one, and terrain of the right altitude band or
 * a drawn contour plate where it does not. When it is not a real photograph it
 * is dimmed and carries the word for it, so the mockup's big-name-over-a-photo
 * is frequently big-name-over-a-plate — which is the correct rendering, not a
 * degraded one.
 */
function MountainCover({ peak }: { peak: CoverPeak }) {
  const image = useMountainImage(peak);

  return (
    <>
      <img
        src={image.src}
        alt={image.real ? peak.name : ""}
        aria-hidden={image.real ? undefined : true}
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          image.real ? "opacity-100" : "opacity-45",
        )}
      />

      {!image.real && (
        <span
          title={image.caption}
          className="absolute right-4 top-4 rounded-full border border-hairline-strong bg-obsidian/70 px-2 py-[3px] text-[9px] font-medium uppercase tracking-[0.1em] text-mist backdrop-blur"
        >
          Representative terrain
        </span>
      )}

      {image.credit && (
        <p className="absolute bottom-1.5 right-3 text-[9px] text-mist-dim">{image.credit}</p>
      )}
    </>
  );
}

/**
 * The mockup's full-bleed cover, at the ratio the group hero already used.
 *
 * `peak` IS NULLABLE AND NULL DRAWS NO PICTURE. When the mountain's record did
 * not come back with the group there is nothing to illustrate it with, and a
 * photograph of some other mountain under this group's name would be the app
 * inventing where a party is going. A plain ground, and the reason underneath.
 */
export function GroupCover({
  name,
  peak,
  meta,
  backTo,
}: {
  name: string;
  peak: CoverPeak | null;
  /** One line under the name. Only ever figures ICEFALL actually holds. */
  meta?: React.ReactNode;
  /** Where Back goes when there is no history — a pasted link or a cold open. */
  backTo: string;
}) {
  const back = useDetailBack(backTo);

  return (
    <div className="-mx-5">
      <div className="grain relative aspect-[16/10] w-full overflow-hidden bg-slate">
        {peak && <MountainCover peak={peak} />}

        {/* `:has(> .scrim-bottom)` in index.css turns the tokens inside this
            frame dark, so the type below reads on a photograph in either theme. */}
        <div className="scrim-bottom pointer-events-none absolute inset-0" />

        <button
          type="button"
          onClick={back}
          aria-label="Back"
          className="absolute left-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-hairline-strong bg-obsidian/70 text-snow backdrop-blur transition-colors hover:border-azure/50"
        >
          <ChevronLeft size={20} strokeWidth={1.6} />
        </button>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="display text-[32px] leading-[1.05] text-snow">{name}</h1>
          {meta && <p className="tnum mt-1.5 text-[12px] text-mist">{meta}</p>}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The four round actions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * One round action: a disc with an icon and a word under it.
 *
 * 48px, not the 36px of `HeroCircleButton` or the 40px of `LiquidGlassCircle`,
 * because both of those are under the house minimum and this is a primary row
 * rather than a corner control.
 *
 * A DISABLED ONE SAYS WHY, at the control, through `describedBy`. There is no
 * third state where it is drawn and does nothing.
 */
export function GroupAction({
  icon: Icon,
  label,
  hint,
  tone = "quiet",
  onClick,
  disabled,
  describedBy,
}: {
  icon: LucideIcon;
  label: string;
  /** The accessible name, where the word under the disc is not enough alone. */
  hint?: string;
  tone?: "primary" | "quiet";
  onClick: () => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={hint ?? label}
      aria-describedby={describedBy}
      className="group flex min-w-[62px] flex-col items-center gap-2 disabled:pointer-events-none disabled:opacity-40"
    >
      <span
        className={cn(
          "grid h-12 w-12 place-items-center rounded-full transition-colors",
          tone === "primary"
            ? "bg-azure text-obsidian group-hover:bg-azure-bright"
            : "border border-hairline-strong bg-elevated/40 text-snow group-hover:border-azure/50",
        )}
      >
        <Icon size={19} strokeWidth={1.7} aria-hidden="true" />
      </span>
      <span className={cn("text-[10.5px]", tone === "primary" ? "text-azure" : "text-mist")}>
        {label}
      </span>
    </button>
  );
}

/** The row itself. Three or four, depending on what is honestly available. */
export function GroupActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start justify-around gap-1">{children}</div>;
}

/* -------------------------------------------------------------------------- */
/* The meta row                                                                */
/* -------------------------------------------------------------------------- */

export interface MetaItem {
  icon: LucideIcon;
  label: string;
}

/**
 * The mockup's globe / compass / (i) strip.
 *
 * Every item is a field that exists. An item with no answer is not passed in —
 * it is never filled with "Open", "Sport Climbing" or a title-cased slug.
 */
export function MetaRow({
  items,
  onInfo,
  infoLabel = "About this group",
}: {
  items: MetaItem[];
  onInfo?: () => void;
  infoLabel?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-y border-hairline py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {items.map((item) => (
          <span
            key={item.label}
            className="flex min-w-0 items-center gap-1.5 text-[12px] text-mist"
          >
            <item.icon
              size={13}
              strokeWidth={1.6}
              className="shrink-0 text-mist-dim"
              aria-hidden="true"
            />
            <span className="truncate">{item.label}</span>
          </span>
        ))}
      </div>

      {onInfo && (
        <button
          type="button"
          onClick={onInfo}
          aria-label={infoLabel}
          className="-mr-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist-dim transition-colors hover:bg-white/[0.05] hover:text-snow"
        >
          <Info size={17} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The avatar stack                                                            */
/* -------------------------------------------------------------------------- */

export interface StackPerson {
  key: string;
  /** Null means the profile row did not come back. Nothing is written in. */
  name: string | null;
  avatarUrl: string | null;
  /** The person who runs the group — `group_members.role`, a real column. */
  organiser: boolean;
}

/**
 * THE MOCKUP'S OVERLAPPING FACES, AND THE TWO PLACES IT LIES IF YOU LET IT.
 *
 * The mockup draws four faces and "+9". Four faces is nine invented people on a
 * group whose roster ICEFALL has not read, and "+9" is a remainder subtracted
 * from a count that is nullable by design. So:
 *
 *   - `people` is drawn from a roster that really came back. A caller with no
 *     roster passes none, and no stack appears at all.
 *   - `total` is the count the server gave. NULL FALLS BACK TO THE NUMBER OF
 *     PEOPLE ACTUALLY READ, which is itself a real count — never to a guess,
 *     and the remainder is drawn only when it is above zero.
 *   - The crown is the organiser off `group_members`, a real column. A group
 *     that has nobody running it has no crown to draw, and none is.
 *
 * `Avatar` sets `aria-hidden` on itself, so a row of them would be a row of
 * nothing to a screen reader. The stack carries its own name instead.
 */
export function AvatarStack({
  people,
  total,
  max = 4,
}: {
  people: StackPerson[];
  total: number | null;
  max?: number;
}) {
  if (people.length === 0) return null;

  const shown = people.slice(0, max);
  const counted = typeof total === "number" ? total : people.length;
  const remainder = Math.max(0, counted - shown.length);

  const named = shown.map((p) => p.name).filter((n): n is string => n !== null);
  const label =
    [named.length > 0 ? named.join(", ") : null, remainder > 0 ? `and ${remainder} more` : null]
      .filter(Boolean)
      .join(" ") || "The people in this group";

  return (
    <div className="flex items-center" role="img" aria-label={label}>
      {shown.map((person, index) => (
        <span
          key={person.key}
          className={cn("relative rounded-full ring-[2.5px] ring-obsidian", index > 0 && "-ml-2")}
          style={{ zIndex: shown.length - index }}
        >
          <Avatar
            name={(person.name ?? "").replace(/^@/, "")}
            src={person.avatarUrl ?? undefined}
            size={38}
          />
          {person.organiser && (
            <span
              aria-hidden="true"
              title="Organiser"
              className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-azure text-obsidian ring-2 ring-obsidian"
            >
              <Crown size={9} strokeWidth={2.4} />
            </span>
          )}
        </span>
      ))}

      {remainder > 0 && (
        <span className="tnum -ml-2 grid h-[38px] w-[38px] place-items-center rounded-full border border-hairline-strong bg-elevated text-[11px] text-mist ring-[2.5px] ring-obsidian">
          +{remainder}
        </span>
      )}
    </div>
  );
}
