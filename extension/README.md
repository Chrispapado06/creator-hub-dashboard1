# Agency Console — Chatter Logger (Chrome extension)

A Chrome extension that lets chatters log PPV sales, tips, custom requests,
and message counts to their active shift without leaving Infloww or
OnlyFans. Once installed, they click the extension icon → log a sale → done.

The data lands in the same `shifts` table the dashboard reads from, so
Performance / Pay / Bernard see it immediately.

---

## Installing it (one-time, per chatter)

This extension isn't on the Chrome Web Store — it's loaded as an
**unpacked extension** from this folder.

1. Download or copy this `extension/` folder onto the chatter's machine.
2. Open Chrome → `chrome://extensions`
3. Toggle **Developer mode** on (top-right).
4. Click **Load unpacked** and pick this `extension/` folder.
5. Pin the extension to the toolbar so it's one click away.

## First-time setup

1. Click the extension icon → ⚙ (top-right of the popup) → **Settings**.
2. Paste:
   - **Supabase URL** — from Supabase → Settings → API → Project URL.
   - **Anon key** — from Supabase → Settings → API → Project API keys → `anon` `public`.
   - **Staff portal URL** (optional) — your live dashboard URL, e.g.
     `https://creator-hub-dashboard1.vercel.app`. The popup uses this to
     open the staff portal directly when needed.
3. Hit **Save**.

These values are public (the dashboard ships them in its own JS bundle), so
it's safe to paste them in.

## Using it

1. Clock in via the staff portal as usual (browser, the dashboard's `/clock`).
2. Move to your normal workflow (Infloww / OnlyFans web).
3. When you make a sale, click the extension icon. The popup shows your
   current shift + creator.
4. Type the amount → click **+ PPV** / **+ Tip** / **+ Custom**. The shift's
   counters update in Supabase immediately. You'll see the totals in the
   popup refresh.
5. Press Enter inside any input field as a shortcut.
6. Repeat. When the shift ends, clock out from the staff portal.

The extension does **not** end shifts — clocking out goes through the staff
portal so you get the role-specific clock-out form (notes, etc.).

---

## What it does and doesn't do

**Does:**
- Authenticates against `access_codes` (same as the staff portal login).
- Finds the chatter's currently-open shift (one with `end_at` IS NULL).
- Increments `ppv_count`, `ppv_revenue`, `tips_revenue`, `custom_revenue`,
  and `message_count`. Re-derives `total_revenue` from the live row each
  time, so concurrent updates from the dashboard don't get clobbered.
- Stores credentials (Supabase URL/anon key + session) in
  `chrome.storage.local` (per-extension, per-machine).

**Doesn't (yet):**
- Inject a floating overlay onto Infloww / OnlyFans pages. The popup
  approach is intentional for v1 — works everywhere, no host-permission
  concerns. A content-script overlay is a v2 candidate.
- Auto-detect the fan you're chatting with. v2 candidate — would need
  page parsing per platform.
- End shifts. Clock-out happens in the staff portal so the role-specific
  form gets filled in.

---

## Files

| File | What it is |
|---|---|
| `manifest.json` | Manifest v3 declaration. Permissions: `storage` + Supabase host. |
| `popup.html` / `.css` / `.js` | The popup UI. State machine: needs-setup → login → no-shift → workspace. |
| `options.html` | Settings page (Supabase URL + anon key + portal URL). |
| `icon.svg` | Extension icon (matches the dashboard's gradient logo). |

## Icon: SVG vs PNG

Chrome's MV3 manifest is a bit picky about icon formats. The shipped
`icon.svg` works in modern Chrome but if you see a generic puzzle-piece
icon in `chrome://extensions`, convert it to PNG manually:

1. Open `icon.svg` in your browser.
2. Right-click → "Inspect" → take a screenshot of the SVG element at
   128×128, OR use any SVG-to-PNG tool (Figma export, ImageMagick:
   `convert -density 384 icon.svg -resize 128x128 icon-128.png`).
3. Save as `icon-128.png` next to `icon.svg`.
4. Edit `manifest.json` to reference `icon-128.png` instead of `icon.svg`.
5. Reload the extension at `chrome://extensions`.

## Roadmap (v2+)

- Content-script overlay so the logger floats inside Infloww / OF pages
  without opening the popup.
- Fan-aware logging: parse the active conversation's fan name from the
  page DOM, attach it to whale cards / fan database (when that table lands).
- Daily totals + leaderboard view inside the popup.
- Shift summary on clock-out auto-populated by the extension's running counts.

## Privacy / security notes

- The extension talks to your Supabase project only (host permission is
  scoped to `https://*.supabase.co/*`).
- The chatter's password is sent to Supabase exactly once (login) and
  matched against `access_codes`. We don't store the password locally —
  only `username` and `chatter_id` after a successful sign-in.
- Logging out clears the local session completely.
- All operations are logged in your dashboard's audit log when run from
  the staff portal — extension-only writes go straight to `shifts` and
  inherit the same RLS as the rest of the app.
