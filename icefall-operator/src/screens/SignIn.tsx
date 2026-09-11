/**
 * Sign-in.
 *
 * ── THERE IS NO SIGN-UP HERE, AND THERE MUST NEVER BE ───────────────────────
 * Company accounts are created by ICEFALL and membership arrives by INVITATION
 * (spec §13; `src/auth/account.ts` explains what the schema does to a `signUp()`
 * call — it mints an ATHLETE, not an operator, who then sits at this screen
 * being refused for a reason nobody can explain). So this screen says so in
 * words rather than offering a door that leads nowhere.
 *
 * ── FOUR STATES, NOT TWO ────────────────────────────────────────────────────
 * "Signed in or not" is the wrong model for this door, and collapsing the
 * middle two would tell somebody something untrue:
 *
 *   unknown       the stored session has not been checked. Say that; do not
 *                 flash a login form at somebody who is already signed in.
 *   signed-out    the form.
 *   none          AUTHENTICATED, and no active `company_users` row. This is the
 *                 ordinary shape of every athlete account in the project. It is
 *                 not an error, it is not a wrong password, and there is no
 *                 self-serve way out of it — so it is stated plainly and the
 *                 screen stops. No "request access" button: this portal cannot
 *                 attach an account to a company, and a button that raises
 *                 nothing would be a promise the system does not keep.
 *   unavailable   the membership READ failed. Emphatically not "you have no
 *                 operator account" — that sentence on a network blip sends an
 *                 operator to sales instead of to reload.
 *
 * ── THE DEMO KEEPS THE PICKER ───────────────────────────────────────────────
 * A demo that opens on a password wall is a demo nobody gets past. Under DEMO
 * the identity list is the door, exactly as before. On a live build
 * `listSignInIdentities()` returns an empty list BY DESIGN — a roster of a
 * company's real accounts on a public URL is an enumeration of who works there
 * — so the picker is gated on the flag, not on the list being empty.
 */

import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ARRIVED_AS } from "@/backend/client";
import {
  AUTH_MESSAGES,
  rememberMePreference,
  sendPasswordReset,
  setNewPassword,
  signInWithEmail,
  signOut as authSignOut,
} from "@/auth/account";
import { Button, Card, Notice, inputClass } from "@/components/ui";
import { DEMO } from "@/offline/offline";
import { useAsync, useOperator } from "@/state/OperatorContext";

/* -------------------------------------------------------------------------- */
/* Shared frame                                                               */
/* -------------------------------------------------------------------------- */

function Frame({ children, lede }: { children: React.ReactNode; lede: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center py-16">
      <div className="mb-6 text-center">
        {/* The wordmark is a NAME, so it is the one serif on this screen. */}
        <div className="ser text-[30px] tracking-[0.12em] text-ink">ICEFALL</div>
        <div className="lbl mt-1.5 text-faint">Operator portal</div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{lede}</p>
      </div>
      {children}
    </div>
  );
}

const LEDE = "Manage your company profile, your trips and the customers Icefall sends you.";

/* -------------------------------------------------------------------------- */
/* The demo picker — unchanged, and DEMO-only                                 */
/* -------------------------------------------------------------------------- */

function DemoPicker() {
  const { backend, signIn } = useOperator();
  const [error, setError] = useState<string | null>(null);
  const identities = useAsync(() => backend.listSignInIdentities(), [], []);

  const go = async (email: string) => {
    const okSignIn = await signIn(email);
    if (!okSignIn) {
      setError("That account is not active. Icefall creates and enables operator accounts.");
      return;
    }
    // No navigate() — the session lands in context and the redirect above fires.
  };

  return (
    <Card className="p-4">
      <p className="text-[12.5px] font-medium text-ink">Choose an account</p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
        Sample accounts, for this preview only. On the real portal this is an email and a password.
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
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Set a new password — the second half of a reset link                       */
/* -------------------------------------------------------------------------- */

/**
 * `ARRIVED_AS === "recovery"` is the ONLY signal this browser is here to set a
 * new password: auth-js consumes `#type=recovery` and clears the hash before
 * any screen mounts, so it is captured above `createClient` and read from
 * there, never re-derived from the URL.
 *
 * Without this the reset link is a dead end — it signs the person in with the
 * password they have forgotten still in place.
 */
function SetNewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Choose a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Those two passwords are not the same.");
      return;
    }
    setBusy(true);
    const outcome = await setNewPassword(password);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onDone();
  };

  return (
    <Frame lede="Choose a new password for your Icefall operator account.">
      <Card className="p-4">
        <form onSubmit={submit} noValidate>
          <p className="text-[12.5px] font-medium text-ink">Set a new password</p>
          <label className="mt-3 block">
            <span className="block text-[12px] font-medium text-ink">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          <label className="mt-3 block">
            <span className="block text-[12px] font-medium text-ink">New password again</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          {error && (
            <div className="mt-3">
              <Notice tone="rejected">{error}</Notice>
            </div>
          )}
          <div className="mt-4">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </div>
        </form>
      </Card>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Forgot password                                                            */
/* -------------------------------------------------------------------------- */

function ForgotPassword({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Enter the email address your Icefall account uses.");
      return;
    }
    setBusy(true);
    const outcome = await sendPasswordReset(email);
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setSent(true);
  };

  return (
    <Card className="p-4">
      {sent ? (
        <>
          <p className="text-[12.5px] font-medium text-ink">Check that inbox</p>
          {/*
            WHAT THIS MAY AND MAY NOT CLAIM. Supabase accepted the request; it
            did not tell us an email was delivered, and it answers identically
            whether or not an account exists at that address — on purpose, so
            nobody can probe which operator addresses are registered. "We sent
            you a link" would be two claims the system did not make.
          */}
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            If <span className="text-ink">{email.trim()}</span> has an Icefall account, a link to set a new
            password is on its way. Icefall does not say whether an address is registered, so this
            message looks the same either way.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={onBack}>
              Back to sign in
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="text-[12.5px] font-medium text-ink">Forgotten password</p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
            Enter your address and Icefall will email a link to set a new one.
          </p>
          <label className="mt-3 block">
            <span className="block text-[12px] font-medium text-ink">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
          {error && (
            <div className="mt-3">
              <Notice tone="rejected">{error}</Notice>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "Sending…" : "Email me a link"}
            </Button>
            <Button variant="quiet" onClick={onBack}>
              Back
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Email and password — the only door on a live build                         */
/* -------------------------------------------------------------------------- */

function PasswordForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(rememberMePreference);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  if (forgot) return <ForgotPassword initialEmail={email} onBack={() => setForgot(false)} />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    /*
     * Checked here, and said as OUR failing rather than the server's: an empty
     * field is not a rejected credential, and "that email and password don't
     * match" would be a claim about a request that was never made.
     */
    if (!email.trim() || !password) {
      setError("Enter your email address and your password.");
      return;
    }
    setBusy(true);
    const outcome = await signInWithEmail(email, password, remember);
    if (!outcome.ok) {
      setBusy(false);
      setError(outcome.message);
      return;
    }
    /*
     * DELIBERATELY STAYS BUSY. There is no navigate() here: the session reaches
     * the portal through `useSessionState()`, and the membership read that
     * turns it into an operator scope runs after it. Releasing the button now
     * would show an empty sign-in form for that half-second, to somebody who
     * has just signed in successfully.
     */
  };

  return (
    <Card className="p-4">
      <form onSubmit={submit} noValidate>
        <p className="text-[12.5px] font-medium text-ink">Sign in</p>
        <label className="mt-3 block">
          <span className="block text-[12px] font-medium text-ink">Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="mt-3 block">
          <span className="block text-[12px] font-medium text-ink">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>

        {/*
          "Remember me" decides WHICH BROWSER STORE holds the session — shared
          across tabs and restarts, or this tab only. A CRM is opened on shared
          office machines and on a laptop left in a lodge, so the choice is made
          before signing in and the hint says what it actually does.
        */}
        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-(--color-azure)"
          />
          <span>
            <span className="block text-[12px] text-ink">Stay signed in on this computer</span>
            <span className="block text-[11px] leading-snug text-faint">
              Turn this off on a shared machine and the sign-in ends when you close the tab.
            </span>
          </span>
        </label>

        {error && (
          <div className="mt-3">
            <Notice tone="rejected">{error}</Notice>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          <Button variant="quiet" onClick={() => setForgot(true)}>
            Forgotten password?
          </Button>
        </div>
      </form>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-[11.5px] leading-relaxed text-muted">
          There is no sign-up. Icefall creates operator accounts, and a place on a company's team
          arrives as an invitation to your email address. If your company works with Icefall, ask a
          Company Admin there to invite this address.
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The screen                                                                 */
/* -------------------------------------------------------------------------- */

export default function SignIn() {
  const { session, membership, membershipError, signOut } = useOperator();
  /*
   * Latched, not read live: the recovery session is a real session, so the
   * moment the new password is saved the redirect below takes over. This flag
   * is what stops the form re-appearing behind it.
   */
  const [recoveryDone, setRecoveryDone] = useState(false);

  /*
   * BEFORE the session redirect. A recovery link arrives WITH a session — that
   * is what makes `updateUser` possible — so a screen that checks the session
   * first walks the person straight past the form they came for and back into
   * the portal with the forgotten password still set.
   */
  if (!DEMO && ARRIVED_AS === "recovery" && !recoveryDone) {
    return <SetNewPassword onDone={() => setRecoveryDone(true)} />;
  }

  // Declarative, not a navigate() call in the render body — that one schedules
  // an update to the router while this component is still rendering.
  if (session) return <Navigate to="/operator/dashboard" replace />;

  if (DEMO) {
    return (
      <Frame lede={LEDE}>
        <DemoPicker />
      </Frame>
    );
  }

  /* Not established yet. Says so rather than flashing a form at somebody who
     turns out to be signed in a moment later. */
  if (membership === "unknown") {
    return (
      <Frame lede={LEDE}>
        <Card className="p-4">
          <p className="text-[12.5px] text-muted">Checking your sign-in…</p>
        </Card>
      </Frame>
    );
  }

  /*
   * AUTHENTICATED, WITH NO OPERATOR SCOPE. An ordinary state, said plainly.
   *
   * No "request access", no company chooser, no form: this portal has no way to
   * attach an account to a company — `accept_invitations()` matches an
   * invitation that already exists — so anything offered here would be a
   * control that raises nothing. The one action that is real is signing out,
   * which is how the wrong account gets off this machine.
   */
  if (membership === "none") {
    return (
      <Frame lede="This account is signed in to Icefall, but it is not part of an operator's team.">
        <Card className="p-4">
          <p className="text-[12.5px] font-medium text-ink">No operator account is attached to this sign-in</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            {AUTH_MESSAGES.NO_ACCOUNT}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            An invitation is sent to an email address. When you accept one with this address, the
            company's workspace opens here — nothing needs to be requested from this screen.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </Card>
      </Frame>
    );
  }

  /*
   * THE READ FAILED. Not "you have no operator account" — that sentence on a
   * network blip sends an operator to a commercial conversation instead of to
   * a reload, and it is a claim about their account we did not establish.
   */
  if (membership === "unavailable") {
    return (
      <Frame lede={LEDE}>
        <Card className="p-4">
          <p className="text-[12.5px] font-medium text-ink">Icefall could not check your account</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            {membershipError ?? AUTH_MESSAGES.UNEXPLAINED}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            This says nothing about whether your account works — the check itself did not complete.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Try again
            </Button>
            <Button variant="quiet" onClick={() => void authSignOut()}>
              Sign out
            </Button>
          </div>
        </Card>
      </Frame>
    );
  }

  return (
    <Frame lede={LEDE}>
      <PasswordForm />
    </Frame>
  );
}
