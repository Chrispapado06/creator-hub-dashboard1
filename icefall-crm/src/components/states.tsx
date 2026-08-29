import type { ReactNode } from "react";
import { AlertTriangle, Database, Inbox, Loader2, Lock } from "lucide-react";
import type { Result } from "@/data/result";
import { Card } from "./ui";

/**
 * The five states every module must implement, in one place.
 *
 * The specification asks for loading, empty, error, permission and success on
 * every screen. Writing them once means no screen can quietly skip one — and,
 * more to the point, means "no data" can never be rendered by the same code path
 * as "zero".
 */

function Frame({ icon, title, body, tone = "neutral" }: { icon: ReactNode; title: string; body?: string; tone?: "neutral" | "warn" | "bad" }) {
  return (
    <Card className="flex items-start gap-3.5 py-6">
      <span
        className={
          tone === "bad"
            ? "mt-0.5 text-bad"
            : tone === "warn"
              ? "mt-0.5 text-warn"
              : "mt-0.5 text-faint"
        }
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13.5px] font-medium text-ink">{title}</p>
        {body && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">{body}</p>}
      </div>
    </Card>
  );
}

export const Loading = ({ what }: { what: string }) => (
  <Frame icon={<Loader2 size={18} strokeWidth={1.8} className="animate-spin" />} title={`Loading ${what}…`} />
);

export const Empty = ({ what, body }: { what: string; body?: string }) => (
  <Frame icon={<Inbox size={18} strokeWidth={1.8} />} title={what} body={body} />
);

// Neutral, not amber. "There is nothing to read" is information, not a caution —
// and amber is reserved here for the things that genuinely need somebody to act:
// a placement whose term has ended, a change flagged for review. Spending the
// warning colour on an ordinary empty state is how it stops meaning anything.
export const Unavailable = ({ reason }: { reason: string }) => (
  <Frame icon={<Database size={18} strokeWidth={1.8} />} title="No data to show" body={reason} />
);

export const Failed = ({ reason }: { reason: string }) => (
  <Frame icon={<AlertTriangle size={18} strokeWidth={1.8} />} title="That did not work" body={reason} tone="bad" />
);

export const Forbidden = ({ reason }: { reason: string }) => (
  <Frame icon={<Lock size={18} strokeWidth={1.8} />} title="Not your desk" body={reason} tone="warn" />
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
