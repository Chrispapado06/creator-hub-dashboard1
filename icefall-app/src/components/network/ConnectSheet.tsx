import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldAlert } from "lucide-react";
import { Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { matchScore } from "@/network/matching";
import { SAFETY_REMINDER } from "@/network/privacy";
import { NETWORK_NOT_CONNECTED_NOTICE } from "@/network/types";
import type { AthleteProfile } from "@/network/types";
import { useApp } from "@/state/AppState";

/**
 * Writing to another athlete.
 *
 * THREE THINGS THIS SHEET IS NOT ALLOWED TO DO, and the reasons they matter
 * more here than anywhere else in ICEFALL:
 *
 *  1. IT MAY NOT IMPLY DELIVERY. There is no server. `queueConnection` writes a
 *     row to localStorage with status `"queued"` and that is the end of it —
 *     nothing is transmitted, nobody is notified, and no reply can ever arrive.
 *     So the notice appears BEFORE the send button, not after it, and the state
 *     that follows a send is a plain statement that the message is sitting on
 *     this device. No tick, no "Sent", no azure. Someone who believes a partner
 *     has been arranged may leave for a mountain expecting a person who was
 *     never told.
 *
 *  2. IT MAY NOT LET THE SAFETY REMINDER BE WAVED AWAY. On the athlete's first
 *     ever connection the reminder is a step they have to pass through, not a
 *     toast that fades. On every subsequent one it is still on the screen while
 *     they write. This is the surface where a stranger becomes a plan to meet in
 *     a remote place, and ICEFALL has checked nobody — not identity, not
 *     qualifications, not ability. That sentence is stated outright rather than
 *     left for the reader to infer.
 *
 *  3. IT MAY NOT RATE THE PERSON. The reason shown is the SHARED OBJECTIVE,
 *     taken verbatim from the matching engine, and nothing else. The numeric
 *     match score is deliberately not rendered: a number beside a name reads as
 *     a verdict on a human being, and flattery about a climbing partner is how
 *     somebody ends up on a route with a stranger they never questioned.
 */

/* -------------------------------------------------------------------------- */
/* Copy                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Stated on its own line, in the largest type on the safety step, and repeated
 * beside the compose box.
 *
 * `SAFETY_REMINDER` opens with the same claim in a longer sentence, but the
 * long paragraph is the kind of thing an eye slides over. This one line is the
 * single most important fact on the screen and it is given the space to be read.
 */
const NO_VERIFICATION_LINE = "ICEFALL does not verify anyone's climbing ability.";

/* -------------------------------------------------------------------------- */
/* The shared-objective reason                                                 */
/* -------------------------------------------------------------------------- */

interface ConnectReason {
  headline: string;
  note: string;
}

/**
 * Why these two might climb together, in the engine's own words.
 *
 * Nothing is written fresh here. `matchScore` already produces one honest line
 * naming the actual relationship between the two objectives — including the
 * cases where the mountains are different, or where one of them has not named a
 * mountain at all — and paraphrasing it on this screen is how a "different
 * objectives" pairing quietly acquires an encouraging sentence.
 */
function connectReason(me: AthleteProfile | null, them: AthleteProfile): ConnectReason {
  if (!me) {
    return {
      headline: "Nothing to compare yet",
      note: "You have not filled in your own network profile, so ICEFALL has no objective of yours to set against theirs.",
    };
  }

  const result = matchScore(me, them);
  const objective = result.factors.find((f) => f.id === "objective");

  return {
    headline: result.headline,
    note: objective?.note ?? "There is no objective on either side to compare.",
  };
}

/* -------------------------------------------------------------------------- */
/* The draft                                                                   */
/* -------------------------------------------------------------------------- */

/** First name where there is one, so the draft does not open "Hi ,". */
function firstName(profile: AthleteProfile): string {
  const trimmed = profile.displayName.trim();
  if (trimmed.length === 0) return "there";
  return trimmed.split(/\s+/)[0];
}

/**
 * The message the athlete starts from, assembled ONLY from facts already on the
 * two profiles.
 *
 * Every clause is dropped when the fact behind it is missing rather than
 * softened into a guess: a draft that says "I'm heading there too" when no
 * objective is set would put a claim in the athlete's mouth that they never
 * made, and it is the other person who would plan around it. It is a draft in
 * an editable field, so the athlete owns every word before anything happens
 * to it.
 *
 * The closing line is deliberate. It proposes a day well within both their
 * limits before anything serious, which is the same thing `SAFETY_REMINDER`
 * asks for — the default should be the careful thing, not an invitation to
 * commit to a route with a stranger.
 */
function draftMessage(me: AthleteProfile | null, them: AthleteProfile): string {
  const lines: string[] = [`Hi ${firstName(them)}.`];

  const theirs = them.objective;
  const mine = me?.objective;

  if (theirs) lines.push(`I saw you have ${theirs.peakName} down as your objective.`);

  if (mine) {
    const when = monthOf(mine.targetDate);
    lines.push(
      when === null
        ? `I am working towards ${mine.peakName}.`
        : `I am working towards ${mine.peakName} around ${when}.`,
    );
  }

  if (!theirs && !mine) {
    lines.push("I am training in the mountains and looking for people doing the same.");
  }

  lines.push(
    "Would you be up for a day out on something well within both our limits first, to see how we get on?",
  );

  return lines.join(" ");
}

/** "June 2027", or null when the date is unusable. Never a fabricated month. */
function monthOf(iso: string): string | null {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/* -------------------------------------------------------------------------- */
/* Sheet                                                                       */
/* -------------------------------------------------------------------------- */

export interface ConnectSheetProps {
  athlete: AthleteProfile;
  open: boolean;
  onClose: () => void;
}

/**
 * Portalled into the phone frame rather than the document body.
 *
 * On a desktop the app sits in a 430 px shell, and a `fixed` overlay would
 * spill across the whole browser window; inside the scroller an `absolute` one
 * would scroll away from under the reader. `[data-phone-shell]` is a positioned
 * element that is exactly the app, so a sheet mounted there is framed correctly
 * on a desktop, full-bleed on a handset, and stays put while the page behind it
 * does not move. The body fallback keeps this component usable if the shell is
 * ever removed.
 */
function sheetRoot(): Element | null {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-phone-shell]") ?? document.body;
}

export function ConnectSheet({ athlete, open, onClose }: ConnectSheetProps) {
  const root = sheetRoot();
  if (root === null) return null;

  return createPortal(
    <AnimatePresence>
      {open && <ConnectSheetBody key="connect-sheet" athlete={athlete} onClose={onClose} />}
    </AnimatePresence>,
    root,
  );
}

type Step = "safety" | "compose" | "queued";

function ConnectSheetBody({ athlete, onClose }: { athlete: AthleteProfile; onClose: () => void }) {
  const { myProfile, connectionRequests, blockedIds, queueConnection } = useApp();

  /**
   * Both captured at MOUNT, not read live.
   *
   * The safety step is decided once, when the sheet opens. Reading the request
   * count on every render would pull the gate out from under a sheet that is
   * already showing it the instant the first message is queued.
   */
  const [step, setStep] = useState<Step>(() =>
    connectionRequests.length === 0 ? "safety" : "compose",
  );
  const [message, setMessage] = useState(() => draftMessage(myProfile, athlete));

  const reason = useMemo(() => connectReason(myProfile, athlete), [myProfile, athlete]);
  const name = athlete.displayName.trim() || "this athlete";

  // Belt and braces: `queueConnection` refuses a blocked id on its own, but a
  // sheet that let someone write a message which is then silently dropped would
  // be worse than one that says why it cannot.
  const blocked = blockedIds.includes(athlete.id);
  const existing = connectionRequests.find((r) => r.toAthleteId === athlete.id);

  function send() {
    const body = message.trim();
    if (body.length === 0) return;
    queueConnection(athlete.id, body);
    setStep("queued");
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-end bg-obsidian/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 48 }}
        animate={{ y: 0 }}
        exit={{ y: 48 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-sheet-title"
        className="no-scrollbar max-h-[88%] w-full overflow-y-auto rounded-t-[24px] border-t border-hairline-strong bg-graphite p-5"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/15" aria-hidden="true" />

        {blocked ? (
          <BlockedStep name={name} onClose={onClose} />
        ) : step === "safety" ? (
          <SafetyStep name={name} onContinue={() => setStep("compose")} onClose={onClose} />
        ) : step === "compose" ? (
          <ComposeStep
            name={name}
            reason={reason}
            message={message}
            onMessage={setMessage}
            alreadyQueuedAt={existing?.sentAt}
            onSend={send}
            onClose={onClose}
          />
        ) : (
          <QueuedStep name={name} onClose={onClose} />
        )}
      </motion.div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step: safety                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The first-connection gate.
 *
 * There is no way past this to the compose box other than the button, and the
 * button says what it does. It is not a toast, it does not time out, and it
 * cannot be swiped off the top of the message the athlete is writing. The only
 * other exit is out of the flow entirely, which is the correct second option
 * for someone who has just read that ICEFALL vouches for nobody.
 */
function SafetyStep({
  name,
  onContinue,
  onClose,
}: {
  name: string;
  onContinue: () => void;
  onClose: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <ShieldAlert
          size={15}
          strokeWidth={1.6}
          className="shrink-0 text-azure"
          aria-hidden="true"
        />
        <SectionLabel>Before you contact anybody</SectionLabel>
      </div>

      <h2 id="connect-sheet-title" className="display mt-4 text-[27px] text-snow">
        {NO_VERIFICATION_LINE}
      </h2>

      <div className="mt-5 rounded-card border border-azure/25 bg-azure/[0.05] p-4">
        <p className="text-[12px] leading-relaxed text-mist">{SAFETY_REMINDER}</p>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
        Nothing on {name}'s profile has been checked by anyone. Readiness, experience and everything
        else there is what they wrote about themselves, or what their own device worked out from
        their own training.
      </p>

      <div className="mt-5 space-y-2.5">
        <Button size="lg" className="w-full" onClick={onContinue}>
          I have read this
        </Button>
        <Button size="lg" variant="secondary" className="w-full" onClick={onClose}>
          Not now
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step: compose                                                               */
/* -------------------------------------------------------------------------- */

function ComposeStep({
  name,
  reason,
  message,
  onMessage,
  alreadyQueuedAt,
  onSend,
  onClose,
}: {
  name: string;
  reason: ConnectReason;
  message: string;
  onMessage: (v: string) => void;
  alreadyQueuedAt?: string;
  onSend: () => void;
  onClose: () => void;
}) {
  const empty = message.trim().length === 0;

  return (
    <div>
      <SectionLabel>Connection request</SectionLabel>
      <h2 id="connect-sheet-title" className="mt-3 text-[22px] font-light text-snow">
        Connect with {name}?
      </h2>

      {/* The reason, straight from the matching engine. Objective first, because
          the objective is what this network is organised around. */}
      <div className="mt-4 rounded-card border border-hairline bg-obsidian p-4">
        <p className="section-label">Why you are being shown this</p>
        <p className="mt-2 text-[14px] font-light text-snow">{reason.headline}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{reason.note}</p>
      </div>

      {alreadyQueuedAt !== undefined && (
        <p className="mt-4 text-[11px] leading-relaxed text-mist-dim">
          You already have a message for {name} held on this device from {fmtDate(alreadyQueuedAt)}.
          It has not gone anywhere, and neither will this one.
        </p>
      )}

      <label htmlFor="connect-message" className="section-label mt-5 block">
        Your message
      </label>
      <textarea
        id="connect-message"
        value={message}
        onChange={(e) => onMessage(e.target.value)}
        rows={5}
        className="mt-2.5 w-full resize-none rounded-card border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
        placeholder="Write something about what you are training for."
      />

      {/* Repeated on every connection, not just the first, and not collapsible.
          The athlete is about to propose meeting a stranger in the mountains. */}
      <div className="mt-4 rounded-card border border-azure/25 bg-azure/[0.05] p-4">
        <p className="text-[12px] font-medium text-snow">{NO_VERIFICATION_LINE}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-mist">{SAFETY_REMINDER}</p>
      </div>

      {/* BEFORE the button, deliberately. After it, this is an apology; before
          it, it is the fact the athlete decides on. */}
      <Disclaimer className="mt-5">{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>

      <div className="mt-5 space-y-2.5">
        <Button size="lg" className="w-full" onClick={onSend} disabled={empty}>
          Send request
        </Button>
        <Button size="lg" variant="secondary" className="w-full" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step: queued                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What happens after "Send request", and what must not.
 *
 * No tick, no "Sent", no azure, no celebration — every one of those would be the
 * app telling the athlete their message is in flight when it is in
 * localStorage. The heading states where the message actually is, and the body
 * states plainly that nobody has been told and no reply can come.
 */
function QueuedStep({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div>
      <SectionLabel>Nothing was sent</SectionLabel>
      <h2 id="connect-sheet-title" className="mt-3 text-[22px] font-light text-snow">
        Held on this device
      </h2>

      <p className="mt-3 text-[13px] leading-relaxed text-mist">
        {name} has not been notified and cannot be. Your message is saved in ICEFALL on this device
        and nowhere else, so no reply can arrive — do not plan anything around one.
      </p>

      <Disclaimer className="mt-5">{NETWORK_NOT_CONNECTED_NOTICE}</Disclaimer>

      <Button size="lg" variant="secondary" className="mt-5 w-full" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step: blocked                                                               */
/* -------------------------------------------------------------------------- */

function BlockedStep({ name, onClose }: { name: string; onClose: () => void }) {
  return (
    <div>
      <SectionLabel>Blocked</SectionLabel>
      <h2 id="connect-sheet-title" className="mt-3 text-[22px] font-light text-snow">
        You have blocked {name}
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-mist">
        Nothing can be written to them from this device. Unblock them from their profile if you want
        to change that.
      </p>
      <Button size="lg" variant="secondary" className="mt-5 w-full" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
