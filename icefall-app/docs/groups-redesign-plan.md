# Groups — redesign plan (brief step 2)

**Status:** plan only, written 16 Sep 2026 and revised the same day after review. No code, state or database has been changed.
**Target:** the owner's mockup boards. Board 1 covers the Groups tab, filter sheet, create flow and group pages. Board 2 covers post types and the composer.
**Depends on:** `docs/groups-structure-plan.md`. It supplies the one model, the file split (§5), the migrations (§6, "file N" below), the example source for demo builds (§3.3) and the gate questions (§4). No gate is built (structure D10).

Paths: `src/` = `icefall-app/src`. "New" means a new file or column. Where a column comes from a migration, it is named by file number from structure plan §6.2.

---

## At a glance

- **The brief's five questions map onto the mockup's four tabs** (§1):
  - "Who is coming" sits under the hero on every tab (faces and spots) and in full on Members.
  - Plan answers "are we ready", "what still needs doing" and the trip details.
  - Feed and Chat answer "what are we saying".
- **Every element has a real source or an honest absence.** Nothing in the mockups is copied in as data: no Alex, no Sophie, no 4,810 m, no stock photo credits (§7).
- **Readiness appears only as a band**, only for a team, only when that member has switched sharing on, and as a snapshot they can withdraw at any time. Others never see a number, and nobody ever sees health flags (§3).
- **Every paragraph shrinks to one sentence**, with the full wording one tap away (§5).

---

## OWNER RULING, 16 Sep 2026 — THE MOCKUPS ARE BUILT 1:1

The owner, after reading this plan: **"dont forget to make mockups 1:1. if agents finish and its not truly 1:1 you do it."**
This overrides every decision below that departs from the drawn screens. Layout, order, wording, controls, chips, icons, spacing and colours follow the mockups exactly. Where the drawing's *sample data* has no real source, the element is still drawn in the same place and shape and shows real data or a one-sentence honest state — never invented people, figures or photo credits (§7 still holds), and never a dead control (a control that cannot work yet says so in one sentence when tapped).

Decisions this ruling changes:

| Was | Now (1:1) |
|---|---|
| ~~E1 sub-tabs stay Feed / People / Groups / Leaderboard~~ | **SUPERSEDED 16 Sep, see the clarification below — E1 stands after all: tabs stay Feed / People / Groups / Leaderboard, restyled to the mockup's segmented-pill look.** |
| E4 join action under the hero | Kept only for non-members (the mockup draws member views); drawn in the mockup's button style. |
| E5/P4 three-dot stepper | **Four dots, filled exactly as drawn on each screen** (type: 1 of 4; details: 3 of 4; invite: 4 of 4). |
| E6 "Done" | The invite step's button reads **Create team**; "Skip for now" as drawn. |
| E7 only live chips | **All / Mountains / Regions / Identities** chips are drawn. A chip with no groups behind it shows the honest empty result in one sentence. |
| E8 "Other groups" list | Not drawn, so not built. Discover is search + chips + Official communities, as drawn. |
| E9 Add from contacts hidden | **Drawn.** Uses the Contact Picker API where the browser has it; elsewhere it says in one sentence that this phone's browser cannot open contacts. |
| E12 gear without price | **Price drawn as in the mockup** (optional, entered by the seller). |
| E19 extra Name field | **No Name field.** The name is made from the mountain as drawn ("Mont Blanc Team"; a community takes the mountain's name) and can be changed later from the settings gear. |
| E20 neutral post chips | **Coloured chips as drawn** (Conditions green, Training orange, Question violet, Poll blue, Partner wanted red, Gear red, Trip report blue), added as new `--ice-kind-*` tokens in `index.css` — never gilt, never alert. |
| "Who is coming" faces under the hero | Not drawn: the hero shows **"N of M spots"** with the lock, as drawn, and links to Members. |

**The element-by-element spec is `docs/groups-1to1-spec.md` (read zoomed in from the boards). R slices start straight after structure S7, building into the §5.2 target tree (structure ruling 4), not after S10.**

Verification for every R slice: a side-by-side of the built screen and the matching mockup crop (`scratchpad/groupsmock/*.png`), element by element; any difference in layout, order, wording, control or colour is a failed check.

## OWNER CLARIFICATION, 16 Sep 2026 (narrows the 1:1 ruling above)

The owner, after the first side-by-sides: *"i know but the concept and stuff is there like when i say 1:1 everything are the obv thing like page layout. The top profile navigation and current app pages like feed, people etc stay in the navigation style of the mockup."*

Reading: **1:1 means the obvious structural things** — page layout, card shapes, spacing, field order, wording, icons, colours, the sequence of screens. It does **not** mean renaming or removing the app's existing pages and tabs to match the mockup's own invented set. Two concrete corrections to the ruling above:

- **Top profile navigation stays exactly as the current app's `AppTopBar`** (avatar, name, search, messages, bell) — it already matches the mockup's own top bar in substance, so nothing here changes for Groups.
- **Social's existing pages — Feed, People, Leaderboard — stay.** E1 is restored: the tabs are still **Feed / People / Groups / Leaderboard**, not the mockup's Friends / Groups / Events. What changes is the tab strip's *navigation style*: it is rebuilt to look like the mockup's segmented-pill control (one rounded `bg-graphite` container, radius 12, height 44, equal segments, selected segment `bg-slate` with a 2px azure underline) in place of today's plain text row with an underline, at `Social.tsx:90-95`. The four labels sit in that control in their current order. This is a **styling-only** change to an existing file, not a Groups-only build slice — it is done once, early (folded into the first redesign slice that touches Groups tab chrome), and does not touch Feed, People or Leaderboard's own content.

Everything else in the 1:1 ruling above and in `docs/groups-1to1-spec.md` stands: the Groups tab's own content (My groups, Discover, chips, Official communities), the create flow, and the group page are still built element-for-element to the mockup. `docs/groups-1to1-spec.md` §1 is corrected to say "Feed · People · Groups · Leaderboard" in place of "Friends · Groups · Events", styled as the segmented pill.

## Decisions taken (owner asked to keep building)

| # | Decision | Why |
|---|---|---|
| E1 | Social's sub-tabs stay as Feed / People / Groups / Leaderboard (`Social.tsx:90-95`). The mockup's Friends / Groups / Events strip is not built here. | Changing it affects Feed and Leaderboard, which are outside Groups. Events has no real data behind it (`Events.tsx:18-27`). See P1. |
| E2 | A group page opens on **Feed**, as the mockup shows. "Who is coming" is kept first by putting faces and "N of M spots" under the hero meta, linked to Members. Plan runs The trip, then Are we ready, then What still needs doing. | The mockup is the target, and the brief puts "who is coming" first. See P2. |
| E3 | The group page drops the top bar and keeps the bottom tab bar, via a new `HERO_ROUTES` category next to `FULL_SCREEN_ROUTES` (`chrome.tsx:78-127`). Its matcher excludes `/social/groups/new`, which is a full-screen route (the mockup draws neither bar on create). With no top bar, the hero's buttons clear the notch themselves (`var(--screen-safe-top, env(safe-area-inset-top))`; the top bar normally does this, `App.tsx:486, 516`). | The hero photo owns the top of the screen in the mockup, and `/social/groups/:id` would otherwise also match `/new`. |
| E4 | A non-member sees exactly one primary action directly under the hero meta: Join, Ask to join, Asked, or Join (accepted). | The mockup draws none, but without it nobody could join. It keeps "one clear action per screen". |
| E5 | Create is 3 steps (type → details → invite) with a 3-dot stepper. The group is created on the first **Next** on details, and its id is then held in the URL (`?group=`). Back and Next again **update** that group; they never create a second one. | An invite link needs a group id. The mockup's fourth dot has no screen behind it. See P4. |
| E6 | The last button on the invite step reads **Done**, not "Create team". | The team already exists by then. |
| E7 | Filter chips and facets only appear when their column is live **and** the chip would change the result. Regions and Identities are not rendered. | Every group is a mountain today, so those chips would be dead controls. |
| E8 | Discover shows the Official communities rail, then an **Other groups** list of public teams. | Without the list, groups people create could only be found by searching. See P9. |
| E9 | The Add from contacts row is not rendered. Invite by email is a `mailto:` link that opens the person's own mail app. | Contacts has no support in iOS Safari. Email sending would be a new paid service (brief: ask first). See P5, P6. |
| E10 | Name search on the invite step sends the invite link by direct message (`messaging/send.ts:483`, `sendToProfile`). It never adds anyone to the group. | Only the joiner can seat themselves, and consent stays with them. |
| E11 | A pinned post is a real post chosen by the organiser. Nothing is auto-generated. | No invented content. |
| E12 | Gear posts are built for sale and for borrowing, with **no price field and no price column** until P7 is answered. | Selling is a money and house-rules decision. The mockup itself shows "£[price]" as a placeholder. |
| E13 | Poll results show after you vote, or once the poll is closed. The server enforces this: votes are readable only by their voter, and counts come from `group_poll_results` (file 5). | Avoids pile-on voting, and a UI-only rule would let anyone read who voted what. See P8. |
| E14 | A training post from a recorded activity is labelled "Recorded". One typed by hand is labelled "Entered". | Measured and self-reported are always told apart. |
| E15 | Group photos, including post photos, are stored in `group-media`, which only members can read, and every upload is re-encoded first so no GPS location survives (structure S3). Before that is wired, the composer offers words only. | `post-media` is readable by any signed-in account (`groupPosts.ts:197`), and raw uploads keep EXIF (`groupSpace.ts:1799-1801`). |
| E16 | A shared band is a **snapshot** taken when the member shares, stamped with the date it was assessed. It changes only when they share again. | Follows the per-share precedent of `readiness-to-operator` ("never a standing permission", `MIG/20260911200000:180-186`). See P10. |
| E17 | The chat message delete bin gets wired up: the author, organiser or staff can delete, as the policy already allows. Until then it is removed. | Today it is a disabled bin with "Deleting is not wired up yet" (`GroupWorkspace.tsx:3210, 3271-3285`), a dead control. |
| E18 | The live tokens are used as they are (§4). The hex values in the brief are read as a description, not a new palette. | The live accent is the rebranded azure (`index.css:140`). See P11. |
| E19 | Create details adds a **Name** field the mockup does not have, prefilled with the mountain name once one is picked (as `Groups.tsx:1598-1600`). A deviation from the mockup. | The server requires a name of 1–80 characters (`MIG/20260902100000:140`). |
| E20 | Post kind chips are neutral: icon plus word, `mist` text. | `alert` means caution (`index.css:165`) and gilt is the commercial layer (`:171-190`), so neither can mark Training, Partner wanted or Gear. See P14. |

## Open questions (do not block the build)

- **P1 Sub-tabs:** "Should Social's tabs become Friends / Groups / Events (dropping Feed and Leaderboard)? Events has no real data yet."
- **P2 Opening tab:** "Should a team open on Feed (as in the mockup) or on Plan or Members (the brief's 'who is coming, are we ready' first)?"
- **P3 Create entry:** "Once someone is in a group, where should Create live? The populated mockup draws no button. The plan keeps the '+' in the Social header."
- **P4 Stepper:** "The mockup stepper has four dots but three screens. Is a step missing?"
- **P5 Contacts:** "Is 'Add from contacts' wanted, given it only works on some Android browsers?"
- **P6 Email invites:** "Is opening the person's own mail app fine, or should ICEFALL send invite emails (a paid email service)?"
- **P7 Gear:** "May people list gear for sale with a price? If so, is that covered by the house rules?"
- **P8 Polls:** "Should poll results be visible before you vote?"
- **P9 Other groups:** "Should Discover list user-created public teams under the official rail? The mockup shows only the rail."
- **P10 Readiness refresh:** "Once a member shares their band, should it update by itself, or only when they share again?" (E16 defaults to a snapshot.)
- **P11 Palette:** "The brief's hex values differ from the live tokens (accent #5B8DEF against the live azure). Keep the live tokens?"
- **P12 Recorded training:** "May a recorded activity's distance, gain, time and elevation profile be posted into a group?"
- **P13 Designed without a target:** "The Plan tab, Members tab, settings sheet, ⋮ menu, Communities list and the plain Post row have no mockup. Are there designs for them?"
- **P14 Chip colours:** "Should post kinds have coloured chips? The existing colours already mean complete, caution, commercial and your own."
- Plus structure plan **Q1–Q5, Q12 and Q15**. Gates, community scope, the demo and real screenshots all change what these screens show.

---

## 1. Brief sections → mockup tabs

| Brief section | Where it lives | Team | Community |
|---|---|---|---|
| **Who is coming** | Under the hero: faces and "N of M spots", linking to Members. Members tab: organiser first, then members, then "Waiting for you" (organiser only), with an invite row at the top. | Yes | Yes (no readiness) |
| **Are we ready** | Plan tab, second block. The same band chip appears on each consenting member's row in Members. | Yes | **No.** Readiness is never offered to a large open group. |
| **What still needs doing** | Plan tab, third block: shared kit with claims, then bookings and deadlines | Yes | No |
| **Talk** | Feed tab (default) and Chat tab | Yes | Yes |
| **The trip** | Hero summary (name, elevation, dates, spots), plus the first block of Plan: objective, route, dates, experience, language, and a link to `/explore/mountain/:id` (`App.tsx:991`) when the app has that peak | Yes | Hero only, plus About in the ⋮ menu |

---

## 2. Screen by screen

Each table lists the element, the component (reused with file:line, or new), the data source, and the one-sentence absent state. The fuller text sits behind an `InfoSheet` (§5). **Mountains** always come from server mountains (`groups/mountains.ts`, structure §1.2); the app's `MOUNTAINS` supplies only the mountain page link and catalogue photo, when it has that peak.

### 2.1 Groups tab — populated

| Element | Component | Data | Absent state |
|---|---|---|---|
| Top bar (avatar, name, search, messages, bell) | `AppTopBar` (`components/layout/AppTopBar.tsx:148-187`), unchanged | Existing | — |
| Sub-tabs | `SegmentedTabs` (`chrome.tsx:265`), unchanged (E1) | URL `?tab=` | — |
| **MY GROUPS** kicker, See all | `SectionLabel` (`primitives.tsx:74`). See all shows only when there are more than 3 rows, and expands the list in place. | Count of rows | — |
| Group row | `GroupRow.tsx` (from `Groups.tsx:1349-1386`), flat, hairline between rows | `my_groups_overview()` (file 8). Before file 8: `useSharedGroups` filtered to `joined_by_me` (`network/interest.ts:254`) | — |
| Row photo | `MountainThumb` (`MountainImage.tsx:178`), or the signed `cover_path` | `groups.cover_path` (file 3), otherwise the mountain image when the app has that peak | The stand-in dot |
| Row name | Text, Inter Tight 15/semibold | `groups.name` | — |
| TEAM / COMMUNITY kicker | `.section-label` | `groups.kind` (file 3) | Kicker omitted while not live |
| Last activity line and icon | New `LastActivity` | `last_activity_kind` and `last_activity_preview` (file 8) | "Nothing posted yet." |
| Unread dot | New `UnreadDot`, azure | `unread` (file 8) | No dot. A dot is never shown when unread cannot be read. |
| **DISCOVER** kicker | `SectionLabel` | — | — |
| Search | Existing input (`Groups.tsx:941-951`). Placeholder "Search mountains or groups". Filter icon opens the sheet. | `group_discover(p_query…)` (file 3). Before that: `matchesQuery` (`Groups.tsx:675-684`) | "No group matches that." |
| Chips All / Mountains / Regions / Identities | Not rendered (E7) | — | — |
| **OFFICIAL COMMUNITIES** kicker, See all | `SectionLabel`. See all opens the Communities list (§2.14) and shows only when the rail is cut off. | `groups.official` (file 3) | "No official communities yet." |
| Community card | `DiscoverCard.tsx` (from `Groups.tsx:1198-1296`), restyled | `groups` + `destinations` | — |
| Card photo and credit | `useMountainImage` (`MountainImage.tsx:53`), credit from `MOUNTAINS[].photoCredit` (`types/index.ts:286`), resolved as in `HomeNew.tsx:176-177` | App peaks only, e.g. the real "Wikimedia Commons · CC0" for Mont Blanc (`data/mock/mountains.ts:438`) | Stand-in image and no credit line for other peaks. Never an invented credit. |
| COMMUNITY badge | `Badge` (`primitives.tsx:155`) | `groups.kind` | — |
| "+" join / Ask / tick | `HeroCircleButton` (`primitives.tsx:367`) → `useGroupActions().join` / `.requestJoin` (`groupSpace.ts:1425-1427`) | `visibility`, `joined_by_me`, own request | While a join is pending: "Asked" |
| **OTHER GROUPS** list (E8) | `GroupRow` | `group_discover(p_kind='team', p_visibility='public')` | "No other groups yet." |
| Saved on this phone | `DeviceGroupsSection` (structure plan §2.2) | `useApp().expeditions` without `movedTo` | Section not rendered when empty |

### 2.2 Groups tab — empty and absent

| State | What shows |
|---|---|
| Signed in, no groups | Group icon; "No groups yet."; "Join a community or create a team for your next objective."; one **Create group** button → `/social/groups/new` |
| Signed out (session ended) | "Sign in to see your groups." and a Sign in button |
| No backend (a non-demo build without keys; demo builds show the examples instead) | "Groups need ICEFALL's server, and this build has none." plus info |
| Not live | "Groups are not switched on for this server yet." plus info |
| Unreachable | "ICEFALL's server could not be reached." plus a Try again button |
| Loading | Row skeletons in the same hairline layout, with no invented counts |

### 2.3 Filter sheet

Built on `Sheet` (`components/ui/Sheet.tsx:29`), extended with a header `action` (Reset) and a sticky `footer` (Show results), the pattern of `Guides.tsx:953-1010` and `1615-1660`.

| Element | Component | Data | Absent state |
|---|---|---|---|
| Close, "Filter groups", Reset | Extended `Sheet` header | Local filter state | Reset is hidden while nothing is set |
| MOUNTAIN | `MountainPicker` search (`Groups.tsx:2338`) | Server mountains → `destination_id` | "No mountain matches that." |
| DATES: Any time / Next 3 months / Next 6 months / Custom range | `FilterChip` ×3 + two `DateField` (`components/ui/DateField.tsx:41`) | Overlap of `intended_on`..`ends_on` (file 3). Undated groups only match Any time. | Facet hidden while `ends_on` is not live |
| TYPE: Team / Community | `FilterChip` | `groups.kind` | Hidden while not live |
| EXPERIENCE: All / Beginner / Intermediate / Advanced / Expert | `FilterChip`, labels from `EXPERIENCE_LABELS` (`network/types.ts:79-84`) | `groups.experience` | Hidden while not live |
| LANGUAGE: All / English / French / German / Spanish / Italian / Other | `FilterChip` | `groups.language` | Hidden while not live |
| OPEN / PRIVATE: All / Open (anyone) / **Private (ask or invite)** | `FilterChip` | `groups.visibility` | — |
| Show results | `Button` (`primitives.tsx:45`), `TABBAR_STICKY_BOTTOM` | Count from `group_discover` | "Show results" without a number when the count is unknown |

The mockup's "Private (invite only)" is not used. Private currently means you ask and the organiser decides, and invites add a second way in (file 4).

### 2.4 Create — choose type

Full-screen route: no top bar, no tab bar (E3).

| Element | Component | Data | Absent state |
|---|---|---|---|
| Back, 3-dot stepper | New `Stepper` (azure dots, hairline track) | Step index in URL `?step=` | — |
| "What do you want to create?" | Heading, Inter Tight 22 | — | — |
| **Team** choice | New `TypeChoice` row with icon, title, one sentence and chevron: "A small group for one objective and date window." | — | — |
| **Community** choice | `TypeChoice`: "A larger open group around a mountain." (Regions and identities wait for Q2.) | — | — |
| Note | "Each mountain has at most one official community, so check before starting another." Choosing Community lists existing communities for the chosen mountain, each with **Join instead**. | `group_discover(p_kind='community', destination)` | — |

### 2.5 Create — details

**Team** (the mockup screen):

| Element | Component | Data | Absent state |
|---|---|---|---|
| Cover photo, **Change photo** | `GroupCover`-style 16:10 image. Change photo opens a picker over `useMountainGallery` (`MountainImage.tsx:223-340`). Upload comes later (`group-media`, re-encoded). | `cover_path` / `cover_credit` (file 3) | The mountain's own image when the app has that peak; otherwise the stand-in, and no Change photo until upload ships |
| Credit line under the photo | Text, 10px `mist-dim` | Gallery credit | No line when the credit is unknown |
| OBJECTIVE / MOUNTAIN | `MountainPicker` (`Groups.tsx:1587-1611, 2338`) over server mountains. Not `MOUNTAINS` or `destinationIdForPeak`. | `destination_id` | "No mountain matches that." |
| NAME (not in the mockup, E19) | Text input, prefilled with the mountain name once picked, editable, 1–80 characters | `groups.name` | "Give it a name." |
| DATES (range) | Two `DateField`s in one row | `intended_on`, `ends_on` | Optional |
| SPOTS | Number stepper (from `CreateExpedition.tsx:602` `NumberPills`) | `capacity` 2–50 | Optional. With no value the page shows "N members" instead of "N of M spots". |
| EXPERIENCE REQUIRED | Select with `EXPERIENCE_LABELS` | `experience` | Optional |
| ROUTE (OPTIONAL) | Text input. Placeholder is the chosen mountain's first catalogue route name when the app has one, otherwise "Route name". | `route_label` | — |
| LANGUAGE | Select | `language` | Optional |
| PRIVACY | Select: Open / Private (ask or invite). Default Open (Q5). | `visibility` | — |
| **Next** | `Button`, sticky. The first tap creates the group (`useGroupActions().create`, `groupSpace.ts:1518`, extended); later taps update it (E5). | `groups` insert, then organiser update | "Choose a mountain first." / "Give it a name." / create-failure sentences (§5) |

Any column that is not live yet is **left off the form**, never shown disabled.

**Community:** name, mountain, language, description (≤1,000 characters) and privacy. No dates, spots, route or experience.

### 2.6 Create — invite

| Element | Component | Data | Absent state |
|---|---|---|---|
| "Invite your team" | Heading | — | — |
| Search by name | Input → `usePeopleSearch` (`search/people.ts:411`). Each result has **Send invite**, which sends the link by DM (E10, `messaging/send.ts:483`), respecting `canMessage` (`:637`). | `profiles` | "Nobody matches that name." / "They don't accept messages." |
| Add from contacts | **Not rendered** (E9) | — | — |
| Share invite link | Row with chevron → `ShareGroupLink` (`GroupWorkspace.tsx:2488-2558`). For private groups it first calls `group_invite_create` (file 4). | Group URL, or invite token URL | Before file 4 is live, private groups share the plain link with "People with this link can ask to join." |
| Invite by email | Row → `mailto:?subject=…&body=<invite url>` (E9) | — | — |
| Skip for now / **Done** | Text button + `Button` → the group page | — | — |

### 2.7 Group page — hero and chrome (team and community)

| Element | Component | Data | Absent state |
|---|---|---|---|
| Route chrome | `HERO_ROUTES` (E3): no top bar, tab bar kept. Content clears the tab bar with `TABBAR_CLEAR` (`chrome.tsx:35`); hero buttons clear the notch. | — | — |
| Full-bleed photo | `GroupCover` (`components/groups/chrome.tsx`, from `groupChrome.tsx:221-261`) with `scrim-bottom` | `cover_path`, otherwise the mountain image when the app has that peak | Stand-in images keep the "Representative terrain" mark (`groupChrome.tsx:197-204`) |
| Back | Existing (`:245-252`, `useDetailBack`) | — | — |
| Settings gear (organiser; designed without a target, P13) | `HeroCircleButton` → new `GroupSettingsSheet`: name, dates, spots, experience, route, language, privacy, cover, hand over organiser, delete group | `groups` update (files 2 + 3), `group_transfer_organiser`, `groups` delete | Hidden for non-organisers |
| ⋮ menu (designed without a target, P13) | `HeroCircleButton` → `Sheet` with `SheetRow`s (`Sheet.tsx:97`): Share, Invite people, About, Safety, Leave group | — | "Report group" only after Q13 |
| Name | Inter Tight 28/semibold, **not** `.display` (§4) | `groups.name` | — |
| Elevation · dates | `MetaRow` (`groupChrome.tsx:341`) | `destinations.elevation_m` (Mont Blanc is 4,806 m, `mountains.ts:383`); `intended_on`–`ends_on` | Dates omitted when unset. A single date shows when there is no end date. |
| **Who is coming:** faces, spots and lock | `AvatarStack` (`groupChrome.tsx`) + "N of M spots" + lock/globe; one tap → `?view=members` | Faces from `useGroupRoster` (members only); `member_count` + `capacity`; `visibility` | Non-members see the count only, never faces. "N members" when there is no capacity. The count is never shown as 0 when unreadable. |
| Globe · Community | `MetaItem` | `kind='community'` | — |
| Photo credit | 10px `mist-dim` line | Cover or catalogue credit | No line when unknown |
| Non-member action (E4) | `GroupAction` (`groupChrome.tsx:277`) + `StandingNote` (`GroupWorkspace.tsx:2721-2804`) | `readGroup` standing (`groupSpace.ts:824`) | One sentence per standing (§5) |
| Tabs | `GroupTabs` (from `FeedChatToggle`, `GroupWorkspace.tsx:2046-2077`). Underline style. `?view=feed|chat|plan|members`. | `kind` decides whether Plan exists | — |

### 2.8 Feed tab

| Element | Component | Data | Absent state |
|---|---|---|---|
| PINNED row | New `PinnedPost`: kicker, kind icon, title, one-line subtitle, chevron → `/social/post/:id` | `groups.pinned_post_id` (file 5) + post + details | Not rendered when nothing is pinned |
| Write a post (members, non-empty feed) | Flat row at the top → composer (§2.13) | Membership | Non-members: "Only members can see posts." |
| Post cards | `PostCard` (`components/social/PostCard.tsx:101`). `PostDetail` only carries chip, title, subtitle and stats (`:90-99`, rendered `:324-340`), so it gains **one** generic `extra` slot. Poll, Answered, Message and chart renderers live in `components/groups`. | `useGroupFeed` (`groupPosts.ts:843`) + `group_post_details` (file 5) | — |
| Comments | `Comments` / `PostThread` (`Comments.tsx:161,192`) | `post_comments` (+ replies, `MIG/20260915120000`) | — |
| Report | `ReportDialog` (from `GroupFeedSection.tsx`) | `reports` | — |
| Empty (team) | `AbsenceMark` icon; "No posts yet."; "Share route beta, training updates or ask the team a question."; **Write a post** | `GROUP_FEED_EMPTY` state | — |
| Empty (community) | Same, with "Share conditions, trip reports or ask a question." | Same | — |
| More posts | "Showing the latest {n} of {count}." + Load more | Exact count (`groupPosts.ts:707`) | — |
| Refresh | Existing check-for-new button (`GroupFeedSection.tsx:169-176`) | Manual (Q14) | "Tap to check for new posts." |

### 2.9 Chat tab

| Element | Component | Data | Absent state |
|---|---|---|---|
| Messages | `Conversation` / `MessageRow` (`components/groups/Conversation.tsx`, from `GroupWorkspace.tsx:3145-3289`) | `useGroupMessages` (`groupSpace.ts:1361`) | "No messages yet." |
| Delete own message | Wired (E17) → new `useGroupActions().deleteMessage` | `group_messages` delete policy (`MIG/20260903010000:763-770`) | — |
| Composer | `MessageComposer` (`:3301-3419`), `TABBAR_STICKY_BOTTOM`; photos re-encoded (E15) | `useGroupActions().send` | "Every member can read what you send." |
| Non-member | `SpaceAbsence` (`groupChrome.tsx:108`) | `MESSAGES_MEMBERS_ONLY` | "Only members can read the chat." |

### 2.10 Plan tab (team only; designed without a target, P13)

**Block 1 — THE TRIP**

| Element | Component | Data | Absent state |
|---|---|---|---|
| Objective and link | `TheTrip.tsx` (from `GroupDetails`, `GroupWorkspace.tsx:2580-2682`) → `/explore/mountain/:id` only when the app has that peak; otherwise the name as plain text | `destination_id`, `destinations` | "This mountain's record did not load." |
| Route, dates, spots, experience, language | Flat label/value rows | File 3 columns | Each unset row is omitted |
| Going with a guide | Optional link row → `components/groups/Operators.tsx` (moved in structure S7), `operatorSearchUrl` | `operatorsFor` | Row omitted when none |

**Block 2 — ARE WE READY** (rules in §3)

| Element | Component | Data | Absent state |
|---|---|---|---|
| My row | New `ReadinessSelfRow`: my band + provenance + **Share with this team** switch, with a preview of exactly what others will see | `assessObjectiveReadiness` (`coach/mountainReadiness.ts:1334`) via `useMemberReadiness` (`groups/readiness.ts`); consent via `health/consent.ts:77-93` and the group-scoped event (file 7) | "Add {mountain} as an objective to see your band." |
| Other members | New `ReadinessMemberRow`: avatar, name, band chip, `QualifierBadge` (`components/coach/DataState.tsx:232`, mapping in §3 rule 5), "Assessed {date}" | `group_readiness_shares` (file 7) | "Not shared." |
| Summary line | "{n} of {m} members have shared." Counts only; never an average. | Same | "Nobody has shared yet." |
| Verification line | "Each band comes from that member's phone, and ICEFALL does not verify it." | — | — |

**Block 3 — WHAT STILL NEEDS DOING**

| Element | Component | Data | Absent state |
|---|---|---|---|
| Kit list | New `KitChecklist.tsx`. Row: item, category, claimer avatar, Claim / Release. | `group_kit_items` (file 6). "Start from the {mountain} list" seeds from `generateChecklist` (`services/checklist`) only when the app has that peak; `services/checklist` gains no imports (Mountain mode allowlist). | "No kit items yet." + Start from the list / Add item |
| My own ticks | Unchanged, private | `checklistStatuses` (`AppState.tsx:593`) | — |
| Bookings and deadlines | New `PlanItems.tsx`: title, due date, done tick, who ticked | `group_plan_items` (file 6) | "No bookings or deadlines yet." + Add |
| Not live | `SpaceAbsence` | — | "Plans are not switched on for this server yet." |

### 2.11 Members tab (designed without a target, P13)

| Element | Component | Data | Absent state |
|---|---|---|---|
| Invite people (members) | Flat row → invite sheet (same rows as §2.6) | — | — |
| ORGANISER | `MemberRow` (`GroupWorkspace.tsx:3007-3028`), badge "Organiser" | `group_members.role` (file 2); fallback `created_by` | "The organiser has left; {name} now organises." (after promotion) |
| MEMBERS · n | `Roster` (`:2914-3005`) + `PersonAvatar` (`:2019`) with photo | `useGroupRoster` | "Members could not be loaded just now." |
| Readiness chip on a row | Same chip as Plan (team only) | `group_readiness_shares` | Nothing shown when not shared |
| Remove member (organiser) | Row ⋮ → confirm | `group_members` delete (organiser) | — |
| WAITING FOR YOU · n | `Requests` (`:3041-3127`), Accept / Decline | `group_join_requests` | "Waiting requests could not be loaded." |
| Safety | One line at the foot: "ICEFALL does not check anyone's identity, experience, qualifications or safety." + info (full `SAFETY_REMINDER`, `network/privacy.ts:51-52`) | — | — |
| Non-member | `StrangerPeople` (`:2450-2470`) | `ROSTER_MEMBERS_ONLY` | "Only members can see who is in this group." |

### 2.12 Post types (board 2)

Every card uses `PostCard` with its `extra` slot: chip, date, title, body, the kind's fields and optional media. Chips are neutral, icon plus word (E20). The ⋮ menu offers Report, plus Delete (author or organiser), Pin (organiser) and the kind's state action (author).

| Kind | Fields shown | State action | Data (file 5) | Notes |
|---|---|---|---|---|
| Conditions | Place or mountain · elevation; "Seen {relative observed_on}"; photo | — | `destination_id`/`place_label`, `elevation_m`, `observed_on` | **No Commons credit** on a member's photo; photo re-encoded (E15) |
| Trip report | Date range · outcome (Summit / Turned back); photo | — | `starts_on`, `ends_on`, `outcome` | "Not stated" shows no outcome |
| Training | Distance, gain, time; elevation profile (`components/domain/TrailProfile.tsx`, `components/ui/charts.tsx`); "Recorded" or "Entered" (E14) | — | `group_training_snapshots` | Recorded source waits for P12 |
| Question | Title, body; **Answered** pill | Mark answered (author or organiser) | `group_post_state.answered_at` | — |
| Poll | Question; options; Vote; results after voting or closing (E13) | Close poll (author) | `group_poll_options`, own vote from `group_poll_votes`, counts from `group_poll_results` | One vote each, changeable until closed |
| Partner wanted | Title, body; chips for level, month, route; **Message** | Mark found (author) | `level`, `month_on`, `route_label`, `found_at` | Message via `messageRouteFor` / `canMessage` (`messaging/send.ts:651, 637`). Hidden on your own post. Safety line under the button. |
| Gear | For sale / To borrow; title, body; condition; photo; **Message** | Mark sold / returned (author) | `gear_mode`, `item_condition`, `sold_at` | No price (E12) |

Before file 5 is live, every post renders as a plain text post and the composer offers words only.

### 2.13 Composer and templates

| Element | Component | Data | Absent state |
|---|---|---|---|
| Route | Full-screen `/social/groups/:id/post` (type list) and `/social/groups/:id/post/:kind` (template), in `FULL_SCREEN_ROUTES` | — | Non-member: "Join to post." |
| "Create a post" type list | New `PostTypeList`: flat rows (icon, title, one line). First a plain **Post** row (words, optional photo; designed without a target, P13), then the mockup order: Conditions report, Trip report, Training update, Question, Poll, Partner wanted, Gear to borrow / sell | Kinds from file 5 | Kinds not live are not listed; the plain Post row always is |
| House rules | `HouseRulesBlock` + `houseRulesBlockPublish` (`HouseRules.tsx:294`), unchanged | Acknowledgement | "Read the house rules to post." |
| **Conditions report** | New `ConditionsTemplate` | — | — |
| · Header | "Conditions report" / "Share what's changed on the mountain." | — | — |
| · LOCATION | `MountainPicker` over server mountains, with free-text fallback | `destination_id` or `place_label` | — |
| · ELEVATION (m) | Numeric input 0–8,849 | `elevation_m` | Optional |
| · DATE OBSERVED | `DateField`, default today, not in the future | `observed_on` | — |
| · WHAT'S CHANGED? | Textarea, 4,000 max (`groupPosts.ts:100`) | `posts.body` | "Write what you saw." |
| · Add photos | One photo in the first slice ("Add a photo"), re-encoded and uploaded to `group-media` (E15) | `posts.media_path` | Row hidden until group-media signing ships |
| · **Post** | `Button`, `TABBAR_STICKY_BOTTOM` → `postToGroup` (`groupPosts.ts:779`) + details insert | — | One-sentence failure (§5) |
| Trip report | Title, mountain, date range, outcome, body, photo | File 5 | — |
| Training update | From a recorded activity (`useRecordedActivities`) **or** entered by hand; title, body | File 5 snapshot | Recorded option hidden until P12 |
| Question | Title, body | — | — |
| Poll | Question, 2–6 options (≤80 chars each), optional close date | File 5 | — |
| Partner wanted | Title, body, level, month, route | File 5 | — |
| Gear | For sale / To borrow, title, body, condition, photo (no price, E12) | File 5 | — |

### 2.14 Communities list (designed without a target, P13)

Reached only from the rail's See all. Flat `GroupRow`s from `group_discover(p_kind='community')`, official communities first, paged. Empty: "No communities yet."

---

## 3. Consent rules

These are rules, not preferences. Each has a test in `test:groups-readiness-consent` (§8, R12), and the database side is covered by `tests/groups-readiness.test.mjs`.

1. **Only a band leaves the phone.** The bands are Beginning, Early, Building, Progressing, Advanced and Not assessed (`preparationWord`, `ShareReadiness.tsx:73-80`, moved to `groups/readiness.ts`). The share payload type has no numeric field, and a runtime check rejects any number except the date.
2. **Objective readiness only.** It comes from `assessObjectiveReadiness` (`mountainReadiness.ts:1334`) for the group's mountain. It never uses the daily score (`computeReadiness`, `coach/readiness.ts:643`) or its words (`readinessWord`, `:710`).
3. **Consent is explicit, per member, per team, and off by default.** The member's own switch shows the exact chip others will see before it is turned on. The wording in force comes from purpose `readiness-to-group`, which describes a band derived from a score, never the score (file 7). Granting writes a consent event **scoped to that team** (`scope_group_id`), because today's events and `health_record_consent` carry no scope (`MIG/20260903060000:226-250`, `MIG/20260911200000:114-118`). Withdrawing the purpose as a whole revokes every team share.
4. **Revocable in one tap, at once.** Revoking clears the band on the server. Leaving the team revokes automatically. After a revoke, others see "Not shared." with no hint of the band shown before.
5. **Provenance always shown.** `provenanceFor` (`ShareReadiness.tsx:94-101`) gives **Self-reported** when a fitness dimension is self-reported, **Mixed** when other self-reported inputs were used, and **Recorded** otherwise. `QualifierBadge` knows only estimated, self-reported and measured (`DataState.tsx:59`), so Recorded shows as `measured`, and Mixed and Self-reported show as `self-reported`. Never `estimated`. Each is followed by "Assessed {date}".
6. **A snapshot, not a feed.** The band is taken when the member shares and changes only when they share again (E16, P10).
7. **Self-asserted, and said so.** The band is computed and sent from the member's own phone, and the server cannot check it. The block says "ICEFALL does not verify it", so "Recorded" never reads as ICEFALL's check.
8. **Never a raw score for someone else.** A member's own row may link to their own readiness page, where their number lives.
9. **No group average.** `meanReadiness` is not used, because with two members an average gives away the other person's score.
10. **Health flags never, by construction.** The share payload and the server table have no field for any of these:
    - `altitudeIllness`, `limitations`, `limitationsNote` (`AppState.tsx:748-749`)
    - wearable vitals (`coach/recovery.ts:142,174`)
    - check-in answers
    - Lake Louise answers and red flags (`trip/lakeLouise.ts`)
    - mountain body check-ins (`mountain/body.ts:153`)
    - safety categories (`coach/safety.ts:40-66`)
    - `bodyMassKg`, `heightCm`, `birthYear`, `ageBand`
    - precise location, including photo metadata (E15)

    The test builds a payload from a profile carrying all of these and asserts none reaches the output. `altitudeIllness` is not even passed to the engine (as `mountainReadiness.ts:1345-1352` already notes).
11. **Teams only.** Communities never offer sharing, and the server refuses it.
12. **Members only.** Non-members and former members read nothing (RLS, file 7).
13. **The same rules apply to anything else personal.** Kit claims show a name to members only. Poll votes are readable only by the voter. Training posts from recorded data wait for P12. A partner post's Message button respects `canMessage`.

---

## 4. Styling

| Brief name | Live token (use this) | Utility |
|---|---|---|
| bg | `--ice-obsidian` (`index.css:123`) | `bg-obsidian` |
| card | `--ice-graphite` (`:124`) | `bg-graphite` |
| card-alt | `--ice-slate` (`:125`) | `bg-slate` |
| hairline | `--ice-hairline` (`:241`) | `border-hairline` |
| accent | `--ice-azure` (`:140`) | `bg-azure` / `text-azure` |
| accent-soft | `--ice-azure-bright` (`:141`) | `text-azure-bright` |
| text | `--ice-snow` (`:129`) | `text-snow` |
| muted | `--ice-mist` (`:130`) | `text-mist` |

- **No hex values in any group file.** A grep in every slice enforces this (§8). No new token is added.
- **Semantic colours keep their meaning.** `summit` is complete, `alert` is caution, `danger` is severe, gilt is commercial (`index.css:163-190`). Post kinds use none of them (E20).
- **Font.** Inter Tight (`--font-sans`, `index.css:311`) throughout. **No serif display in Groups:** remove `.display` from `groupChrome.tsx:255` (hero name) and `Groups.tsx:1255` (card name). Hero 28/600, row name 15/600, body 14/400, meta 12/400, credits 10/400.
- **Kicker labels.** `SectionLabel` / `.section-label` (`primitives.tsx:74`, `index.css:380`: 10px, uppercase, 0.16em tracking) above every section.
- **Hairlines, not boxes.** Rows and post cards sit flat on the canvas, separated by full-width `border-hairline`. Filled surfaces are limited to inputs and chips, the pinned row, the two create-type choices, and sheets.
- **One clear action per screen.** One azure `Button`; everything else is a text or icon action.
- **Photography carries the page.** Every photo is the mountain's real image or the member's own upload, with a scrim (`scrim-bottom`) where type sits on it. Credits appear only when known.
- **Clearing the bottom nav.** Scrolling content uses `TABBAR_CLEAR`; sticky Post / Next / Show results bars use `TABBAR_STICKY_BOTTOM` (`chrome.tsx:35-39`).
- **Stagger trap.** Each section owns its own `<Stagger>` with direct `<Rise>` children, and the page never wraps sections in a parent `Stagger` (`Groups.tsx:20-27`). Verified by reading computed opacity in JS after the animation settles, not by screenshots.
- **Touch targets** are at least 44px, including chips, the ⋮ button and info chevrons.
- **Light theme** comes from the same tokens (`index.css:722` onwards), with a screenshot in the final slice.

---

## 5. Text-length policy

**Rule.**
- Each explanatory paragraph or message becomes **one sentence on screen** plus an `InfoSheet` trigger (a chevron or "i", `aria-label="More about this"`) that opens the full text.
- The full text keeps its meaning. It may be tidied, but no honest caveat is dropped, and the on-screen line never claims something the full text does not.

**Mechanism.**
- `groups/copy.ts` maps each message to `{ line, more }`.
- The data-layer constants in `groupSpace.ts` and `groupPosts.ts` **keep their exact values**, because `groupPosts.test.ts:172-497` compares by identity and `:411` bans "no posts yet" wording in four of them.
- Screens call `lineFor(message)` and show the constant itself as `more`.

**Test: `test:groups-copy`.** It checks that:
- every exported group message constant has a line;
- each line is one sentence (one terminal `.`, `?` or `!`) of 90 characters or fewer;
- every line has a `more`;
- the lines for `GROUP_FEED_NOT_LIVE`, `GROUP_FEED_REFUSED`, `GROUP_FEED_UNREACHABLE` and `POSTS_MEMBERS_ONLY` still do not match `/no posts yet|has not posted|nobody has posted/i`;
- no line mentions invites or a plan before files 4 and 6 are live.

**Scope.** Only live strings are rewritten. Strings on the retired local `Workspace` and `CreateExpedition`, and in parked code, go when that code goes (structure plan §2.5).

### 5.1 Constants

| Constant | On-screen line |
|---|---|
| `GROUP_SPACE_NO_BACKEND` (`groupSpace.ts:158`) | "This build is not connected to ICEFALL's server." |
| `GROUP_SPACE_SIGNED_OUT` (`:169`) | "Your session ended, so sign in again to open this group." |
| `GROUP_SPACE_NOT_LIVE` (`:173`) | "Groups are not switched on for this server yet." |
| `GROUP_SPACE_UNREACHABLE` (`:177`) | "ICEFALL's server could not be reached." |
| `GROUP_SPACE_REFUSED` (`:189`) | "The server refused this, and nothing was deleted." |
| `GROUP_NOT_FOUND` (`:193-194`) | "No group matches this link." |
| `ROSTER_MEMBERS_ONLY` (`:200`) | "Only members can see who is in this group." |
| `MESSAGES_MEMBERS_ONLY` (`:204`) | "Only members can read the chat." |
| `SEND_MEMBERS_ONLY` (`:214`) | "Only members can send messages, so nothing was sent." |
| `PRIVATE_MEANS_ASK` (`:224`) | "This group is private, so ask to join." |
| `VISIBILITY_EXPLAINED` (`:228-229`) | "Everyone can see a group's name and mountain; private groups need your yes to join." |
| `ACCEPT_MEANS_VISIBLE` (`:237`) | "Accepting lets them see the members and everything said so far." |
| `ACCEPTED_NOT_SEATED` (`:248`) | "You were accepted, so tap Join to take your place." |
| `POSTS_MEMBERS_ONLY` (`groupPosts.ts:126`) | "Only members can see this group's posts." |
| `GROUP_FEED_EMPTY` (`:133`) | "No posts yet." |
| `GROUP_FEED_NO_BACKEND` (`:137`) | "This build is not connected to ICEFALL's server." |
| `GROUP_FEED_NOT_LIVE` (`:149`) | "Group posts are not switched on for this server yet." |
| `GROUP_FEED_UNREACHABLE` (`:153`) | "ICEFALL's server could not be reached." |
| `GROUP_FEED_REFUSED` (`:164`) | "The server refused this, so try signing in again." |
| `GROUP_FEED_SIGNED_OUT` (`:168`) | "Your session ended, so sign in again to see posts." |
| `GROUP_FEED_NO_SUCH_GROUP` (`:172`) | "No group matches this link." |
| `GROUP_POST_MEMBERS_ONLY` (`:176`) | "Only members can post, so nothing was sent." |
| `GROUP_POST_MEDIA_CAVEAT` (`:197`) | Retired once photos go to `group-media` (E15) |
| `SAFETY_REMINDER` (`network/privacy.ts:51-52`) | "ICEFALL does not check anyone's identity, experience, qualifications or safety." |
| `CREATE_NO_BACKEND` / `SIGNED_OUT` / `NOT_LIVE` / `UNREACHABLE` / `REFUSED` (`Groups.tsx:1455-1467`) | "Nothing was sent, because this build has no server." / "Your session ended, so sign in again; your details are kept." / "Privacy settings are not live yet, so nothing was created." / "ICEFALL's server could not be reached, so try again." / "The server refused this, so nothing was created." |
| `network/groups.ts` notices (`:114, :118, :312, :477`) | Retired with the local workspace |

### 5.2 Paragraphs on the live screens

| Where | On-screen line |
|---|---|
| `Groups.tsx:1164` | "Groups need ICEFALL's server, and this build has none." |
| `Groups.tsx:1167` | "Sign in to see groups." |
| `Groups.tsx:1171` | "No groups yet." |
| `Groups.tsx:1177, 1180` | Removed with the demo cards |
| `Groups.tsx:1074` | "Nothing you did is lost." |
| `Groups.tsx:1082` | "Join a community or create a team for your next objective." |
| `Groups.tsx:2525, 2549` (`SharedUnavailable`) | "Your groups could not be loaded just now." |
| `Groups.tsx:1569, 1570` | "You organise this group." / "People ask to join and you decide." |
| `Groups.tsx:1591` | "Groups are built around mountains on ICEFALL's server." |
| `Groups.tsx:1680` | "ICEFALL has no record of {peak}." (only when the server list was read) |
| `Groups.tsx:1755` | "Open is the safer place to start." |
| `Groups.tsx:2424` | "No mountain matches that." |
| `GroupWorkspace.tsx:2246, 2614` | "This mountain's record did not load." |
| `GroupWorkspace.tsx:2276, 2648-2670` | "The person who started this group has deleted their account." |
| `GroupWorkspace.tsx:2410` | "Members could not be loaded just now." |
| `GroupWorkspace.tsx:2464, 2465` | "Only members can see who is in this group." |
| `GroupWorkspace.tsx:2541-2545` | "Whoever opens the link must be signed in." |
| `GroupWorkspace.tsx:2746` | "Waiting for the organiser to answer." |
| `GroupWorkspace.tsx:2766` | "The organiser said no to this request." |
| `GroupWorkspace.tsx:2783` | "Joining shows your name to the other members." |
| `GroupWorkspace.tsx:2831` | "You can see the members because you are one." |
| `GroupWorkspace.tsx:2847-2860` | "Leave this group?" / "You lose access to the chat and posts." (Plan is added once file 6 is live.) |
| `GroupWorkspace.tsx:2937, 2939, 2965` | "Waiting requests could not be loaded." |
| `GroupWorkspace.tsx:2984` | "No members came back from the server." |
| `GroupWorkspace.tsx:3114, 3115` | "Accepted." / "Declined." |
| `GroupWorkspace.tsx:3191` | "No messages yet." |
| `GroupWorkspace.tsx:3210` | Removed (E17) |
| `GroupWorkspace.tsx:3223`, `GroupFeedSection.tsx:174` | "Tap to check for anything new." |
| `GroupWorkspace.tsx:3334` | "Every member can read what you send." |
| `GroupWorkspace.tsx:3414` | "Photos only, up to {n} MB." |
| `GroupFeedSection.tsx:106` | "Only members can see the feed." |
| `GroupFeedSection.tsx:156` | "Showing the latest {n} of {count}." |
| `GroupFeedSection.tsx:262` | "Every member can read this post." |
| `GroupFeedSection.tsx:293` | "Read the house rules to post." |
| `GroupFeedSection.tsx:299` | Removed when photos land |

---

## 6. Reuse list

| Need | Reuse | Where |
|---|---|---|
| Chat | `useGroupMessages`, `useGroupActions().send`, `Conversation`, `MessageRow`, `MessageComposer` | `social/groupSpace.ts:1361, 1453`; `GroupWorkspace.tsx:3145-3419` |
| Group reads and actions | `readGroup`, `readRoster`, `useGroup`, `useGroupRoster`, `create`/`join`/`requestJoin`/`leave`/`decide` | `groupSpace.ts:824, 1022, 1518-1700` |
| Posts | `useGroupFeed`, `postToGroup`, `composeGroupPost`, `GroupFeedSource` seam | `social/groupPosts.ts:843, 779, 644, 262` |
| Post UI | `PostCard` (+ `detail`, plus the new `extra` slot), `Comments`, `PostThread`, `ReportDialog` | `components/social/PostCard.tsx:90-101, 324-340`; `Comments.tsx:161,192` |
| House rules | `HouseRulesBlock`, `HouseRulesLink`, `useHouseRulesAcknowledgement`, `houseRulesBlockPublish` | `components/social/HouseRules.tsx:294, 503` |
| Group chrome | `SpaceAbsence`, `AbsenceMark`, `GroupCover`, `GroupAction(Row)`, `MetaRow`, `AvatarStack` | `screens/explore/groupChrome.tsx:54-466` |
| Shell | `Screen`, `ScreenHeader`, `SegmentedTabs`, `Stagger`, `Rise`, `TABBAR_CLEAR`, `TABBAR_STICKY_BOTTOM`, `useDetailBack` | `components/layout/chrome.tsx:168, 213, 265, 529, 543, 35-39, 155` |
| Primitives | `Button`, `SectionLabel`, `Badge`, `Avatar`, `Divider`, `HeroCircleButton`, `IconAction` | `components/ui/primitives.tsx:45, 74, 155, 170, 278, 367, 389` |
| Sheets | `Sheet`, `SheetRow`; filters pattern | `components/ui/Sheet.tsx:29, 97`; `screens/guides/Guides.tsx:953-1010, 1615-1660` |
| Dates | `DateField` | `components/ui/DateField.tsx:41` |
| Mountains | Server list and app-peak lookup | `groups/mountains.ts` (structure S5) |
| Photos and credits | `useMountainImage`, `MountainThumb`, `useMountainGallery`, `MOUNTAINS[].photoCredit` (app peaks only); `prepareImage` before any upload | `components/domain/MountainImage.tsx:53, 178, 223`; `types/index.ts:286`; `lib/image.ts:382` |
| People | `usePeopleSearch`, `PersonAvatar`, `Roster`, `MemberRow`, `Requests` | `search/people.ts:411`; `GroupWorkspace.tsx:2019, 2914-3127` |
| Messaging | `sendToProfile`, `messageRouteFor`, `canMessage`, `openDirectThread` | `messaging/send.ts:483, 651, 637, 288` |
| Share | `ShareGroupLink` | `GroupWorkspace.tsx:2488-2558` |
| Readiness | `assessObjectiveReadiness`, `athleteFactsFrom`, `useMemberReadiness`, `preparationWord`, `provenanceFor`, `QualifierBadge` | `coach/mountainReadiness.ts:1334, 1586`; `groups/readiness.ts` (from `GroupWorkspace.tsx:238-302`); `ShareReadiness.tsx:73-80, 94-101`; `DataState.tsx:59, 232` |
| Consent | Consent client, purpose/wording read, revocation pattern | `health/consent.ts:57-198`; `enquiries/operatorShare.ts:290, 423, 482` |
| Kit | `generateChecklist`, `completion` (no new imports into that module) | `services/checklist.ts:201, 670` |
| Charts | `TrailProfile`, charts | `components/domain/TrailProfile.tsx`; `components/ui/charts.tsx` |
| Demo | Example source (structure §3.3) | `groups/demo/exampleSource.ts` |
| Upgrade (only after Q1) | `UpgradePrompt`, `LockedPreview` (inline only) | `components/growth/UpgradePrompt.tsx:102, 163` |

---

## 7. Mockup content that must never ship as data

This also binds the example source: it uses none of the below.

- **People and group names:** Alex, Sophie, "Mont Blanc Team", "Alpine Women", "Ecrins".
- **Figures:** "4,810 m" (the real value is 4,806 m), "1 of 4 spots", "16–23 Jun 2027", "12.4 km", "1,840 m", "6:32".
- **Photo credits:** "© Diego Delso, Wikimedia Commons" and "© Kimon Berlin, Wikimedia Commons".
- **Placeholder price:** "£[price]".
- **Post and poll text:** every example title and body, and the poll options "50 m / 60 m / 70 m".
- **Stock photos:** the stock helmet and mountain photos.
- **Where they may appear:** placeholders ("e.g. Goûter Route") only as input hints, and only where they are true for the chosen mountain.

---

## 8. Build order

**Prerequisites.** Structure plan S0–S10 are done first: one model (S1–S7) and the split (S8–S10). **No R slice starts before S10.** Each R slice follows structure D13: it works before its migration is applied and shows "not live yet" until then. Files 4–8 are written in structure S11a–e, each before the slice that needs it.

**Standing checks for every slice:**
- `npm run typecheck` is clean.
- `npm test` passes, including `test:group-posts` and every new test chained in.
- The hex grep over group folders finds nothing.
- `grep -n "className=\"display" src/screens/groups src/components/groups` finds nothing.
- Screenshots at 375×812 in dark mode, with no `npm run build` while dev runs (sources below).
- Stagger: computed opacity of every `Rise` on the touched screens is 1 after the animation settles, read in JS.
- Content clears the tab bar, and hero screens clear the notch.
- The handbook is updated.

**Where populated screenshots come from:**
- **Example states:** the example source (structure §3.3) on 5210, every item labelled "Example".
- **Real states:** 5190, signed in against the production database, only once the owner answers structure Q15. No test group is created there before then.

| Slice | What | Needs | Extra acceptance checks |
|---|---|---|---|
| **R1** | `groups/copy.ts`, `lineFor`, `InfoSheet`; live screens switch to one sentence + info | S10 | New `test:groups-copy` (§5); `test:group-posts` unchanged and passing; before/after screenshots of five absent states |
| **R2** | Group page chrome: `HERO_ROUTES` (excluding `/new`), notch clearance, restyled `GroupCover` (Inter Tight, credit, dates), hero who is coming (faces + spots → Members), non-member action (E4), `GroupTabs` with `?view=` | S4, S5 | Screenshots: team and community pages, member and non-member; top bar hidden, tab bar visible, buttons below the notch; `/social/groups/new` still full-screen; back returns to `/social?tab=groups`; legacy `/explore/groups/:id` still opens; a non-member sees a count and no faces |
| **R3** | Members tab: roster promoted from the sheet, organiser badge (file 2 fallback), requests, invite row, safety line, remove member | S4, S5 | New `test:groups-members-view`: organiser from role or fallback; requests only for the organiser; a non-member never gets an empty list. Screenshots: organiser view with a request, member view, non-member view |
| **R4** | Chat tab: `Conversation` extracted, delete wired (E17), dead bin removed | S3, S10 | New `test:groups-chat`: delete offered only to author, organiser or staff. Screenshots: empty chat and chat with messages (example source) |
| **R5** | Feed tab: team/community empty states, Write a post, `PostTypeList` (plain Post row + live kinds), `PostCard` `extra` slot | S10; kinds need S11b | Screenshots: team empty, community empty, populated. The main Social feed is unchanged: before/after screenshots match and `test:group-posts` passes |
| **R6** | Groups tab: My groups first, flat rows, empty/absent states (§2.2), Discover search, Official communities rail (honest empty) with See all → Communities list (§2.14), Other groups, Saved on this phone | S5, S6 | Screenshots: empty signed in, populated (example source), no-backend, Communities list. No chip row rendered (E7) |
| **R7** | Filter sheet with live facets only | S5 | New `test:groups-filters`: date-overlap matching, undated only under Any time, a facet hidden when its column is missing, Reset clears all, the mountain facet offers server mountains only. Screenshot of the sheet |
| **R8** | Create flow: type → details → invite (E5, E6, E9, E10, E19); community variant; "Join instead" check | S5, S7, S11a | New `test:groups-create-flow`: fields not live are omitted; name prefilled from the mountain and held to 1–80 characters; the group is created on the first Next only; Back then Next updates it and creates no second group; community has no dates or spots; the picker offers no app-only id. Screenshots of all three steps plus the community details step |
| **R9** | Post kinds 1: Conditions, Trip report, Question (Answered) — templates and cards | S11b | New `test:groups-post-kinds`: payload validation per kind; elevation range; observed date not in future; state action author-only. Screenshots: composer list, Conditions template, three cards |
| **R10** | Post kinds 2: Poll, Partner wanted, Gear (no price), Training (Entered only) | S11b | `test:groups-post-kinds` extended: one vote; results only from `group_poll_results` after voting or closing; no other member's vote is read; Message hidden on own post; no price field. Screenshots of each card |
| **R11** | Plan tab: The trip, What still needs doing (kit claims, bookings and deadlines) | S11c | New `test:groups-plan`: claim/release self-only in the client model; community has no Plan tab; list seeding only for app peaks; mountain link only for app peaks. `test:trip-offline` passes. Screenshots: empty plan and populated plan |
| **R12** | Are we ready: self row with consent switch and preview, member bands, verification line, members-tab chips | S11d | New `test:groups-readiness-consent` proving every rule in §3: band only; no number in payload; daily score never used; health fields and photo metadata never present; consent event scoped to the team; purpose withdrawal revokes every share; revoke clears; leave revokes; community refused; provenance Self-reported when a fitness dimension is self-reported, Mixed when other self-reported inputs were used, Recorded otherwise; badge mapping never `estimated`; a snapshot does not change without a re-share; the verification line is present; no average. Screenshots: not shared, shared (self), a member's band |
| **R13** | My groups last activity and unread dot; mark read on opening a tab | S11e | New `test:groups-overview-client`: no dot when unreadable; preview trimmed to 80 characters. Screenshot of populated rows with a dot |
| **R14** | Light-theme pass and final sweep: no hex, no `.display`, every string has a line | R1–R13 | Screenshots of R2, R6 and R12 in light theme; `test:groups-copy` passes |

**Gates:** no R slice. Once Q1 is answered, a separate gates plan is written (structure §4.3).

**Where this plan departs from the 16 Sep review:**
- Official communities See all: a Communities list screen rather than omitting the link, because the mockup draws See all.
- Chips: every post kind is neutral, not only Training, Partner wanted and Gear, because `summit` (complete) and `azure` (the athlete's own) do not mean a post kind either; P14 asks.
