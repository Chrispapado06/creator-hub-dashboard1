/**
 * Set a new password, after following the link from a reset email.
 *
 * WHY THIS SCREEN EXISTS — a gap that shipped with the first version of this
 * work. `sendPasswordReset` really sent, and the link really worked: it signed
 * the person in. And then it dropped them on the callback screen, which routed
 * them into the app **without ever asking for a new password.**
 *
 * So "forgot password" recovered access exactly once and left the old, forgotten
 * password in place. The next time they came back they were locked out again,
 * having been told the problem was solved. A flow that appears to succeed and
 * silently does nothing is worse than one that visibly fails.
 *
 * HOW THE CALLBACK KNOWS TO SEND THEM HERE. Supabase emits a `PASSWORD_RECOVERY`
 * event when the URL carries a recovery token, and the URL itself carries
 * `type=recovery`. Both are checked, because the event fires only if the client
 * is listening at the moment the URL is consumed, and a slow mount can miss it.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/primitives";
import { supabase } from "@/backend/client";
import { AuthScreen, Field, Note, RULES } from "./Auth";
import { nextStepForSession } from "@/auth/account";

export function NewPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ok = RULES.every((r) => r.test(password));

  async function submit() {
    if (!ok || busy) return;
    setBusy(true);
    setError(null);

    if (!supabase) {
      setError("ICEFALL can't reach the account server. Your old password still works.");
      setBusy(false);
      return;
    }

    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) {
      // Say the old password still works. Otherwise somebody assumes the change
      // went through and finds themselves locked out later.
      setError(`${err.message} Your old password still works.`);
      setBusy(false);
      return;
    }

    const step = await nextStepForSession();
    setBusy(false);
    navigate(step === "handle" ? "/auth/handle" : step === "onboarding" ? "/onboarding" : "/home", {
      replace: true,
    });
  }

  return (
    <AuthScreen
      eyebrow="Reset password"
      title={["Choose a new", "password."]}
      subtitle="You're signed in from the link. Set a new password and you're done."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label="New password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete="new-password"
          reveal
        />

        <ul className="space-y-1.5">
          {RULES.map((r) => (
            <li
              key={r.label}
              className={`text-[11.5px] ${r.test(password) ? "text-azure" : "text-mist-dim"}`}
            >
              {r.test(password) ? "✓" : "·"} {r.label}
            </li>
          ))}
        </ul>

        {error && <p className="text-[12px] leading-relaxed text-danger">{error}</p>}

        <Button type="submit" className="w-full" disabled={!ok || busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>

        <Note>
          This link signed you in. Until you set a password here, the old one is still the one that
          works.
        </Note>
      </form>
    </AuthScreen>
  );
}
