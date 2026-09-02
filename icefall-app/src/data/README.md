# Trail photographs

`trailPhotos.cyprus.json` is a manifest of verified photographs, keyed by trail
name, one entry per trail:

```json
"Artemis Trail": {
  "file":    "File:Troodos-artemis-nature-trail-a.jpg",
  "url":     "https://commons.wikimedia.org/wiki/File:Troodos-artemis-nature-trail-a.jpg",
  "licence": "CC BY-SA 4.0",
  "author":  "Mboesch",
  "what":    "looked at it: the bare earth path curving up a scree slope of Mount Olympus …"
}
```

Cyprus is done. UK and USA are next. This file is how to do them.

## The two failure modes this process exists to prevent

**The West Highland terrier.** A Commons geosearch around a trail's coordinates
returns everything anyone ever geotagged there. Somebody photographed their dog
on the path. The filename says nothing wrong, the coordinates are correct, the
licence is fine — and the trail card shows a West Highland terrier. Every
automated pass produces these, because a filename cannot tell you what is in a
picture.

**The International Space Station.** Search a place name and you will be handed
an orbital photograph of the island. Right place, and no walker has ever had
that view. Same family: satellite imagery, aerials, road signs, museum
paintings, a trailhead noticeboard, a parked car in a layby. All correctly
labelled, none of them the walk.

Both were caught only by opening the image. That is the whole method.

## Sourcing order

Work down the list per trail and stop at the first thing that survives review.

1. **Wikidata `P18`.** If the trail has a Wikidata item with an image, that is a
   human-curated lead photograph of this exact thing. Highest hit rate per
   candidate, lowest yield — most trails have no item.
2. **Wikipedia lead image.** The first image on the trail's article, in any
   language. `el` and `cs` carried several Cyprus entries that `en` did not.
3. **Commons geosearch.** Photographs geotagged near the route, nearest first.
   Widest net, worst signal — this is where the terrier lives. Everything from
   here needs the hardest look, and most of it is thrown away.

A named landmark on the route (a waterfall, a bridge, a rock) is a legitimate
subject and can be searched for directly. A village the trail passes is not:
"Kaminaria" returns the village of Kaminaria, which is a place, not a walk.

## The rule at review time

**Open every image. Look at it. No exceptions.** Not the filename, not the
description, not the category. The `what` field in the manifest is the note
written while looking at the picture, kept verbatim — including which candidate
was rejected and why, where there was a choice. It is the audit trail. If an
entry's `what` does not read like somebody looked, nobody did.

Accept when the landscape is the subject: the path, the ridge, the gorge, the
coast — the ground a walker actually crosses, from something like eye level.

Reject when the subject is a person, a dog, a building, a vehicle, a sign, a
bench, a picnic shelter, a monastery wall, a village, a watermark, or the view
from orbit. Incidental furniture at the frame's edge is fine. Furniture in the
centre is the photograph's subject and the answer is no.

Also reject anything under roughly 800 px on its long side. One Kakopetria
waterfall shot was the right subject and was refused at 424×624 — unusable at
any size the app draws.

## Licences

Commercial-permitting only: **CC0, CC BY, CC BY-SA, public domain.**

**Refuse every `-NC` licence** and everything marked "non-commercial",
"editorial use only", or with no licence stated. The app is a commercial
product; an NC image is a liability no matter how good it is. Cyprus's 82
entries are 35 × CC BY-SA 4.0, 21 × CC BY 3.0, 20 × CC BY-SA 3.0, 2 × CC BY-SA
2.0, 2 × CC BY 2.0, 2 × CC0. No NC image was accepted, and none should be.

`licence` holds the short name only. The deed URL is derivable from it, and
`url` points at the Commons file page, which states the licence and the author
of record.

## The rate to expect

**82 of Cyprus's 176 named trails came out with a photograph: 47%.**

Slightly under half. That is what an honest pass yields, and the UK and USA
should be planned around a number like it rather than around full coverage.
Within those 82, 14 entries record a candidate that was looked at and thrown
out before the accepted one — the real per-image rejection rate is far higher
than the per-trail rate suggests.

The 82 entries share 73 distinct photographs. Eight images serve two or three
trails each, in every case neighbouring routes on the same ridge or the same
loop under different names, and the `what` note says so. Reusing a genuinely
correct photograph across adjoining routes is allowed; stretching one across a
region is not.

## Rejected trails are not in this file

There is no `accepted: false` list, no placeholder, no "no photo found" entry.
**A trail's absence from the manifest is the record.** The other 94 Cypriot
trails simply have no key here.

The app already handles that honestly — `src/services/trailImagery.ts` falls
back to satellite imagery of the ground the trail crosses, and to a contour
plate if the tiles fail. Both are true of the place. A West Highland terrier is
not. Never add an entry to close a gap; leave the gap and let the fallback do
its job.
