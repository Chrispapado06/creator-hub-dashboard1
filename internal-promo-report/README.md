# Internal Promo — Weekly Report

A Monday-morning allocation report built on top of the existing internal promo
schedules. It answers, per creator, per week:

- how many promo slots they received
- how much revenue those slots produced
- whether to give them more, the same, or less next week

---

## Before you install: the file has to be converted

The current file is an **uploaded `.xlsx`**, not a native Google Sheet. You can
tell from the ID in the URL — `1NfHXBDXHWix05hms4azX2uGxwTLAqo70` is 33
characters; native Sheets are 44.

Apps Script cannot bind to an `.xlsx`, so **nothing here works until it is
converted**:

> Open the file → **File → Save as Google Sheets**

That creates a new file with a new URL. From then on, the promo schedules are
maintained in the **new** file. Whoever currently edits the schedules needs to
be told, or the report will quietly describe a spreadsheet nobody is updating
any more — which is worse than having no report, because it still looks alive.

---

## Install

1. Convert the file (above).
2. **Extensions → Apps Script**.
3. Paste `Code.gs` and `Setup.gs` as two files. Save.
4. **Project Settings → Script Properties → Add**:
   `ONLYFANSAPI_KEY` = your `app.onlyfansapi.com` key.
   (Same key as `VITE_ONLYFANSAPI_KEY` in the dashboard `.env`.)
5. Run `setup` once and approve the permission prompt.
6. Back in the sheet: **Promo → Refresh now**.
7. **Promo → Install auto-refresh triggers**.

After that it is hands-off: nightly refresh at 05:00, a full refresh Monday at
06:00, and slot counts re-computed instantly whenever anyone edits a schedule.

---

## The tabs

| Tab | What it is |
|---|---|
| **Weekly Report** | The Monday page. One row per creator. All formulas. |
| **Summary** | KPIs and the six watch-lists. All formulas. |
| **Raw Slots** | One row per promo slot, flattened from the schedule tabs. Script-written. |
| **Raw Revenue** | Revenue per OF page per week, from the API. Script-written. |
| **Config** | Every threshold, weight, alias and mapping. The only tab you edit. |
| `_Log` | Hidden. Last run + anything that failed to match. **Check this if a number looks wrong.** |

The four source schedule tabs are **read only** — nothing writes to them.

---

## How the join works

Each tracking link encodes a pair:

```
https://onlyfans.com/emmasonne/c21
                     └ whose page  └ which promoter sent the traffic
```

So `emmasonne/c21` is *Emma's page, traffic from Blue Bear*. Verified against
the schedules: Feed row 5 has Blue Bear promoting Emma with exactly that link.

Revenue is attributed to the **promoted** creator — the one whose page it is,
i.e. the one who received the promo. Slots are counted the same way, so the two
halves of "revenue per slot" describe the same person.

> **The `Tracking Link` tab's own headers are backwards.** It says
> `Promoting Creator | Promoted Creator`, but column A is the page owner. The
> script ignores the headers and reads ownership from the URL handle, so this
> is harmless — but don't trust those labels if you're reading it by hand.

### Handles are mapped explicitly, on purpose

Sandra's page is **`thisisjunee`**. Any name-matching heuristic reads that as
June. That mistake is *already live in your data* — MM tab row 16 logs a promo
as "June" against a Sandra link. So `Config → OF Handle Map` is an explicit
table, not a guess.

**If a creator gets a new page, add it there or their revenue reads as zero.**
The script logs `unmapped-handle` to `_Log` and shows the creator as `⚠ handle`
in Raw Revenue rather than silently dropping the money.

### Only pages connected to the API token produce revenue

A page must be **connected and authenticated in the `app.onlyfansapi.com`
dashboard** for its revenue to come through. A page that is in the handle map
but not on the token has no data at all — it is not a $0, it is a blank.

The report is built for this: such a creator shows **`Not Tracked`** (blue) in
the Recommendation column, never `Reduce Allocation`, so a connection gap can't
be mistaken for poor performance and get their promo cut. `_Log` lists every
unconnected page as `no-account`.

> **Live check on 2026-08-03:** the token had 8 of the 14 mapped pages
> connected. Ella, Antonella, Julie, Blue Bear, Emma, Marissa, June and Nicole
> were live; **Sophie, Angelina, Maylee, Sandra, Apple and Bella Leah were not
> connected** and will read `Not Tracked` until someone connects them in the OF
> API dashboard. Maylee in particular is heavily promoted, so connecting her is
> the highest-value gap to close.

---

## Why the revenue numbers are trustworthy

The `/tracking-links` list endpoint returns **lifetime** totals, and so does the
`summary` block of the stats endpoint *even when you pass dates*. This already
bit the Telegram digest — see the comment in
`supabase/functions/telegram-webhook/index.ts`.

This script only ever sums **`daily_metrics`**, which is the one field that
respects the requested window. That is what makes true weekly figures possible,
and it is why **"Previous Week Revenue" works on the very first run** rather
than needing two weeks of history to warm up.

---

## Config

Everything is in `Config`. No formula anywhere needs editing — they all
reference these cells by name (`CFG_MinSlots`, not `Config!$C$12`).

| Setting | Default | What it does |
|---|---|---|
| `WeekStartDay` | 1 (Mon) | Defines the reporting week |
| `WeekOverride` | blank | Put a Monday date here to freeze the report on that week |
| `WeeksHistory` | 8 | How far back to pull. Higher = slower refresh |
| `IncreaseFactor` | 1.25 | "Increase" if rev/slot ≥ this × roster average |
| `ReduceFactor` | 0.6 | "Reduce" if rev/slot ≤ this × roster average |
| `MinRevIncrease` | 50 | Absolute floor — stops a one-slot fluke reading as a star |
| `LowRevenue` | 25 | Below this counts as "low" |
| `HighSlots` | 6 | At or above this counts as "many" |
| `MinSlots` / `MaxSlots` | 2 / 10 | Guard rails — never recommend past these |
| `Weight_Feed/Story/MM` | 1 / 1 / 1 | Relative worth of a slot per channel |
| `IncludeDraftTab` | false | The hidden `Promo Schedule` tab is a superseded draft |
| `ExcludedStatuses` | `Declined,Excluded` | Statuses that don't count as a delivered slot |
| `CountUntickedStories` | true | The Story ✓ is inconsistently filled in |

Plus three lookup blocks: **Creator Aliases**, **OF Handle Map**, **Full
Roster**. The roster is what makes creators receiving *nothing* still appear —
otherwise "who is getting no promo?" would be answered by an empty space.

### The recommendation logic

Deliberately **relative**, so it self-adjusts in a slow month instead of needing
re-tuning, with an absolute floor so a fluke can't trigger "Increase":

1. No slots, no revenue → **No Data**
2. Revenue but no slots → **Increase Allocation** *(earning without help)*
3. Many slots, low revenue → **Reduce Allocation** *(the "poor results" case)*
4. Beats roster average × `IncreaseFactor` **and** clears `MinRevIncrease` → **Increase Allocation**
5. Well under roster average × `ReduceFactor` → **Reduce Allocation**
6. Otherwise → **Keep Current**

---

## Known limitations — read these

**Story slots can never earn revenue.** The Story tab has no tracking link
column at all. Story slots therefore add to the slot count while contributing
nothing to revenue, which drags down revenue-per-slot for anyone who got Story
promo. Until Story gets tracking links, either set `Weight_Story` to 0 to
exclude it from the ratio, or read Story separately.

**"Earned nothing" vs "not tracked" — now separated.** A creator whose OF
account isn't connected to the API contributes no revenue rows at all. Left
unhandled that would look like genuine poor performance and could get their
promo cut for what is really a data gap. The report now tells the two apart: a
connected page gets a Raw Revenue row every week (even a $0 one), so a promoted
creator with **no** rows is flagged **`Not Tracked`** in the Recommendation
column instead of `Reduce Allocation`. `_Log` still lists every `no-account`
and `unmapped-link` — **check it before acting on a zero.**

**Slot weights all default to 1.** A mass DM and a feed post are not equally
valuable. Until someone sets real weights, "Revenue per Slot" treats them as
equal and will favour whoever happens to get the cheaper channel.

**Statuses are mostly `Expired`.** The Feed tab has 190 `Expired` against 3
`Posted`. `Expired` currently *counts* as a delivered slot, on the assumption
that it means the link expired after the post ran. If that's wrong, add
`Expired` to `ExcludedStatuses` — the slot counts will change a lot.
