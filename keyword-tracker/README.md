# Keyword Attribution Tracker

A standalone **Next.js 14 (App Router)** dashboard that maps OnlyFinder ad
keywords → OnlyFans tracking links → subscribers → revenue, so you can see ROI
per keyword and know what to scale or cut.

It connects to the **same Supabase project** as the main creator-hub dashboard
and reuses its existing `creators` table. It adds three new tables of its own.

## Stack

- Next.js 14 (App Router, server actions)
- Supabase (Postgres)
- Tailwind CSS (dark mode)
- OnlyFans API via REST (`https://app.onlyfansapi.com`)

## Setup

```bash
cd keyword-tracker
npm install
cp .env.local.example .env.local   # then fill in the values
```

`.env.local`:

| Var | Where it's used |
| --- | --- |
| `ONLYFANS_API_KEY` | Server only — sent as `Authorization: Bearer <key>` to the OF API |
| `NEXT_PUBLIC_SUPABASE_URL` | Same project as the main dashboard |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server actions (writes, bypasses RLS) |

### Apply the database migration

The three new tables (`tracking_links`, `keyword_costs`,
`subscriber_snapshots`) ship as a migration in the **parent repo's**
`supabase/migrations/` folder. From the repo root:

```bash
supabase db push
```

Or paste `supabase/migrations/20260606120000_keyword_attribution.sql` into the
Supabase SQL editor.

### Run

```bash
npm run dev      # http://localhost:3000
```

## Pages

- **/dashboard** — keyword table (Clicks, Spend, Subscribers, Revenue, Cost/Sub,
  ROI%) with color-coded ROI and creator / date-range filters.
- **/links** — add and list tracking links per creator.
- **/costs** — log daily OnlyFinder CPC data; view cost history.
- **/sync** — pull live subscriber + revenue data from the OF API into snapshots.

## How attribution works

1. You map each OnlyFinder keyword to an OF tracking-link ID on **/links**.
2. You log daily clicks + spend from OnlyFinder on **/costs**.
3. **/sync** pulls each creator's tracking-link stats from the OF API and stores
   a snapshot (`subscribersCount`, `revenue.total`) per link.
4. **/dashboard** joins summed costs with the latest snapshot:
   - `Cost/Sub = Spend / Subscribers`
   - `ROI% = ((Revenue − Spend) / Spend) × 100`

> **Auth note:** the brief mentioned an `x-api-key` header, but the production
> dashboard authenticates against this same API with a Bearer token, so that's
> what `src/lib/of-api.ts` uses. If your key requires `x-api-key`, change the
> header in `ofFetch`.
