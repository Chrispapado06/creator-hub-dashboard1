import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { permissionState, requestPermission, type NotificationState } from "@/lib/notifications";

/**
 * "Allow notifications" — GU-01's function half.
 *
 * FOUR STATES, AND NONE OF THEM OVERSTATES WHAT HAPPENS NEXT. Granting the
 * permission is real and persists; ICEFALL still cannot send anything, and the
 * card says so in the same breath rather than leaving the guide to discover it
 * by missing a booking.
 *
 * It disappears once granted rather than sitting there as a permanent "on"
 * switch, because a switch that reads "on" beside a silent app is the lie this
 * is trying not to tell. What replaces it is one line stating the true position.
 */
export function NotificationOptIn({ className }: { className?: string }) {
  const [state, setState] = useState<NotificationState>("default");
  const [asking, setAsking] = useState(false);

  useEffect(() => setState(permissionState()), []);

  /* Nothing to offer and nothing to explain — a browser with no Notification
     API is not a state the guide can act on, so it is not a card (§6h). */
  if (state === "unsupported") return null;

  if (state === "granted") {
    return (
      <div className={className}>
        <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-mist-dim">
          <Check size={13} strokeWidth={2.2} className="mt-[3px] shrink-0 text-summit" />
          Notifications are allowed. ICEFALL cannot send any yet — when it can, bookings and client
          messages will reach you here without you doing anything else.
        </p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={className}>
        <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-mist-dim">
          <BellOff size={13} strokeWidth={1.9} className="mt-[3px] shrink-0" />
          Notifications are blocked for this site. Your browser will not ask again — turn them back
          on in its settings for this page if you want them later.
        </p>
      </div>
    );
  }

  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <Bell size={16} strokeWidth={1.8} className="mt-px shrink-0 text-azure" />
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] text-snow">Get told about bookings and messages</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            A client booking a date or writing to you is the thing worth interrupting you for.
          </p>
          {/* The disclosure sits WITH the button, not under the fold. Asking for
              a permission we cannot yet use is only honest if the ask says so. */}
          <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
            ICEFALL cannot send notifications yet. Allowing it now means they work the day it can,
            without asking you again.
          </p>
          <Button
            size="sm"
            className="mt-3"
            disabled={asking}
            onClick={async () => {
              setAsking(true);
              setState(await requestPermission());
              setAsking(false);
            }}
          >
            {asking ? "Waiting for your browser…" : "Allow notifications"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
