# Welcome-message reply rate

Per-model reply rate on the welcome message, straight from the OnlyFans API.
Replaces the manual method (screen-record notifications → count "fan responded
to welcome message" → divide by new fans).

```bash
node welcome-reply-rate/report.mjs                 # last 30 days, all models
node welcome-reply-rate/report.mjs --days=7        # the weekly run
node welcome-reply-rate/report.mjs --csv=out.csv   # also write a CSV
node welcome-reply-rate/report.mjs --account=acct_xxx --days=7
node welcome-reply-rate/report.mjs --days=30 --gap=500   # pace harder if throttled
```

A 30-day backfill takes **1.5–3 hours**; a weekly run takes **20–30 minutes**.
Most of that is enumerating the roster, which has to happen in full every time
(see the sort note below). Run it in the background.

Progress is checkpointed per model to `.checkpoint.json`, so a run that dies
part-way resumes where it stopped instead of refetching completed models. The
checkpoint is keyed by window, so changing `--days` starts a fresh one.

## How it works

1. **Enumerate fans** — `/{account}/fans/active` + `/fans/expired`, keeping any
   whose `subscribedOnData.subscribeAt` is inside the window. Expired fans
   matter: someone who subscribed three weeks ago and has since churned still
   received a welcome message and still belongs in the denominator.
2. **Open the chat from the beginning** — `/{account}/chats/{fanId}/messages?order=asc`.
3. **The welcome message** is the first creator-sent message (`isSentByMe: true`).
4. **Replied** = the fan sent anything after it.

### The one thing that makes this work

`order=asc`. The default ordering returns only the last couple of messages in a
chat, so a welcome message from three weeks ago is simply not in the response —
which makes the whole metric look impossible. With `order=asc` the first page is
the *start* of the conversation; a welcome message from 50 days back comes
straight out. Verified live before any of this was written.

## API facts worth knowing (all verified against the live API)

| Fact | Consequence |
|---|---|
| `limit` is capped at **20** | everything pages 20 at a time |
| Fan lists are ordered by **fan id**, and no sort param is honoured | no early exit — the full fan list must be walked every run |
| OnlyFansAPI allows 5,000/min, but **OnlyFans-native throttling sits far lower** and is burst-sensitive — 12 concurrent requests return `ONLYFANS_COM_RATE_LIMIT_ERROR`, and even 4 draws steady 429s | request *starts* are paced behind an adaptive global gap that widens on every 429. This cut throttling from 34% of calls to ~2% |
| ~3s per request, and a full roster must be walked every run | a 30-day backfill across 8 models is a background job measured in hours, not a live query |
| `isFromQueue` is **false** on real welcome messages | can't be used to identify them — it flags mass sends |
| Chat messages carry `isSentByMe` **and** `fromUser.id` | either identifies the sender; there is no `sentBy` field |
| Fan records carry `lastReplyAt` | free "has this fan ever replied to anything" signal |

## What the numbers mean

- **New fans** — subscribed inside the window.
- **Got welcome** — the denominator. Fans who wrote first, or never got a
  welcome, are excluded so this measures the welcome message rather than chat
  volume generally.
- **Reply rate** — shown as a range (e.g. `37.8%–39.9%`) when some fans replied
  at some point but not within the first 20 messages, so the reply can't be
  attributed to the welcome with certainty. The low end is what's provable.
- **Median reply** — time from welcome message to the fan's first reply.

## Correctness note

An early version paged the fan list in parallel and used `.catch(() => null)` on
each page. A transient 429 then looked exactly like the end of the list, and the
roster silently truncated — one account reported 930 fans instead of 2,491,
which would have quietly deflated every denominator. Pagination now stops only
on genuinely empty pages, and any page that fails after retries aborts the run.
If you change that code, keep that property: a wrong reply rate that looks
plausible is worse than a run that fails.

## Known limits

- Only the first 20 messages of each chat are read. If a chat opens with 20
  straight creator messages, a later reply is reported as `uncertain` rather
  than counted — never silently scored as a non-reply.
- A fan who resubscribes appears once, under their most recent subscription.
- The welcome message is identified structurally (first creator message), not
  by matching the configured welcome text. A chatter who manually messages a new
  fan before the auto-welcome fires would be counted as the welcome.
