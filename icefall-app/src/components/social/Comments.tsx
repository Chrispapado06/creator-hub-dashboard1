import { useEffect, useRef, useState, type JSX } from "react";
import { Link } from "react-router-dom";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BadgeCheck, Loader2, Trash2 } from "lucide-react";
import { Avatar, AzureNotice, Button, Card, Disclaimer } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/Sheet";
import { BACKEND_NOT_CONNECTED, supabase } from "@/backend/client";
import { fmtRelative } from "@/lib/format";
import {
  COMMENTS_LOCAL_NOTICE,
  ME,
  addComment,
  removeComment,
  useComments,
} from "@/social/comments";
import { storyTimeLeft, type Author, type Comment, type Post } from "@/social/types";
import { useApp } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * THE THREAD UNDER A POST.
 *
 * Opened by tapping a post in the feed. Built on `post_comments` — the shape in
 * `20260831190000_social.sql` — which decides almost everything about this
 * screen, and the decisions are worth stating because each one is somewhere a
 * comment thread normally invents something:
 *
 *  1. A COMMENT IS FLAT. `post_comments` is `post_id`, `author_id`, `body`,
 *     `created_at`. There is no parent column, so there are no replies here and
 *     no indentation pretending at one. (`@/social/comments` — the device-local
 *     store this file also uses — DOES carry a `parentId`. It is not rendered,
 *     for the same reason: two thread shapes for one feature is how the app
 *     ends up with two different answers to "who was this a reply to" the day
 *     the local threads sync.)
 *
 *  2. NOTHING IS EDITABLE. No UPDATE grant, no UPDATE policy. So a comment is
 *     stood behind or deleted, and the only control on your own words is the
 *     bin. There is deliberately no "edited" mark anywhere in here, because
 *     there is no state it could describe.
 *
 *  3. A COMMENT IS ALWAYS FROM A PERSON. `posts` carries `author_kind`;
 *     `post_comments` does not. So every byline below is `kind: "profile"` and
 *     no company or guide chrome is drawn on one — a card that offered it would
 *     be offering a distinction the table cannot make.
 *
 *  4. AN ENDED STORY CANNOT BE COMMENTED ON. `post_comments_insert` requires
 *     `expires_at is null or expires_at > now()`, so the box closes when the
 *     story has run out rather than letting the insert come back with a policy
 *     error the reader has to interpret.
 *
 * ── TWO THREADS, AND WHY BOTH EXIST ──────────────────────────────────────────
 *
 * A post with a real row on the server gets the real thread: read from
 * `post_comments`, written to `post_comments`, and it says plainly when it
 * could do neither.
 *
 * The feed's demo posts have no row — their ids are `p-activity-1`, not uuids —
 * so there is nothing on the server to attach a comment to, and an insert would
 * be refused by the foreign key. Those fall back to the DEVICE thread that
 * `@/social/comments` already ships, labelled with that module's own notice.
 * The alternative was a comments screen that could never show anything in the
 * app as it stands today, which is not honesty, it is a dead feature.
 */

/** `post_comments_body_check` — `length(trim(body)) between 1 and 2000`. */
const MAX_BODY = 2000;

/**
 * The typed client does not know about `post_comments` — `backend/types.ts`
 * predates the social migration and belongs to another session. Same untyped
 * view `Composer.tsx` opened for the same reason; the shapes below are checked
 * against the migration by hand.
 */
const untyped = supabase as unknown as SupabaseClient | null;

/**
 * Server rows carry uuid ids. The demo feed's carry `p-summit-1`.
 *
 * This is the whole test for "is there anything on the server to comment on",
 * and it is a test on the ID rather than on a `demo` flag, because the flag
 * would have to be threaded through the adapter in `Community.tsx` and would
 * then be one more thing that can be wrong. A row either has a database
 * identity or it does not.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isServerRow = (id: string) => UUID.test(id);

/**
 * `profiles_select` is `using (true)` for authenticated readers, so the author
 * embeds straight onto the row and the thread is one request rather than one
 * per byline. `identity_verified` is a computed field on the profile, served
 * like a column — see `Composer.tsx`, which reads the same one.
 */
const SELECT =
  "id, post_id, body, created_at, " +
  "author:profiles(id, display_name, username, avatar_url, location_label, identity_verified)";

interface ProfileRow {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  location_label: string | null;
  identity_verified: boolean | null;
}

interface CommentRow {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  /**
   * PostgREST serves a to-one embed as an object; some versions and some
   * relationship shapes hand back a one-element array instead. Both are read,
   * because a byline that renders "undefined" is worse than either.
   */
  author: ProfileRow | ProfileRow[] | null;
}

function toAuthor(row: ProfileRow): Author {
  return {
    id: row.id,
    name: row.display_name,
    handle: row.username ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    location: row.location_label ?? undefined,
    // See point 3 in the header: the table has no author_kind on a comment.
    kind: "profile",
    identityVerified: row.identity_verified ?? undefined,
  };
}

function toComment(row: CommentRow): Comment | null {
  const profile = Array.isArray(row.author) ? row.author[0] : row.author;
  // A comment whose author cannot be resolved is a comment nobody can be held
  // to, so it is dropped rather than rendered under an invented name.
  if (!profile) return null;
  return {
    id: row.id,
    postId: row.post_id,
    author: toAuthor(profile),
    body: row.body,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* The sheet                                                                  */
/* -------------------------------------------------------------------------- */

export function Comments({ post, onClose }: { post: Post; onClose(): void }): JSX.Element {
  const ended = storyTimeLeft(post) === "ended";

  return (
    <Sheet title="Comments" onClose={onClose}>
      <div className="space-y-4 py-4">
        <PostContext post={post} />
        {isServerRow(post.id) ? (
          <ServerThread post={post} ended={ended} />
        ) : (
          <DeviceThread post={post} />
        )}
      </div>
    </Sheet>
  );
}

/**
 * THE SAME THREAD, WITHOUT THE SHEET.
 *
 * For a screen that IS the post — `screens/social/PostDetail` — where the post
 * is already drawn above and the conversation simply follows it. It picks
 * between the two threads by the same test the sheet uses, which is the point
 * of exporting this rather than letting a page reach for `DeviceThread`: a
 * comment written under a post on its own page and a comment written in the
 * feed's sheet must land in the same place, or the app has two threads for one
 * post and disagrees with itself about who said what.
 *
 * No `PostContext` row here — the post is on the screen, and a card that
 * quotes the post it is directly underneath is a card that can misquote it.
 */
export function PostThread({ post }: { post: Post }): JSX.Element {
  const ended = storyTimeLeft(post) === "ended";
  return isServerRow(post.id) ? (
    <ServerThread post={post} ended={ended} />
  ) : (
    <DeviceThread post={post} />
  );
}

/**
 * What is being replied to, in one line.
 *
 * The post's own first line and nobody's summary of it — a thread that
 * paraphrases the post it hangs under is a thread that can misquote it.
 */
function PostContext({ post }: { post: Post }) {
  const company = post.author.kind === "company" ? post.author.company : undefined;
  const first = post.body.split("\n").find((line) => line.trim().length > 0) ?? post.body;

  return (
    <div className="flex items-start gap-3 rounded-tile border border-hairline bg-elevated/30 p-3">
      <Avatar name={company?.name ?? post.author.name} size={30} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] text-snow">{company?.name ?? post.author.name}</p>
        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-relaxed text-mist-dim">{first}</p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The server thread                                                          */
/* -------------------------------------------------------------------------- */

type Thread =
  | { status: "loading" }
  | { status: "no-backend" }
  | { status: "signed-out" }
  /** The read itself failed. NOT the same sentence as "there are no comments". */
  | { status: "unreadable" }
  | { status: "ready"; uid: string; comments: Comment[] };

function ServerThread({ post, ended }: { post: Post; ended: boolean }) {
  const [thread, setThread] = useState<Thread>({ status: "loading" });
  const [failure, setFailure] = useState<string | null>(null);
  /** Guards the state writes that follow an await after the sheet has closed. */
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;

    async function load() {
      if (!supabase || !untyped) {
        if (current) setThread({ status: "no-backend" });
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      if (!current) return;
      if (!sess.session) {
        setThread({ status: "signed-out" });
        return;
      }

      const { data, error } = await untyped
        .from("post_comments")
        .select(SELECT)
        .eq("post_id", post.id)
        .order("created_at", { ascending: true });

      if (!current) return;
      if (error) {
        setThread({ status: "unreadable" });
        return;
      }

      const rows = ((data ?? []) as unknown as CommentRow[])
        .map(toComment)
        .filter((c): c is Comment => c !== null);
      setThread({ status: "ready", uid: sess.session.user.id, comments: rows });
    }

    setThread({ status: "loading" });
    void load();
    return () => {
      current = false;
    };
  }, [post.id]);

  async function send(body: string): Promise<boolean> {
    if (thread.status !== "ready" || !untyped) return false;
    setFailure(null);

    // `.select(...)` for the reason the composer gives: the returned row is the
    // only evidence the comment exists. A missing error is not a delivery.
    const { data, error } = await untyped
      .from("post_comments")
      .insert({ post_id: post.id, author_id: thread.uid, body })
      .select(SELECT)
      .single();

    if (!alive.current) return false;
    const row = data ? toComment(data as unknown as CommentRow) : null;
    if (error || !row) {
      setFailure(
        "This did not post, and it has not been stored anywhere. What you wrote is still here — trying again is worth a go.",
      );
      return false;
    }

    setThread((t) => (t.status === "ready" ? { ...t, comments: [...t.comments, row] } : t));
    return true;
  }

  async function remove(id: string) {
    if (thread.status !== "ready" || !untyped) return;
    setFailure(null);
    const { error } = await untyped.from("post_comments").delete().eq("id", id);
    if (!alive.current) return;
    if (error) {
      setFailure("ICEFALL could not delete that comment. It is still on the post.");
      return;
    }
    setThread((t) =>
      t.status === "ready" ? { ...t, comments: t.comments.filter((c) => c.id !== id) } : t,
    );
  }

  if (thread.status === "loading") {
    return (
      <Card>
        <p className="flex items-center gap-2.5 text-[12.5px] text-mist-dim">
          <Loader2 size={14} strokeWidth={1.8} className="animate-spin" />
          Loading the thread…
        </p>
      </Card>
    );
  }

  if (thread.status === "no-backend" || thread.status === "signed-out") {
    const signedOut = thread.status === "signed-out";
    return (
      <Card className="space-y-3.5" inset>
        <AzureNotice title={signedOut ? "Sign in to read the thread" : "Not connected"}>
          <p>
            {signedOut
              ? "Comments are for signed-in climbers, on both sides: a comment carries your name, and reading one needs an account of your own. Nothing is hidden from you here — there is simply nobody to read it as."
              : BACKEND_NOT_CONNECTED}
          </p>
        </AzureNotice>
        {signedOut && (
          <Button asChild className="w-full">
            <Link to="/auth/signin">Sign in</Link>
          </Button>
        )}
      </Card>
    );
  }

  if (thread.status === "unreadable") {
    return (
      <Card>
        <p className="text-[13px] leading-relaxed text-snow">This thread could not be loaded.</p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
          The request did not come back, so there is nothing to show — and that is a failed read
          rather than an empty thread. Closing and opening this again is worth a try.
        </p>
      </Card>
    );
  }

  return (
    <>
      <ThreadList
        comments={thread.comments}
        mine={(c) => c.author.id === thread.uid}
        onDelete={(id) => void remove(id)}
      />

      {ended ? (
        <Disclaimer>
          This story has ended, so it has left everyone else&rsquo;s feed and no longer takes
          comments. The thread above stays readable; nothing new can be added to it.
        </Disclaimer>
      ) : (
        <CommentBox onSubmit={send} failure={failure} />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The device thread                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A post with no row on the server — today, every post in the demo feed.
 *
 * `@/social/comments` is the store the app already ships for this: it holds the
 * thread in localStorage, filters blocked authors at read time, and carries the
 * sentence that explains itself. Nothing is invented here; the only comment
 * that can appear is one written on this device.
 */
function DeviceThread({ post }: { post: Post }) {
  const { user } = useApp();
  const stored = useComments(post.id);

  const comments: Comment[] = stored.map((c) => ({
    id: c.id,
    postId: post.id,
    author: {
      id: c.authorId,
      name: c.authorName,
      avatarUrl: c.authorAvatar,
      kind: "profile",
    },
    body: c.body,
    createdAt: c.createdAt,
  }));

  async function send(body: string): Promise<boolean> {
    addComment({ subjectId: post.id, authorId: ME, authorName: user.name, body });
    return true;
  }

  return (
    <>
      <ThreadList
        comments={comments}
        mine={(c) => c.author.id === ME}
        onDelete={(id) => removeComment(id)}
      />
      <CommentBox onSubmit={send} failure={null} />
      <Disclaimer>{COMMENTS_LOCAL_NOTICE}</Disclaimer>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */

function ThreadList({
  comments,
  mine,
  onDelete,
}: {
  comments: Comment[];
  mine: (c: Comment) => boolean;
  onDelete: (id: string) => void;
}) {
  if (comments.length === 0) {
    return (
      <Card>
        <p className="text-[13px] text-snow">No comments yet.</p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
          Nobody has replied to this. Saying something first is the whole of it — there is no
          ranking here and no thread to work your way into.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {comments.map((c) => (
        <li key={c.id} className="flex items-start gap-3">
          {c.author.avatarUrl ? (
            <img
              src={c.author.avatarUrl}
              alt=""
              aria-hidden
              loading="lazy"
              className="h-8 w-8 shrink-0 rounded-full border border-hairline object-cover"
            />
          ) : (
            <Avatar name={c.author.name} size={32} />
          )}

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-[12.5px] text-snow">{c.author.name}</span>
              {c.author.identityVerified && (
                /* MIST, never azure — the three-marks ruling. Identity checked,
                   and nothing else claimed. Same treatment as `PostCard`. */
                <span className="shrink-0 text-mist" title="Identity verified by ICEFALL">
                  <BadgeCheck size={12} strokeWidth={2} aria-hidden />
                  <span className="sr-only">Identity verified by ICEFALL</span>
                </span>
              )}
              <span className="tnum shrink-0 text-[11px] text-mist-dim">
                {fmtRelative(c.createdAt)}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-mist">
              {c.body}
            </p>
          </div>

          {/* Your own words are the only ones you can act on. There is no
              report control on a comment: `reports` takes a post id and has no
              column for a comment, so a button here would queue a report
              against the wrong subject. */}
          {mine(c) && (
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              aria-label="Delete your comment"
              className="-mr-1 shrink-0 rounded-full p-1 text-mist-dim transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
            >
              <Trash2 size={14} strokeWidth={1.7} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The box.
 *
 * `onSubmit` resolves TRUE only when the comment actually landed, and the text
 * is cleared on nothing else — a box that empties itself on a failed write has
 * thrown away the only copy of what someone wrote.
 */
function CommentBox({
  onSubmit,
  failure,
}: {
  onSubmit: (body: string) => Promise<boolean>;
  failure: string | null;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const trimmed = text.trim();
  const overLimit = trimmed.length > MAX_BODY;
  const canSend = trimmed.length > 0 && !overLimit && !busy;

  async function submit() {
    if (!canSend) return;
    setBusy(true);
    const ok = await onSubmit(trimmed);
    setBusy(false);
    if (ok) setText("");
  }

  return (
    <div className="space-y-2.5">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="Say something"
        aria-label="Write a comment"
        className="w-full resize-none rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[13.5px] leading-relaxed text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
      />

      {/* The counter appears where it starts to matter, not from the first
          keystroke — the same rule the composer uses. */}
      {trimmed.length > MAX_BODY - 200 && (
        <p className={cn("tnum -mt-1 text-[11px]", overLimit ? "text-danger" : "text-mist-dim")}>
          {trimmed.length.toLocaleString("en-GB")} / {MAX_BODY.toLocaleString("en-GB")}
          {overLimit && " — the server will refuse this length"}
        </p>
      )}

      {failure && <p className="text-[11.5px] leading-relaxed text-danger">{failure}</p>}

      <Button size="sm" className="w-full" disabled={!canSend} onClick={() => void submit()}>
        {busy ? "Posting…" : "Post comment"}
      </Button>
    </div>
  );
}
