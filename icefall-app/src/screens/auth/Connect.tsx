import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Heart,
  Loader2,
  Lock,
  MoveRight,
  Play,
  Send,
  Settings2,
  ShieldCheck,
  Watch,
  X,
  type LucideIcon,
} from "lucide-react";

import { IcefallMark } from "@/components/ui/IcefallMark";
import { PLATFORM_MARKS, PlatformMark } from "@/components/ui/BrandMarks";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  FINALIZE_COPY,
  beginStravaConnect,
  finalizeStravaConnect,
  useStravaStatus,
} from "@/strava/connection";
import { ouraService, signupReturnUrl } from "@/tracking/sources/oura";
import { useOura } from "@/tracking/sources/useOura";
import {
  readHealthConsent,
  recordHealthConsent,
  wordingInForce,
  type ConsentWording,
  type HealthConsent,
} from "@/health/consent";
import {
  beginWatchConnect,
  finalizeWatchConnect,
  useWatchStatus,
  type WatchFinalizeOutcome,
} from "@/watch/connection";
import { WATCH_PROVIDER_NAME, type WatchProvider } from "@/watch/types";

function isWatchProvider(v: string | null): v is WatchProvider {
  return v === "coros" || v === "polar" || v === "suunto" || v === "garmin";
}

/**
 * CONNECT YOUR ACCOUNTS — the last page of sign-up.
 *
 * The owner, 2026-09-07: "when completing sign up, also add a final page where
 * they can connect all of the applications like strava, all trails, kamoot,
 * oura ring… heres the 1:1 mock up make it 1:1 for it."
 *
 * Three screens from the drawing, one route. The list, the "Connecting…"
 * interstitial with the ring, and the "connected!" page with the photograph.
 * Layout, type, tiles, ring, hero and the three-row structures are the
 * mockup's. The sentences are the mockup's wherever the mockup's sentence is
 * true, and are changed — not removed — where it is not. What changed and why:
 *
 * ── "STEP 3 OF 3" → "FINAL STEP" ─────────────────────────────────────────────
 * Sign-up here is not three steps; it is an account, a handle and a
 * questionnaire whose length depends on the answers. A counter that says three
 * would be a number nobody measured. The eyebrow keeps its place and its style.
 *
 * ── "SYNC" → "SEND" ──────────────────────────────────────────────────────────
 * ICEFALL's Strava connection is ONE-WAY: it sends an activity the athlete
 * recorded here to their Strava profile, when they choose. It reads nothing
 * back — no history, no followers, no segments. Every sentence in the drawing
 * that says "sync", "real-time" or "your data is now synced with ICEFALL"
 * describes an import that does not exist, and on this page the reader is a
 * person deciding whether to hand over an account. So they say what happens.
 *
 * ── "CONNECTING…" ONLY WHILE SOMETHING IS ─────────────────────────────────────
 * The drawing titles the interstitial "Connecting Strava…" with a spinning
 * arc. Nothing is connecting until the button is pressed, so at rest the title
 * is "Connect Strava" and the arc is still; the moment the request is in
 * flight it becomes "Connecting Strava…" and the arc turns. "This will only
 * take a moment" is gone: nobody measured it, and the page's own expiry note
 * contradicts it.
 *
 * ── WHAT IS READ NAMES EVERYTHING THE PERMISSION NAMES ───────────────────────
 * Oura's row used to say "sleep, HRV and readiness". The consent sentence in
 * force — and the server's own store — cover sleep, heart rate, HRV, breathing
 * rate, blood oxygen, temperature deviation and daily activity. On the screen
 * where somebody decides whether to hand over a ring, the shorter list was an
 * under-declaration, so the rows and blurbs carry the full one.
 *
 * ── "CONNECTED" IS MEASURED, NEVER READ OFF THE ADDRESS BAR ──────────────────
 * Strava's callback cannot know who is holding the browser, so it never
 * finishes a link; it parks the consent under a one-time ticket and sends the
 * person back here. This page presents the ticket WITH the session, and draws
 * "connected" from the server's answer. Oura's connected screen likewise waits
 * for the ring service to report a live connection. Typing `?strava=connected`
 * into the address shows nothing.
 *
 * ── THE "WHAT'S NEXT" ROWS ───────────────────────────────────────────────────
 * The drawing's three — better insights, personalised plans, climb smarter —
 * are all claims that the connection feeds the Coach. Neither connection does
 * today (Strava reads nothing back; the ring's readings are not consumed by a
 * coach screen yet). Three rows stay; each names something the athlete can
 * actually do next.
 *
 * ── APPLE HEALTH, ALLTRAILS, KOMOOT ──────────────────────────────────────────
 * Drawn exactly as the mockup draws them — tile, name, description — and not
 * connectable, because none of those integrations exist. Their rows say
 * "Not yet" where the chevron would be, do not respond to a tap, and one
 * sentence under the list says why. Strava and Oura get the same treatment in
 * a build or session where they cannot work: nothing here is offered as a
 * button that would do nothing.
 *
 * ── OURA HAS ONE EXTRA STEP, BY LAW ──────────────────────────────────────────
 * Connecting a ring stores health measurements, and that needs the person's
 * recorded permission first. The sentence is FETCHED (`wordingInForce`), never
 * written here, so agreement is always recorded against the words that were
 * shown. If it cannot be fetched there is no button. Somebody who has already
 * said no, or who withdrew, is not asked again here — that decision belongs to
 * "Ring and health data" in Settings, where they open the question themselves.
 *
 * ── EVERY SETTINGS PATH NAMED HERE EXISTS ────────────────────────────────────
 * Strava lives at Settings → Connected accounts; the ring at Settings → Ring
 * and health data (a row added for exactly this reason — the page existed but
 * Settings never linked to it).
 */

/* -------------------------------------------------------------------------- */
/* Providers                                                                   */
/* -------------------------------------------------------------------------- */

type ProviderId =
  | "strava"
  | "oura"
  | "apple-health"
  | "alltrails"
  | "komoot"
  | "coros"
  | "polar"
  | "suunto"
  | "garmin";

interface Provider {
  id: ProviderId;
  name: string;
  /** The name as it reads mid-sentence ("taken to Oura", not "to Oura Ring"). */
  short: string;
  /** Two lines under the name, as drawn. */
  blurb: string;
  /** Whether ICEFALL has an integration for it at all. */
  built: boolean;
}

/** The order the drawing lists them in, plus Oura where the owner added it. */
const PROVIDERS: readonly Provider[] = [
  {
    id: "strava",
    name: "Strava",
    short: "Strava",
    blurb: "Send activities you record here to your Strava profile.",
    built: true,
  },
  {
    id: "oura",
    name: "Oura Ring",
    short: "Oura",
    blurb:
      "Sleep, heart rate, HRV, breathing, blood oxygen, temperature and daily activity, read from your ring.",
    built: true,
  },
  {
    id: "apple-health",
    name: "Apple Health",
    short: "Apple Health",
    blurb: "Health, sleep and recovery from your iPhone.",
    built: false,
  },
  {
    id: "alltrails",
    name: "AllTrails",
    short: "AllTrails",
    blurb: "Your hikes and outdoor adventures.",
    built: false,
  },
  {
    id: "komoot",
    name: "Komoot",
    short: "Komoot",
    blurb: "Your hiking and cycling routes and activities.",
    built: false,
  },
  /* Added 2026-09-07. COROS is the one watch service with a working, self-serve
     connection today — Polar, Suunto and Garmin are NOT rows on this page: nine
     rows with six dead ones buries Strava and Oura on the screen where somebody
     first meets them. This row's PRESENCE, not just whether it can be tapped, is
     derived from `useWatchStatus()` in `ListScreen` below — Polar becomes a row
     here on its own the day its registration is done; nobody edits this file. */
  {
    id: "coros",
    name: "COROS",
    short: "COROS",
    blurb: "Bring activities you recorded on a COROS watch into ICEFALL.",
    built: true,
  },
];

const byId = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

/**
 * The provider's tile, as the drawing paints it: a rounded square in the
 * brand's colour with the mark in white. Strava, Komoot and AllTrails use the
 * real geometry held in `BrandMarks` (verbatim, provenance recorded there);
 * Apple Health and Oura publish no mark simple-icons carries, so they get a
 * plain pictogram — a heart, a ring — on the drawing's tile colour, which is a
 * shape and not a claim to be the logo.
 *
 * Komoot's tile is BLACK, not its published green (#6AA127), because that is
 * how the owner's drawing paints it. The mark on black is 21:1; the same mark
 * on the brand green would be ~3.1:1. The colour recorded in BrandMarks is
 * untouched — this is a tile, not a claim about the brand's colour.
 */
function ProviderTile({ id, size = 44 }: { id: ProviderId; size?: number }) {
  const inner = Math.round(size * 0.5);
  const base = "grid shrink-0 place-items-center rounded-[10px]";
  switch (id) {
    case "strava":
      return (
        <span
          className={cn(base, "text-white")}
          style={{ width: size, height: size, background: PLATFORM_MARKS.strava.hex }}
        >
          <PlatformMark platform="strava" tone="current" size={inner} />
        </span>
      );
    case "komoot":
      return (
        <span
          className={cn(base, "text-white")}
          style={{ width: size, height: size, background: "#000000" }}
        >
          <PlatformMark platform="komoot" tone="current" size={inner} />
        </span>
      );
    case "alltrails":
      return (
        <span
          className={cn(base, "text-white")}
          style={{ width: size, height: size, background: PLATFORM_MARKS.alltrails.hex }}
        >
          <PlatformMark platform="alltrails" tone="current" size={inner} />
        </span>
      );
    case "apple-health":
      return (
        <span className={base} style={{ width: size, height: size, background: "#FFFFFF" }}>
          <Heart size={inner} strokeWidth={0} fill="#FF2D55" />
        </span>
      );
    case "oura":
      return (
        <span
          className={cn(base, "text-white")}
          style={{ width: size, height: size, background: "#000000" }}
        >
          <Circle size={inner} strokeWidth={2.75} />
        </span>
      );
    case "coros":
    case "polar":
    case "suunto":
    case "garmin":
      /* No brand mark for any of the four — see `BrandMarks.tsx`. COROS's own
         terms forbid its wordmark without written consent; Polar's and
         Suunto's brand kits sit behind an agreement not yet signed; Garmin's
         own guidelines forbid its tag logo wherever no Garmin data is present,
         which today is everywhere in ICEFALL. One neutral treatment, so no
         watch tile looks more official than another. */
      return (
        <span
          className={base}
          style={{ width: size, height: size, background: "var(--ice-elevated)" }}
        >
          <Watch size={inner} strokeWidth={1.8} className="text-mist" />
        </span>
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Chrome shared by the three screens                                          */
/* -------------------------------------------------------------------------- */

/** The mark and the wordmark on one line, as the drawing's header has them. */
function Lockup() {
  return (
    <span className="flex items-center gap-3 text-snow">
      <IcefallMark metal className="h-5" />
      <span className="text-[13px] font-light tracking-[0.34em]">ICEFALL</span>
    </span>
  );
}

function Header({ right }: { right: React.ReactNode }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 18px)" }}
    >
      <Lockup />
      {right}
    </div>
  );
}

/**
 * The three screens are one route swapped in place, so the element that had
 * focus unmounts and focus would fall to `<body>` — a keyboard or screen-reader
 * user would be returned to the top of the document with no word that a new
 * screen appeared. Each screen's heading takes focus on mount instead.
 */
function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}

const EASE = [0.22, 1, 0.36, 1] as const;

/** Where every exit from this page leads: on to the trial offer. */
const NEXT = "/trial";

const SETTINGS_STRAVA = "Settings → Connected accounts";
const SETTINGS_RING = "Settings → Ring and health data";

/* -------------------------------------------------------------------------- */
/* The route                                                                   */
/* -------------------------------------------------------------------------- */

type Stage =
  | { kind: "list" }
  | { kind: "connecting"; id: ProviderId }
  /** Strava sent us back with a ticket; the server has yet to confirm. */
  | { kind: "finishing"; ticket: string }
  /** A watch provider sent us back with a ticket; same idea, generalised. */
  | { kind: "watch-finishing"; ticket: string; provider: WatchProvider }
  | { kind: "connected"; id: "strava"; athleteUsername: string | null }
  | { kind: "connected"; id: "oura" }
  | { kind: "connected"; id: WatchProvider; accountLabel: string | null };

/**
 * What a provider's own redirect said when it sent the athlete back.
 *
 * Strava returns with `?strava=pending&ticket=…` on a consent (finished by
 * `finalize`, with the session), or `declined|expired|failed`. Oura's server
 * returns with `?oura=connected` or `?oura=error&reason=<code>`. The codes are
 * translated to fixed sentences here — a server code, or anything else typed
 * into the address, is never echoed in ICEFALL's voice.
 */
function outcomeFromParams(params: URLSearchParams): { stage: Stage; note: string | null } {
  const strava = params.get("strava");
  const ticket = params.get("ticket");
  if (strava === "pending" && ticket) return { stage: { kind: "finishing", ticket }, note: null };
  if (strava === "declined") {
    return {
      stage: { kind: "list" },
      note: "You cancelled on Strava's screen, so nothing was linked.",
    };
  }
  if (strava === "expired") {
    return {
      stage: { kind: "list" },
      note: "That connection request is no longer valid — each one lasts ten minutes and can be used once. Start it again.",
    };
  }
  if (strava === "failed") {
    return {
      stage: { kind: "list" },
      note: "Strava did not complete the connection. Nothing was linked — try again in a moment.",
    };
  }

  const oura = params.get("oura");
  if (oura === "connected") return { stage: { kind: "connected", id: "oura" }, note: null };
  if (oura === "error") {
    const reason = params.get("reason") ?? "";
    const note =
      reason === "access_denied"
        ? "You cancelled on Oura's page, so nothing was connected."
        : reason.startsWith("consent")
          ? "A ring can only be connected once your permission to store health measurements is recorded. Nothing was stored."
          : reason === "store_failed"
            ? "The connection could not be saved. Nothing was stored — try again in a moment."
            : "Oura did not complete the connection. Nothing was stored — try again in a moment.";
    return { stage: { kind: "list" }, note };
  }

  /* A watch provider's own redirect. Same shape as Strava's above, generalised
     to four vendors — the outcome word is never trusted as a fact about
     whether anything is connected; `pending` only ever moves to `finishing`,
     which asks the server. */
  const watch = params.get("watch");
  const providerParam = params.get("provider");
  const provider = isWatchProvider(providerParam) ? providerParam : null;
  if (watch === "pending" && ticket && provider) {
    return { stage: { kind: "watch-finishing", ticket, provider }, note: null };
  }
  if (watch && provider) {
    const name = WATCH_PROVIDER_NAME[provider];
    if (watch === "declined") {
      return {
        stage: { kind: "list" },
        note: `You cancelled on ${name}'s screen, so nothing was linked.`,
      };
    }
    if (watch === "expired") {
      return {
        stage: { kind: "list" },
        note: "That connection request is no longer valid — each one lasts ten minutes and can be used once. Start it again.",
      };
    }
    if (watch === "failed") {
      return {
        stage: { kind: "list" },
        note: `${name} did not complete the connection. Nothing was linked — try again in a moment.`,
      };
    }
  }

  return { stage: { kind: "list" }, note: null };
}

export default function ConnectAccounts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  /* Read once at mount and held — the parameters are removed from the address
     straight after, and a banner that read them live would delete its own
     reason for existing on the next render. */
  const [initial] = useState(() => outcomeFromParams(params));
  const [stage, setStage] = useState<Stage>(initial.stage);
  const [note, setNote] = useState<string | null>(initial.note);

  useEffect(() => {
    if (
      !params.get("strava") &&
      !params.get("oura") &&
      !params.get("watch") &&
      !params.get("provider") &&
      !params.get("ticket")
    ) {
      return;
    }
    const next = new URLSearchParams(params);
    next.delete("strava");
    next.delete("oura");
    next.delete("watch");
    next.delete("provider");
    next.delete("reason");
    next.delete("ticket");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => navigate(NEXT, { replace: true });
  const backToList = (why: string | null) => {
    setNote(why);
    setStage({ kind: "list" });
  };

  if (stage.kind === "finishing") {
    return (
      <Finishing
        ticket={stage.ticket}
        onDone={(athleteUsername) => setStage({ kind: "connected", id: "strava", athleteUsername })}
        onFailed={backToList}
        onClose={leave}
      />
    );
  }

  if (stage.kind === "watch-finishing") {
    const provider = stage.provider;
    return (
      <WatchFinishing
        ticket={stage.ticket}
        provider={provider}
        onDone={(accountLabel) => setStage({ kind: "connected", id: provider, accountLabel })}
        onFailed={backToList}
        onClose={leave}
      />
    );
  }

  if (stage.kind === "connecting") {
    return <Connecting id={stage.id} onBack={() => backToList(null)} onClose={leave} />;
  }

  if (stage.kind === "connected") {
    if (stage.id === "strava") {
      return <Connected id="strava" athleteUsername={stage.athleteUsername} onDone={leave} />;
    }
    if (stage.id === "oura") {
      return <OuraConnected onDone={leave} onFailed={backToList} onClose={leave} />;
    }
    return <Connected id={stage.id} accountLabel={stage.accountLabel} onDone={leave} />;
  }

  return (
    <ListScreen
      note={note}
      onPick={(id) => {
        setNote(null);
        setStage({ kind: "connecting", id });
      }}
      onSkip={leave}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* 1 — the list                                                                */
/* -------------------------------------------------------------------------- */

function ListScreen({
  note,
  onPick,
  onSkip,
}: {
  note: string | null;
  onPick: (id: ProviderId) => void;
  onSkip: () => void;
}) {
  const navigate = useNavigate();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const strava = useStravaStatus();
  const ouraCan = ouraService.canConnect();
  const watch = useWatchStatus();

  /*
   * Which rows can actually be tapped, and why the others cannot. Known before
   * a single tap: a build with no server, or nobody signed in, cannot link a
   * Strava account; a build with no Oura API address cannot link a ring.
   * "Checking" (Strava's status still loading) stays tappable — the
   * interstitial says "Checking your account…" and resolves there.
   */
  const stravaWhy =
    strava.state === "no-backend"
      ? "This build of ICEFALL runs without a server, so Strava can't be linked from it."
      : strava.state === "signed-out"
        ? "Sign in to link Strava — the connection is stored against your account."
        : null;
  const ouraWhy = ouraCan.ok ? null : ouraCan.error;

  /**
   * `watchWhy` is `stravaWhy`'s sibling: a session-specific reason a row that
   * DOES exist cannot be tapped right now. It is not the same thing as the
   * row not existing at all — that is decided below, by availability, before
   * this is even asked.
   */
  function watchWhy(provider: WatchProvider): string | null {
    const c = watch.byProvider[provider];
    const name = WATCH_PROVIDER_NAME[provider];
    return c.state === "no-backend"
      ? `This build of ICEFALL runs without a server, so ${name} can't be linked from it.`
      : c.state === "signed-out"
        ? `Sign in to link ${name} — the connection is stored against your account.`
        : null;
  }
  const corosWhy = watchWhy("coros");

  /* COROS's ROW ITSELF is derived from availability, not hardcoded — a
     `"not-built" | "vendor-approval-required" | "needs-registration"` state
     means ICEFALL is not yet integrated with the vendor at all, which is a
     different fact from "integrated, but can't be reached right now"
     (`corosWhy`, above). The row disappears entirely for the first kind and
     stays but reads "Unavailable" for the second — the same distinction
     `Connections.tsx`'s per-vendor cards draw. */
  const corosState = watch.byProvider.coros.state;
  const corosIntegrated =
    corosState !== "not-built" &&
    corosState !== "vendor-approval-required" &&
    corosState !== "needs-registration";
  const activeProviders = PROVIDERS.filter((p) => p.id !== "coros" || corosIntegrated);

  const unavailable: Partial<Record<ProviderId, string>> = {
    ...(stravaWhy ? { strava: "Unavailable" } : {}),
    ...(ouraWhy ? { oura: "Unavailable" } : {}),
    ...(corosWhy ? { coros: "Unavailable" } : {}),
    "apple-health": "Not yet",
    alltrails: "Not yet",
    komoot: "Not yet",
  };

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      <div className="relative px-6">
        <Header
          right={
            /* Padded out to a real tap target and pulled back in with a
               negative margin, so the text sits where the drawing puts it. */
            <button
              type="button"
              onClick={onSkip}
              className="-m-3 p-3 text-[13px] text-azure transition-colors hover:text-azure-bright"
            >
              Skip
            </button>
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: EASE }}
        >
          <p className="section-label mt-8 text-azure/85">Final step</p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="display mt-3 text-[34px] leading-[1.08] text-snow outline-none"
          >
            <span className="block">Connect your</span>
            <span className="block">accounts</span>
          </h1>
          <p className="mt-3 max-w-[30ch] text-[13px] leading-relaxed text-mist">
            Link the fitness and outdoor accounts you already use to get the most from ICEFALL.
            Strava and an Oura ring can also be connected later, in Settings.
          </p>

          {note && (
            <p role="status" className="mt-4 text-[12.5px] leading-relaxed text-azure">
              {note}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {activeProviders.map((p) => (
              <ProviderRow
                key={p.id}
                provider={p}
                label={unavailable[p.id] ?? null}
                onPick={onPick}
              />
            ))}
          </div>

          {/* Absence carries its reason. One sentence for the rows that cannot
              be tapped, with the specific reason for each that is unavailable
              in THIS build or session. */}
          <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">
            ICEFALL has no Apple Health, AllTrails or Komoot integration yet, so those rows can't be
            tapped. Polar, Suunto and Garmin watch accounts aren't connectable yet either — you can
            see why under Settings → Connected accounts.
            {stravaWhy ? ` ${stravaWhy}` : ""}
            {ouraWhy ? ` ${ouraWhy}` : ""}
            {corosWhy ? ` ${corosWhy}` : ""}
          </p>
          {/* A sentence that says "sign in" beside a control that signs you in.
              This page sits outside the shell, so a signed-out person can reach
              it — most often when Strava sends them back to a browser that does
              not hold their session. */}
          {strava.state === "signed-out" && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => navigate("/auth/signin")}
            >
              Sign in
            </Button>
          )}
        </motion.div>
      </div>

      {/*
        THE MATTERHORN, IN BLACK AND WHITE, WITH NO BACKGROUND — the owner,
        2026-09-07: "you see how theres so much dark empty space, add
        matterhorn black/white version with no background to barely touching
        komoot box".

        `flex-1` is what fills the gap: on a tall screen the band grows to take
        every pixel between the last card and the bottom edge, and on a short
        one it keeps its minimum and the page scrolls.

        "No background" is a REAL CUT-OUT, not a scrim or a CSS mask. Sky and
        snow are within a tenth of each other in brightness, so no gradient can
        darken one without veiling the other — measured, and it looked like a
        grey rectangle. `matterhorn-cutout.png` is `matterhorn.jpg` with the
        sky keyed out (blue-leaning AND smooth AND connected to the top edge),
        converted to greyscale with an alpha channel, and cropped so the summit
        is its top edge. The credit is the photograph's; see CREDITS.md.

        The image is top-anchored, so the summit sits one card-gap under Komoot
        however tall the band is; `object-cover` crops the forest at the bottom
        rather than the peak at the top.
      */}
      <div className="relative mt-2 flex min-h-[200px] flex-1 shrink-0 flex-col justify-end overflow-hidden">
        <img
          src="/img/matterhorn-cutout.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
        {/* Under the words only, so "Not now" sits on dark rather than on snow
            — and grown by the home-indicator inset, because the words are
            padded by it and would otherwise climb up into the peak. */}
        <div
          className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-obsidian via-obsidian/60 to-transparent"
          style={{ height: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
        />
        <button
          type="button"
          onClick={onSkip}
          className="relative flex w-full items-center justify-center gap-1 pt-6 text-[12.5px] text-snow/85 transition-colors hover:text-snow"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 26px)" }}
        >
          Not now
          <ChevronRight size={14} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function ProviderRow({
  provider,
  label,
  onPick,
}: {
  provider: Provider;
  /** Set when the row cannot be tapped: the word shown where the chevron goes. */
  label: string | null;
  onPick: (id: ProviderId) => void;
}) {
  const shell =
    "flex w-full items-center gap-3.5 rounded-card border border-hairline bg-graphite p-3 text-left";

  if (label) {
    /* Only the TILE is muted. The name, the blurb and the label stay at full
       ink — they are the words that say why the row does nothing, and a dimmed
       reason is a reason nobody can read. */
    return (
      <div className={shell}>
        <span className="opacity-60">
          <ProviderTile id={provider.id} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] text-snow">{provider.name}</span>
          <span className="mt-0.5 block max-w-[24ch] text-[11.5px] leading-snug text-mist-dim">
            {provider.blurb}
          </span>
        </span>
        <span className="shrink-0 text-[11.5px] text-mist">{label}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPick(provider.id)}
      className={cn(shell, "transition-colors hover:bg-elevated/40")}
    >
      <ProviderTile id={provider.id} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-snow">{provider.name}</span>
        <span className="mt-0.5 block max-w-[24ch] text-[11.5px] leading-snug text-mist-dim">
          {provider.blurb}
        </span>
      </span>
      <ChevronRight size={17} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* 2 — connecting                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The three reassurances under the ring. Each is TRUE for the provider it is
 * shown with, which is why they are per provider rather than one shared list —
 * the drawing's "Real-time sync" is false for Strava and its "never shared" is
 * a promise this page is not in a position to make.
 */
const REASSURANCE: Record<
  "strava" | "oura" | "coros",
  { icon: LucideIcon; title: string; body: string }[]
> = {
  strava: [
    {
      icon: Lock,
      title: "Secure connection",
      body: "You sign in on Strava's own site. ICEFALL never sees your Strava password.",
    },
    {
      icon: MoveRight,
      title: "One direction",
      body: "ICEFALL sends activities to Strava when you choose. It reads nothing back.",
    },
    {
      icon: ShieldCheck,
      title: "You're in control",
      body: `You can disconnect at any time in ${SETTINGS_STRAVA}.`,
    },
  ],
  oura: [
    {
      icon: Lock,
      title: "Secure connection",
      body: "You sign in on Oura's own site. ICEFALL never sees your Oura password.",
    },
    {
      icon: MoveRight,
      title: "What is read",
      body: "Sleep, heart rate, HRV, breathing rate, blood oxygen, temperature deviation and daily activity — each reading when the Oura app uploads it.",
    },
    {
      icon: ShieldCheck,
      title: "You're in control",
      body: "Disconnecting deletes ICEFALL's copy of your measurements.",
    },
  ],
  /* Per-provider, not shared, for the same reason strava's and oura's are:
     a shared list would put a false sentence on a screen. Generic across the
     four watch vendors, not COROS-specific wording, because every one of
     them is a read-only connection with the same shape. */
  coros: [
    {
      icon: Lock,
      title: "Secure connection",
      body: "You sign in on COROS's own site. ICEFALL never sees your COROS password.",
    },
    {
      icon: MoveRight,
      title: "One direction — ICEFALL only reads",
      body: "ICEFALL brings across activities you record on your watch when you choose. It sends nothing back.",
    },
    {
      icon: ShieldCheck,
      title: "You're in control",
      body: `You can disconnect at any time in ${SETTINGS_STRAVA}.`,
    },
  ],
};

/** What the primary control is, decided by what is actually possible. */
type Gate = { label: string; agree: boolean } | { blocked: string } | null;

function Connecting({
  id,
  onBack,
  onClose,
}: {
  id: ProviderId;
  onBack: () => void;
  onClose: () => void;
}) {
  const provider = byId(id);
  const reduce = useReducedMotion();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const strava = useStravaStatus();
  const watch = useWatchStatus();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /* ---- Oura's permission gate -------------------------------------------- */
  const [consent, setConsent] = useState<HealthConsent | null>(null);
  const [wording, setWording] = useState<ConsentWording | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (id !== "oura") return;
    let live = true;
    void Promise.all([readHealthConsent(), wordingInForce()]).then(([c, w]) => {
      if (!live) return;
      setConsent(c);
      setWording(w);
      setChecked(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  async function goStrava() {
    setBusy(true);
    setProblem(null);
    const res = await beginStravaConnect("/connect");
    if (res.ok) {
      /* A full navigation, not a popup: Strava's consent page will not render
         in a frame, and the athlete comes back to this page with `?strava=`. */
      window.location.assign(res.url);
      return;
    }
    setBusy(false);
    setProblem(
      res.reason === "signed-out"
        ? "Sign in first — the connection is stored against your account."
        : res.reason === "no-backend"
          ? "This build of ICEFALL runs without a server, so no account can be linked from it."
          : "ICEFALL could not reach Strava. Nothing was changed.",
    );
  }

  async function goCoros(region: "eu" | "us") {
    setBusy(true);
    setProblem(null);
    const res = await beginWatchConnect("coros", { returnTo: "/connect", region });
    if (res.ok) {
      /* A full navigation, same reasoning as goStrava/goOura above. */
      window.location.assign(res.url);
      return;
    }
    setBusy(false);
    setProblem(
      res.reason === "signed-out"
        ? "Sign in first — the connection is stored against your account."
        : res.reason === "no-backend"
          ? "This build of ICEFALL runs without a server, so no account can be linked from it."
          : "ICEFALL could not reach COROS. Nothing was changed.",
    );
  }

  async function goOura(agreeFirst: boolean) {
    setBusy(true);
    setProblem(null);
    if (agreeFirst) {
      /* Recorded against the wording that is on the screen right now — the
         database stamps the version in force, which is the one just fetched. */
      const rec = await recordHealthConsent("granted", "app-onboarding");
      if (!rec.ok) {
        setBusy(false);
        setProblem(rec.error ?? "Your permission could not be recorded. Nothing has changed.");
        return;
      }
      setConsent(await readHealthConsent());
      await ouraService.refresh();
    }
    const res = await ouraService.connect(signupReturnUrl());
    if (res.ok && res.url) {
      window.location.assign(res.url);
      return;
    }
    setBusy(false);
    /* The server's own sentence when it gave one. A bare code (no spaces) is
       not a sentence and is not shown as one. */
    const err = res.error ?? "";
    setProblem(
      /\s/.test(err)
        ? err
        : `The ring can't be connected from here just now. You can connect it later under ${SETTINGS_RING}.`,
    );
  }

  const stravaGate: Gate =
    id !== "strava"
      ? null
      : strava.state === "loading"
        ? { blocked: "Checking your account…" }
        : strava.state === "no-backend"
          ? {
              blocked:
                "This build of ICEFALL runs without a server, so no account can be linked from it.",
            }
          : strava.state === "signed-out"
            ? {
                blocked:
                  "Sign in to link a Strava account — the connection is stored against your account, not this device.",
              }
            : strava.state === "connected" && strava.canUpload
              ? {
                  blocked: `Strava is already connected to this account. You can manage it under ${SETTINGS_STRAVA}.`,
                }
              : { label: "Continue to Strava", agree: false };

  const ouraCan = ouraService.canConnect();
  const ouraGate: Gate =
    id !== "oura"
      ? null
      : !ouraCan.ok
        ? { blocked: ouraCan.error }
        : !checked || !consent
          ? { blocked: "Checking your permission…" }
          : consent.status === "unknown"
            ? { blocked: consent.detail }
            : consent.status === "granted"
              ? { label: "Continue to Oura", agree: false }
              : consent.status === "never-asked"
                ? wording
                  ? { label: "I agree — continue to Oura", agree: true }
                  : {
                      blocked: `ICEFALL cannot ask for your permission right now, so the ring cannot be connected from here. You can do it later under ${SETTINGS_RING}.`,
                    }
                : consent.status === "withdrawn"
                  ? {
                      blocked: `You withdrew permission for health measurements, and ICEFALL's copy of them was deleted. You can give it again under ${SETTINGS_RING}.`,
                    }
                  : {
                      blocked: `You said no to storing health measurements. That decision is yours to change under ${SETTINGS_RING}.`,
                    };

  const corosConn = watch.byProvider.coros;
  const corosGate: Gate =
    id !== "coros"
      ? null
      : corosConn.state === "loading"
        ? { blocked: "Checking your account…" }
        : corosConn.state === "no-backend"
          ? {
              blocked:
                "This build of ICEFALL runs without a server, so no account can be linked from it.",
            }
          : corosConn.state === "signed-out"
            ? {
                blocked:
                  "Sign in to link a COROS account — the connection is stored against your account, not this device.",
              }
            : corosConn.state === "connected"
              ? {
                  blocked: `COROS is already connected to this account. You can manage it under ${SETTINGS_STRAVA}.`,
                }
              : { label: "Continue to COROS", agree: false };

  const gate: Gate = stravaGate ?? ouraGate ?? corosGate;
  const blocked = gate && "blocked" in gate ? gate.blocked : null;
  const marks = REASSURANCE[id === "oura" ? "oura" : id === "coros" ? "coros" : "strava"];

  /* The title follows the real state: nothing is connecting until the button
     has been pressed. */
  const title = busy
    ? `Connecting ${provider.name}…`
    : blocked
      ? provider.name
      : `Connect ${provider.name}`;

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      <div className="relative flex flex-1 flex-col px-6">
        <Header
          right={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          }
        />

        <button
          type="button"
          onClick={onBack}
          className="-mb-2 mt-4 flex items-center gap-1 self-start py-2 pr-3 text-[13px] text-mist transition-colors hover:text-snow"
        >
          <ChevronLeft size={16} strokeWidth={1.8} />
          Back
        </button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: EASE }}
          className="flex flex-1 flex-col items-center text-center"
        >
          <div className="mt-6">
            <ProviderTile id={id} size={52} />
          </div>
          <h1
            ref={heading}
            tabIndex={-1}
            className="display mt-6 text-[30px] leading-[1.08] text-snow outline-none"
          >
            {title}
          </h1>
          {!blocked && id !== "coros" && (
            <p className="mt-3 max-w-[30ch] text-[13px] leading-relaxed text-mist">
              You'll be taken to {provider.short} to authorise the connection.
            </p>
          )}

          {/* The ring — three hairline circles, an azure arc on the inner one,
              the mark at the centre. The arc turns only while a request is in
              flight, and not at all for anyone who has asked motion to stop. */}
          <div className="relative mt-8 grid h-[210px] w-[210px] place-items-center" aria-hidden>
            <span className="absolute inset-0 rounded-full border border-hairline" />
            <span className="absolute inset-[22px] rounded-full border border-hairline-strong" />
            <span className="absolute inset-[46px] rounded-full border border-hairline-strong bg-graphite" />
            <motion.svg
              viewBox="0 0 100 100"
              className="absolute inset-[46px]"
              animate={busy && !reduce ? { rotate: 360 } : { rotate: 0 }}
              transition={
                busy && !reduce
                  ? { repeat: Infinity, duration: 2.6, ease: "linear" }
                  : { duration: 0 }
              }
            >
              <circle
                cx="50"
                cy="50"
                r="48.5"
                fill="none"
                stroke="var(--ice-azure)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="70 235"
              />
            </motion.svg>
            <IcefallMark metal className="relative h-7" />
          </div>

          <ul className="mt-8 w-full max-w-[300px] space-y-4 text-left">
            {marks.map(({ icon: Icon, title: t, body }) => (
              <li key={t} className="flex items-start gap-3.5">
                <Icon size={17} strokeWidth={1.6} className="mt-0.5 shrink-0 text-mist" />
                <span className="min-w-0">
                  <span className="block text-[12.5px] text-snow">{t}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-mist-dim">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {/* Oura only: the sentence they are agreeing to, fetched, verbatim. */}
          {id === "oura" && gate && "agree" in gate && gate.agree && wording && (
            <p className="mt-6 w-full max-w-[300px] border-l border-hairline-strong pl-3 text-left text-[12px] leading-relaxed text-mist">
              {wording.wording}
            </p>
          )}

          <div className="mt-auto w-full pt-8">
            {/* One permanent live region for whatever replaces or precedes the
                button, so a screen reader hears the sentence when it lands. */}
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "text-[12.5px] leading-relaxed",
                problem ? "mb-3 text-azure" : blocked ? "text-mist" : "sr-only",
              )}
            >
              {problem ?? blocked ?? ""}
            </p>

            {/* COROS NEEDS A REAL REGION, NOT A DEFAULT.
                COROS accounts are region-sharded and the connection has to
                point at the right issuer — the server refuses a `begin` with
                no region for this vendor. So where every other provider gets
                one "Continue" button, COROS gets two, and the sentence that
                explains why replaces "You'll be taken to…" above. */}
            {!blocked && id === "coros" ? (
              <>
                <div className="flex gap-2">
                  <Button
                    size="lg"
                    variant="secondary"
                    className="flex-1"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void goCoros("eu")}
                  >
                    {busy ? (
                      <Loader2 size={16} strokeWidth={2} className="animate-spin" />
                    ) : (
                      "Europe"
                    )}
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    className="flex-1"
                    disabled={busy}
                    aria-busy={busy}
                    onClick={() => void goCoros("us")}
                  >
                    United States
                  </Button>
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-mist-dim">
                  COROS keeps accounts in a regional data centre, and the connection has to point at
                  the right one. Pick where your COROS account is registered.
                </p>
              </>
            ) : (
              !blocked && (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  aria-busy={busy}
                  onClick={() =>
                    id === "oura"
                      ? void goOura(gate !== null && "agree" in gate ? gate.agree : false)
                      : void goStrava()
                  }
                >
                  {busy ? (
                    <>
                      <Loader2
                        size={16}
                        strokeWidth={2}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      Opening {provider.short}…
                    </>
                  ) : (
                    <>
                      {id === "strava" ? (
                        <PlatformMark platform="strava" tone="current" size={15} />
                      ) : null}
                      {gate && "label" in gate ? gate.label : `Continue to ${provider.short}`}
                      <ChevronRight size={16} strokeWidth={1.8} />
                    </>
                  )}
                </Button>
              )
            )}

            <button
              type="button"
              onClick={onBack}
              className="mt-4 w-full py-2 text-center text-[13px] text-mist transition-colors hover:text-snow"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)" }}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2½ — finishing a Strava consent                                             */
/* -------------------------------------------------------------------------- */

/**
 * Strava sent the athlete back with a ticket. The link is not made yet: this
 * presents the ticket WITH the session, and the server finishes it only if the
 * ticket was minted for this very account. What the server answers is what the
 * next screen shows — including a refusal, in its own words.
 */
function Finishing({
  ticket,
  onDone,
  onFailed,
  onClose,
}: {
  ticket: string;
  onDone: (athleteUsername: string | null) => void;
  onFailed: (why: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    let live = true;
    void finalizeStravaConnect(ticket).then((res) => {
      if (!live) return;
      if (res.ok && res.canUpload) onDone(res.athleteUsername);
      else if (res.ok) {
        onFailed(
          "Strava is linked, but permission to add activities was not granted — it is the tick box on Strava's consent screen. Connect again and leave that box ticked.",
        );
      } else onFailed(FINALIZE_COPY[res.reason]);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      <div className="relative flex flex-1 flex-col px-6">
        <Header
          right={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Loader2
            size={20}
            strokeWidth={2}
            className="animate-spin text-mist"
            aria-hidden="true"
          />
          <p role="status" className="mt-4 text-[13px] text-mist">
            Strava sent you back. Confirming the link against your account…
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2½b — finishing a watch consent                                            */
/* -------------------------------------------------------------------------- */

/**
 * A watch provider sent the athlete back with a ticket. Same shape as
 * `Finishing` above, generalised: the link is not made yet, the server
 * finishes it only against this session, and whatever it answers is what the
 * next screen shows.
 */
function WatchFinishing({
  ticket,
  provider,
  onDone,
  onFailed,
  onClose,
}: {
  ticket: string;
  provider: WatchProvider;
  onDone: (accountLabel: string | null) => void;
  onFailed: (why: string) => void;
  onClose: () => void;
}) {
  const name = WATCH_PROVIDER_NAME[provider];

  useEffect(() => {
    let live = true;
    void finalizeWatchConnect(ticket).then((res) => {
      if (!live) return;
      if (res.ok && res.canImport) onDone(res.accountLabel);
      else if (res.ok) {
        onFailed(
          `${name} is linked, but permission to read your activities was not granted, so nothing can be brought across. Connect again and leave that permission ticked.`,
        );
      } else {
        const copy: Record<Extract<WatchFinalizeOutcome, { ok: false }>["reason"], string> = {
          "no-backend":
            "This build of ICEFALL runs without a server, so no account can be linked from it.",
          "signed-out": `You were signed out before ${name} sent you back, so this connection request could not be finished and cannot be resumed. Nothing was linked. Sign in and start the connection again.`,
          "not-saved": `${name} granted the permission, but ICEFALL could not save the connection. Nothing is linked here — start it again in a moment.`,
          "not-yours": `That ${name} consent was started from a different ICEFALL account, so it was not linked to this one. Nothing was stored. Start the connection again from here.`,
          invalid:
            "That connection request is no longer valid — each one can be used once. Start it again.",
          expired:
            "That connection request is no longer valid — each one lasts ten minutes. Start it again.",
          vendor: `${name} did not complete the connection. Nothing was linked — try again in a moment.`,
          unreachable:
            "ICEFALL could not finish the connection. Nothing was linked — try again in a moment.",
        };
        onFailed(copy[res.reason]);
      }
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      <div className="relative flex flex-1 flex-col px-6">
        <Header
          right={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Loader2
            size={20}
            strokeWidth={2}
            className="animate-spin text-mist"
            aria-hidden="true"
          />
          <p role="status" className="mt-4 text-[13px] text-mist">
            {name} sent you back. Confirming the link against your account…
          </p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 3 — connected                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Three things the athlete can do NEXT, and can actually do. The drawing's
 * rows promise the Coach will use the connection; neither connection feeds a
 * coach screen today, so these name the real next actions instead.
 */
const NEXT_STEPS: Record<
  "strava" | "oura" | "watch",
  { icon: LucideIcon; title: string; body: string }[]
> = {
  strava: [
    {
      icon: Play,
      title: "Record an activity",
      body: "Track a hike, run or climb with ICEFALL's own GPS.",
    },
    {
      icon: Send,
      title: "Send it to Strava",
      body: "Open the finished activity and tap Send. Nothing goes without you.",
    },
    {
      icon: Settings2,
      title: "Stay in control",
      body: `Disconnect any time under ${SETTINGS_STRAVA}.`,
    },
  ],
  oura: [
    {
      icon: Circle,
      title: "Wear it tonight",
      body: "Last night's readings reach ICEFALL after you open the Oura app.",
    },
    {
      icon: Play,
      title: "See your readings",
      body: "They are on Ring and health data — the row above opens it.",
    },
    {
      icon: Settings2,
      title: "Stay in control",
      body: "Disconnecting deletes ICEFALL's copy of your measurements.",
    },
  ],
  /* Generic across the four watch vendors — every one of them is a read-only
     connection with the same shape, so one bucket serves them all. */
  watch: [
    {
      icon: Watch,
      title: "Sync your watch",
      body: "Your watch service uploads an activity to its own cloud when it syncs — it has to arrive there before ICEFALL can read it.",
    },
    {
      icon: Play,
      title: "Check for new activities",
      body: `Open ${SETTINGS_STRAVA} and tap Check for new activities. Nothing arrives until you ask.`,
    },
    {
      icon: Settings2,
      title: "Stay in control",
      body: `Disconnect any time under ${SETTINGS_STRAVA}.`,
    },
  ],
};

function Connected({
  id,
  athleteUsername,
  accountLabel,
  onDone,
}: {
  id: "strava" | "oura" | WatchProvider;
  athleteUsername?: string | null;
  /** Watch providers only — the vendor's own label for the account, when it said. */
  accountLabel?: string | null;
  onDone: () => void;
}) {
  const navigate = useNavigate();
  const heading = useFocusOnMount<HTMLHeadingElement>();
  const isWatch = id !== "strava" && id !== "oura";
  /* `byId` only covers `PROVIDERS`, which holds COROS but not Polar, Suunto
     or Garmin — none of which can actually reach this screen today (none of
     the three has a working connection to finish), but the name is read from
     `WATCH_PROVIDER_NAME` directly rather than through `byId` so this stays
     correct the day one of them does. */
  const name = isWatch ? WATCH_PROVIDER_NAME[id] : byId(id).name;
  const identityLabel = isWatch ? accountLabel : athleteUsername;
  /* The row opens the page that manages this connection — the one exit on
     this screen that leaves sign-up, because "manage it" is what a chevron
     on a connected account means everywhere else in the app. Done, Skip and
     the close control all lead on to the trial offer. Every watch provider
     manages under the same page Strava does. */
  const settingsPath = id === "oura" ? "/settings/health-sources" : "/settings/connections";

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      {/* Full-bleed hero, dissolving into the canvas beneath the check. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46%] overflow-hidden">
        <img
          src="/img/k2.jpg"
          alt=""
          aria-hidden
          className="h-full w-full object-cover object-[50%_30%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/35 via-obsidian/60 to-obsidian" />
      </div>

      <div className="relative flex flex-1 flex-col px-6">
        <Header
          right={
            <button
              type="button"
              onClick={onDone}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:text-snow"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          }
        />

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: EASE }}
          className="flex flex-1 flex-col"
        >
          <div className="mt-[22%] grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full border-2 border-summit">
              <Check size={28} strokeWidth={2} className="text-summit" />
            </span>
          </div>

          <h1
            ref={heading}
            tabIndex={-1}
            className="display mt-6 text-center text-[30px] leading-[1.08] text-snow outline-none"
          >
            {name} connected!
          </h1>
          <p className="mx-auto mt-3 max-w-[32ch] text-center text-[13px] leading-relaxed text-mist">
            {id === "oura"
              ? "Your ring's sleep, heart rate, HRV, breathing rate, blood oxygen, temperature deviation and daily activity can now be read by ICEFALL as the Oura app uploads them."
              : isWatch
                ? `ICEFALL can now bring across activities you record on your ${name} watch. Nothing arrives automatically — you choose when to check.`
                : "Activities you record here can now be sent to your Strava profile — one at a time, when you choose."}
          </p>

          <button
            type="button"
            onClick={() => navigate(settingsPath)}
            className="mt-7 flex w-full items-center gap-3.5 rounded-card border border-hairline bg-graphite p-3.5 text-left transition-colors hover:bg-elevated/40"
          >
            <ProviderTile id={id} />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] text-snow">{name}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-mist-dim">
                <span className="h-1.5 w-1.5 rounded-full bg-summit" />
                Connected
                {/* Which account — measured by the server, not typed by anyone. */}
                {identityLabel ? ` · @${identityLabel}` : ""}
              </span>
            </span>
            <ChevronRight size={17} strokeWidth={1.7} className="shrink-0 text-mist-dim" />
          </button>

          <p className="section-label mt-7 text-azure/85">What's next?</p>
          <ul className="mt-4 space-y-4">
            {NEXT_STEPS[id === "strava" ? "strava" : id === "oura" ? "oura" : "watch"].map(
              ({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline-strong bg-graphite">
                    <Icon size={16} strokeWidth={1.6} className="text-snow" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-snow">{title}</span>
                    <span className="mt-0.5 block max-w-[30ch] text-[11.5px] leading-relaxed text-mist-dim">
                      {body}
                    </span>
                  </span>
                </li>
              ),
            )}
          </ul>

          <div
            className="mt-auto pt-8"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 22px)" }}
          >
            <Button size="lg" className="w-full" onClick={onDone}>
              Done
              <ArrowRight size={16} strokeWidth={1.8} />
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Oura's server does the exchange itself and sends the browser back with
 * `?oura=connected`. That word is a reason to CHECK, not a fact to display:
 * the ring service is asked, and the connected screen is drawn only once it
 * reports a live connection. Anything else goes back to the list with the
 * service's own sentence.
 */
function OuraConnected({
  onDone,
  onFailed,
  onClose,
}: {
  onDone: () => void;
  onFailed: (why: string) => void;
  onClose: () => void;
}) {
  const { state } = useOura();

  useEffect(() => {
    if (state.status === "checking" || state.status === "connected") return;
    onFailed(
      state.detail ??
        "ICEFALL could not confirm the ring connection. Check it under Settings → Ring and health data.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  if (state.status === "connected") return <Connected id="oura" onDone={onDone} />;

  return (
    <div className="no-scrollbar relative flex h-full flex-col overflow-y-auto bg-obsidian">
      <div className="relative flex flex-1 flex-col px-6">
        <Header
          right={
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
            >
              <X size={18} strokeWidth={1.6} />
            </button>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Loader2
            size={20}
            strokeWidth={2}
            className="animate-spin text-mist"
            aria-hidden="true"
          />
          <p role="status" className="mt-4 text-[13px] text-mist">
            Oura sent you back. Checking the ring connection…
          </p>
        </div>
      </div>
    </div>
  );
}
