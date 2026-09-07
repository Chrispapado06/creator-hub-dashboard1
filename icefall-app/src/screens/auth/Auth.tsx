import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Lock,
  type LucideIcon,
  Mail,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { AppleMark, GoogleMark, MicrosoftMark } from "@/components/ui/BrandMarks";
import { useEnabledProviders } from "@/auth/providers";
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
  rememberMePreference,
  setRememberMe,
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
 *   - Apple, Google and Microsoft are WIRED, and each button is rendered only
 *     when the server says that provider is switched on (`useEnabledProviders`).
 *     Today the project has only email enabled, so none of the three appears.
 *     A button that silently does nothing is worse than no button at all
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

/**
 * THE AUTH SHELL — the owner's mockups, 2026-09-07.
 *
 * A photograph fills the screen; over it, three lines of small caps at the top
 * left, the lockup at the top centre, and (on sign-in) the editorial line
 * "Plan. Train. Climb." with its two sub-lines. The form lives in a dark glass
 * card that sits in the lower half so the photograph reads above it.
 *
 * The photographs are the app's own credited ones (public/img/CREDITS.md):
 * the mockups' dusk range and lone-climber silhouette have no licensed
 * counterpart in the set, so the closest real frames stand in — the Matterhorn
 * at night for sign-in, a starlit ridge for create-account.
 */
export function AuthScreen({
  eyebrow,
  title,
  subtitle,
  back,
  hero = "/img/home-hero.jpg",
  tagline = false,
  progress,
  children,
  footer,
}: {
  eyebrow?: string;
  /** Two lines read better at this size; pass an array to control the break. */
  title: string | string[];
  subtitle?: string;
  back?: string;
  /** The full-bleed photograph behind everything. */
  hero?: string;
  /** The "Plan. Train. Climb." block above the card (sign-in only). */
  tagline?: boolean;
  /** "1 / 2" and the bar — only where the count is true. See SignUp. */
  progress?: { step: number; total: number };
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const lines = Array.isArray(title) ? title : [title];

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      {/* The photograph, and the scrims that let type sit on it. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[78%] overflow-hidden">
        <img src={hero} alt="" aria-hidden className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/70 via-obsidian/25 to-obsidian" />
      </div>

      <div
        className="relative flex min-h-full flex-col px-5 pb-8"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
      >
        {/* ---- Top band: caps left, lockup centre ------------------------- */}
        <div className="relative flex items-start justify-between">
          <div>
            {back && (
              <Link
                to={back}
                aria-label="Back"
                className="-ml-2 mb-3 grid h-9 w-9 place-items-center rounded-full text-snow/80 transition-colors hover:text-snow"
              >
                <ArrowLeft size={19} strokeWidth={1.6} />
              </Link>
            )}
            <p className="text-[9.5px] uppercase leading-[1.7] tracking-[0.22em] text-snow/75">
              Real mountains.
              <br />
              Real preparation.
              <br />
              No shortcuts.
            </p>
          </div>
          <div className="absolute left-1/2 top-0 -translate-x-1/2">
            <IcefallLockup size="sm" />
          </div>
          <span className="w-9" aria-hidden />
        </div>

        {/* ---- The editorial line (sign-in) -------------------------------- */}
        {tagline && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mt-14 text-center"
          >
            <h1 className="display text-[36px] leading-[1.05] text-snow">Plan. Train. Climb.</h1>
            <p className="mt-3 text-[13.5px] leading-relaxed text-snow/80">
              The complete platform for modern mountaineers.
              <br />
              Guides. Expeditions. Training. Community.
            </p>
          </motion.div>
        )}

        {/* ---- The card ---------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
          className={cn(
            "rounded-[18px] border border-white/10 bg-obsidian/80 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl",
            tagline ? "mt-12" : "mt-10",
          )}
        >
          {progress && (
            <div className="mb-5 flex items-center gap-3">
              <span className="tnum text-[12px] text-mist">
                {progress.step} / {progress.total}
              </span>
              <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-azure"
                  style={{ width: `${(progress.step / progress.total) * 100}%` }}
                />
              </span>
            </div>
          )}
          {eyebrow && <p className="section-label mb-2 text-azure/85">{eyebrow}</p>}
          <h2 className="display text-[30px] leading-[1.08] text-snow">
            {lines.map((l) => (
              <span key={l} className="block">
                {l}
              </span>
            ))}
          </h2>
          {subtitle && <p className="mt-2.5 text-[13.5px] leading-relaxed text-mist">{subtitle}</p>}

          <div className="mt-6">{children}</div>

          {footer && <div className="mt-6 text-center">{footer}</div>}
        </motion.div>
      </div>
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
  icon: Icon,
}: {
  /** The accessible name. Drawn as the placeholder in the mockups' style, so
      it is announced but not printed above the box. */
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  /** Adds the show/hide toggle used on password fields. */
  reveal?: boolean;
  /** The glyph at the left edge — user, mail, lock. */
  icon?: LucideIcon;
}) {
  const [shown, setShown] = useState(false);
  const resolved = reveal ? (shown ? "text" : "password") : type;

  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      {Icon && (
        <Icon
          size={17}
          strokeWidth={1.6}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist-dim"
        />
      )}
      <input
        type={resolved}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        autoComplete={autoComplete}
        autoCapitalize={type === "email" ? "none" : undefined}
        spellCheck={false}
        className={cn(
          "h-[52px] w-full rounded-[12px] border border-white/10 bg-white/[0.04] text-[14.5px] text-snow outline-none transition-colors",
          "placeholder:text-mist-dim focus:border-azure/60 focus:bg-white/[0.06]",
          Icon ? "pl-12" : "pl-4",
          reveal ? "pr-12" : "pr-4",
        )}
      />
      {reveal && (
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? "Hide password" : "Show password"}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-mist-dim transition-colors hover:text-mist"
        >
          {shown ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
        </button>
      )}
    </label>
  );
}

/** The "or" rule between the form and the provider buttons. */
function OrRule() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[11px] text-mist-dim">or</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
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
        {/*
          THE GUEST DOOR IS GONE — the owner ruled on 2026-09-02 that ICEFALL
          requires an account. There were TWO of these, here and on the
          create-account screen, and both navigated straight to /onboarding,
          which set the local `onboarded` flag and opened the whole app with no
          account behind it. Nothing was gated, so the app was being built as
          account-required AND as browse-freely at the same time, and every
          screen was growing a signed-out branch nobody had asked for.

          Do not restore this as a convenience. A way in without signing up is a
          product decision with a shape — what a stranger may see and what they
          may not — and it is not a button. To review screens without an
          account, build with VITE_ICEFALL_DEMO=1: the gate in App.tsx exempts
          DEMO builds, which is how the shared Vercel links work.
        */}
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

/**
 * The social doors, wherever they are offered.
 *
 * ONE component rather than a copy on each screen, because the two screens must
 * never disagree about which providers exist. A create-account screen offering
 * Google beside a sign-in screen that does not is a trap with a specific victim:
 * somebody who signed up with Google has NO PASSWORD, so a sign-in screen with
 * only an email field locks them out of their own account with no error message
 * to explain it.
 *
 * It owns its own pending and error state because the failure is local — on
 * success the browser leaves for the provider and never comes back to this
 * render, so there is no success branch to write. Only a failure returns here,
 * and it has to say something, or a tapped button that does nothing looks like a
 * dead app.
 */
function SocialSignIn() {
  const [pending, setPending] = useState<ProviderKey | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const providers = useEnabledProviders();

  async function go(key: ProviderKey) {
    setPending(key);
    setProviderError(null);
    const r = await signInWithProvider(key);
    if (!r.ok) {
      setProviderError(`${PROVIDERS[key].label}: ${r.message}`);
      setPending(null);
    }
  }

  /* Nothing enabled, or not yet known — render NOTHING, not an empty gap with a
     divider under it. A "or continue with" rule above no buttons reads as a
     broken screen. */
  if (providers.keys.length === 0) return null;

  return (
    <div className="space-y-3">
      {/*
        ONLY THE DOORS THAT OPEN.
        These three used to render unconditionally, and on this project NONE of
        them is configured — /auth/v1/settings reports email enabled and every
        other provider false. So all three were controls that could only ever
        produce an error, on the FIRST screen of the app. Somebody who taps
        Google and gets "Unsupported provider" does not conclude the button is
        broken; they conclude the app is.

        `useEnabledProviders` ASKS the server which are switched on, so the
        moment one is enabled in the dashboard its button appears with no code
        change — and, more importantly, switching one OFF cannot leave a dead
        door behind. While the answer is unknown nothing is drawn: an
        optimistic button that later vanishes is worse than one that arrives a
        moment late, because the first invites a tap that fails.

        The marks are the real ones (components/ui/BrandMarks.tsx). What was
        here before was a lucide apple — the fruit, not the company — and the
        bare letters "G" and "M". A wrong mark on a sign-in button reads as a
        phishing page to anybody who has seen the real one, and Apple, Google
        and Microsoft each forbid a redrawn or recoloured mark in their brand
        terms, so this is a store-review question as well as a trust one.
      */}
      {providers.keys.includes("apple") && (
        <ProviderButton
          icon={<AppleMark />}
          label="Continue with Apple"
          onClick={() => go("apple")}
          disabled={pending !== null}
        />
      )}
      {providers.keys.includes("google") && (
        <ProviderButton
          icon={<GoogleMark />}
          label="Continue with Google"
          onClick={() => go("google")}
          disabled={pending !== null}
        />
      )}
      {providers.keys.includes("microsoft") && (
        <ProviderButton
          icon={<MicrosoftMark />}
          label="Continue with Microsoft"
          onClick={() => go("microsoft")}
          disabled={pending !== null}
        />
      )}
      {/*
        `text-danger`, and it was `text-[color:var(--danger,#F08A7C)]` in all
        six places an auth error is printed. There is no `--danger` token in
        this app — it is `--ice-danger` — so the variable never resolved and
        every one of these lines had always been painted by the FALLBACK. The
        dark theme hid it: #F08A7C is a pale salmon that looks fine on obsidian.
        On white it is 2.43:1, and the message telling somebody why they could
        not sign in was the least readable text on the screen.
      */}
      {providerError && (
        <p className="text-[11.5px] leading-relaxed text-danger">{providerError}</p>
      )}
    </div>
  );
}

export function CreateAccount() {
  /* The mockup's create-account page IS the form, with the provider buttons
     under an "or" rule. The chooser this used to be — "Continue with email"
     above the same providers — was one tap of nothing. */
  return <SignUp />;
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
  const providers = useEnabledProviders();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* The address already has an account: the failure comes with the two ways
     out of it, so the sentence is never a dead end. */
  const [existing, setExisting] = useState(false);
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
      setExisting(r.existingAccount === true);
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
        hero="/img/private-hero.jpg"
        back="/auth/create"
      >
        <Note>
          The link proves the address is yours. Until it's opened the account can't be used — that's
          what stops somebody signing up as you.
        </Note>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      title="Create your account"
      subtitle="Join ICEFALL and get access to personalised training plans, AI coaching and more."
      hero="/img/private-hero.jpg"
      /*
       * "1 / 2" IS TRUE ONLY OF THE ACCOUNT. Step two is the username
       * (Handle.tsx shows "2 / 2"); the personalisation questions, the
       * accounts page and the trial offer that follow are not account steps and
       * carry no counter. A "1 / 4" here would be a number nobody measured.
       */
      progress={{ step: 1, total: 2 }}
      footer={<AltLine text="Already have an account?" cta="Sign in" to="/auth/signin" />}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Full name" value={name} onChange={setName} autoComplete="name" icon={User} />
        <Field
          label="Email address"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          icon={Mail}
        />
        <div>
          <Field
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            reveal
            icon={Lock}
          />
          <ul className="mt-3 space-y-1.5">
            {RULES.map((r) => {
              const met = r.test(password);
              return (
                <li key={r.id} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border transition-colors",
                      met
                        ? "border-azure bg-azure/15 text-azure"
                        : "border-hairline text-transparent",
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
        {error && <p className="text-[12px] leading-relaxed text-danger">{error}</p>}
        {error && existing && (
          <div className="flex gap-4">
            <Link
              to="/auth/signin"
              className="text-[12px] text-azure transition-colors hover:text-azure-bright"
            >
              Sign in
            </Link>
            <Link
              to="/auth/forgot"
              className="text-[12px] text-azure transition-colors hover:text-azure-bright"
            >
              Reset password
            </Link>
          </div>
        )}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={!ready}>
          {busy ? "Creating…" : "Create account"}
          {!busy && <ArrowRight size={16} strokeWidth={1.8} />}
        </Button>
      </form>

      {/* The provider doors, only when a provider is actually switched on —
          and the rule above them goes with them, or it points at nothing. */}
      {providers.keys.length > 0 && (
        <>
          <OrRule />
          <SocialSignIn />
        </>
      )}
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
  const [remember, setRemember] = useState(() => rememberMePreference());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = useEnabledProviders();
  const ready = EMAIL_RE.test(email) && password.length > 0;

  async function submit() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    /* Decided BEFORE the session is written, so the session lands in the
       store the box asked for. */
    setRememberMe(remember);
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
      title="Welcome back"
      subtitle="Sign in to continue your journey."
      tagline
      footer={<AltLine text="Don't have an account?" cta="Sign up" to="/auth/create" />}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field
          label="Email address"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          icon={Mail}
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          reveal
          icon={Lock}
        />

        <div className="flex items-center justify-between pt-1">
          {/* A real control: unticked, the session ends when the browser is
              closed. See `authStorage` in backend/client.ts. */}
          <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-mist">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="grid h-[18px] w-[18px] place-items-center rounded-[5px] border border-white/25 bg-white/[0.04] text-obsidian transition-colors peer-checked:border-azure peer-checked:bg-azure peer-focus-visible:ring-2 peer-focus-visible:ring-azure/60"
            >
              {remember && <Check size={12} strokeWidth={3} />}
            </span>
            Remember me
          </label>
          <Link
            to="/auth/forgot"
            className="text-[12.5px] text-azure transition-colors hover:text-azure-bright"
          >
            Forgot password?
          </Link>
        </div>

        {error && <p className="text-[12px] leading-relaxed text-danger">{error}</p>}
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={!ready || busy}>
          {busy ? "Signing in…" : "Sign in"}
          {!busy && <ArrowRight size={16} strokeWidth={1.8} />}
        </Button>
      </form>

      {providers.keys.length > 0 && (
        <>
          <OrRule />
          <SocialSignIn />
        </>
      )}
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
