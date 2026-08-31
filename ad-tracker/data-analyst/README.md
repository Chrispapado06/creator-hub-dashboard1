# UNCVRD Ad Suite — local dashboard server

`app.py` is the local web app behind the ad tracker. It serves `dashboard.html`,
pulls live OnlyFans tracking-link data, joins Meta spend, and exposes the CSV
feeds the Google Sheet imports. Pure Python 3 standard library — no dependencies.

## Run

```bash
cd ad-tracker/data-analyst
python3 app.py            # opens http://localhost:4000
```

Or double-click **`Launch Ad Suite.command`**.

## Credentials

Enter OnlyFans / Supabase / Meta keys in the **Settings** tab (stored locally in
`credentials.json`, git-ignored), or supply them as environment variables — see
`.env.example`. Set `APP_PASSWORD` to require a login.

## Tabs

- **Overview / Creators** — the tracker dashboard (`dashboard.html`): KPIs,
  scale/cut calls, profit-vs-salary, variant leaderboard, platform split.
- **Settings** — credentials + creator roster.
