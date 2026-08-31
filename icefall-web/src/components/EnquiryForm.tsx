import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, MessageSquare } from "lucide-react";
import {
  BODY_MAX,
  BODY_MIN,
  ENQUIRY_LIVE,
  openEnquiryAsUser,
  sendEnquiry,
  type EnquiryObject,
} from "@/lib/enquiry";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/**
 * The enquiry form, in ONE place — used by the trek page and the guide page.
 *
 * Two surfaces asking the same question, so they ask it the same way. This
 * codebase has `peaks.ts` because one number lived in two places and disagreed,
 * and `CompanyMark.tsx` because a logo-or-monogram branch was written inline
 * twice and a third screen quietly did something else.
 *
 * ── WHAT IT DELIBERATELY DOES NOT SAY ───────────────────────────────────────
 *
 * **No response time.** Contract rule 3, and there is a standing defect on four
 * customer-facing screens in this family — *"Replies within {n} h"* — which is
 * invented and uncaveated. Nothing measures a response time, so nothing claims
 * one. The form may say an enquiry was received; it may not say when anybody
 * will answer.
 *
 * **No status it cannot substantiate.** Contract rule 4. The confirmation says
 * the enquiry was received and to whom the answer will go, because a 2xx proves
 * the row was written. "Seen" and "answered" are real states the database
 * records, and this app cannot read them back — anon has INSERT and no SELECT —
 * so it does not pretend to.
 *
 * ── BEFORE THE MIGRATION IS PUSHED ──────────────────────────────────────────
 *
 * `ENQUIRY_LIVE` is false and this renders the link the page has always had,
 * with no Send button anywhere. A control that fails every time is worse than
 * no control, because the person believes they have been heard.
 */
export function EnquiryForm({
  object,
  heading,
  intro,
  originScreen,
  fallbackLabel,
}: {
  object: EnquiryObject;
  heading: string;
  intro: string;
  originScreen: string;
  /** The wording of the link shown while the send path is not live. */
  fallbackLabel: string;
}) {
  const { session, signedIn } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorIsOurs, setErrorIsOurs] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  if (!ENQUIRY_LIVE) {
    return (
      <Link
        to="/app/messages"
        className="mt-4 flex h-11 items-center justify-center gap-2 rounded-tile bg-azure-cta text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90"
      >
        <MessageSquare size={14} strokeWidth={1.9} />
        {fallbackLabel}
      </Link>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    /*
      TWO PATHS, AND WHICH ONE IS NOT A DETAIL.

      Signed in -> `open_enquiry`, which stamps `sender_id` from the session. A
      signed-out visitor -> the anon insert, which forces `sender_id` to null.
      Only the first can ever be read back by the person who wrote it, so a
      signed-in climber who went through the anon path would never see their own
      enquiry in "My enquiries" — it would look broken rather than empty.
    */
    const result = signedIn
      ? await openEnquiryAsUser({ body, object, originScreen })
      : await sendEnquiry({ email, name, body, object, originScreen, website });
    if (!live.current) return;

    // Only success clears the box. An enquiry can be long and carefully worded;
    // losing it because the network dropped would be the worst possible reply.
    if (result.ok) {
      setSentTo(signedIn ? (session?.email ?? "your account") : email.trim().toLowerCase());
    } else {
      setError(result.error);
      setErrorIsOurs(result.notReady);
    }
    setBusy(false);
  }

  if (sentTo) {
    return (
      <div className="mt-4 rounded-tile border border-azure/25 bg-azure/[0.07] p-4">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 size={16} strokeWidth={1.8} className="mt-px shrink-0 text-azure" />
          <div>
            <p className="text-[13px] text-snow">Enquiry received.</p>
            {/*
              Says who has it and where the answer goes. Says nothing about
              when — see the note at the top of this file.
            */}
            <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
              It is with ICEFALL, about {object.label}. The answer will go to{" "}
              <span className="text-snow/85">{sentTo}</span>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const tooShort = body.trim().length > 0 && body.trim().length < BODY_MIN;

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4">
      <p className="section-label">{heading}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{intro}</p>

      {/* Honeypot: hidden from people, irresistible to the simpler bots. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="absolute h-0 w-0 overflow-hidden border-0 p-0 opacity-0"
      />

      <div className="mt-3 space-y-2.5">
        {/*
          SIGNED IN, WE ASK FOR NEITHER. The sender is derived from the session
          by `open_enquiry`, so asking would be asking for something already
          known — and a field somebody can answer differently from their account
          is a field that can be answered wrongly. Same rule as never asking what
          kind of user they are.
        */}
        {!signedIn && (
          <>
            <input
              type="text"
              autoComplete="name"
              placeholder="Your name (optional)"
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              aria-label="Your name"
              className="h-10 w-full rounded-tile border border-hairline bg-obsidian/50 px-3 text-[13px] text-snow outline-none placeholder:text-mist-dim focus:border-azure/50 disabled:opacity-60"
            />
            <input
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
              className="h-10 w-full rounded-tile border border-hairline bg-obsidian/50 px-3 text-[13px] text-snow outline-none placeholder:text-mist-dim focus:border-azure/50 disabled:opacity-60"
            />
          </>
        )}
        <div>
          <textarea
            rows={4}
            placeholder={`What would you like to know about ${object.label}?`}
            value={body}
            disabled={busy}
            aria-label="Your enquiry"
            aria-describedby="enquiry-count"
            onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
            className={cn(
              "w-full min-w-0 resize-y rounded-tile border bg-obsidian/50 px-3 py-2.5 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim disabled:opacity-60",
              tooShort ? "border-danger/60" : "border-hairline focus:border-azure/50",
            )}
          />
          {/* Counts against the same numbers the database enforces. */}
          <p id="enquiry-count" className="tnum mt-1 text-right text-[10.5px] text-mist-dim">
            {tooShort ? `${BODY_MIN - body.trim().length} more characters` : `${body.length} / ${BODY_MAX}`}
          </p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className={cn("mt-2 text-[11.5px] leading-relaxed", errorIsOurs ? "text-mist" : "text-danger")}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-tile bg-azure-cta text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" strokeWidth={2} /> : <MessageSquare size={14} strokeWidth={1.9} />}
        {busy ? "Sending" : "Send enquiry"}
      </button>
    </form>
  );
}
