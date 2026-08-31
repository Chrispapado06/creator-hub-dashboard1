import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, LifeBuoy } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { inputClass } from "@/components/guide";
import { guideAccess, onAuthChange, type GuideAccess } from "@/auth/account";
import { openSupportTicket, type GuideTicketType } from "@/support/openTicket";
import { OFFLINE } from "@/offline/offline";
import { cn } from "@/lib/utils";

/**
 * THE SUPPORT ENTRY POINT — placed where a livelihood question starts.
 *
 * Payouts, verification and the listing: the three screens a guide is on when
 * something has gone wrong with their income. Not a Settings menu, because
 * nobody goes to Settings to ask why they have not been paid.
 *
 * IT ONLY BECOMES A FORM WHEN THERE IS GENUINELY A SESSION BEHIND IT. The state
 * comes from `guideAccess()`, which asks the client and the database rather than
 * the environment — `open_support_ticket` opens with
 * `if v_uid is null then raise exception 'not signed in'`, so a form shown to a
 * signed-out guide would take their message about unpaid work and fail. Worse
 * than no button: they stop chasing it.
 *
 * FIVE STATES, AND NONE OF THEM IS A LIE:
 *
 *   offline      no client on this device — say so, no form
 *   signed-out   there is a desk, they are not signed in — offer sign-in
 *   not-a-guide  a real ICEFALL account that is not a guide account. NOT an
 *                error and not their fault: every account is an athlete until
 *                staff make it more. Say what is true; never offer to promote
 *                them, because no app can honestly do that
 *   unknown      signed in, and the CHECK failed. Deliberately not folded into
 *                not-a-guide — "we looked and you are not" and "we could not
 *                look" are different, and only one should shut a guide out
 *   guide        the form
 *
 * NO RESPONSE-TIME PROMISE. Not here, not after sending. `first_response_at` is
 * empty because nothing has ever been answered.
 */

export type SupportTopic = "payouts" | "verification" | "listing";

const ASK: Record<SupportTopic, string> = {
  payouts: "Something wrong with a payment?",
  verification: "A question about your documents?",
  listing: "Your listing not showing as you expect?",
};

/**
 * The reassurance, per topic — it has to be TRUE of the thing being asked about.
 * "Nothing you are owed is affected" is right on a payouts screen and wrong
 * under a listing question, where the worry is not money but whether their work
 * has disappeared.
 */
const REASSURANCE: Record<SupportTopic, string> = {
  payouts: "Nothing you are owed is affected.",
  verification: "Nothing you have already sent us is affected.",
  listing: "Your mountains, dates and clients are untouched.",
};

const TYPE: Record<SupportTopic, GuideTicketType> = {
  payouts: "payment",
  verification: "verification",
  listing: "listing",
};

const SUBJECT: Record<SupportTopic, string> = {
  payouts: "Question about a payment",
  verification: "Question about my documents",
  listing: "Question about my listing",
};

export function SupportEntry({ topic, className }: { topic: SupportTopic; className?: string }) {
  const { pathname } = useLocation();
  /* Offline the answer is known before the first paint, so the "Checking…" line
     never appears. Unset, this is `null` exactly as it always was. */
  const [access, setAccess] = useState<GuideAccess | null>(OFFLINE ? "offline" : null);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () => void guideAccess().then((a) => alive && setAccess(a));
    check();
    const off = onAuthChange(check);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const send = async () => {
    setSending(true);
    setError(null);
    const r = await openSupportTicket({
      subject: SUBJECT[topic],
      body,
      type: TYPE[topic],
      originScreen: pathname,
    });
    setSending(false);
    if (r.ok) {
      setReference(r.reference);
      /* Their words are kept until the reference is on screen — nothing may look
         sent that was not stored, and the proof is the reference. */
      setBody("");
    } else {
      /* KEEP WHAT THEY TYPED. A guide who loses a carefully written account of
         an unpaid booking does not write it again. */
      setError(r.message);
    }
  };

  /* ---- Sent ------------------------------------------------------------- */
  if (reference) {
    return (
      <Card className={className}>
        <div className="flex items-start gap-2.5">
          <Check size={15} strokeWidth={2.2} className="mt-px shrink-0 text-summit" />
          <div className="min-w-0">
            <p className="text-[13px] text-snow">
              {/* OFFLINE THE CLAIM CHANGES, BECAUSE THE FACT CHANGES. The
                  sentence below is the app's proof that a message reached a
                  person; in an offline demo nothing reached anybody, so saying
                  so would be the one dishonest line on the screen. */}
              {OFFLINE ? "Kept on this device" : "Sent to the ICEFALL desk"}
            </p>
            <p className="tnum mt-1 text-[12.5px] text-mist">
              Your reference is <span className="text-snow">{reference}</span>
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
              {OFFLINE
                ? "This is a sample reference. Nothing was sent — the offline demo has no desk to send to, and this is gone when the app is reloaded."
                : "Quote it if you write again. It is stored — that reference only exists because the desk has your message."}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const line = (extra: string) => (
    <div className={cn("flex items-start gap-2.5 px-1", className)}>
      <LifeBuoy size={14} strokeWidth={1.7} className="mt-[2px] shrink-0 text-mist-dim" />
      <p className="text-[11.5px] leading-relaxed text-mist-dim">
        <span className="text-mist">{ASK[topic]}</span> {extra}
      </p>
    </div>
  );

  /* ---- Not able to send, for a reason worth naming ----------------------- */
  if (access === null) return line("Checking whether you can reach the ICEFALL desk…");

  if (access === "offline") {
    return line(
      `ICEFALL is not connected on this device, so there is nobody for a question to reach. ${REASSURANCE[topic]}`,
    );
  }

  if (access === "signed-out") {
    return (
      <div className={cn("flex items-start gap-2.5 px-1", className)}>
        <LifeBuoy size={14} strokeWidth={1.7} className="mt-[2px] shrink-0 text-mist-dim" />
        <p className="text-[11.5px] leading-relaxed text-mist-dim">
          <span className="text-mist">{ASK[topic]}</span>{" "}
          <Link to="/welcome" className="text-azure">
            Sign in
          </Link>{" "}
          and you can ask the ICEFALL desk from here. {REASSURANCE[topic]}
        </p>
      </div>
    );
  }

  if (access === "not-a-guide") {
    return line(
      `This account is not a guide account, so there is no guide desk to reach from it. ICEFALL makes an account a guide's after a member of staff has read your documents. ${REASSURANCE[topic]}`,
    );
  }

  if (access === "unknown") {
    return line(
      `ICEFALL could not check your account just now, so this is not available. That is our side, not yours. ${REASSURANCE[topic]}`,
    );
  }

  /* ---- The form --------------------------------------------------------- */
  if (!open) {
    return (
      <div className={cn("flex items-start gap-2.5 px-1", className)}>
        <LifeBuoy size={14} strokeWidth={1.7} className="mt-[2px] shrink-0 text-mist-dim" />
        <p className="text-[11.5px] leading-relaxed text-mist-dim">
          <span className="text-mist">{ASK[topic]}</span>{" "}
          <button type="button" onClick={() => setOpen(true)} className="text-azure">
            Ask the ICEFALL desk
          </button>
        </p>
      </div>
    );
  }

  return (
    <Card className={className}>
      <p className="section-label">{SUBJECT[topic]}</p>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        autoFocus
        placeholder="What has happened? Include dates or a client's name if it helps."
        className={cn(inputClass, "mt-2.5 resize-none")}
      />
      {error && <p className="mt-2 text-[11.5px] leading-relaxed text-danger">{error}</p>}
      <div className="mt-3 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-[12.5px] text-mist-dim hover:text-mist"
        >
          Cancel
        </button>
        <Button size="sm" onClick={send} disabled={sending || body.trim().length < 10}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
      {/* No response-time promise. `first_response_at` is empty because nothing
          has ever been answered; any figure here would be invented, to somebody
          waiting on money. */}
      <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
        {OFFLINE
          ? "Sample data: this stays on the device and reaches nobody."
          : "Goes to the ICEFALL desk with a reference you can quote."}
      </p>
    </Card>
  );
}
