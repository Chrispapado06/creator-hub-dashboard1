/**
 * The company's social surface — OP-01, via S2.
 *
 * WHERE IT LIVES AND WHY. The owner's words are "company profile posts", and
 * the backlog heading for OP-01 is literally `CompanyProfile` — so this renders
 * as the Posts tab of the Company Profile screen rather than a new nav entry.
 * No operator mockup covers social (the mockup set is CRM + phone only), so
 * the words are the ruling. The route's existing `editCompanyProfile` gate is
 * the same permission `createPost` checks, so the nav's honesty rule holds:
 * nobody is shown a surface they would be refused at.
 *
 * THE S2 TABLES ARE NOT LIVE. Everything here talks to the adapter's optional
 * social block (`getPosts` … `setPromoVideo` in `src/domain/adapter.ts`),
 * which today is the in-memory implementation in the S2 contract's exact
 * shapes — the swap is a repoint, the route `leads.tags` took. An
 * implementation without the block (the frozen offline demo) gets an
 * UNAVAILABLE statement, never an empty feed pretending the company has no
 * posts.
 *
 * WHAT THE FEED IS: the company's own posts, STRICTLY CHRONOLOGICAL, newest
 * first. No ranking, no score, and no claim of either anywhere in the copy. No
 * reach, impressions or view counts either — not even as dashes. Icefall does
 * not measure them, so nothing here mentions them; the absence is the honesty.
 *
 * MODERATION: a post is public the moment it is created and may later be
 * removed by Icefall (the CRM's queue, CR-17). Those are the only states — no
 * "pending review" exists because nothing reviews one — and a removed post
 * renders its reason verbatim and cannot be deleted over.
 */

import { Clock, MessageCircle, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, EmptyState, Figure, ListingPhoto, Notice, Pill, SectionHeading, inputClass, peakPhotoUrl, trekPhotoUrl } from "@/components/ui";
import { Monogram } from "@/components/Shell";
import { MediaDrop, type StagedFile } from "@/editor/MediaDrop";
import { PromoPlayer, VideoField } from "@/editor/VideoField";
import { findContactDetails } from "@/domain/authz";
import { NOW, timeAgo } from "@/domain/dates";
import { OPERATOR_NOTICES, unavailable } from "@/domain/honesty";
import { storyState, type Post, type PostComment, type PostMedia, type PromoVideo } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/** A story lasts 24 hours, derived from the app clock — never `new Date()`. */
const STORY_MS = 24 * 60 * 60 * 1000;

/** "21 h left" / "40 min left", against the app clock. */
function storyTimeLeft(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.parse(NOW);
  const mins = Math.max(0, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min left`;
  return `${Math.round(mins / 60)} h left`;
}

/**
 * A post's picture, through the app's existing media idioms and nothing else.
 * `peak`/`trek` are the ALREADY-CREDITED photo libraries served by icefall-web
 * (`ListingPhoto` draws its own fallback when that server is down); `asset` is
 * a company-owned `MediaAsset`, resolved through `getMediaUrl` like every
 * other asset. No media store is connected, so nothing here invents a URL.
 */
function PostPhoto({ media, className = "" }: { media: PostMedia; className?: string }) {
  const session = useSession();
  const { backend } = useOperator();
  const assetUrl = useAsync(
    () =>
      media.source === "asset"
        ? backend.getMediaUrl(session, media.mediaId)
        : Promise.resolve<string | null>(null),
    [session, media],
    null,
  );
  const sources =
    media.source === "peak"
      ? [peakPhotoUrl(media.mountainId)]
      : media.source === "trek"
        ? [trekPhotoUrl(media.trekId)]
        : assetUrl
          ? [assetUrl]
          : [];
  const seed =
    media.source === "peak" ? media.mountainId : media.source === "trek" ? media.trekId : media.mediaId;
  return <ListingPhoto sources={sources} alt="" seed={seed} className={className} />;
}

/* -------------------------------------------------------------------------- */
/* One post                                                                   */
/* -------------------------------------------------------------------------- */

function PostCard({
  post,
  companyName,
  comments,
  onAskDelete,
}: {
  post: Post;
  companyName: string;
  comments: PostComment[];
  onAskDelete: (post: Post) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const story = storyState(post, NOW);
  const removed = post.removedAt !== null;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Monogram name={companyName} size={34} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="ser text-[15px] text-ink">{companyName}</span>
            <span className="text-[11.5px] text-faint">{timeAgo(post.createdAt, NOW)}</span>
            {story === "active" && (
              <Pill tone="azure">
                <Clock size={11} className="mr-1" aria-hidden />
                Story · <span className="tnum ml-1">{storyTimeLeft(post.expiresAt!)}</span>
              </Pill>
            )}
            {story === "expired" && (
              <span className="inline-flex items-center rounded-pill bg-expired-soft px-2 py-0.5 text-[10px] font-semibold tracking-[0.07em] text-expired uppercase">
                Story · expired
              </span>
            )}
          </div>

          {/*
           * A removed post renders its removal PLAINLY — the reason verbatim,
           * the caption kept but dimmed so the operator can see what was
           * removed. No edit or delete control exists on it: the moderation
           * record survives, and `deletePost` would refuse anyway.
           */}
          {removed && (
            <div className="mt-2">
              <Notice tone="rejected" title="Removed by Icefall">
                {post.removedReason}
              </Notice>
            </div>
          )}

          <p className={`mt-2 text-[13px] leading-relaxed ${removed ? "text-faint" : "text-ink"}`}>
            {post.caption}
          </p>

          {post.media && (
            <PostPhoto
              media={post.media}
              className={`mt-3 h-44 w-full max-w-md rounded-tile ${removed || story === "expired" ? "opacity-50" : ""}`}
            />
          )}

          {story === "expired" && (
            <p className="mt-2 text-[11.5px] leading-snug text-muted">
              This story has expired and is no longer shown to climbers. It stays here as your own record.
            </p>
          )}

          <div className="mt-3 flex items-center gap-3 border-t border-line-soft pt-2.5">
            {comments.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowComments((s) => !s)}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
              >
                <MessageCircle size={13} aria-hidden />
                <span className="tnum">{comments.length}</span>
                {comments.length === 1 ? "comment" : "comments"}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-faint">
                <MessageCircle size={13} aria-hidden /> No comments yet
              </span>
            )}
            {!removed && (
              <button
                type="button"
                onClick={() => onAskDelete(post)}
                className="ml-auto inline-flex items-center gap-1 text-[12px] text-faint transition-colors hover:text-rejected"
              >
                <Trash2 size={12.5} aria-hidden /> Delete
              </button>
            )}
          </div>

          {showComments && comments.length > 0 && (
            <ul className="mt-2.5 space-y-2.5">
              {comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5">
                  <Monogram name={c.authorName} size={26} />
                  <div className="min-w-0 flex-1 rounded-tile bg-canvas px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-medium text-ink">{c.authorName}</span>
                      <span className="text-[10.5px] text-faint">{timeAgo(c.createdAt, NOW)}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The delete confirmation                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Same dialog shape as Settings' — `bg-scrim` overlay (never a tint of `ink`,
 * which is near-white in the dark theme), close on overlay click and a card
 * that stops the propagation. A refusal from `deletePost` is shown HERE,
 * verbatim, so the operator learns why in the place they acted.
 */
function DeletePostDialog({
  post,
  onClose,
  onDeleted,
}: {
  post: Post;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const session = useSession();
  const { backend } = useOperator();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (!backend.deletePost) return;
    const res = await backend.deletePost(session, post.id);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    onDeleted();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Delete post"
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <Card className="p-5">
          <h2 className="text-[14px] font-semibold text-ink">Delete this post?</h2>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            It comes off your public profile straight away, along with its comments. This cannot be undone.
          </p>
          <p className="mt-2 rounded-tile bg-canvas px-3 py-2 text-[12px] leading-snug text-muted">
            “{post.caption.length > 140 ? `${post.caption.slice(0, 140)}…` : post.caption}”
          </p>
          {error && (
            <div className="mt-3">
              <Notice tone="rejected">{error}</Notice>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 border-t border-line-soft pt-3">
            <Button variant="danger" onClick={() => void confirm()}>
              <Trash2 size={13} aria-hidden /> Delete post
            </Button>
            <Button onClick={onClose}>Keep it</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The composer                                                               */
/* -------------------------------------------------------------------------- */

function Composer({ onPosted }: { onPosted: () => void }) {
  const session = useSession();
  const { backend } = useOperator();
  const [caption, setCaption] = useState("");
  const [asStory, setAsStory] = useState(false);
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  /*
   * The caption is operator-authored PUBLIC text, so the contact-details rule
   * is surfaced while typing — the same guard the backend enforces, explained
   * before the refusal rather than instead of it.
   */
  const contactHits = findContactDetails(caption);

  const share = async () => {
    if (!backend.createPost) return;
    const res = await backend.createPost(session, {
      caption,
      /*
       * MEDIA HONESTY. No media store is connected, so a dropped file cannot
       * travel with the post — it validates and previews here, and the panel
       * below says plainly that it is not saved. The post is published with
       * no media rather than with a reference to bytes nobody stored.
       */
      media: null,
      // A story's 24 hours run from the app clock, never from `new Date()`.
      expiresAt: asStory ? new Date(Date.parse(NOW) + STORY_MS).toISOString() : null,
    });
    if (!res.ok) {
      // The refusal reason reaches the operator verbatim, never swallowed.
      setMessage({ tone: "rejected", text: res.reason });
      return;
    }
    setCaption("");
    setAsStory(false);
    setStaged(null);
    setMessage({
      tone: "neutral",
      text: asStory
        ? "Your story is live. It shows to climbers for 24 hours, then stays here as your record."
        : "Your post is live on your public profile.",
    });
    onPosted();
  };

  return (
    <Card className="p-4">
      <SectionHeading title="Share a post" detail="What you write here appears on your public company profile." />
      <textarea
        className={`${inputClass} min-h-[84px] resize-y`}
        placeholder="Tell climbers what your company is doing…"
        value={caption}
        onChange={(e) => {
          setCaption(e.target.value);
          setMessage(null);
        }}
      />

      {contactHits.length > 0 && (
        <div className="mt-3">
          <Notice tone="rejected" title={`Remove ${[...new Set(contactHits.map((h) => h.label))].join(" and ")}`}>
            {OPERATOR_NOTICES.NO_CONTACT_DETAILS}
          </Notice>
        </div>
      )}

      <div className="mt-3">
        <MediaDrop
          kind="image"
          label="Photo (optional)"
          staged={staged}
          onStage={setStaged}
          onClear={() => setStaged(null)}
          hint="Icefall's media store is not connected yet, so a photo you drop here previews from your own machine and is NOT attached to the post when you share it."
        />
      </div>

      <label className="mt-3 flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={asStory}
          onChange={(e) => setAsStory(e.target.checked)}
          className="mt-0.5 accent-(--color-azure)"
        />
        <span className="text-[12.5px] leading-snug">
          <span className="font-medium text-ink">Share as a story</span>
          <span className="mt-0.5 block text-muted">
            A story shows to climbers for 24 hours and then expires. It stays on this page afterwards as
            your own record.
          </span>
        </span>
      </label>

      {message && (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line-soft pt-3">
        <Button
          variant="primary"
          onClick={() => void share()}
          disabled={caption.trim().length === 0 || contactHits.length > 0}
        >
          {asStory ? "Share story" : "Share post"}
        </Button>
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-muted">
          A post is public the moment you share it — there is no review step. Icefall may remove a post
          that breaks the rules, and the reason will be shown here.
        </p>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The promotional-film slot                                                  */
/* -------------------------------------------------------------------------- */

/**
 * THE RECONCILIATION, so nobody reads this card as decision 15 reversed:
 * owner decision #15 (2026-08-29) removed `video` from the canonical `Company`
 * record and it STAYS removed — this slot is not that field. The owner's
 * OP-01 wording (2026-08-31, "creating promotional psots or videos") is the
 * later ruling and it is about THIS surface: the promotional film lives on
 * the company's SOCIAL presence, in its own S2-shaped store
 * (`getPromoVideo`/`setPromoVideo`). The mountain-film request
 * (`requests/06-*`) stays open, unchanged, on the mountain surface.
 * `VideoField` and `PromoPlayer` are reused exactly as built — click-gated
 * youtube-nocookie, id-not-URL.
 */
function PromoFilmCard() {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const saved = useAsync(
    () => (backend.getPromoVideo ? backend.getPromoVideo(session) : Promise.resolve<PromoVideo>({ source: "none" })),
    [session, revision],
    { source: "none" } as PromoVideo,
  );
  const [draft, setDraft] = useState<PromoVideo | null>(null);
  const [staged, setStaged] = useState<StagedFile | null>(null);
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  const effective = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);
  // `setPromoVideo` stores a YouTube id or clears; there is nowhere to put
  // uploaded bytes, and the button says so instead of pretending.
  const uploadStaged = staged !== null || effective.source === "upload";

  const save = async () => {
    if (!backend.setPromoVideo) return;
    const res = await backend.setPromoVideo(
      session,
      effective.source === "youtube" ? effective.youtubeId : null,
    );
    if (!res.ok) {
      setMessage({ tone: "rejected", text: res.reason });
      return;
    }
    setDraft(null);
    setStaged(null);
    setMessage({
      tone: "neutral",
      text: res.value.source === "none" ? "Film cleared from your profile." : "Film saved to your profile.",
    });
    refresh();
  };

  return (
    <Card className="p-4">
      <h2 className="text-[13px] font-semibold text-ink">Promotional film</h2>
      <p className="mt-0.5 text-[12px] leading-snug text-muted">
        Shown on your public company profile in the Icefall app, alongside your posts.
      </p>

      <PromoPlayer video={effective} staged={staged} className="mt-3 aspect-video w-full" />

      <div className="mt-3">
        {/*
         * Keyed on the SAVED slot: `VideoField` seeds its link input once, at
         * mount, and the slot arrives asynchronously — without the key the
         * field would sit empty beside a film that is set.
         */}
        <VideoField
          key={saved.source === "youtube" ? saved.youtubeId : saved.source}
          video={effective}
          onChange={(v) => {
            setDraft(v);
            setMessage(null);
          }}
          staged={staged}
          onStage={setStaged}
          onClearStaged={() => setStaged(null)}
        />
      </div>

      {message && (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {uploadStaged ? (
        <p className="mt-3 border-t border-line-soft pt-3 text-[11.5px] leading-snug text-muted">
          Uploaded files cannot be saved yet — Icefall's media store is not connected. Paste a YouTube link
          to put a film on your profile.
        </p>
      ) : (
        dirty && (
          <div className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3">
            <Button variant="primary" onClick={() => void save()}>
              {effective.source === "none" ? "Remove film" : "Save film"}
            </Button>
            <Button
              onClick={() => {
                setDraft(null);
                setMessage(null);
              }}
            >
              Discard change
            </Button>
          </div>
        )
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The surface                                                                */
/* -------------------------------------------------------------------------- */

export default function PostsSurface() {
  const session = useSession();
  const { backend, company, revision, refresh } = useOperator();
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);

  /*
   * The social block on the seam is OPTIONAL — the frozen offline demo does
   * not carry it. Absent methods mean the surface is UNAVAILABLE and the
   * screen says so; it never draws an empty feed, which would claim the
   * company has no posts.
   */
  const available =
    typeof backend.getPosts === "function" &&
    typeof backend.createPost === "function" &&
    typeof backend.deletePost === "function" &&
    typeof backend.getPostComments === "function" &&
    typeof backend.getFollowerCount === "function";

  const posts = useAsync(
    () => (backend.getPosts ? backend.getPosts(session) : Promise.resolve<Post[]>([])),
    [session, revision],
    [] as Post[],
  );
  const comments = useAsync(
    async () => {
      if (!backend.getPostComments || posts.length === 0) return {} as Record<string, PostComment[]>;
      const entries = await Promise.all(
        posts.map(async (p) => [p.id, await backend.getPostComments!(session, p.id)] as const),
      );
      return Object.fromEntries(entries);
    },
    [session, revision, posts],
    {} as Record<string, PostComment[]>,
  );
  const followers = useAsync(
    () =>
      backend.getFollowerCount
        ? backend.getFollowerCount(session)
        : Promise.resolve(unavailable("This build has no follow data.")),
    [session, revision],
    unavailable("Counting…"),
  );

  if (!available) {
    return (
      <EmptyState
        title="The social surface is unavailable in this build"
        detail="This version of the portal is not connected to Icefall's posts and follows, so nothing can be shown or shared from here."
      />
    );
  }
  if (!company) return null;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[1.5fr_1fr]">
      {/* LEFT — the composer, then the company's own feed. */}
      <div className="space-y-4">
        <Composer onPosted={refresh} />

        <SectionHeading
          title="Your posts"
          detail="Newest first — the same strictly time-ordered feed climbers see."
        />
        {posts.length === 0 ? (
          <EmptyState
            title="Nothing posted yet"
            detail="Your first post appears here and on your public profile the moment you share it."
          />
        ) : (
          <div className="space-y-3">
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                companyName={company.name}
                comments={comments[p.id] ?? []}
                onAskDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* RIGHT — followers, then the film slot. */}
      <div className="space-y-4">
        <Card className="p-4">
          <div className="lbl">Followers</div>
          <div className="mt-2 min-h-[34px]">
            {/* Counted from real follow rows — never a literal in a component. */}
            <Figure reading={followers} format={(n) => n.toLocaleString("en-GB")} />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
            Climbers following your company in the Icefall app. Your posts appear in their feed, newest
            first.
          </p>
        </Card>

        <PromoFilmCard />
      </div>

      {deleteTarget && (
        <DeletePostDialog
          post={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
