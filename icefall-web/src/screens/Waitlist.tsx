import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Gift,
  Instagram,
  Loader2,
  Mail,
  Mountain,
  Users,
  Youtube,
} from "lucide-react";
import { IcefallLockup } from "@/components/IcefallMark";
import {
  LAUNCH_AT,
  joinWaitlist,
  launchLabel,
  remainingUntil,
  type Remaining,
  type WaitlistSource,
} from "@/lib/waitlist";
import { cn } from "@/lib/utils";

/**
 * icefall.app before launch.
 *
 * The whole desktop site is this one page until the product opens. Built 1:1
 * from the supplied mockup: cinematic hero with the signup card beside it, four
 * capability cards each carrying a real screenshot of the real app, the
 * countdown, the footer.
 *
 * Two things in here are deliberately NOT what a landing page usually does, and
 * both are the house rule rather than an oversight:
 *
 *  1. THE PHONES SHOW REAL SCREENS. Every screenshot under /img/screens was
 *     captured from `icefall-app` running at 390x844. Nothing on this page is a
 *     drawing of a product that does not exist.
 *
 *  2. THE FOURTH CARD DOES NOT RANK ANYONE. The mockup's community card lists
 *     four named, identifiable mountaineers against invented summit counts.
 *     ICEFALL has no users yet, so that table could only have been fabricated,
 *     and publishing it would have attributed made-up figures to real people.
 *     The card keeps its place, its copy and its screen — the same LEADERBOARD,
 *     with its real WORLD / COUNTRY / MOUNTAIN tabs and the honest empty state
 *     the app actually shows. Only the invented ranking is gone.
 */

/* -- the four capability cards --------------------------------------------- */

const FEATURES = [
  {
    icon: Mountain,
    title: "Choose your mountain",
    body: "Explore mountains, set your goal, and we'll guide the rest.",
    shot: "/img/screens/explore.jpg",
    alt: "The ICEFALL Explore screen, listing mountains with their elevation and grade.",
  },
  {
    icon: CalendarDays,
    title: "Train with purpose",
    body: "Personalized training plans that get you summit-ready.",
    shot: "/img/screens/training.jpg",
    alt: "An ICEFALL training plan — 26 weeks built backwards from Mont Blanc, with this week's sessions.",
  },
  {
    icon: ClipboardList,
    title: "Track & log everything",
    body: "Log activities, track progress, and build your mountain passport.",
    shot: "/img/screens/passport.jpg",
    alt: "The ICEFALL mountain passport, a record of summits and hours.",
  },
  {
    icon: Users,
    title: "Join the community",
    body: "Connect, share, and get inspired by mountaineers worldwide.",
    shot: "/img/screens/community.jpg",
    alt: "The ICEFALL leaderboard, ranked by verified summits — empty until the community grows.",
  },
] as const;

const HERO_POINTS = [
  "Personalized training plans",
  "Track progress & get AI coaching",
  "Plan & book expeditions",
  "Join a global mountaineering community",
];

/**
 * Social accounts.
 *
 * `href: null` means "this account has not been given to me yet" and renders
 * the icon inert rather than pointing it at `#`. A dead link on a launch page
 * is a broken promise; an unlinked icon is just an icon. Fill these in and they
 * become links with no other change.
 */
const SOCIAL: { icon: typeof Instagram; label: string; href: string | null }[] = [
  { icon: Instagram, label: "ICEFALL on Instagram", href: null },
  { icon: Youtube, label: "ICEFALL on YouTube", href: null },
  { icon: Mail, label: "Email ICEFALL", href: null },
];

/* -- page ------------------------------------------------------------------ */

export default function Waitlist() {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Features />
      <Countdown />
      <Footer />
    </div>
  );
}

/* -- header ---------------------------------------------------------------- */

function Header() {
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex h-[84px] w-full max-w-[1240px] items-center px-6 sm:px-8">
        <a href="#top" aria-label="ICEFALL" className="shrink-0">
          <IcefallLockup />
        </a>
        <button
          type="button"
          onClick={focusSignup}
          className="ml-auto rounded-[10px] border border-azure/45 px-5 py-2.5 text-[11.5px] font-medium uppercase tracking-[0.14em] text-snow transition-colors duration-200 hover:border-azure hover:bg-azure/10"
        >
          Join waitlist
        </button>
      </div>
    </header>
  );
}

/** Send the header button somewhere useful: the field it is asking you to fill. */
function focusSignup() {
  const field = document.getElementById("waitlist-email-hero");
  document.getElementById("join")?.scrollIntoView({ behavior: "smooth", block: "center" });
  // After the smooth scroll starts, not before — focusing first makes the
  // browser jump and the animation never plays.
  window.setTimeout(() => field?.focus({ preventScroll: true }), 320);
}

/* -- hero ------------------------------------------------------------------ */

function Hero() {
  const reduce = useReducedMotion();
  const rise = reduce ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return (
    <section id="top" className="relative isolate overflow-hidden">
      {/*
        The photograph is the first screen, not a band inside it: it runs behind
        the header so the banner and the chrome read as one surface, which is
        the whole point of the mockup's opening.
      */}
      <div className="absolute inset-0 -z-10">
        <img
          src="/img/everest.jpg"
          alt=""
          aria-hidden
          fetchPriority="high"
          className="h-full w-full object-cover object-[58%_26%] opacity-[0.78]"
        />
        <div className="absolute inset-0 scrim-hero" />
        {/*
          `scrim-hero` buys its contrast with a left-to-right wash, which is the
          right shape only while the type is in a left column. Below `lg` the
          copy runs the full width and its line ends sit on the bright side of
          the photograph, so a flat darkening goes over the top there instead.
        */}
        <div className="absolute inset-0 bg-obsidian/55 lg:hidden" />
      </div>

      <div className="mx-auto grid w-full max-w-[1240px] items-start gap-14 px-6 pb-20 pt-[118px] sm:px-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-16 lg:pb-24 lg:pt-[142px]">
        <motion.div {...rise} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <span className="inline-flex items-center rounded-[7px] border border-azure/30 bg-azure/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-azure-bright">
            Coming {launchLabel()}
          </span>

          {/*
            The break is explicit, not left to the box width. The mockup sets
            this headline on exactly two lines — "Your mountain" / "journey
            starts here." — and "starts here." is the accent, so letting it wrap
            wherever the column happened to end split the blue phrase across two
            lines and lost the shape of the sentence. Below `lg` it flows.
          */}
          <h1 className="mt-7 text-[clamp(2.6rem,4.7vw,4.35rem)] font-light leading-[1.05] tracking-[-0.032em] text-snow">
            <span className="lg:block">Your mountain</span>{" "}
            <span className="lg:block">
              journey <span className="text-azure">starts here.</span>
            </span>
          </h1>

          <p className="mt-6 max-w-[34rem] text-[15.5px] leading-[1.65] text-mist">
            ICEFALL is the all-in-one app to plan, train for, and book your mountaineering
            adventures.
          </p>

          <ul className="mt-9 space-y-3.5">
            {HERO_POINTS.map((point) => (
              <li key={point} className="flex items-center gap-3">
                <CheckCircle2 size={17} strokeWidth={1.8} className="shrink-0 text-azure" />
                <span className="text-[14.5px] text-snow/85">{point}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div
          {...rise}
          transition={{ duration: 0.5, delay: reduce ? 0 : 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <SignupCard />
        </motion.div>
      </div>
    </section>
  );
}

function SignupCard() {
  return (
    <div
      id="join"
      className="rounded-[18px] border border-hairline bg-graphite/80 p-7 shadow-[0_40px_90px_-40px_rgb(0_0_0/0.9)] backdrop-blur-xl"
    >
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-[12px] bg-azure/12 text-azure">
        <Gift size={20} strokeWidth={1.7} />
      </div>

      <h2 className="mt-4 text-center text-[19px] font-normal tracking-[-0.01em] text-snow">
        Join the waitlist
      </h2>
      <p className="mx-auto mt-2 max-w-[26ch] text-center text-[13px] leading-[1.6] text-mist">
        Be the first to access ICEFALL and get <span className="text-azure">1 month free</span> when
        we launch.
      </p>

      <SignupForm source="hero" withName idPrefix="hero" className="mt-6" />
    </div>
  );
}

/* -- the form (hero and footer share it) ----------------------------------- */

function SignupForm({
  source,
  withName = false,
  inline = false,
  idPrefix,
  className,
}: {
  source: WaitlistSource;
  withName?: boolean;
  /** Footer variant: field and button on one row. */
  inline?: boolean;
  idPrefix: string;
  className?: string;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; already: boolean } | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await joinWaitlist({ email, name, source, company });
    if (!live.current) return;

    if (result.ok) setDone({ email: email.trim().toLowerCase(), already: result.already });
    else setError(result.error);
    setBusy(false);
  }

  if (done) {
    return (
      <div className={cn("rounded-[12px] border border-azure/25 bg-azure/[0.07] px-5 py-5", className)}>
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} strokeWidth={1.8} className="mt-px shrink-0 text-azure" />
          <div>
            <p className="text-[14px] text-snow">
              {done.already ? "You're already on the list." : "You're on the list."}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">
              We'll email <span className="text-snow/85">{done.email}</span> when ICEFALL opens on{" "}
              {launchLabel()}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className={className}>
      {/* Honeypot: hidden from people, irresistible to the simpler bots. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        className="absolute h-0 w-0 overflow-hidden border-0 p-0 opacity-0"
      />

      <div className={cn(inline ? "flex flex-col gap-2.5 sm:flex-row" : "space-y-2.5")}>
        {withName && (
          <Field
            id={`waitlist-name-${idPrefix}`}
            label="Full name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={setName}
            disabled={busy}
          />
        )}
        <Field
          id={`waitlist-email-${idPrefix}`}
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          disabled={busy}
          className={inline ? "sm:flex-1" : undefined}
          invalid={Boolean(error)}
        />

        <button
          type="submit"
          disabled={busy}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded-[10px]",
            "bg-gradient-to-b from-azure-cta to-azure-deep text-[11.5px] font-medium uppercase tracking-[0.14em] text-white",
            "transition-[filter,opacity] duration-200 hover:brightness-110",
            "disabled:cursor-not-allowed disabled:opacity-60",
            inline ? "sm:w-auto sm:px-7" : "mt-3",
          )}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {busy ? "Joining" : "Join waitlist"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2.5 text-[12px] text-danger">
          {error}
        </p>
      )}

      <p className="mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-mist-dim">
        <CheckCircle2 size={12} strokeWidth={1.9} />
        No spam. Unsubscribe anytime.
      </p>
    </form>
  );
}

/**
 * The mockup's fields carry their label as placeholder text only. That is fine
 * to look at and useless to a screen reader, so the label is real and visually
 * hidden — the placeholder is decoration on top of it.
 */
function Field({
  id,
  label,
  type,
  autoComplete,
  value,
  onChange,
  disabled,
  invalid,
  className,
}: {
  id: string;
  label: string;
  type: string;
  autoComplete: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        autoComplete={autoComplete}
        placeholder={label}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-11 w-full rounded-[10px] border bg-slate/70 px-3.5 text-[13.5px] text-snow",
          "placeholder:text-mist-dim disabled:opacity-60",
          "transition-colors duration-200 focus:bg-slate",
          invalid ? "border-danger/60" : "border-hairline hover:border-hairline-strong",
        )}
      />
    </div>
  );
}

/* -- features -------------------------------------------------------------- */

function Features() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto w-full max-w-[1240px] px-6 pt-16 sm:px-8 lg:pt-20">
      <p className="section-label text-center">Everything you need</p>
      <h2 className="mt-4 text-center text-[clamp(1.8rem,3vw,2.4rem)] font-light tracking-[-0.028em] text-snow">
        One app. Every step of the way.
      </h2>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f, i) => (
          <motion.article
            key={f.title}
            initial={reduce ? undefined : { opacity: 0, y: 16 }}
            whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.07, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col overflow-hidden rounded-[16px] border border-hairline bg-graphite/55 px-6 pt-6"
          >
            <div className="grid h-10 w-10 place-items-center rounded-[10px] bg-azure/12 text-azure">
              <f.icon size={18} strokeWidth={1.7} />
            </div>
            <h3 className="mt-4 text-[15px] font-normal text-snow">{f.title}</h3>
            <p className="mt-2 text-[12.5px] leading-[1.65] text-mist">{f.body}</p>

            <PhoneFrame src={f.shot} alt={f.alt} />
          </motion.article>
        ))}
      </div>
    </section>
  );
}

/**
 * A phone, cropped by the bottom of its card.
 *
 * The aspect box is 165:275 — the proportion the mockup shows — while the
 * device inside it keeps a true 390x844 screen. So the frame always crops the
 * screenshot at the same point no matter how wide the card gets, and the
 * screenshot itself is never distorted to fit.
 */
function PhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    // -mx-[18px] breaks out of the card's px-6 so the device sits ~6px from the
    // card's edge, as in the mockup, instead of 30px in with black rails either
    // side. The card's own overflow-hidden does the cropping.
    <div className="relative -mx-[18px] mt-7 aspect-[165/272] w-[calc(100%+36px)]">
      <div className="absolute inset-x-1.5 top-0 aspect-[390/844] overflow-hidden rounded-t-[22px] border border-hairline-strong bg-obsidian">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover object-top"
        />
      </div>
    </div>
  );
}

/* -- countdown ------------------------------------------------------------- */

function Countdown() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const left = useMemo(() => remainingUntil(LAUNCH_AT, now), [now]);

  return (
    <section className="mx-auto mt-16 w-full max-w-[1240px] px-6 sm:px-8 lg:mt-20">
      <div className="flex flex-col gap-8 rounded-[16px] border border-hairline bg-graphite/55 px-7 py-7 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-azure/12 text-azure">
            <CalendarDays size={20} strokeWidth={1.7} />
          </div>
          <div>
            <p className="text-[16px] font-normal text-snow">Launching {launchLabel()}</p>
            <p className="mt-1 text-[12.5px] text-mist">
              {left.done ? "ICEFALL is open." : "Be ready. Your adventure starts soon."}
            </p>
          </div>
        </div>

        {!left.done && <Clock left={left} />}
      </div>
    </section>
  );
}

function Clock({ left }: { left: Remaining }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const units: [string, string][] = [
    [String(left.days), "Days"],
    [pad(left.hours), "Hours"],
    [pad(left.minutes), "Minutes"],
    [pad(left.seconds), "Seconds"],
  ];

  return (
    <div role="timer">
      {/*
        The numerals tick every second. Announcing that would make the page
        unusable with a screen reader, so they are hidden from it and this one
        sentence is read instead.
      */}
      <span className="sr-only">
        {left.days} days and {left.hours} hours until ICEFALL launches.
      </span>
      <div aria-hidden className="flex items-start gap-7 sm:gap-10">
        {units.map(([value, label]) => (
          <div key={label} className="text-center">
            <div className="tnum text-[30px] font-light leading-none tracking-[-0.02em] text-azure">
              {value}
            </div>
            <div className="section-label mt-2.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -- footer ---------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="mt-20 border-t border-hairline lg:mt-24">
      <div className="mx-auto grid w-full max-w-[1240px] gap-12 px-6 py-14 sm:px-8 lg:grid-cols-[1fr_minmax(0,480px)] lg:gap-20">
        <div>
          <IcefallLockup />
          <p className="mt-5 max-w-[16rem] text-[12.5px] leading-[1.7] text-mist-dim">
            Plan better. Train smarter.
            <br />
            Climb higher.
          </p>
          <div className="mt-7 flex items-center gap-5">
            {SOCIAL.map((s) => (
              <SocialIcon key={s.label} {...s} />
            ))}
          </div>
        </div>

        <div>
          <p className="max-w-[30ch] text-[15.5px] leading-[1.55] text-snow">
            Join the waitlist and get 1 month free when we launch.
          </p>
          <SignupForm source="footer" inline idPrefix="footer" className="mt-5" />
        </div>
      </div>
    </footer>
  );
}

function SocialIcon({
  icon: Icon,
  label,
  href,
}: {
  icon: typeof Instagram;
  label: string;
  href: string | null;
}) {
  const glyph: ReactNode = <Icon size={17} strokeWidth={1.6} />;

  if (!href) {
    return (
      <span aria-label={label} title={label} className="text-mist-dim/60">
        {glyph}
      </span>
    );
  }
  return (
    <a
      href={href}
      aria-label={label}
      target="_blank"
      rel="noreferrer noopener"
      className="text-mist-dim transition-colors duration-200 hover:text-snow"
    >
      {glyph}
    </a>
  );
}
