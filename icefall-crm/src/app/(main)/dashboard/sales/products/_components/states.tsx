import type { ReactNode } from "react";

import { AlertTriangle, Database, Inbox, Loader2, Lock } from "lucide-react";

import { cn } from "@/lib/utils";

import type { Result } from "./result";

const TONE_CLASS = {
  neutral: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
} as const;

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
    <div className="flex items-start gap-3.5 rounded-xl border p-6">
      <span className={cn("mt-0.5", TONE_CLASS[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="font-medium text-sm">{title}</p>
        {body ? <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-relaxed">{body}</p> : null}
      </div>
    </div>
  );
}

export const Loading = ({ what }: { what: string }) => (
  <Frame icon={<Loader2 className="size-4 animate-spin" />} title={`Loading ${what}…`} />
);

export const Empty = ({ what, body }: { what: string; body?: string }) => (
  <Frame icon={<Inbox className="size-4" />} title={what} body={body} />
);

// Neutral, not amber. "There is nothing to read" is information, not a caution,
// and amber is reserved for the things that genuinely need somebody to act.
export const Unavailable = ({ reason }: { reason: string }) => (
  <Frame icon={<Database className="size-4" />} title="No data to show" body={reason} />
);

export const Failed = ({ reason }: { reason: string }) => (
  <Frame icon={<AlertTriangle className="size-4" />} title="That did not work" body={reason} tone="bad" />
);

export const Forbidden = ({ reason }: { reason: string }) => (
  <Frame icon={<Lock className="size-4" />} title="Not your desk" body={reason} tone="warn" />
);

/**
 * Render a `Result`, or the reason it has no value.
 *
 * `empty` is a separate argument from `unavailable` on purpose: "no products
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
      if (isEmpty?.(result.value)) return <Empty what={`No ${what} yet`} body={empty} />;
      return <>{children(result.value)}</>;
  }
}
