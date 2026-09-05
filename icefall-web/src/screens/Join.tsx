import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppStoreButton } from "@/components/AppStoreButton";
import { useAuth } from "@/lib/auth";
import { PROVIDERS, type ProviderKey } from "@/auth/account";
import { cn } from "@/lib/utils";

/**
 * JOIN — create an ICEFALL account, at an address you can link to.
 *
 * Built to the component the owner sent (21st.dev "auth-section-1"): a split
 * screen, the form on the left, a full-bleed panel on the right with a headline
 * at the top and one call to action at the foot.
 *
 * ── WHY THIS PAGE EXISTS WHEN A SIGN-UP ALREADY DID ─────────────────────────
 *
 * `AuthModal` has done this since 31 August, but only as a POP-UP, and only
 * inside the dev-only `/preview` tree. A modal has no address: it cannot be
 * linked from an email, an App Store listing, an advert or a launch site. Both
 * now exist and both call the SAME `signUp`/`signInWith` — this is a second
 * door to one room, not a second account system.
 *
 * ── WHAT WAS CHANGED FROM THE SUPPLIED COMPONENT, AND WHY ───────────────────
 *
 * 1. SOMEBODY ELSE'S PRODUCT, REMOVED. It shipped carrying "Brainstrom in chat,
 *    build in cowork", "Think fast, Build faster", "Download the windows app"
 *    and "solaceui feature updates". Those are another company's claims, and on
 *    a sign-up page they read as design rather than copy, which is exactly how
 *    they survive into production. ICEFALL has no Windows app, so that button
 *    would have been a promise of a thing that does not exist — the same defect
 *    as the App Store button caught earlier today.
 *
 * 2. THE OPT-OUT CHECKBOX IS GONE. It read "I don't want to receive emails
 *    about solaceui feature updates" — unticked, meaning consent by default and
 *    a tick to refuse. That is an opt-OUT, and this project settled the
 *    opposite this afternoon: marketing consent is opt-IN, unticked, unbundled,
 *    and recorded with the wording shown. There is no marketing box here at all
 *    rather than a wrong one — see the note at the checkbox site below.
 *
 * 3. THE PREFILLED FAKE DATA IS GONE. Its fields shipped holding "Harshit",
 *    "Sharma" and "harshitlog@gmail.com" as values which cleared on focus, with
 *    the label sitting inside the box on the right. Real fields start empty and
 *    keep their label visible, because a person filling a form needs to know
 *    what the box wants after they have started typing.
 *
 * 4. THE SHADER DEPENDENCY IS GONE. The right panel was an animated orange
 *    grain gradient from `@paper-design/shaders-react`. Orange is not this
 *    brand and a WebGL package is a lot of weight for decoration — and ICEFALL
 *    owns something better: photographs of the actual mountains, already in the
 *    bundle, already credited. Everest is a stronger right-hand panel than a
 *    gradient, and costs no dependency.
 */

/** The two legal documents this page must link to before it may go public. */
const LEGAL_PAGES_EXIST = false;

export default function Join() {
  const { signedIn, ready, signUp, signInWith } = useAuth();

  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  // Wait for the session to restore before deciding — see `ready` in auth.tsx.
  if (ready && signedIn) return <Navigate to="/app" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    // The account model holds ONE display name; the design asks for two fields.
    // Joining them here keeps the design without forking the data shape.
    const name = [first.trim(), last.trim()].filter(Boolean).join(" ");
    const result = await signUp(name, email, password);
    if (result.ok) {
      // Supabase returns a user with no session when confirmation is required.
      // That difference is "you're in" versus "go and click a link", and this
      // page must not guess which.
      if (result.needsEmailConfirmation) setConfirm(true);
    } else {
      setError(result.message);
    }
    setBusy(false);
  }

  async function useProvider(key: ProviderKey) {
    setBusy(true);
    setError(null);
    const result = await signInWith(key);
    // Success navigates away to the provider; only a failure returns here.
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  }

  return (
    <section className="min-h-screen bg-obsidian p-3 text-snow antialiased">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-3 lg:grid-cols-[0.94fr_1.06fr]">
        {/* ── the form ─────────────────────────────────────────────────── */}
        <div className="flex min-h-[760px] items-start rounded-card border border-hairline bg-graphite px-6 py-12 sm:px-10 lg:min-h-0 lg:px-14 lg:py-24 xl:px-20">
          <div className="mx-auto w-full max-w-[560px]">
            <Link
              to="/"
              className="inline-flex items-center gap-2.5 text-[13px] tracking-[0.22em] text-mist transition-colors hover:text-snow"
            >
              ICEFALL
            </Link>

            {confirm ? (
              <div className="mt-14">
                <h1 className="text-3xl font-light tracking-[-0.03em] sm:text-4xl">Check your email</h1>
                <p className="mt-4 max-w-[420px] text-[15px] leading-relaxed text-mist">
                  We've sent a link to <span className="text-snow">{email}</span>. Open it to finish
                  creating your account.
                </p>
                {/*
                  No "resend" button: the confirmation email comes from Supabase's
                  built-in sender, which manages a handful an hour and is not yet
                  swapped for a real provider. A resend control that silently does
                  nothing is worse than no control.
                */}
              </div>
            ) : (
              <>
                <div className="mt-12">
                  <h1 className="text-3xl font-light tracking-[-0.03em] sm:text-4xl lg:text-[42px] lg:leading-[1.05]">
                    Create an account
                  </h1>
                  <p className="mt-3 text-lg leading-snug text-mist sm:text-xl lg:text-2xl">
                    Plan the mountain. Train for it. Go.
                  </p>
                </div>

                <div className="mt-10 grid gap-3 sm:grid-cols-3">
                  <ProviderButton onClick={() => void useProvider("google")} disabled={busy} icon={<GoogleIcon />}>
                    Google
                  </ProviderButton>
                  <ProviderButton onClick={() => void useProvider("apple")} disabled={busy} icon={<AppleIcon />}>
                    Apple
                  </ProviderButton>
                  <ProviderButton onClick={() => void useProvider("microsoft")} disabled={busy} icon={<MicrosoftIcon />}>
                    {PROVIDERS.microsoft.label}
                  </ProviderButton>
                </div>

                <div className="my-8 flex items-center gap-4">
                  <span className="h-px flex-1 bg-hairline" />
                  <span className="text-[12px] uppercase tracking-[0.16em] text-mist-dim">or</span>
                  <span className="h-px flex-1 bg-hairline" />
                </div>

                <form onSubmit={onSubmit} noValidate className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="First name" value={first} onChange={setFirst} autoComplete="given-name" disabled={busy} />
                    <Field label="Last name" value={last} onChange={setLast} autoComplete="family-name" disabled={busy} />
                  </div>
                  <Field
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    disabled={busy}
                    invalid={error !== null}
                  />
                  <Field
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    hint="At least 10 characters"
                    disabled={busy}
                  />

                  {/*
                    NO MARKETING CHECKBOX HERE, DELIBERATELY.

                    The supplied component had one, inverted — "I don't want to
                    receive emails", unticked, so silence meant yes. This project
                    settled the opposite this afternoon: opt-in, unticked,
                    unbundled, stored with the exact wording shown.

                    A correct box cannot go here YET because there is nowhere to
                    put the answer: `profiles` has no consent column, and the
                    waitlist's three columns are on `waitlist`. A tick whose
                    answer is discarded is worse than not asking — it collects a
                    permission the product then cannot prove it has. When the
                    profiles migration lands, reuse `MARKETING_CONSENT_TEXT` so
                    both surfaces ask in one voice.
                  */}

                  {error !== null && (
                    <p role="alert" className="text-[13px] text-danger">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={busy}
                    className={cn(
                      "mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-[10px]",
                      "bg-azure text-[15px] font-medium text-obsidian transition-colors hover:bg-azure-bright",
                      "outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite",
                      "disabled:pointer-events-none disabled:opacity-40",
                    )}
                  >
                    {busy && <Loader2 size={15} className="animate-spin" />}
                    {busy ? "Creating your account" : "Create account"}
                  </button>

                  {/*
                    THE LEGAL LINE IS TEXT, NOT LINKS — for now.

                    The supplied component linked "Terms and Services" and
                    "Privacy Policy" to `href="#"`. Neither page exists in this
                    app, and a dead link to a privacy policy on a public sign-up
                    page is worse than no link: it asserts the document exists.
                    `LEGAL_PAGES_EXIST` flips this to real links the day they do,
                    and this page should not go public before then.
                  */}
                  <p className="pt-1 text-[12.5px] leading-relaxed text-mist-dim">
                    By creating an account you agree to ICEFALL's{" "}
                    {LEGAL_PAGES_EXIST ? (
                      <>
                        <Link to="/terms" className="text-mist underline underline-offset-2">terms</Link>
                        {" and "}
                        <Link to="/privacy" className="text-mist underline underline-offset-2">privacy policy</Link>
                      </>
                    ) : (
                      <span className="text-mist">terms and privacy policy</span>
                    )}
                    .
                  </p>
                </form>

                <p className="mt-8 text-[13.5px] text-mist-dim">
                  Already have an account?{" "}
                  <Link to="/sign-in" className="text-azure">
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── the panel: ICEFALL's own mountain, not a shader ───────────── */}
        <div className="relative hidden min-h-[720px] overflow-hidden rounded-card bg-slate p-8 sm:p-12 lg:flex lg:min-h-0">
          <img
            src="/img/everest.jpg"
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/45 to-obsidian/15"
          />

          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            <h2 className="max-w-[620px] text-5xl font-light leading-[0.98] tracking-[-0.04em] text-snow sm:text-6xl lg:pt-10 lg:text-[64px] xl:text-[70px]">
              Every mountain,
              <br />
              measured.
            </h2>

            <div className="max-w-[440px]">
              {/*
                The catalogue, in the numbers it can actually stand behind —
                52 peaks, 252 treks, 77,141 walking routes. The supplied panel
                ended in "Download the windows app"; ICEFALL has no Windows app,
                and `AppStoreButton` already says the honest thing about the one
                store that matters.
              */}
              <p className="text-[15px] leading-relaxed text-mist">
                52 mountains with first-ascent records, 252 treks across 22 regions, and 77,141
                walking routes from OpenStreetMap.
              </p>
              <AppStoreButton className="mt-6" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function ProviderButton({
  children,
  icon,
  onClick,
  disabled,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-11 items-center justify-center gap-2 rounded-[10px] border border-hairline-strong bg-obsidian/40",
        "text-[13.5px] text-snow transition-colors hover:border-azure/50 hover:bg-white/[0.03]",
        "outline-none focus-visible:ring-2 focus-visible:ring-azure/60 focus-visible:ring-offset-2 focus-visible:ring-offset-graphite",
        "disabled:pointer-events-none disabled:opacity-40",
      )}
    >
      <span className="shrink-0">{icon}</span>
      {children}
    </button>
  );
}

/**
 * A labelled field. The label stays visible above the box.
 *
 * The supplied component put the label INSIDE the box on the right and hid it
 * the moment you started typing, with a fake value in the input until focus
 * cleared it. Both are demo affectations: a person who tabs back to a
 * half-filled form needs to see what each box is for.
 */
function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  hint,
  disabled,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  hint?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const id = `join-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label htmlFor={id} className="block">
      <span className="section-label block">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        disabled={disabled}
        placeholder={hint}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-2 h-12 w-full rounded-[10px] border bg-obsidian/40 px-4 text-[14.5px] text-snow",
          "outline-none transition-colors placeholder:text-mist-dim",
          "focus:border-azure/55 disabled:opacity-50",
          invalid === true ? "border-danger/60" : "border-hairline-strong",
        )}
      />
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" fill="#EB4335" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.54c-.03-3.02 2.47-4.47 2.58-4.54-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.58 1.1-.95 0-2.42-1.07-3.98-1.04-2.05.03-3.94 1.19-4.99 3.02-2.13 3.69-.54 9.16 1.53 12.15 1.01 1.46 2.22 3.1 3.81 3.04 1.53-.06 2.11-.99 3.96-.99s2.37.99 3.99.96c1.65-.03 2.69-1.49 3.69-2.96 1.16-1.69 1.64-3.33 1.66-3.41-.04-.02-3.2-1.23-3.24-4.87ZM14.03 3.66c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.68.81-3.55 1.83-.78.9-1.46 2.34-1.28 3.72 1.35.1 2.73-.69 3.58-1.71Z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 2h9.5v9.5H2Z" fill="#F25022" />
      <path d="M12.5 2H22v9.5h-9.5Z" fill="#7FBA00" />
      <path d="M2 12.5h9.5V22H2Z" fill="#00A4EF" />
      <path d="M12.5 12.5H22V22h-9.5Z" fill="#FFB900" />
    </svg>
  );
}
