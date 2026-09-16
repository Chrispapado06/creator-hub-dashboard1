# Groups — structure plan (brief step 1)

**Status:** plan only, written 16 Sep 2026 and revised the same day after review. No app code, state or database has been changed. The Supabase files in §6 are written as files and **not applied**.
**Covers:** brief 1.1 (one model), 1.2 (demo data), 1.3 (access gates, as questions only), 1.4 (file split).
**Companion:** `docs/groups-redesign-plan.md` (brief step 2).

**Paths:** `src/` means `icefall-app/src`, and `MIG/` means `icefall-supabase/migrations`. Line numbers come from the current working tree on `feat/ofm-workspace`. That tree has large uncommitted changes to the group files (see R1 in §7).

---

## At a glance

- **One model.** A group is a row in the server `groups` table, and team versus community becomes a `kind` column. The phone-only `Expedition` group is retired.
- **Phone groups move by a tap, not silently.** Each one is offered for moving the next time its owner is signed in. Nothing is uploaded without that tap, and nothing on the phone is deleted.
- **Demo groups leave saved state.** Seeding comes out of `AppState.load()`, a local clean-up removes the four known records, and demo builds get one labelled example source that never touches saved state.
- **Gates are questions only.** Nothing gated is built until the owner answers Q1. Every Groups feature stays open, as today.
- **One model first, split second.** The local workspace is deleted before the split, so no code is moved only to be deleted.
- **Two 3,000-line files become sections.** Each section reads its own data and either renders or shows an honest state.

---

## OWNER RULINGS, 16 Sep 2026 (override anything below that disagrees)

1. **The mockups are built 1:1** — see the redesign plan's ruling. The owner compared the current create flow and group pages and said they are not 1:1; every R slice is checked zoomed-in, side by side against the mockup crop.
2. **"When you create a group [it] doesn't have to be mountain related."** A group may be about a mountain, a region, a trek, an identity (e.g. a women's climbing community) or nothing in particular. This answers **Q2** (yes, and teams too) and changes:
   - **File 3:** `groups.destination_id` becomes **nullable**; the `a group is about a peak` trigger (`MIG/20260902100000:194-212`) is replaced by one that only checks a destination *exists* when one is given (any `destinations.kind`); new `groups.topic text` (≤80, free label such as "Women who climb") and `groups.about check in ('mountain','region','trek','identity','other')` with a check that `about` agrees with the destination's kind when one is set. `group_discover` filters by `about` (the Mountains / Regions / Identities chips) and matches `topic` in search.
   - **D6 changes:** a phone group whose peak is not a server destination still **moves** — it moves with `destination_id` null and its peak name as `topic`. The move never refuses for a missing mountain.
   - **S5:** `groups/mountains.ts` becomes `groups/destinations.ts` (all server destination kinds, not only mountains); the create picker is **optional** ("Objective / Mountain" searches mountains, regions and treks, and free text becomes the topic). `test:groups-mountain-lists` still guards the app-vs-server mountain lists for links and photos.
   - Everything that assumed a group has a mountain (cover photo, elevation in the hero, Plan tab's mountain link, discovery cards) shows the mountain only when there is one, and otherwise the group's own cover and topic.
3. **"Only paid members can create groups."** This answers **Q1 for creating a group** (joining, posting and chatting stay open until the owner answers the rest of Q1). It changes D10 for this one gate:
   - **Client:** a `groups.create` feature on the paid plan only in `src/growth/tiers.ts` (paid = the plan `tiers.ts` calls Pro, which the app shows as Full Access); every door to create (Social "+", the Groups empty state's Create group, ExploreHub's Groups door, `/social/groups/new`) checks `can("groups.create")` and, when false, shows the existing INLINE upgrade path — no modal, no sheet (growth system rule). Demo builds follow whatever tier the device has, like every other gate.
   - **Server (new staged file 3b, `group_create_entitlement.sql`, applied right after file 3):** a definer function `public.has_full_access(uid)` that reads the existing `coach_entitlements` table exactly as `coach_consume` does (`MIG/20260911140000:280-288`: tier `pro`, or a trial still running) — the one server record of who has paid — and a `before insert` trigger on `groups` that raises `group_create_requires_full_access` otherwise. Staff bypass as elsewhere. It checks one fixed rule (no feature-id lookup), so a typo cannot become an outage. DB test: free user refused, pro allowed, active trial allowed, expired trial refused, staff allowed, existing groups untouched, the device-move import obeys the same rule.
   - Note for the owner: nobody is `pro` on the server until a payment processor writes it, so on the live database only a running trial (or staff) can create a group until billing lands.
   - **Test:** new `test:groups-create-gate` (client): every create door hidden-or-upgrade when `can` is false; allowed when true.

4. **Order changed to get the drawn screens sooner (16 Sep, after the owner's zoomed comparison).** After S7 the mechanical split S8–S10 is **not** done as a separate step: the redesign slices build every screen 1:1 straight into the target tree of §5.2 (`src/groups/`, `src/components/groups/`, `src/screens/groups/`) from `docs/groups-1to1-spec.md`, and delete what they replace from `Groups.tsx` / `GroupWorkspace.tsx`. When the last R slice lands those two files are gone or re-exports only, which completes brief 1.4. Moving code that is about to be rewritten would be done twice.

## Decisions taken (owner asked to keep building)

| # | Decision | Why |
|---|---|---|
| D1 | Server groups are the only group model. `Expedition` groups become a migration source, not a mode. | Only server groups have real members, requests, chat and posts. |
| D2 | `groups.kind` is `'team'` or `'community'`, and existing server rows are backfilled to `'team'`. | Every existing row is one mountain with an optional date, which is what a team is. Q9 confirms this. |
| D3 | Organiser becomes a role on `group_members`. If the last organiser leaves or deletes their account, the earliest-joined remaining member takes over. | Today a founder who leaves keeps every power, and a private group whose founder deletes their account has nobody who can accept requests. Q6 confirms this. |
| D4 | Moving a phone group needs an explicit tap per group. It never happens automatically. | The create screen told people their group "exists here and nowhere else" (`CreateExpedition.tsx:171`). Publishing it silently would break that promise. |
| D5 | Only the group record moves: mountain, dates, spots, experience, description and privacy. Notes, sessions, device log messages and checklist ticks stay on the phone, read-only, and are included in "Download my data". | They were written as private notes, and moving them would show them to future members. See Q11. |
| D6 | A phone group whose peak is not a **server** mountain cannot move. Group code reads mountains from `destinations` where `kind='mountain'`, never from the app's `MOUNTAINS`. | The server refuses anything else (`MIG/20260902100000:194-212`), and the lists differ: the app has 14 ids (`data/mock/mountains.ts:8`), 3 of them unknown to the server (`gran-paradiso`, `mount-olympus`, `triglav`); 41 of the 52 server mountains, including `ama-dablam`, are not in the app. (Written as 38 before anybody counted; `npm run test:groups-mountain-lists` counts both lists from the seed and holds the figure to 41.) |
| D7 | No new group can be created on the phone alone. Starting a group needs sign-in. | A group with one possible member is not a group. |
| D8 | The demo clean-up matches the four exact ids, written as literals in the clean-up module. It does not use a prefix match or import `demoGroupRecords.ts`. | Exact ids can never touch a real `expedition-*` id, and the clean-up keeps working after the demo file is deleted. |
| D9 | Demo builds (`DEMO`) get **one** example source for groups, members, posts and messages, plugged in through the read seams (§3.3). No inert demo cards, no group fixtures in `offline/fixtures.ts`. | Two mechanisms drift. The fixtures' honesty rests on the demo banner (`offline/fixtures.ts:21-24`), and that banner is off (`PhoneShell.tsx:48-70`), so each item carries its own "Example" label. See Q12. |
| D10 | No gate is built until Q1 is answered: no `groups/access.ts`, no gate table, no gate call in any policy, RPC or storage rule, and no `groups.*` id in `FEATURES`. | The brief says to ask before implementing any gate. A gate function that raises on an unknown id inside a `with check` turns a typo into an insert outage on live tables. `can()` returns false for an unknown id (`AppState.tsx:1595`, `tiers.ts:370-378`). |
| D11 | §4.2 lists what is proposed never to be gated. It goes to the owner with Q1. | Follows `UpgradePrompt.tsx:9-37` and the "free by safety decision" precedent. |
| D12 | Migration files are staged **without a timestamp** in `icefall-supabase/migrations-staged/groups/`. Each gets a fresh timestamp when it moves into `migrations/` (§6.3). | `db push` applies everything pending and refuses a file older than the last one applied, so a date fixed today would block a later push. |
| D13 | Every new client read works whether or not its migration is applied. New columns come from a second, optional select (or a retry with the base columns). A 42703 or PGRST204 there leaves those fields `null` and the rest of the page renders. A missing new table shows that feature's "not live yet" state. | App deploys and database applies happen at different times. Today any missing column makes the whole read "not-provisioned" (`groupSpace.ts:519-523`, `:833-846`), which would turn every live group page into "not live". |
| D14 | An organiser may delete posts in their group, as they can already delete chat messages. | Chat and posts then follow one rule. Q7 confirms this. |
| D15 | The old files stay as one-line re-exports while the split lands, and are removed once imports are updated. | `Social.tsx:12`, `App.tsx:226` and `Expeditions.tsx:22` keep working throughout. |
| D16 | Discovery hides groups with no members, counted by the existing definer `member_count(g)` (`MIG/20260902100000:285-293`). The row is kept. | `group_members` select is members-only (`MIG/20260902220000:187-189`), so an invoker count would hide every group the caller is not in. |

## Open questions (do not block the build)

Each question is written as it should be put to the owner.

- **Q1 Full Access: PARTLY ANSWERED 16 Sep — creating a group is paid (ruling 3); the other rows still open.** "For each row in §4.1, should it be free or Full Access? Is 'Full Access' the plan `tiers.ts` calls Pro (€9.99)? And should the §4.2 items always stay free?" *Nothing gated is built until this is answered and billing exists.*
- **Q2 Communities: ANSWERED 16 Sep — any subject, see ruling 2.** "Can a community be about a trek, a region or an identity (for example a women's climbing community), or only a mountain?"
- **Q3 Official communities:** "Are official communities created only by ICEFALL staff? Should one exist for every catalogue mountain before launch, or only when needed?"
- **Q4 Private groups:** "Should a private group be hidden from Discover, or listed by name and mountain but closed to joining? Today anyone signed in can see its name, mountain, date and member count."
- **Q5 Default privacy:** "Should new teams start open (the current ruling, 'Public to start — the safer mistake', `Groups.tsx:1755`) or private (as the mockup shows)?"
- **Q6 Organiser handover:** "When the organiser leaves or deletes their account, should the longest-standing member become organiser automatically?" (D3 assumes yes.)
- **Q7 Moderation:** "May an organiser delete other members' posts in their group?" (D14 assumes yes.)
- **Q8 Account deletion:** "Right now, anyone who has sent a group chat message cannot delete their account (`group_messages.author_id` is RESTRICT, `MIG/20260902220000:110`). Should their messages be deleted with the account, as posts already are?"
- **Q9 Existing groups:** "Should every group already on the server count as a team?" (D2 assumes yes.)
- **Q10 Moving phone groups:** "Should moving stay one tap per group, or happen automatically on sign-in?" (D4 assumes one tap.)
- **Q11 Notes and sessions:** "Should a phone group's sessions and notes move to the server as plan items, or stay on the phone?" (D5 assumes they stay.)
- **Q12 Example groups:** "Should labelled example groups appear only in offline builds, or also on the shared demo (5210 and the Vercel Preview)?" (Until answered they show in every `DEMO` build, so 5210 keeps an openable group.)
- **Q13 Reporting a group:** "Should a whole group be reportable, as well as its posts and messages?"
- **Q14 Live chat:** "Is tap-to-refresh chat fine for launch, or should messages arrive live? Live chat uses Supabase realtime, which is already in the current plan."
- **Q15 Real group for screenshots:** "Populated screenshots on 5190 need a signed-in account and a real group on the production database, and a test group there is fake data in real state. Which account and group should be used?" (No test group is created until answered.)

---

## 1. One group model (brief 1.1)

### 1.1 The two models today

| | Phone group (`Expedition`) | Server group |
|---|---|---|
| Type | `network/types.ts:167-182` | `GroupSpace`, `social/groupSpace.ts:365-409` |
| Id | `expedition-${Date.now()}` (`AppState.tsx:1799`) | uuid |
| Members | `memberIds`, only ever `"local:you"` (`types.ts:45`, `AppState.tsx:1762,1772`) | `group_members` (`MIG/20260902100000:165-174`) |
| Screen | `Workspace`, `GroupWorkspace.tsx:377-665` | `GroupSpaceScreen`, `GroupWorkspace.tsx:2079-2370` |
| Chat | Device log (`GroupWorkspace.tsx:1518`) | `group_messages` |
| Create | `CreateExpedition.tsx` (`/social/groups/new`) | `CreateGroupCard`, `Groups.tsx:1495-1822` |
| Chosen by | A local-state lookup first, then the uuid regex (`GroupWorkspace.tsx:331-337`) | |

### 1.2 The model

- **One record:** `public.groups`, read through `social/groupSpace.ts`. The header comment at `network/groups.ts:8-14` ("A GROUP IS AN `Expedition`") gets rewritten.
- **Kind:** `team` is a small group for one objective and date window, with Feed, Chat, Plan and Members. `community` is a larger open group with Feed, Chat and Members, but no Plan and no readiness.
- **Organiser:** stored as `group_members.role`. Founder-only powers become organiser powers (§6, file 2). `created_by` is kept only as history.
- **Trip fields:** `intended_on` (start), `ends_on`, `capacity`, `experience`, `route_label`, `language`, `description`, `cover_path` and `cover_credit` (§6, file 3).
- **Client type:** `GroupSpace` gains these as nullable fields, read by the optional select (D13). `null` always means "not set" or "not live". The client never substitutes a default.
- **Mountains:** new `groups/mountains.ts` reads server mountains (`destinations`, `kind='mountain'`) for the picker, filters and the move. The app's `MOUNTAINS` is used only for the mountain page link and catalogue photo, when it has that id. `destinationIdForPeak` (`enquiries/send.ts:91-96`) stays for enquiries only.

### 1.3 Nothing assumes a user is alone

| Code that assumes one member | Replacement |
|---|---|
| `meanReadiness` (`network/groups.ts:290`) and the group mean ring (`GroupWorkspace.tsx:832-895`) | Removed from group surfaces. Readiness is shown per member, as a band, with consent (redesign plan §3). In a group of two, an average would reveal the other person's score. |
| `YouRow` / `UnresolvedMemberRow` (`GroupWorkspace.tsx:898-973`) | The server roster (`Roster`, `:2914-3005`) |
| "You are the only member, so leaving deletes…" (`:1892`), and `leaveExpedition` deleting the group (`AppState.tsx:1842-1859`) | Leaving on the server. The group stays, and D3 hands the organiser role on. |
| `SharedChecklist` statuses are "your own" (`:994-1184`) | Shared kit items with claims (redesign plan §2.10). Personal ticks stay private. |
| `groupSummary` share text saying "no server" (`network/groups.ts:473-500`) | `ShareGroupLink` (`GroupWorkspace.tsx:2488-2558`) plus invite links |
| `DeviceGroupRow` showing "N members on this device" (`Groups.tsx:1396-1419`) | "Saved on this phone" rows with a Move action (§2) |
| Passport "Expeditions created" = `expeditions.length` (`passport/model.ts:890-896`) | Server groups I organise, plus phone groups not yet moved (§3.5) |

**Test:** `test:groups-roster-assumptions` checks that no group screen module imports `meanReadiness`, `LOCAL_ATHLETE_ID` or `useApp().expeditions`. The one exception is the device-move module in §2.

### 1.4 Routes

| Route | Today | After |
|---|---|---|
| `/social/groups/new` (`App.tsx:756`) | `CreateExpedition` (phone) | The existing server create form as a page (S7), then `CreateGroupFlow` (redesign R8). A full-screen route. |
| `/social?tab=groups&create=1` (`Social.tsx:215-218`, `ExploreHub.tsx:639`, read at `Groups.tsx:815-826`) | Opens the inline server form | Replace-redirect to `/social/groups/new` (S7) |
| `/social/groups/:id`, uuid (`App.tsx:757`) | `GroupSpaceScreen` | `GroupSpacePage` |
| `/social/groups/:id`, `expedition-*` | `Workspace` | If moved, a replace-redirect to the uuid. If not, `DeviceGroupSummary` (read-only). |
| `/social/groups/:id`, anything else | `NoGroupUnderThatLink` (`:680-704`) | Unchanged, with shorter text |
| `/explore/groups`, `/explore/groups/:id`, `/explore/groups/new`, `/explore/crew`, `/explore/crew/new` (`App.tsx:792-804`) | Redirects | **Kept.** The `/new` redirects now land on the server create flow. |
| `CrewExpeditions` lazy import (`App.tsx:214`) | Declared but never routed | Deleted |

**Inbound links to fix:** `People.tsx:1161` (link works, text "The same form as Your groups" is out of date), `treksAndGroups.ts:297`, `ExploreHub.tsx:639`, and the `backTo` targets in `GroupWorkspace.tsx` at `:417, :697, :1906, :2136, :2239`.

---

## 2. Moving phone-saved groups to the server

### 2.1 What moves, what stays

| Local field (`types.ts:167-182`) | Server | Notes |
|---|---|---|
| `peakName` | `destination_id` | Exact name match against server mountains (`groups/mountains.ts`). Not `destinationIdForPeak`, which knows only the app's 14 peaks and would call an Ama Dablam group unknown. No match means no move (D6). |
| (no name) | `name` | Prefilled with `peakName`, editable on the confirm row, 1–80 characters |
| `window.fromIso` / `toIso` | `intended_on` / `ends_on` | Refused if the end is before the start. The owner fixes the dates on the confirm row. |
| `sizeMax` | `capacity` | `sizeMin` has no server column, so it stays on the phone |
| `experience` | `experience` | Same four-value scale (`types.ts:77`) |
| `description` | `description` | 1,000 characters at most. Longer text is shown for the owner to trim before moving. |
| `privacy` | `visibility` | `public` → `public`, `invite-only` → `private`. Shown on the confirm row. |
| `id` | `origin_ref` | Makes the move safe to repeat (§2.4) |
| `memberIds` | — | **Never moved.** Server membership only comes from the creator trigger, a join, an accepted request or an invite. |
| `lookingFor`, `elevationM` | — | Stay on the phone. Elevation comes from the destination. |
| `groupSessions`, `groupNotes`, `groupMessages`, `groupStyle`, `groupChecklistShared`, `checklistStatuses["group:<id>"]` | — | Stay on the phone, read-only (D5, Q11) |

### 2.2 Flow when signed in

1. The Groups tab shows a **Saved on this phone** section when at least one `Expedition` has no `movedTo` and is not a demo id.
2. Each row shows the peak, the dates and a **Move to your account** action. If the server mountain list was read and has no match, the row says instead: "ICEFALL has no record of {peak}, so this group stays on your phone." If the list could not be read, the row says that rather than "no record".
3. Tapping Move expands the row inline, with no modal:
   - the name and privacy;
   - "This group will be published under {signed-in account name}." (`createdBy` is the local profile id, `AppState.tsx:1808`, so nothing ties the phone group to an account);
   - "Only the group moves; your notes stay on this phone.", with an info sheet listing what stays;
   - one primary button, **Move**.
4. `groups/local/deviceMove.ts` calls `group_import_device(...)` (§6, file 3). The call never lives in `AppState`: Mountain mode's offline allowlist includes `@/state/AppState` and bans supabase patterns (`trip/offline.test.ts:278-290, 590-601`). The result is read back through `readGroup`, and only when that succeeds are `movedTo: <uuid>` and `movedBy: <auth uid>` written locally. Both are optional fields, so the storage key is not bumped (`AppState.tsx:572-574`).
5. The row disappears, and old `expedition-*` links now redirect to the uuid.

### 2.3 When nobody moves it

- **Never signs in.** Outside demo builds the app requires a session (`groupSpace.ts:161-167`), so this happens only in demo and offline builds. Phone groups stay exactly as they are and open in `DeviceGroupSummary`: a read-only view of peak, dates, description, notes, sessions and log. Its one action is **Delete from this phone** (with a confirm step). In place of Move it says "This build has no server, so this group stays on this phone."
- **Signed in, never taps Move.** The Saved on this phone section stays on the Groups tab indefinitely, read-only. There is no reminder anywhere else, and nothing is uploaded or deleted.
- **Either way:** no editing, no new phone groups (D7), and they stay in "Download my data" (`Sections.tsx:3378-3395`).
- **After sign-out** the groups stay on the phone (`AppState.tsx:1628`), and the next account to sign in on that phone is offered them (R4).

### 2.4 Repeats and failures

- A unique index on `(created_by, origin_ref)` makes the move idempotent. If the app is killed between the server insert and writing `movedTo`, the next tap returns the same uuid rather than a duplicate.
- Each failure state gets one sentence: no backend, signed out, not live (file not applied), unreachable, or refused. Nothing local changes on a failure.
- If the read-back fails, `movedTo` is not written and the row stays.

### 2.5 Retired once the move ships (S7)

- The local `Workspace` and every section only it uses (`GroupWorkspace.tsx:377-665, 710-1917`). `Hero` at `:710-758` is already dead. **Moved first, not deleted:** `useMemberReadiness` (`:238-302`) to `groups/readiness.ts`, and `Operators` (`:1633-1728`) to `components/groups/Operators.tsx`, because the redesign uses both.
- `CreateExpedition.tsx` and `components/network/GroupCard.tsx`.
- `DeviceGroupRow` (`Groups.tsx:1396-1419`).
- The `?create=1` reader at `Groups.tsx:815-826` (now a redirect, §1.4).
- From `network/groups.ts`: `GROUP_CHAT_NOTICE`, `CHECKLIST_SHARING_NOTICE`, `GROUP_READINESS_NOTE`, `SHARE_FOOTER`, `SHARE_LINK_UNAVAILABLE`, `meanReadiness` and `groupSummary`.

`parseDay` and `formatWindow` stay, because Home imports `parseDay` (`useHomeModel.ts:40`, `HomeClassic.tsx:49`). The `AppState` writers stay only to read and delete old records: `leaveExpedition` becomes "delete from this phone", and `createExpedition` is removed.

---

## 3. Demo data removal (brief 1.2)

### 3.1 Seeding out of `load()`

- Delete `expeditions: demoGroupRecords(...)` at `AppState.tsx:628` and the fallback at `:641-644`. (The brief says line 627; in the working tree it is `:628`.)
- This also fixes the re-seed bug: today, deleting your last group brings four demo groups back on the next launch.
- Remove the import at `AppState.tsx:18`.

### 3.2 Local-state clean-up for installs that already hold them

- **New:** `src/groups/local/stateCleanup.ts`. Pure, no React, testable under esbuild.
  - `SEEDED_DEMO_GROUP_IDS` holds the literals `demo-group-mont-blanc`, `demo-group-alpine-women`, `demo-group-ama-dablam` and `demo-group-denali-2026` (the values at `demoGroupRecords.ts:35-40`).
  - `dropSeededDemoGroups(p: Partial<Persisted>)` returns the state without those `expeditions`, their `groupSessions` and `groupMessages` (by `groupId`), and their `groupNotes`, `groupChecklistShared`, `groupStyle` and `checklistStatuses["group:<id>"]` entries.
- It runs inside `load()` on every load. It is idempotent and needs no marker key, following the normalise-on-read pattern at `AppState.tsx:645-648`. The effect at `:1143` saves the cleaned state.
- `load()` is private to a `.tsx` provider, so its parsing part moves into `src/state/normalisePersisted.ts` to make it testable.
- **Scope:** only installs that ran a dev build or a `VITE_SHOW_DEMO=1` build ever held these records.
- **Accepted loss:** anything typed onto a demo group goes with it. See R6.

### 3.3 One example source behind `DEMO`

- **Delete:** `src/social/demoGroupRecords.ts`; the demo cards in `social/demoGroups.ts` (including the invented figures at `:64-103`); and from `Groups.tsx` `DEMO_CARD_TO_RECORD` (`:609-614`), `entryForDemo` (`:625-650`), the pool merge (`:847-853`), the demo notice (`:1025-1029`) and `abbreviate` (`:1430-1434`). In `search/treksAndGroups.ts`, delete `demoGroupHit` (`:337`) and the demo branch (`:437-442`), which also fixes the double hits.
- **New:** `src/groups/demo/exampleSource.ts`, the only demo mechanism:
  - literals gated at definition (`!DEMO ? [] : …`, the `@/lib/demoFlag` pattern);
  - every group, member and post is labelled "Example", sits on a real mountain, and uses no mockup name or figure (redesign plan §7);
  - served through the existing `GroupFeedSource` / `readGroupFeedFrom` seam (`groupPosts.ts:262, 565`) and a matching source seam added to the `groupSpace.ts` reads;
  - every write answers one sentence, "Examples can't be changed.", and changes nothing;
  - never written to `icefall.state.v1`.
- The comment at `groupPosts.ts:34-38` ("no fixture… for exactly that reason") is rewritten in the same slice: that file still holds no fixture, and the demo shows labelled examples, never a plausible invented feed.

### 3.4 Honest empty discovery

- In a non-demo build with no real group, Discover shows one sentence: "No groups yet."
- When a list cannot be read, it uses the existing absence sentences (`Groups.tsx:1149-1184`), shortened as in redesign plan §5.
- No placeholder card is ever shown.

### 3.5 Knock-on fixes

| Place | Change |
|---|---|
| `ExploreHub.tsx:623-646` ("N groups you created, held on this device") | Counts server groups I organise, from the overview RPC. When that cannot be read, the door shows no number. |
| `passport/usePassport.ts:21,45,64`, `passport/model.ts:890-896`, `PassportPages.tsx:196-201` | "Groups started" = groups I organise plus phone groups not yet moved. Demo ids are never counted. |
| `search/treksAndGroups.ts:411-420` (`mine`) | Server groups I am in, plus phone groups not yet moved |
| `People.tsx:1157-1162` | Link kept, out-of-date text replaced |
| Comments that no longer match the code: `Groups.tsx:1-180, 595-607, 792-794, 1194-1196`; `treksAndGroups.ts:249-257`; `network/types.ts:9`; `groupSpace.ts:67-70, 414-415`; `groupPosts.ts:16-18, 34-38`; `MIG/20260912090000:63-67` | Fixed in whichever slice touches the file. A comment that describes a state is checked against the code before it is kept. |

---

## 4. Access gates (brief 1.3) — questions only

**Nothing is built here (D10).** No gate registry, no gate table, no gate call in files 1–8, and every Groups feature stays open, as today. This section is the list to put to the owner with Q1.

### 4.1 Questions for the owner

| Where a gate could apply | Question |
|---|---|
| Join an open group or community | "Can a Base member join an open group or community?" |
| Ask to join a private group | "Can a Base member ask to join a private team?" |
| Start a team | "Can a Base member start a team?" |
| Start a community | "Can a Base member start a community?" |
| Number of teams at once | "Should Base members have a limit on how many teams they are in at once? If so, how many?" |
| Team size | "Should Base organisers have a cap on team size? If so, how many spots?" |
| Chat | "Can a Base member send messages in group chat, or only read them?" |
| Chat photos | "Can a Base member send photos in group chat?" |
| Group posts | "Can a Base member post in a group feed?" |
| Post types | "Are any post types (conditions, trip report, training, question, poll, partner, gear) Full Access only? Which?" |
| Shared kit | "Is the shared kit checklist with claims free or Full Access?" |
| Bookings and deadlines | "Are shared bookings and deadlines free or Full Access?" |
| Sharing readiness | "Can a Base member share their readiness band with their team?" |
| Seeing readiness | "Can a Base member see teammates' bands that were shared with them?" |
| Invite links | "Can a Base organiser create invite links?" |
| Invite by email | "Is inviting by email Full Access?" |
| Discover filters | "Are Discover filters (dates, type, experience, language) free?" |
| Recorded training posts | "Can a Base member post a recorded activity to a group?" |

### 4.2 Proposed never gated (D11, asked with Q1)

Leaving a group; reporting and blocking; deleting your own posts, messages, claims and invites; revoking readiness consent; reading the safety reminder and house rules; seeing the answer to your own join request; Download my data; moving a phone group; and anything already in use when a gate switches on (memberships, posts and chat history stay readable).

### 4.3 After Q1

A separate gates plan is written then, client and server together ("a hidden button is not a permission"). It must hold three conditions:
- an unknown gate id can never block inserts on live tables;
- no gate switches on before billing writes a real tier the server can read;
- a gate id enters `FEATURES` only with the owner's tiers, so Pricing (`screens/growth/Pricing.tsx:80`) shows the owner's split.

---

## 5. File split (brief 1.4)

### 5.1 Pattern

The brief says "the same way the mountain page was split", but `MountainPage.tsx` is still one 3,353-line file in this checkout. So the pattern is set here:

- **Where things go:** `src/groups/*.ts` for pure logic (no React, testable under esbuild); `src/components/groups/*` for pieces reused across group screens; `src/screens/groups/*` for screens, one section per file under `sections/`.
- **Each section** calls its own data hook and either renders or shows an honest state.
- **Stagger:** each section owns its own `<Stagger>` with direct `<Rise>` children. The page shell never wraps sections in a parent `Stagger`, because a component element or wrapper between `Stagger` and `Rise` leaves content at opacity 0 (`Groups.tsx:20-27`). This is checked by reading computed opacity in JS after the animation settles, not by screenshots.
- **File size:** aim for 600 lines or fewer, none over 900.

### 5.2 Target tree

**Pure modules: `src/groups/`**

| File | Content | Source |
|---|---|---|
| `entries.ts` | `Entry`, `peakRecord`, `aboutPeak`, `entryForGroup`, `memberLine`, `doorWord`, `matchesQuery`, `Chip`, `chipsFor`, `sortByMembers`, `discoverAbsence`, `serverListAbsence` | `Groups.tsx:514-593, 653-763, 1149-1184` |
| `privacy.ts` | `Ask`, `GroupPrivacy`, `readPrivacy`, `useGroupPrivacy` | `Groups.tsx:330-492` |
| `mountains.ts` | Server mountain list (`destinations`, `kind='mountain'`) and the app-peak lookup for link and photo (§1.2) | new (S5) |
| `readiness.ts` | Band words (from the private `preparationWord`, `ShareReadiness.tsx:73-80`), `provenanceFor` (`:94-101`), `useMemberReadiness`, share payload builder | moved (S7) + new |
| `copy.ts` | One-sentence forms and info-sheet text (redesign plan §5) | new |
| `demo/exampleSource.ts` | §3.3 | new (S2) |
| `local/stateCleanup.ts` | §3.2 | new (S1) |
| `local/deviceMove.ts` | `planDeviceMove(expedition)` returns the move input or a reason, and makes the server call (§2.2) | new (S6) |
| `local/useGroupPeak.ts` | `useGroupPeak`, if `DeviceGroupSummary` needs the photo | `GroupWorkspace.tsx:186-236` |

**Shared components: `src/components/groups/`**

| File | Content | Source |
|---|---|---|
| `chrome.tsx` | All of `groupChrome.tsx`: `Absence`, `SpaceAbsence`, `GroupCover`, `GroupAction(Row)`, `MetaRow`, `AvatarStack` | `screens/explore/groupChrome.tsx:1-466` |
| `DiscoverCard.tsx` | `DiscoverCard`, `EntryCover`, `PeakCover` | `Groups.tsx:1198-1337` |
| `GroupRow.tsx` | `MyGroupRow` | `Groups.tsx:1349-1386` |
| `FilterChip.tsx` | `FilterChip` | `Groups.tsx:1125-1141` |
| `MountainPicker.tsx` | `MountainPicker`, reading `groups/mountains.ts` instead of `MOUNTAINS` | `Groups.tsx:2338-2493` |
| `SharedUnavailable.tsx` | `SharedUnavailable` | `Groups.tsx:2503-2557` |
| `people.tsx` | `displayName`, `PersonAvatar` | `GroupWorkspace.tsx:2002-2027` |
| `GroupTabs.tsx` | `FeedChatToggle`, grown to Feed / Chat / Plan / Members | `GroupWorkspace.tsx:2046-2077` |
| `Conversation.tsx` | `Conversation`, `MessageRow`, `MessageComposer` | `GroupWorkspace.tsx:3145-3419` |
| `GroupFeed.tsx` | `GroupFeedSection`, `GroupPostComposer` | `screens/explore/GroupFeedSection.tsx:65-302` |
| `Operators.tsx` | `Operators` | `GroupWorkspace.tsx:1633-1728` (moved in S7) |
| `InfoSheet.tsx` | One sentence and a chevron, with the full text in a `Sheet` | new |

**Screens: `src/screens/groups/`**

| File | Content | Source |
|---|---|---|
| `GroupsTab.tsx` | Live tab shell: search, sections | `Groups.tsx:805-1122` |
| `sections/tab/MyGroupsSection.tsx` | My groups rows and states | `Groups.tsx:1062-1091` |
| `sections/tab/DiscoverSection.tsx` | Search, facets, rail | `Groups.tsx:933-1059` |
| `sections/tab/DeviceGroupsSection.tsx` | Saved on this phone, with Move (§2.2) | new (S6) |
| `create/CreateGroupFlow.tsx` | Server create, its own route since S7 | `Groups.tsx:1495-1822` |
| `create/copy.ts` | `NOTHING_TAKEN`, `CREATE_*` | `Groups.tsx:1441-1467` |
| `GroupPage.tsx` | Dispatcher: local lookup first (moved → redirect, not moved → `DeviceGroupSummary`), then uuid → `GroupSpacePage`, else `NoGroupUnderThatLink` | `GroupWorkspace.tsx:327-339, 680-704` |
| `GroupSpacePage.tsx` | Page shell, loading/absence, cover, tabs, sheets | `GroupWorkspace.tsx:2079-2370` |
| `sections/page/WhoIsComing.tsx` | `MemberStack`, `StrangerPeople`, `Roster`, `MemberRow`, `Requests` | `GroupWorkspace.tsx:2384-2470, 2914-3127` |
| `sections/page/Standing.tsx` | `StandingNote`, `MemberStanding` | `GroupWorkspace.tsx:2721-2892` |
| `sections/page/TheTrip.tsx` | `GroupDetails` | `GroupWorkspace.tsx:2580-2682` |
| `sections/page/ShareGroupLink.tsx` | `ShareGroupLink` | `GroupWorkspace.tsx:2488-2558` |
| `local/DeviceGroupSummary.tsx` | Read-only phone group (§2.3) | new (S6); reads `AppState` |
| `parked/PeopleAndGroupsMerged.tsx` etc. | Parked code, moved verbatim with its "do not delete" header | `Groups.tsx:305-308, 1841-2322, 2560-2575, 2595-2914` |

Line numbers are today's. S1–S7 edit these files first, so each split slice re-reads them. The redesign plan (§2) adds the Plan, Are we ready, kit, composer and post-kind files.

### 5.3 Split rules

1. **Start from the working tree, not from git.** In S0, copy the group files into the scratchpad (`cp -Rc`) so the uncommitted changes (1,381 and 1,580 lines) have a restore point.
2. **Moves are mechanical:** the same code in a new file, with imports fixed. Any behaviour change gets its own slice.
3. **Old paths stay as re-exports** (`screens/explore/Groups.tsx`, `GroupWorkspace.tsx`, `GroupFeedSection.tsx`, `groupChrome.tsx`) until every importer is updated. Then they are deleted.
4. **Parked code moves verbatim,** including its Stagger-trap wrappers at `Groups.tsx:2004-2014, 2087-2097`. It is not rendered, so it is not fixed here.
5. **After each split slice,** compare screenshots with the post-S2 baseline, and read computed opacity for every `Rise` on the Groups tab and one group page.

---

## 6. Supabase migrations

**All files are written, not applied.** They sit in `icefall-supabase/migrations-staged/groups/` without timestamps (D12), and the agent pushes nothing. No file contains a gate (D10).

### 6.1 Before any of these

- `20260915120000_comment_replies.sql` is pending (handbook `:26394-26395`) and must be applied first.
- The same note lists `summit_logs` as pending, although the 12 Sep check should already cover it. Confirm with `npx supabase migration list --linked`.

### 6.2 Files, in apply order

| # | Staged file | Tables / columns | RLS / policies | RPCs / triggers |
|---|---|---|---|---|
| 1 | `groups_hardening.sql` | — | Force RLS on `group_join_requests` and `group_messages`. A requester may delete a request only while it is undecided, which fixes "declined can ask again" (`MIG/20260902220000:250-253`). Restore the staff arm on `group_members` delete. | Trigger that freezes `group_id`, `profile_id` and `requested_at` on request update. Fixes the redirected request (`:240-247`). |
| 2 | `group_roles.sql` | `group_members.role text not null default 'member' check in ('organiser','member')`. **Backfill:** `created_by` if that profile is still a member; otherwise (NULL, `MIG/20260902100000:146`, or a founder who left) the earliest-joined member. | Founder-based policies (requests select/update, members delete, messages delete) are rewritten to use `is_group_organiser`. Posts delete also allows the organiser of `group_id` (D14). | `is_group_organiser(uuid)`. `is_group_founder` kept as a wrapper. `group_transfer_organiser(p_group, p_profile)`. A trigger promotes the earliest member when the last organiser leaves or is deleted (D3). |
| 3 | `group_type_and_trip.sql` | `groups.kind` (default `'team'`, backfilled), `official boolean default false`, `ends_on date`, `capacity smallint check 2..50`, `experience`, `route_label` (≤120), `language check in ('en','fr','de','es','it','other')`, `description` (≤1000), `cover_path`, `cover_credit` (≤200), `origin_ref text`. Unique `(created_by, origin_ref)` where not null; unique `(destination_id)` where `official`. | Guard extended: `kind`, `official` and `origin_ref` are immutable, and only staff can set `official`. Only the organiser can update. `ends_on >= intended_on`. | Capacity trigger on `group_members` insert: locks the group row (`select … for update`) before counting, then raises `group_full`, so two joins at once cannot overfill. `group_import_device(...)`: invoker, idempotent. `group_discover(p_query, p_kind, p_from, p_to, p_experience, p_language, p_visibility, p_limit, p_before)`: invoker, paged, counts with the definer `member_count(g)` and hides zero-member groups (D16). `member_count` keeps owner rights (Q4). |
| 4 | `group_invites.sql` | `group_invites(id, group_id, token_hash, created_by, expires_at, max_uses, used_count, revoked_at, created_at)` | Organisers can read their group's invites, but never the token. No direct insert or update. | `group_invite_create(p_group, p_expires_in, p_max_uses)`: organiser only, returns the token once and stores a hash. `group_invite_redeem(p_token)` (definer): checks expiry, uses, revocation, capacity and blocks, then adds the caller's own membership. `group_invite_revoke(p_id)`. |
| 5 | `group_post_kinds.sql` | See the table below. Also `groups.pinned_post_id → posts on delete set null`. | Detail and state selects follow the post read rule. Details can only be inserted by the post's author, and only when `posts.group_id` is set. `group_poll_votes`: each member reads only their own vote. State changes only through the RPCs. | `group_post_set_state(p_post, p_state)`: the author; "answered" also the organiser. `group_poll_vote(p_post, p_option)`: members, changeable until close. `group_poll_results(p_post)` (definer): option counts only, and only after the caller has voted or the poll has closed (redesign E13, enforced here). A trigger checks that a pinned post belongs to the same group. |
| 6 | `group_plan.sql` | `group_kit_items(id, group_id, label ≤120, category, source check in ('generated','added'), created_by, created_at, claimed_by, claimed_at, status check in ('needed','claimed','packed'))`. `group_plan_items(id, group_id, kind check in ('booking','deadline','task'), title ≤120, due_on, done_at, done_by, created_by, created_at)`. | Members read and insert; a trigger limits this to teams. The creator or the organiser can delete. | `group_kit_claim(p_item)` and `group_kit_release(p_item)` (self only). `group_plan_item_done(p_item, p_done)`. |
| 7 | `group_readiness_consent.sql` | Purpose `readiness-to-group` in `health_consent_purposes`, worded as "a band derived from ICEFALL's objective readiness score, never the score, as a snapshot taken when I share, with one team", following `MIG/20260911200000:180-186`. `health_consent_events.scope_group_id uuid null`, required for this purpose (no FK, so the evidence outlives the group), because today's events and `health_record_consent` carry no scope (`MIG/20260903060000:226-250`, `MIG/20260911200000:114-118`). `group_readiness_shares(group_id, profile_id, band check in ('beginning','early','building','progressing','advanced','not_assessed'), provenance check in ('recorded','mixed','self-reported'), objective_label, assessed_on, consent_event_seq, granted_at, revoked_at, updated_at, pk(group_id, profile_id))`. **No score column and no health column, by design.** | Select: yourself, or members of the group where `revoked_at is null`. No direct writes. Teams only. | `health_record_group_consent(p_group, p_decision, p_route)`. `group_readiness_share(...)` stores a snapshot and requires a granted event scoped to that group under the wording in force. `group_readiness_revoke(p_group)` sets `revoked_at` and clears band and provenance. Withdrawing the purpose as a whole revokes every team share. A trigger on `group_members` delete revokes automatically. |
| 8 | `group_overview_and_read_marks.sql` | `group_read_marks(group_id, profile_id, read_upto, pk)` | Self only | `mark_group_read_upto(p_group, p_at)`. `my_groups_overview()` (invoker) returns `id, name, kind, cover_path, destination_id, last_activity_at, last_activity_kind, last_activity_preview (≤80 chars), unread`, built only from rows the caller can already read. |

**File 5 tables:**

| Table | Columns |
|---|---|
| `group_post_details` | `post_id` (pk, → posts, on delete cascade), `kind` (check in conditions, trip_report, training, question, poll, partner, gear), `title` (≤120), `destination_id`, `place_label`, `elevation_m`, `observed_on`, `starts_on`, `ends_on`, `outcome` (check in summit, turned_back, not_stated), `level`, `month_on`, `route_label`, `gear_mode` (check in sale, borrow), `item_condition` |
| `group_post_state` | `post_id` (pk), `answered_at`, `answered_by`, `closed_at`, `sold_at`, `found_at` |
| `group_poll_options` | `id`, `post_id`, `position`, `label` (≤80) |
| `group_poll_votes` | `post_id`, `option_id`, `profile_id`, `voted_at`; pk `(post_id, profile_id)` |
| `group_training_snapshots` | `post_id` (pk), `distance_m`, `gain_m`, `duration_s`, `profile_points` (jsonb, ≤200 points), `source` (check in 'recorded', 'entered') |

**Not written until the owner answers:** any gate (Q1); gear prices (redesign P7); region or identity communities (Q2); reporting a group (Q13); the account-deletion change (Q8); realtime `group_messages` (Q14).

**No new file needed:** group-media storage for post photos. The path `<group_id>/<uid>/…` already covers it (`MIG/20260902220000:279-340`). The client signs group post media from `group-media` (`groupPosts.ts:683`) and re-encodes every upload first (S3).

### 6.3 Applying one at a time (commands for the owner)

Run once per file, in the order above, only after the previous file shows as applied:

```sh
cd ~/Downloads/creator-hub-dashboard-main/icefall-supabase
mv migrations-staged/groups/groups_hardening.sql "migrations/$(date -u +%Y%m%d%H%M%S)_groups_hardening.sql"
npx supabase db push --linked --dry-run
#   Read the file NAMES it lists: exactly this one file.
#   If you see anything about chatters, creators or payouts, stop: the CLI found the wrong project.
#   If it says a local migration is older than the last remote one, stop and report.
npx supabase db push --linked
npx supabase migration list --linked
#   The version must show on both the local and remote side.
```

Repeat with each following file's name. **Never use `--include-all`.** If a push fails, move nothing further, report the error, and do not rearrange folders to get round it.

### 6.4 Database tests

Standalone PGlite files, following `icefall-supabase/tests/coach-limits.test.mjs`. Each sets up a minimal `auth` and `profiles` stub, then finds each group migration by its slug in **either** `migrations/` (`*_groups_hardening.sql`) or `migrations-staged/groups/`. They are **not** in the `npm test` chain, because its first link (`rls.test.mjs`) is broken (`coach-limits.test.mjs:4-9`), so every DB slice re-runs all earlier `tests/groups-*.test.mjs`.

| Test file | Proves |
|---|---|
| `tests/groups-hardening.test.mjs` | A declined requester cannot delete the request and ask again; an organiser cannot rewrite `profile_id`; RLS is forced on both tables |
| `tests/groups-roles.test.mjs` | Backfill picks `created_by` when still a member, and the earliest member when `created_by` is NULL or has left; organiser powers follow the role; handover works; the last organiser leaving, or their profile being deleted, promotes the earliest member |
| `tests/groups-type-trip.test.mjs` | Users cannot change `kind` or `official`; one official community per destination; capacity refuses the next join, and the trigger source takes the row lock; `group_import_device` returns the same id twice; `group_discover` lists a group the caller is not in and never one the caller cannot read |
| `tests/groups-invites.test.mjs` | Expired, revoked, used-up and full invites all refuse; a blocked user cannot redeem; the token is never readable |
| `tests/groups-post-kinds.test.mjs` | One vote per person; a member cannot read another member's vote; results only after voting or closing; only the author changes state; a pinned post must belong to the same group; no price column; a non-member reads nothing |
| `tests/groups-plan.test.mjs` | Claims are self-only; a community refuses plan items |
| `tests/groups-readiness.test.mjs` | No share without a consent event scoped to that group; purpose withdrawal revokes every share; revoking hides the band at once; leaving revokes; a non-member reads nothing; no numeric score column |
| `tests/groups-overview.test.mjs` | The preview never includes text from a group the caller has left; unread follows the read marks |

---

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The group files carry about 3,000 uncommitted changed lines, so a split taken from git history would lose them. | Split from the working tree, with a scratchpad copy in S0 (§5.3). |
| R2 | The app deploys before the owner applies a file, so new columns are missing. | D13: base select plus optional select. Tests cover a base-only server and a full one. |
| R3 | The CLI pushes the OnlyFans schema into ICEFALL (the known trap), or an old-dated file forces `--include-all`. | Dry run first and read the file names; fresh timestamp on each move; never `--include-all` (§6.3). |
| R4 | On a shared phone, account B is offered account A's phone groups that have not been moved. | Moving needs a tap, the confirm row names the account it publishes under, and `movedBy` is recorded. Phone groups were already visible to anyone using that phone. |
| R5 | The owner's reference app (`icefall-demo-5210`) and the shared Vercel Preview are demo builds with no Supabase client (`backend/client.ts:148-149`). After S1–S2 their Groups tab loses its four openable groups, and redesigned screens show the no-server sentence. | The owner is told in S0, before S1. The example source (§3.3) lands in S2. |
| R6 | The demo clean-up removes text someone typed onto a demo group. | Only dev and `VITE_SHOW_DEMO` builds are affected; production never seeded. |
| R7 | The Stagger trap hides a section. | Section-owned `Stagger` (§5.1); computed opacity read in JS after every split and redesign slice. |
| R8 | `groupPosts.test.ts` compares messages by identity, and `:411` bans "no posts yet" wording in four constants. | Data-layer constants keep their exact values. The one-sentence forms live in `groups/copy.ts` (redesign plan §5). |
| R9 | A later policy rewrite silently drops the block rule. | DB tests check the `pg_policies` text after every file. |
| R10 | `interest.ts` "join the oldest group for this mountain" (`:292-360`) would now join a team, not a community. | Only parked code calls it. Revisit once official communities exist (Q3). |
| R11 | The client falls behind the organiser role (`isFounder` in `useGroupRoster`). | S4 renames it to `isOrganiser`, with a `created_by` fallback, and tests it. |
| R12 | `whoCanAddToGroups` (`settings/store.ts:117-127`) is not enforced on the server. | Invites never add anyone; the person redeems the invite themselves. The setting's help text is corrected when invites ship. |
| R13 | Chat photos upload the raw file today (`groupSpace.ts:1799-1801`), so EXIF GPS reaches `group-media`. | S3 re-encodes every group-media upload through `prepareImage` (`lib/image.ts:382`) and refuses the upload if metadata survives. |
| R14 | Group code keeps reading `MOUNTAINS`, so create, filter and the move refuse or misname peaks. | `groups/mountains.ts` (§1.2) and `test:groups-mountain-lists`. |
| R15 | Mountain mode's offline allowlist breaks (`trip/offline.test.ts:278-290, 590-601`). | No server call in `AppState`, no new imports into `services/checklist`, and `test:trip-offline` in S1, S6 and redesign R11. |

**Where this plan departs from the 16 Sep review:**
- Handbook entry: this revision was limited to the two plan files, so the entry is added in S0 rather than now.
- Order S1 → S2 → move → retire → split: files 1–3 are written before the move, because the move calls `group_import_device` (file 3) and reads back the organiser role.
- Capacity race: PGlite has one connection, so the DB test checks the row lock in the trigger source; a true two-session race needs a second connection.

---

## 8. Build order

**Order:** one model first (S1–S7), then the split (S8–S10), then files 4–8 alongside the redesign (S11). Renumbered after review: the gates slice and gates file are dropped.

**Standing checks for every slice:**
- `npm run typecheck` is clean (`tsc --noEmit`, `package.json:10`).
- `npm test` passes, including `test:group-posts`, with new tests added to `package.json` and chained into `npm test`.
- Real states are screenshotted from the `icefall` launch config (port 5190) at 375×812, dark, once Q15 is answered; example states from 5210. **Never run `npm run build` while dev is running.** For a prod build, copy the app into the scratchpad and build there.
- `grep -rnE "#[0-9a-fA-F]{3,8}\b"` finds no hex in `src/groups`, `src/components/groups` or `src/screens/groups`.
- Every DB slice re-runs all earlier `tests/groups-*.test.mjs`.
- The handbook is updated (§17.9 handover list).

| Slice | What | Extra acceptance checks |
|---|---|---|
| **S0** | Preconditions: brief step 0 (Home) is closed, with a clean typecheck, a passing suite and a note. Tell the owner, before S1, that 5210 and the Vercel Preview lose the four demo groups until S2 (R5), and put Q12 and Q15. Record baseline typecheck and tests, copy the group files into the scratchpad, and add the handbook entry for both plan docs. | If Home is not closed, stop and report. |
| **S1** | Seeding out of `load()`. Add `state/normalisePersisted.ts` and `groups/local/stateCleanup.ts`, wired into `load()`. | New `test:groups-demo-cleanup`: drops exactly the four ids and their keyed entries; leaves `expedition-*` alone; idempotent; tolerates missing fields; the normaliser seeds nothing. New `test:groups-demo-cleanup-demo`: the same bundle with `DEV:true, VITE_SHOW_DEMO:"1"` still seeds nothing. `test:trip-offline` passes. |
| **S2** | Demo discovery path and cards out, `demoGroupRecords.ts` deleted, example source in (§3.3), knock-on fixes (§3.5). | `grep -rn "demo-group-" src` finds only `stateCleanup.ts` and its test. New `test:groups-demo-source`: empty when `DEMO` is false; every record labelled "Example"; no redesign §7 name or figure; every write refused with its sentence. On 5210, `icefall.state.v1` is identical before and after browsing groups. A non-demo build in a scratchpad copy has no example literal in `dist/assets`. Screenshots: Discover empty (5190), an example group (5210). **Take the new baseline screenshots here.** |
| **S3** | File 1 (hardening) and its DB test. Client: every group-media upload is re-encoded through `prepareImage` first (R13). | DB test passes; file not applied; apply commands in the slice note. New `test:groups-media-location`: a pure `jpegHasExif(bytes)` finds the GPS tag in a tagged fixture and nothing in a clean one, and the upload refuses if it finds any (canvas re-encoding cannot run under node). In the browser, a GPS-tagged photo sent in chat comes back with no EXIF. |
| **S4** | File 2 (roles) and its DB test. Client: `isFounder` becomes `isOrganiser` with a `created_by` fallback; "Started it" becomes "Organiser". | DB test passes. New `test:groups-roster-client`: role read when present, fallback when the column is missing. Screenshot of the roster. |
| **S5** | **(Amended by OWNER RULINGS 2 and 3: destination optional, `groups/destinations.ts`, `topic`/`about` columns, AND write staged file 3b + its DB test.)** File 3 (type and trip) and its DB test. Client: `GroupSpace` gains the new nullable fields through the optional select (D13); `groups/mountains.ts`; the create picker reads it. | DB test passes. `test:groups-roster-client` extended: a base-only server renders the group with trip fields `null`; a full server reads them. New `test:groups-mountain-lists`: compares app `MOUNTAINS` ids with the mountain ids in `seed/catalogue.sql` (read through `node:fs`; no existing test reads SQL this way, `test:group-posts` only bundles with `--external:node:fs`, `package.json:68`) and fails on any difference beyond the known ones; the picker never offers an app-only id. |
| **S6** | **(Amended by OWNER RULING 2: a phone group without a server destination moves with `destination_id` null and its peak as `topic` — never refused for that.)** Device move: `groups/local/deviceMove.ts`, `DeviceGroupsSection`, `DeviceGroupSummary`, and the `expedition-*` redirect when `movedTo` is set. | New `test:groups-device-move`: field mapping; a peak absent from server mountains refuses (Ama Dablam matches); an unreadable list gives its own reason; privacy mapping; end before start refuses; `memberIds`, notes, sessions and messages never in the payload; `movedTo` written only after the read-back; demo ids never offered. `test:trip-offline` passes and `state/AppState.tsx` gains no server import. Screenshots: the row, the expanded confirm naming the account, the read-only summary in a demo build. Once the owner has applied file 3, verify one real move. |
| **S7** | **(Amended by OWNER RULING 3: `groups.create` paid-only in `tiers.ts`; every create door checks `can("groups.create")` and shows the inline upgrade when false; `test:groups-create-gate`.)** Retire the local create screen and workspace (§2.5), moving `useMemberReadiness` and `Operators` first. `/social/groups/new` renders the existing server form as a full-screen page, and `?tab=groups&create=1` redirects there. | `grep` finds no import of `CreateExpedition`, `GroupCard`, `meanReadiness` or `groupSummary`. `test:groups-roster-assumptions` passes. In the browser: the five legacy routes open the right screens, and the Social "+" and the ExploreHub Groups door both land on `/social/groups/new`. |
| **S8** | Split: pure modules into `src/groups/` (`entries.ts`, `privacy.ts`, `create/copy.ts`), behaviour unchanged. | New `test:groups-entries` covering sort, chips, matching and the absence sentences. Screenshots match the S2 baseline. |
| **S9** | Split: shared components into `src/components/groups/`, plus `GroupsTab.tsx` and its sections. Parked code moves verbatim; old paths re-export. | Screenshots match the S2 baseline. `wc -l` shows no new file over 900 lines. Computed opacity of every `Rise` on the Groups tab is 1 after settling. |
| **S10** | Split: the `GroupPage` dispatcher, `GroupSpacePage` and the page sections. | Screenshots match the S2 baseline; computed opacity checked on a group page. In the browser, `/explore/groups/<uuid>`, `/explore/crew` and `/explore/groups/new` still land correctly. `Groups.tsx` and `GroupWorkspace.tsx` are re-exports only. |
| **S11a–e** | Files 4–8 with their DB tests, one per slice: a invites, b post kinds, c plan, d readiness consent, e overview. Each is written before the redesign slice that needs it. | Each DB test passes, with all earlier group DB tests re-run. Every file stays staged, not applied. |

Redesign slices (redesign plan §8) start only after S10.
