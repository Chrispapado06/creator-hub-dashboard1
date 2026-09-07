# SAFETY SURFACES — where a report control and a block control belong

Written 3 Sep 2026. A map, not an edit. Nothing in this document has been
implemented; every "should" below is a placement decision for whoever wires it.

---

## 0. The two facts that decide every row in the table

**A report can only ever name a PERSON.** Live `public.reports` is
`id, reporter_id, subject_id, thread_id, reason, detail, created_at, status`.
`subject_id` is a foreign key to `profiles(id)`; `thread_id` is a foreign key to
`threads(id)`. There is **no `post_id`**, no `comment_id`, no
`group_message_id`, no `channel_message_id`. So every report control in this app
— on a post, a comment, a story, a group message, a channel broadcast — resolves
to **the author's profile id in `subject_id`**, and says which item it was about
in **`detail`**. Anything else is a column that does not exist.

Consequence: `components/social/ReportDialog.tsx:158-167` inserts
`{ reporter_id, post_id: id, reason, detail }`. That insert has never succeeded.
Every post report ever filed fell into the `local(...)` branch at line 170 and is
sitting in `localStorage` under `icefall.reports.v1`. The message the reader gets
is honest; the delivery is zero.

**A block currently changes nothing anybody can see.** `public.blocks` is
`(blocker_id, blocked_id, created_at)` with policy `blocks_own` on both `USING`
and `WITH CHECK`, so the table and the permissions are ready. But `posts_select`
does not consult `blocks`:

```
(author_id = auth.uid()) OR is_staff() OR (expires_at IS NULL)
OR (expires_at > now()) OR EXISTS (SELECT 1 FROM highlight_items hi
                                   WHERE hi.post_id = posts.id)
```

So until a policy or a data-layer filter reads `blocks`, a block button must
either (a) filter on the client at the read boundary — the pattern
`social/comments.ts:67-71` already uses — and say that is what it does, or
(b) not exist. A block button that writes a row and hides nothing is the UI
telling a lie about a safety control, which is worse than no button.

**There are three block stores today and none of them is the table.**

| store | where | who writes it | who reads it |
|---|---|---|---|
| `icefall.blocked.v1` | `social/comments.ts:97-109` | `components/domain/CommentThread.tsx:166` | `commentsFor()`, `social/comments.ts:69` |
| guide moderation | `screens/guides/guideModeration.ts:66,80` | `screens/guides/GuideProfile.tsx:438` | the guide directory only |
| `AppState.blockedIds` | `state/AppState.tsx:528-531,1168-1184` | **nothing** | `screens/explore/People.tsx:516`, `screens/settings/Sections.tsx:851` |
| `public.blocks` | live database | **nothing** | **nothing** |

`screens/settings/Sections.tsx:850-870` is the page called "Blocked people". It
reads `AppState.blockedIds`, which no screen writes, so it renders
`"Nobody is blocked"` permanently and cannot ever do otherwise. That page is the
natural home for the real list once `blocks` is wired.

---

## 1. The table

`R today` / `B today` = does a report / block control exist on that surface right
now. "device" = it exists but only writes `localStorage`.

| # | Surface | File and line where the control belongs | R today | B today | What the control should do |
|---|---|---|---|---|---|
| 1 | **Post card** (feed, profile, search hit) | `components/social/PostCard.tsx:364-375` — the `role="menu"` block; Report is the only item, add Block after line 375 | **yes** — `onReport(post)` at :369, raised to the feed | no | Report → the author's `profiles.id` into `subject_id`, `detail` names the post id and quotes nothing. Block → `blocks` insert on `post.author.id`, then the feed drops their posts at the read boundary and says the feed is filtered on this device |
| 2 | **Report form** (destination of every #1) | `components/social/ReportDialog.tsx:158-167` — the insert; `:93-99` — the prop is `postId`, it must become the author id plus a subject description | broken | n/a | Take `{ subjectId, about }` not `{ postId }`. Insert `subject_id`, not `post_id`. Keep the six `reason` values verbatim (`:43-49`) — they are the live CHECK constraint. Keep the device fallback (`:134-140`) and keep the two outcomes distinguishable (`:87-91`) |
| 3 | **Comment** on a server post | `components/social/Comments.tsx:464-477` — the trailing control slot of the `<li>`; the bin at :468 is `mine(c)` only | no | no | Report → `subject_id = c.author.id`, `detail` carries the comment id and the post id. Block → hide their comments at `Comments.tsx` read time. **The comment at :464-467 must be deleted, not kept**: it says "`reports` takes a post id and has no column for a comment", and the first half is false against the live table |
| 4 | **Comment** on a device post | `components/domain/CommentThread.tsx:137-174` | **device** (:151-160, `queueReport`) | **device** (:161-170, `blockAuthor`) | Already correct in shape and honest in copy. Two changes only: it renders inside a `Sheet` (see §2 Q1), and its Block writes `icefall.blocked.v1` while everything else will write `blocks` — the two must converge or the athlete has two block lists |
| 5 | **Story viewer** | `components/social/StoryViewer.tsx:370-385` — the top-right cluster beside Close; the author is at `:505-538` | **no** | **no** | Overflow beside the Close button, matching #1's menu. The viewer is `createPortal`'d over the feed, so the card's menu underneath is unreachable — this is not a duplicate of #1, it is the only control while a story is open. Pause the timer while the menu is open (`holding` at :371 is the existing pause state) |
| 6 | **Highlight viewer** | `components/social/HighlightViewer.tsx:425-440` — same cluster, beside Close at :432 | **no** | **no** | Same as #5. A highlight is a kept story, so it is permanent rather than 24-hour, which makes the absence worse not better |
| 7 | **Public profile** (`AthleteProfile`) | Two places: the overflow menu `screens/explore/AthleteProfile.tsx:875-923` (Report only), and a new `<Rise>` after `:761` inside the `Stagger` that closes at `:762` (Report + Block card) | **no** — refused on purpose at `:917-922` and `:120-123` | **no** | The foot card is the primary home for Block (see §2 Q2). The menu gets Report only. Both comments at :120-123 and :917-922 must be rewritten, not left: their premise is "`ReportDialog` is keyed by a post", which stops being true the moment #2 is fixed |
| 8 | **Group roster row** | `screens/explore/GroupWorkspace.tsx:2431-2455` — `MemberRow`; the trailing slot at `:2451` where the founder `Badge` sits | **no** | **no** | Overflow → Report, Block, and "Open their profile". The name at `:2439` is a plain `<p>`, not a `Link`, so **there is no route from here to any surface that has a control** |
| 9 | **Group chat message** | `screens/explore/GroupWorkspace.tsx:2665-2727` — `MessageRow`; the trailing slot at `:2710-2724` where the disabled bin sits | **no** | **no** | Report → `subject_id = message.author.profileId`, `detail` carries the group id and message id. Block → hide their messages at `useGroupMessages` read time and say the conversation is filtered. Author name at `:2673-2677` is plain text, so again no route out |
| 10 | **Group join request** | `screens/explore/GroupWorkspace.tsx:2468-2554` — `Requests`, founder-only; the row at `:2494-2502` | **no** | **no** | A stranger's display name and avatar reach a founder here with only Accept / Decline. Report belongs beside Decline. Declining is already permanent (`:2541` — "the answer is kept so they cannot ask again"), which is a soft block; a real Block should also decline |
| 11 | **DM / thread message** | `screens/chat/Thread.tsx:156-219` — per message; and `:103-122` — the header, for a per-conversation Block | **partial and inert** | **no** | The existing button (`:195-203`) appears **only** when `OFF_PLATFORM` (`:51`) matches, and `onClick` is `setReported(true)` (`:199`) — it writes nothing, not even `queueReport`. Every message needs the control, not only the ones a regex caught, and it must reach `reports` with `thread_id` set (that column exists for exactly this) |
| 12 | **Channel message** (company broadcast) | `components/domain/CompanyChannels.tsx:214-288` — `MessageRow`; the footer row near `:279` | **no** | **no** | `channel_messages.author_id` is a `profiles` FK — the migration says "a company does not press buttons" — so a report resolves to a person exactly like everywhere else. This is the natural home of the `off_platform_payment` reason, and the promo note at `:253-263` is the free text most likely to carry it. Block on a channel = leave the channel, which is `channel_members` and already possible |
| 13 | **Summit log card** | `components/social/SummitLogCard.tsx:61` and `components/domain/SummitLogKit.tsx:181` | no | no | **No control needed today.** Every render site is the athlete's own log: `screens/Profile.tsx:1179`, `screens/social/PostDetail.tsx:53`, `components/domain/MountainPage.tsx:1092` (which passes `onRemove`). The moment a stranger's summit claim renders on `AthleteProfile` — the tab at `:1566` is `EmptyTab` today — this becomes row #1's twin |
| 14 | **Search result (person)** | `screens/Search.tsx:632-651` — `HitRow` | no | no | **Route, not a control.** A hit's `to` is `/social/people/:id`, which is row #7. A menu on a search row is a thumb hazard on a list somebody is scrolling fast. The one thing to check: `SearchHit.subtitle` is the person's own bio (`search/people.ts`), so an abusive bio is readable without opening the profile — acceptable only because the profile is one tap away and will have the control |
| 15 | **People directory card** | `screens/explore/People.tsx:1327` — `AthleteCard` | no | no | Same as #14: route to #7. `DISCOVERABLE_ATHLETES` is `[]` by rule, so nothing renders here today; `blockedIds` is already filtered at `:516` against a store nothing writes — repoint that filter at `blocks` when #7 lands and this row becomes correct for free |
| 16 | **Leaderboard entry** | `screens/explore/Leaderboard.tsx:432-466` — the row `Link` | no | no | Route to #7 (`to={/social/people/${entry.athleteId}}`, `:434`). No control on the row: it is a ranked list, and a menu on it invites tapping the wrong person's name |
| 17 | **Notification row** | `screens/Notifications.tsx:147-235`; the quoted text is at `:206` | no | no | **This is a broken route, not a missing button.** `destinationFor` (`:95-105`) sends a like/comment notice to `/social/post/:id`, and `screens/social/PostDetail.tsx:31-34` looks that id up in `useOwnPosts()` / `useSummitLogs()` — both `localStorage` (`social/posts.ts:68`, `social/summitLog.ts:51`). A server comment on a server post resolves to nothing and redirects to the feed. Fix the destination first; the control then lives on the comment (#3) |
| 18 | **Blocked list** | `screens/settings/Sections.tsx:850-870` | n/a | list only | Repoint from `AppState.blockedIds` to `blocks`. Show the name, the date, and Unblock. Today it reads a store nothing writes and therefore says "Nobody is blocked" for ever |

### Surfaces checked and deliberately excluded

- `screens/guides/GuideThread.tsx` — a guide *request* that is never sent
  (`:390`, "never sent"). There is nobody on the other end to be harassed by.
- `screens/explore/OperatorProfile.tsx:588-620` — reviews. `reviews.length === 0`
  always; ICEFALL has no customers and publishes no review.
- `components/social/Composer.tsx`, `PublishSummit.tsx`, `CreateHighlight.tsx` —
  your own words on the way out.
- `screens/explore/Community.tsx` `PromotedCard` — a placement, not a person.
  **That condition is now met and this line is a to-do, not an exemption.**
  Since `social/promoted.ts` began reading `promoted_placements`, the headline
  on a promoted post and a promoted story slide is `creative_headline` — free
  text a company wrote, delivered to a climber. It has no report control on
  either surface. The x on the feed card closes the placement for good but
  reports nothing to anybody, so this belongs in row #12.

### One structural warning for whoever implements this

`Stagger` animates **direct children only** (`components/layout/chrome.tsx:359-371`).
A new safety card added to a profile or a group screen must be a direct `<Rise>`
child of the `Stagger`, not wrapped in a `<div>` — wrapped, it stays at
`opacity: 0` with no error and no console warning. Row #7's placement (after
`AthleteProfile.tsx:761`, inside the `Stagger` closing at `:762`) is written that
way for this reason.

---

## 2. The three questions

### Q1 — `ReportDialog` is named "Dialog". Is it a modal, or is it inline?

**It is a modal overlay.** It renders `Sheet` twice — `:184` for the sent state
and `:211` for the form — and never anything else:

```tsx
return (
  <Sheet title="Report this post" onClose={onClose}>
```
— `components/social/ReportDialog.tsx:211`

`Sheet` is `components/ui/Sheet.tsx:51-67`, and it is a full modal by every
definition:

```tsx
return createPortal(
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="absolute inset-0 z-50 flex items-end bg-obsidian/80 backdrop-blur-sm"
    onClick={onClose}
  >
    <motion.div
      ...
      role="dialog"
      aria-modal="true"
```

`createPortal` out of the tree, `inset-0 z-50`, an 80%-opaque dimming backdrop
with a blur, click-outside-to-dismiss, `role="dialog"`, `aria-modal="true"`. That
is a popup, and it covers the feed the reader was looking at.

Two qualifications, because the constitution's two lines are not the same rule:

- `00-CONSTITUTION.md:129` — "**A modal / sheet / interstitial paywall.** Upgrade
  prompts are INLINE ONLY" — is a clause in the *fabrication* list and is about
  **paywalls**. It does not, on its face, forbid this sheet.
- `00-CONSTITUTION.md:63` — "cold, gloved, out of signal, at 4 a.m. in a hut …
  that single fact is why offline-first, large tap targets, **no popups** and
  'never a zero for a missing figure' are engineering requirements rather than
  preferences" — does, and without a paywall qualifier.

And `Sheet` is a shared house primitive used by fourteen files, so this is not
one rogue component; it is the app's standard bottom sheet.

**The decisive argument is not the constitution, it is the app's own precedent.**
The single closest thing ICEFALL already has to this feature —
`screens/guides/GuideProfile.tsx:1221-1293`, a card headed "Something wrong here"
carrying Report, Block and Support — is **fully inline**. It expands in the page
flow (`{open === "report" && <ReportForm … />}`, `:1279`), dims nothing, portals
nothing, and can be scrolled past. So:

> `ReportDialog` genuinely renders a modal overlay. It should be rebuilt as
> `SafetyActions`/`ReportForm` are built — an inline expanding block — and
> renamed off "Dialog" while it is being fixed anyway for the `post_id` bug.

Doing both at once matters: #2 in the table has to be edited regardless, and a
second pass over the same file later to un-modal it is a second chance to
introduce the same bug.

### Q2 — Where does a BLOCK control belong?

**Follow `SafetyActions` — `screens/guides/GuideProfile.tsx:1221-1293`.** It is
the app's own answer to this exact question, and it gets three things right:

1. **At the foot of the person's own page, not on a card in a list.**
   `GuideProfile` puts it after everything the athlete came to read
   (`:434-442`), under a `SectionLabel` reading "Something wrong here" — plain
   words, findable by someone scanning for a way out, invisible to someone who
   is not looking for one. A thumb scrolling a feed never lands on it.
2. **Weighted as destructive, and only Block is.**
   `<Button variant="danger">Block</Button>` (`:1255-1258`) beside
   `<Button variant="secondary">Report</Button>` (`:1241-1248`). The same split
   the app uses everywhere else it is serious: the comment bin turns `text-danger`
   on hover (`Comments.tsx:473`), "Delete this request" is `text-danger` and last
   in the menu (`GuideThread.tsx:415-425`), the disabled group-message bin carries
   its reason on the control itself (`GroupWorkspace.tsx:2710-2724`).
3. **The consequence is printed under the button, before it is pressed.**
   `{BLOCK_NOTE}` at `:1270` — `guideModeration.ts:80` — states that the person
   is not told, that nothing is reported by blocking, and that it is reversible
   from this page. That sentence is why no confirmation step is needed: the app
   does not ask "are you sure", it says what will happen and then does it.

So the placement is:

- **Block: on the person's profile only** — `AthleteProfile.tsx`, a new `<Rise>`
  after `:761`. Never in the top overflow menu at `:875-923`, which sits under a
  thumb reaching for the back chevron and currently holds "Share profile" and
  "Copy link". Block next to Share is a mis-tap waiting to happen.
- **Report: in both places** — the per-item overflow menu (rows #1, #3, #5, #6,
  #8, #9, #11, #12), because a report is about a *thing that was said* and the
  item is where you can still see it; and the profile card, because sometimes it
  is about the person rather than one post.
- **Reversal lives with the list** — `screens/settings/Sections.tsx:850-870`,
  plus an inline "Blocked" state on the profile itself, which `GuideProfile`
  already models at `:353-370`.

One deviation from the precedent is required: `GuideProfile`'s block is
device-local and its copy says so. A `blocks`-table block is a server row, and
until `posts_select` consults it, the hiding is still client-side. The note under
the button has to say **both** — the row is stored, the hiding happens on this
phone — or it repeats the exact failure of `ReportDialog`: a control that reports
a stronger guarantee than the system keeps.

### Q3 — Where can a user be harassed with NO route to report or block?

Ten. Ordered by how real the exposure is today.

1. **Group chat message** — `screens/explore/GroupWorkspace.tsx:2665-2727`.
   Server-backed, other people's words and photographs, delivered to every member.
   No report, no block, and the author's name at `:2673-2677` is a `<p>` rather
   than a `Link`, so there is not even a route to a profile that could carry one.
   The only control on the row is a bin that is `disabled` and only for your own.
2. **Company channel message** — `components/domain/CompanyChannels.tsx:214-288`.
   Server-backed commercial broadcast to every member. No report anywhere, and no
   author is rendered at all. `reports.reason` carries `off_platform_payment`
   specifically for this, and it is unreachable from the surface it was written
   for.
3. **DM thread** — `screens/chat/Thread.tsx`. A report button exists but **only**
   when `OFF_PLATFORM` (`:51`) matches the text — a threat, a pile-on or an
   impersonation gets nothing at all. And the button that does appear is inert:
   `onClick={() => setReported(true)}` (`:199`) sets a local boolean, calls
   neither the server nor `queueReport`, and the follow-up card at `:209-217`
   correctly says nothing was sent. No block, at message or conversation level.
4. **Group roster** — `GroupWorkspace.tsx:2431-2455`. A stranger's name, avatar
   and self-typed location, no control, no link out.
5. **Group join request** — `GroupWorkspace.tsx:2468-2554`. A stranger's display
   name reaches a founder with Accept and Decline as the only responses. A name
   chosen to abuse a specific person arrives here first.
6. **Comment on a server post** — `components/social/Comments.tsx:464-477`. Delete
   your own, and nothing else. The comment above it justifying the absence rests
   on a false premise about the live schema.
7. **Story viewer** — `components/social/StoryViewer.tsx`. Someone else's
   full-screen photograph and words, and because the viewer is portalled over the
   feed, the post card's Report menu underneath is unreachable while it is open.
8. **Highlight viewer** — `components/social/HighlightViewer.tsx`. Same, and
   permanent rather than 24-hour.
9. **Public profile** — `screens/explore/AthleteProfile.tsx:875-923`. Neither
   control, by an explicit decision recorded at `:120-123` and `:917-922`. The
   decision was right when it was made — both would have been dead buttons — and
   it becomes wrong the moment #2 in the table is fixed.
10. **A comment notification about your own post** —
    `screens/Notifications.tsx:206` quotes the words at you;
    `destinationFor` (`:95-105`) points at `/social/post/:id`;
    `screens/social/PostDetail.tsx:31-34` resolves that id against `localStorage`
    only and redirects to the feed when it misses. The most common harassment
    path in any social app — someone replies to your post — currently ends in a
    redirect.

And the two that are not surfaces but make all ten worse:

- **Every post report ever filed is on the reporter's phone.**
  `ReportDialog.tsx:158-167` inserts a `post_id` column that does not exist, so
  the catch branch at `:170` has always run. The words shown are true; the count
  that reached moderation is zero.
- **The page called "Blocked people" can never list anybody.**
  `screens/settings/Sections.tsx:851` reads `AppState.blockedIds`, which no
  screen writes.
