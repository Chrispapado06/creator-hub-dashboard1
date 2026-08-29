import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * A page that exists in the navigation but has not been written.
 *
 * Deliberately not a spinner, a blank panel or a "coming soon" splash with an
 * email field. It says which page this is, what will be on it, and where the
 * working version is today — because the phone app already does all of these
 * things, and pointing at it is more use than an apology.
 */
export function Placeholder({ title, what }: { title: string; what: string }) {
  return (
    <div className="mx-auto w-full max-w-[720px] py-10">
      <Link
        to="/app"
        className="inline-flex items-center gap-1 text-[12.5px] text-mist transition-colors hover:text-snow"
      >
        <ChevronLeft size={14} strokeWidth={1.9} />
        Home
      </Link>
      <h1 className="mt-5 text-[24px] font-light tracking-[-0.02em] text-snow">{title}</h1>
      <p className="mt-3 text-[13.5px] leading-relaxed text-mist">
        This page will hold {what}. It is not built yet — the web app currently has Home, and the
        rest are routed so the shape of it is visible rather than hidden.
      </p>
      <p className="mt-4 text-[12.5px] leading-relaxed text-mist-dim">
        All of it works in the ICEFALL phone app today.
      </p>
    </div>
  );
}
