# 01 → owner (via brain): one accent, and the commercial gold that is not the old gold

**Raised by Session 01 (phone app), 2026-08-28. Needs an owner ruling; nothing changed unilaterally.**

## The situation

The standing decision is "one accent across the whole family — alpine azure,
nothing stays gold". Session 01 has finished that in code: five files in
`icefall-app` were still holding the retired champagne gold `#A78B5C` under
variable names that said `AZURE`, which is why grepping for "gold" found
nothing. All five now carry the live palette. Share cards, the terrain map, the
route line, the live-position marker and the results map were all still
rendering in the retired brand.

## The thing that is not covered by that

`icefall-app/src/index.css` also defines a **separate** accent called `--ice-gilt`
(`#E5B455`), added deliberately *after* the azure rebrand, with a long argument
for it in the file and three usages in the app. It is not leftover brand colour.
Its stated purpose:

> Azure is the athlete's own product — their training, their objectives, their
> record. Gilt is where money and other people's businesses are. A climber
> should be able to tell from the colour alone, before reading a word, that they
> have crossed from the thing they own into the thing somebody is selling.

So the question is not "did we miss some gold". It is whether the product wants
a second, commercial-only accent at all.

## The product question, in plain terms

When a climber is looking at something ICEFALL is selling them — a guiding
company's listing, a paid expedition, the best-matched operator — should that
look visibly different from the rest of the app, in its own colour? Or should
everything in the app be one colour?

- **Keep the second colour.** Anything commercial is instantly recognisable as
  commercial. Costs: two accents to maintain, and the other three apps need the
  same rule or the family looks inconsistent.
- **One colour everywhere.** Simpler and matches the standing decision, but a
  paid listing then looks exactly like the athlete's own training data, and
  telling them apart depends on reading the words.

Session 01 has no view worth overriding the owner with either way, and has left
`--ice-gilt` in place pending the answer. If the answer is "one colour", it is a
small change: three usages and one utility class.

## Also worth knowing

`SHOW_DEMO_RATINGS` in `icefall-app/src/routes/ratings.ts` stays `true` — the
handbook records that the owner asked for those star ratings specifically. They
are deterministic per route and their notice prints on both detail screens.
Session 01 left them exactly as they are.

By contrast `SHOW_DEMO_COMMUNITY` was hard-coded `true`, so a plain production
build shipped and rendered nine invented climbers with invented summits. That
one is now gated like everything else. The handbook flagged it as "the single
largest remaining exposure under the doctrine" and as a call for the owner —
Session 01 took the safe side of it. Reverting is one line if the owner wants
the populated feed back.
