import { Navigate, useParams } from "react-router-dom";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { CommentThread } from "@/components/domain/CommentThread";
import { OwnPostCard } from "@/components/domain/PostComposer";
import { SummitLogCard } from "@/components/domain/SummitLogKit";
import { useOwnPosts } from "@/social/posts";
import { useSummitLogs } from "@/social/summitLog";
import { useRecordedActivities } from "@/tracking/feed";
import { useSettings } from "@/settings/store";
import { useApp } from "@/state/AppState";

/**
 * One post, with its conversation.
 *
 * The card is the same component the feed renders — a detail view that
 * re-implements the card is a detail view that will disagree with the feed
 * within a month. What the detail page adds is the thread.
 *
 * Both kinds of subject resolve here: a summit log and a general post share a
 * URL space (`/social/post/:id`) because from the athlete's side they are both
 * "a thing I posted that people can reply to".
 */
export default function PostDetail() {
  const { id } = useParams<{ id: string }>();
  const posts = useOwnPosts();
  const logs = useSummitLogs();
  const recorded = useRecordedActivities();
  const { user } = useApp();
  const { settings } = useSettings();

  const post = posts.find((p) => p.id === id);
  const log = logs.find((l) => l.id === id);

  if (!post && !log) return <Navigate to="/explore/social" replace />;

  const me = {
    name: user.name,
    region: settings.region || user.homeBase || undefined,
    avatar: settings.avatar,
  };

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Post" back="/explore/social" />
      </div>

      <Stagger className="px-5 pb-8">
        <Rise>
          {post ? (
            <OwnPostCard post={post} author={me} recorded={recorded} />
          ) : (
            <SummitLogCard log={log!} author={me} />
          )}
        </Rise>

        <Rise className="pt-6">
          <CommentThread subjectId={id!} me={me} />
        </Rise>
      </Stagger>
    </Screen>
  );
}
