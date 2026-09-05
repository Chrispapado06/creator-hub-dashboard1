import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { ScreenHeader, SegmentedTabs } from "@/components/layout/chrome";

const Community = lazy(() => import("../explore/Community"));
const Leaderboard = lazy(() => import("../explore/Leaderboard"));
const People = lazy(() => import("../explore/People"));
const Groups = lazy(() => import("../explore/Groups"));

/**
 * SOCIAL — the feed, and people and groups on one page.
 *
 * People and Groups were two tabs of six across the top of Explore, which
 * pushed the tab strip past the edge of the screen and buried Guides and
 * Expeditions off-frame. They moved in here as two sub-tabs, and PH-08 then
 * merged those two into a single page — they were the same question asked
 * twice: who else is out there, and who are you going with. That page is
 * `../explore/Groups`; `../explore/People` is now the second half of it and
 * exports a section rather than a screen. THE TWO FILES STILL SIT UNDER
 * `explore/` AND THAT IS NOW ONLY HISTORY: nothing of theirs is routed under
 * `/explore` any more. Moving them is a rename of a dozen imports and no
 * behaviour, so it has been left for whoever next has reason to open them.
 *
 * ── LIFTED OUT OF EXPLORE, 2026-09-03 ────────────────────────────────────────
 * The owner: "when you click on social, i dont want it to be shown on explore
 * anymore."
 *
 * Social took a slot in the BOTTOM TAB BAR and yet still rendered inside
 * `ExploreLayout`, so tapping SOCIAL gave a screen titled "Explore", with a
 * back chevron to a hub nobody had asked for, and TWO stacked tab rows: the
 * Explore four above the Social four. It is a destination of its own now, at
 * `/social`, and this file owns everything the layout used to lend it:
 *
 *   · THE TITLE. "Social", not "Explore".
 *   · NO BACK CHEVRON. It is a bottom-bar destination; there is nothing behind.
 *   · THE NOTCH. `ExploreLayout` set `--screen-safe-top: 0px` because its own
 *     header cleared the inset for the screens beneath it. Out from under it,
 *     this screen touches the top of the display, so it must clear the inset
 *     itself — and must still zero the variable, or the nested `Screen` inside
 *     each sub-tab would clear it a SECOND time and open a dead ~47px band
 *     under the strip on a notched phone. Counted here exactly once.
 *   · THE CREATE-GROUP +. See the block above the button below; losing it in
 *     the move would have deleted the only way to make a group.
 *
 * The sub-tab lives in the query string rather than in state, so a link opens
 * on the right section and the back button steps between them. Every value that
 * ever worked still resolves — see `App.tsx`, which sends the old
 * /explore/social, /explore/people, /explore/crew and /explore/community routes
 * here, query string and all — so nothing anyone bookmarked or linked to breaks.
 *
 * ── AND SO DID THE SCREENS BEHIND IT, the same day ───────────────────────────
 * Lifting the tab was only half the move. Tapping a person or a group from here
 * opened `/explore/people/:id` and `/explore/groups/:id`, which were declared
 * inside the `/explore` route block — so the most ordinary thing anyone does on
 * Social put the word "Explore" back on screen one tap deeper, under a
 * FIND/EXPEDITIONS/GUIDES tab row, with a chevron to the Explore hub. Those
 * screens are `/social/people/:id`, `/social/groups/new` and
 * `/social/groups/:id` now. They render no layout of this file's: each already
 * draws its own header and its own back chevron, and under `ExploreLayout` they
 * were carrying two of each. See the block beside them in `App.tsx`.
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
    /*
     * `--screen-safe-top: 0px` for the same reason `ExploreLayout` sets it: the
     * header below clears the notch, so the `Screen` inside each sub-tab must
     * not clear it again. The difference is that the padding is now applied
     * HERE rather than one component up — this element is the one touching the
     * top of the display.
     */
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ "--screen-safe-top": "0px" } as React.CSSProperties}
    >
      <div className="shrink-0 px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/*
          THE CREATE-GROUP +, WHICH TRAVELLED WITH THE SCREEN.
          The owner, 2026-09-02: "to create group, need to be added a + sign next
          and above seocial page, not under discover." The floating + was duly
          removed and `explore/Groups.tsx` records the whole contract in its
          guard block — including that the header must open the flow with
          `?tab=groups&create=1`. For a week nobody wrote either half: `Plus` was
          imported into the header and never rendered, `useSearchParams` was
          imported into Groups and never called, and nothing called
          `setCreating(true)`, so the create flow — card, privacy choice, server
          write and all — was unreachable. A group could not be made at all.

          It lived in `ExploreLayout`'s header, shown only while the path started
          `/explore/social`. Social is its own destination now, so the button
          moved here with it: same contract, one owner.

          It sets the params rather than navigating to a literal URL, so the
          button cannot be left pointing at a path this screen no longer lives
          at — which is exactly how it would have been lost in this move.

          ── IT IS ON THE GROUPS TAB ONLY, and here is the reasoning ───────────
          `Community` — the Feed tab, and only that tab — portals a large azure
          + into the bottom-right of the phone shell, labelled "Create a post".
          Unconditional, this one put a SECOND + on that same screen: a bare
          glyph in the top-right, under the title "Social", above a feed. Read
          straight, it says "new post". It is not; it makes a group. Two + signs
          on one screen doing different things, and the wrong one is the one
          that reads as obvious.

          The other three options were a visible label, a different glyph, and
          leaving it. A label in a header that is otherwise all icons is a
          one-off; there is no lucide glyph for "group" that does not read as
          "add a friend"; and leaving it keeps a control that lies about itself.

          IT DOES NOT BECOME UNREACHABLE, which is the constraint that matters
          because this + is the only way to create a group (the guard block in
          `explore/Groups.tsx` says so, and says not to add a second):
            · The Groups tab is one tap away from every other tab, and the strip
              that reaches it is on screen at all times.
            · On the Groups tab the + is the ONLY + on screen, sitting directly
              above the list it adds to — so a bare glyph there is unambiguous.
            · Every "Start a group" control elsewhere in the app deep-links to
              `?tab=groups&create=1`, which opens the form directly without
              needing this button at all.
          Do not make it unconditional again without dealing with the Feed's +.
        */}
        <ScreenHeader
          title="Social"
          large
          /* NO `back`. This is a bottom-bar destination — there is nothing
             behind it to go back to, and a chevron that pops you out of the
             app or does nothing at all is worse than no chevron. */
          action={
            sub === "groups" ? (
              <button
                type="button"
                aria-label="Create a group"
                onClick={() => setParams({ tab: "groups", create: "1" })}
                className="flex h-9 w-9 items-center justify-center rounded-full text-mist transition-colors hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
              >
                <Plus size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            ) : undefined
          }
        />
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
