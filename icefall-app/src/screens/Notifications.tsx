import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Heart, MessageCircle, UserPlus } from "lucide-react";

import { Avatar, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { VerificationMark } from "@/components/ui/VerificationMark";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import {
  NOTIFICATIONS_NOT_PUSHED,
  noticeMark,
  useSocialNotices,
  type SocialNotice,
  type SocialNoticeKind,
} from "@/notifications/social";
import {
  SUGGESTIONS_BASIS,
  SUGGESTIONS_NO_MATCHES,
  SUGGESTIONS_SHOWN,
  useSuggestedPeople,
  type MyPlace,
  type SuggestedPerson,
  type SuggestionBasis,
} from "@/notifications/suggestions";
import { FOLLOW_MEANING, useFollow } from "@/social/follow";
import { postIdKind } from "@/social/posts";
import { canNameAnAccount } from "@/social/publicProfile";
import { useSessionState } from "@/auth/session";
import { countryName } from "@/auth/useMyProfile";
import { DEMO } from "@/offline/offline";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Notifications — who followed you, who liked your post, who commented. That is
 * the whole screen.
 *
 * THE OWNER, 2026-09-06: "notifications tab need big change, make it 1:1 like
 * instagram so when someone follows you likes your post, comment etc nothing
 * else. And suggested people based on near location".
 *
 * ── WHAT WENT, AND WHY IT COST NOTHING ───────────────────────────────────────
 *
 * Until today this screen had a second band above the social one, computed from
 * state on the device by `notifications/feed.ts`: messages waiting to send,
 * unread threads, today's session, and a countdown at 30/60/90/180 days. All
 * four are gone and `feed.ts` is deleted. Checked one by one before deleting,
 * because "nothing else" is not a reason to drop something an athlete needs:
 *
 *   · UNREAD THREADS — `chat/useConversations.ts` hard-codes `unread: 0` for
 *     every real thread, so this band could only ever come from fixtures. The
 *     count also already sits on the messages icon in `AppTopBar`, on every
 *     screen, and per-row in `Messages`.
 *   · MESSAGES WAITING TO SEND — the only chat message anywhere in this
 *     codebase with `state: "queued"` is one invented row in `chat/data.ts`,
 *     behind `import.meta.env.DEV`. Real outgoing messages are mapped to
 *     `"unsent"`, deliberately, because there is no server for them to reach.
 *     This card has never rendered in a built bundle. (`Thread.tsx` still draws
 *     "Waiting for signal" against the message itself, so the day a real send
 *     path ships, that is where the truth lives.)
 *   · TODAY'S SESSION — on Home in a fuller form, with Start and Mark-as-done.
 *     Removing it also removes a contradiction: this screen read the static
 *     `data/mock/training.ts` plan while Home reads the athlete's real one.
 *   · THE COUNTDOWN — on Home, on Goals, and on Explore, permanently rather
 *     than on four days of the year.
 *
 * `NOTIFICATIONS_NOT_PUSHED` moved into `notifications/social.ts` in the same
 * change and is still rendered at the bottom. Nothing here is delivered.
 *
 * ── WHAT INSTAGRAM'S SHAPE MEANS HERE, AND WHERE IT STOPS ────────────────────
 *
 * Taken: one flat list newest-first, grouped by age; the actor's face and name
 * as the sentence; a Follow control on the row of somebody who followed you;
 * and a suggestions section at the end.
 *
 * NOT taken, because the data does not exist and inventing it is the one thing
 * this app does not do:
 *
 *   · NO "AND 12 OTHERS". Nothing counts likes — a total taken from a capped
 *     page is a smaller number wearing the same clothes.
 *   · NO POST THUMBNAIL. The read selects a post's id and body, not its media,
 *     which lives in a private bucket behind its own gate.
 *   · NO PER-ROW READ STATE. There is one device-local high-water mark, not a
 *     per-notification flag, so no row is drawn as "unread".
 *   · NO LIVE UPDATING. No polling and no realtime socket; a radio kept awake
 *     on a phone that may be on a mountain, for something nothing pushes.
 */

/* -------------------------------------------------------------------------- */
/* Rows                                                                        */
/* -------------------------------------------------------------------------- */

const SOCIAL_ICON: Record<SocialNoticeKind, typeof UserPlus> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
};

/**
 * Where tapping it goes, or null when the row has nothing real to open.
 *
 * THE TWO GUARDS ARE ASKED OF THE MODULES THAT OWN THE ANSWER, never
 * re-implemented here: `canNameAnAccount` holds the uuid type and the username
 * CHECK together, and `postIdKind` holds what `posts.id` can be. A link and the
 * screen it opens reaching different conclusions about one string is exactly
 * what those two exports exist to prevent, and `PostCard` already asks them for
 * the same reason.
 *
 * It matters in a real build — a malformed id should not be a link — and it is
 * the difference between a working demo and a broken one: the sample rows mint
 * ids like `op-1` and `oa-ilse`, which no route can resolve, so every row on
 * the shared preview link was a dead tap until this was added.
 */
function destinationFor(n: SocialNotice): string | null {
  if (n.kind === "follow") {
    return canNameAnAccount(n.actor.id)
      ? `/social/people/${encodeURIComponent(n.actor.id)}`
      : null;
  }
  if (n.post && postIdKind(n.post.id) === "unknown") return null;
  /*
   * A like or a comment opens the post it is on. If the post did not come back
   * — deleted between the two reads, or hidden by its own policy — the row is
   * still true and still shown, it simply does not pretend to have somewhere to
   * go. It is not redirected to the actor's profile: that would be a different
   * destination wearing this one's label.
   */
  return n.post ? `/social/post/${encodeURIComponent(n.post.id)}` : null;
}

/**
 * The half-sentence after the name.
 *
 * THE QUOTATION MARKS ON A LIKE ARE LOAD-BEARING. `posts` has no title column —
 * `NoticePost.title` is the post's own opening line, cut, and `social.ts` says
 * so at the field. Set bare after "liked" it would read as the name of the
 * post, which is ICEFALL titling somebody's writing for them; inside quotes it
 * reads as what it is, the author's words. When the line did not come back the
 * sentence falls to "liked your post", which is still entirely true.
 */
function verbFor(n: SocialNotice): string {
  if (n.kind === "follow") return "started following you";
  if (n.kind === "like") {
    const line = n.post?.title;
    return line !== undefined && line.trim().length > 0 ? `liked “${line}”` : "liked your post";
  }
  return "commented:";
}

/**
 * The quoted block under the sentence, on a comment row only.
 *
 * A comment row shows THE COMMENT — their words are the thing you came to read,
 * and the post is one tap away. A like row has already put the post's opening
 * line in its sentence, so it adds nothing here: two grey paragraphs in one row
 * is a wall, and the reader has to work out which voice is which.
 */
function quotedFor(n: SocialNotice): string | undefined {
  if (n.kind !== "comment") return undefined;
  return n.body !== undefined && n.body.trim().length > 0 ? n.body : undefined;
}

/**
 * The Follow control, on the row of somebody who followed you and on each
 * suggestion — Instagram's shape, and the same write either way.
 *
 * IT DRAWS NOTHING WHEN IT CANNOT WORK. `useFollow` collapses four causes — no
 * client, no session, a read that did not come back, and your own profile — into
 * one `unavailable`, and a disabled Follow reads as unfinished and invites the
 * next person to "just wire it up". That rule is in `social/follow.ts` and this
 * component does not get a branch of its own.
 *
 * ONE POINT LOOKUP PER PILL. Each mounted pill asks `follows` whether the pair
 * exists — an index-only hit on `follows_profile_key` — so a page of thirty
 * follow rows is thirty small reads. Cheap individually, and the alternative
 * (one bulk read threaded through the list) would put a second definition of
 * "am I following them" beside the one in `follow.ts`.
 *
 * THE DEMO BRANCH keeps its own state and writes nothing, because a DEMO build
 * has no client and every write in it is in-memory by construction. It exists
 * so the shared preview link shows the real shape of the row rather than a gap
 * where the control should be.
 */
function FollowPill({
  profileId,
  name,
  myId,
}: {
  profileId: string;
  /** Whose pill this is. The accessible name, so thirty-five of these on one
      screen are not thirty-five buttons all called "Follow". */
  name: string;
  myId: string | null;
}) {
  const follows = useFollow(DEMO ? null : profileId, myId);
  const [demoFollowing, setDemoFollowing] = useState(false);

  const base =
    "shrink-0 self-center rounded-pill px-3.5 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50";

  if (DEMO) {
    return (
      <button
        type="button"
        onClick={(e) => {
          /* The row is a link; the pill is not a way into it. */
          e.preventDefault();
          e.stopPropagation();
          setDemoFollowing((v) => !v);
        }}
        className={cn(
          base,
          demoFollowing
            ? "border border-hairline-strong text-mist"
            : "bg-azure text-obsidian hover:bg-azure-bright",
        )}
      >
        {demoFollowing ? "Following" : "Follow"}
      </button>
    );
  }

  if (follows.state.kind === "unavailable") return null;
  const following = follows.state.following;

  return (
    <span className="flex shrink-0 flex-col items-end gap-1 self-center">
      <button
        type="button"
        disabled={follows.busy}
        aria-label={following ? `Unfollow ${name}` : `Follow ${name}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void (following ? follows.unfollow() : follows.follow());
        }}
        className={cn(
          base,
          following
            ? "border border-hairline-strong text-mist hover:text-snow"
            : "bg-azure text-obsidian hover:bg-azure-bright",
        )}
      >
        {follows.busy ? "Saving…" : following ? "Following" : "Follow"}
      </button>

      {/*
        A FAILED WRITE HAS TO SAY SO, NEXT TO THE CONTROL THAT FAILED.
        `useFollow` writes the sentence and this component used to fetch it and
        throw it away: the pill went "Saving…" → "Follow" and said nothing, so a
        refusal and a tap that never registered looked identical to a tap that
        worked and then a change of mind. `AthleteProfile` has always rendered
        it; this screen did not. Not a toast — a toast leaves the reader
        believing the tap worked once it fades.
      */}
      {follows.error !== null && (
        <span className="max-w-[180px] text-right text-[10.5px] leading-snug text-alert">
          {follows.error}
        </span>
      )}
    </span>
  );
}

/**
 * The row, as a sentence.
 *
 *   <avatar> Name<mark> started following you        2d ago   [Follow]
 *   <avatar> Name<mark> liked “the col was already…”  4h ago
 *   <avatar> Name<mark> commented:                   just now
 *                       "which side did you drop into?"
 */
function SocialRow({ notice, myId }: { notice: SocialNotice; myId: string | null }) {
  const Icon = SOCIAL_ICON[notice.kind];
  /* The mark is the server's sentence. `noticeMark` is the whole rule and it
     lives next to the queries that fetch the two computed fields — this screen
     is not allowed a branch of its own. */
  const mark = noticeMark(notice.actor);
  const to = destinationFor(notice);
  const quoted = quotedFor(notice);
  const handle = notice.actor.handle;

  const inner = (
    <>
      <span className="relative shrink-0">
        {notice.actor.avatarUrl !== undefined ? (
          /* Their own photograph, from `profiles.avatar_url`. */
          <img
            src={notice.actor.avatarUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="h-11 w-11 rounded-full border border-hairline-strong object-cover"
          />
        ) : (
          /* No photograph, so a monogram of their real name — never a stock
             face standing in for somebody who did not choose one. */
          <Avatar name={notice.actor.name} size={44} />
        )}
        <span className="absolute -bottom-0.5 -right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full border border-hairline-strong bg-graphite text-azure">
          <Icon size={10} strokeWidth={2} aria-hidden />
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] leading-snug text-snow">
          <span className="font-medium">{notice.actor.name}</span>
          {mark !== null && (
            /*
             * The mark explains itself when tapped, which makes it a button —
             * and this row is a link. Swallowing the click here stops the row
             * navigating out from under somebody who only wanted to know what
             * the tick means.
             */
            <span
              className="mx-1 inline-flex translate-y-[3px]"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <VerificationMark kind={mark} />
            </span>
          )}
          {mark === null && " "}
          <span className="text-mist">{verbFor(notice)}</span>
        </span>

        {quoted !== undefined && (
          /* Somebody's own words, clamped by CSS rather than cut in the string:
             nothing is summarised and no ellipsis is invented. */
          <span className="clamp-2 mt-1 block text-[12px] leading-relaxed text-mist">{quoted}</span>
        )}

        <span className="mt-1 block text-[11px] text-mist-dim">
          {/* The handle disambiguates two people with one display name. It is
              omitted, not em-dashed, when the account has never claimed one —
              an absent username is not an unmeasured quantity. */}
          {handle !== undefined && handle.length > 0
            ? `@${handle} · ${fmtRelative(notice.at)}`
            : fmtRelative(notice.at)}
        </span>
      </span>
    </>
  );

  /*
   * NO BOX. The owner, 2026-09-06: "dont have boxs with everything you build".
   *
   * Every row on this screen used to be `rounded-card border border-hairline
   * bg-graphite p-4` — the app's standard card. Five of those stacked is five
   * outlines competing with the five faces inside them, and Instagram's
   * activity list, which this screen is meant to be, has no container at all:
   * the rows sit on the page and the avatar column is what lines them up.
   *
   * So the shell is now spacing only — NO BORDER AND NO DIVIDER EITHER. A
   * hairline under every row is a weaker version of the same mistake: it draws
   * the list as a table when the avatars already do the aligning, and Instagram
   * has none. Rhythm comes from `py-3.5` and nothing else.
   */
  const shell = "flex items-start gap-3.5 py-3.5";

  /* THE FOLLOW-BACK, on a follow row only. A like or a comment says nothing
     about whether the two of you follow each other, and a pill there would be
     answering a question the row did not ask. */
  const pill =
    notice.kind === "follow" ? (
      <FollowPill profileId={notice.actor.id} name={notice.actor.name} myId={myId} />
    ) : null;

  if (to === null) {
    /* No chevron either: an arrow that does nothing is a promise this row
       cannot keep. */
    return (
      <div className={shell}>
        <span className="flex min-w-0 flex-1 items-start gap-3.5">{inner}</span>
        {pill}
      </div>
    );
  }

  /*
   * THE PILL IS A SIBLING OF THE LINK, NOT A CHILD OF IT.
   *
   * It used to sit inside the `<Link>` and cancel the navigation with
   * `preventDefault`. That works for a mouse and it is invalid HTML: a
   * `<button>` inside an `<a>` is not permitted content, and the two are
   * announced as one control by assistive technology — a screen reader offers
   * "Ilse Vandermolen started following you, link" with a button buried in it,
   * and a keyboard user tabbing to the button then pressing Enter can still
   * fire the anchor. Splitting them makes the row and the pill two controls,
   * which is what they are.
   *
   * The `<Link>` takes `flex-1` so the row is still tappable across everything
   * that is not the pill.
   */
  return (
    <div className={shell}>
      <Link
        to={to}
        className="flex min-w-0 flex-1 items-start gap-3.5 transition-opacity hover:opacity-90"
      >
        {inner}
        {pill === null && (
          <ChevronRight size={15} strokeWidth={1.8} className="mt-2.5 shrink-0 text-mist-dim" />
        )}
      </Link>
      {pill}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Grouping by age                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Instagram's bands, and every one of them is a fact about the row's own
 * timestamp rather than about what the reader has seen.
 *
 * THERE IS DELIBERATELY NO "NEW" BAND. Instagram's is drawn from a server-side
 * per-item read flag; ICEFALL has one device-local high-water mark and no
 * per-row state, so a "New" heading would be a claim this app cannot make about
 * an individual row. The count of what arrived since the last look is measured,
 * and it is said once, under the title, where it belongs.
 *
 * A row with an unparseable date falls to the last band rather than being
 * dropped — the notice happened, and only its age is in question.
 */
const BANDS = [
  { label: "This week", within: 7 },
  { label: "This month", within: 30 },
] as const;

/**
 * "TODAY" IS A CALENDAR DAY, not "within the last 24 hours", and the difference
 * showed. `fmtRelative` rounds, so a notice 20 hours old renders "1d ago" — and
 * under a 24-hour rule it landed under the heading "Today", which read as the
 * screen contradicting itself in the same row. Comparing local midnights makes
 * the heading and the timestamp agree, and it is also what the word means.
 */
function bandFor(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "Earlier";

  const midnight = new Date(now).setHours(0, 0, 0, 0);
  if (at >= midnight) return "Today";

  const days = (now - at) / 86_400_000;
  for (const band of BANDS) if (days < band.within) return band.label;
  return "Earlier";
}

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * ONE HEADING PER BASIS, and this is a correction rather than a flourish.
 *
 * The first version of this screen put every suggestion under a single heading
 * taken from whichever match had fired first. With a place match present, that
 * heading read "People who say they're in Chamonix" — over a list that included
 * somebody in Grenoble and somebody in Annecy, because they were COUNTRY
 * matches. The heading was stating as fact something the data did not say about
 * two of the three people under it. So each group is headed by the thing that
 * actually found the people in it, and a group with nobody in it is not drawn.
 *
 * "Say they're in", never "are in" and never "near". `profiles.location_label`
 * is a free-text box somebody typed; two of them agreeing is two people using
 * the same word, and ICEFALL holds no coordinate for anybody with which to
 * check. The whole argument is in `notifications/suggestions.ts`.
 */
function headingFor(basis: SuggestionBasis, mine: MyPlace): string | null {
  if (basis === "place") {
    return mine.label !== null ? `People who say they're in ${mine.label}` : null;
  }
  const name = countryName(mine.countryCode);
  /* Not "in France" a second time — these are the people the town did not
     match, so the heading says so rather than repeating the country as if it
     were the same claim. */
  return name !== null ? `Elsewhere in ${name}` : null;
}

/**
 * The place under their handle.
 *
 * OMITTED ON A PLACE MATCH, because the heading directly above already says it
 * and a row reading "Chamonix" under a heading reading "…in Chamonix" is the
 * same fact twice. On a country match it is the informative half of the row —
 * it is what tells the reader this person is in Grenoble, not next door.
 */
function placeOf(person: SuggestedPerson): string | null {
  if (person.basis === "place") return null;
  if (person.locationLabel !== null && person.locationLabel.trim().length > 0) {
    return person.locationLabel;
  }
  return countryName(person.countryCode);
}

function SuggestionRow({ person, myId }: { person: SuggestedPerson; myId: string | null }) {
  const place = placeOf(person);

  /* Same guard as the notice rows: a link that cannot resolve is not drawn as
     a link. `canNameAnAccount` owns the answer. */
  const to = canNameAnAccount(person.id)
    ? `/social/people/${encodeURIComponent(person.id)}`
    : null;
  const bodyClass = "flex min-w-0 flex-1 items-start gap-3.5";

  const body = (
    <>
        {person.avatarUrl !== undefined ? (
          <img
            src={person.avatarUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="h-11 w-11 shrink-0 rounded-full border border-hairline-strong object-cover"
          />
        ) : (
          <Avatar name={person.name} size={44} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium leading-snug text-snow">
            {person.name}
          </span>
          <span className="mt-0.5 block truncate text-[11.5px] text-mist">@{person.handle}</span>
          {/* Their place, only when they gave one. No em dash: a person who has
              not said where they are is not an unmeasured quantity, they simply
              did not fill the box in — and they are only in this list at all
              because something about their location matched. */}
          {place !== null && (
            <span className="mt-0.5 block truncate text-[11px] text-mist-dim">{place}</span>
          )}
        </span>
    </>
  );

  return (
    <div className="flex items-start gap-3.5 py-3.5">
      {to === null ? (
        <span className={bodyClass}>{body}</span>
      ) : (
        <Link to={to} className={bodyClass}>
          {body}
        </Link>
      )}
      <FollowPill profileId={person.id} name={person.name} myId={myId} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

export default function Notifications() {
  const social = useSocialNotices();
  const suggestions = useSuggestedPeople();
  const session = useSessionState();
  const myId = session?.user.id ?? null;

  /**
   * THE COUNT IS REAL OR IT IS NOT SHOWN.
   *
   * `social.unseen` is measured against a last-seen timestamp this device
   * genuinely stores, and it is `null` — NOT MEASURED — whenever that mark is
   * missing or the paged window cannot prove the count is exact. Null draws
   * nothing at all rather than a zero, because "nothing new" and "ICEFALL does
   * not know" are different sentences and a zero would say the wrong one.
   *
   * It is captured ONCE, on the read that landed, before the mark is moved.
   * Opening the screen is what makes these seen, so `markSeen` fires here — and
   * if the number were read live it would recompute to zero in the same breath
   * and the reader would never see what they had come back to.
   */
  const [arrived, setArrived] = useState<number | null>(null);
  const captured = useRef(false);

  useEffect(() => {
    if (captured.current) return;
    if (social.state !== "ready") return;
    captured.current = true;
    setArrived(social.unseen);
    social.markSeen();
  }, [social]);

  /* One clock for the whole render, so two rows a millisecond apart cannot land
     in different bands. */
  const grouped = useMemo(() => {
    const now = Date.now();
    const out: { label: string; rows: SocialNotice[] }[] = [];
    for (const notice of social.notices) {
      const label = bandFor(notice.at, now);
      const last = out[out.length - 1];
      /* `social.ts` returns them newest-first, so a band can only ever be
         opened once — no lookup, and the order is the server's, not a sort
         imposed here. */
      if (last !== undefined && last.label === label) last.rows.push(notice);
      else out.push({ label, rows: [notice] });
    }
    return out;
  }, [social.notices]);

  /* The suggestions, split by the basis that found each person, place first —
     somebody who typed the same town is a better answer than somebody who typed
     the same country, and the two are never mixed under one heading. */
  const suggestionGroups = useMemo(() => {
    if (suggestions.state !== "ready" || suggestions.matched === null) return [];

    /*
     * NOBODY APPEARS TWICE ON THIS SCREEN, and without this they could.
     *
     * The suggestions query excludes people YOU follow, not people who follow
     * YOU — so somebody who followed you an hour ago and typed the same town is
     * legitimately in both lists. Each `FollowPill` owns its own `useFollow`
     * and neither knows about the other, so following from one left the other
     * still reading "Follow": one person shown as followed and not-followed at
     * the same time, one tap apart. The DEMO fixtures reproduce it exactly —
     * Ilse is the first notice and the first suggestion.
     *
     * Dropping them from the SUGGESTIONS is the right side to fix: somebody
     * already on the screen, with a Follow-back pill on their row, is not a
     * discovery.
     */
    const alreadyOnScreen = new Set(
      social.notices.filter((n) => n.kind === "follow").map((n) => n.actor.id),
    );
    const shown = suggestions.people
      .filter((person) => !alreadyOnScreen.has(person.id))
      .slice(0, SUGGESTIONS_SHOWN);
    const out: { basis: SuggestionBasis; people: SuggestedPerson[] }[] = [];
    for (const basis of ["place", "country"] as const) {
      const people = shown.filter((p) => p.basis === basis);
      if (people.length > 0) out.push({ basis, people });
    }
    return out;
  }, [suggestions.state, suggestions.people, suggestions.matched, social.notices]);

  /* Set for every state except `loading` and `ready` — shown as written. */
  const absence = social.message;
  const loading = social.state === "loading";
  const nothingYet = social.state === "ready" && social.notices.length === 0;

  return (
    <Screen>
      {/*
       * The rows are DIRECT children of `Stagger`. Wrapping them in a spacing
       * div leaves them at opacity 0, in the DOM, with no error and nothing in
       * the console — so the spacing lives on the Stagger itself instead, and
       * every band below is emitted as a flat array rather than a container.
       */}
      <Stagger className="space-y-0">
        <ScreenHeader
          title="Notifications"
          /*
           * Only when it is a measured number greater than zero — AND SAID
           * DEVICE-BY-DEVICE, because that is the whole extent of the claim.
           * The last-seen mark lives in this browser's storage (`social.ts`,
           * SEEN_PREFIX); no server records when anybody looked at this screen.
           * So a bare "since you last looked" is an overclaim on the second
           * phone: read three of these there, come back here, and this device's
           * mark still counts them as new. "On this device" is the difference
           * between a measured statement and a nearly-true one.
           */
          subtitle={
            arrived !== null && arrived > 0
              ? `${arrived} new since you last looked on this device`
              : undefined
          }
          back
          className="pb-2.5"
        />

        {/* 1. What people did, newest first, under the age they happened in. */}
        {grouped.flatMap((band) => [
          /* No `first:pt-0` here: these are siblings of the header and of each
             other, never the first child of anything, so the variant could
             never match. The header carries its own bottom padding. */
          <Rise key={`band-${band.label}-${band.rows[0]?.id ?? ""}`} className="pt-3">
            <SectionLabel>{band.label}</SectionLabel>
          </Rise>,
          ...band.rows.map((n) => (
            <Rise key={n.id}>
              <SocialRow notice={n} myId={myId} />
            </Rise>
          )),
        ])}

        {/* 2. Older ones, if the window left any behind. `canLoadMore` is not a
               count and this control does not pretend it is one — it says there
               may be more, which is exactly what the flag means. */}
        {social.canLoadMore && (
          <Rise>
            <button
              type="button"
              onClick={() => social.loadMore()}
              disabled={loading}
              className="w-full py-4 text-left text-[12.5px] text-azure transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {loading ? "Looking…" : "Show older"}
            </button>
          </Rise>
        )}

        {/* 3. Why the list is missing, when it is. `social.ts` wrote the
               sentence and it is rendered as written — this screen does not
               soften it or decide on the reader's behalf that it is minor. */}
        {absence !== undefined && (
          <Rise>
            <div className="py-2">
              <p className="text-[13px] leading-relaxed text-mist">{absence}</p>
              {/* RETRY ONLY WHERE THERE IS SOMETHING TO RETRY. This button is
                  real and it works: it re-runs the queries against ICEFALL's
                  server. What would be wrong is showing it under "nothing was
                  asked for" — a control inviting the reader to retry a request
                  that was never made and, in that build, cannot be.
                  `social.canRetry` owns the distinction. */}
              {social.canRetry && (
                <button
                  type="button"
                  onClick={() => social.reload()}
                  className="mt-3 text-[12px] text-azure transition-opacity hover:opacity-80"
                >
                  Try again
                </button>
              )}
            </div>
          </Rise>
        )}

        {/* 4. Still asking. Not "nothing here" — that is a different sentence
               and it would be the wrong one for another second or two. */}
        {loading && social.notices.length === 0 && (
          <Rise>
            <p className="py-3 text-[13px] leading-relaxed text-mist-dim">
              Checking for follows and comments…
            </p>
          </Rise>
        )}

        {/* 5. Genuinely empty: the server answered and there was nothing in it.
               Ordinary, so nothing here reads like a failure. */}
        {nothingYet && (
          <Rise>
            <div className="py-3">
              <p className="text-[13px] leading-relaxed text-mist">
                Nothing yet. Nobody has followed you or left a comment.
              </p>
              {/*
                LIKES GET THEIR OWN SENTENCE, and it is not "nobody liked".
                Nothing in ICEFALL writes a like to the server — the heart on a
                post is local to that session — so an empty like channel
                measures an unbuilt write path, not an absence of likes. Folding
                it into the line above would be a measured zero claimed over
                something that was never recorded, which is the exact
                conflation this project refuses. The read itself is live and
                correct; the day a like is written, the row appears here.
              */}
              <p className="mt-1.5 text-[13px] leading-relaxed text-mist-dim">
                Likes are not recorded yet, so this screen has nothing to say about them either
                way.
              </p>
            </div>
          </Rise>
        )}

        {/* 6. Suggested people, in as many groups as there are bases — see
               `headingFor` and the header of `suggestions.ts`. */}
        {suggestionGroups.flatMap((group) => {
          const heading = suggestions.matched ? headingFor(group.basis, suggestions.matched) : null;
          return [
            /* A group with no heading is not drawn at all. The heading is the
               only thing that says WHY these people are here, and a list of
               strangers with no stated basis is the version of this section
               that would be an overclaim by omission. */
            ...(heading !== null
              ? [
                  <Rise key={`suggestion-head-${group.basis}`} className="pt-7">
                    <SectionLabel>{heading}</SectionLabel>
                  </Rise>,
                ]
              : []),
            ...(heading !== null
              ? group.people.map((person) => (
                  <Rise key={`suggestion-${person.id}`}>
                    <SuggestionRow person={person} myId={myId} />
                  </Rise>
                ))
              : []),
          ];
        })}
        {suggestionGroups.length > 0 && (
          <Rise className="pt-1">
            {/*
              TWO SENTENCES, NOT THIRTY-FIVE. `SUGGESTIONS_BASIS` says why these
              people are here; `FOLLOW_MEANING` says what the Follow buttons
              beside them actually do — that nothing is pushed to anybody, that
              no feed reads the list, and that the person can see they were
              followed. `AthleteProfile` prints the second under its single
              pill; here there can be dozens of pills, so it is said once for
              all of them rather than not at all.
            */}
            <Disclaimer>
              {SUGGESTIONS_BASIS} {FOLLOW_MEANING}
            </Disclaimer>
          </Rise>
        )}

        {/* 6b. The match ran and nobody came back. AN ANSWER, NOT A FAILURE, so
               it carries no retry — and it is drawn, where until 2026-09-06 the
               screen rendered literally nothing for the single most likely
               state on a young database. The heading names what was matched
               against, so the sentence is about a place rather than in the
               abstract. */}
        {suggestions.state === "no-matches" && (
          <Rise className="pt-7">
            <div className="py-2">
              <SectionLabel>Suggested people</SectionLabel>
              <p className="mt-2 text-[13px] leading-relaxed text-mist">
                {SUGGESTIONS_NO_MATCHES}
              </p>
            </div>
          </Rise>
        )}

        {/* 7. Why there are no suggestions, when there are none. The states are
               not interchangeable: "you have not said where you are" is a
               different fact from "nobody matched", and only the first has
               something the reader can do about it.

               `no-backend` AND `signed-out` ARE BOTH SKIPPED, because in either
               of them the card above is already saying the same thing about the
               same cause. Two paragraphs one under the other — "this build has
               no server" then "there are no accounts to suggest" — read as two
               separate failures rather than as one fact with two consequences,
               and the second adds nothing the reader can act on. Everything
               else here IS shown, because each of those has a different cause
               from whatever the notices did. */}
        {suggestions.state !== "ready" &&
          suggestions.state !== "loading" &&
          suggestions.state !== "no-backend" &&
          suggestions.state !== "signed-out" &&
          suggestions.state !== "no-matches" &&
          suggestions.message !== undefined && (
            <Rise className="pt-7">
              <div className="py-2">
                <p className="text-[13px] leading-relaxed text-mist">{suggestions.message}</p>
                {suggestions.state === "no-location" && (
                  <Link
                    to="/settings/profile"
                    className="mt-3 inline-block text-[12px] text-azure transition-opacity hover:opacity-80"
                  >
                    Add where you are
                  </Link>
                )}
                {suggestions.canRetry && (
                  <button
                    type="button"
                    onClick={() => suggestions.reload()}
                    className="mt-3 text-[12px] text-azure transition-opacity hover:opacity-80"
                  >
                    Try again
                  </button>
                )}
              </div>
            </Rise>
          )}

        <Rise className="pt-6">
          <Disclaimer>{NOTIFICATIONS_NOT_PUSHED}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}
