import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3, Bookmark, Heart, Image as ImageIcon, MapPin, MessageCircle,
  MoreHorizontal, Mountain as MountainIcon, Share2,
} from "lucide-react";
import { GuidePhoto } from "@/components/ui";
import { DEMO_NOTICE, IS_DEMO } from "@/data/demo";
import {
  CONTRIBUTORS, FEED_TABS, GROUPS, POST_KIND_LABEL, POSTS, STORIES,
  trendingPeaks, type FeedTab, type Post,
} from "@/data/social";
import { peakFallback, peakImage } from "../peakPlate";
import { cn } from "@/lib/utils";

/**
 * The social feed.
 *
 * A two-column reading surface — the feed itself, and a rail of the things that
 * make a feed feel inhabited: stories, what people are climbing, groups, who
 * posts most.
 *
 * EVERY PERSON ON THIS PAGE IS INVENTED, and the data behind them is gated at
 * its definition so a production build contains none of it. See the note at the
 * top of `data/social.ts` — a social surface seeded with fictional athletes is
 * the single easiest way for a product to lie about its size.
 */
export default function Feed() {
  const [tab, setTab] = useState<FeedTab>("For you");
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const posts = useMemo(() => {
    if (tab === "Trending") return [...POSTS].sort((a, b) => b.likes - a.likes);
    if (tab === "My mountains") return POSTS.filter((p) => p.kind !== "training");
    return POSTS;
  }, [tab]);

  const trending = useMemo(() => trendingPeaks(5), []);

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Social feed</h1>
      <p className="mt-1.5 text-[13px] text-mist">
        What people are climbing, and how it actually went.
      </p>

      {/*
        `grid-cols-1` is load-bearing on a phone, and its absence is what broke
        this page at 390px — the whole thing scrolled sideways, with the search
        field, the tab rail and every post card clipped and body copy cut
        mid-word.

        A `grid` with no base column definition has no explicit track below the
        `xl` breakpoint, so the implicit track sizes to `auto` — and an `auto`
        track will not shrink below its content's min-content width. The feed
        column's min-content came out at 532px inside a 326px container, and the
        grid simply overflowed. Tailwind's `grid-cols-1` is
        `repeat(1, minmax(0, 1fr))`; the `minmax(0, …)` is the part that matters,
        because it lets the track go narrower than its content and forces the
        content to wrap instead.

        The same shape — responsive `grid-cols` with no base — appears on ~59
        grids in this tree. Only this page and Saved actually overflowed, because
        everywhere else the content happens to fit. They are all one wide child
        away from the same bug.
      */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0">
          <Composer />

          <nav className="mt-5 flex gap-1.5 overflow-x-auto">
            {FEED_TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cn(
                  "shrink-0 rounded-pill border px-4 py-2 text-[12.5px] transition-colors",
                  tab === t
                    ? "border-azure bg-azure/10 text-azure"
                    : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
                )}
              >
                {t}
              </button>
            ))}
          </nav>

          {/*
            "Following" is empty because you follow nobody — there are no
            accounts. Saying so is better than quietly showing the same feed
            again and letting the tab look broken.
          */}
          {tab === "Following" ? (
            <div className="mt-5 rounded-card border border-hairline bg-graphite p-6">
              <p className="text-[13px] text-mist">You are not following anyone yet.</p>
              <p className="mt-1.5 text-[12px] text-mist-dim">
                Following needs an account, and ICEFALL has no sign-in yet.
              </p>
            </div>
          ) : posts.length === 0 ? (
            <div className="mt-5 rounded-card border border-hairline bg-graphite p-6">
              <p className="text-[13px] text-mist">No posts yet.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {posts.map((p) => (
                <PostCard
                  key={p.id}
                  p={p}
                  liked={Boolean(liked[p.id])}
                  saved={Boolean(saved[p.id])}
                  onLike={() => setLiked((s) => ({ ...s, [p.id]: !s[p.id] }))}
                  onSave={() => setSaved((s) => ({ ...s, [p.id]: !s[p.id] }))}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <Stories />
          <RailCard title="Trending this week" to="/app/mountains">
            <ol className="space-y-2.5">
              {trending.map(({ peak, posts: n }, i) => (
                <li key={peak.id} className="flex items-center gap-3">
                  <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-pill border border-hairline text-[10.5px] text-mist-dim">
                    {i + 1}
                  </span>
                  <PeakThumb id={peak.id} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-snow">{peak.name}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-mist-dim">
                      {peak.elevationM.toLocaleString("en-GB")} m &middot; {n}{" "}
                      {n === 1 ? "post" : "posts"}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {/* Counted from the feed, not chosen by an editor. */}
            <p className="mt-3 border-t border-hairline pt-2.5 text-[10.5px] text-mist-dim">
              Ranked by posts this week.
            </p>
          </RailCard>

          <RailCard title="Suggested groups" to="/app/social/groups">
            <ul className="space-y-3">
              {GROUPS.slice(0, 3).map((g) => (
                <li key={g.id} className="flex items-center gap-3">
                  <PeakThumb id={g.peakId} size={38} round />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-snow">{g.name}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-mist-dim">
                      {g.members.toLocaleString("en-GB")} members
                    </span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-pill border border-azure/45 px-3 py-1 text-[11.5px] text-azure transition-colors hover:border-azure hover:text-azure-bright"
                  >
                    Join
                  </button>
                </li>
              ))}
            </ul>
          </RailCard>

          <RailCard title="Top contributors" to="/app/social/leaderboard">
            <ul className="space-y-3">
              {CONTRIBUTORS.slice(0, 3).map((c, i) => (
                <li key={c.id} className="flex items-center gap-3">
                  <span className="tnum w-4 shrink-0 text-[11px] text-mist-dim">{i + 1}</span>
                  <GuidePhoto name={c.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-snow">{c.name}</span>
                    <span className="tnum mt-0.5 block text-[11px] text-mist-dim">
                      {c.points.toLocaleString("en-GB")} points
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </RailCard>
        </aside>
      </div>

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE} Every climber, post, group and ranking on this page is invented to show the
          layout — nobody here has an account.
        </p>
      )}
    </div>
  );
}

function Composer() {
  const [text, setText] = useState("");
  const actions = [
    { icon: ImageIcon, label: "Photo / video" },
    { icon: BarChart3, label: "Activity" },
    { icon: MapPin, label: "Location" },
  ];
  return (
    <section className="rounded-card border border-hairline bg-graphite p-5 transition-colors focus-within:border-azure/55">
      <div className="flex items-start gap-3.5">
        <GuidePhoto name="You" size={40} />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Share your adventure…"
          aria-label="Share your adventure"
          /*
            `w-full min-w-0` because a <textarea> carries an intrinsic width
            from its `cols` default and a flex item will not shrink below its
            min-content width. This is not what caused the phone overflow — see
            the grid above — but it is what would cause the next one once the
            column is allowed to narrow.
          */
          className="min-h-[44px] w-full min-w-0 flex-1 resize-none bg-transparent pt-2 text-[13.5px] text-snow outline-none placeholder:text-mist-dim"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        {actions.map((a) => (
          <span
            key={a.label}
            className="flex items-center gap-2 rounded-pill px-2.5 py-1.5 text-[12px] text-mist-dim"
          >
            <a.icon size={14} strokeWidth={1.8} />
            {a.label}
          </span>
        ))}
        {/*
          Nothing here posts. There is no account, no upload and nowhere for a
          post to go, so the button says what pressing it would need rather than
          swallowing the click.
        */}
        <span className="ml-auto rounded-pill border border-hairline-strong px-4 py-2 text-[12.5px] text-mist-dim">
          Posting needs an account
        </span>
      </div>
    </section>
  );
}

function PostCard({
  p, liked, saved, onLike, onSave,
}: {
  p: Post;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onSave: () => void;
}) {
  const [lead, ...rest] = p.photos;
  return (
    <article className="overflow-hidden rounded-card border border-hairline bg-graphite">
      <div className="flex items-start gap-3.5 p-5 pb-3.5">
        <GuidePhoto name={p.author} size={44} />
        <div className="min-w-0 flex-1">
          {/* No verification tick on a person — see data/social.ts. */}
          <p className="truncate text-[14px] text-snow">{p.author}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-mist">{p.trip}</p>
          <p className="mt-0.5 truncate text-[11px] text-mist-dim">
            {p.when} &middot; {p.location}
          </p>
        </div>
        <MoreHorizontal size={17} strokeWidth={1.8} className="shrink-0 text-mist-dim" aria-hidden />
      </div>

      <div className="px-5">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-azure/40 px-2.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.11em] text-azure">
          <MountainIcon size={10} strokeWidth={2} />
          {POST_KIND_LABEL[p.kind]}
        </span>
        <h2 className="mt-2.5 text-[17px] font-light leading-snug text-snow">{p.title}</h2>
        <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-mist">{p.body}</p>
      </div>

      {/*
        THE GRID HAS THREE SHAPES, NOT TWO.
        It previously had one large tile plus a two-slot column, and a post with
        exactly two photographs filled only one of those slots — leaving a hole
        with the "+6" badge floating in it. Each case gets its own layout, and
        the overflow badge always lands on a tile that exists.
      */}
      {p.photos.length > 0 && (
        <div className="mt-4 px-5">
          {rest.length === 0 ? (
            <PhotoTile id={lead} className="h-[300px]" more={p.morePhotos} />
          ) : rest.length === 1 ? (
            <div className="grid grid-cols-2 gap-1.5">
              <PostPhoto id={lead} className="h-[228px]" />
              <PhotoTile id={rest[0]} className="h-[228px]" more={p.morePhotos} />
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-1.5">
              <PostPhoto id={lead} className="h-[268px]" />
              <div className="grid grid-rows-2 gap-1.5">
                <PostPhoto id={rest[0]} className="h-full" />
                <PhotoTile id={rest[1]} className="h-full" more={p.morePhotos} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-5 border-t border-hairline px-5 py-3.5">
        <button
          type="button"
          onClick={onLike}
          aria-pressed={liked}
          className="flex items-center gap-2 text-[12.5px] text-mist transition-colors hover:text-snow"
        >
          <Heart
            size={16}
            strokeWidth={1.9}
            className={cn(liked ? "fill-danger text-danger" : "text-mist-dim")}
          />
          <span className="tnum">{(p.likes + (liked ? 1 : 0)).toLocaleString("en-GB")}</span>
        </button>
        <span className="flex items-center gap-2 text-[12.5px] text-mist-dim">
          <MessageCircle size={16} strokeWidth={1.9} />
          <span className="tnum">{p.comments}</span>
        </span>
        <span className="flex items-center gap-2 text-[12.5px] text-mist-dim">
          <Share2 size={16} strokeWidth={1.9} />
          <span className="tnum">{p.shares}</span>
        </span>
        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? "Unsave post" : "Save post"}
          className="ml-auto text-mist-dim transition-colors hover:text-snow"
        >
          <Bookmark size={16} strokeWidth={1.9} className={cn(saved && "fill-azure text-azure")} />
        </button>
      </div>
    </article>
  );
}

/** A photograph with the overflow count on it, when there is one. */
function PhotoTile({ id, className, more }: { id: string; className?: string; more: number }) {
  return (
    <div className={cn("relative", className)}>
      <PostPhoto id={id} className="h-full" />
      {more > 0 && (
        <span className="tnum absolute bottom-2 right-2 rounded-pill bg-obsidian/80 px-2.5 py-1 text-[11px] text-snow backdrop-blur">
          +{more}
        </span>
      )}
    </div>
  );
}

/**
 * A post's photograph.
 *
 * These are the app's own peak photographs, not a climber's camera roll —
 * there are no uploads. Each one is at least a picture of the mountain the post
 * is about, which is the most that can honestly be said for it.
 */
function PostPhoto({ id, className }: { id: string; className?: string }) {
  return (
    <img
      src={peakImage(id)}
      alt=""
      aria-hidden
      loading="lazy"
      onError={(ev) => {
        const el = ev.currentTarget;
        if (!el.dataset.fellBack) {
          el.dataset.fellBack = "1";
          el.src = peakFallback(id);
        }
      }}
      className={cn("w-full rounded-tile object-cover", className)}
    />
  );
}

function PeakThumb({ id, size, round }: { id: string; size: number; round?: boolean }) {
  return (
    <img
      src={peakImage(id)}
      alt=""
      aria-hidden
      loading="lazy"
      width={size}
      height={size}
      onError={(ev) => {
        const el = ev.currentTarget;
        if (!el.dataset.fellBack) {
          el.dataset.fellBack = "1";
          el.src = peakFallback(id);
        }
      }}
      style={{ width: size, height: size }}
      className={cn("shrink-0 border border-hairline object-cover", round ? "rounded-full" : "rounded-tile")}
    />
  );
}

function Stories() {
  return (
    <section className="rounded-card border border-hairline bg-graphite p-5">
      <div className="flex items-baseline justify-between">
        <p className="section-label">Stories</p>
      </div>
      <div className="no-scrollbar mt-3.5 flex gap-3.5 overflow-x-auto pb-1">
        <div className="flex w-[58px] shrink-0 flex-col items-center gap-1.5">
          <span className="relative grid h-[52px] w-[52px] place-items-center rounded-full border border-dashed border-hairline-strong">
            <GuidePhoto name="You" size={44} />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-graphite bg-azure text-[11px] leading-none text-obsidian">
              +
            </span>
          </span>
          <span className="w-full truncate text-center text-[10.5px] text-mist-dim">Your story</span>
        </div>
        {STORIES.map((s) => (
          <div key={s.id} className="flex w-[58px] shrink-0 flex-col items-center gap-1.5">
            <span
              className={cn(
                "grid h-[52px] w-[52px] place-items-center rounded-full",
                s.unseen ? "bg-gradient-to-br from-azure to-azure-deep p-[2px]" : "border border-hairline p-[2px]",
              )}
            >
              <span className="grid h-full w-full place-items-center overflow-hidden rounded-full border-2 border-graphite">
                <PeakThumb id={s.peakId} size={44} round />
              </span>
            </span>
            <span className="w-full truncate text-center text-[10.5px] text-mist-dim">
              {s.author.split(" ")[0]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function RailCard({
  title, to, children,
}: {
  title: string;
  to: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-hairline bg-graphite p-5">
      <div className="flex items-baseline justify-between">
        <p className="section-label">{title}</p>
        <Link to={to} className="text-[11.5px] text-azure hover:text-azure-bright">
          View all
        </Link>
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  );
}
