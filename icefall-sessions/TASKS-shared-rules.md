# Working the flight-notes backlog — rules for every session

The owner captured 53 change requests offline. They are in
`icefall-sessions/BACKLOG-flight-notes.md`. Your app's assigned items are in
your own `TASKS-*.md` beside this file.

## Non-negotiable

1. **Tick the backlog in the same change that does the work.** Constitution §6z.
   An item closed only in a chat message is an item the next session re-does.

2. **Only work items marked `BUILD` and assigned to you.** `DESIGN` items are
   waiting on the owner's own drawings — do not invent a redesign to unblock
   yourself. `DECISION` items are waiting on the owner — do not answer for them.

3. **Do not narrow an item to make it closable.** "All settings pages need to
   work" is not closed by fixing three. If an item is bigger than it looks, split
   it into sub-items in the backlog and close them honestly.

4. **The honesty doctrine still holds.** Several notes ask to remove text. Removing
   a sentence that is currently TRUE (no vetting, enquiries do not send, sample
   data) is decision D1 and is NOT yours. Removing points, splits, milestones and
   dead tiles is ordinary work — do that freely.

5. **Stay in your own app directory.** If a change needs another app, file it in
   `icefall-sessions/requests/` rather than reaching across.

6. **Do not commit, do not push, do not deploy.** Leave the tree clean and report.

## What "done" means

- `npx tsc --noEmit` clean (NOT `tsc -b`).
- You have opened the screen and seen the change, not merely written it.
- The backlog line reads `DONE` with the file that did it.
- If you could not finish, the line reads what is left, not `DONE`.

## Reporting

Report per item ID, saying DONE / PARTIAL / BLOCKED and why. A partial reported
honestly is worth more than a done that is not.

## The `src/offline/` folder in your app is mine, and it is finished

If you find `src/offline/` in your tree (offline.ts, fixtures.ts, OfflineBanner.tsx
and similar, timestamped 30 Aug) — **I wrote it, via agents, without warning you.
That was my failure of coordination, not a stray edit.**

What it is: the owner needed all five apps runnable with no network to review them
on a flight. Everything in it is behind `VITE_ICEFALL_OFFLINE`, which is unset in
every normal build, so **production behaviour is unchanged**. The fixtures are
demo-only and must never be imported by a production path.

**It is stable. Nothing further will change it while you work.** Build around it,
do not revert it, and do not fold its branches into the normal path.
