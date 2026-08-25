/** Presentation helpers. Every metric in ICEFALL is formatted here. */

export const fmtDistance = (km: number, digits = 1) =>
  km >= 100 ? Math.round(km).toLocaleString("en-GB") : km.toFixed(digits);

export const fmtElevation = (m: number) => Math.round(m).toLocaleString("en-GB");

/** 8_100 → "2:15:00"; 2_745 → "45:45" */
export function fmtDuration(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Compact form for dashboards: 8h 45m */
export function fmtDurationCompact(totalSec: number) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.round((totalSec % 3600) / 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtHours(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Seconds per km → "5:12 /km" */
export function fmtPace(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const fmtPrice = (eur: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(eur);

export function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...opts,
  });
}

export function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** "2h ago" / "3d ago" — community feed timestamps. */
export function fmtRelative(iso: string, now = new Date()) {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return fmtDateShort(iso);
}

/** "8 months to go" / "Passed" — goal countdowns. */
export function fmtCountdown(targetIso: string, now = new Date()) {
  const target = new Date(targetIso);
  const days = Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "Date passed";
  if (days === 0) return "Today";
  if (days < 31) return `${days} ${days === 1 ? "day" : "days"} to go`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} ${months === 1 ? "month" : "months"} to go`;
  return `${Math.round(months / 12)} years to go`;
}

export const DIFFICULTY_LABELS = ["", "Accessible", "Moderate", "Demanding", "Serious", "Extreme"];

export const fmtDifficulty = (d: number) => `${d} / 5 · ${DIFFICULTY_LABELS[d] ?? ""}`;

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export const MODE_LABELS: Record<string, string> = {
  hiking: "Hiking",
  // The coarse family label. Trail running is one kind of running, not the
  // only kind — a treadmill session was being captioned "Trail Running".
  running: "Running",
  climbing: "Climbing",
  mountaineering: "Mountaineering",
  cycling: "Cycling",
  "ski-touring": "Ski Touring",
};

export const FOCUS_LABELS: Record<string, string> = {
  recovery: "Recovery",
  endurance: "Endurance",
  strength: "Strength",
  intervals: "Intervals",
  "long-mountain": "Long Mountain Session",
  rest: "Rest",
  technical: "Technical",
};
