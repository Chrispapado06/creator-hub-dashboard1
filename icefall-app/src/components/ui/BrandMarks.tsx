/**
 * Sign-in provider marks.
 *
 * These replace a lucide apple (the fruit, not the company) and the bare letters
 * "G" and "M". A sign-in button carrying the wrong mark reads as a phishing page
 * to anybody who has seen the real one, which is the worst possible first
 * impression on the first screen of an app asking for an account.
 *
 * Drawn inline rather than fetched: each provider's brand guidelines require the
 * mark be shown unaltered and at a legible size, and an <img> to a CDN would
 * make the button flash empty on a slow connection — on the one screen where
 * hesitation costs a sign-up. Google's is the four-colour G, Apple's is the
 * monochrome mark on the button's own colour, Microsoft's is the four squares.
 *
 * COLOUR IS NOT A THEME DECISION, with one exception that is itself a rule.
 * Google's G and Microsoft's four squares carry fixed hex values and must never
 * be re-tinted — a white Google G is not the Google G, and reaching for
 * `currentColor` "so it matches the theme" is the exact instinct their brand
 * terms forbid. Apple's mark is the exception and takes `currentColor` on
 * purpose: it is specified as monochrome and may be black OR white to sit on the
 * button's own colour, which on this dark screen means white. That is Apple's
 * own rule being followed, not this file bending it.
 */
export function GoogleMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export function AppleMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M17.05 12.72c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.28-1.27 3.13-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.05-2.75-4.15zM14.5 4.9c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.54-.66.77-1.24 2-1.08 3.18 1.14.09 2.3-.58 3.02-1.45z" />
    </svg>
  );
}

export function MicrosoftMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 23 23" aria-hidden focusable="false">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M12 1h10v10H12z" />
      <path fill="#00A4EF" d="M1 12h10v10H1z" />
      <path fill="#FFB900" d="M12 12h10v10H12z" />
    </svg>
  );
}
