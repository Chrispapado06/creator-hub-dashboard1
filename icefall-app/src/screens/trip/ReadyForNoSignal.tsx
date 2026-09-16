import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Info } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { SectionLabel } from "@/components/ui/primitives";
import {
  HOME_SCREEN_PROMPT_BODY,
  HOME_SCREEN_PROMPT_TITLE,
  IOS_CLEARING_SENTENCE,
  availableSentence,
  shouldShowHomeScreenPrompt,
  usedSentence,
} from "@/device/storageStatus";
import { IOS_INSTALL_STEPS } from "@/lib/install";
import { cn } from "@/lib/utils";
import { KEPT_ON_THIS_PHONE_LINE, type ReadyAction, type ReadyItem } from "@/mountain/readyModel";
import { useReadyForNoSignal } from "@/mountain/useReadyForNoSignal";

/**
 * READY FOR NO SIGNAL — everything that has to be done while there is still a
 * signal, on one screen, each unfinished thing with the button that finishes it
 * (brief M8, plan §7).
 *
 * THE RULE THIS SCREEN IS BUILT ON. A tick box is a promise that the thing can
 * be done. Where this platform cannot do it — no offline map pack exists to
 * download, a desktop browser has no Home Screen, a browser with no way to be
 * asked to keep data — the line says so and is not counted. See `readyModel.ts`
 * for which lines those are and why. Nothing here is ticked on our say-so: the
 * ticks come from the browser's own answers and from measured, stored bytes.
 *
 * It needs no signal to draw. A download needs one, and says so rather than
 * spinning.
 *
 * No boxes: flat rows, hairlines, spacing.
 */

const FIX_BUTTON =
  "min-h-11 shrink-0 self-center rounded-full border border-hairline px-4 text-[13px] text-snow transition-colors hover:bg-white/[0.05] disabled:opacity-50";

function Mark({ state }: { state: ReadyItem["state"] }) {
  if (state === "ready") {
    return (
      <span
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-azure/15 text-azure"
        aria-label="Done"
      >
        <Check size={13} strokeWidth={2.2} />
      </span>
    );
  }
  if (state === "info") {
    return (
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center text-mist-dim" aria-hidden>
        <Info size={14} strokeWidth={1.6} />
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-mist-dim/60"
      aria-label="Still to do"
    />
  );
}

function Row({
  item,
  busy,
  onAction,
}: {
  item: ReadyItem;
  busy: boolean;
  onAction: (action: ReadyAction) => void;
}) {
  return (
    <div className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-4 first:border-t-0">
      <Mark state={item.state} />
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] text-snow">{item.title}</span>
        <span
          className={cn(
            "mt-1 block text-[11.5px] leading-relaxed",
            item.state === "info" ? "text-mist-dim" : "text-mist",
          )}
        >
          {item.detail}
        </span>
      </span>
      {item.value && (
        <span className="tnum shrink-0 self-center text-[12px] text-mist">{item.value}</span>
      )}
      {item.fix?.kind === "link" && (
        <Link to={item.fix.to} className={cn(FIX_BUTTON, "grid place-items-center")}>
          {item.fix.label}
        </Link>
      )}
      {item.fix?.kind === "action" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => item.fix?.kind === "action" && onAction(item.fix.action)}
          className={FIX_BUTTON}
        >
          {busy ? "…" : item.fix.label}
        </button>
      )}
    </div>
  );
}

export default function ReadyForNoSignal() {
  const ready = useReadyForNoSignal({ auto: true });
  const { items, summary, trip, pack, storage, install, confirmedOnline } = ready;
  const [showSteps, setShowSteps] = useState(false);
  const [asking, setAsking] = useState<ReadyAction | null>(null);

  async function run(action: ReadyAction) {
    if (action === "install-steps") {
      setShowSteps((v) => !v);
      return;
    }
    setAsking(action);
    try {
      if (action === "download") await pack.refresh();
      if (action === "persist") await storage.requestPersist();
      if (action === "install") await install.install();
      if (action === "location") ready.askLocation();
    } finally {
      setAsking(null);
    }
  }

  const figures = [usedSentence(storage), availableSentence(storage)].filter(Boolean).join(" ");

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="Ready for no signal"
          subtitle={trip ? trip.name : "No trip open"}
          back="/trip"
        />
      </div>

      <Stagger className="px-5 pb-6">
        <Rise>
          <p className="tnum text-[13px] text-snow">{summary.headline}</p>
          {!confirmedOnline && (
            <p className="mt-1 text-[11.5px] leading-relaxed text-mist">
              No signal confirmed. Everything already on this phone still works; a download waits
              until there is one.
            </p>
          )}
        </Rise>

        <Rise className="pt-6">
          {items.map((item) => (
            <Row
              key={item.key}
              item={item}
              busy={asking !== null && item.fix?.kind === "action" && item.fix.action === asking}
              onAction={run}
            />
          ))}
        </Rise>

        {showSteps && (
          <Rise className="pt-6">
            <SectionLabel>Adding it by hand</SectionLabel>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{IOS_INSTALL_STEPS}</p>
          </Rise>
        )}

        {shouldShowHomeScreenPrompt(storage) && (
          <Rise className="pt-7">
            <p className="text-[14px] text-snow">{HOME_SCREEN_PROMPT_TITLE}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{HOME_SCREEN_PROMPT_BODY}</p>
            {install.mode === "prompt" ? (
              <button
                type="button"
                onClick={() => void run("install")}
                className={cn(FIX_BUTTON, "mt-3")}
              >
                Add to Home Screen
              </button>
            ) : install.mode === "manual-ios" ? (
              <p className="mt-2 text-[12px] leading-relaxed text-mist">{IOS_INSTALL_STEPS}</p>
            ) : null}
          </Rise>
        )}

        <Rise className="pt-7">
          <SectionLabel>What this phone is holding</SectionLabel>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
            {figures || "This browser gives no figure for the space ICEFALL is using."}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist">{IOS_CLEARING_SENTENCE}</p>
          <p className="mt-2 text-[12px] leading-relaxed text-mist">{KEPT_ON_THIS_PHONE_LINE}</p>
          {pack.storageSentence && (
            <p className="mt-2 text-[12px] leading-relaxed text-mist">{pack.storageSentence}</p>
          )}
        </Rise>
      </Stagger>
    </Screen>
  );
}
