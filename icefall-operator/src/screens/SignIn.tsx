/**
 * Sign-in.
 *
 * Company accounts are created by ICEFALL, never self-registered (spec §13), so
 * there is no sign-up path here and there should never be one. An operator who
 * has no account needs a commercial conversation, not a form.
 *
 * While this runs on the in-memory backend it lists the seeded identities to
 * pick from, which makes the two-role model testable by eye. That list comes
 * from `listSignInIdentities` and disappears the moment the backend is real —
 * there is no password field to leave lying around, because there is no
 * authentication here to imitate.
 */

import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, Card, Notice } from "@/components/ui";
import { useAsync, useOperator } from "@/state/OperatorContext";

export default function SignIn() {
  const { backend, signIn, session } = useOperator();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const identities = useAsync(() => backend.listSignInIdentities(), [], []);

  // Declarative, not a navigate() call in the render body — that one schedules
  // an update to the router while this component is still rendering.
  if (session) return <Navigate to="/operator/dashboard" replace />;

  const go = async (email: string) => {
    const okSignIn = await signIn(email);
    if (!okSignIn) {
      setError("That account is not active. Icefall creates and enables operator accounts.");
      return;
    }
    navigate("/operator/dashboard", { replace: true });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center py-16">
      <div className="mb-6 text-center">
        {/* The wordmark is a NAME, so it is the one serif on this screen. */}
        <div className="ser text-[30px] tracking-[0.12em] text-ink">ICEFALL</div>
        <div className="lbl mt-1.5 text-faint">Operator portal</div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Manage your company profile, your trips and the customers Icefall sends you.
        </p>
      </div>

      <Card className="p-4">
        <p className="text-[12.5px] font-medium text-ink">Choose an account</p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
          Accounts are created by Icefall. There is no sign-up.
        </p>
        <div className="mt-3 space-y-1.5">
          {identities.map((u) => (
            <button
              key={u.id}
              onClick={() => void go(u.email)}
              className="hairline flex w-full items-center justify-between rounded-tile px-3 py-2.5 text-left transition-colors hover:bg-raised"
            >
              <span>
                <span className="block text-[13px] font-medium text-ink">{u.displayName}</span>
                <span className="block text-[11.5px] text-muted">{u.email}</span>
              </span>
              <span className="text-[11.5px] text-muted">
                {u.role === "admin" ? "Company Admin" : "Sales"}
              </span>
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-3">
            <Notice tone="rejected">{error}</Notice>
          </div>
        )}
        <div className="mt-4 border-t border-line pt-3">
          <Button variant="quiet" onClick={() => void go("nobody@example.com")}>
            Try a disabled account
          </Button>
          <p className="mt-1 text-[11px] leading-snug text-faint">
            A removed employee keeps their history in your records but cannot sign in.
          </p>
        </div>
      </Card>
    </div>
  );
}
