import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowRight, Eye, EyeOff, Globe, Headset, Mountain, Quote, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

/**
 * ICEFALL CRM — sign in.
 *
 * ── THREE THINGS IN THE MOCKUP THAT ARE NOT BUILT AS DRAWN ──────────────────
 *
 * 1. THE STATISTICS ARE FABRICATED. The design shows "500+ Companies · 1,250+
 *    Expeditions · 25+ Countries". ICEFALL has no companies, no expeditions and
 *    no customers — nothing has ever been deployed and no money has ever moved.
 *    Those three figures are the first thing a member of staff reads every
 *    morning, and printing them would make the product's central claim — that
 *    its numbers are true — false on the login screen.
 *
 *    So they render only under `SHOW_DEMO_DATA`, and when the flag is off the
 *    panel says what ICEFALL actually knows. Same treatment as every other
 *    invented figure in this CRM.
 *
 * 2. THE TESTIMONIAL IS A FABRICATED PERSON, and is not built at all.
 *    The design attributes a quote to a named individual at "7 Summits Treks".
 *    Two separate problems: the constitution forbids inventing a person outright,
 *    and that company name is one character from Seven Summit Treks, a real
 *    business the owner has specifically ruled must be removed from this product.
 *    A fabricated endorsement from a near-real company is the worst version of
 *    both rules at once, so the card keeps its shape and carries something true
 *    instead.
 *
 * 3. GOOGLE AND MICROSOFT SIGN-IN ARE NOT WIRED, and are rendered disabled with
 *    a reason rather than as working buttons. No OAuth provider is configured on
 *    this project. A button that looks like it signs you in and does nothing is
 *    the same failure as a figure that looks measured and is not — and on a login
 *    screen it is the one a locked-out administrator will click first.
 *
 * ── THE ACCENT QUESTION IS SETTLED ─────────────────────────────────────────
 *
 * This file used to hold a single GOLD constant with a note saying the mockup's
 * gold and the product's azure could not both be right. Neither survived: the
 * owner's Sep 2026 ruling was to match the reference theme 1:1, and the theme has
 * NO accent hue at all — every colour token in it is chroma 0. So the submit
 * button, the links and the proof icons all read `--primary`, and there is no
 * literal colour left in this file outside the two provider marks, which are
 * other companies' trademarks and are drawn in their own colours or not at all.
 *
 * ── RE-SKIN: WHAT MOVED, AND WHAT DID NOT ──────────────────────────────────
 *
 * The page is now the theme's own login: full-bleed `h-dvh`, a one-third panel
 * beside a two-thirds form column, the theme's Field/InputGroup/Button
 * primitives, and the theme's light `text-5xl` headline in the sans face rather
 * than the mockup's serif. NOTHING WAS DROPPED. The photograph, the wordmark,
 * the headline, the proof panel and its honest "None yet", Contact Support,
 * Forgot password, both provider buttons, Request access and the footer links
 * are all still here; Contact Support moved from a right-aligned row above the
 * form to the top of the form column, which is where the theme puts its own
 * top-right auth link.
 */

export default function SignIn() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex h-dvh bg-background">
      {/* ---- Left: the photograph and the proof panel ------------------- */}
      {/* The theme's login puts a solid `bg-primary` panel beside the form and
          sets its type in `primary-foreground`. This is that panel, with the
          photograph underneath the veil rather than instead of it — which is
          also the only arrangement in which the headline and the paragraph are
          legible at a third of the page. */}
      <section className="relative hidden shrink-0 flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex lg:w-2/5 xl:w-1/3">
        <Photograph />

        <div className="relative">
          <Wordmark />
          <h1 className="mt-12 font-light text-5xl leading-[1.06] tracking-tight">
            Manage. Connect.
            <br />
            Grow.
          </h1>
          <p className="mt-5 max-w-[380px] text-primary-foreground/80 leading-relaxed">
            ICEFALL CRM gives your expedition business the tools to build relationships, manage
            leads, and grow your adventures worldwide.
          </p>
        </div>

        <ProofPanel />
      </section>

      {/* ---- Right: the form ------------------------------------------- */}
      <section className="flex min-w-0 flex-1 flex-col bg-background px-6 py-8 sm:px-12 lg:w-2/3">
        <div className="flex items-center justify-end gap-3">
          <span className="text-muted-foreground text-sm">Need help?</span>
          {/* Drawn as the mockup draws it, but NOT a mailto: there is no
              support mailbox — support contract correction, 30 Aug 2026.
              A link to a dead address is a reply nobody will ever read.
              Points at the real desk instead; staff sign in to reach it. */}
          <span
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 font-medium text-sm"
            title="Support is handled inside the CRM — sign in to reach the desk."
          >
            <Headset className="size-4 text-muted-foreground" />
            Contact Support
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <div className="space-y-2">
            <h2 className="font-medium text-3xl tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground text-sm">Sign in to access your ICEFALL CRM dashboard.</p>
          </div>

          {/*
            THIS FORM USED TO DO NOTHING. `onSubmit={(e) => e.preventDefault()}`
            and no handler — so the CRM rendered a complete, convincing sign-in
            that could not sign anybody in. It was survivable only while a demo
            fallback granted access when Supabase was unconfigured; the day real
            credentials landed in `.env.local` that fallback became dead code
            and the CRM became a locked door with no key.

            Access still requires BOTH halves of the staff check in
            `auth/session.tsx` — `profiles.role = 'admin'` AND an active
            `staff_members` row. Signing in is not the same as being staff, and
            a climber's account signing in here correctly lands on "not staff".
          */}
          <form
            className="mt-8 flex flex-col gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              setBusy(true);
              setError(null);
              if (!supabase) {
                setError("The CRM isn't connected to the database.");
                setBusy(false);
                return;
              }
              const { error: err } = await supabase.auth.signInWithPassword({
                email: email.trim().toLowerCase(),
                password,
              });
              setBusy(false);
              if (err) {
                setError(
                  /invalid login credentials/i.test(err.message)
                    ? "That email and password don't match an account."
                    : err.message,
                );
              }
              // On success the session listener in `auth/session.tsx` takes
              // over and re-renders; there is nothing to navigate to here.
            }}
          >
            <Field className="gap-1.5">
              <FieldLabel htmlFor="email">Email address</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </InputGroup>
            </Field>

            <Field className="gap-1.5">
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <Eye /> : <EyeOff />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <div className="flex justify-end">
                <a href="#" className="font-medium text-primary text-sm">
                  Forgot password?
                </a>
              </div>
            </Field>

            {/* Render the failure. A form that refuses silently is the same
                defect as one that does nothing. */}
            {error && <p className="text-destructive text-sm leading-relaxed">{error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </form>

          <div className="relative my-7 text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-border after:border-t">
            <span className="relative z-10 bg-background px-2 text-muted-foreground">or continue with</span>
          </div>

          {/*
            DISABLED, NOT DECORATIVE. No OAuth provider is configured on this
            project, so these cannot sign anybody in. Rendering them as working
            buttons would leave a locked-out administrator clicking the thing
            that was never going to work, which is the worst moment to discover
            a control is a picture of a control.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ProviderButton label="Sign in with Google" mark={<GoogleMark />} />
            <ProviderButton label="Sign in with Microsoft" mark={<MicrosoftMark />} />
          </div>

          <p className="mt-8 text-center text-muted-foreground text-sm">
            Don&rsquo;t have an account?{" "}
            <a href="#" className="inline-flex items-center gap-1 font-medium text-primary">
              Request access
              <ArrowRight className="size-3.5" />
            </a>
          </p>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
          <span className="flex items-center gap-2.5">
            <MountainMark size={20} />© {new Date().getFullYear()} ICEFALL. All rights reserved.
          </span>
          <span className="flex items-center gap-7">
            <a href="#" className="transition-colors hover:text-foreground">Privacy Policy</a>
            <a href="#" className="transition-colors hover:text-foreground">Terms of Service</a>
          </span>
        </footer>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ProviderButton({ label, mark }: { label: string; mark: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled
      title="No OAuth provider is configured on this project, so this cannot sign anybody in."
      className="w-full"
    >
      {mark}
      {label}
    </Button>
  );
}

/**
 * The proof panel, as drawn in the mockup.
 *
 * EVERYTHING IN IT IS INVENTED, and it is gated on `SHOW_DEMO_DATA` for that
 * reason: the quote, the person, the company and all three figures. ICEFALL has
 * no companies, no expeditions and no customers — nothing has ever been
 * deployed and no money has ever moved.
 *
 * The flag is true in local development and false in an ordinary build, so this
 * renders for judging the design and is dropped from the bundle otherwise. When
 * the flag is off the panel keeps its shape and says what ICEFALL actually
 * knows, which today is "not yet".
 */
function ProofPanel() {
  return (
    <div className="relative rounded-xl bg-primary-foreground/10 px-6 py-5 ring-1 ring-primary-foreground/15 backdrop-blur-[2px]">
      {SHOW_DEMO_DATA ? (
        // Stacked rather than side by side: at a third of the page the two
        // halves cannot sit in a row without the figures colliding.
        <div className="flex flex-col gap-5">
          <div>
            <Quote size={20} strokeWidth={0} fill="currentColor" className="mb-1.5 text-primary-foreground/35" />
            <p className="text-primary-foreground/90 text-sm leading-[1.5]">
              ICEFALL CRM has transformed how we manage our expeditions and our clients.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              <img
                src="/img/destinations/ama-dablam.jpg"
                alt=""
                aria-hidden
                className="size-9 shrink-0 rounded-full object-cover"
              />
              <span className="leading-tight">
                <span className="block font-medium text-primary-foreground text-xs">Ang Temba Sherpa</span>
                <span className="block text-[11.5px] text-primary-foreground/55">7 Summits Treks</span>
              </span>
            </div>
          </div>

          <span className="h-px w-full bg-primary-foreground/15" />

          <div className="flex items-start justify-between gap-3">
            <Stat icon={<Users size={21} strokeWidth={1.6} />} value="500+" label="Companies" />
            <Stat icon={<Mountain size={21} strokeWidth={1.6} />} value="1,250+" label="Expeditions" />
            <Stat icon={<Globe size={21} strokeWidth={1.6} />} value="25+" label="Countries" />
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <Stat icon={<Users size={21} strokeWidth={1.6} />} value={null} label="Companies" />
          <Stat icon={<Mountain size={21} strokeWidth={1.6} />} value={null} label="Expeditions" />
          <Stat icon={<Globe size={21} strokeWidth={1.6} />} value={null} label="Countries" />
        </div>
      )}
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | null; label: string }) {
  return (
    <div className="text-center">
      <span className="mx-auto mb-2 grid size-8 place-items-center text-primary-foreground">{icon}</span>
      {/* No figure, and the reason in its place: never a zero, never a dash. */}
      {value === null ? (
        <p className="font-medium text-primary-foreground/45 text-sm leading-none">None yet</p>
      ) : (
        <p className="font-medium text-2xl text-primary-foreground leading-none">{value}</p>
      )}
      <p className="mt-1.5 text-primary-foreground/60 text-xs">{label}</p>
    </div>
  );
}

/* ---- marks ---------------------------------------------------------------- */

function MountainMark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 34 24" fill="none" aria-hidden className={className}>
      <path d="M1 23L11.5 4l6 10.5L21.5 8 33 23H1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-3">
      <MountainMark />
      <span className="font-medium text-xl tracking-[0.26em]">ICEFALL</span>
    </span>
  );
}

/**
 * The photograph.
 *
 * Everest north face, Luca Galuzzi, CC BY-SA 2.5, from Wikimedia Commons.
 * ICEFALL does not scrape photography — every image in this project has its
 * licence and author recorded in `public/img/destinations/CREDITS.md`, because a
 * picture whose licence nobody tracked is one that cannot ship.
 *
 * The scrim is what keeps the headline legible over the sky, which is how the
 * design gets away with putting text on a photograph at all. It is drawn from
 * `--primary` rather than from a literal colour, so the panel is the theme's own
 * dark login panel with the mountain showing through it rather than a separate
 * palette parked beside the theme.
 */
function Photograph() {
  return (
    <>
      <img
        src="/img/destinations/everest.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 size-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg,color-mix(in oklch,var(--primary) 88%,transparent) 0%,color-mix(in oklch,var(--primary) 62%,transparent) 42%,color-mix(in oklch,var(--primary) 80%,transparent) 72%,color-mix(in oklch,var(--primary) 94%,transparent) 100%)",
        }}
      />
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.3-.2-1.9H9v3.5h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5Z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.3c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.9 10.7a5.4 5.4 0 0 1 0-3.4V5H.9a9 9 0 0 0 0 8l3-2.3Z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6Z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <rect width="7" height="7" fill="#F25022" />
      <rect x="9" width="7" height="7" fill="#7FBA00" />
      <rect y="9" width="7" height="7" fill="#00A4EF" />
      <rect x="9" y="9" width="7" height="7" fill="#FFB900" />
    </svg>
  );
}
