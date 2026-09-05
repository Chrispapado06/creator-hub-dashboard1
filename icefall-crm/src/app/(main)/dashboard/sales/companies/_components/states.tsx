import type { ReactNode } from "react";

import { AlertTriangle, Database, Inbox, Loader2, Lock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A value, or the REASON there isn't one — ported from the old CRM's
 * data/result.ts and components/states.tsx.
 *
 * The failure mode being designed out is a screen that shows `0` for "we could
 * not reach the database", "nothing has happened yet" and "the real answer is
 * zero", which are three different statements a person would act on
 * differently. The placeholder rows in this build are local, so today every
 * read resolves `ok` — the other four branches are the contract the data layer
 * will be wired into, and the `empty` branch is reachable now.
 */
export type Result<T> =
  | { state: "loading" }
  | { state: "ok"; value: T }
  | { state: "unavailable"; reason: string }
  | { state: "error"; reason: string }
  | { state: "forbidden"; reason: string };

export const ok = <T,>(value: T): Result<T> => ({ state: "ok", value });

const TONE_CLASS: Record<"neutral" | "warn" | "bad", string> = {
  neutral: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

function Frame({
  icon,
  title,
  body,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  tone?: "neutral" | "warn" | "bad";
}) {
  return (
    <Card className="flex flex-row items-start gap-3.5 px-6 py-6">
      <span className={cn("mt-0.5", TONE_CLASS[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {body ? <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-relaxed">{body}</p> : null}
      </div>
    </Card>
  );
}

export const Loading = ({ what }: { what: string }) => (
  <Frame icon={<Loader2 className="size-4.5 animate-spin" />} title={`Loading ${what}…`} />
);

export const Empty = ({ what, body }: { what: string; body?: string }) => (
  <Frame icon={<Inbox className="size-4.5" />} title={what} body={body} />
);

// Neutral, not amber. "There is nothing to read" is information, not a caution —
// and amber is reserved here for the things that genuinely need somebody to act.
export const Unavailable = ({ reason }: { reason: string }) => (
  <Frame icon={<Database className="size-4.5" />} title="No data to show" body={reason} />
);

export const Failed = ({ reason }: { reason: string }) => (
  <Frame icon={<AlertTriangle className="size-4.5" />} title="That did not work" body={reason} tone="bad" />
);

export const Forbidden = ({ reason }: { reason: string }) => (
  <Frame icon={<Lock className="size-4.5" />} title="Not your desk" body={reason} tone="warn" />
);

/**
 * Render a `Result`, or the reason it has no value.
 *
 * The `empty` argument is separate from `unavailable` on purpose: "no companies
 * yet" and "we cannot reach the database" look identical in an array of length
 * zero and mean completely different things to whoever is reading the screen.
 */
export function Resolve<T>({
  result,
  what,
  empty,
  isEmpty,
  children,
}: {
  result: Result<T>;
  what: string;
  empty?: string;
  isEmpty?: (value: T) => boolean;
  children: (value: T) => ReactNode;
}) {
  switch (result.state) {
    case "loading":
      return <Loading what={what} />;
    case "unavailable":
      return <Unavailable reason={result.reason} />;
    case "error":
      return <Failed reason={result.reason} />;
    case "forbidden":
      return <Forbidden reason={result.reason} />;
    case "ok":
      if (isEmpty?.(result.value)) {
        return <Empty what={`No ${what} yet`} body={empty} />;
      }
      return <>{children(result.value)}</>;
  }
}
