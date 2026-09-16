/**
 * ICEFALL — the launch date.
 *
 * CANONICAL COPY. This file lives in `icefall-shared/` and is copied verbatim
 * into icefall-app and icefall-web. Edit it HERE and re-copy — two apps
 * quoting two different launch dates to two different people is exactly the
 * kind of drift this file exists to make impossible.
 *
 * MOVED HERE 2026-09-12 FROM `icefall-web/src/lib/waitlist.ts`, where it was
 * the only copy, because `icefall-app`'s new holding screen (Charlie's ask,
 * 2026-09-12: verified accounts wait here until ICEFALL opens) needs the same
 * date. The two apps are separate Vite projects with no shared build step —
 * see `icefall-shared/package.json` — so the date has to live in ONE file that
 * both copy in, the same way the money model and the company record already
 * do, rather than as a second hand-typed string in `icefall-app`.
 *
 * A fixed UTC instant rather than a local one: the countdown has to tick
 * toward the same moment for a visitor in Nicosia and one in Denver, and
 * "midnight" is not a moment. The prose label is generated from this same
 * value in UTC, so the headline and the clock can never disagree — change the
 * date here and both follow, in both apps.
 *
 * THE DATE MOVED TO THE 15TH AND THESE TWO NOTES SAID THE 12TH until 4 Sep
 * 2026. No visitor ever saw the 12th — every date on the page is derived,
 * which is the whole point of the constant — but the next person to read the
 * file would have been told the wrong launch date by the file that defines
 * it. Do not write an example date into a comment here: write what the value
 * means, not what it currently is.
 */
export const LAUNCH_AT = new Date("2026-10-15T09:00:00Z");

const ORDINAL = (n: number) => {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
};

/** The launch date in the form the copy uses — month name, day, ordinal. */
export function launchLabel(date: Date = LAUNCH_AT): string {
  const month = date.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
  const day = Number(date.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" }));
  return `${month} ${day}${ORDINAL(day)}`;
}

export type Remaining = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

export function remainingUntil(target: Date, now: Date = new Date()): Remaining {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const s = Math.floor(ms / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: false,
  };
}
