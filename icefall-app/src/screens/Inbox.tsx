import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Send } from "lucide-react";
import { Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { useApp } from "@/state/AppState";
import { useGoalsWithProgress } from "@/tracking/training";
import { draftEnquiry, operatorById } from "@/services/operators";
import { enquiryGate, sendEnquiry, type EnquiryGate } from "@/enquiries/send";
import {
  READINESS_ATTACHMENT_CONSENT,
  READINESS_ATTACHMENT_NOTHING,
  buildReadinessAttachment,
} from "@/enquiries/readinessAttachment";
import {
  buildOperatorShare,
  operatorShareGate,
  revokeReadinessShare,
  sendEnquiryWithReadiness,
  type OperatorShareGate,
  type ShareRecipient,
} from "@/enquiries/operatorShare";
import {
  SHARE_WITHDRAWAL_LIMIT,
  VITALS_WITHHELD_NOTICE_TO_ATHLETE,
} from "@/enquiries/operatorDisclosurePolicy";
import { useCoachContext } from "@/coach/context";

/**
 * Enquiries to expedition operators.
 *
 * THIS PARAGRAPH USED TO SAY "nothing leaves the device", and it is amended
 * rather than deleted, because the family's removal rule is *amend only the
 * sentence that became false*. Three things are true now and they are different
 * sizes:
 *
 *   THE MESSAGE reaches ICEFALL's desk for a signed-in athlete asking about a
 *   mountain the database knows (`enquiries/send.ts`). It does NOT reach the
 *   operator — ICEFALL answers it. `reachesIcefallDesk` says so before a word
 *   is typed, and that has not changed.
 *
 *   THE TRAINING FIGURES may additionally be disclosed to a NAMED expedition
 *   company, and that one really does leave the device for a third party. It
 *   happens only on a deliberate, per-share, previewed agreement recorded
 *   against a sentence fetched from the database, and only when a real company
 *   exists to receive it — `enquiries/operatorShare.ts`.
 *
 *   NOTHING BOOKS OR HOLDS ANYTHING, on any path, and no screen here may imply
 *   otherwise. An athlete must never be left believing an operator has their
 *   dates.
 *
 * `NOT_SENT` below is still shown, unchanged, on the paths where nothing is
 * transmitted — which are still most of them.
 */

/**
 * Still TRUE, and still shown — on the paths where nothing is transmitted.
 *
 * Enquiries now reach ICEFALL's desk for a signed-in athlete enquiring about a
 * mountain the database knows. That did NOT make this sentence false
 * everywhere: signed out, or about a peak that does not resolve, the message
 * really does stay on the device. The contract's removal rule is *amend only
 * the sentence that became false* — so it comes down per path, decided by
 * `enquiryGate`, and not with a delete key.
 */
const NOT_SENT =
  "Held on this device. ICEFALL has no operator network connected yet, so this message has not been transmitted and no reply will arrive. Contact the operator directly to book anything.";

/**
 * What a real send actually does, in the family's locked wording.
 *
 * Three facts are load-bearing and none may be compressed away: WHO has it
 * (ICEFALL), who does NOT (the operator — this matters most here, because the
 * flow looks exactly like messaging a company), and WHERE the answer arrives.
 *
 * No response time, ever. Nothing measures one.
 */
function reachesIcefallDesk(email: string): string {
  return `This goes to ICEFALL's desk, not to the operator. ICEFALL answers it, and the reply will go to ${email}. Nothing here books or holds anything.`;
}

/**
 * Only the compose flow survives here.
 *
 * The enquiry LIST and the enquiry THREAD were replaced by src/screens/chat —
 * an athlete now has one place for everything anyone said to them, rather than
 * an Enquiries screen for operators and a Messages screen for everyone else.
 * Old /inbox and /inbox/:id links redirect there; this compose screen is still
 * reached from operator cards.
 */

export function ComposeEnquiry() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { startEnquiry } = useApp();
  const goals = useGoalsWithProgress();

  const operator = operatorById(params.get("operator") ?? "");
  const peakName = params.get("peak") ?? "";
  const elevationM = Number(params.get("elevation")) || 0;
  const goalId = params.get("goal") ?? undefined;
  const goal = goalId ? goals.find((g) => g.id === goalId) : undefined;

  const [body, setBody] = useState(() =>
    draftEnquiry({
      peakName,
      elevationM,
      targetDate: goal?.targetDate,
      preparation: goal?.preparation,
    }),
  );

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [gate, setGate] = useState<EnquiryGate>({ state: "checking" });

  /*
   * THE TRAINING FIGURES THE ATHLETE MAY CHOOSE TO SEND — Phase 2, step 3.
   *
   * Built here so the text is fixed before anybody is asked about it, and so
   * the button can tell whether it has already been added.
   */
  const coachCtx = useCoachContext();
  const attachment = useMemo(() => buildReadinessAttachment(coachCtx), [coachCtx]);
  const alreadyAttached = attachment.text !== "" && body.includes(attachment.text);

  /*
   * ---- SENDING THE FIGURES TO A NAMED COMPANY, WITH CONSENT ---------------
   *
   * A DIFFERENT ACT FROM THE PASTE BUTTON ABOVE, and the difference is the
   * reason both exist rather than one replacing the other:
   *
   *   The paste button puts the block in the MESSAGE. The message goes to
   *   ICEFALL's desk. It is the athlete's own words by the time it sends, they
   *   can edit it, and — like anything they typed — it cannot be withdrawn.
   *
   *   This sends a RECORD to a named expedition company, under a permission
   *   recorded with the exact sentence that was on screen, which they can
   *   withdraw.
   *
   * THREE THINGS MUST ALL BE TRUE BEFORE ANYTHING IS DISCLOSED, and they are
   * three separate pieces of state rather than one because collapsing them is
   * how a default-off control becomes default-on:
   *
   *   1. `gate.state === "ready"` — a real company exists to receive it, and
   *      the consent sentence was fetched from the database.
   *   2. `recipient !== null` — the athlete chose WHICH company.
   *   3. `agreed === true` — they ticked, against that sentence, on this send.
   *
   * None of the three survives the screen. There is no stored preference, no
   * "remember this", and no path that infers consent from a previous enquiry.
   */
  const share = useMemo(() => buildOperatorShare(coachCtx), [coachCtx]);
  const [shareGate, setShareGate] = useState<OperatorShareGate>({ state: "checking" });
  const [recipient, setRecipient] = useState<ShareRecipient | null>(null);
  const [agreed, setAgreed] = useState(false);
  /** Set on a successful consented send. Holds the working withdrawal control. */
  const [sent, setSent] = useState<{ shareId: string; company: string; threadId: string } | null>(
    null,
  );
  const [withdrawn, setWithdrawn] = useState<{ seenByCompany: boolean } | null>(null);
  const [withdrawFailed, setWithdrawFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    // Only asked when there is something to disclose. A gate resolved for an
    // athlete with no recorded sessions would light up a control with an empty
    // preview behind it.
    if (share === null) return;
    void operatorShareGate(peakName).then((g) => {
      if (!alive) return;
      setShareGate(g);
      // ONE recipient is pre-SELECTED, never pre-CONSENTED. Choosing among one
      // option is not a decision; ticking the box still is, and `agreed` stays
      // false either way.
      if (g.state === "ready" && g.recipients.length === 1) setRecipient(g.recipients[0]);
    });
    return () => {
      alive = false;
    };
  }, [peakName, share]);

  // Resolved before the screen makes any claim about what Send does. Runs on
  // the peak name because the gate is per-enquiry, not per-session: an unknown
  // peak stops this message even for a signed-in athlete.
  useEffect(() => {
    let alive = true;
    void enquiryGate(peakName).then((g) => {
      if (alive) setGate(g);
    });
    return () => {
      alive = false;
    };
  }, [peakName]);

  if (!operator || !peakName) return <Navigate to="/messages" replace />;

  /*
   * ---- AFTER A CONSENTED DISCLOSURE --------------------------------------
   *
   * The screen stays, and it stays for one reason: the sentence the athlete
   * just agreed to says "I can stop it being passed on". A promise of
   * withdrawal made on a screen that then navigates away, leaving no control
   * anywhere, is a promise the app does not keep. So the control is here, it is
   * real, and it calls `readiness_share_revoke`.
   *
   * WHAT IT SAYS AFTERWARDS DEPENDS ON A FACT THE SERVER KNOWS AND THE APP DOES
   * NOT: whether ICEFALL had already handed the enquiry to the company.
   * `seen_by_company` carries it back, and the two outcomes get two different
   * sentences rather than one hedged one. Rule 2 — those are different states.
   */
  if (sent !== null) {
    return (
      <Screen>
        <ScreenHeader title="Sent" subtitle={`${sent.company} · ${peakName}`} back="/inbox" />
        <Stagger>
          <Rise className="pt-4">
            <p className="text-[13px] leading-relaxed text-mist">
              Your enquiry is with ICEFALL&rsquo;s desk, and your training figures are recorded as
              shared with {sent.company}. ICEFALL passes the enquiry on; until it does, the company
              has seen nothing.
            </p>
          </Rise>

          <Rise className="pt-5 border-t border-hairline">
            {withdrawn === null ? (
              <>
                <p className="text-[12px] leading-relaxed text-mist">{SHARE_WITHDRAWAL_LIMIT}</p>
                <button
                  type="button"
                  onClick={() => {
                    setWithdrawFailed(false);
                    void revokeReadinessShare(sent.shareId).then((r) => {
                      if (r.ok) setWithdrawn({ seenByCompany: r.seenByCompany });
                      else setWithdrawFailed(true);
                    });
                  }}
                  className="mt-3 w-full rounded-full border border-hairline-strong px-4 py-2.5 text-[13px] text-mist transition-colors hover:border-azure/45 hover:text-azure"
                >
                  Withdraw my training figures
                </button>
                {withdrawFailed && (
                  <p className="mt-2.5 text-[12px] leading-relaxed text-alert">
                    That could not be withdrawn just now, and nothing has changed — your figures are
                    still shared. Try again when you have signal.
                  </p>
                )}
              </>
            ) : (
              <p className="text-[12px] leading-relaxed text-mist">
                {withdrawn.seenByCompany
                  ? `Withdrawn. ${sent.company} will not see your figures again, but ICEFALL had already passed the enquiry to them — if they read it, that cannot be undone.`
                  : `Withdrawn before ICEFALL passed anything on, so ${sent.company} never saw your figures.`}
              </p>
            )}
          </Rise>

          <Rise className="pt-5">
            <Button className="w-full" onClick={() => navigate(`/inbox/${sent.threadId}`, { replace: true })}>
              Open the thread
            </Button>
          </Rise>
        </Stagger>
      </Screen>
    );
  }

  async function send() {
    if (!operator || !body.trim() || busy) return;
    setBusy(true);
    setFailure(null);

    // The thread is written locally either way: it is the athlete's own copy of
    // what they wrote, and losing it because a network call failed would be the
    // worst of both worlds. What the REAL send decides is what the app is then
    // allowed to say about it.
    const id = startEnquiry(
      {
        operatorId: operator.id,
        operatorName: operator.name,
        peakName,
        elevationM,
        goalId,
      },
      body.trim(),
    );

    /*
     * TWO SEND PATHS, CHOSEN BY WHETHER A DISCLOSURE WAS CONSENTED TO — not by
     * a flag inside one path. `sendEnquiryWithReadiness` writes the enquiry,
     * the consent decision and the disclosure in ONE database statement, so
     * there is no window in which one exists without the others.
     *
     * The conjunction is spelled out rather than hoisted into a `canShare`
     * boolean higher up. This is the line that decides whether personal data
     * leaves the device, and it should be readable here, in full, by somebody
     * who has not read the rest of the file.
     */
    const disclosing =
      share !== null && shareGate.state === "ready" && recipient !== null && agreed;

    if (disclosing && recipient !== null && share !== null) {
      const result = await sendEnquiryWithReadiness({
        body: body.trim(),
        peakName,
        originScreen: "inbox_new",
        recipient,
        share,
      });

      if (!result.ok) {
        setFailure(result.reason);
        setBusy(false);
        return;
      }

      /*
       * NOT NAVIGATED AWAY. The one other send path leaves for the thread, and
       * that is right when nothing about the athlete was disclosed. Here it
       * would be the last time they ever saw the withdrawal control, on the
       * screen where they agreed to the sentence that promises it.
       */
      setSent({ shareId: result.shareId, company: recipient.companyName, threadId: id });
      setBusy(false);
      return;
    }

    if (gate.state === "ready") {
      const result = await sendEnquiry({
        body: body.trim(),
        peakName,
        originScreen: "inbox_new",
      });

      if (!result.ok) {
        // NOT navigated away, and nothing claims to have been sent. The draft
        // is already saved above, so nothing is lost — but the screen must not
        // move on as though this had worked.
        setFailure(result.reason);
        setBusy(false);
        return;
      }
    }

    navigate(`/inbox/${id}`, { replace: true });
  }

  return (
    <Screen>
      <ScreenHeader title="New enquiry" subtitle={`${operator.name} · ${peakName}`} back="/inbox" />

      <Stagger>
        <Rise className="pt-4">
          {/* One of two sentences, chosen by what this enquiry can actually do
              — never both, and never the wrong one while the gate resolves. */}
          {gate.state === "ready" ? (
            <Disclaimer>{reachesIcefallDesk(gate.email)}</Disclaimer>
          ) : gate.state === "local-only" ? (
            <Disclaimer>{NOT_SENT}</Disclaimer>
          ) : null}
        </Rise>

        <Rise className="pt-5">
          <SectionLabel>Your message</SectionLabel>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            className="mt-3 w-full resize-none rounded-card border border-hairline bg-graphite p-4 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
          />
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            The draft asks the questions worth asking before you commit money — ratio, inclusions,
            experience expected, and the evacuation plan. Edit it freely.
          </p>
        </Rise>

        {/* ---- Attaching readiness ----------------------------------------
            CONSENT IS THE PRESS, AND THE PROOF IS THAT THE TEXT IS THERE.

            This is the athlete's own training record leaving the device for a
            commercial desk, so the roadmap's "attach readiness with consent"
            is built as a deliberate act with a visible result rather than a
            tick box and a promise. Pressing it writes the block INTO the
            message above, where it can be read, edited and deleted like any
            other sentence they typed — so what they approve and what is sent
            are the same characters, and there is no second code path that
            could send something else.

            There is no toggle off, because there is nothing to toggle: once
            it is in the message it is their text. Deleting it is deleting it.

            WHAT IT NEVER CARRIES is decided in `@/enquiries/readinessAttachment`
            and is the more important half — nothing medical, no readiness
            score, no address. */}
        <Rise className="pt-5">
          <SectionLabel>Your training figures</SectionLabel>
          {attachment.text === "" ? (
            <p className="mt-3 text-[12px] leading-relaxed text-mist">
              {READINESS_ATTACHMENT_NOTHING}
            </p>
          ) : (
            <>
              <p className="mt-3 text-[12px] leading-relaxed text-mist">
                {READINESS_ATTACHMENT_CONSENT}
              </p>
              <button
                type="button"
                disabled={alreadyAttached}
                onClick={() => setBody((b) => `${b.replace(/\s+$/, "")}\n${attachment.text}`)}
                className="mt-3 w-full rounded-full border border-azure/45 px-4 py-2.5 text-[13px] text-azure transition-colors hover:bg-azure/10 disabled:border-hairline disabled:text-mist-dim disabled:hover:bg-transparent"
              >
                {alreadyAttached
                  ? "Added to your message above"
                  : `Add my training figures (${attachment.measuredLines} recorded, ${attachment.reportedLines} self-reported)`}
              </button>
              {alreadyAttached && (
                <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
                  It is part of your message now — edit or delete it up there like anything else you
                  wrote.
                </p>
              )}
            </>
          )}
        </Rise>

        {/* ---- Sending the figures to a named company, with consent -------
            THE ATHLETE READS THE ACTUAL CHARACTERS, NOT A DESCRIPTION OF THEM.

            `share.text` below is the same string passed to
            `open_enquiry_with_readiness` and the same string stored in
            `readiness_shares.disclosed_text`. There is no second builder and no
            re-derivation at send time, so what is previewed and what is
            disclosed cannot drift apart. A consent screen that paraphrases what
            it is about to send is not consent — `readinessAttachment.ts` settled
            that for the paste control and it is the same rule here.

            NOTHING IS RENDERED WITHOUT A RECIPIENT. Rule 3: an enquiry about a
            mountain no company sells through ICEFALL carries no company at all,
            so a disclosure attached to one could never reach an operator. The
            control is absent, not disabled — one flat sentence says why. */}
        {share !== null && shareGate.state !== "checking" && (
          <Rise className="pt-5">
            <SectionLabel>Sending these figures to the company</SectionLabel>

            {shareGate.state === "no-recipient" ? (
              <p className="mt-3 text-[12px] leading-relaxed text-mist">{shareGate.detail}</p>
            ) : (
              <>
                {/* WHICH COMPANY. Rendered as a choice even when there is one,
                    so the name is on screen beside the tick rather than
                    remembered from a heading. */}
                <div className="mt-3">
                  {shareGate.recipients.map((r) => {
                    const chosen = recipient?.productId === r.productId;
                    return (
                      <button
                        key={r.productId}
                        type="button"
                        onClick={() => {
                          setRecipient(r);
                          // CHANGING THE RECIPIENT CLEARS THE AGREEMENT. A tick
                          // is consent to disclose to ONE named business; it does
                          // not travel to the next one down the list.
                          setAgreed(false);
                        }}
                        className={cn(
                          "flex w-full items-start gap-3 border-t border-hairline py-3 text-left",
                          chosen ? "text-snow" : "text-mist",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-[3px] size-[15px] shrink-0 rounded-full border",
                            chosen ? "border-azure bg-azure/30" : "border-hairline-strong",
                          )}
                        />
                        <span className="min-w-0 flex-1 text-[13px] leading-relaxed">
                          {r.companyName}
                          <span className="block text-[11px] text-mist-dim">{r.productName}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-4 text-[11px] uppercase tracking-wide text-mist-dim">
                  Exactly what they would receive
                </p>
                <p className="mt-2 whitespace-pre-line border-l border-hairline pl-3 text-[12px] leading-relaxed text-mist">
                  {share.text}
                </p>

                <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                  {VITALS_WITHHELD_NOTICE_TO_ATHLETE}
                </p>

                {/* THE SENTENCE IS THE DATABASE'S, RENDERED VERBATIM.
                    `health/consent.ts` settles why it is not hardcoded here: the
                    decision is stamped with whichever version is in force at
                    write time, so an app printing its own copy could record
                    somebody's agreement against words they were never shown.
                    With no wording the gate returns `no-wording` and this whole
                    branch does not render — no sentence, no tick box. */}
                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={agreed}
                    disabled={recipient === null}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-[3px] size-[15px] shrink-0 accent-azure"
                  />
                  <span className="text-[12px] leading-relaxed text-mist">
                    {shareGate.wording}
                  </span>
                </label>

                <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                  {SHARE_WITHDRAWAL_LIMIT}
                </p>

                {alreadyAttached && (
                  <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                    You have also pasted these figures into the message above. That copy is part of
                    what you wrote and goes to ICEFALL&rsquo;s desk; it is not covered by this
                    permission and cannot be withdrawn. Delete it up there if you only meant to send
                    it once.
                  </p>
                )}
              </>
            )}
          </Rise>
        )}

        <Rise className="pt-5">
          <Button
            className="w-full"
            onClick={() => void send()}
            disabled={!body.trim() || busy || gate.state === "checking"}
          >
            <Send size={15} strokeWidth={1.8} />
            {/* The control is named for what it DOES on this path. It read
                "Save to enquiries" when nothing was ever sent, which was
                honest; it would be a lie in the other direction now. */}
            {busy ? "Sending…" : gate.state === "ready" ? "Send to ICEFALL" : "Save to enquiries"}
          </Button>

          {failure && (
            <p className="mt-3 text-[12px] leading-relaxed text-alert">
              {failure === "unreachable"
                ? "This could not be sent — there is no connection. Nothing has been transmitted. Your message is saved here; try again when you have signal."
                : failure === "signed-out"
                  ? "This could not be sent because you are signed out. Your message is saved on this device."
                  : failure === "unknown-object"
                    ? "This could not be sent: ICEFALL does not hold this peak as a destination, and an enquiry has to name one. Your message is saved on this device."
                    : "This could not be sent, and nothing was stored at ICEFALL's end. Your message is saved on this device."}
            </p>
          )}
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Thread                                                                     */
/* -------------------------------------------------------------------------- */
