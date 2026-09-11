# A real Sunday-evening weekly review

*What would have to exist before ICEFALL could send one. Written 11 September 2026, alongside the weekly review itself.*

---

## What ships today, and what it claims

The weekly review is built and live at `/coach/review`. It is **computed when the athlete next opens the app**, from the most recent plan week that has entirely finished, and it waits there for them. The hub shows a row while it is unread.

That is the whole of the claim. Nothing in the app says it was sent, delivered, or that anybody was notified on a Sunday — because nothing in this codebase can reach a closed web app, and copy that implied otherwise would be a straightforward breach of rule 2.

Everything below is the list of what would have to exist to change that. It is in the order it has to happen, because several items block each other.

---

## The blocker nobody expects: the server has none of the inputs

This is first because it is the one that survives every other decision, and it is easy to spend money on push infrastructure before noticing it.

A notification that says *"You've missed two long days; here's how we protect your June date"* is a **computed sentence**. To send it from a server on Sunday at 19:00, the server has to be able to compute it. Today it cannot, because every input lives on the phone:

| Input | Where it lives now |
|---|---|
| The training plan | Generated on the device by `buildPlanForGoal`, from the goal and three signup answers. Never stored. |
| Plan adjustments | `localStorage`, key `icefall.plan.adjustments.v1`. The migration that would create the table, `icefall-supabase/migrations/20260911180000_plan_adjustments.sql`, is an **unapplied draft**. |
| Check-ins | `icefall.state.v1` on the device. |
| Recorded activities | The device's activity store. |
| Whether a review has been read | `icefall.coach.weekly-review.v1`, on the device. |
| Measured vitals | Resolved on the device from the connected instrument. Latest reading only — no history of nights. |

So there are exactly **two honest shapes** for a Sunday notification, and they cost very different amounts:

### Shape A — a content-free nudge (cheap, honest, available first)

The server sends *"Your week is ready to look at"* and nothing more. No figures, because it has none. The athlete taps, the app opens, the review is computed on the device exactly as it is today, and the specifics appear.

This needs only the push plumbing below, plus one server-side fact: **which athletes have a plan and are due a review**. That is one small table — `user_id`, `time_zone`, `last_review_sent_week` — written by the app when it computes a review, not a copy of anybody's training.

The roadmap's example sentence is **not available in shape A**, and it should not be faked. "You've missed two long days" is a claim; a server that cannot count them must not make it.

### Shape B — the specific notification the roadmap describes (expensive)

For the server to write *"You've missed two long days"* it needs the plan, the adjustments, the activity feed and the ticks, server-side and current. That means:

1. **Apply the plan-adjustments migration** (`20260911180000_plan_adjustments.sql`) and write a real sync for it. The merge rules are already reasoned out in the header of `src/tracking/adjustments.ts` — union of both sides, never a deletion, `undoneAt` as the one-way stamp. Do not invent a second merge.
2. **Persist check-ins and recorded activities** to Supabase, with the same care: a fetch fills and corrects, it never empties (`settings/hydrate.ts` rule 3).
3. **Port the review engine to the server.** `src/coach/weeklyReview.ts` is pure, takes plain arguments and imports no React, precisely so this is a port rather than a rewrite — but `buildPlanForGoal` would have to run server-side too, and it is currently client-only.
4. **Decide what the notification may say about vitals: nothing.** Health data in a push payload is the GDPR special category sitting in a notification centre on a lock screen. Shape B's payload should carry training figures only.

**Recommendation:** ship shape A. It is honest, it is a tenth of the work, and the specific sentence is on the screen half a second after the tap.

---

## The push plumbing

There are two routes. They are not equivalent, and the cheaper one is genuinely viable.

### Route 1 — Web Push to an installed PWA (no App Store, no native wrapper)

Since Safari 16.4 (iOS/iPadOS 16.4, March 2023), Web Push works on iOS — **but only for a web app the user has added to the Home Screen**. A PWA opened in a Safari tab can neither ask for permission nor receive a push. Android Chrome has supported it for years with no such restriction.

What this needs:

1. **VAPID key pair.** Generated once (`web-push generate-vapid-keys`). The public key ships in the client; the private key is a Supabase secret and never enters the repo.
2. **A push handler in the service worker.** The app uses `vite-plugin-pwa` with `registerType: "autoUpdate"` and the default generated worker. A `push` and a `notificationclick` handler means moving to `injectManifest` with a custom `src/sw.ts`. Budget real time for this: it changes how the offline cache is built, and `src/offline/offline.ts` and the workbox `globPatterns` in `vite.config.ts` both have to keep working.
3. **A subscription table** in Supabase: `user_id`, endpoint, `p256dh`, `auth`, `time_zone`, `created_at`. Owner-only RLS, matching `20260911160000_coach_memory.sql`.
4. **A sender.** A Supabase edge function using the `web-push` protocol (VAPID JWT + encrypted payload). One function, called by the scheduler.
5. **An "add to Home Screen" path for iOS**, because without it the whole route is dead on iPhone. This is a real product surface: a short explainer, shown once, at a moment the athlete is already invested. It cannot be automated — iOS offers no install prompt to a web page.

**What route 1 does not get you:** Apple Health, Health Connect, HealthKit background delivery, or a lock-screen widget. Those need route 2 regardless.

### Route 2 — a native wrapper (Capacitor), which the roadmap already wants

Needed anyway for Apple Health and Health Connect, and it makes push ordinary rather than conditional.

1. **Apple Developer Program membership** — $99/year, and the enrolment itself can take days if the entity is a company rather than an individual.
2. **An App ID and bundle identifier**, with the **Push Notifications** capability enabled.
3. **An APNs authentication key** (`.p8`, team-wide, does not expire) — preferred over a per-app certificate, which does expire and will silently stop your Sunday notification a year later. Download it once; Apple will not give it again. It is a secret: Supabase secrets, never the repo.
4. **Capacitor added to the app**: `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/push-notifications`. The Vite build output becomes the web asset directory.
5. **A Mac with Xcode** to build, sign and upload. There is no way around this for iOS.
6. **TestFlight, then App Store review.** Budget one to two weeks for the first submission; a rejection over the coach's health-adjacent copy is a realistic outcome and the disclaimers already in `COACH_DISCLAIMER` are the defence.
7. **Android:** a Firebase project and an FCM server key, plus `google-services.json`. Android 13+ also requires the `POST_NOTIFICATIONS` runtime permission — it is no longer granted at install.

---

## The permission prompt

Both routes need one, and it is the part most often got wrong.

- **You get one chance on iOS.** If the athlete taps "Don't Allow", the app cannot ask again — they must go into Settings themselves. So the system prompt must never be the first thing they see.
- **Ask in context, after value.** The correct moment in this app is the first time they open a weekly review and it has something in it: a row on the review itself saying what a notification would be for, with a button that then triggers the system prompt. Never on launch, never during onboarding.
- **Say what will be sent and how often.** "One message a week, on Sunday evening, when your review is ready." A promise that specific is also a constraint on the scheduler — it must not become a marketing channel.
- **An off switch in Settings**, alongside the existing connection rows, that actually deletes the subscription row rather than just muting the send.
- **Health data is not in the payload.** Sleep, resting heart rate and check-in answers are GDPR special-category data; a lock screen is a public surface.

---

## The scheduler

1. **A Supabase cron job** (`pg_cron`, or Supabase's Scheduled Functions) running **hourly**, not weekly. It must be hourly because "Sunday evening" is a local time, and an athlete in Kathmandu and one in Chamonix are five and a quarter hours apart. Each run selects the subscriptions whose stored `time_zone` makes it Sunday 19:00 locally right now, and where a review has not already been sent for that week.
   - Note for the Hobby tier: `icefall-app/docs` aside, the applicant-screener project already hit this — Vercel Hobby cron is daily-only. Do the scheduling in Supabase, not Vercel.
2. **Idempotency.** `last_review_sent_week` on the subscription row, compared against the ISO week being announced. A cron that fires twice must not send twice; a phone that changes time zone mid-week must not get a second Sunday.
3. **Quiet hours and a dead-letter path.** A push to a revoked endpoint returns 410 Gone — delete the row rather than retrying it for ever.
4. **Nothing is sent when there is nothing to say.** The review already has four states before "ready" (no objective, no finished week, a rest week, an empty week). A notification on any of those is a notification that wastes the one message a week you promised.

---

## Order of work

| # | Item | Unblocks | Owner |
|---|---|---|---|
| 1 | Decide shape A or shape B | Everything below | Owner |
| 2 | Apple Developer Program enrolment | Route 2, and Apple Health later | Owner |
| 3 | VAPID keys + subscription table + RLS | Route 1 sending | Build |
| 4 | Custom service worker (`injectManifest`) with `push` / `notificationclick` | Route 1 receiving | Build |
| 5 | "Add to Home Screen" explainer for iOS | Route 1 on iPhone at all | Build |
| 6 | In-context permission ask + Settings off switch | Any sending | Build |
| 7 | Hourly `pg_cron` + idempotency column | The Sunday timing | Build |
| 8 | APNs `.p8` key, Capacitor, Xcode, TestFlight | Route 2, Apple Health, widgets | Owner + build |
| 9 | Apply `20260911180000_plan_adjustments.sql` and sync | Shape B only | Owner + build |

Items 3 to 7 are a week of work and need nothing from Apple. Item 8 is the long pole and starts with item 2, which is a form and a card.

---

## What must not happen while this is outstanding

- No copy anywhere in the app saying a review was sent, delivered or scheduled.
- No "notifications" toggle in Settings that stores a preference nothing reads.
- No notification text that quotes a figure the sender did not compute.
- No push carrying sleep, heart rate or check-in answers.
