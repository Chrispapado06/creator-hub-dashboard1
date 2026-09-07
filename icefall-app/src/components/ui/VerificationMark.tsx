import { useState } from "react";
import { BadgeCheck, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * FOUR CLAIMS, FOUR MARKS, AND NONE MAY BORROW ANOTHER'S COLOUR.
 *
 * The owner's ruling of 31 Aug fixed three, and 2 Sep added the fourth:
 *
 *   WHITE  this person runs ICEFALL              (`app_owners`, 20260902250000)
 *   GOLD   credentials ICEFALL checked           (guides)
 *   BLUE   paid member                           (subscription)
 *   GREY   identity verified, small              (`identity_verified`)
 *
 * They are four DIFFERENT sentences and the whole point of the ruling is that a
 * reader can tell them apart at a glance. A gold tick on a paying member would
 * say ICEFALL vetted their climbing; a blue one on a verified identity would say
 * they had paid. Neither is true, and both are the sort of claim somebody plans
 * a mountain around.
 *
 * WHITE IS THE ONLY ONE THAT IS NOT A FACT ABOUT THE PERSON WEARING IT — it is a
 * fact about their authority over everybody else, which is why the server is the
 * only thing allowed to say it. `app_owner` is a computed field on `profiles`
 * with no client-writable path anywhere; this component renders what it is told
 * and can never decide. If you find yourself passing `kind="owner"` from a
 * client-side condition, that is the bug.
 *
 * Grey is deliberately the smallest and quietest: identity verification is the
 * weakest claim of the four and the most easily over-read.
 */
export type MarkKind = "owner" | "credentials" | "member" | "identity";

const MARKS: Record<MarkKind, { size: number; className: string; label: string; says: string }> = {
  owner: {
    // Bigger than the other three on purpose, and the owner asked for it bigger
    // again on 2026-09-02. It is the only mark that is not a claim about the
    // person wearing it, so it is allowed to carry more weight than the marks
    // that are.
    size: 22,
    // Pure white, and the only mark that gets it. Everything else in this app
    // is mist, azure or gold — white reads as "outside the ordinary scale".
    className: "text-white",
    label: "ICEFALL owner",
    says: "Runs ICEFALL. Not a climbing qualification.",
  },
  credentials: {
    size: 15,
    // A TOKEN, not a literal. This was `text-[#D8B26A]`, which is a colour no
    // theme can reach: on a white ground it measured 2.00:1 and the one claim
    // this mark makes stopped being visible. `--ice-credential` holds the same
    // gold on dark and a readable bronze on light. It is deliberately not
    // `--ice-gilt` — gilt means somebody is selling you something, and a
    // checked qualification is a fact about a person.
    className: "text-credential",
    label: "Credentials checked by ICEFALL",
    says: "ICEFALL checked their guiding qualifications.",
  },
  member: {
    size: 15,
    className: "text-azure",
    label: "ICEFALL member",
    says: "A paying member. Says nothing about their climbing.",
  },
  identity: {
    size: 13,
    className: "text-mist",
    label: "Identity verified by ICEFALL",
    says: "They are who they say. Not vetted to climb with.",
  },
};

/**
 * TAPPING A MARK SAYS WHAT IT IS — the owner asked for this on 2026-09-02, and
 * it is the thing that makes four marks safe to have at all.
 *
 * Four ticks in four colours is a private language until someone explains it,
 * and the person most likely to misread one is the person a wrong reading hurts:
 * a climber deciding who to go up a mountain with. So every mark says its own
 * sentence, and each sentence names what the mark does NOT mean — "runs ICEFALL,
 * not a climbing qualification", "a paying member, says nothing about their
 * climbing". That negative half is the point. A tick that only says the good
 * half is how a blue mark becomes "vetted" in somebody's head.
 *
 * Inline, not a dialog: this app's subscription surfaces are inline-only and a
 * modal over a profile to explain a 15px tick is heavier than the thing it
 * explains.
 */
export function VerificationMark({ kind, className }: { kind: MarkKind; className?: string }) {
  const m = MARKS[kind];
  const [open, setOpen] = useState(false);

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "inline-flex shrink-0 items-center rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60",
          m.className,
          className,
        )}
      >
        {/* The identity mark is the SHIELD (owner, 2026-09-07: "i want this to
            be next to profile of people who verify their identity"); the other
            three keep the badge. Same colours, same sentences. */}
        {kind === "identity" ? (
          <ShieldCheck size={m.size} strokeWidth={2} aria-hidden />
        ) : (
          <BadgeCheck size={m.size} strokeWidth={2} aria-hidden />
        )}
        <span className="sr-only">{m.label} — tap to explain</span>
      </button>

      {open && (
        <span className="mt-1 text-[10.5px] leading-snug text-mist-dim">
          <span className="text-mist">{m.label}.</span> {m.says}
        </span>
      )}
    </span>
  );
}
