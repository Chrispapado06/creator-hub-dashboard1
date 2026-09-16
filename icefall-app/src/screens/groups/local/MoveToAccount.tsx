/**
 * The one-tap move: a group saved on this phone becomes a group on the account.
 *
 * Structure plan §2.2. One component, used in two places — the "Saved on this
 * phone" section of the Groups tab and the read-only summary — so there is one
 * confirm row, one set of sentences and one place a rule can change.
 *
 * WHAT IT DOES NOT DO: it never moves anything on its own (D4). Collapsed, it
 * is a button. Expanded, it shows the name, the door, the account the group
 * would be published under, and what stays behind, and then one button does it.
 *
 * THE ORDER MATTERS at the end: the server call, the group read back, and only
 * then `markExpeditionMoved`. `movedTo` is what redirects the old link, so it
 * may not be written on a request that might not have landed.
 */
import { useMemo, useState } from "react";
import { ChevronRight, Globe, Lock } from "lucide-react";

import { Sheet } from "@/components/ui/Sheet";
import { useMyProfile } from "@/auth/useMyProfile";
import {
  MAX_MOVED_NAME,
  MOVE_ACCOUNT_UNKNOWN,
  MOVE_DONE,
  MOVE_NO_SERVER,
  MOVE_SIGN_IN,
  MOVE_WHAT_STAYS,
  MOVE_WHAT_STAYS_FULL,
  moveCatalogueUnknown,
  moveDeviceGroup,
  moveNoRecordOfPeak,
  movePublishedUnder,
  planDeviceMove,
} from "@/groups/local/deviceMove";
import { useGroupDestinations } from "@/groups/mountains";
import type { Expedition } from "@/network/types";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * Where a move stands, for the caller.
 *
 * The section keeps the row on screen after a move so the person sees what
 * happened, rather than the row they just tapped disappearing under their
 * finger.
 */
export function MoveToAccount({
  expedition,
  onMoved,
}: {
  expedition: Expedition;
  onMoved?: (serverGroupId: string) => void;
}) {
  const { markExpeditionMoved } = useApp();
  const catalogue = useGroupDestinations();
  const profile = useMyProfile();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(() => expedition.peakName.trim().slice(0, MAX_MOVED_NAME));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [moved, setMoved] = useState<string | null>(null);
  const [explain, setExplain] = useState(false);

  const plan = useMemo(
    () => (catalogue.status === "loading" ? null : planDeviceMove(expedition, catalogue, name)),
    [expedition, catalogue, name],
  );

  /* The catalogue read is also the answer to "is there a server, and are you
     signed in", so each of its absences gets the sentence that is true for this
     group rather than one about a list of places. */
  const stopped: string | null =
    catalogue.status === "no-backend"
      ? MOVE_NO_SERVER
      : catalogue.status === "signed-out"
        ? MOVE_SIGN_IN
        : catalogue.status !== "ready" && catalogue.status !== "loading"
          ? moveCatalogueUnknown(expedition.peakName)
          : null;

  if (moved !== null) {
    return (
      <p className="pt-2 text-[11.5px] leading-relaxed text-mist">{MOVE_DONE}</p>
    );
  }

  if (catalogue.status === "loading") {
    return <p className="pt-2 text-[11.5px] text-mist-dim">Checking what ICEFALL has a record of…</p>;
  }

  if (stopped !== null) {
    return <p className="pt-2 text-[11.5px] leading-relaxed text-mist">{stopped}</p>;
  }

  const accountName =
    profile.status === "ready"
      ? profile.profile.displayName.trim() ||
        (profile.profile.username ? `@${profile.profile.username}` : "")
      : "";

  const blocked = plan?.status === "blocked" ? plan.message : null;
  const canMove = plan?.status === "ready" && accountName.length > 0 && !busy;

  async function move() {
    if (!plan || plan.status !== "ready") return;
    setBusy(true);
    setFailure(null);
    const outcome = await moveDeviceGroup(plan.fields);
    setBusy(false);
    if (!outcome.ok) {
      setFailure(outcome.message);
      return;
    }
    markExpeditionMoved(expedition.id, outcome.groupId, outcome.accountId);
    setMoved(outcome.groupId);
    onMoved?.(outcome.groupId);
  }

  if (!open) {
    return (
      <div className="pt-2">
        {plan?.status === "ready" && plan.matched === null && (
          <p className="pb-2 text-[11.5px] leading-relaxed text-mist">
            {moveNoRecordOfPeak(expedition.peakName)}
          </p>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-11 rounded-pill border border-hairline px-4 text-[12.5px] text-snow transition-colors hover:border-hairline-strong"
        >
          Move to your account
        </button>
      </div>
    );
  }

  return (
    <div className="pt-3">
      <label className="block">
        <span className="section-label">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_MOVED_NAME}
          placeholder="What the party is calling itself"
          className="mt-2 h-11 w-full rounded-tile border border-hairline bg-elevated/40 px-3 text-[13px] text-snow placeholder:text-mist-dim focus:border-azure/50 focus:outline-none"
        />
      </label>

      {plan?.status === "ready" && (
        <p className="mt-3 flex items-center gap-2 text-[11.5px] text-mist">
          {plan.fields.visibility === "private" ? (
            <Lock size={13} strokeWidth={1.7} aria-hidden className="shrink-0 text-mist-dim" />
          ) : (
            <Globe size={13} strokeWidth={1.7} aria-hidden className="shrink-0 text-mist-dim" />
          )}
          {plan.fields.visibility === "private"
            ? "Private, so people ask and you decide."
            : "Open, so anyone signed in can join."}
        </p>
      )}

      {plan?.status === "ready" && plan.matched === null && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
          {moveNoRecordOfPeak(expedition.peakName)}
        </p>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
        {accountName.length > 0 ? movePublishedUnder(accountName) : MOVE_ACCOUNT_UNKNOWN}
      </p>

      <button
        type="button"
        onClick={() => setExplain(true)}
        className="mt-2 flex min-h-11 w-full items-center gap-2 text-left text-[11.5px] leading-relaxed text-mist"
        aria-label="More about this"
      >
        <span className="min-w-0 flex-1">{MOVE_WHAT_STAYS}</span>
        <ChevronRight size={14} strokeWidth={1.7} aria-hidden className="shrink-0 text-mist-dim" />
      </button>

      {blocked !== null && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-danger">{blocked}</p>
      )}
      {failure !== null && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-danger">{failure}</p>
      )}

      <div className="mt-3 flex items-center gap-2.5">
        <button
          type="button"
          disabled={!canMove}
          onClick={() => void move()}
          className={cn(
            "h-11 rounded-pill px-5 text-[13px] font-medium transition-colors",
            canMove
              ? "bg-azure text-obsidian hover:bg-azure-bright"
              : "border border-hairline text-mist-dim",
          )}
        >
          {busy ? "Moving…" : "Move"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-11 px-2 text-[12.5px] text-mist transition-colors hover:text-snow"
        >
          Not now
        </button>
      </div>

      {explain && (
        <Sheet title="What moves, and what stays" onClose={() => setExplain(false)}>
          <p className="text-[13px] leading-relaxed text-mist">{MOVE_WHAT_STAYS_FULL}</p>
        </Sheet>
      )}
    </div>
  );
}
