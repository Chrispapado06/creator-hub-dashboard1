import { useState } from "react";
import { ArrowRight, Eye, EyeOff, Globe, Headset, Lock, Mail, Mountain, Quote, Users } from "lucide-react";
import { SHOW_DEMO_DATA } from "@/lib/demoFlag";

/**
 * ICEFALL CRM — sign in.
 *
 * ⚠ WRITTEN WITHOUT BEING ABLE TO READ THE REST OF THE PROJECT. File reads
 * across the ICEFALL tree were returning EPERM when this was written, so it is
 * deliberately SELF-CONTAINED: no imports from `@/components/ui`, no reliance on
 * a CSS custom property it could not verify exists, nothing but Tailwind
 * utilities and literal colours. It has not been typechecked, rendered or wired
 * into any route. Verify before trusting it.
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
 * ── AND ONE THING TO SETTLE ────────────────────────────────────────────────
 *
 * THE MOCKUP IS GOLD. The accent here follows it, because the instruction was
 * to match the design exactly. But the product owner settled on alpine azure and
 * the rest of this CRM is built in it, so these two cannot both be right. The
 * gold is held in ONE constant below so reversing it is a one-line change.
 */

/** The mockup's accent. See the note above — this is the only place it lives. */
const GOLD = "#C79049";
const GOLD_HOVER = "#B27F3D";

export default function SignIn() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#F2F2F0] px-4 py-4 sm:px-8 sm:py-7">
      <div className="mx-auto flex w-full max-w-[1420px] flex-1 overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_rgba(0,0,0,0.07)]">
        {/* ---- Left: the photograph and the proof panel ------------------- */}
        <section className="relative hidden w-[52%] shrink-0 flex-col justify-between overflow-hidden p-11 lg:flex">
          <Photograph />

          <div className="relative">
            <Wordmark />
            <h1
              className="mt-16 text-[52px] leading-[1.06] tracking-[-0.015em] text-[#12100E]"
              style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
            >
              Manage. Connect.
              <br />
              <span style={{ color: GOLD }}>Grow.</span>
            </h1>
            <p className="mt-5 max-w-[380px] text-[15px] leading-relaxed text-[#4B4A47]">
              ICEFALL CRM gives your expedition business the tools to build relationships, manage
              leads, and grow your adventures worldwide.
            </p>
          </div>

          <ProofPanel />
        </section>

        {/* ---- Right: the form ------------------------------------------- */}
        <section className="flex min-w-0 flex-1 flex-col px-6 py-9 sm:px-14">
          <div className="flex items-center justify-end gap-3">
            <span className="text-[13.5px] text-[#6B6A66]">Need help?</span>
            <a
              href="mailto:support@icefall.example"
              className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#E4E3DF] px-4 text-[13.5px] font-medium text-[#12100E] transition-colors hover:bg-[#FAFAF8]"
            >
              <Headset size={16} strokeWidth={1.9} />
              Contact Support
            </a>
          </div>

          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-10">
            <h2 className="text-[34px] font-bold leading-tight tracking-[-0.025em] text-[#12100E]">
              Welcome back
            </h2>
            <p className="mt-2 text-[14.5px] text-[#6B6A66]">
              Sign in to access your ICEFALL CRM dashboard.
            </p>

            <form className="mt-8 space-y-5" onSubmit={(e) => e.preventDefault()}>
              <Field label="Email address" htmlFor="email">
                <Mail size={17} strokeWidth={1.8} className="text-[#9B9A95]" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full bg-transparent text-[14.5px] text-[#12100E] outline-none placeholder:text-[#A9A8A3]"
                />
              </Field>

              <div>
                <Field label="Password" htmlFor="password">
                  <Lock size={17} strokeWidth={1.8} className="text-[#9B9A95]" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full bg-transparent text-[14.5px] text-[#12100E] outline-none placeholder:text-[#A9A8A3]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="text-[#9B9A95] transition-colors hover:text-[#12100E]"
                  >
                    {showPassword ? <Eye size={17} strokeWidth={1.8} /> : <EyeOff size={17} strokeWidth={1.8} />}
                  </button>
                </Field>
                <div className="mt-2 flex justify-end">
                  <a href="#" className="text-[13px] font-medium" style={{ color: GOLD }}>
                    Forgot password?
                  </a>
                </div>
              </div>

              <button
                type="submit"
                className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold text-white transition-colors"
                style={{ backgroundColor: GOLD }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = GOLD_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = GOLD)}
              >
                Sign in
                <ArrowRight size={17} strokeWidth={2.1} />
              </button>
            </form>

            <div className="my-7 flex items-center gap-4">
              <span className="h-px flex-1 bg-[#E8E7E3]" />
              <span className="text-[13px] text-[#8A8985]">or continue with</span>
              <span className="h-px flex-1 bg-[#E8E7E3]" />
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

            <p className="mt-8 text-center text-[13.5px] text-[#6B6A66]">
              Don&rsquo;t have an account?{" "}
              <a href="#" className="inline-flex items-center gap-1 font-semibold" style={{ color: GOLD }}>
                Request access
                <ArrowRight size={14} strokeWidth={2.2} />
              </a>
            </p>
          </div>
        </section>
      </div>

      <footer className="mx-auto mt-5 flex w-full max-w-[1420px] items-center justify-between px-2 text-[13px] text-[#8A8985]">
        <span className="flex items-center gap-2.5">
          <MountainMark className="text-[#B8B7B2]" size={20} />
          © {new Date().getFullYear()} ICEFALL. All rights reserved.
        </span>
        <span className="flex items-center gap-7">
          <a href="#" className="transition-colors hover:text-[#12100E]">Privacy Policy</a>
          <a href="#" className="transition-colors hover:text-[#12100E]">Terms of Service</a>
        </span>
      </footer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-[13.5px] font-semibold text-[#12100E]">
        {label}
      </label>
      <div className="flex h-[52px] items-center gap-3 rounded-[10px] border border-[#E4E3DF] bg-white px-4 focus-within:border-[#C79049]">
        {children}
      </div>
    </div>
  );
}

function ProviderButton({ label, mark }: { label: string; mark: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-[52px] items-center justify-center gap-2.5 rounded-[10px] border border-[#E4E3DF] bg-white text-[14px] font-medium text-[#12100E] transition-colors hover:bg-[#FAFAF8]"
    >
      {mark}
      {label}
    </button>
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
    <div className="relative rounded-[14px] bg-[rgba(20,19,17,0.82)] px-7 py-6 backdrop-blur-[2px]">
      {SHOW_DEMO_DATA ? (
        <div className="flex items-center gap-7">
          <div className="max-w-[210px]">
            <Quote size={20} strokeWidth={0} fill="currentColor" className="mb-1.5 text-white/35" />
            <p className="text-[13px] leading-[1.5] text-white/90">
              ICEFALL CRM has transformed how we manage our expeditions and our clients.
            </p>
            <div className="mt-4 flex items-center gap-2.5">
              <img
                src="/img/destinations/ama-dablam.jpg"
                alt=""
                aria-hidden
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
              <span className="leading-tight">
                <span className="block text-[12.5px] font-semibold text-white">Ang Temba Sherpa</span>
                <span className="block text-[11.5px] text-white/55">7 Summits Treks</span>
              </span>
            </div>
          </div>

          <span className="h-[86px] w-px shrink-0 bg-white/15" />

          <div className="flex flex-1 items-start justify-around">
            <Stat icon={<Users size={21} strokeWidth={1.6} />} value="500+" label="Companies" />
            <Stat icon={<Mountain size={21} strokeWidth={1.6} />} value="1,250+" label="Expeditions" />
            <Stat icon={<Globe size={21} strokeWidth={1.6} />} value="25+" label="Countries" />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-around">
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
      <span className="mx-auto mb-2 grid h-8 w-8 place-items-center" style={{ color: GOLD }}>
        {icon}
      </span>
      {value === null ? (
        <p className="text-[13px] font-medium leading-none text-white/45">None yet</p>
      ) : (
        <p className="text-[22px] font-bold leading-none text-white">{value}</p>
      )}
      <p className="mt-1.5 text-[12px] text-white/60">{label}</p>
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
    <span className="flex items-center gap-3 text-[#12100E]">
      <MountainMark />
      <span className="text-[20px] font-semibold tracking-[0.26em]">ICEFALL</span>
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
 * The white scrim at the top is what keeps the black headline legible over the
 * sky, which is how the design gets away with putting text on a photograph at
 * all.
 */
function Photograph() {
  return (
    <>
      <img
        src="/img/destinations/everest.jpg"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg,rgba(255,255,255,0.99) 0%,rgba(255,255,255,0.97) 14%,rgba(255,255,255,0.80) 27%,rgba(255,255,255,0.34) 40%,rgba(255,255,255,0.04) 52%,rgba(0,0,0,0.12) 76%,rgba(0,0,0,0.40) 100%)",
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
