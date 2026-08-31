import { Link } from "react-router-dom";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * THE THREE MARKS — one per claim, and none of them borrows another's colour.
 *
 * Owner ruling, 2026-08-31:
 *
 *   GOLD   ICEFALL has read this guide's documents
 *   GREY   this person's identity has been verified
 *   BLUE   a paid member
 *
 * **Three claims, three marks.** The rule is that a reader can tell which claim
 * is being made from the colour alone, which only works while no mark is used
 * for a second purpose — the same argument §6.10 makes about gilt, applied to a
 * different set.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS APP WAS RENDERING THE WRONG ONE. Home and Profile drew an AZURE tick
 * beside the guide's name meaning "documents checked". Under the ruling azure is
 * the PAID MEMBER mark, so the app was quietly making a claim about somebody's
 * subscription with the sign that says their papers were read. Nothing was
 * edited to cause it — the ruling arrived and the existing mark changed meaning
 * underneath it, which is §6aa in a colour rather than a number.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **THERE IS NO BLUE VARIANT HERE, AND THAT IS DELIBERATE.** This app has no
 * concept of a paid membership — no tier, no subscription, nothing that could
 * make the claim true. A blue badge would be a mark nothing in the tree can
 * earn, which is the §6c defect: code whose only property is that it never runs.
 * The vocabulary is recorded above so that whoever adds membership uses the
 * ruling's mark rather than inventing a fourth.
 *
 * **NO FEDERATION ROUNDEL, EVER.** A real association's trademark beside a name
 * says that association attested to this person. ICEFALL has not contacted them
 * and says so in words; a borrowed mark would contradict the sentence sitting
 * next to it, and a mark is read first.
 */

export type StatusMark = "credentials" | "identity";

/**
 * The gold mark is a LINK, never decoration.
 *
 * The doctrine bans a bare tick: a mark that cannot be interrogated is a claim
 * with nothing behind it. This one goes to the verification screen, whose whole
 * subject is what ICEFALL did and did not do — and the sentence it lands on is
 * the one that matters: *we read the papers; the issuing association did not
 * confirm them.*
 */
export function CredentialMark({ className }: { className?: string }) {
  return (
    <Link
      to="/verification"
      aria-label="ICEFALL has read this guide's documents — what that means"
      title="ICEFALL has read these documents. The issuing association was not contacted."
      className={cn(
        "inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full",
        "bg-credential text-obsidian",
        className,
      )}
    >
      <BadgeCheck size={12} strokeWidth={2.4} aria-hidden />
    </Link>
  );
}

/**
 * Identity, in grey and deliberately quieter than the gold.
 *
 * It is the smaller claim and must look like it: ICEFALL confirmed the name on
 * the licence belongs to the person holding it. It says nothing about whether
 * they can climb, which is why it must never sit where the credential mark goes.
 */
export function IdentityMark({ className }: { className?: string }) {
  return (
    <span
      aria-label="Identity verified by ICEFALL"
      title="ICEFALL has confirmed this person's identity."
      className={cn(
        "inline-grid h-[15px] w-[15px] shrink-0 place-items-center rounded-full",
        "border border-hairline-strong bg-elevated text-mist",
        className,
      )}
    >
      <ShieldCheck size={10} strokeWidth={2.2} aria-hidden />
    </span>
  );
}

/** Both marks in the order the ruling states them, when both are earned. */
export function StatusMarks({
  credentials,
  identity,
  className,
}: {
  credentials: boolean;
  identity: boolean;
  className?: string;
}) {
  if (!credentials && !identity) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {credentials && <CredentialMark />}
      {identity && <IdentityMark />}
    </span>
  );
}
