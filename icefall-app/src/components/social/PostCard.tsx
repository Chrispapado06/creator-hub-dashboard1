import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Flag, MessageCircle, MoreHorizontal, Send, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/primitives";
import { LikeButton } from "@/components/social/LikeButton";
import { fmtRelative } from "@/lib/format";
import { PERSON_ROUTE } from "@/search/people";
import { postIdKind } from "@/social/posts";
import { canNameAnAccount } from "@/social/publicProfile";
import { storyTimeLeft, type Post } from "@/social/types";
import { cn } from "@/lib/utils";

/**
 * ONE POST IN A FEED.
 *
 * Built on `Post` — the server's shape — which is why this card is quieter than
 * the demo card in `Community.tsx`. `public.posts` is a body, optional media and
 * a timestamp; there is no kind column, no stats, no milestone ring, so there
 * are no chips here for any of it. A card that draws a taxonomy the table
 * cannot store is a card that will one day draw the wrong one.
 *
 * ── THE BYLINE, AND THE THREE MARKS ──────────────────────────────────────────
 *
 * `author_id` is always the human who pressed the button, so a COMPANY post
 * leads with the company's name and names the person underneath — the schema's
 * own rule ("a company post always traces to the person who pressed the
 * button") made visible rather than left in the database.
 *
 * The tick is the app's existing treatment — lucide `BadgeCheck`, `shrink-0`, an
 * `aria-label` and a `title` — with one deliberate difference: it is drawn in
 * MIST, NOT AZURE. The owner's three-marks ruling (31 Aug, carried in
 * `20260831160000_identity_verification.sql`) assigns grey to identity, gold to
 * checked credentials and blue to paid membership, and states the three may
 * never borrow each other's colour. Azure is this app's blue, so an azure tick
 * beside a name would say "paying member" to anyone who had read the ruling and
 * "ICEFALL vetted this person" to everyone who had not. It says neither: it
 * says ICEFALL confirmed who they are, and nothing else.
 *
 * It is never drawn beside a COMPANY name for the same reason — identity
 * verification is a fact about a person, and a tick after a company's name
 * reads as ICEFALL endorsing the company. This card makes no claim about any
 * company beyond printing its name.
 *
 * ── WHAT THIS CARD DOES NOT OWN ──────────────────────────────────────────────
 *
 * Comments and reporting are somebody else's screens. This raises
 * `onOpenComments` and `onReport` and stops there — no thread, no report form,
 * no toast pretending a report went somewhere. The overflow menu is here only
 * because a menu is the affordance; what "Report" then does belongs to the feed.
 *
 * ── THE TWO TAPS, AND WHY NEITHER ONE WRAPS THE CARD ─────────────────────────
 *
 * The byline opens the PERSON. The words and the photograph open the POST.
 * That is the owner's ruling (3 Sep) and it is two targets, never one.
 *
 * NOTHING HERE WRAPS A CONTROL. This card holds a like, a comment button, an
 * options menu, two disabled marks and sometimes a `<video>` with its own
 * controls, and an `<a>` around any of them is invalid HTML that breaks the
 * keyboard and fires a navigation on a like. So the links wrap only inert
 * markup: the byline block (avatar, name, marks, byline line — no control is
 * in it), the words (chip, headline, stats, body) and a PHOTOGRAPH. A video is
 * deliberately left out of the link for exactly this reason, and there is no
 * stretched overlay anywhere — an absolutely-positioned link across the card
 * would sit over the like and the menu, and raising each of those above it is
 * five z-index bets that only have to lose once.
 *
 * BOTH LINKS ARE CONDITIONAL, because a link that resolves to nothing is worse
 * than plain text. The byline is drawn unlinked for a COMPANY (there is no
 * company page keyed by `companies.id` in this app to send anyone to) and for
 * any author id that no account could hold — the demo feed's bylines are
 * `a-alex`, and `social/community.ts` is explicit that those authors are
 * bylines rather than discoverable people. The words are drawn unlinked for an
 * id no post could hold, which is the demo feed again: `p-summit-1` is neither
 * a `posts` uuid nor one of this device's own `post:`/`log:` ids, so the page
 * behind such a link could only tell the reader the link was wrong. Tapping
 * one of those cards still opens its thread exactly as it did before — see
 * `Community.tsx`, whose card gesture stands aside for a real link and takes
 * over where there is none.
 */
/**
 * The extras the owner's 1:1 feed mockup draws on a training post.
 *
 * A SEPARATE PROP, not fields bolted onto `Post`. `Post` is derived from the
 * real `posts` row and every field on it is a column; a chip label and a
 * headline stat trio are presentation, and putting them there would make the
 * type stop describing the table. Optional throughout, so every screen already
 * rendering a plain post is untouched.
 */
export interface PostDetail {
  /** "ACTIVITY" — what kind of post this is, as the mockup's chip. */
  chip?: string;
  /** The headline, kept out of the body so it can be set apart. */
  title?: string;
  /** "Mont Blanc · July 2026" — the objective, which is why the post exists. */
  subtitle?: string;
  /** Distance / elevation / time. Rendered only when all of them are real. */
  stats?: { label: string; value: string }[];
}

export function PostCard({
  post,
  detail,
  onOpenComments,
  onReport,
  onLike,
  onShare,
  className,
}: {
  post: Post;
  detail?: PostDetail;
  onOpenComments: (post: Post) => void;
  onReport: (post: Post) => void;
  /**
   * Optional, and additive on purpose — every screen written against the
   * three-prop contract keeps working without it.
   *
   * With no handler the like is a mark for this session and nothing more, which
   * is honest while `posts` has no likes table to write to (see
   * `@/social/types`). Pass one the moment there is somewhere to put it.
   */
  onLike?: (post: Post, next: boolean) => void;
  /** Opens the share sheet. Without it there is no share control — never a
      button that does nothing. */
  onShare?: (post: Post) => void;
  className?: string;
}) {
  const still = useReducedMotion();
  const [menu, setMenu] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * The like the reader has made, seeded from the row and re-seeded when the
   * row changes underneath (a refetch, or a recycled card).
   *
   * The displayed count is DERIVED rather than stored: the server's figure plus
   * one if the reader has liked it since the row was read, minus one if they
   * have unliked it. Nothing else moves this number — the card cannot invent
   * anyone else's like, because it has no way to learn of one.
   */
  const settled = post.likedByMe ?? false;
  const [liked, setLiked] = useState(settled);
  useEffect(() => {
    setLiked(post.likedByMe ?? false);
  }, [post.id, post.likedByMe]);

  const base = post.likeCount ?? 0;
  const count = Math.max(0, base + (liked === settled ? 0 : liked ? 1 : -1));

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const author = post.author;
  const company = author.kind === "company" ? author.company : undefined;
  const headline = company?.name ?? author.name;
  const avatarUrl = company?.logoUrl ?? author.avatarUrl;
  /* The person behind a company post is stated, never hidden — the schema's
     accountability rule, printed. */
  /* The OBJECTIVE wins over the region when there is one: "Mont Blanc · July
     2026" is why the post exists, where "Around Chamonix" is only where its
     author happens to be. */
  const meta = company
    ? `Posted by ${author.name}`
    : (detail?.subtitle ??
      [author.handle && `@${author.handle}`, author.location].filter(Boolean).join(" · "));
  const story = storyTimeLeft(post);
  const media = post.media;
  const sized = media?.width && media?.height;

  /**
   * WHERE THE BYLINE GOES, OR NOWHERE AT ALL.
   *
   * `canNameAnAccount` is `publicProfile.ts`'s own test — the uuid type and the
   * `profiles_username_shape` CHECK — exported rather than copied so this card
   * and the screen it points at cannot come to different conclusions about the
   * same string. Anything it rejects cannot be any account's in any build, so
   * a link would land on "no climber here" and blame the reader's tap.
   *
   * A COMPANY BYLINE IS NEVER A LINK. `author.id` on a company post is the
   * HUMAN who pressed the button, so linking it would open a person the card
   * is not naming, and there is no page in this app keyed by `companies.id` to
   * open instead. The person is still named in the line underneath, which is
   * the schema's accountability rule and is all this card claims.
   */
  const personHref =
    company || !canNameAnAccount(author.id)
      ? null
      : `${PERSON_ROUTE}${encodeURIComponent(author.id)}`;

  /**
   * WHERE THE POST GOES, OR NOWHERE AT ALL.
   *
   * `postIdKind` is `social/posts.ts`'s own test, and it is the same one
   * `PostDetail` resolves by: `post:`/`log:` is answerable from this device,
   * a uuid is a `posts` row, and everything else — the demo feed's
   * `p-summit-1`, a truncated paste — is an id no post of either kind could
   * hold. Asking the module that does the resolving is what stops this card
   * from linking to a page whose only sentence would be that the link is
   * wrong.
   */
  const postHref =
    postIdKind(post.id) === "unknown" ? null : `/social/post/${encodeURIComponent(post.id)}`;

  /**
   * THE BYLINE AS ONE TARGET.
   *
   * Avatar, name, identity mark, guide chip and the line under them are one
   * block whether or not it is a link: a 40px avatar is a poor target in
   * gloves, and the person aiming at it should be able to miss by half a card
   * and still arrive. It is also why the byline is not split — a second target
   * a few pixels under the name is the adjacency this app's own rule forbids.
   *
   * THE LINE UNDER THE NAME IS THE BYLINE'S, WHATEVER IS IN IT. It normally
   * holds the handle and the location, which are identity; a caller passing
   * `detail.subtitle` takes that slot instead, and the objective it prints
   * then belongs to the person's target rather than the post's. That is the
   * deliberate half of the trade: splitting one line of the byline off to a
   * second destination would put two targets 4px apart, which is worse in
   * gloves than an objective that opens the climber who set it.
   *
   * NO CONTROL IS INSIDE IT. The timestamp and the options button are siblings
   * of this block, outside the link, which is what keeps the link legal.
   */
  /* The drawing's byline: a small round photo, the name in bold with the
     identity shield beside it, and one quiet line under it. */
  const shownName = company ? headline : author.handle ? author.handle : headline;
  const identity = (
    <>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          aria-hidden
          loading="lazy"
          className="h-8 w-8 shrink-0 rounded-full border border-hairline object-cover"
        />
      ) : (
        <Avatar name={headline} size={32} />
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-[14px] font-semibold text-snow">{shownName}</span>
          {author.identityVerified && !company && (
            <span className="shrink-0 text-mist" title="Identity verified by ICEFALL">
              <ShieldCheck size={13} strokeWidth={2} aria-hidden />
              <span className="sr-only">Identity verified by ICEFALL</span>
            </span>
          )}
          {author.kind === "guide" && (
            <span className="shrink-0 rounded-pill border border-hairline-strong px-2 py-[2px] text-[9.5px] uppercase tracking-[0.1em] text-mist-dim">
              Guide
            </span>
          )}
        </p>
        {meta && <p className="truncate text-[11.5px] text-mist-dim">{meta}</p>}
      </div>
    </>
  );

  const captionExtras = (
    <>
      {detail?.chip && (
        <p className="px-4 pt-2">
          <span className="inline-flex items-center rounded-pill border border-hairline px-2.5 py-1 text-[9.5px] uppercase tracking-[0.12em] text-mist">
            {detail.chip}
          </span>
        </p>
      )}
      {detail?.title && (
        <p className="px-4 pt-2 text-[16px] leading-tight text-snow">{detail.title}</p>
      )}
      {detail?.stats && detail.stats.length > 0 && (
        <div className="flex gap-6 px-4 pt-2.5">
          {detail.stats.map((st) => (
            <div key={st.label}>
              <p className="tnum text-[16px] font-light leading-none text-snow">{st.value}</p>
              <p className="mt-1 text-[11px] text-mist-dim">{st.label}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const photo = media && (
    <img
      src={media.url}
      alt={media.alt ?? ""}
      aria-hidden={media.alt ? undefined : true}
      loading="lazy"
      className="h-full w-full object-cover"
    />
  );

  return (
    /*
     * THE DRAWING'S POST (Instagram, owner 2026-09-07): no card, no border.
     * Byline, media edge to edge, the action row, then the caption with the
     * name in bold and the time under it. The menu sits outside the flow so
     * nothing clips it.
     */
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        {personHref ? (
          <Link to={personHref} className="flex min-w-0 flex-1 items-center gap-3">
            {identity}
            <span className="sr-only">— open their ICEFALL profile</span>
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
        )}
        <button
          type="button"
          aria-label="Post options"
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
          className="-mr-1 shrink-0 rounded-full p-1 text-snow transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
        >
          <MoreHorizontal size={20} strokeWidth={1.7} />
        </button>
      </div>

      {story && (
        <p className="px-4 pb-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em]",
              story === "ended"
                ? "border-hairline-strong text-mist-dim"
                : "border-azure/45 bg-azure/[0.10] text-azure",
            )}
          >
            {story === "ended" ? "Story ended" : `Story · ${story}`}
          </span>
        </p>
      )}

      {/* Media, edge to edge. A photograph opens the post; a video keeps its
          own controls. The box is reserved from the uploader's dimensions when
          there are any, and falls back to the drawing's 4:5 rather than a
          guess. */}
      {media && (
        <div
          className="relative w-full overflow-hidden bg-slate/40"
          style={{ aspectRatio: sized ? `${media.width} / ${media.height}` : "4 / 5" }}
        >
          {media.kind === "video" ? (
            <video
              src={media.url}
              controls
              playsInline
              preload="metadata"
              aria-label={media.alt || "Video attached to this post"}
              className="h-full w-full object-cover"
            />
          ) : postHref ? (
            <Link to={postHref} className="block h-full w-full focus-visible:outline-offset-[-2px]">
              {photo}
              <span className="sr-only">Open this post and its comments</span>
            </Link>
          ) : (
            photo
          )}
        </div>
      )}

      <div className="flex items-center gap-4 px-4 pt-2.5">
        <LikeButton
          postId={post.id}
          liked={liked}
          count={count}
          onToggle={(next) => {
            setLiked(next);
            onLike?.(post, next);
          }}
        />
        <button
          type="button"
          onClick={() => onOpenComments(post)}
          aria-label={post.commentCount ? `Comments, ${post.commentCount}` : "Comments"}
          className="flex items-center gap-1.5 rounded-pill text-[13px] text-snow transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
        >
          <MessageCircle size={22} strokeWidth={1.6} aria-hidden />
          {!!post.commentCount && (
            <span aria-hidden className="tnum">
              {post.commentCount}
            </span>
          )}
        </button>
        {onShare && postHref && (
          <button
            type="button"
            onClick={() => onShare(post)}
            aria-label="Share post"
            className="rounded-pill text-snow transition-colors hover:text-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
          >
            <Send size={21} strokeWidth={1.6} aria-hidden />
          </button>
        )}
      </div>

      {/* The drawing's "username caption": the name in bold leads the body; a
          summit log's chip, headline and figures follow underneath. */}
      <div className="px-4 pb-1 pt-2">
        {post.body.trim().length > 0 && (
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-snow">
            <span className="font-semibold">{shownName}</span> {post.body}
          </p>
        )}
        {postHref && (detail?.chip || detail?.title || detail?.stats?.length) ? (
          <Link to={postHref} className="-mx-4 block focus-visible:outline-offset-[-2px]">
            {captionExtras}
            <span className="sr-only">— open this post and its comments</span>
          </Link>
        ) : (
          <div className="-mx-4">{captionExtras}</div>
        )}
        <p className="tnum pt-1.5 text-[11px] text-mist-dim">{fmtRelative(post.createdAt)}</p>
      </div>

      <AnimatePresence>
        {menu && (
          <motion.div
            role="menu"
            aria-label="Post options"
            initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -3 }}
            transition={{ duration: still ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-3 top-12 z-20 w-44 origin-top-right overflow-hidden rounded-tile border border-hairline-strong bg-slate shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onReport(post);
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left text-[12.5px] text-snow transition-colors hover:bg-white/[0.04]"
            >
              <Flag size={14} strokeWidth={1.7} aria-hidden className="shrink-0 text-mist" />
              Report
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
