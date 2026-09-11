import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";

import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { Group, ToggleRow } from "@/components/settings/kit";
import { SectionLabel } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import {
  MAX_NOTE_CHARS,
  NOTE_CATEGORIES,
  NOTE_CATEGORY_LABELS,
  useCoachNotes,
  type NoteCategory,
} from "@/coach/notes";
import { conversationTitle, useConversations } from "@/coach/conversations";

/**
 * WHAT THE COACH REMEMBERS — and the only reason it is allowed to remember
 * anything.
 *
 * A coach that keeps durable facts about somebody, feeds them into every
 * answer, and gives that person no way to see or remove them is a surveillance
 * feature wearing a coach's clothes. This screen is the other half of
 * `@/coach/notes`, not an optional companion to it: every note is listed with
 * its date and where it came from, every note has a delete, capture has an off
 * switch that genuinely stops capture, and the conversations themselves are
 * here to be reread or thrown away.
 *
 * WHAT IT SAYS OUT LOUD, BECAUSE ALL OF IT IS TRUE AND NONE OF IT IS OBVIOUS:
 *
 *   - the notes and the transcripts are on THIS DEVICE and nowhere else. There
 *     is no server column for either; the migration that would add one is an
 *     unapplied draft. So a new phone starts from nothing, and clearing site
 *     data clears this.
 *   - a note is SELF-REPORTED — a sentence the athlete typed, kept verbatim.
 *     Rule 5: measured beats self-reported, and self-reported stays labelled.
 *   - no model wrote any of it. The capture rules are plain code, which is why
 *     a note always reads as something the athlete actually said rather than a
 *     summary of them.
 *
 * NO BOXES. Flat rows, hairlines and spacing — the settings kit's own row
 * shapes. The one thing on this screen that could argue for a container is the
 * delete-everything control, and it does not get one either; it is a row with
 * danger ink and a confirm step.
 */
export default function CoachMemory() {
  const navigate = useNavigate();
  const { notes, capture, add, remove, clear, setCapture } = useCoachNotes();
  const conversations = useConversations();

  const [draft, setDraft] = useState("");
  const [category, setCategory] = useState<NoteCategory>("schedule");
  /* Two taps to erase everything, and the second one is on a DIFFERENT label
     so it cannot be hit by a double tap on the first. No modal: the owner's
     rule is no interruptions, and a destructive action can be honest inline. */
  const [confirmingWipe, setConfirmingWipe] = useState(false);

  const nothingKept = notes.length === 0 && conversations.conversations.length === 0;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader
          title="What I remember"
          subtitle="Kept on this device"
          back="/coach/chat"
          large
        />
      </div>

      <Stagger className="px-5">
        <Rise>
          <p className="text-[13px] leading-relaxed text-mist">
            Your coach keeps a few short notes so it does not ask you the same thing every week, and
            it keeps your conversations so closing the screen does not erase them. Both live on this
            phone — not on a server, not with ICEFALL, and not on any other device you sign in from.
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-mist">
            Every note below is a sentence you typed, kept word for word. Nothing here was written
            by the AI, and nothing here was measured — where a note disagrees with what your watch
            or your sessions recorded, the recording wins.
          </p>
        </Rise>

        <Group label="Remembering">
          <ToggleRow
            checked={capture}
            onChange={setCapture}
            title="Keep notes from what I say"
            detail="When this is off, nothing new is kept. Notes already here stay until you delete them."
          />
        </Group>

        <Group label={notes.length > 0 ? `Notes · ${notes.length}` : "Notes"}>
          {notes.length === 0 ? (
            <p className="py-3 text-[13px] text-mist">
              {capture
                ? "Nothing kept yet. Things like which days you train, what your coach should train around, or a change of date get noted as you mention them."
                : "Remembering is off, so nothing new is being kept."}
            </p>
          ) : (
            <div>
              {notes.map((n) => (
                <div
                  key={n.id}
                  className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-relaxed text-snow">{n.text}</p>
                    <p className="mt-1 text-[11.5px] text-mist">
                      {NOTE_CATEGORY_LABELS[n.category]} · Self-reported ·{" "}
                      {n.source === "captured" ? "from a message you sent" : "you added this"} ·{" "}
                      {new Date(n.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(n.id)}
                    aria-label={`Forget: ${n.text}`}
                    className="-mr-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-danger"
                  >
                    <Trash2 size={16} strokeWidth={1.7} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Adding one by hand. The capture rules are deliberately narrow — a
              rule that fires often fills the memory with noise — so the athlete
              needs a way to tell the coach something directly rather than
              phrasing a sentence until the regex catches it. */}
          <div className="mt-4">
            <SectionLabel>Tell the coach something</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {NOTE_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[12px] transition-colors",
                    c === category
                      ? "border-azure/60 text-azure"
                      : "border-hairline-strong text-mist hover:text-snow",
                  )}
                >
                  {NOTE_CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <form
              className="mt-2.5 flex items-center gap-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (add(draft, category)) setDraft("");
              }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_NOTE_CHARS))}
                placeholder="I train Tuesday, Thursday and Saturday"
                aria-label="A note for your coach"
                className="h-11 flex-1 rounded-full border border-hairline bg-elevated/40 px-4 text-[14px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
              />
              <button
                type="submit"
                disabled={draft.trim().length < 3}
                className="shrink-0 text-[14px] text-azure transition-opacity disabled:opacity-30"
              >
                Add
              </button>
            </form>
          </div>
        </Group>

        <Group
          label={
            conversations.conversations.length > 0
              ? `Conversations · ${conversations.conversations.length}`
              : "Conversations"
          }
        >
          {conversations.conversations.length === 0 ? (
            <p className="py-3 text-[13px] text-mist">
              Nothing yet. Conversations are kept here once you have had one.
            </p>
          ) : (
            <div>
              {conversations.conversations.map((c) => (
                <div
                  key={c.id}
                  className="-mx-5 flex items-start gap-3.5 border-t border-hairline px-5 py-3.5 first:border-t-0"
                >
                  <button
                    type="button"
                    onClick={() => {
                      conversations.open(c.id);
                      navigate("/coach/chat");
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[14px] text-snow">
                      {conversationTitle(c)}
                    </span>
                    <span className="mt-1 block text-[11.5px] text-mist">
                      {new Date(c.updatedAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                      })}{" "}
                      · {c.messages.length} {c.messages.length === 1 ? "message" : "messages"}
                      {c.id === conversations.currentId ? " · open now" : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => conversations.remove(c.id)}
                    aria-label={`Delete conversation: ${conversationTitle(c)}`}
                    className="-mr-2 mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.05] hover:text-danger"
                  >
                    <Trash2 size={16} strokeWidth={1.7} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Group>

        {!nothingKept && (
          <Group>
            <button
              type="button"
              onClick={() => {
                if (!confirmingWipe) {
                  setConfirmingWipe(true);
                  return;
                }
                clear();
                conversations.clear();
                setConfirmingWipe(false);
              }}
              className="-mx-5 w-full px-5 py-3.5 text-left text-[14px] text-danger transition-colors hover:bg-white/[0.03]"
            >
              {confirmingWipe
                ? "Tap again to delete every note and conversation"
                : "Forget everything"}
            </button>
            {confirmingWipe && (
              <button
                type="button"
                onClick={() => setConfirmingWipe(false)}
                className="-mx-5 w-full px-5 py-2 text-left text-[13px] text-mist"
              >
                Cancel
              </button>
            )}
            <p className="pt-2 text-[11.5px] leading-relaxed text-mist">
              This clears the coach's notes and every saved conversation on this device. It cannot
              be undone, and there is no copy anywhere else.
            </p>
          </Group>
        )}
      </Stagger>
    </Screen>
  );
}
