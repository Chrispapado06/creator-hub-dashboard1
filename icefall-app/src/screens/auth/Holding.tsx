/**
 * The holding screen. Charlie, 12 September 2026: "once people signup to page
 * and verify their email, once they verify they enter this waitlist page
 * where it says app launch will be xyz and when we update the app then they
 * get to go through the signup questions."
 *
 * WHY THIS SITS WHERE IT SITS. `nextStepForSession()` (`auth/account.ts`) is
 * the one router every arrival passes through — a clicked email-confirmation
 * link, a password sign-in, a restored session — and it answers "holding" for
 * exactly one state: a session that has claimed a handle (past
 * `/auth/handle`) and has not onboarded, while `APP_RELEASED`
 * (`auth/release.ts`) is still false. `OnboardingGate.tsx` is the other half
 * of this: it stops the same state from reaching `/onboarding` directly, by
 * URL or the back button, without ever asking this router again.
 *
 * A DEAD END, ON PURPOSE. Nothing on this screen leads to `/onboarding` or
 * `/home` — the only thing that ever moves someone past it is `APP_RELEASED`
 * flipping in a new build. See the recheck below for how a phone sitting here
 * ever finds that out with nobody touching it.
 *
 * NOT A TRAP, THOUGH. `Handle.tsx` already states the rule this screen
 * follows: a mandatory step with no way out is how somebody ends up with an
 * account they cannot use and cannot leave. Sign out is one tap away, the
 * same as it is there.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthScreen } from "./Auth";
import { signOut } from "@/auth/account";
import { launchLabel } from "@/launch";

/**
 * HOW A HELD PHONE FINDS OUT IT HAS BEEN RELEASED, WITH NOBODY RETRYING BY
 * HAND.
 *
 * `APP_RELEASED` is a compile-time constant baked into the JS bundle this
 * device already has open. Re-running the session check inside THIS SAME TAB
 * would read the SAME bundle and get the SAME answer every time, released or
 * not — there is no server flag to poll. The only way this device ever sees a
 * different value is by loading a NEW bundle, so the recheck below is a real
 * reload, not a re-render:
 *
 *   - every five minutes, so a phone simply left open on this screen finds
 *     out on its own
 *   - the moment the app comes back to the foreground, so a phone that was
 *     locked for an hour does not sit out whatever is left of the five
 *     minutes before finding out launch already happened while it was asleep
 *
 * Either reload re-runs `nextStepForSession()` from scratch, from whichever
 * screen the browser was last on — the same routing this screen itself
 * arrived from. If the answer is still "holding", the new bundle sends the
 * device right back here; if it is not, it does not.
 */
const RECHECK_MS = 5 * 60 * 1000;

export default function Holding() {
  useEffect(() => {
    const id = setInterval(() => window.location.reload(), RECHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") window.location.reload();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <AuthScreen
      hero="/img/home-hero.jpg"
      title={["ICEFALL opens", `${launchLabel()}.`]}
      subtitle="Your email is verified — that's everything for now. The moment ICEFALL opens, you'll be asked a short set of questions to build your training plan, and then you're straight in."
      footer={<SignOutLink />}
    >
      <p className="text-[12.5px] leading-relaxed text-mist-dim">
        Nothing else to do here. This screen checks in on its own, so there is nothing to refresh or
        retry — leave the app as it is, or close it and come back after launch.
      </p>
    </AuthScreen>
  );
}

function SignOutLink() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut();
        navigate("/welcome", { replace: true });
      }}
      className="text-[12px] text-mist transition-colors hover:text-snow"
    >
      Sign out
    </button>
  );
}
