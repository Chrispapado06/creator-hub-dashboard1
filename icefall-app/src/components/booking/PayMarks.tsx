/**
 * Payment-network and wallet marks.
 *
 * TRADEMARK NOTE — why these are here when the operator logos are not.
 *
 * Apple Pay, Google Pay, Visa, Mastercard and Amex marks exist precisely to
 * label the payment methods they name, and both Apple's and Google's brand
 * guidelines require their mark on a button that offers their wallet. Using
 * them for that purpose is what they are for. That is a different thing from
 * putting a guiding company's logo next to a rating ICEFALL invented — the
 * operator marks stay out of every build for exactly that reason.
 *
 * Drawn as inline SVG rather than fetched, so they render offline, stay crisp
 * at any size, and inherit the surrounding colour where the guidelines allow it.
 */

export function AppleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 42 18" className={className} role="img" aria-label="Apple Pay">
      {/*  glyph */}
      <path
        fill="currentColor"
        d="M8.14 3.7c.48-.6.8-1.4.71-2.22-.69.03-1.53.46-2.03 1.05-.44.51-.83 1.34-.73 2.13.77.06 1.56-.39 2.05-.96Zm.7 1.12c-1.12-.07-2.08.64-2.61.64-.54 0-1.36-.6-2.24-.59-1.15.02-2.22.67-2.81 1.71-1.2 2.08-.31 5.16.85 6.85.57.83 1.25 1.76 2.14 1.73.86-.03 1.19-.56 2.23-.56s1.34.56 2.24.54c.93-.02 1.51-.84 2.08-1.68.66-.96.93-1.89.94-1.94-.02-.02-1.8-.7-1.82-2.75-.02-1.72 1.4-2.54 1.46-2.59-.8-1.18-2.05-1.31-2.49-1.34Z"
      />
      {/* "Pay" */}
      <text
        x="14.6"
        y="13.4"
        fill="currentColor"
        fontFamily="Inter Tight, system-ui, sans-serif"
        fontSize="12"
        fontWeight="500"
      >
        Pay
      </text>
    </svg>
  );
}

export function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 46 18" className={className} role="img" aria-label="Google Pay">
      {/* The G keeps Google's four brand colours — the guidelines do not permit
          recolouring it to match a host theme. */}
      <path
        fill="#4285F4"
        d="M9.6 8.16v2.06h4.8c-.14 1.12-.52 1.94-1.09 2.51-.7.7-1.79 1.47-3.7 1.47-2.95 0-5.26-2.38-5.26-5.33S6.66 3.54 9.6 3.54c1.59 0 2.75.63 3.61 1.43l1.45-1.45C13.46 2.36 11.86 1.5 9.6 1.5 5.54 1.5 2.13 4.8 2.13 8.87s3.41 7.37 7.47 7.37c2.19 0 3.84-.72 5.14-2.06 1.33-1.33 1.75-3.21 1.75-4.72 0-.47-.04-.9-.11-1.26H9.6Z"
      />
      <path fill="#EA4335" d="M9.6 3.54c1.59 0 2.75.63 3.61 1.43l1.45-1.45C13.46 2.36 11.86 1.5 9.6 1.5c-2.9 0-5.41 1.66-6.63 4.08l1.75 1.36C5.5 4.98 7.37 3.54 9.6 3.54Z" />
      <path fill="#FBBC05" d="M2.97 5.58A7.3 7.3 0 0 0 2.13 8.87c0 1.19.29 2.3.8 3.27l1.78-1.38a4.9 4.9 0 0 1-.29-1.89c0-.65.11-1.28.3-1.86L2.97 5.58Z" />
      <path fill="#34A853" d="M9.6 14.2c-2.24 0-4.12-1.45-4.89-3.44l-1.78 1.38a7.46 7.46 0 0 0 6.67 4.1c2.19 0 3.84-.72 5.14-2.06l-1.73-1.34c-.7.53-1.68.96-3.41.96Z" />
      <text
        x="19"
        y="13.4"
        fill="currentColor"
        fontFamily="Inter Tight, system-ui, sans-serif"
        fontSize="12"
        fontWeight="500"
      >
        Pay
      </text>
    </svg>
  );
}

export function VisaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={className} role="img" aria-label="Visa">
      <rect width="40" height="24" rx="3" fill="#F7F7F7" />
      <path
        fill="#1A1F71"
        d="M16.6 16.6h-2.3l1.44-8.9h2.3l-1.44 8.9Zm8.34-8.68a5.7 5.7 0 0 0-2.06-.38c-2.27 0-3.87 1.21-3.88 2.94-.01 1.28 1.14 2 2.01 2.4.9.42 1.2.69 1.2 1.06-.01.57-.69.83-1.32.83-.88 0-1.35-.13-2.07-.45l-.29-.13-.31 1.93c.52.24 1.47.44 2.46.45 2.41 0 3.98-1.19 4-3.04.01-1.01-.6-1.78-1.93-2.41-.8-.41-1.29-.68-1.29-1.1 0-.37.42-.76 1.32-.76a4.1 4.1 0 0 1 1.72.34l.21.1.31-1.87Zm5.9-.22h-1.78c-.55 0-.96.16-1.2.74l-3.42 8.16h2.42l.48-1.33h2.95l.28 1.33h2.13l-1.86-8.9Zm-2.84 5.74.92-2.48.3-.83.15.75.53 2.56h-1.9ZM12.7 7.7l-2.25 6.07-.24-1.23c-.42-1.42-1.73-2.96-3.2-3.73l2.06 7.78h2.44l3.63-8.89H12.7Z"
      />
      <path
        fill="#F9A51A"
        d="M8.35 7.7H4.63l-.03.19c2.9.74 4.81 2.52 5.6 4.65l-.81-4.09c-.14-.56-.54-.73-1.04-.75Z"
      />
    </svg>
  );
}

export function MastercardMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={className} role="img" aria-label="Mastercard">
      <rect width="40" height="24" rx="3" fill="#F7F7F7" />
      <circle cx="16" cy="12" r="7" fill="#EB001B" />
      <circle cx="24" cy="12" r="7" fill="#F79E1B" />
      <path
        fill="#FF5F00"
        d="M20 6.6a7 7 0 0 0 0 10.8 7 7 0 0 0 0-10.8Z"
      />
    </svg>
  );
}

export function AmexMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 24" className={className} role="img" aria-label="American Express">
      <rect width="40" height="24" rx="3" fill="#1F72CD" />
      <text
        x="20"
        y="14.5"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Inter Tight, system-ui, sans-serif"
        fontSize="7"
        fontWeight="600"
        letterSpacing="0.4"
      >
        AMEX
      </text>
    </svg>
  );
}

/** The Stripe wordmark, for the "payments powered by" line. */
export function StripeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 26" className={className} role="img" aria-label="Stripe">
      <text
        x="30"
        y="18"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="Inter Tight, system-ui, sans-serif"
        fontSize="15"
        fontWeight="600"
        letterSpacing="-0.4"
      >
        stripe
      </text>
    </svg>
  );
}
