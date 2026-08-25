import { ChevronRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
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
  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title={title} subtitle={subtitle} back={back} />
      </div>
      <Stagger className="px-5 pb-6">{children}</Stagger>
    </Screen>
  );
}

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
    <Rise className={cn("pt-5 first:pt-0", className)}>
      {label && <SectionLabel>{label}</SectionLabel>}
      <div
        className={cn(
          "overflow-hidden rounded-card border border-hairline bg-graphite",
          label && "mt-3",
        )}
      >
        {children}
      </div>
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

const TONE: Record<NonNullable<RowBase["tone"]>, string> = {
  default: "text-snow",
  azure: "text-azure",
  mist: "text-mist-dim",
  danger: "text-danger",
};

function RowInner({ icon: Icon, title, detail, value, tone = "default", chevron }: RowBase & { chevron?: boolean }) {
  return (
    <>
      {Icon && <Icon size={17} strokeWidth={1.6} className="mt-0.5 shrink-0 text-azure/80" />}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-snow">{title}</span>
        {detail && (
          <span className="mt-1 block text-[11.5px] leading-relaxed text-mist-dim">{detail}</span>
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

const ROW = "flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors";
const DIVIDE = "border-t border-hairline first:border-t-0";

export function LinkRow({ to, ...row }: RowBase & { to: string }) {
  return (
    <Link to={to} className={cn(ROW, DIVIDE, "hover:bg-slate/40")}>
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
      className={cn(ROW, DIVIDE, "hover:bg-slate/40 disabled:opacity-50")}
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
    <div className={cn("px-4 py-3.5", DIVIDE)}>
      <p className="text-[14px] text-snow">{title}</p>
      {detail && <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">{detail}</p>}
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
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
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
    <span className={cn("rounded-pill border px-2.5 py-1 text-[10.5px] uppercase tracking-[0.09em]", tone)}>
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
  "ICEFALL has no accounts or server yet, so this is stored on this device only and nothing is sent anywhere.";
