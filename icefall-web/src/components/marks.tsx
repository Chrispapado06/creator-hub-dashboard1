import { useState } from "react";
import { BadgeCheck, IdCard, Crown } from "lucide-react";
import { verificationSentence } from "@/data/demo";

/**
 * STATUS MARKS — the whole vocabulary, in one file, per the owner's D4 ruling.
 *
 *   GOLD  = ICEFALL checked this GUIDE's credentials (licence, insurance,
 *           first aid). The strongest claim ICEFALL makes about a person.
 *   GREY  = this USER's identity was verified (an ID document, small mark).
 *   BLUE  = this user is a PAID MEMBER. A commercial fact, not a trust fact.
 *
 * **Three marks, no borrowing.** Each is a different claim, and a mark borrowed
 * for a neighbouring claim is a false statement in iconography — the reader
 * cannot tell a checked licence from a paid subscription unless the marks
 * refuse to stand in for each other.
 *
 * ── COMPANIES GET NO MARK, DELIBERATELY ─────────────────────────────────────
 *
 * A company's verification (business documents checked) is a FOURTH claim the
 * owner has not yet assigned a mark. The CRM mockup shows a light-blue
 * "Verified Company" chip — which would collide with blue = paid member — and
 * that collision is with the owner to resolve. Until then, company and trip
 * surfaces keep the plain `VerifiedTick` they always had, and nothing in this
 * file renders for a company.
 *
 * ── TWO OF THE THREE RENDER NOTHING TODAY, BY CONSTRUCTION ──────────────────
 *
 * The grey mark has NO SOURCE: the ID-verification schema is first in the
 * migration queue but has not landed, so there is no column for
 * `identityVerified` to read. The blue mark has NO PRODUCT: the web sells no
 * membership. Both components exist so the vocabulary is recorded and call
 * sites can be written once — and both return `null` unconditionally, because
 * a mark from a missing table would be a claim from nothing. Absent must mean
 * "no mark" by construction, not by luck.
 */

/*
 * The credential gold is `--ice-credential` (#E5B455), NOT a local constant.
 *
 * History worth keeping: the first version of this file estimated a gold from
 * the CRM mockup's BUTTONS — which is the exact crossover the channel rule
 * exists to prevent. A button's gold is a surface accent; this is a claim mark.
 * The canonical value already existed as the family's `--ice-gilt`, and the
 * guide app had minted the claim-named alias `--ice-credential` for it. All
 * three trees now draw one gold from one token; changing it means changing the
 * ruling, not this file.
 */

/** Shared hover/focus note so every mark explains itself the same way. */
function MarkNote({
  label,
  colorClass,
  colorStyle,
  children,
}: {
  label: string;
  colorClass?: string;
  colorStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={label}
        className={colorClass}
        style={colorStyle}
      >
        {children}
      </button>
      {open && (
        <span className="absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-tile border border-hairline bg-elevated px-3 py-2 text-[11.5px] leading-relaxed text-mist shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
          {label}
        </span>
      )}
    </span>
  );
}

/**
 * GOLD — ICEFALL checked this guide's credentials.
 *
 * Renders only with a real verification date, same rule as `VerifiedTick`: the
 * mark is never decorative and never a default. The sentence it shows is the
 * same honest one — documents were read on a date; the issuing association was
 * not contacted.
 */
export function GuideCredentialMark({ verifiedOn, size = 14 }: { verifiedOn: string; size?: number }) {
  if (!verifiedOn) return null;
  return (
    <MarkNote label={verificationSentence(verifiedOn)} colorClass="text-credential">
      <BadgeCheck size={size} strokeWidth={2} />
    </MarkNote>
  );
}

/**
 * GREY — this user's identity was verified.
 *
 * RENDERS NOTHING until the identity migration is pushed and the GO arrives.
 *
 * The source is now WRITTEN and verified on disk, so the binding is named here
 * rather than left vague: `20260831160000_identity_verification.sql` defines
 * the PostgREST computed field `identity_verified` on profiles —
 * `profiles?select=*,identity_verified` — a DEFINER function readable by
 * `authenticated` only, returning a boolean and never the evidence behind it.
 * Its `coalesce(…, false)` means absent-record = unverified AT THE DATABASE,
 * so this mark can never be minted from a missing row in any app.
 *
 * When it goes live: take `verified: boolean` from that field and render a
 * small grey `IdCard` when true. Not before — the migration is written, not
 * pushed, and a mark from an unpushed table is a claim from nothing. Same
 * ordering rule as everything else this week: the binding and the render land
 * in the same change, after the GO.
 */
export function IdentityMark(_props: { size?: number }) {
  void IdCard; // the glyph the live version uses — kept so the design is recorded
  return null;
}

/**
 * BLUE — paid member.
 *
 * RENDERS NOTHING, unconditionally: the web sells no membership, so nobody can
 * be one. Recorded so the vocabulary is complete and so nobody reaches for the
 * azure tick to mean "paying customer" — that tick means "documents checked"
 * and must keep meaning only that.
 */
export function MemberMark(_props: { size?: number }) {
  void Crown;
  return null;
}
