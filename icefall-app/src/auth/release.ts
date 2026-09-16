/**
 * Whether a verified account may proceed past the holding screen to the
 * onboarding questions. Charlie, 12 September 2026: "once people signup to
 * page and verify their email... they enter this waitlist page... when we
 * update the app then they get to go through the signup questions."
 *
 * Flip to `true` when ICEFALL opens and every currently-held account moves on
 * to `/onboarding` on its next check — never straight to `/home`, and never
 * around the questionnaire. See `nextStepForSession()` in `account.ts`, the
 * one router this constant feeds, and `screens/auth/Holding.tsx`, the screen it
 * gates people behind.
 *
 * ONE FLAG, ONE PLACE — the exact shape of `icefall-web/src/site/
 * SiteChrome.tsx`'s `SITE_LIVE`, deliberately: a single exported boolean,
 * flipped by hand, is what Charlie asked for ("when we update the app"), and
 * it is far easier to reason about than a per-account approval queue nobody
 * asked for. This is NOT the same switch as `SITE_LIVE` — that one swaps the
 * public site's home page, on a different app, for a different audience.
 *
 * BEFORE THIS MAY BE FLIPPED: the launch date in `@/launch` must already say
 * the day this is actually happening — that constant is what the holding
 * screen quoted to everyone waiting on it, and it must still be true the
 * moment they are let through. There is no other precondition: onboarding
 * itself does not read this flag and is not gated by it in any way, so
 * nothing else about the questionnaire needs to be ready first.
 *
 * REVERSIBLE. Setting this back to `false` after launch immediately holds
 * every account that has not yet reached `/onboarding` again — it does not
 * touch anyone who already passed through and has `onboarded_at` set.
 */
export const APP_RELEASED = false;
