import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Apple, ArrowLeft, Check, Eye, EyeOff, Mail } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { IcefallLockup } from "@/components/ui/IcefallMark";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import {
  PROVIDERS,
  type ProviderKey,
  sendPasswordReset,
  signInWithEmail,
  signInWithProvider,
  signUpWithEmail,
  nextStepForSession,
  serverIdentity,
  storedOnboarding,
} from "@/auth/account";

/**
 * The way into ICEFALL.
 *
 * THIS IS NOW A REAL ACCOUNT SERVER. Until 2026-08-30 these screens matched an
 * email against a localStorage record and threw the password away on purpose,
 * and said so on every screen. That is no longer true and the copy has moved
 * with it — a screen still promising "stays on this device" would now be the
 * lie, pointed the other way.
 *
 * What changed:
 *   - sign-up and sign-in call Supabase; the password is transmitted and never
 *     stored by us
 *   - Apple, Google and Microsoft are live, and are enabled ONLY in the same
 *     change that made them work — a button that silently does nothing is worse
 *     than an honest disabled one
 *   - "send reset link" actually sends
 *
 * THE ORDER IS ACCOUNT FIRST, THEN HANDLE, THEN QUESTIONS, and that is forced
 * rather than chosen: with Google you have a session before anybody can be asked
 * anything, and a username cannot be claimed without one. `/auth/handle` is
 * therefore the single place both paths converge — see `Handle.tsx`.
 *
 * OFFLINE STAYS OFFLINE. A cached session opens the app. Only creating an
 * account, claiming a handle and syncing need the network.
 */

/**
 * Replaces the old LOCAL_ONLY note, which said the profile stayed on this
 * device. It no longer does, and leaving that sentence up would have been the
 * same failure as the old button that did nothing — a screen making a promise
 * the code stopped keeping.
 */
const SERVER_NOTE =
  "Your account lives on ICEFALL's server so it follows you to a new phone. Your training data stays on this device and syncs when you have signal.";

/* -------------------------------------------------------------------------- */
/* Shared chrome                                                              */
/* -------------------------------------------------------------------------- */

export function AuthScreen({
  eyebrow,
  title,
  subtitle,
  back,
  art,
  children,
  footer,
}: {
  eyebrow: string;
  /** Two lines read better at this size; pass an array to control the break. */
  title: string | string[];
  subtitle?: string;
  back?: string;
  /** A photograph bleeding in from the top-right corner. */
  art?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const lines = Array.isArray(title) ? title : [title];

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      {art && (
        <div className="pointer-events-none absolute right-0 top-0 h-[240px] w-[62%] overflow-hidden">
          <img src={art} alt="" aria-hidden className="h-full w-full object-cover" />
          {/* Two scrims: one down, one across, so the photograph dissolves into
              the canvas instead of ending on a visible edge. */}
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian/30 via-obsidian/80 to-obsidian" />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/50 to-transparent" />
        </div>
      )}

      <div
        className="relative px-6 pb-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
      >
        {back && (
          <Link
            to={back}
            aria-label="Back"
            className="mb-8 grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </Link>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="section-label text-azure/85">{eyebrow}</p>
          <h1 className="display mt-3 text-[34px] leading-[1.08] text-snow">
            {lines.map((l, i) => (
              <span key={l} className="block">
                {l}
                {i < lines.length - 1 ? "" : ""}
              </span>
            ))}
          </h1>
          {subtitle && <p className="mt-3 text-[13px] leading-relaxed text-mist">{subtitle}</p>}

          <div className="mt-8">{children}</div>
        </motion.div>
      </div>

      {footer && <div className="relative px-6 pb-8 text-center">{footer}</div>}
    </div>
  );
}

export function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  reveal,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  /** Adds the show/hide toggle used on password fields. */
  reveal?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const resolved = reveal ? (shown ? "text" : "password") : type;

  return (
    <label className="block">
      <span className="section-label text-mist-dim">{label}</span>
      <span className="relative mt-2 block">
        <input
          type={resolved}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize={type === "email" ? "none" : undefined}
          spellCheck={false}
          className={cn(
            "h-12 w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 text-[14px] text-snow outline-none",
            "placeholder:text-mist-dim focus:border-azure/50",
            reveal && "pr-11",
          )}
        />
        {reveal && (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            aria-label={shown ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-mist-dim transition-colors hover:text-mist"
          >
            {shown ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
          </button>
        )}
      </span>
    </label>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 border-l border-hairline pl-3 text-[11px] leading-relaxed text-mist-dim">
      {children}
    </p>
  );
}

function AltLine({ text, cta, to }: { text: string; cta: string; to: string }) {
  return (
    <p className="text-[12px] text-mist">
      {text}{" "}
      <Link to={to} className="text-azure transition-colors hover:text-azure-bright">
        {cta}
      </Link>
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* 01 — Welcome                                                               */
/* -------------------------------------------------------------------------- */

export function Welcome() {
  const navigate = useNavigate();

  return (
    <div className="grain relative flex h-full w-full flex-col overflow-hidden bg-obsidian">
      <motion.img
        src="/img/splash.jpg"
        alt=""
        aria-hidden
        initial={{ scale: 1.06, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* The brand reference is near-black with the range as a silhouette, so the
          photograph is held right back rather than shown off. Three layers: a
          flat wash to kill the sky's brightness, then a vertical gradient that
          buries the base where the buttons sit. */}
      <div className="absolute inset-0 bg-obsidian/25" />
      <div className="absolute inset-0 bg-gradient-to-b from-obsidian/65 via-obsidian/35 to-obsidian" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative flex flex-1 flex-col items-center justify-center px-8"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <IcefallLockup size="lg" />
        <p className="section-label mt-6 text-center leading-[1.9] text-azure/85">
          Built for those
          <br />
          who go further.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.9, ease: [0.22, 1, 0.36, 1] }}
        className="relative px-6"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 28px)" }}
      >
        <Button className="w-full" onClick={() => navigate("/auth/create")}>
          Create account
        </Button>
        <Button
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => navigate("/auth/signin")}
        >
          Sign in
        </Button>
        <button
          type="button"
          onClick={() => navigate("/onboarding")}
          className="section-label mt-6 w-full text-center text-mist transition-colors hover:text-snow"
        >
          Explore without an account
        </button>
      </motion.div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 02 — Create account: choose a method                                        */
/* -------------------------------------------------------------------------- */

function ProviderButton({
  icon,
  label,
  onClick,
  disabled,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          "flex h-12 w-full items-center justify-center gap-3 rounded-tile border border-hairline bg-elevated/40 text-[14px] text-snow transition-colors",
          disabled ? "cursor-not-allowed opacity-45" : "hover:border-azure/50",
        )}
      >
        {icon}
        {label}
      </button>
      {hint && <p className="mt-1.5 text-[10px] leading-relaxed text-mist-dim">{hint}</p>}
    </div>
  );
}

export function CreateAccount() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<ProviderKey | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);

  /**
   * Hands off to the provider. On success the browser LEAVES, so there is no
   * success branch to write — only a failure returns here, and it has to say
   * something, or a tapped button that does nothing looks like a dead app.
   */
  async function go(key: ProviderKey) {
    setPending(key);
    setProviderError(null);
    const r = await signInWithProvider(key);
    if (!r.ok) {
      setProviderError(`${PROVIDERS[key].label}: ${r.message}`);
      setPending(null);
    }
  }

  return (
    <AuthScreen
      eyebrow="Create account"
      title={["Begin your", "mountain journey."]}
      subtitle="Join ICEFALL and unlock your potential."
      back="/welcome"
      art="/img/expedition-hero.jpg"
      footer={<AltLine text="Already have an account?" cta="Sign in" to="/auth/signin" />}
    >
      <div className="space-y-3">
        {/*
          ENABLED IN THE SAME CHANGE THAT MADE THEM WORK, never before. Each
          navigates away to the provider and returns to /auth/callback.
          A provider that is not switched on in the Supabase dashboard reports
          it here rather than failing silently — see `providerError`.
        */}
        <ProviderButton
          icon={<Apple size={17} strokeWidth={1.6} />}
          label="Continue with Apple"
          onClick={() => go("apple")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<span className="text-[15px] font-medium leading-none">G</span>}
          label="Continue with Google"
          onClick={() => go("google")}
          disabled={pending !== null}
        />
        <ProviderButton
          icon={<span className="text-[15px] font-medium leading-none">M</span>}
          label="Continue with Microsoft"
          onClick={() => go("microsoft")}
          disabled={pending !== null}
        />
        {providerError && (
          <p className="text-[11.5px] leading-relaxed text-[color:var(--danger,#F08A7C)]">
            {providerError}
          </p>
        )}
        <ProviderButton
          icon={<Mail size={17} strokeWidth={1.6} />}
          label="Continue with email"
          onClick={() => navigate("/auth/signup")}
        />
      </div>

      <div className="my-7 flex items-center gap-4">
        <span className="h-px flex-1 bg-hairline" />
        <span className="section-label text-mist-dim">or</span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <Button variant="secondary" className="w-full" onClick={() => navigate("/onboarding")}>
        Explore without an account
      </Button>

      <Note>{SERVER_NOTE}</Note>
    </AuthScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* 03 — Sign up                                                               */
/* -------------------------------------------------------------------------- */

const RULES: { id: string; label: string; test: (p: string) => boolean }[] = [
  { id: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { id: "num", label: "One number", test: (p) => /\d/.test(p) },
  { id: "sym", label: "One special character", test: (p) => /[^\w\s]/.test(p) },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SignUp() {
  const navigate = useNavigate();
  const { createAccount } = useApp();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const passwordOk = RULES.every((r) => r.test(password));
  const ready = name.trim().length > 1 && EMAIL_RE.test(email) && passwordOk && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);

    const r = await signUpWithEmail(name, email, password);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return;
    }

    // Keep the local profile so the app is usable immediately and offline; the
    // server copy is the one that follows them to a new phone.
    createAccount({ name, email });

    // TWO OUTCOMES, AND THEY MUST NOT SHARE A SCREEN. With email confirmation on
    // there is no session yet — routing to /auth/handle would land on a screen
    // that cannot claim anything, because claiming needs a signed-in caller.
    if (r.needsEmailConfirmation) {
      setConfirmSent(true);
      setBusy(false);
      return;
    }
    navigate("/auth/handle", { replace: true });
  }

  if (confirmSent) {
    return (
      <AuthScreen
        eyebrow="Almost there"
        title={["Check your", "email."]}
        subtitle={`We sent a link to ${email.trim().toLowerCase()}. Open it on this device and you'll pick your username next.`}
        back="/auth/create"
      >
        <Note>
          The link proves the address is yours. Until it's opened the account
          can't be used — that's what stops somebody signing up as you.
        </Note>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow="Create account"
      title={["Let's get", "started."]}
      subtitle="Enter your details to create your account."
      back="/auth/create"
      footer={<AltLine text="Already have an account?" cta="Sign in" to="/auth/signin" />}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label="Full name"
          value={name}
          onChange={setName}
          placeholder="Alex Morin"
          autoComplete="name"
        />
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="alex@icefall.com"
          autoComplete="email"
        />
        <div>
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            reveal
          />
          <ul className="mt-3 space-y-1.5">
            {RULES.map((r) => {
              const met = r.test(password);
              return (
                <li key={r.id} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                      met ? "border-azure bg-azure/15 text-azure" : "border-hairline text-transparent",
                    )}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                  <span className={cn("text-[12px]", met ? "text-mist" : "text-mist-dim")}>
                    {r.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {/*
          RENDER THE FAILURE. The first version of this set `error` and never
          showed it, so a refused signup looked exactly like a dead button —
          the same silent-failure class this codebase keeps finding.
        */}
        {error && (
          <p className="text-[12px] leading-relaxed text-[color:var(--danger,#F08A7C)]">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={!ready}>
          {busy ? "Creating…" : "Create account"}
        </Button>
      </form>

      <Note>{SERVER_NOTE}</Note>
    </AuthScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* 04 — Sign in                                                               */
/* -------------------------------------------------------------------------- */

export function SignIn() {
  const navigate = useNavigate();
  const { account, createAccount, completeOnboarding } = useApp();

  const [email, setEmail] = useState(account?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = EMAIL_RE.test(email) && password.length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    const r = await signInWithEmail(email, password);
    if (!r.ok) {
      setError(r.message);
      setBusy(false);
      return;
    }

    // Hydrate this device from the SERVER record before routing. Without it the
    // app keeps rendering whoever last used this phone — during testing a
    // profile showed one person's name directly above another person's handle.
    const who = await serverIdentity();
    if (who) createAccount({ name: who.name, email: who.email });

    // Route on the STATE of the account, not on how they got here: somebody who
    // signed up but never picked a handle lands on the handle screen, whether
    // they arrived by password or by Google.
    const step = await nextStepForSession();

    /*
      RESTORE, DO NOT RE-ASK, AND DO NOT FAKE.

      The server can say "this person finished onboarding" while THIS device has
      never seen them — a new phone, or a cleared browser. Marking the device
      onboarded on the strength of that alone sends them to Home with no
      disciplines, no experience and no objective: a working app with an empty
      person in it. Seen on screen during testing, as a bounce to /welcome.

      So the answers come back with them. If they cannot be fetched, the honest
      fallback is the questions — irritating, and correct.
    */
    if (step === "home") {
      const restored = await storedOnboarding();
      if (restored) {
        completeOnboarding(restored as unknown as Parameters<typeof completeOnboarding>[0]);
        setBusy(false);
        navigate("/home", { replace: true });
        return;
      }
      setBusy(false);
      navigate("/onboarding", { replace: true });
      return;
    }

    setBusy(false);
    if (step === "handle") navigate("/auth/handle", { replace: true });
    else navigate("/onboarding", { replace: true });
  }

  return (
    <AuthScreen
      eyebrow="Sign in"
      title="Welcome back."
      subtitle="Nice to see you again."
      back="/welcome"
      footer={<AltLine text="Don't have an account?" cta="Create one" to="/auth/create" />}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="alex@icefall.com"
          autoComplete="email"
        />
        <div>
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="••••••••"
            autoComplete="current-password"
            reveal
          />
          <div className="mt-2 text-right">
            <Link
              to="/auth/forgot"
              className="text-[12px] text-azure transition-colors hover:text-azure-bright"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <p className="text-[12px] leading-relaxed text-[color:var(--danger,#F08A7C)]">{error}</p>
        )}
        <Button type="submit" className="w-full" disabled={!ready || busy}>
          Sign in
        </Button>
      </form>

      <Note>
        {SERVER_NOTE}</Note>
    </AuthScreen>
  );
}

/* -------------------------------------------------------------------------- */
/* 05 — Forgot password                                                       */
/* -------------------------------------------------------------------------- */

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  return (
    <AuthScreen
      eyebrow="Forgot password"
      title={["No worries,", "we've got you."]}
      subtitle="Enter your email and we'll send you a link to reset your password."
      back="/auth/signin"
      footer={<AltLine text="" cta="Back to sign in" to="/auth/signin" />}
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          // It really sends now. The screen shows the same message whether or
          // not the address has an account, deliberately — a different answer
          // for "no such user" turns this form into a way to test whether
          // somebody is a member.
          setBusy(true);
          await sendPasswordReset(email);
          setBusy(false);
          setSent(true);
        }}
      >
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="alex@icefall.com"
          autoComplete="email"
        />
        <Button type="submit" className="w-full" disabled={!EMAIL_RE.test(email) || busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      {sent ? (
        <Note>
          No email was sent. ICEFALL has no account server and therefore no way to deliver a reset
          link — this screen is the design, not a working flow. Your profile on this device does not
          have a password to reset.
        </Note>
      ) : (
        <Note>
          ICEFALL can't actually send this yet — there's no account server behind it. Nothing on
          this device is locked behind a password.
        </Note>
      )}
    </AuthScreen>
  );
}
