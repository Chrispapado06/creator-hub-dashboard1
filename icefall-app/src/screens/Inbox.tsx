import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Send } from "lucide-react";
import { Button, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { useApp } from "@/state/AppState";
import { useGoalsWithProgress } from "@/tracking/training";
import { draftEnquiry, operatorById } from "@/services/operators";

/**
 * Enquiries to expedition operators.
 *
 * Everything here is real except the destination: messages are composed, kept
 * and threaded exactly as they would be against a live operator network, but
 * ICEFALL has none connected, so nothing leaves the device. That's stated on
 * the compose screen before you write and on every thread after you send —
 * an athlete must never be left believing an operator has their dates.
 */

const NOT_SENT =
  "Held on this device. ICEFALL has no operator network connected yet, so this message has not been transmitted and no reply will arrive. Contact the operator directly to book anything.";

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

  if (!operator || !peakName) return <Navigate to="/messages" replace />;

  function send() {
    if (!operator || !body.trim()) return;
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
    navigate(`/inbox/${id}`, { replace: true });
  }

  return (
    <Screen>
      <ScreenHeader title="New enquiry" subtitle={`${operator.name} · ${peakName}`} back="/inbox" />

      <Stagger>
        <Rise className="pt-4">
          <Disclaimer>{NOT_SENT}</Disclaimer>
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
          <Button className="w-full" onClick={send} disabled={!body.trim()}>
            <Send size={15} strokeWidth={1.8} />
            Save to enquiries
          </Button>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Thread                                                                     */
/* -------------------------------------------------------------------------- */
