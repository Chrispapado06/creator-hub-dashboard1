/**
 * Where Google, Apple and Microsoft send the browser back to.
 *
 * The Supabase client is configured with `detectSessionInUrl: true`, so it
 * consumes the code or fragment on its own. This screen's whole job is to wait
 * for that to finish and then ask ONE question — what does this session still
 * need? — and route on the answer.
 *
 * ROUTING ON STATE, NOT ON HOW THEY ARRIVED. A Google sign-in and a clicked
 * email-confirmation link land here in the same condition, and a returning user
 * who already has everything lands here too. Rather than three paths, there is
 * one: `nextStepForSession()` reads the profile and says handle / onboarding /
 * home. That is why adding a fourth provider needs no new flow.
 *
 * WHY THERE IS A TIMEOUT. If the URL carries no session and none arrives, this
 * screen would otherwise spin forever on a page with no way out — which is what
 * a mistyped redirect URL in the Supabase dashboard looks like from the user's
 * side. After a bounded wait it says so and offers a way back, because "loading"
 * that renders identically at 200ms and at forever is a lie in a spinner's
 * grammar.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { supabase } from "@/backend/client";
import { nextStepForSession } from "@/auth/account";

const GIVE_UP_MS = 12_000;

export function AuthCallback() {
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let done = false;

    // A provider that refuses, or a user who cancels, comes back with the reason
    // in the query string or the fragment rather than a session. Read it before
    // waiting for something that will never arrive.
    const params = new URLSearchParams(
      window.location.search.slice(1) || window.location.hash.slice(1),
    );
    const err = params.get("error_description") ?? params.get("error");
    if (err) {
      setFailed(decodeURIComponent(err.replace(/\+/g, " ")));
      return;
    }

    if (!supabase) {
      setFailed("ICEFALL isn't connected to an account server.");
      return;
    }

    /*
      A RECOVERY LINK IS NOT A SIGN-IN. It signs the person in as a side effect,
      but the thing they came to do is change their password. Routing them into
      the app instead — which the first version did — makes "forgot password"
      restore access once and leave the forgotten password in place.

      Checked two ways because either alone can miss: the URL carries
      `type=recovery`, and Supabase fires PASSWORD_RECOVERY when it consumes the
      token — but only if we are already listening, which a slow mount can lose.
    */
    if (params.get("type") === "recovery") {
      done = true;
      navigate("/auth/new-password", { replace: true });
      return;
    }

    async function route() {
      if (done) return;
      const step = await nextStepForSession();
      if (done) return;
      switch (step) {
        case "handle": done = true; navigate("/auth/handle", { replace: true }); break;
        case "onboarding": done = true; navigate("/onboarding", { replace: true }); break;
        case "home": done = true; navigate("/home", { replace: true }); break;
        case "signed-out": break; // keep waiting — the client may still be exchanging
        case "offline":
          done = true;
          setFailed("Signed in, but ICEFALL can't reach the server to load your profile.");
          break;
      }
    }

    // Fires once the client finishes consuming the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        done = true;
        navigate("/auth/new-password", { replace: true });
        return;
      }
      if (session) void route();
    });

    // And once immediately, for the case where it already finished before this
    // component mounted — a fast exchange would otherwise never fire the event.
    void route();

    const t = setTimeout(() => {
      if (!done) {
        setFailed("That sign-in link didn't complete. It may have expired, or been used already.");
      }
    }, GIVE_UP_MS);

    return () => {
      done = true;
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, [navigate]);

  return (
    <div className="grid h-full place-items-center bg-obsidian px-8 text-center">
      {failed ? (
        <div className="flex max-w-[320px] flex-col items-center gap-4">
          <p className="text-[14px] leading-relaxed text-snow">{failed}</p>
          <p className="text-[12px] leading-relaxed text-mist-dim">
            Nothing was lost. You can try again, or use email instead.
          </p>
          <Button onClick={() => navigate("/welcome", { replace: true })}>Back to start</Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-mist">
          <LoaderCircle size={20} strokeWidth={1.8} className="animate-spin text-azure" />
          <p className="text-[13px]">Signing you in…</p>
        </div>
      )}
    </div>
  );
}
