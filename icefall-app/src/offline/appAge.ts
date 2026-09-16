/**
 * THE AGE OF THIS COPY OF THE APP (Mountain mode plan §3, "the app's own age").
 *
 * Camps, rescue numbers and phrases ship inside the bundle, so the build date
 * is the date of all of them. `vite.config.ts` stamps it at build time. With no
 * stamp (unit tests, an unusual build) this says nothing rather than guess.
 */

export function appBuiltAt(
  raw: string | undefined = (import.meta.env as Record<string, string | undefined>)
    .VITE_ICEFALL_BUILT_AT,
): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "This copy of ICEFALL was made on 2 August." or null when unknown. */
export function appAgeSentence(
  builtAt: Date | null = appBuiltAt(),
  now: Date = new Date(),
  locale = "en-GB",
): string | null {
  if (!builtAt) return null;
  const sameYear = builtAt.getFullYear() === now.getFullYear();
  const date = builtAt.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `This copy of ICEFALL was made on ${date}. Everything below came with it.`;
}
