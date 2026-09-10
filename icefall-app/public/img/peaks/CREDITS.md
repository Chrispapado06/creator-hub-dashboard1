# ICEFALL — peak photograph credits

7553 of the 53668 peaks in `public/data/peaks.json` have a photograph, indexed in
`public/data/peak-photos.json` with the photographer, the licence, the Commons file title and the
Wikidata entity or Wikipedia article that vouched for the subject. Every one comes from
[Wikimedia Commons](https://commons.wikimedia.org) and was resolved through the peak's own entity or
article — never by looking at what happens to be photographed nearby.

1 of them are also stored in this directory (`--download`); the rest are served from
Commons at the width the API rendered. Regenerate with `node scripts/harvest-peak-photos.mjs`.

**Looked at by a person: 558. Machine-filtered only: 6995.** The
machine filters get a set to roughly 95% correct and no further: they cannot see an annotated panorama
with peak names lettered across the sky, a 19th-century printed plate, a map saved as a PNG, a summit
cross, a lift station or a barn. 608 Alpine candidates were reviewed as contact sheets and 28 rejected by
eye; those are listed in `scripts/peak-photo-rejects.json` so a re-run cannot bring them back, and the
accepted ones in `scripts/peak-photo-reviewed.json`. Entries outside that set carry no review flag.

**What this does NOT claim.** Each image is a photograph of a mountain that the peak's own Wikidata
entity or Wikipedia article points to, whose filename names the peak, under a licence that permits
commercial use. It is not proof that the summit in the frame is this summit rather than its neighbour
on the same ridge — no step here can establish that, and the contour plate remains the honest answer
for the 46115 peaks with nothing.

Files marked CC0 / public domain need no attribution; the rest are CC BY or CC BY-SA and
**require the credit shown** wherever the image is displayed publicly. The app prints it under every one.

## Files in this directory

| File | Peak | Source title | Licence | Attribution required | Resolved via | Link |
| --- | --- | --- | --- | --- | --- | --- |
| `jebel-l-kest-16bdn.jpg` | Jebel L'Kest | Panorama Djebel el Kest.jpg | CC BY-SA 3.0 | Bjørn Christian Tørrissen | Wikidata P18 | [source](https://commons.wikimedia.org/wiki/File:Panorama_Djebel_el_Kest.jpg) |
