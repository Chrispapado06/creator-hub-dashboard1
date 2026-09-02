import { useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { Check, ShieldCheck } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { HOUSE_RULES_PATH, HouseRuleArticle, houseRuleForHash } from "@/components/social/HouseRules";
import { useSessionState } from "@/auth/session";
import { fmtDate } from "@/lib/format";
import {
  HOUSE_RULES,
  HOUSE_RULES_ACK_IS_LOCAL,
  HOUSE_RULES_ACK_LABEL,
  HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL,
  HOUSE_RULES_NEW_VERSION_NOTICE,
  HOUSE_RULES_TITLE,
  HOUSE_RULES_VERSION,
  HOUSE_RULES_VERSION_DATE,
  RETIRED_HOUSE_RULES,
  houseRulesAccountKey,
  useHouseRulesAcknowledgement,
  type HouseRulesAckStatus,
} from "@/social/houseRules";

/**
 * THE RULES PAGE — the page a removal notice points at.
 *
 * Declared at `/house-rules` and OUTSIDE `AppShell` in `App.tsx`, which is the
 * decision this screen turns on. `AppShell` requires a live Supabase session
 * (the owner's 2026-09-02 ruling) and redirects anybody without one to the
 * splash. The reader this page exists for is precisely the person least likely
 * to have a session in the browser they open the link in: a notice arrives by
 * email, is read days later, on a laptop, possibly by somebody whose account is
 * the thing under dispute. A rules page that bounces them to a sign-in screen
 * is a rules page they cannot read, which makes the notice unanswerable — the
 * exact failure `social/houseRules.ts` was written to prevent.
 *
 * So: no session needed, no data fetched, nothing to load. The rules are in the
 * bundle. This works on a plane.
 *
 * ── ONE URL PER CLAUSE ───────────────────────────────────────────────────────
 *
 * Every rule is an anchor: `/house-rules#human-remains`. `houseRuleHref` builds
 * them and `houseRuleForHash` resolves them — including the `#rule-4` and `#4`
 * forms, because notices are written by people who have just typed "rule 4".
 * The named clause is scrolled to and drawn with an azure edge, because landing
 * halfway down six rules with nothing marked tells the reader nothing about
 * which one they were sent to read.
 *
 * A fragment that resolves to NOTHING says so, loudly, above the list. Showing
 * the six rules under a citation the app cannot find would let somebody assume
 * the clause they were removed under is one of the six in front of them.
 *
 * ── WITHDRAWN RULES ARE ON THIS PAGE ─────────────────────────────────────────
 *
 * `RETIRED_HOUSE_RULES` is empty today and its section is not dead code: it is
 * where a rule goes instead of being deleted, so a notice from before the
 * withdrawal still resolves to the words it was written under. It renders
 * separately, marked as no longer in force, so nothing withdrawn can be read as
 * current.
 *
 * ── NO MODAL, NO SHEET, NO OVERLAY ───────────────────────────────────────────
 *
 * `00-CONSTITUTION.md:63` and `:129`. This is a screen; the composer's block is
 * inline. Between them there is nowhere a rules interstitial could live.
 */
export default function HouseRulesScreen() {
  const location = useLocation();
  const still = useReducedMotion();

  const session = useSessionState();
  /* Widened by hand rather than `session?.user.id` — optional chaining flattens
     `null` and `undefined` into one value and would strand a signed-out reader
     in "not known yet". The reasoning is written out in `HouseRules.tsx`. */
  const accountKey = houseRulesAccountKey(
    session === undefined ? undefined : (session?.user.id ?? null),
  );
  const ack = useHouseRulesAcknowledgement(accountKey);

  const fragment = location.hash.replace(/^#/, "").trim();
  const target = useMemo(() => houseRuleForHash(location.hash), [location.hash]);
  const unresolved = fragment.length > 0 && !target;

  /**
   * Scroll the cited clause into view.
   *
   * `Screen` is the scroll container rather than the window, and browsers do
   * not restore a fragment inside a client-rendered route anyway, so this is
   * the only thing that makes an anchored link work at all. `block: "center"`
   * because a clause pinned to the top edge of a phone reads like the start of
   * the document rather than the one that was named.
   */
  useEffect(() => {
    if (!target) return;
    const el = document.getElementById(target.id);
    el?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "center" });
  }, [target, still]);

  /**
   * A cold open has nothing inside ICEFALL to go back to, and this is a page
   * people arrive at cold by design. Rather than a chevron that does nothing,
   * the back control is simply absent and a quiet link to the app sits at the
   * bottom — where it is an offer rather than the only visible exit.
   */
  const cold = location.key === "default";

  /**
   * A DEV-ONLY CHECK THAT THIS SCREEN IS MOUNTED WHERE THE LINKS POINT.
   *
   * `HOUSE_RULES_PATH` is what every citation in the app is built from, and
   * `App.tsx` declares the route with a literal, the way it declares all of
   * them. Nothing but this makes the two agree. If somebody moves the route,
   * every link in the app — and every URL already sitting in somebody's
   * removal notice — quietly 404s, and the page they were moving still works
   * when opened directly, so nothing else would ever tell them.
   *
   * A warning rather than a throw: the page itself is fine, and a rules page
   * that renders at the wrong address still beats a white screen.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (location.pathname !== HOUSE_RULES_PATH) {
      console.warn(
        `HouseRulesScreen is mounted at "${location.pathname}" but every citation is built ` +
          `from HOUSE_RULES_PATH ("${HOUSE_RULES_PATH}"). Links to individual rules will not ` +
          `resolve until App.tsx and HouseRules.tsx agree.`,
      );
    }
  }, [location.pathname]);

  return (
    <Screen>
      <ScreenHeader
        title={HOUSE_RULES_TITLE}
        subtitle={`Version ${HOUSE_RULES_VERSION}, written ${fmtDate(HOUSE_RULES_VERSION_DATE)}`}
        back={!cold}
      />

      {/* `Stagger` reaches DIRECT CHILDREN ONLY. Every `Rise` below is one of
          them; a wrapper around any of them would leave that card at opacity 0
          with no error. */}
      <Stagger className="space-y-2.5 pb-4">
        <Rise>
          <Card className="space-y-2.5">
            <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-snow">
              <ShieldCheck size={14} strokeWidth={1.7} className="mt-0.5 shrink-0 text-azure" />
              <span>
                Six rules, numbered. If a post is removed, the notice names the rule by number and
                quotes the words below — and the number never moves, so a notice sent months ago
                still points at the clause it meant.
              </span>
            </p>
            <p className="text-[11.5px] leading-relaxed text-mist-dim">
              Each rule has its own link. Open one and it will be marked when the page loads.
            </p>
          </Card>
        </Rise>

        {unresolved && (
          <Rise>
            <Card className="border-alert/35 bg-alert/[0.05]">
              <p className="text-[12.5px] text-snow">This link names a rule that is not here</p>
              <p className="mt-2 text-[12px] leading-relaxed text-mist">
                Nothing in this version of ICEFALL matches “{fragment}”. It may be a rule from a
                later version of this page, or the link may have been mistyped. The rules in force
                are below, and none of them is the one you were sent to read — do not assume the
                citation is among them.
              </p>
            </Card>
          </Rise>
        )}

        {HOUSE_RULES.map((rule) => (
          <Rise key={rule.id}>
            <HouseRuleArticle rule={rule} highlighted={rule.id === target?.id} />
          </Rise>
        ))}

        {/* Empty today. This is the destination a withdrawn rule moves to, and
            the reason it is never deleted: the appeal outlives the rule. */}
        {RETIRED_HOUSE_RULES.length > 0 && (
          <Rise className="pt-4">
            <SectionLabel className="pb-2.5">No longer in force</SectionLabel>
            <div className="space-y-2.5">
              {RETIRED_HOUSE_RULES.map((rule) => (
                <HouseRuleArticle key={rule.id} rule={rule} highlighted={rule.id === target?.id} />
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
              These rules have been withdrawn and nothing is removed under them today. They are kept
              on this page so a notice sent while they applied can still be read against the words
              it was written under.
            </p>
          </Rise>
        )}

        {/* The acknowledgement, LAST — after the rules rather than above them,
            for the reason the composer's block gives: a control placed above
            the text it refers to can be operated with the text off screen. */}
        <Rise className="pt-4">
          <Acknowledgement
            status={ack.status}
            at={ack.at}
            previousVersion={ack.previousVersion}
            onAcknowledge={ack.acknowledge}
          />
        </Rise>

        {cold && (
          <Rise className="pt-2">
            <Link
              to="/home"
              className="block text-center text-[11.5px] text-mist underline-offset-2 hover:text-snow hover:underline"
            >
              Open ICEFALL
            </Link>
          </Rise>
        )}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What this device has recorded, and what that is worth.
 *
 * FOUR STATES AND FOUR DIFFERENT SENTENCES. Nothing here rounds "not known yet"
 * up to "you have not read these" — that would put an accept control in front
 * of somebody who accepted last week, every time the page loads, before the
 * session resolves.
 *
 * Every branch renders `HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL`, including the
 * ones where nobody has accepted anything, because it is a fact about ICEFALL
 * rather than a fact about the reader. Somebody arriving here from a removal
 * notice is entitled to know that no record of their reading exists on either
 * side of the dispute.
 */
function Acknowledgement({
  status,
  at,
  previousVersion,
  onAcknowledge,
}: {
  status: HouseRulesAckStatus;
  at: string | null;
  previousVersion: number | null;
  onAcknowledge: () => void;
}) {
  if (status === "unknown") {
    /* No control and no claim. The session has not resolved, so this page knows
       nothing about who is reading it — and says nothing. */
    return (
      <Card>
        <Disclaimer>{HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL}</Disclaimer>
      </Card>
    );
  }

  if (status === "accepted") {
    return (
      <Card className="space-y-2.5">
        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-snow">
          <Check size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-azure" />
          <span>
            This phone recorded that you read these rules
            {at ? ` on ${fmtDate(at)}` : ""}.
          </span>
        </p>
        <p className="text-[11px] leading-relaxed text-mist-dim">
          {/* The instant came from the device's own clock and nothing checks it.
              Said here because the sentence above is the closest thing in the
              app to a legal record, and it is not one. */}
          That is a note this device kept for itself: it records that the rules were put in front of
          you, not that you read them, and the date is whatever this phone's clock said at the time.
        </p>
        <Disclaimer>{HOUSE_RULES_ACK_NOT_HELD_BY_ICEFALL}</Disclaimer>
      </Card>
    );
  }

  const outdated = status === "outdated";

  return (
    <Card className="space-y-3.5">
      {outdated && (
        <p className="rounded-tile border border-azure/30 bg-azure/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-snow">
          {HOUSE_RULES_NEW_VERSION_NOTICE}
          {previousVersion !== null && (
            <span className="mt-1.5 block text-[11px] text-mist">
              This phone last recorded version {previousVersion}.
            </span>
          )}
        </p>
      )}
      <Disclaimer>{HOUSE_RULES_ACK_IS_LOCAL}</Disclaimer>
      <Button size="lg" className="w-full" onClick={onAcknowledge}>
        {HOUSE_RULES_ACK_LABEL}
      </Button>
    </Card>
  );
}
