import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2, Plus, Check, ChevronDown, Heart } from "lucide-react";
import { SegmentedTabs } from "@/components/layout/chrome";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { FEED_FILTERS, type FeedFilter } from "@/social/community";
import { cn } from "@/lib/utils";

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
  const feedRaw = params.get("feed");
  const feed: FeedFilter = FEED_FILTERS.some((f) => f.id === feedRaw)
    ? (feedRaw as FeedFilter)
    : "for-you";

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
        {/*
          THE INSTAGRAM ROW — the owner's reference for Social, 2026-09-07:
          "+" on the left, the feed's name in the middle with a chevron that
          opens the feed choices, the heart on the right.

          Each of the three does something real: + creates a post on the Feed
          tab and a group on the Groups tab (the only two things this screen
          can create); the middle is the feed filter that used to be a row of
          chips; the heart opens notifications. Nothing is drawn for a tab
          that has nothing to create.
        */}
        <div className="flex h-12 items-center justify-between">
          {sub === "community" || sub === "groups" ? (
            <button
              type="button"
              aria-label={sub === "groups" ? "Create a group" : "Create a post"}
              onClick={() =>
                sub === "groups"
                  ? setParams({ tab: "groups", create: "1" })
                  : setParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("create", "1");
                      return next;
                    })
              }
              className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-snow transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
            >
              <Plus size={26} strokeWidth={1.6} aria-hidden="true" />
            </button>
          ) : (
            <span className="w-10" aria-hidden />
          )}

          {sub === "community" ? (
            <FeedMenu
              value={feed}
              onChange={(v) =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (v === "for-you") next.delete("feed");
                    else next.set("feed", v);
                    return next;
                  },
                  { replace: true },
                )
              }
            />
          ) : (
            <p className="text-[17px] font-semibold text-snow">
              {SUBS.find((t) => t.value === sub)?.label}
            </p>
          )}

          <Link
            to="/notifications"
            aria-label="Notifications"
            className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-snow transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
          >
            <Heart size={24} strokeWidth={1.6} aria-hidden="true" />
          </Link>
        </div>
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

/**
 * "For you ▾" — the feed filter as Instagram draws it. The choices are the
 * same three the chip row used to offer; the value lives in the URL so the
 * Feed tab reads it and a reload keeps it.
 */
function FeedMenu({ value, onChange }: { value: FeedFilter; onChange: (v: FeedFilter) => void }) {
  const [open, setOpen] = useState(false);
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const current = FEED_FILTERS.find((f) => f.id === value) ?? FEED_FILTERS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full px-2 py-1 text-[17px] font-semibold text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
      >
        {current.label}
        <ChevronDown size={16} strokeWidth={2} aria-hidden className="mt-0.5 text-snow/70" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Feed"
            initial={still ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -3 }}
            transition={{ duration: still ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-1/2 top-full z-30 mt-1 w-44 -translate-x-1/2 overflow-hidden rounded-tile border border-hairline-strong bg-slate shadow-lg"
          >
            {FEED_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="menuitemradio"
                aria-checked={f.id === value}
                onClick={() => {
                  onChange(f.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[13.5px] transition-colors hover:bg-white/[0.05]",
                  f.id === value ? "text-snow" : "text-mist",
                )}
              >
                {f.label}
                {f.id === value && <Check size={14} strokeWidth={2.2} aria-hidden />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
