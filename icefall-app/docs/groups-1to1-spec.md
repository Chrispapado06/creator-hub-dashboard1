# Groups — 1:1 build spec from the owner's mockups (16 Sep 2026)

The owner: *"when you create group is not 1:1 like same with pages. Zoom in and directly compare please."* This file is the element-by-element reading of the two mockup boards, taken zoomed in. **Every redesign slice is built to this and checked side by side against the mockup crop** (`scratchpad/groupsmock/exact/*.png`, `feed-post-types.png`, `composer*.png`). Any difference in layout, order, wording, control, icon or colour fails the check.

Sample *data* in the drawings (Alex, Sophie, Mont Blanc Team, 4,810 m, "© Diego Delso", "Looks good — we can go…", poll options, prices) is never shipped as data: the element sits in the same place and shape with real data, or a one-sentence honest state. Nothing is a dead control.

Units are points at 390 wide. Colours are existing tokens unless marked NEW.

## Global
- Font: Inter Tight everywhere in Groups. **No serif (`.display`) anywhere in Groups.**
- Cards: `bg-graphite`, 1px `border-hairline`, radius 14 (rows) / 16 (large cards), no shadow.
- Section titles: 17 medium `text-snow`, sentence case ("My groups", "Discover", "Official communities", "Suggested"). **Not** the tracked uppercase `.section-label`.
- Right-hand links: "See all", 13 regular `text-azure`.
- Primary buttons: `bg-azure`, white text 15 medium, radius 10, height 46.
- Outline buttons (Vote, Message): 1.5px `border-azure`, `text-azure`, radius 10, height 44, full card width.
- Inputs: height 46, radius 10, `bg-graphite` 1px hairline, leading icon `text-mist` 18, text 15, placeholder `text-mist-dim`.
- Chips: height 34, radius full, 1px hairline, 13 `text-mist`; selected = `bg-azure` white text.
- Post-kind chips (NEW tokens `--ice-kind-conditions` green, `--ice-kind-training` orange, `--ice-kind-question` violet, `--ice-kind-poll` blue, `--ice-kind-partner` red, `--ice-kind-gear` red, `--ice-kind-trip` blue): 11 semibold uppercase, 0.06em tracking, text in the kind colour on a 14% tint of it, radius 6, height 22, leading icon.
- Top bar on the Groups tab: the existing `AppTopBar` (photo, name, search, messages, bell) — unchanged, it already matches.
- **Bottom navigation in these mockups reads Home / Explore / Start / Messages / Social.** The app's bar is Home / Explore / Start / Coach / Social and the Home mockups draw a different bar again. The app-wide bar is NOT changed by the Groups build; flagged to the owner.

## 1. Groups tab (Social)

**16 Sep clarification: the app's existing tabs (Feed / People / Groups / Leaderboard) stay — only the tab strip's look is rebuilt to the mockup's segmented-pill style. Top profile navigation stays exactly as the current `AppTopBar` (unchanged).**

1. Segmented control directly under the top bar: one rounded container (`bg-graphite`, radius 12, height 44, inset 16) with FOUR equal segments **Feed · People · Groups · Leaderboard**, in that order (unchanged from today); the selected segment has `bg-slate`, `text-snow` 15 medium and a 2px `bg-azure` underline 60% of the segment width; others `text-mist`. This replaces today's plain text row with an underline at `Social.tsx:90-95` — a styling change only, done once, and it does not touch what Feed, People or Leaderboard render.
2. Row: **My groups** (left) · **See all** (right).
3. **Empty:** one card (radius 16, padding 28 vertical): three-people icon 40 `text-mist` centred; "No groups yet." 17 medium snow; "Join a community or create a team for your next objective." 14 mist centred, max 2 lines; **Create group** primary button, width 176, centred. (Paid-only: for a member without Full Access the same button opens the inline upgrade.)
4. **Populated:** up to three rows, gap 10. Row = card radius 14, height 88, no padding on the left: square cover 80×88 flush left (radius 14 on the left corners only); then padding 12: name 16 medium snow (1 line); kind **TEAM / COMMUNITY** 12 medium uppercase 0.08em `text-mist-dim`; last activity: 12 icon + 13 mist, 1 line with ellipsis; unread dot 8 `bg-azure` vertically centred 16 from the right.
5. **Discover** title; search input "Search mountains, regions, or groups".
6. Chips row: **All** (selected) · **Mountains** · **Regions** · **Identities**.
7. Row: **Official communities** · **See all**.
8. Horizontal rail, card 330×186 radius 16, next card peeking 16: photo full-bleed with bottom scrim; bottom-left: name 20 medium white; credit line 12 white/80 with ©; **COMMUNITY** badge (11 semibold uppercase `text-azure`, 1px `border-azure/40`, radius 6, height 20); bottom-right round join button 48 (`bg-obsidian/70`, 1px hairline, plus icon 24 `text-azure`).

## 2. Filter sheet
Full-height sheet, `bg-obsidian`, grabber 36×4 at top. Header: ✕ (left, 22) · **Filter groups** (17 medium, centred) · **Reset** (15 `text-azure`, right). Sections, 20 apart, each a 15 medium snow label then controls:
- **Mountain / Region** — input "Search mountains or regions".
- **Dates** — chips **Any time** · **Next 3 months** · **Next 6 months**; then a chip with calendar icon **Custom range**.
- **Type** — chips with icons **Team** (lock) · **Community** (people).
- **Experience level** — **All** · **Beginner** · **Intermediate** · **Advanced** · **Expert** (wraps).
- **Language** — **All** · **English** · **French** · **German** · **Spanish** · **Italian** · **Other** (wraps).
- **Open / Private** — **All** · **Open (anyone)** · **Private (invite only)**.
- Bottom: **Show results** primary, full width, 16 from the bottom.
Selected chips here: `bg-slate` + snow text (the drawn "All"), not azure.

## 3. Create — choose type (step 1 of 4)
Back chevron (left) and the **stepper** on one row: four dots 12 apart joined by a 2px line; dot 1 filled `bg-azure`, dots 2–4 hollow 1.5px `border-mist-dim`, line `bg-hairline`. Title **What do you want to create?** 20 medium. Two large cards (radius 16, padding 20, gap 12), each with a chevron right-centred:
- icon three-people 36 white; **Team** 22 medium; "A small, private group for one objective and date window. Plan, coordinate, and go together." 14 mist.
- icon mountain 36 white; **Community** 22 medium; "A large, open group around a mountain, region or identity. Share knowledge and find partners." 14 mist.
Then a plain card: "One official community exists per mountain and trek region. Please check if it already exists before creating a new one." 13 mist.
Bottom navigation visible. Tapping either card needs Full Access (inline upgrade otherwise).

## 4. Create — details (team; step 3 of 4 filled as drawn)
Back + stepper with dots 1–3 filled and the joining lines azure. Title **Set up your team**. Cover card 100% width × 150, radius 12, with **Change photo** pill bottom-right (image icon + 13 text, `bg-obsidian/70`); caption under it 12 mist "{Mountain} (© {credit})" when a mountain photo is used. Fields, label 14 medium snow above each, 16 apart:
- **Objective / Mountain** — search input (magnifier). Optional: search mountains, regions and treks; free text becomes the group's topic.
- **Dates** — input with calendar icon showing "16 Jun 2027 – 23 Jun 2027" style range (opens a range picker).
- **Spots** — label on the LEFT and the input on the same row (label 14 medium, input flex).
- **Experience required** — select with chevron.
- **Route (optional)** — input, placeholder "e.g. Goûter Route".
- **Language** — select with chevron.
- **Privacy** — select with leading lock icon, "Private (invite only)".
- **Next** primary full width. No name field (name = "{Mountain} Team", or the topic; editable later). No bottom navigation on this step.
Community variant: title **Set up your community**; no Dates, Spots or Route.

## 5. Create — invite (step 4 of 4)
Back + stepper all four filled. Title **Invite your team**. Search input "Search by name or add contacts". Label **Suggested**. Three rows (card radius 12, height 60, gap 10): round icon circle 40 (1px hairline) + 15 text + chevron: **Add from contacts** (person) · **Share invite link** (link) · **Invite by email** (envelope). Bottom row, 16 from the bottom: **Skip for now** (15 `text-azure`, left) and **Create team** primary (right, width ~150). No bottom navigation.

## 6. Group page — hero (team and community)
- Photo full-bleed from the very top of the screen (under the status bar), height ~330, scrim darkening the lower half. No top bar.
- Round buttons 40 (`bg-obsidian/60`, blur): back (left); team: **settings gear** and **⋮** (right); community: **⋮** only.
- Bottom-left of the hero: name 26 medium white; team meta 19 white "4,810 m • 16–23 Jun 2027"; then lock icon + "1 of 4 spots" 17 white; community meta: "4,810 m" then globe icon + "Community". Credit "© …" 12 white/70 centred at the hero's foot.
- Tabs directly under the hero: team **Feed · Chat · Plan · Members**; community **Feed · Chat · Members**. 16 regular, evenly spaced; active `text-azure` with a 3px azure underline the width of the label + 24; inactive `text-mist`; hairline under the row.
- Bottom navigation visible.

## 7. Feed tab
- **Empty:** document icon 56 `text-mist` centred; **No posts yet.** 18 medium; team: "Share route beta, training updates or ask the team a question."; community: "Share conditions, trip reports or ask a question." (15 mist centred); **Write a post** primary width 176 centred.
- **Pinned:** card radius 14: header row pin icon + **PINNED** 12 semibold uppercase (`--ice-kind-gear`-orange); inner row: 44 icon tile (radius 10, tinted), title 15 medium, subtitle 13 mist, chevron.
- **Post card** (radius 14, padding 14): avatar 36 + name 15 medium + date 13 mist + ⋮ right; kind chip on its own line; title 17 medium; body 15 mist; meta lines with 14 icons (pin: place · elevation; clock: "Seen today"; calendar: dates · outcome); photo radius 10 full width; credit 12 mist-dim when a photo owes one.

## 8. Post types (board 2)
- **Conditions** (green): title, body, pin "{place} · {elevation} m", photo, credit.
- **Trip report** (blue): title, body, calendar "{dates} · {outcome e.g. Summit}", photo, credit.
- **Training** (orange): title, stats row with icons distance · gain · time, then an elevation line chart (azure line, faint axis) with the max label at the right.
- **Question** (violet): title, body, **Answered** pill (check icon, `text-summit`, 1px summit border) when answered.
- **Poll** (blue): question as title; option rows as pills (radio circle + label), one per option; **Vote** outline button.
- **Partner wanted** (red): title, body, tag pills (level · month · route) as small outlined chips; **Message** outline button.
- **Gear** (red) chip + " · For sale" / " · To borrow": title, body, price line in orange (optional, seller-entered), photo, **Message** outline button.

## 9. Composer
Header: ✕ + **Create a post** (17 medium). Rows (card radius 14, height 64, gap 8): 40 tinted icon tile + title 15 medium + subtitle 13 mist:
**Conditions report** — Share current mountain conditions · **Trip report** — Share a completed trip · **Training update** — Log a training activity · **Question** — Ask the community · **Poll** — Get opinions · **Partner wanted** — Find a partner for a climb · **Gear to borrow / sell** — Share gear availability.

## 10. Conditions template
Back + centred title **Conditions report** 17 medium; subtitle "Share what's changed on the mountain." 13 mist centred. Fields: **Location** (search input, placeholder "e.g. Mont Blanc"); **Elevation** label left + input "m" on the same row; **Date observed** (calendar input); **What's changed?** textarea 88 tall, placeholder "e.g. Snowline higher, fresh snow, wind..."; dashed 1.5px hairline box 120 tall, image icon + **Add photos**. **Post** primary full width at the bottom.

## Known differences from the current app (zoomed comparison, 16 Sep)
- Groups tab: app has a Feed/People/Groups/Leaderboard text strip, a "+" header, "DISCOVER GROUPS" uppercase label, Newest/For-mountain chips, tall serif discovery cards, My groups at the bottom, a floating Create group pill. Mockup: segmented Friends/Groups/Events, My groups first as rows, Discover search + All/Mountains/Regions/Identities, Official communities rail.
- Create: app is "New expedition" with a long explanatory paragraph, OSM peak search, two date fields, party-size circles, experience grid, no stepper. Mockup: 4-step stepper, type choice, compact details form, invite step.
- Group page: app keeps the top bar above the hero, serif title "Example group · Mont Blanc", round Members/Share buttons, privacy/region row, avatar stack, ABOUT box, Feed/Chat only below. Mockup: hero to the top with gear/⋮, sans title, meta lines, spots, credit, Feed/Chat/Plan/Members tabs immediately under the hero, pinned post and typed post cards.
