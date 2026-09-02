import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  ChevronRight,
  CloudOff,
  Flag,
  Heart,
  MessageCircle,
  MessageSquare,
  UserPlus,
} from "lucide-react";

import { Avatar, Card, Disclaimer } from "@/components/ui/primitives";
import { VerificationMark } from "@/components/ui/VerificationMark";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { NOTIFICATIONS_NOT_PUSHED, useNotifications, type NoticeKind } from "@/notifications/feed";
import {
  noticeMark,
  useSocialNotices,
  type SocialNotice,
  type SocialNoticeKind,
} from "@/notifications/social";
import { fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Notifications — two kinds of item, one list, and neither of them pushed.
 *
 * THE OWNER, 2 SEP: "notification tab is where you see who followed you, who
 * liked your post or commented". That is now the larger half of this screen.
 * The half that was here before it — queued messages, unread threads, today's
 * session, the objective — is still here, because it is the half an athlete
 * would want to act on today.
 *
 * WHERE EACH HALF COMES FROM, AND WHY THE ORDER LOOKS THE WAY IT DOES.
 *
 *   DEVICE notices (`notifications/feed.ts`) are worked out on open from state
 *   already on this phone. They carry no timestamp, because there is no single
 *   moment attached to "three messages are waiting to send" — it is a condition,
 *   not an event. They are ordered by the weight `feed.ts` gives them.
 *
 *   SOCIAL notices (`notifications/social.ts`) are rows the server returned: a
 *   `follows` row pointing at me, a `post_likes` or `post_comments` row on a
 *   post I wrote. Each one happened at a time, so each one shows that time, and
 *   `social.ts` has already merged the three sources newest-first.
 *
 * The two bands are not interleaved, and that is deliberate rather than lazy:
 * interleaving needs one comparable ordering key, and giving the device notices
 * a fake `at` of "now" so they sort to the top would be inventing a time for an
 * event that never had one. So the conditions that need acting on sit first and
 * the things people did sit under them, each band ordered by the only key it
 * honestly has.
 *
 * YOUR OWN ACTIONS ARE NOT IN HERE, and the filter is not in this file — it is
 * in the query, so a like you left on your own post never reaches the device.
 *
 * WHAT THIS SCREEN IS NOT ALLOWED TO SOFTEN. `social.ts` distinguishes an empty
 * answer from five different kinds of absence, and every one of them arrives
 * here as its own sentence. None of them is folded into "nothing yet": "nobody
 * has followed you" and "ICEFALL could not ask" are different facts and only
 * one of them is something this app knows.
 */

/* -------------------------------------------------------------------------- */
/* Device notices                                                             */
/* -------------------------------------------------------------------------- */

const ICON: Record<NoticeKind, typeof MessageSquare> = {
  queued: CloudOff,
  unread: MessageSquare,
  session: CalendarClock,
  objective: Flag,
};

/** Queued messages are the one item here the athlete may be wrong about. */
const TONE: Record<NoticeKind, string> = {
  queued: "border-alert/35 text-alert",
  unread: "border-hairline-strong text-azure",
  session: "border-hairline-strong text-azure",
  objective: "border-hairline-strong text-azure",
};

/* -------------------------------------------------------------------------- */
/* Social notices                                                             */
/* -------------------------------------------------------------------------- */

const SOCIAL_ICON: Record<SocialNoticeKind, typeof UserPlus> = {
  follow: UserPlus,
  like: Heart,
  comment: MessageCircle,
};

/** Where the row goes, or null when the row has nothing real to open. */
function destinationFor(n: SocialNotice): string | null {
  if (n.kind === "follow") return `/explore/people/${encodeURIComponent(n.actor.id)}`;
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
  if (n.kind === "follow") return "followed you";
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
 * The row, as a sentence.
 *
 *   <avatar> Name<mark> followed you             2d ago
 *   <avatar> Name<mark> liked “the col was already…”  4h ago
 *   <avatar> Name<mark> commented:                   just now
 *                       "which side did you drop into?"
 */
function SocialRow({ notice }: { notice: SocialNotice }) {
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
            className="h-9 w-9 rounded-full border border-hairline-strong object-cover"
          />
        ) : (
          /* No photograph, so a monogram of their real name — never a stock
             face standing in for somebody who did not choose one. */
          <Avatar name={notice.actor.name} size={36} />
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

  const shell = "flex items-start gap-3.5 rounded-card border border-hairline bg-graphite p-4";

  if (to === null) {
    /* No chevron either: an arrow that does nothing is a promise this row
       cannot keep. */
    return <div className={shell}>{inner}</div>;
  }

  return (
    <Link to={to} className={cn(shell, "transition-colors hover:border-hairline-strong")}>
      {inner}
      <ChevronRight size={15} strokeWidth={1.8} className="mt-2.5 shrink-0 text-mist-dim" />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */

export default function Notifications() {
  const notices = useNotifications();
  const social = useSocialNotices();

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

  /* Set for every state except `loading` and `ready` — shown as written. */
  const absence = social.message;
  const loading = social.state === "loading";

  const nothingAtAll =
    social.state === "ready" && notices.length === 0 && social.notices.length === 0;

  return (
    <Screen>
      {/*
       * The rows are DIRECT children of `Stagger`. Wrapping them in a spacing
       * div leaves them at opacity 0, in the DOM, with no error and nothing in
       * the console — so the spacing lives on the Stagger itself instead.
       */}
      <Stagger className="space-y-2.5">
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

        {/* 1. Conditions on this device, in the order feed.ts weighted them. */}
        {notices.map((n) => {
          const Icon = ICON[n.kind];
          return (
            <Rise key={n.id}>
              <Link
                to={n.to}
                className="flex items-start gap-3.5 rounded-card border border-hairline bg-graphite p-4 transition-colors hover:border-hairline-strong"
              >
                <span
                  className={cn(
                    "grid h-9 w-9 shrink-0 place-items-center rounded-full border",
                    TONE[n.kind],
                  )}
                >
                  <Icon size={15} strokeWidth={1.7} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] leading-snug text-snow">{n.title}</span>
                  <span className="clamp-2 mt-1 block text-[12px] leading-relaxed text-mist">
                    {n.body}
                  </span>
                </span>
                <ChevronRight
                  size={15}
                  strokeWidth={1.8}
                  className="mt-0.5 shrink-0 text-mist-dim"
                />
              </Link>
            </Rise>
          );
        })}

        {/* 2. What people did, newest first. */}
        {social.notices.map((n) => (
          <Rise key={n.id}>
            <SocialRow notice={n} />
          </Rise>
        ))}

        {/* 3. Older ones, if the window left any behind. `canLoadMore` is not a
               count and this control does not pretend it is one — it says there
               may be more, which is exactly what the flag means. */}
        {social.canLoadMore && (
          <Rise>
            <button
              type="button"
              onClick={() => social.loadMore()}
              disabled={loading}
              className="w-full rounded-card border border-hairline bg-graphite px-4 py-3 text-[12.5px] text-mist transition-colors hover:border-hairline-strong hover:text-snow disabled:opacity-50"
            >
              {loading ? "Looking…" : "Show older"}
            </button>
          </Rise>
        )}

        {/* 4. Why the social half is missing, when it is. `social.ts` wrote the
               sentence and it is rendered as written — this screen does not
               soften it or decide on the reader's behalf that it is minor. */}
        {absence !== undefined && (
          <Rise>
            <Card>
              <p className="text-[13px] leading-relaxed text-mist">{absence}</p>
              <button
                type="button"
                onClick={() => social.reload()}
                className="mt-3 text-[12px] text-azure transition-opacity hover:opacity-80"
              >
                Try again
              </button>
            </Card>
          </Rise>
        )}

        {/* 5. Still asking. Not "nothing here" — that is a different sentence
               and it would be the wrong one for another second or two. */}
        {loading && social.notices.length === 0 && (
          <Rise>
            <Card>
              <p className="text-[13px] leading-relaxed text-mist-dim">
                Checking for follows, likes and comments…
              </p>
            </Card>
          </Rise>
        )}

        {/* 6. Genuinely empty: the server answered and there was nothing in it.
               Ordinary, so nothing here reads like a failure. */}
        {nothingAtAll && (
          <Rise>
            <Card>
              <p className="text-[13px] leading-relaxed text-mist">
                Nothing yet. Nobody has followed you, liked a post or left a comment, and nothing
                on this device needs you — no unread messages, nothing waiting to send, and today's
                session is either done or not scheduled.
              </p>
            </Card>
          </Rise>
        )}

        <Rise className="pt-6">
          <Disclaimer>{NOTIFICATIONS_NOT_PUSHED}</Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}
