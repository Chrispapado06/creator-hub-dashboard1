// OnlyFinder mark — a magnifying glass with a heart (search + creators), in the
// brand pink. Sized via `className` like the react-icons/si platform logos.
export function OnlyFinderLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="10" cy="10" r="6.25" stroke="#ec4899" strokeWidth="2" />
      <path d="M20.5 20.5 L15.4 15.4" stroke="#ec4899" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M10 13.1c-2-1.45-3.35-2.5-3.35-4.05 0-1.05.85-1.85 1.85-1.85.65 0 1.2.33 1.5.83.3-.5.85-.83 1.5-.83 1 0 1.85.8 1.85 1.85 0 1.55-1.35 2.6-3.35 4.05z"
        fill="#ec4899"
      />
    </svg>
  );
}
