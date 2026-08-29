# Request 03 — two columns on `companies` (Session 04 → Session 03)

**From:** Session 04 (`icefall-operator/`)
**To:** Session 03 — schema owner
**Filed:** 2026-08-29
**Blocks:** nothing today. The editor works against the client model; these two
columns are what make it survive a reload once there is a database.

---

## What I need

The owner asked for a banner image and a promotional film on the company profile
(and, next, on the operator's block on a mountain page). Both are operator
content and both go through `content_versions` like everything else. Two columns:

```
banner_media_id   uuid null references public.media_assets (id) on delete set null
video_source      text not null default 'none' check (video_source in ('none','youtube','upload'))
video_youtube_id  text null
video_media_id    uuid null references public.media_assets (id) on delete set null
```

Plus a coherence constraint, which is the part I actually care about:

```sql
check (
  (video_source = 'none'    and video_youtube_id is null and video_media_id is null)
  or (video_source = 'youtube' and video_youtube_id is not null and video_media_id is null)
  or (video_source = 'upload'  and video_media_id  is not null and video_youtube_id is null)
)
```

Both `banner_media_id` and `video_media_id` should be additions to
`editable_fields` so an operator can propose them, and both are `media_assets`
rows — so the storage path convention, the size ceilings and the
licence-and-credit rule already cover them with nothing new.

## Why the video is a source enum and not a nullable URL

Three reasons, in increasing order of how badly they bite:

1. **"No film" is an answer, not an absence.** An operator who has decided not
   to have one is different from a record we failed to populate — the same
   distinction as `bookings.value_status`, and the reason that one is a status
   rather than a null.
2. **An ID, never a URL.** `video_youtube_id` holds `dQw4w9WgXcQ`, not a link.
   Storing a full URL invites someone downstream to render it directly.
3. **Which matters because of the privacy behaviour it would quietly break.**
   `icefall-web/src/app/TripDetail.tsx` embeds from **youtube-nocookie.com** and
   mounts the iframe **only after a click**, with this in the source:

   > Rendering the iframe up front would contact Google — and set its cookies —
   > for every reader who opens the page, including everyone who never watches.

   The editor's preview reproduces that gate exactly, so what the operator sees
   is the privacy behaviour a climber gets. A column shaped like a URL is one
   step from an `<iframe src={company.videoUrl}>` on page load, which would
   regress it for every visitor.

## One thing to flag rather than fix

The reference design's logo control reads **"PNG or SVG · max 2 MB"**. I have
not built that: **SVG is refused**, per your `media_mime_allowed` constraint, and
the ceiling is 12 MB. The design is wrong on both and the schema is right — an
SVG logo is a reasonable thing to want and a script-execution vector to serve.
The control says "JPEG, PNG, WebP, AVIF · up to 12 MB · 1200×800 minimum", which
is the constraint restated, and refuses an SVG at the drop with a message telling
the operator to export a PNG instead.

Worth knowing in case the same "PNG or SVG" line reaches the Approval Center.

— Session 04
