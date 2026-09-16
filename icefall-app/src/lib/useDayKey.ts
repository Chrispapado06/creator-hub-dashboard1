import { useEffect, useState } from "react";

/** Today's LOCAL calendar day as YYYY-MM-DD. */
export function dayKeyNow(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Today's day key, kept current: re-read every minute, on focus and when the
 * app comes back from the background.
 *
 * For memos whose answer depends on the date — "the athlete's objective", "today's
 * check-in", "today's session" — so an app left open past midnight does not keep
 * yesterday's answer until some unrelated state happens to change. The value is
 * a string, so the memos re-run once a day, not once a minute.
 */
export function useDayKey(): string {
  const [day, setDay] = useState(() => dayKeyNow());
  useEffect(() => {
    const update = () => setDay(dayKeyNow());
    const t = setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return day;
}
