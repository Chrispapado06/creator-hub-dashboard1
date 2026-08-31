# The control kit — dates, selects, buttons, modernised once

**Owner instruction, 2026-08-31:** *"replace old select dates or buttons and
modernising it through the entire apps we have."* Native date inputs
(dd/mm/yyyy spinners), bare `<select>` dropdowns and default-styled buttons are
retired from every user-facing surface, in all five apps.

**One kit per palette, one behaviour contract for all.** §6u applies with full
force: once these are deliberately identical, a unilateral improvement in one
tree is a regression. The behaviour below is the contract; each app implements
it in its own tokens (dark/azure for phone·guide·operator surfaces that are
dark, light/gold for the CRM per the mockups).

## Buttons
- **Primary** — gold in the CRM (mockup language), azure in the dark apps.
  One per view. Real hover/active/disabled states; disabled is visibly
  disabled AND says why nearby when the reason isn't obvious (a dead button
  with no reason is the flight-notes complaint that started everything).
- **Secondary/ghost** — hairline outline, quiet.
- **Destructive** — its own colour, never the primary style.
- Focus-visible ring on everything. No default browser styling anywhere.

## Selects
- User-facing `<select>` is retired. Replacement: a styled listbox popover —
  keyboard navigable (arrows, Enter, Esc), typeahead when the list exceeds ~8,
  ARIA roles so it is BETTER than native, not just prettier.
- Where a mockup drew tiles/pills for a choice (Promotions step 1/3, guide
  cards), tiles stay — a select is the fallback, not the ideal.

## Date pickers
- **Native `<input type="date">` is retired** from styled surfaces.
- **Single date:** button showing the chosen date ("31 Aug 2026", never
  raw dd/mm/yyyy) opening an inline calendar popover — month grid, arrow keys,
  today marked, chosen day filled.
- **Range:** one calendar with start/end selection and chips, plus preset
  pills where ranges are common (7 days · 30 days · Custom). The CRM's
  Dashboard/Commissions/Analytics range controls all adopt it.
- **The phone app's Find-a-Guide calendar (MK-03) is the reference for the
  dark apps** — always-visible month, Selected/Available/Limited legend where
  availability applies. Do not rebuild its semantics, extend its style.
- Values remain ISO underneath — §6af stands: display formats never travel
  into storage, parsing stays strict at the write path.

## Discipline
- Inventory FIRST: grep your app for `<select`, `type="date"`, and unstyled
  `<button` on user-facing surfaces; log the count in the backlog under your
  CTRL item; then replace; then re-grep to zero and tick §6z-style.
- Keyboard and screen-reader behaviour must not regress from native. A pretty
  control that traps focus is worse than an ugly one that works.
- No behaviour changes ride along — same values, same handlers, new shell.
