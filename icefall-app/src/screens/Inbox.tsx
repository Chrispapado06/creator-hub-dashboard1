import { useEffect, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Send } from "lucide-react";
import { Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { useApp } from "@/state/AppState";
import { useGoalsWithProgress } from "@/tracking/training";
import { draftEnquiry, operatorById } from "@/services/operators";
import { enquiryGate, sendEnquiry, type EnquiryGate } from "@/enquiries/send";

/**
 * Enquiries to expedition operators.
 *
 * Everything here is real except the destination: messages are composed, kept
 * and threaded exactly as they would be against a live operator network, but
 * ICEFALL has none connected, so nothing leaves the device. That's stated on
 * the compose screen before you write and on every thread after you send —
 * an athlete must never be left believing an operator has their dates.
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
            {busy
              ? "Sending…"
              : gate.state === "ready"
                ? "Send to ICEFALL"
                : "Save to enquiries"}
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
