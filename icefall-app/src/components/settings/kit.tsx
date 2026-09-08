import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { SectionLabel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * The parts every settings screen is made of.
 *
 * One row shape, one group shape, one page shape. Settings goes wrong when each
 * screen invents its own layout — nineteen slightly different rows is what makes
 * an account centre feel like an administration panel.
 *
 * Every row is TITLE / short description / chevron, and the description says
 * what the row does in plain words rather than naming the setting again.
 */

/**
 * BACK GOES WHERE YOU CAME FROM — PH-17.
 *
 * Every settings sub-page defaulted its back arrow to `/settings`, which is
 * right when you arrived through the settings list and wrong whenever you did
 * not. The owner hit it on the profile: tapping the pencil on your own avatar
 * opens Edit profile, and backing out dropped you in Settings — a screen you
 * had never opened — with no way back to the profile except the tab bar.
 *
 * Fixed here rather than at the one call site, because the bug is the DEFAULT
 * and not the screen: any page linking into settings from elsewhere has always
 * had it. A caller passes `?from=/profile` and the arrow returns there.
 *
 * Only same-origin paths are honoured — `from` must start with a single `/`.
 * `//evil.example` is protocol-relative and would leave the app, so the second
 * character is checked too. It comes off the query string, which is
 * user-editable by definition.
 */
export function SettingsPage({
  title,
  subtitle,
  back = "/settings",
  children,
}: {
  title: string;
  subtitle?: string;
  back?: string;
  children: React.ReactNode;
}) {
  const [params] = useSearchParams();
  const from = params.get("from");
  const origin = from && from.startsWith("/") && !from.startsWith("//") ? from : null;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title={title} subtitle={subtitle} back={origin ?? back} />
      </div>
      <Stagger className="px-5 pb-6">{children}</Stagger>
    </Screen>
  );
}

/**
 * A GROUP IS A LABEL AND AIR — IT IS NOT A BOX.
 *
 * This used to draw `rounded-card border border-hairline bg-graphite` around
 * every group of rows, so an account centre of twelve groups was twelve
 * outlined rectangles stacked down the screen. The outline was saying only
 * "these rows belong together", which is the one thing the space above the
 * label and the label itself already say — and twelve of them saying it at
 * once flattens the hierarchy rather than creating it.
 *
 * So the group is announced by `SectionLabel` and separated by `pt-7`, and the
 * rows sit on the screen's own left gutter with everything else. The hairlines
 * BETWEEN rows stay (see `DIVIDE`): consecutive settings rows are genuinely
 * unlike each other — Password, then Two-factor, then Devices — and there is no
 * avatar or icon column doing the aligning that a people list has.
 */
export function Group({
  label,
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Rise className={cn("pt-7 first:pt-0", className)}>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div className={cn(label && "mt-1.5")}>{children}</div>
    </Rise>
  );
}

/** Everything a row can be: a link, a button, or a static line of information. */
interface RowBase {
  icon?: LucideIcon;
  title: string;
  detail?: string;
  /** Right-hand text: a status, a value, a count. */
  value?: string;
  /** Tints the value — used for statuses like Pending or Not connected. */
  tone?: "default" | "azure" | "mist" | "danger";
  disabled?: boolean;
}

/*
 * `mist` is `text-mist`, not `text-mist-dim`, since the rows lost their fill.
 * A status sat on a white card in the light theme at 4.57:1; the same ink on
 * the warm canvas underneath is 4.16:1, which is under AA for 12px text. The
 * tone is still the quiet one — secondary ink against a primary title — and it
 * now clears 6:1 in both themes.
 */
const TONE: Record<NonNullable<RowBase["tone"]>, string> = {
  default: "text-snow",
  azure: "text-azure",
  mist: "text-mist",
  danger: "text-danger",
};

function RowInner({
  icon: Icon,
  title,
  detail,
  value,
  tone = "default",
  chevron,
}: RowBase & { chevron?: boolean }) {
  return (
    <>
      {Icon && <Icon size={17} strokeWidth={1.6} className="mt-0.5 shrink-0 text-azure/80" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-snow">{title}</span>
        {/* `text-mist`, for the reason given on TONE: the graphite fill this
            row used to sit on was carrying the tertiary ink over AA in the
            light theme, and the canvas underneath does not. */}
        {detail && (
          <span className="mt-1 block text-[11.5px] leading-relaxed text-mist">{detail}</span>
        )}
      </span>
      {value && (
        <span className={cn("tnum shrink-0 self-center text-[12px]", TONE[tone])}>{value}</span>
      )}
      {chevron && (
        <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 self-center text-mist-dim" />
      )}
    </>
  );
}

/*
 * `-mx-5 px-5` because the page's gutter is `px-5` and the row's own inset used
 * to be `px-4` INSIDE a box that was itself inside that gutter — two nested
 * insets, so a row's title started 36px from the screen edge while the section
 * label above it started at 20. The negative margin cancels the page gutter and
 * puts it back as the row's own padding: the text lands on the one left edge
 * the whole screen uses, and the hover fill and the divider now reach the glass
 * instead of stopping short of it.
 */
const ROW = "-mx-5 flex w-full items-start gap-3.5 px-5 py-3.5 text-left transition-colors";
const DIVIDE = "border-t border-hairline first:border-t-0";

/*
 * THE HOVER HAD TO CHANGE WITH THE GROUND UNDER IT.
 *
 * It was `bg-slate/40`, which lifted a row off the graphite CARD it used to sit
 * in. That card is gone and the row now sits on the canvas, where slate is the
 * next surface UP from it — in the light theme #F1EEE9 at 40% over #F6F4F0
 * moves each channel by two, which is not a hover state, it is nothing. The
 * `white` token inverts to near-black in light (see the light block), so this
 * one tint darkens on white and lightens on black, and it is what the other
 * flattened rows in the app already use.
 */
const ROW_HOVER = "hover:bg-white/[0.03]";

export function LinkRow({ to, ...row }: RowBase & { to: string }) {
  return (
    <Link to={to} className={cn(ROW, DIVIDE, ROW_HOVER)}>
      <RowInner {...row} chevron />
    </Link>
  );
}

export function ActionRow({ onClick, ...row }: RowBase & { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={row.disabled}
      className={cn(ROW, DIVIDE, ROW_HOVER, "disabled:opacity-50")}
    >
      <RowInner {...row} chevron />
    </button>
  );
}

/** A row that only states something. No affordance, because there is no action. */
export function InfoRow(row: RowBase) {
  return (
    <div className={cn(ROW, DIVIDE)}>
      <RowInner {...row} />
    </div>
  );
}

export function ToggleRow({
  checked,
  onChange,
  ...row
}: RowBase & { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn(ROW, DIVIDE)}>
      <RowInner {...row} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={row.title}
        disabled={row.disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40",
          checked ? "bg-azure" : "bg-white/12",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] h-[18px] w-[18px] rounded-full bg-obsidian transition-transform",
            checked ? "translate-x-[26px]" : "translate-x-[3px]",
          )}
        />
      </button>
    </div>
  );
}

/** A short list of mutually exclusive options, shown inline rather than behind a screen. */
export function ChoiceRow<T extends string>({
  title,
  detail,
  options,
  value,
  onChange,
}: {
  title: string;
  detail?: string;
  options: readonly { value: T; label: string; detail?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className={cn("-mx-5 px-5 py-3.5", DIVIDE)}>
      <p className="text-[14px] text-snow">{title}</p>
      {detail && <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{detail}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-[12px] transition-colors",
              value === o.value
                ? "border-azure/55 bg-azure/[0.12] text-azure"
                : "border-hairline-strong text-mist hover:text-snow",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {options.find((o) => o.value === value)?.detail && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist">
          {options.find((o) => o.value === value)!.detail}
        </p>
      )}
    </div>
  );
}

/** Status of an application or a verification. */
export type Status = "none" | "pending" | "approved" | "declined";

export const STATUS_LABEL: Record<Status, string> = {
  none: "Not applied",
  pending: "Under review",
  approved: "Approved",
  declined: "Declined",
};

export function StatusPill({ status }: { status: Status }) {
  const tone =
    status === "approved"
      ? "border-summit/50 bg-summit/[0.12] text-summit"
      : status === "pending"
        ? "border-azure/50 bg-azure/[0.10] text-azure"
        : status === "declined"
          ? "border-danger/50 bg-danger/[0.10] text-danger"
          : "border-hairline-strong text-mist-dim";
  return (
    <span
      className={cn(
        "rounded-pill border px-2.5 py-1 text-[10.5px] uppercase tracking-[0.09em]",
        tone,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * Said once, wherever a control depends on something ICEFALL has not built.
 *
 * A settings row that looks live and silently does nothing is the worst thing
 * in an account centre, because the athlete believes the setting took.
 */
export const NOT_BUILT =
  "This is stored on this device only and nothing is sent anywhere — your account exists on the server, but this setting does not sync yet.";
