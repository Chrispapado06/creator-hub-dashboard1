# Besties — creator link page with admin panel

A copy of the campusbesties.com layout for our own roster. Clicking any creator
card opens their link (OnlyFans, Beacons, whatever you put in) in a new tab,
with an 18+ confirmation the first time.

## Run it

```
node server.js
```

- Site: http://localhost:4180
- Admin: http://localhost:4180/admin — password `besties123` by default

In Claude Code, the `besties` launch config starts the same server.

Set env vars to change the defaults:

```
ADMIN_PASSWORD=your-secret PORT=4180 node server.js
```

**Change the password before putting this online.**

## Managing creators (the easy way)

Open **/admin**, log in, and everything is point-and-click:

- **+ Add creator** — new empty card; fill in name + link.
- **Upload…** — pick a photo from your computer; it's saved into `images/`
  and wired to the creator automatically. You can also paste any
  `https://...` image URL into the Image field instead.
- **Link** — the website that opens when a visitor taps the card.
- **NEW badge** — toggles the lime "NEW" tag on the photo.
- **Featured** — puts that creator in the big gradient card at the top and
  the floating bottom button (one at a time).
- **↑ ↓ / Delete** — reorder or remove creators.
- **Site text & settings** — headline, pill, subtitle, buttons, footer,
  support email and the 18+ popup text/toggle.

Hit **Save changes** when done — the public site updates instantly.

## Managing creators (the manual way)

All content lives in [data.json](data.json). Add a creator by copy-pasting a
block inside `"CREATORS"`:

```json
{
  "name": "Bella",
  "image": "images/bella.jpg",
  "link": "https://onlyfans.com/her-page",
  "isNew": true
}
```

Leave `"image": ""` for a branded placeholder with the creator's initial.

## Hosting on Railway

The server is a single dependency-free Node file. Because the admin panel
writes creator data and uploaded images to disk, Railway needs a **persistent
volume** — otherwise every redeploy wipes your edits.

Deploy from the GitHub repo:

1. Railway → **New Project → Deploy from GitHub repo** → pick this repo.
2. Service **Settings → Root Directory** = `besties`.
3. Service **Settings → Variables**:
   - `ADMIN_PASSWORD` = a strong password of your choice
   - `DATA_DIR` = `/data`
4. Service **Settings → Volumes → Add Volume**, mount path `/data`.
5. **Networking → Generate Domain** to get a public URL.

On first boot the app copies the bundled [data.json](data.json) into the
volume, then all future edits (and uploads) stay on the volume across
redeploys. `PORT` is provided by Railway automatically.

Any other Node host works the same way: run `node server.js`, set
`ADMIN_PASSWORD`, and point `DATA_DIR` at a persistent disk.

## Config env vars

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4180` | Port to listen on (Railway sets this). |
| `ADMIN_PASSWORD` | `besties123` | Password for `/admin` and the write APIs. **Change it.** |
| `DATA_DIR` | app folder | Where `data.json` + uploaded `images/` are read/written. Point at a volume in production. |

Colors live at the top of [styles.css](styles.css) (`--brand`, `--lime`, etc.).
