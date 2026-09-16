import { useEffect, useId, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Film, Image as ImageIcon, Lock, MessageSquarePlus, Send, X } from "lucide-react";

import { Button, Card } from "@/components/ui/primitives";
import { Rise } from "@/components/layout/chrome";
import { Comments } from "@/components/social/Comments";
import { houseRulesBlockPublish, HOUSE_RULES_BLOCKING_POST } from "@/components/social/Composer";
import { HouseRulesBlock } from "@/components/social/HouseRules";
import { PostCard } from "@/components/social/PostCard";
import { ReportDialog } from "@/components/social/ReportDialog";
import { supabase } from "@/backend/client";
import { useSessionState } from "@/auth/session";
import { houseRulesAccountKey, useHouseRulesAcknowledgement } from "@/social/houseRules";
import { cn } from "@/lib/utils";
import type { Post } from "@/social/types";
import {
  GROUP_FEED_EMPTY,
  GROUP_POST_MEDIA_CAVEAT,
  MAX_GROUP_POST_BODY,
  postToGroup,
  useGroupFeed,
} from "@/social/groupPosts";
import { EXAMPLE_READ_ONLY, isExampleGroupId } from "@/groups/demo/exampleSource";

import { AbsenceMark, SpaceAbsence } from "./groupChrome";

/**
 * A GROUP'S FEED — the posts written inside one group, and the composer.
 *
 * The owner, 2026-09-11: "when you click on a group and join there should be
 * the feed and chat". The chat half shipped on 2026-09-02 and is one tap away
 * on the group page. THIS IS THE OTHER HALF, and it draws exactly what
 * `social/groupPosts.ts` answers — no more.
 *
 * ── THE THREE ANSWERS, AND WHY THEY ARE THREE DIFFERENT SENTENCES ────────────
 *
 * The data layer distinguishes them and this screen must not collapse them,
 * because they are the difference between a locked door, an empty room and a
 * light that is not wired yet:
 *
 *   members-only  You are not in this group, so its posts are not yours to
 *                 read. NOT an empty feed. `posts_select` FILTERS rather than
 *                 refuses, so a stranger's query comes back as zero rows with
 *                 no error — byte for byte what an empty group returns — and
 *                 rendering that would tell somebody nobody had posted in a
 *                 group that has been busy for a month.
 *   ready, none   You are in, ICEFALL asked, and the answer really was none.
 *   anything else A build with no server, a migration that is not pushed, a
 *                 request that did not come back. A fact about the software,
 *                 never a claim about the people in the group.
 *
 * ── WHAT IS NOT HERE ─────────────────────────────────────────────────────────
 *
 * NO FIXTURE, NO PLACEHOLDER. A real group in a DEMO build has no client, so
 * this section draws the no-backend sentence and nothing else. The only posts a
 * demo build shows are the labelled examples (`groups/demo/exampleSource.ts`),
 * each saying "Example" in its own words; on those, commenting and reporting
 * answer `EXAMPLE_READ_ONLY` instead of opening a thread or a report.
 *
 * NO COMPOSER UNLESS A POST COULD ACTUALLY BE WRITTEN. It appears only for a
 * member of a group whose feed was really read. Anywhere else it would be a
 * control that collects three paragraphs about a crevasse and then fails.
 */

/* -------------------------------------------------------------------------- */
/* The feed                                                                    */
/* -------------------------------------------------------------------------- */

export function GroupFeedSection({
  groupId,
  isMember,
}: {
  groupId: string;
  /** From the group row's own `joined_by_me`, not guessed from the feed. */
  isMember: boolean;
}) {
  const { posts, count, state, message, reload } = useGroupFeed(groupId);
  const [thread, setThread] = useState<Post | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  /* An example can be read, not written to: a comment or a report on one gets
     the one sentence and opens nothing. */
  const example = isExampleGroupId(groupId);
  const [exampleNote, setExampleNote] = useState<string | null>(null);

  if (state === "loading") {
    return (
      <Rise className="pt-3">
        <Card>
          <p className="text-[13px] text-mist-dim">Reading this group's posts…</p>
        </Card>
      </Rise>
    );
  }

  if (state !== "ready") {
    return (
      <Rise className="pt-3">
        <SpaceAbsence
          status={state}
          message={message}
          onRetry={reload}
          /* The shared table's headings are about the GROUP. Two of them would
             be wrong over a feed, so those two say what they are about. */
          title={
            state === "members-only"
              ? "The posts are the group's"
              : state === "not-provisioned"
                ? "Posting inside a group is not live yet"
                : undefined
          }
          detail={
            state === "members-only" ? (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                A member sees the whole feed, including everything posted before they joined.
              </p>
            ) : (
              <p className="mt-2.5 text-[12px] leading-relaxed text-mist-dim">
                No posts are drawn rather than a few.
              </p>
            )
          }
        />
      </Rise>
    );
  }

  return (
    <>
      {posts.length === 0 ? (
        <Rise className="pt-3">
          <Card className="py-7">
            <div className="flex flex-col items-center text-center">
              <AbsenceMark icon={MessageSquarePlus} />
              <p className="mt-4 text-[14px] text-snow">Nothing posted yet</p>
              <p className="mt-2 max-w-[44ch] text-[12px] leading-relaxed text-mist">
                {GROUP_FEED_EMPTY}
              </p>
            </div>
          </Card>
        </Rise>
      ) : (
        <Rise className="pt-3">
          <ul className="space-y-3">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard
                  post={post}
                  onOpenComments={example ? () => setExampleNote(EXAMPLE_READ_ONLY) : setThread}
                  onReport={
                    example ? () => setExampleNote(EXAMPLE_READ_ONLY) : (p) => setReporting(p.id)
                  }
                />
              </li>
            ))}
          </ul>

          {/*
           * "SHOWING 50 OF 214" NEEDS BOTH NUMBERS TO BE REAL, and they are two
           * different measurements: `posts.length` is a page off the front of
           * the feed, `count` is the server's own exact total. A null count is
           * nobody having counted, so nothing is drawn for it — the page is
           * never passed off as the whole.
           */}
          {exampleNote && (
            <p className="mt-3 text-[12px] leading-relaxed text-mist" role="status">
              {exampleNote}
            </p>
          )}

          {typeof count === "number" && count > posts.length && (
            <p className="tnum mt-3 text-[11px] leading-relaxed text-mist-dim">
              Showing the {posts.length} most recent of {count}. ICEFALL reads a page at a time and
              there is no older page to turn to yet.
            </p>
          )}
        </Rise>
      )}

      {isMember && (
        <Rise className="pt-3">
          <GroupPostComposer groupId={groupId} />
        </Rise>
      )}

      <Rise className="pt-3">
        <Button variant="ghost" className="w-full" onClick={reload}>
          Check for anything new
        </Button>
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
          The feed does not update on its own in this build and nothing notifies you.
        </p>
      </Rise>

      {thread && <Comments post={thread} onClose={() => setThread(null)} />}
      <ReportDialog postId={reporting} onClose={() => setReporting(null)} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The composer                                                                */
/* -------------------------------------------------------------------------- */

/**
 * WORDS, A PHOTO, OR A VIDEO — modelled on `Composer.tsx`'s `MediaRow`, not
 * reinvented, because a group post and a feed post insert the same
 * `public.posts` row and a climber should not have to learn two different
 * pickers for the same two file types.
 *
 * `postToGroup` (`social/groupPosts.ts`) takes `mediaPath`/`mediaMeta` that
 * this composer must upload to FIRST — the data layer deliberately does not
 * upload, it only writes the row. Unlike the main feed composer, this one has
 * a real bucket to upload to: `post-media` (20260902160000) is what
 * `groupPosts.ts` already signs URLs from, so photo is open outright and video
 * is gated on the same server fact `Composer.tsx` gates on —
 * `profiles.identity_verified` — never cached, re-read every time this box
 * mounts.
 *
 * THE PRIVACY GAP, STATED HERE BECAUSE IT IS NOT FIXED HERE: `groupPosts.ts`'s
 * header documents that `post-media`'s READ policy is `bucket_id = 'post-media'`
 * for ANY signed-in ICEFALL account, not scoped to the group the post lives in
 * — so an attachment is not actually private to the group the way the words
 * are. That is a storage-policy change with security stakes, not a screen
 * change, and it is out of scope here. `GROUP_POST_MEDIA_CAVEAT` is the data
 * layer's own sentence saying so, and it is drawn next to the media buttons
 * below rather than left unread in an unused export — the same posture this
 * codebase takes everywhere else it has a limit to admit.
 *
 * THE BUTTON SAYS POST, and it means it: this really does reach every member of
 * the group through `public.posts`. The planning log on a device-only group
 * says "Write to this device" for the opposite reason, and the difference
 * between those two words is the whole reason both exist.
 */

const GROUP_POST_MEDIA_BUCKET = "post-media";

/**
 * `posts_media_gallery_shape` (20260916120000) — the database CHECK caps a
 * gallery at 10 elements. Repeated here rather than discovered from a
 * rejected insert, the same posture `MAX_GROUP_POST_BODY` above takes on its
 * own column limit.
 */
const MAX_GROUP_GALLERY = 10;

/**
 * Said when somebody selects more images in one pick than a post can carry.
 * THE FIRST `MAX_GROUP_GALLERY`, NEVER A RANDOM TEN OUT OF THE PICK — a
 * silent drop would leave someone wondering which of their photos vanished;
 * this names the number kept and the number left out, and leaves the choice
 * of which ones to post again for the rest in their hands, not this file's.
 */
function galleryOverflowNotice(pickedCount: number): string {
  const left = pickedCount - MAX_GROUP_GALLERY;
  return `You picked ${pickedCount} images. Only the first ${MAX_GROUP_GALLERY} are attached to this post — the other ${left} ${left === 1 ? "is" : "are"} not, and posting again is how to add ${left === 1 ? "it" : "them"}.`;
}

const GROUP_VIDEO_NEEDS_IDENTITY =
  "Video and reels are for accounts whose identity ICEFALL has checked. It is the one thing on this feed that carries a person's face and voice, so it carries their name as well.";

const GROUP_IDENTITY_UNKNOWN =
  "ICEFALL could not check your verification just now, so video stays closed. This is a failed check rather than a verdict — it does not mean you are unverified.";

const GROUP_MEDIA_NO_BACKEND =
  "ICEFALL is not connected to a server in this build, so there is nowhere to put a file.";

/** The untyped view every social module in this app opens — `backend/types.ts` has never seen `posts`. */
const untyped = supabase as unknown as SupabaseClient | null;

/** `kind` matches `PostMedia.kind` in `social/types.ts` — the value the cards read back. */
type GroupAttachment = { file: File; url: string; kind: "image" | "video" };
type GroupUploaded = { path: string; meta: Record<string, unknown> };

/**
 * `profiles.identity_verified`, re-checked for this account whenever it
 * changes — never cached, for the same reason `Composer.tsx`'s
 * `useComposerAccount` never caches it: a stored boolean can outlive the
 * evidence it was based on.
 *
 * `undefined` = not checked yet, `null` = the check failed (NOT "unverified"),
 * `boolean` = the real answer.
 */
function useGroupIdentityVerified(uid: string | null | undefined): boolean | null | undefined {
  const [verified, setVerified] = useState<boolean | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    if (!uid || !untyped) {
      setVerified(undefined);
      return;
    }
    untyped
      .from("profiles")
      .select("id, identity_verified")
      .eq("id", uid)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        const flag = (data as { identity_verified?: unknown } | null)?.identity_verified;
        setVerified(error || typeof flag !== "boolean" ? null : flag);
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  return verified;
}

/**
 * The single place this composer touches storage. Mirrors `Composer.tsx`'s
 * `uploadMedia` exactly, aimed at `post-media` (real here) instead of the
 * `null` bucket that component is stuck with — a group post has somewhere to
 * put a file and a feed post, today, does not.
 */
async function uploadGroupMedia(
  uid: string,
  attachment: GroupAttachment,
): Promise<{ ok: true; uploaded: GroupUploaded } | { ok: false; message: string }> {
  if (!untyped) return { ok: false, message: GROUP_MEDIA_NO_BACKEND };

  const ext = attachment.file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await untyped.storage
    .from(GROUP_POST_MEDIA_BUCKET)
    .upload(path, attachment.file, { contentType: attachment.file.type, upsert: false });

  if (error) {
    return {
      ok: false,
      message:
        "That file could not be stored, so nothing was posted. Your words are still here — remove the attachment to post them now.",
    };
  }
  return {
    ok: true,
    uploaded: {
      path,
      // Measured from the file the person chose, nothing decoded or guessed —
      // same rule Composer.tsx's uploadMedia states over the same fields.
      meta: { kind: attachment.kind, mime: attachment.file.type, bytes: attachment.file.size },
    },
  };
}

function GroupPostComposer({ groupId }: { groupId: string }) {
  const [draft, setDraft] = useState("");
  /*
   * ONE VIDEO, OR UP TO TEN IMAGES — NEVER BOTH. Two state slots rather than
   * one, because that is the real shape of the rule: picking a video clears
   * any images and picking an image clears any video (below, in the file
   * input's own `onChange`), so at most one of these two is ever non-empty at
   * a time. `images` holds 0-`MAX_GROUP_GALLERY` — exactly one is the classic
   * single-image post (`mediaPath`/`mediaMeta`, untouched); two or more is a
   * gallery (`media_gallery`, additive). Which of those two paths a submit
   * takes is decided in `submit()` below, purely from `images.length`.
   */
  const [images, setImages] = useState<GroupAttachment[]>([]);
  const [video, setVideo] = useState<GroupAttachment | null>(null);
  /** Set only when a pick was trimmed to `MAX_GROUP_GALLERY` — see `galleryOverflowNotice`. */
  const [galleryNotice, setGalleryNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const noticeId = useId();
  const picker = useRef<HTMLInputElement | null>(null);
  const wantKind = useRef<"image" | "video">("image");

  /* Set on the element immediately before `.click()`, not through a prop: one
     input serves both rows and a ref does not re-render, so a prop set from
     the previous pick would carry the wrong filter into this one. Same trick
     `Composer.tsx` uses on its own single file input. `multiple` is set here
     too, and only for the image row — a video pick stays the single-file
     pick it has always been, so this does not touch that mechanism. */
  function openPicker(kind: "image" | "video") {
    wantKind.current = kind;
    if (picker.current) {
      picker.current.accept = kind === "video" ? "video/*" : "image/*";
      picker.current.multiple = kind === "image";
    }
    picker.current?.click();
  }

  useEffect(() => {
    if (!video) return;
    return () => URL.revokeObjectURL(video.url);
  }, [video]);

  /*
   * IMAGES ARE REVOKED AT EVERY POINT THE ARRAY CHANGES, NOT VIA A CLEANUP ON
   * `[images]` — an effect keyed on the whole array would revoke every URL in
   * it (including the ones carried over unchanged) each time a single image
   * is removed or a new batch replaces the old, breaking the previews that
   * were meant to survive. Every place that replaces or shrinks `images`
   * below revokes exactly the URLs it is discarding; this effect only covers
   * the one path none of those can: the component going away with images
   * still attached. `imagesRef` exists only so that cleanup sees the LATEST
   * array rather than whatever `images` was when the effect first mounted.
   */
  const imagesRef = useRef<GroupAttachment[]>(images);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
    };
  }, []);

  /*
   * THE HOUSE RULES GATE, AND WHY IT IS HERE AND NOT ONLY ON THE PUBLIC FEED.
   *
   * A group post is a row of `public.posts` — the same table, the same report
   * and moderation surface, as a post written on the feed. `Composer` and
   * `PublishSummit` both refuse to publish until the rules are acknowledged,
   * and they share `houseRulesBlockPublish` for the stated reason that two
   * publish surfaces must not answer the question differently. This is the
   * third such surface. Without this it was possible to publish a post to the
   * server having never been shown the rules at all, simply by writing it
   * inside a group — measured on 11 Sep 2026 before this was added.
   *
   * `unknown` deliberately does NOT block: see the note on
   * `houseRulesBlockPublish`. It is the millisecond before an answer, and it
   * is also the state in which `HouseRulesBlock` draws no acknowledgement
   * control — so blocking on it would lock the button beside a card offering
   * no way to unlock it.
   */
  const session = useSessionState();
  const houseRules = useHouseRulesAcknowledgement(
    houseRulesAccountKey(session === undefined ? undefined : (session?.user.id ?? null)),
  );
  const rulesBlock = houseRulesBlockPublish(houseRules);

  const uid = session?.user.id ?? null;
  const verified = useGroupIdentityVerified(uid);
  const backendReady = !!untyped;
  const photoState: "open" | "blocked" = backendReady ? "open" : "blocked";
  const videoState: "open" | "locked" | "blocked" =
    verified !== true ? "locked" : backendReady ? "open" : "blocked";
  const videoDetail =
    verified === undefined
      ? "Checking your identity verification…"
      : verified === null
        ? GROUP_IDENTITY_UNKNOWN
        : verified === false
          ? GROUP_VIDEO_NEEDS_IDENTITY
          : backendReady
            ? "Your identity is verified, so video is yours to post."
            : GROUP_MEDIA_NO_BACKEND;

  const words = draft.trim();
  const overLimit = words.length > MAX_GROUP_POST_BODY;
  const canPost = words.length > 0 && !overLimit && !busy && !rulesBlock;

  async function submit() {
    if (!canPost) return;
    /* Stated again where the write happens, not only on the button. A gate
       enforced by a `disabled` attribute alone is one prop away from gone. */
    if (rulesBlock) return;
    setBusy(true);
    setError(null);

    const authorUid = uid;
    if ((video || images.length > 0) && !authorUid) {
      setError("Your ICEFALL session ended, so nothing was posted. Sign in again and try it once more.");
      setBusy(false);
      return;
    }

    let mediaPath: string | null = null;
    let mediaMeta: Record<string, unknown> | null = null;
    let mediaGallery: { path: string; kind: "image"; [key: string]: unknown }[] | null = null;

    if (video && authorUid) {
      const uploaded = await uploadGroupMedia(authorUid, video);
      if (!uploaded.ok) {
        setError(uploaded.message);
        setBusy(false);
        return;
      }
      mediaPath = uploaded.uploaded.path;
      mediaMeta = uploaded.uploaded.meta;
    } else if (images.length === 1 && authorUid) {
      // Picking exactly one image is not a gallery — the classic single
      // path, unchanged, same as before this feature existed.
      const uploaded = await uploadGroupMedia(authorUid, images[0]);
      if (!uploaded.ok) {
        setError(uploaded.message);
        setBusy(false);
        return;
      }
      mediaPath = uploaded.uploaded.path;
      mediaMeta = uploaded.uploaded.meta;
    } else if (images.length > 1 && authorUid) {
      // A MULTI-IMAGE BATCH FAILS AS A WHOLE. Uploaded sequentially, and the
      // first failure stops the loop and the post — never a gallery missing
      // whichever image happened to fail, and never a post with three of the
      // five images someone actually chose.
      const uploadedItems: { path: string; kind: "image"; [key: string]: unknown }[] = [];
      for (const image of images) {
        const uploaded = await uploadGroupMedia(authorUid, image);
        if (!uploaded.ok) {
          setError(uploaded.message);
          setBusy(false);
          return;
        }
        uploadedItems.push({ ...uploaded.uploaded.meta, path: uploaded.uploaded.path, kind: "image" });
      }
      mediaGallery = uploadedItems;
    }

    const result = await postToGroup({
      groupId,
      body: words,
      mediaPath,
      mediaMeta,
      mediaGallery,
    });
    setBusy(false);
    if (!result.ok) {
      // The draft AND every attachment are kept. A composer that emptied
      // itself on a failure would take somebody's words and photos away and
      // leave them believing the group had been told something.
      setError(result.message);
      return;
    }
    setDraft("");
    images.forEach((img) => URL.revokeObjectURL(img.url));
    if (video) URL.revokeObjectURL(video.url);
    setImages([]);
    setVideo(null);
    setGalleryNotice(null);
  }

  return (
    <Card>
      {/* Above the thing about to publish, exactly as on the feed composer. */}
      <HouseRulesBlock className="mb-3" />

      <p id={noticeId} className="text-[12px] leading-relaxed text-mist">
        A post here goes to ICEFALL's server and every member of this group can read it — including
        anybody accepted later, who gets the feed from its beginning. Nobody outside the group can
        read it, on any screen in the app.
      </p>

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        aria-label="Write a post for this group"
        aria-describedby={noticeId}
        placeholder="Post something to the group…"
        className="mt-3 w-full resize-none rounded-tile border border-hairline bg-elevated/40 p-3.5 text-[13px] leading-relaxed text-snow outline-none placeholder:text-mist-dim focus:border-azure/50"
      />

      {words.length > MAX_GROUP_POST_BODY - 400 && (
        <p className={cn("tnum mt-1.5 text-[11px]", overLimit ? "text-danger" : "text-mist-dim")}>
          {words.length}/{MAX_GROUP_POST_BODY}
        </p>
      )}

      {/* ---- Photo and video — modelled on Composer.tsx's MediaRow -------- */}
      <div className="mt-3 space-y-2">
        <GroupMediaRow
          icon={ImageIcon}
          title="Photo"
          state={photoState}
          detail={photoState === "open" ? "Open to everyone in the group." : GROUP_MEDIA_NO_BACKEND}
          onPick={() => openPicker("image")}
        />
        <GroupMediaRow
          icon={Film}
          title="Video or reel"
          state={videoState}
          detail={videoDetail}
          onPick={() => openPicker("video")}
        />
      </div>

      {/* THE PRIVACY GAP, SAID WHERE SOMEBODY IS ABOUT TO CHOOSE A FILE. Their
          words above are members-only; this is not — see the caveat's own
          definition in `social/groupPosts.ts` for why, and the composer's
          doc comment above for why this screen does not attempt to fix it. */}
      <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{GROUP_POST_MEDIA_CAVEAT}</p>

      <input
        ref={picker}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (picked.length === 0) return;
          setError(null);

          if (wantKind.current === "video") {
            // Unchanged: one video, and it replaces any images — the two
            // never travel together.
            const file = picked[0];
            images.forEach((img) => URL.revokeObjectURL(img.url));
            setImages([]);
            setGalleryNotice(null);
            setVideo({ file, url: URL.createObjectURL(file), kind: "video" });
            return;
          }

          // Picking images replaces any video — never both — and replaces
          // any images already attached, so the previous set is revoked
          // here rather than left for the unmount-only cleanup above.
          if (video) {
            URL.revokeObjectURL(video.url);
            setVideo(null);
          }
          images.forEach((img) => URL.revokeObjectURL(img.url));
          const kept = picked.slice(0, MAX_GROUP_GALLERY);
          setGalleryNotice(picked.length > MAX_GROUP_GALLERY ? galleryOverflowNotice(picked.length) : null);
          setImages(kept.map((file) => ({ file, url: URL.createObjectURL(file), kind: "image" as const })));
        }}
      />

      {galleryNotice && (
        <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">{galleryNotice}</p>
      )}

      {video && (
        <div className="relative mt-2.5 overflow-hidden rounded-tile border border-hairline">
          <video src={video.url} controls className="h-[150px] w-full bg-obsidian object-contain" />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(video.url);
              setVideo(null);
            }}
            aria-label="Remove video"
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {images.map((image, i) => (
            <div key={image.url} className="relative overflow-hidden rounded-tile border border-hairline">
              <img src={image.url} alt="" aria-hidden className="h-[84px] w-full object-cover" />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(image.url);
                  setImages((prev) => prev.filter((_, idx) => idx !== i));
                }}
                aria-label={`Remove image ${i + 1}`}
                className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-obsidian/75 text-snow"
              >
                <X size={13} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-end">
        <Button className="shrink-0" disabled={!canPost} onClick={() => void submit()}>
          <Send size={15} strokeWidth={1.8} aria-hidden="true" />
          {busy ? "Posting…" : "Post"}
        </Button>
      </div>

      {/* The card above can be scrolled past by now, and a control that
          refuses without saying why is the bug this file refuses elsewhere. */}
      {rulesBlock && (
        <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">
          {HOUSE_RULES_BLOCKING_POST}
        </p>
      )}

      {error && <p className="mt-2.5 text-[12px] leading-relaxed text-danger">{error}</p>}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Media row — the same control Composer.tsx draws, kept local to this file   */
/* -------------------------------------------------------------------------- */

/**
 * A LOCKED STATEMENT, NOT A GREYED-OUT BUTTON, exactly as `Composer.tsx`
 * argues over its own copy of this control: a `disabled` button says no and
 * explains nothing, and the owner's identity-video rule deserves the reason on
 * screen, not just the refusal.
 */
function GroupMediaRow({
  icon: Icon,
  title,
  detail,
  state,
  onPick,
}: {
  icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string; className?: string }>;
  title: string;
  detail: string;
  /** open = a picker; locked = the identity rule; blocked = nowhere to upload. */
  state: "open" | "locked" | "blocked";
  onPick: () => void;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-2.5">
        <Icon
          size={15}
          strokeWidth={1.7}
          className={cn("shrink-0", state === "open" ? "text-azure" : "text-mist-dim")}
        />
        <span className="text-[13.5px] text-snow">{title}</span>
        {state === "locked" && <Lock size={12} strokeWidth={1.8} className="text-mist-dim" />}
      </span>
      <span className="mt-1.5 block text-[11px] leading-relaxed text-mist-dim">{detail}</span>
    </>
  );

  const cls = "block w-full rounded-tile border border-hairline bg-elevated/30 px-3.5 py-3 text-left";

  return state === "open" ? (
    <button type="button" onClick={onPick} className={cn(cls, "transition-colors hover:border-azure/45")}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
