# UNCVRD — Salary Creator CRM

A Google Sheets CRM covering everything in Christos's August remit that is **not
chatting**. Built as an Apps Script that constructs the whole file, so it can be
rebuilt, corrected and version-controlled instead of hand-maintained.

Target file: **Salary Models - SHEET**
`1XjobA0woCfvFdCIG-5EZ14Es007WKjyKGHSOzt4t3Yc` — native Google Sheet, currently
five empty tabs. The build adopts those five (including the one that shipped
with a trailing space in its name) rather than duplicating them.

---

## Install

1. Open the sheet → **Extensions → Apps Script**.
2. Create four files and paste them in: `Config.gs`, `Seed.gs`, `Setup.gs`,
   `Code.gs`. Then **Project Settings → Show "appsscript.json"** and paste
   `appsscript.json` over the default.
3. Save. Run **`installCRM`** once and approve the permission prompt.
4. Reload the spreadsheet — a **UNCVRD CRM** menu appears.
5. Open **Weekly AD Stats** and **SFS Weekly Report**. Each shows `#REF!` with
   an **Allow access** button. Click it. Once per source file, forever.
6. **Creators** → set Status, Type and Tier.
7. **UNCVRD CRM → Install reminders.**

`installCRM` is safe to re-run. It rewrites banners, headers, number formats,
dropdowns, conditional formatting and every calculated column — and never
touches a row anyone has typed into. Seed rows are written only into a tab that
is completely empty.

---

## The tabs

| Tab | What it is | Cadence |
|---|---|---|
| **Start Here** | What each tab is for, and the two things broken upstream | — |
| **Dashboard** | 43 numbers, 9 blocks. Right-hand column goes red when it needs you | daily |
| **Creators** | The master record. Every other tab looks a name up here | — |
| **Pipeline** | Scouting → signed. 3 a month | as it happens |
| **Onboarding** | 22 boxes per salary: Drive, content, banking, account, scripts | as it happens |
| **Salary Payments** | Monday, or on content delivery. Drives the Monday email | weekly |
| **Revenue & Targets** | Per creator, per week, against all four of Luca's benchmarks | weekly |
| **Shoots** | Booking, location, on-set QC, chasing the content | as it happens |
| **Content QC** | model → you → editors → you → live | daily |
| **Scripts** | Per script, per account. `$/send` vs $25, rotation age, shared-fan collisions | weekly |
| **Caption Bank** | Rotate, never repeat. Amber = used too recently | daily |
| **Internal Promo Plan** | Next week's slots, off last week's `$/slot` | weekly |
| **FEED Promo SFS Internal** | The 2-hourly expiring feed cycle, model → SFS → model | daily |
| **SFS Weekly Report** | Live mirror of the promo report | read-only |
| **SFS Summary** | Live mirror | read-only |
| **External SFS** | Tom huzz, Dan, and the five swaps to set up | as it happens |
| **Tracking Links** | promoted × promoter, with a two-dropdown lookup | reference |
| **Weekly AD Stats** | Live mirror of the ad sheet | read-only |
| **ADs Summary** | Live mirror: time-to-profit + weekly history | read-only |
| **Whales** | Coverage SLA and transfers onto salary accounts | daily |
| **Tests** | Everything Luca listed as needing testing | weekly |
| **Improvements & Flags** | Seeded with every improvement in the August doc | weekly |
| **Market Research** | What other pages do. Good ideas become tests | as it happens |
| **Config** | Every threshold and every sheet ID. The only tab you edit for settings | — |
| `_Log` | Hidden. What ran, when, and what failed | when a number looks wrong |

---

## What runs on its own

| When | What |
|---|---|
| Monday 06:00 | Salaries due in the next 7 days, with overdue ones called out |
| Daily 07:00 | Overdue payments · onboarding past SLA · content stuck with editors · shoots filmed but no content · whales outside the touch SLA · prospects going cold · open blockers |

Both go to `REMINDER_EMAIL` on **Config**. Clear that cell to switch them off.

---

## Menu

| Item | What it does |
|---|---|
| Generate feed cycle for a week… | 12 slots × 7 days × every Live account, alternating Model / SFS. Skips account-days already laid out |
| Roll promo plan forward a week | One Internal Promo Plan row per Live creator for next Monday, pulling last week's slots and `$/slot` |
| Add this week's salary payments | A Due row for every Live salary creator with a weekly rate |
| Send the payment reminder now | The Monday email, on demand |
| Send the daily digest now | The 07:00 email, on demand |
| Health check | What is *wired* wrong, as opposed to what is behind |
| Rebuild / repair tabs | `installCRM` |

---

## Where every number comes from

Nothing is invented. `Config` carries the source next to each value.

| Setting | Value | Source |
|---|---|---|
| EOM revenue from salaries | $50,000 | p.2 |
| New salaries signed / month | 3 | p.2 |
| Pending per salary, minimum | $5,000 | p.18 |
| Subs/day for that pending, at $5 LTV | 153 | p.18 |
| Any managed account clears | $10,000/mo | p.12 |
| Target average per script send | $25 | p.18 |
| Swapped fans per account per day | 30 | p.12 |
| Stories per account per day | 5 | p.21 #1, p.23 #3 |
| New expiring feed post every | 2 hours | p.25 |
| Major whale at | $3,000/mo | p.8 #17 |
| Whale touchpoint SLA | 1 day | p.8 #15 |
| Onboarding SLA · QC SLA · pipeline touch SLA | 14 / 3 / 4 days | **ours, not Luca's** — change them |

---

## Deliberately out of scope

Chat QA, the 20 chatting rules, chatter hiring / training / trial pipeline, and
response-time monitoring. That is the chatting side, and the Shift Downtime
Monitor already covers the measurable part of it.

`Whales` sits on the line: it tracks coverage and transfer state because both
are Christos's (p.2 #6 and #7), not message quality.

---

## Two things that are broken upstream

**1. The promo schedule file is an uploaded `.xlsx`.**
`1iPE-QedoShLWuFkdiOOyFwHC54IeO7qc` is 33 characters; native Google Sheets are
44. Neither `IMPORTRANGE` nor Apps Script can read one, so the feed / story / MM
schedules cannot be mirrored into the CRM and nothing can ever be automated off
them. Fix: open it → **File → Save as Google Sheets** → put the new ID in
`PROMO_SCHEDULE_URL` on **Config** → tell whoever edits the schedules that the
old file is dead. This is the same blocker the internal promo report already
hit; it has not been fixed since.

**2. Only 8 OF pages are connected to the API.**
Antonella, June, Ella, Nicole, Julie, Emma, Blue Bear and Marissa. Every other
page reports $0 promo revenue no matter how it actually performed — Macy took 15
slots last week and reports zero. That is a wiring gap being read as a
performance result. The `API tracked` column on **Creators** and the "pages
promoted but not connected" metric on the **Dashboard** keep it visible.

---

## One correction baked into the build

The source **Tracking Link** tab labels its first column *Promoting Creator*.
It is not. The link sits on the **promoted** creator's own page, and the code
identifies the promoter who sent the traffic. Verified two ways against
`Raw Slots`:

```
Raw Slots      Blue Bear | Feed | June  | https://onlyfans.com/bluebeari3vip/c19
Tracking Link  BLUEBEAR  | JUNE         | https://onlyfans.com/bluebeari3vip/c19

Raw Slots      Antonella | Feed | Julie | https://onlyfans.com/lillyylou/c27
Tracking Link  JULIE     |              | https://onlyfans.com/lillyylou/c27
```

Both match "column A is the promoted creator", not the printed label. The CRM's
**Tracking Links** tab is headed correctly, seeded with all 94 rows — 74 real
links and 20 marked `n/a`. The `n/a` rows are carried over on purpose: they are
the links that still need creating, and the Dashboard counts them.

---

## What gets seeded on a first run

| Tab | Rows | From |
|---|---|---|
| Creators | 21 | the roster across all four files, with OF handles and the 8 API-connected pages marked |
| Tracking Links | 94 | the promo tracking sheet, headers corrected |
| Improvements & Flags | 27 | every improvement named in the August doc, with its page number |
| Tests | 9 | p.18's test list, plus the promo-cadence tests from p.21/25 |
| External SFS | 7 | Tom huzz, Dan, and the 5 swaps to set up |

Status, Type and Tier on **Creators** are left blank on purpose. No source
states who is on salary versus managed, and a guess there would put a wrong
number on the dashboard on day one.
