# Demo guide portraits

Every image in this folder is a **GAN-generated face of a person who does not
exist**, produced by StyleGAN (via thispersondoesnotexist.com) and downloaded on
2026-08-17.

No photograph of a real person is used, and none may be added. The eight demo
guides in `src/guides/types.ts` are invented people with invented IFMGA
licences, invented ascent records, invented day rates and invented ratings.
Attaching a real face to that record would present someone as a working mountain
guide with qualifications they do not hold — in a trade where a client picks a
guide precisely on that basis.

These files are gitignored and vercelignored, like `../operators/`. They exist so
the marketplace layout can be judged with faces in it. `GuidePortrait` falls back
to initials whenever a file is missing, so a fresh clone renders correctly.

A real guide's photograph belongs here only with that guide's written consent.

| File | Demo guide |
|---|---|
| guide-demo-lama.jpg | Nima Chhiring Lama |
| guide-demo-falkenrath.jpg | Ines Falkenrath |
| guide-demo-wehrli.jpg | Tomás Wehrli |
| guide-demo-halvorsen.jpg | Sofía Halvorsen |
| guide-demo-ait-benhaddou.jpg | Rachid Ait Benhaddou |
| guide-demo-zelenika.jpg | Jaka Zelenika |
| guide-demo-kastrinaki.jpg | Eleni Kastrinaki |
| guide-demo-callaghan.jpg | Marit Callaghan |
