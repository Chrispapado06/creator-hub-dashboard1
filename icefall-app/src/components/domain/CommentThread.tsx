import { useState } from "react";
import { CornerDownRight, Flag, MoreHorizontal, Send, Trash2 } from "lucide-react";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { fmtDate } from "@/lib/format";
import {
  COMMENTS_LOCAL_NOTICE, ME, REPORT_QUEUED_NOTICE, addComment, blockAuthor, queueReport,
  removeComment, toggleRespect, useComments, type Comment,
} from "@/social/comments";
import { cn } from "@/lib/utils";

/**
 * A comment thread: write, reply once deep, respect, delete your own, report
 * and block anyone else's.
 *
 * The moderation controls are present from the first commit rather than
 * "added later when there are users", because the day there are users is
 * exactly the day it is too late to design them calmly.
 */
export function CommentThread({
  subjectId,
  me,
}: {
  subjectId: string;
  me: { name: string; avatar?: string };
}) {
  const all = useComments(subjectId);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [menuFor, setMenuFor] = useState<Comment | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const roots = all.filter((c) => !c.parentId);
  const repliesOf = (id: string) => all.filter((c) => c.parentId === id);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    addComment({
      subjectId,
      parentId: replyTo?.id,
      authorId: ME,
      authorName: me.name,
      authorAvatar: me.avatar,
      body,
    });
    setDraft("");
    setReplyTo(null);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="section-label text-mist">Comments</p>
        {all.length > 0 && <span className="tnum text-[11.5px] text-mist-dim">{all.length}</span>}
      </div>

      {all.length === 0 ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-dim">
          No comments yet. Ask about the conditions, the route, or the day.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {roots.map((c) => (
            <div key={c.id}>
              <CommentRow
                comment={c}
                onReply={() => setReplyTo(c)}
                onMenu={() => setMenuFor(c)}
              />
              {repliesOf(c.id).map((r) => (
                <div key={r.id} className="mt-2 flex gap-2 pl-6">
                  <CornerDownRight
                    size={13}
                    strokeWidth={1.6}
                    className="mt-3 shrink-0 text-mist-dim"
                  />
                  <div className="min-w-0 flex-1">
                    <CommentRow comment={r} onMenu={() => setMenuFor(r)} />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ---- Composer ---------------------------------------------------- */}
      <div className="mt-3.5">
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-tile border border-hairline bg-slate/40 px-3 py-2">
            <CornerDownRight size={12} strokeWidth={1.7} className="shrink-0 text-azure" />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-mist">
              Replying to {replyTo.authorName}
            </span>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="shrink-0 text-[11px] text-mist-dim hover:text-snow"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="Add a comment…"
            rows={1}
            className="min-h-[44px] flex-1 resize-none rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[13.5px] leading-snug text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Post comment"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-azure text-obsidian transition-colors hover:bg-azure-bright disabled:opacity-35"
          >
            <Send size={16} strokeWidth={1.9} />
          </button>
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-mist-dim">
          {COMMENTS_LOCAL_NOTICE}
        </p>
      </div>

      {toast && (
        <p className="mt-2 rounded-tile border border-hairline bg-slate/50 px-3 py-2 text-[11.5px] leading-relaxed text-mist">
          {toast}
        </p>
      )}

      {/* ---- Per-comment controls ---------------------------------------- */}
      {menuFor && (
        <Sheet title={menuFor.authorName} onClose={() => setMenuFor(null)}>
          {menuFor.authorId === ME ? (
            <SheetRow
              icon={Trash2}
              title="Delete"
              detail="Removes this comment and any replies to it"
              onClick={() => {
                removeComment(menuFor.id);
                setMenuFor(null);
              }}
            />
          ) : (
            <>
              <SheetRow
                icon={Flag}
                title="Report"
                detail="Queued on this device — there is no moderation service yet"
                onClick={() => {
                  queueReport(menuFor.id, "comment");
                  setToast(REPORT_QUEUED_NOTICE);
                  setMenuFor(null);
                }}
              />
              <SheetRow
                icon={MoreHorizontal}
                title={`Block ${menuFor.authorName}`}
                detail="Hides everything they write, here and everywhere else"
                onClick={() => {
                  blockAuthor(menuFor.authorId);
                  setToast(`${menuFor.authorName} is blocked. Their comments are hidden.`);
                  setMenuFor(null);
                }}
              />
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

function CommentRow({
  comment,
  onReply,
  onMenu,
}: {
  comment: Comment;
  onReply?: () => void;
  onMenu: () => void;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-slate text-[11px] text-mist">
        {comment.authorAvatar ? (
          <img src={comment.authorAvatar} alt="" aria-hidden className="h-full w-full object-cover" />
        ) : (
          comment.authorName.slice(0, 1).toUpperCase()
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="rounded-tile border border-hairline bg-slate/35 px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-[12.5px] text-snow">{comment.authorName}</span>
            <span className="tnum shrink-0 text-[10.5px] text-mist-dim">
              {fmtDate(comment.createdAt, { day: "numeric" })}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-mist">{comment.body}</p>
        </div>
        <div className="mt-1.5 flex items-center gap-4 pl-1">
          <button
            type="button"
            onClick={() => toggleRespect(comment.id)}
            aria-pressed={comment.respected}
            className={cn(
              "text-[11px] transition-colors",
              comment.respected ? "text-azure" : "text-mist-dim hover:text-snow",
            )}
          >
            {comment.respected ? "Respected" : "Respect"}
          </button>
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-[11px] text-mist-dim transition-colors hover:text-snow"
            >
              Reply
            </button>
          )}
          <button
            type="button"
            onClick={onMenu}
            aria-label="Comment options"
            className="text-[11px] text-mist-dim transition-colors hover:text-snow"
          >
            •••
          </button>
        </div>
      </div>
    </div>
  );
}
