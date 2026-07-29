# OFM Public Viewer

A tiny Vercel app that renders **published** OFM Workspace pages as styled HTML.

Why it exists: Supabase's `*.supabase.co` domain force-serves `text/plain` (anti-XSS) on both functions and storage, so it can't render a styled public page. This viewer runs on Vercel (which serves real `text/html`), fetches the page JSON from the Supabase `public-page` function, and renders it.

## Deploy (one time)

```bash
cd ofm-public-viewer
npx vercel --prod
```

Set the Supabase project URL (once):

```bash
npx vercel env add SUPABASE_URL
# value: https://<your-project-ref>.supabase.co
```

Vercel gives you a URL like `https://ofm-public-viewer.vercel.app`. Published pages are then viewable at `https://ofm-public-viewer.vercel.app/<public_token>`.

## Point the app at it

In `ofm-workspace/.env`, set:

```
VITE_PUBLIC_VIEWER_URL=https://ofm-public-viewer.vercel.app
```

Restart the dev server. The Share dialog's "Publish to web" links now use the styled viewer. (If `VITE_PUBLIC_VIEWER_URL` is unset, links fall back to the Supabase text view.)

## Notes

- Images/file attachments live in a **private** bucket, so they aren't shown on the public page (only text/structure). A future version can have the `public-page` function sign published-page assets.
- The viewer is read-only and stateless; it only ever shows pages the author explicitly published.
