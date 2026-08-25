import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ChevronRight, Flag, Heart, MessageCircle, MoreHorizontal, Mountain as MountainIcon,
  Plus, Route as RouteIcon, Search as SearchIcon, ShieldCheck, TriangleAlert, Users, X,
} from "lucide-react";
import { Card, Disclaimer } from "@/components/ui/primitives";
import { LogSummitSheet } from "@/components/domain/SummitLogKit";
import { CreatePostSheet } from "@/components/domain/PostComposer";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { ProgressRing } from "@/components/ui/charts";
import {
  COMMUNITY_DEMO_NOTICE, COMMUNITY_HOUSE_RULE, FEED_FILTERS, SHOW_DEMO_COMMUNITY,
  SUMMIT_VERIFIED_MEANING, agoLabel, communityPosts, type FeedFilter,
} from "@/social/community";
import { CREATE_OPTIONS, POST_KIND_LABEL, type CommunityPost, type PostKind } from "@/social/types";
import { MIN_QUERY, searchSocial } from "@/social/search";
import { usePrimaryGoal } from "@/state/AppState";
import { cn } from "@/lib/utils";

/**
 * EXPLORE → SOCIAL → COMMUNITY.
 *
 * A feed of mountain activity, not a timeline. Every post is anchored to a
 * mountain and a date, because that is the only reason two people on this app
 * have anything to say to each other.
 *
 * Four things are deliberately absent, and their absence is the design:
 *
 *   · No follower or following counts, and no ranking of people.
 *   · No message button. Communication happens inside a group, between people
 *     who have agreed to be in one — see the house rule below.
 *   · No exact location, ever. Authors carry a band ("Around Chamonix"); the
 *     model has no field for a coordinate, so no card can leak one.
 *   · No age. Profiles use bands where they need age at all.
 */
export default function Community() {
  const [filter, setFilter] = useState<FeedFilter>("for-you");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [logging, setLogging] = useState(false);
  const [posting, setPosting] = useState(false);
  const goal = usePrimaryGoal();

  const results = useMemo(() => searchSocial(query), [query]);
  const searching = results.ran;

  const posts = useMemo(() => {
    const all = communityPosts();
    const spec = FEED_FILTERS.find((f) => f.id === filter);

    if (spec?.kinds) return all.filter((p) => spec.kinds!.includes(p.kind));
    if (filter === "my-mountains" && goal?.name) {
      return all.filter((p) => p.objective.mountain === goal.name);
    }
    // "Nearby" needs a location the athlete has opted into sharing and a
    // backend to compare against; until then it is the same feed rather than a
    // filter that silently pretends to have run.
    return all;
  }, [filter, goal?.name]);

  return (
    <Screen padded={false}>
      {/* ---- Search, then filter chips ------------------------------------
          The chips are hidden while a search is running. "For You" and
          "Following" slice the feed by who wrote something; a search already
          answered that question with the query, and leaving the chips lit would
          imply the results had been filtered by them as well. */}
      <div className="sticky top-0 z-20 border-b border-hairline bg-obsidian/95 px-5 py-3 backdrop-blur">
        <div className="relative">
          <SearchIcon
            size={15}
            strokeWidth={1.8}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-dim"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people and posts"
            aria-label="Search people and posts"
            className={cn(
              "h-10 w-full rounded-pill border border-hairline-strong bg-slate/60 pl-9 pr-9",
              "text-[13.5px] text-snow placeholder:text-mist-dim",
              "transition-colors focus:border-azure/50 focus:bg-slate",
              // Safari draws its own clear button on type=search, next to ours.
              "[&::-webkit-search-cancel-button]:hidden",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-mist-dim transition-colors hover:text-snow"
            >
              <X size={14} strokeWidth={2} />
            </button>
          )}
        </div>

        {!searching && (
          <div className="no-scrollbar mt-3 overflow-x-auto">
            <div className="flex w-max gap-2">
              {FEED_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "shrink-0 rounded-pill border px-3.5 py-1.5 text-[12px] transition-colors",
                    filter === f.id
                      ? "border-azure/55 bg-azure/[0.12] text-azure"
                      : "border-hairline-strong text-mist hover:text-snow",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/*
        Two things are deliberately not at the top of this feed any more.

        NO COMPOSER BLOCK. It opened with two stacked buttons — "I've made it to
        a summit" and "Create post" — which pushed the feed itself below the fold
        to ask a question the floating ＋ already asks. Creating is reached from
        that control alone, which is where every other feed in the world puts it.

        NO "YOUR POSTS". A feed is what other people are doing; your own summit
        logs reading back at you is a mirror, not a community. They live on your
        profile — Profile → Posts renders exactly these two lists, sorted
        together — which is where you go to see what you have written.
      */}
      {searching ? (
        <SearchResults query={query} results={results} />
      ) : (
      <Stagger className="px-5 pb-24 pt-4">
        {filter === "following" && (
          <Rise className="pt-3">
            <Disclaimer>
              Following needs connections, and connections need accounts ICEFALL has not built. This
              is the same feed — nothing has been filtered by who you follow.
            </Disclaimer>
          </Rise>
        )}

        {posts.map((post) => (
          <Rise key={post.id} className="pt-3">
            <PostCard
              post={post}
            />
          </Rise>
        ))}

        {posts.length === 0 && (
          <Rise className="pt-4">
            <Card>
              <p className="text-[13px] text-snow">Nothing here yet.</p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
                {filter === "my-mountains" && !goal
                  ? "Set an objective and this fills with what other people are doing on it."
                  : "No posts match this filter."}
              </p>
            </Card>
          </Rise>
        )}

        {/* ---- House rule + honesty ---------------------------------------- */}
        <Rise className="pt-6">
          <div className="rounded-card border border-hairline bg-graphite p-4">
            <p className="flex items-center gap-2 text-[12.5px] text-snow">
              <ShieldCheck size={14} strokeWidth={1.7} className="shrink-0 text-azure" />
              {COMMUNITY_HOUSE_RULE}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-mist-dim">
              Private messages are only available inside a group you have both joined. Accounts
              under 18 have restricted people discovery and no private messaging.
            </p>
          </div>
          {SHOW_DEMO_COMMUNITY && <Disclaimer className="mt-3">{COMMUNITY_DEMO_NOTICE}</Disclaimer>}
        </Rise>
      </Stagger>
      )}

      {/* ---- Create -------------------------------------------------------
          Portalled into the phone shell: `fixed` positions against the browser
          viewport, which on desktop pinned this to the window's corner, well
          outside the 430px phone frame. */}
      {createPortal(
        <button
          type="button"
          aria-label="Create a post"
          onClick={() => setCreating(true)}
          className="absolute right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-azure text-obsidian shadow-lg transition-colors hover:bg-azure-bright"
          style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px) + var(--tabbar-h, 0px))" }}
        >
          <Plus size={24} strokeWidth={2} />
        </button>,
        document.querySelector("[data-phone-shell]") ?? document.body,
      )}

      {creating && (
        <CreateSheet
          onClose={() => setCreating(false)}
          onPick={(kind) => {
            setCreating(false);
            // "Summit" is a structured record with a route and conditions, not
            // a caption — it has its own composer. Everything else is a post.
            if (kind === "summit") setLogging(true);
            else setPosting(true);
          }}
        />
      )}
      {logging && <LogSummitSheet onClose={() => setLogging(false)} />}
      {posting && <CreatePostSheet onClose={() => setPosting(false)} />}
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* Search results                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What a search turned up — people first, then posts.
 *
 * The people section states plainly that the directory is empty rather than
 * rendering a blank space. An empty result that looks like "no matches" implies
 * a search ran against a populated list of climbers and found nobody by that
 * name; the truth is that there is nobody to search yet, and those are very
 * different things to a person deciding whether this app has anyone on it.
 */
function SearchResults({
  query,
  results,
}: {
  query: string;
  results: ReturnType<typeof searchSocial>;
}) {
  const { people, posts } = results;

  return (
    <Stagger className="px-5 pb-24 pt-4">
      <Rise>
        <div className="flex items-baseline justify-between">
          <p className="section-label">People</p>
          <span className="tnum text-[11.5px] text-mist-dim">{people.length}</span>
        </div>
      </Rise>

      {people.length === 0 ? (
        <Rise className="pt-2.5">
          <Card>
            <p className="text-[12.5px] leading-relaxed text-mist">
              There is nobody to find yet. ICEFALL has no accounts and no server, so no climber can
              be looked up by name — this is an empty network rather than a search that came back
              short.
            </p>
          </Card>
        </Rise>
      ) : (
        people.map((athlete) => (
          <Rise key={athlete.id} className="pt-2.5">
            <Link
              to={`/explore/people/${athlete.id}`}
              className="flex items-center gap-3 rounded-card border border-hairline bg-graphite p-3.5 transition-colors hover:border-hairline-strong"
            >
              <Avatar name={athlete.displayName} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] text-snow">
                  {athlete.displayName}
                </span>
                {athlete.bio && (
                  <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">
                    {athlete.bio}
                  </span>
                )}
              </span>
              <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
            </Link>
          </Rise>
        ))
      )}

      <Rise className="pt-7">
        <div className="flex items-baseline justify-between">
          <p className="section-label">Posts</p>
          <span className="tnum text-[11.5px] text-mist-dim">{posts.length}</span>
        </div>
      </Rise>

      {posts.length === 0 ? (
        <Rise className="pt-2.5">
          <Card>
            <p className="text-[12.5px] text-mist">
              No posts mention “{query.trim()}”.
            </p>
          </Card>
        </Rise>
      ) : (
        posts.map((post) => (
          <Rise key={post.id} className="pt-3">
            <PostCard post={post} />
          </Rise>
        ))
      )}
    </Stagger>
  );
}

/* -------------------------------------------------------------------------- */
/* Posts                                                                      */
/* -------------------------------------------------------------------------- */

const KIND_TONE: Record<PostKind, string> = {
  activity: "border-hairline-strong bg-obsidian/70 text-snow",
  summit: "border-summit/50 bg-summit/[0.12] text-summit",
  "route-report": "border-alert/50 bg-alert/[0.10] text-alert",
  "looking-for-partners": "border-azure/50 bg-azure/[0.10] text-azure",
  milestone: "border-azure/50 bg-azure/[0.10] text-azure",
  group: "border-azure/50 bg-azure/[0.10] text-azure",
};

const KIND_ICON: Record<PostKind, typeof MountainIcon> = {
  activity: RouteIcon,
  summit: Flag,
  "route-report": TriangleAlert,
  "looking-for-partners": Users,
  milestone: MountainIcon,
  group: Users,
};

function PostCard({ post }: { post: CommunityPost }) {
  const [menu, setMenu] = useState(false);
  const Icon = KIND_ICON[post.kind];

  return (
    <div className="overflow-hidden rounded-card border border-hairline bg-graphite">
      {/* ---- Byline ----------------------------------------------------- */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <Avatar name={post.author.name} src={post.author.avatar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] text-snow">{post.author.name}</p>
          <p className="truncate text-[11.5px] text-mist-dim">
            {post.objective.mountain} · {post.objective.when} · {post.author.region}
          </p>
        </div>
        <span className="tnum shrink-0 text-[11px] text-mist-dim">{agoLabel(post.hoursAgo)}</span>
        <button
          type="button"
          aria-label="Post options"
          onClick={() => setMenu(true)}
          className="shrink-0 text-mist-dim hover:text-snow"
        >
          <MoreHorizontal size={17} strokeWidth={1.7} />
        </button>
      </div>

      <div className="px-4 pt-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[10px] uppercase tracking-[0.1em]",
            KIND_TONE[post.kind],
          )}
        >
          <Icon size={11} strokeWidth={1.9} />
          {post.kind === "summit" && post.summit?.verified
            ? "Summit verified"
            : POST_KIND_LABEL[post.kind]}
        </span>

        <h3 className="mt-2.5 text-[17px] leading-snug text-snow">{post.title}</h3>

        {post.summit && (
          <p className="tnum mt-1 text-[12.5px] text-mist">
            {post.summit.elevationM.toLocaleString()} m · {post.summit.range}
          </p>
        )}
        {post.body && <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{post.body}</p>}

        {post.stats && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {post.stats.map((s) => (
              <div key={s.label}>
                <p className="tnum text-[15px] font-light text-snow">{s.value}</p>
                <p className="mt-0.5 text-[10.5px] text-mist-dim">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {post.bullets && (
          <ul className="mt-2.5 space-y-1">
            {post.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2 text-[12.5px] text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {b}
              </li>
            ))}
          </ul>
        )}

        {post.report && <RouteReport report={post.report} />}
        {post.milestone && <Milestone milestone={post.milestone} />}
      </div>

      {post.photo && (
        <div className="relative mt-3.5 h-[190px]">
          <img src={post.photo} alt="" aria-hidden loading="lazy" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-graphite/80 to-transparent" />
        </div>
      )}

      {post.tags && (
        <div className="flex flex-wrap gap-2 px-4 pt-3">
          {post.tags.map((t) => (
            <span key={t} className="rounded-pill border border-hairline px-2.5 py-1 text-[10.5px] text-mist-dim">
              {t}
            </span>
          ))}
        </div>
      )}

      {/* ---- Engagement -------------------------------------------------- */}
      <div className="mt-3 flex items-center gap-5 border-t border-hairline px-4 py-3">
        {/* Counts are STATED, not pressable. These posts are demo content
            about people who do not exist; a like button that worked would be
            the athlete applauding an invention, and the count climbing would
            be the app manufacturing engagement. The research pass flagged this
            as the one honesty breach on the screen — the notice below the feed
            explains the content, but a control that responds must also be real. */}
        <span className="flex items-center gap-1.5 text-[12.5px] text-mist">
          <Heart size={15} strokeWidth={1.7} />
          <span className="tnum">{post.likes}</span>
        </span>
        <span className="flex items-center gap-1.5 text-[12.5px] text-mist">
          <MessageCircle size={15} strokeWidth={1.7} />
          <span className="tnum">{post.comments}</span>
        </span>
        <span className="flex-1" />
        {/* Only ever View Profile or View Group. There is no message button:
            one-to-one messaging exists inside a group, not between strangers. */}
        {post.group ? (
          <Link
            to="/explore/social?tab=groups"
            className="flex items-center gap-1 text-[12.5px] text-azure"
          >
            View group
            <ChevronRight size={14} strokeWidth={1.8} />
          </Link>
        ) : post.kind === "looking-for-partners" ? (
          /* CONNECT on the mockup. The demo author cannot be connected to, so
             the control goes where connecting will actually live — the partner
             board — rather than pretending a handshake happened. */
          <Link
            to="/explore/social?tab=people"
            className="flex items-center gap-1 rounded-pill border border-azure/50 px-3 py-1 text-[11.5px] uppercase tracking-[0.08em] text-azure transition-colors hover:bg-azure/[0.1]"
          >
            Connect
          </Link>
        ) : null}
        {/* No "View profile" — there is no profile behind a demo author, and a
            label styled like a control that goes nowhere is a lie in miniature. */}
      </div>

      {post.kind === "summit" && post.summit?.verified && (
        <p className="border-t border-hairline px-4 py-2.5 text-[10.5px] leading-relaxed text-mist-dim">
          {SUMMIT_VERIFIED_MEANING}
        </p>
      )}

      {menu && <PostMenu author={post.author.name} onClose={() => setMenu(false)} />}
    </div>
  );
}

function RouteReport({ report }: { report: NonNullable<CommunityPost["report"]> }) {
  return (
    <div className="mt-3 rounded-tile border border-hairline bg-slate/50 p-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Trail", value: report.condition },
          { label: "Visibility", value: report.visibility },
          { label: "Snow", value: report.snow },
        ].map((r) => (
          <div key={r.label}>
            <p className="text-[10px] uppercase tracking-[0.1em] text-mist-dim">{r.label}</p>
            <p className="mt-1 text-[12.5px] text-snow">{r.value}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{report.note}</p>
      <p className="mt-2 text-[10.5px] leading-relaxed text-mist-dim">
        User reported — community information, not an official mountain safety report. Conditions
        change by the hour.
      </p>
    </div>
  );
}

function Milestone({ milestone }: { milestone: NonNullable<CommunityPost["milestone"]> }) {
  return (
    <div className="mt-3 flex items-center gap-4">
      <ProgressRing value={milestone.pct} size={64} stroke={2.5}>
        <div className="text-center">
          <p className="tnum text-[15px] font-extralight leading-none text-snow">{milestone.pct}%</p>
          <p className="mt-0.5 text-[8px] uppercase tracking-[0.1em] text-azure/85">
            {milestone.label}
          </p>
        </div>
      </ProgressRing>
      <p className="flex-1 text-[11.5px] leading-relaxed text-mist-dim">
        Preparation is derived from training the athlete recorded. It is not a judgement that
        anyone is ready for a mountain.
      </p>
    </div>
  );
}

function Avatar({ name, src }: { name: string; src?: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-hairline bg-slate text-[12px] text-mist">
      {src ? <img src={src} alt="" aria-hidden className="h-full w-full object-cover" /> : initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Sheets                                                                     */
/* -------------------------------------------------------------------------- */

function PostMenu({ author, onClose }: { author: string; onClose: () => void }) {
  return (
    <Sheet title={author} onClose={onClose}>
      <SheetRow title="Report post" detail="Tell us what's wrong with it" onClick={onClose} />
      <SheetRow title={`Mute ${author}`} detail="Stop seeing their posts" onClick={onClose} />
      <SheetRow title={`Block ${author}`} detail="They can no longer see or contact you" onClick={onClose} />
      <p className="py-3 text-[11px] leading-relaxed text-mist-dim">
        Moderation needs an account and a backend, so these do not do anything yet.
      </p>
    </Sheet>
  );
}

/**
 * The floating ＋ sheet — now the only way into a composer.
 *
 * Every option used to be wired to `onClose` and nothing else, so choosing one
 * dismissed the sheet and opened nothing. That was survivable while the feed
 * carried its own two composer buttons; with those gone it would have left no
 * way to post at all, so each option now opens the composer it names.
 */
function CreateSheet({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (kind: PostKind) => void;
}) {
  return (
    <Sheet title="Create post" onClose={onClose}>
      {CREATE_OPTIONS.map((o) => {
        const Icon = KIND_ICON[o.kind];
        return (
          <button
            key={o.kind}
            type="button"
            onClick={() => onPick(o.kind)}
            className="flex w-full items-center gap-3.5 py-3.5 text-left"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline bg-slate">
              <Icon size={16} strokeWidth={1.7} className="text-azure" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] text-snow">{o.label}</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-mist-dim">{o.detail}</span>
            </span>
            <ChevronRight size={15} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
          </button>
        );
      })}

      <div className="py-4">
        <div className="rounded-card border border-hairline bg-slate/50 p-3.5">
          <p className="flex items-center gap-2 text-[12.5px] text-snow">
            <ShieldCheck size={14} strokeWidth={1.7} className="shrink-0 text-azure" />
            Safety first
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-dim">
            Accounts under 18 have restricted discovery and no private messaging. Never post an
            exact address or a live location. Be respectful.
          </p>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          Posting needs an account, which ICEFALL does not have yet — nothing here will publish.
        </p>
      </div>
    </Sheet>
  );
}

