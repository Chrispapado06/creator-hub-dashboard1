# Session 01 — icefall-app — 13 BUILD items

Read `TASKS-shared-rules.md` first. Owner's exact words for each item are in
`BACKLOG-flight-notes.md` under the matching ID — read them, do not work from
this summary alone.

## Start here — small, certain, verifiable

- **PH-17 Profile** — a real navigation bug. Tapping the profile icon opens
  profile settings; going back lands on Settings instead of the profile you came
  from. Fix the back target to the origin.
- **PH-03 ActivitySelect** — no way to back out once you are in activity select.
  Add one.
- **PH-05 ActivityComplete** — remove points.

## Points are system-wide, not a screen

- **PH-01 / PH-05** — "Ice fall points should be removed from the system". Treat
  this as removing the concept, not hiding a badge: find every place points are
  earned, stored, displayed or referenced. Report what you found before ripping it
  out if the surface is larger than five files.

## The big removals

- **PH-01 ActivitySummary** — summary becomes the ONLY page after an activity, and
  absorbs what is worth keeping (replay, downloadable replay with distance, share).
  Remove splits, elevation profile, "what this did to your progress", "what's
  next", personal bests, milestones.
- **PH-06 Home** — months-to-target becomes DAYS. Remove kit items and training
  from that block, keep days and readiness. Weather conditions move directly under
  the current objective. Remove: recent activity, expedition checklist, upcoming,
  people near you, start an activity.
- **PH-02 ActivityHistory** — history is currently unreachable except right after a
  workout. Move it into the profile as the user's own private activity list. Remove
  the performance page and routes.
- **PH-16 CoachProgress** — cut the surplus copy and user info. The redesign half
  of this item is DESIGN and not yours.

## Features

- **PH-04 ActivityReplay** — add share, carrying distance, elevation, speed, calories.
- **PH-18 ShareActivity** — add auto-post to social, **verified users only**. Depends
  on there being a verification state to read; if there is not one yet, say so
  rather than inventing it.
- **PH-21 Search** — search must find guides, people and expedition company profiles.
- **PH-10 Treks** — the Treks page replaces the expedition "trek to mountain" page.
- **PH-14 CoachChat** — two parts. (a) an intro animation greeting the user by name,
  fading into the chat, and remove the pre-filled message that looks already sent —
  it should open like a new chat. (b) when a user asks for treks, the coach searches
  the real trek data and suggests ones near them that fit their objective. Part (b)
  must read actual data; a hardcoded suggestion list is worse than nothing here.

## PH-19 Settings — split this before starting

"All settings pages need to work" covers Account Details, Security, Privacy
(post visibility: friends / followers / public), and a Professional Center with
real application links for sherpa and company guide. **Split it into one backlog
sub-item per settings page**, then close them individually. Do not report PH-19
done until every sub-item is.

## NOT yours yet

- **PH-08 Social** — stories, reels, comments, follow feed, ads. This is a whole
  product and it also touches the operator portal and the CRM. It is being scoped
  as one cross-app piece. **Do not start it.**
