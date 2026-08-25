/**
 * Brand glyphs for the "Continue with…" auth buttons.
 *
 * Logo only, no wordmark — the button carries its own label ("Continue with
 * Apple"), so the mark just needs the symbol. Sanctioned use: a provider's logo
 * on that provider's own sign-in button. Inline SVG so it renders offline.
 */

export function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 18" className={className} role="img" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M13.1 13.3c-.24.55-.52 1.06-.85 1.53-.45.64-.82 1.08-1.1 1.33-.44.4-.9.61-1.4.62-.36 0-.79-.1-1.29-.31-.5-.2-.96-.3-1.38-.3-.44 0-.91.1-1.42.3-.51.21-.92.32-1.24.33-.48.02-.96-.2-1.43-.64-.31-.27-.7-.72-1.16-1.37-.5-.69-.9-1.49-1.22-2.4C.24 11.44.07 10.48.07 9.55c0-1.07.23-1.99.69-2.76a4.06 4.06 0 0 1 1.45-1.47 3.9 3.9 0 0 1 1.96-.55c.38 0 .88.12 1.5.35.62.23.98.35 1.12.35.11 0 .5-.14 1.19-.41.65-.25 1.2-.36 1.65-.32 1.22.1 2.14.58 2.75 1.45-1.09.66-1.63 1.59-1.62 2.78.01.93.35 1.7 1.01 2.31.3.29.63.5 1 .65-.08.23-.17.46-.27.69ZM10.6.36c0 .8-.29 1.55-.87 2.23-.7.82-1.55 1.29-2.46 1.22a2.46 2.46 0 0 1-.02-.3c0-.77.34-1.59.93-2.25.3-.34.68-.62 1.14-.84.46-.22.9-.34 1.3-.36.01.1.02.2.02.3Z"
      />
    </svg>
  );
}

export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" className={className} role="img" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.94v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.94a9 9 0 0 0 0 8.1l3.04-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .94 4.95l3.04 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
