/**
 * A GROUP SAVED ON THIS PHONE, READ ONLY.
 *
 * Structure plan §2.3 and §5.2. It replaces the old `Workspace` at
 * `/social/groups/expedition-…`, and the difference that matters is that it
 * cannot be written to.
 *
 * ── WHY READ-ONLY IS THE HONEST SCREEN ───────────────────────────────────────
 *
 * The workspace let somebody plan sessions, tick a shared kit list, invite
 * nobody and write messages that reached nobody, on a record only their own
 * phone can open. One group model is the decision (D1): the real place to plan
 * with other people is a group on the account, and the way there is the Move
 * above. So everything already written is kept and shown, and nothing new is
 * taken here.
 *
 * ── WHAT IT SHOWS ────────────────────────────────────────────────────────────
 *
 * The mountain, the window, what was written about the group, the notes, the
 * sessions and the log — all of it the phone's, none of it going anywhere. The
 * two actions are the move, and deleting it from this phone.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarRange, Smartphone } from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { SectionLabel } from "@/components/ui/primitives";
import { GroupCover } from "@/screens/explore/groupChrome";
import { useGroupPeak } from "@/groups/local/useGroupPeak";
import { formatWindow, parseDay, RSVP_LABELS } from "@/network/groups";
import type { Expedition } from "@/network/types";
import { useApp } from "@/state/AppState";
import { fmtElevation } from "@/lib/format";
import { MoveToAccount } from "./MoveToAccount";

/* Each of these is one sentence, and each is true of this screen as built. */
const READ_ONLY_LINE = "This group is kept as it was written, and nothing new can be added to it.";
const NOTES_LINE = "Your notes stay on this phone, whether or not the group moves.";
const LOG_LINE = "These were written here and reached nobody.";
const DELETE_WARNING =
  "Everything written on this group goes with it, and it cannot be undone.";

function fmtDay(iso: string): string {
  const day = parseDay(iso);
  return day
    ? day.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : iso;
}

export function DeviceGroupSummary({ expedition }: { expedition: Expedition }) {
  const { groupNotes, groupSessions, groupMessages, deleteExpedition } = useApp();
  const peak = useGroupPeak(expedition);
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);

  const sessions = useMemo(
    () =>
      groupSessions
        .filter((s) => s.groupId === expedition.id)
        .sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
    [groupSessions, expedition.id],
  );
  const messages = useMemo(
    () =>
      groupMessages
        .filter((m) => m.groupId === expedition.id)
        .sort((a, b) => a.at.localeCompare(b.at)),
    [groupMessages, expedition.id],
  );
  const note = groupNotes[expedition.id]?.trim() ?? "";

  const elevation =
    typeof expedition.elevationM === "number"
      ? `${fmtElevation(expedition.elevationM)} m`
      : "Elevation not recorded";

  function remove() {
    deleteExpedition(expedition.id);
    navigate("/social?tab=groups", { replace: true });
  }

  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-24">
        <Rise>
          <GroupCover
            name={expedition.peakName}
            peak={{
              name: peak.name,
              elevationM: peak.elevationM,
              lat: peak.lat,
              lon: peak.lon,
              photo: peak.photo,
              wikipedia: peak.wikipedia,
              curatedId: peak.curatedId,
            }}
            meta={elevation}
            backTo="/social?tab=groups"
          />
        </Rise>

        <Rise className="pt-5">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-mist">
            <span className="flex items-center gap-1.5">
              <Smartphone size={13} strokeWidth={1.7} aria-hidden className="text-mist-dim" />
              On this phone
            </span>
            <span className="tnum flex items-center gap-1.5">
              <CalendarRange size={13} strokeWidth={1.7} aria-hidden className="text-mist-dim" />
              {formatWindow(expedition.window)}
            </span>
          </p>
          <p className="mt-2 max-w-[320px] text-[11.5px] leading-relaxed text-mist-dim">
            {READ_ONLY_LINE}
          </p>
        </Rise>

        {/* ---- Moving it -------------------------------------------------- */}
        <Rise className="pt-6">
          <MoveToAccount expedition={expedition} />
        </Rise>

        {/* ---- What was written about it ---------------------------------- */}
        <Rise className="pt-8">
          <SectionLabel>About</SectionLabel>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            {expedition.description?.trim() ||
              "Nothing was written about this group when it was made."}
          </p>
        </Rise>

        {/* ---- Notes ------------------------------------------------------ */}
        <Rise className="pt-8">
          <SectionLabel>Notes</SectionLabel>
          <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">{NOTES_LINE}</p>
          <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
            {note || "Nothing was written here."}
          </p>
        </Rise>

        {/* ---- Sessions --------------------------------------------------- */}
        <Rise className="pt-8">
          <SectionLabel>Sessions</SectionLabel>
          {sessions.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-mist">No session was planned here.</p>
          ) : (
            <ul className="mt-2">
              {sessions.map((session) => {
                const rsvp = session.rsvps ? Object.values(session.rsvps)[0] : undefined;
                return (
                  <li key={session.id} className="border-b border-hairline py-3 last:border-b-0">
                    <p className="text-[13px] text-snow">{session.title}</p>
                    <p className="tnum mt-0.5 text-[11.5px] text-mist">
                      {fmtDay(session.dayKey)}
                      {session.time ? ` · ${session.time}` : ""}
                      {session.place ? ` · ${session.place}` : ""}
                    </p>
                    {rsvp && (
                      <p className="mt-0.5 text-[11.5px] text-mist-dim">{RSVP_LABELS[rsvp]}</p>
                    )}
                    {session.note && (
                      <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-mist">
                        {session.note}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Rise>

        {/* ---- The log ---------------------------------------------------- */}
        <Rise className="pt-8">
          <SectionLabel>Log</SectionLabel>
          <p className="mt-2 text-[11.5px] leading-relaxed text-mist-dim">{LOG_LINE}</p>
          {messages.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-mist">Nothing was written here.</p>
          ) : (
            <ul className="mt-2">
              {messages.map((message) => (
                <li key={message.id} className="border-b border-hairline py-3 last:border-b-0">
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-mist">
                    {message.body}
                  </p>
                  <p className="tnum mt-1 text-[11px] text-mist-dim">
                    {new Date(message.at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Rise>

        {/* ---- Deleting it ------------------------------------------------ */}
        <Rise className="pt-10">
          {confirming ? (
            <>
              <p className="text-[13px] text-snow">Delete this group from this phone?</p>
              <p className="mt-1.5 max-w-[320px] text-[11.5px] leading-relaxed text-mist">
                {DELETE_WARNING}
              </p>
              <div className="mt-3 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={remove}
                  className="h-11 rounded-pill border border-danger/60 px-5 text-[13px] text-danger transition-colors hover:border-danger"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-11 px-2 text-[12.5px] text-mist transition-colors hover:text-snow"
                >
                  Keep it
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="h-11 text-[12.5px] text-mist transition-colors hover:text-snow"
            >
              Delete from this phone
            </button>
          )}
        </Rise>
      </Stagger>
    </Screen>
  );
}
