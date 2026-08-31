# Building `icefall-web` for offline review

    npm run build:offline --prefix icefall-web
    # -> icefall-web/dist-offline/   (copy into ICEFALL-OFFLINE/apps/web/)

Verified 2026-08-31. Use this, not `npm run build`, for the owner's offline
bundle — and **never** for a deployment.

## The problem it solves

The first offline bundle was a production build, so every path rendered the
waitlist and roughly **30 screens went unreviewed**. The owner wrote 53 change
requests across the other four apps and none for this one, not because it is
finished but because they could not get into it.

`App.tsx` gates both the marketplace and the signed-in app on
`import.meta.env.DEV`, with the test wrapping the `lazy()` call so Rollup drops
the chunk entirely. That is deliberate and must not be weakened: a public build
that shipped `/app/*` would ship the invented guides, prices and ratings that
`data/demo.ts` exists to keep out of `dist/`.

## Why `--mode development` alone does not work

It was tried and the chunk still did not survive. The reason is that
`import.meta.env.DEV` is derived from **`NODE_ENV`**, not from `--mode`, and
`vite build` sets `NODE_ENV=production` for you regardless of the mode you pass.
So `--mode development` changes which `.env` file is read and leaves `DEV`
false.

`NODE_ENV=development` in front of it is the whole fix.

## Why this does not weaken the guard

**The condition in `App.tsx` is untouched.** No second flag, no `||`, no
exception. The gate says the product exists when `import.meta.env.DEV` is true,
and this is a build where it genuinely is true. That is the gate's meaning, not
a way round it.

Proven rather than asserted — a plain `vite build` was checked for four strings
that only exist inside the gated tree:

| String | production build | offline-review build |
|---|---|---|
| `Solukhumbu Expeditions` | **0 files** | present |
| `data-icefall-section` | **0 files** | present |
| `Coach credits` | **0 files** | present |
| `Elite Exped` | **0 files** | n/a — withheld offline, see below |

A production build emits one JS chunk. This build emits `Routes-*.js` (`/app`)
and `Marketplace-*.js` (`/preview`) as well.

## What was verified in a browser

Served from a static file server with `index.html` fallback — the same shape as
`ICEFALL-OFFLINE/serve.js`, whose existing fallback already handles SPA deep
links, so **the launcher needs no change**:

- `/` — the waitlist still renders, with the contact form.
- `/app` — the full signed-in dashboard, sidebar, countdown, demo listings.
- `/app/company/solukhumbu-expeditions` — logo, all eight tabs, every section.
- `/app/expeditions`, `/app/treks` — deep routes resolve through the fallback.
- **Every network request went to localhost. Nothing reached outward.**

## One thing that looks like a bug and is not

`/app/company/elite-exped` renders **"No such company"** offline, and that is
correct. Offline a permanent banner labels the whole site "sample data, not
real"; applying that sentence to an identifiable real business is a claim
ICEFALL has no standing to make, so `companies.ts` and `demo.ts` withhold the
record and its two listings offline rather than showing them under a heavier
label. Both filters run on the already-`IS_DEMO`-gated array, so a production
build still folds everything to `[]`.

**Consequence for a reviewer:** the real-business disclosure page cannot be
reviewed offline. It is the one screen this bundle deliberately cannot show.

## Danger

`dist-offline/` contains every invented guide, price, rating and review, and the
demo companies. It is for a local bundle on the owner's machine and nothing
else. It is a separate directory from `dist/` so the two cannot be confused, and
it must never be deployed.
