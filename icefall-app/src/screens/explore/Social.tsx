import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { SegmentedTabs } from "@/components/layout/chrome";
import { Loader2 } from "lucide-react";

const Community = lazy(() => import("./Community"));
const Leaderboard = lazy(() => import("./Leaderboard"));
const People = lazy(() => import("./People"));
const Groups = lazy(() => import("./Groups"));

/**
 * SOCIAL — the feed, and people and groups on one page.
 *
 * People and Groups were two tabs of six across the top of Explore, which
 * pushed the tab strip past the edge of the screen and buried Guides and
 * Expeditions off-frame. They moved in here as two sub-tabs, and PH-08 then
 * merged those two into a single page — they were the same question asked
 * twice: who else is out there, and who are you going with. That page is
 * `./Groups`; `./People` is now the second half of it and exports a section
 * rather than a screen.
 *
 * The sub-tab lives in the query string rather than in state, so a link opens
 * on the right section and the back button steps between them. Every value that
 * ever worked still resolves — see `App.tsx`, which sends the old
 * /explore/people and /explore/groups routes here — so nothing anyone
 * bookmarked or linked to breaks.
 */

type Sub = "community" | "leaderboard" | "people" | "groups";

/**
 * Two tabs, one question each:
 *   FEED             what are mountaineers doing
 *   PEOPLE & GROUPS  which mountains do I want, who else wants them, and who
 *                    am I actually going with
 *
 * LEADERBOARD IS A TAB AGAIN, restored 2026-09-03 at the owner's request, sitting
 * where they asked for it: immediately after Groups. It had been dropped from the
 * strip only because their own 1:1 mockup did not draw one — never because the
 * screen was unfinished. It stayed routed and reachable at `?tab=leaderboard`
 * throughout, which is why restoring it is a one-line change and not a rebuild.
 *
 * WHAT IT SHOWS, AND WHY THAT IS NOT A PROBLEM. `boardEntries()` has no backend
 * and returns nothing, so there is no podium and no ranking against other people.
 * The screen says exactly that instead of inventing one. What it does show is
 * real: the athlete's OWN standing, computed from their own recorded activity,
 * against the category and period they pick. A tab leading to an honest "no
 * community data yet" is fine; a tab leading to a fabricated podium would not be.
 *
 * The `community` value is unchanged, as ever, so old links resolve.
 */
const SUBS = [
  { value: "community", label: "Feed" },
  { value: "people", label: "People" },
  { value: "groups", label: "Groups" },
  { value: "leaderboard", label: "Leaderboard" },
] as const;

const isSub = (v: string | null): v is Sub =>
  v === "community" || v === "leaderboard" || v === "people" || v === "groups";

/**
 * Which tab a query value lights.
 *
 * A true identity now: every value in `Sub` has a tab of its own, so each one
 * lights itself. The function is kept rather than inlined because it is the
 * single place that would need to change if a value ever again renders one
 * screen while lighting another — the case this file has been in twice. A
 * strip lighting a tab the reader is not on tells them they are somewhere they
 * are not, and that is a bug worth keeping one function to prevent.
 */
const tabFor = (sub: Sub): Sub => sub;

export default function Social() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const sub: Sub = isSub(raw) ? raw : "community";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pb-1 pt-3">
        <SegmentedTabs
          tabs={SUBS}
          value={tabFor(sub)}
          onChange={(v) => setParams(v === "community" ? {} : { tab: v }, { replace: true })}
        />
      </div>

      <Suspense
        fallback={
          <div className="grid flex-1 place-items-center">
            <Loader2 size={16} className="animate-spin text-mist-dim" />
          </div>
        }
      >
        {sub === "community" ? (
          <Community />
        ) : sub === "leaderboard" ? (
          <Leaderboard />
        ) : sub === "people" ? (
          <People />
        ) : (
          <Groups />
        )}
      </Suspense>
    </div>
  );
}
