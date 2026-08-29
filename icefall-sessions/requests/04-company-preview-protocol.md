# Contract — company page live preview (Session 02 → Session 04)

**From:** Session 02 (`icefall-web/`)
**Filed:** 2026-08-29
**Status:** the shape is FROZEN as below. Build your stub against it; I am
building the `icefall-web` side to match.

---

## Two corrections to what I told the brain, before anything else

I gave the brain a security list that has since met the actual page. Two items
were wrong and you should not build against them:

1. **There is no video to refuse.** I said "refuse the operator's video in
   preview and show a placeholder". `Company.tsx` has no video embed, no
   `videoId`, no `<iframe>`. The "Watch the video" control is a button that
   reveals the sentence *"No video has been published by this operator."* There
   is no id-shaped hole to defend, so do not build a defence for one — and do
   not assume the page can play video, because it cannot.
2. **There is no `href` sink either.** I warned that no draft URL may reach an
   `href`, which is the right rule in general and is moot here: the only
   `Link` on the page is a hardcoded `/app/explore`. Nothing on this page routes
   from company data. The rule stands as a rule; there is currently nothing to
   apply it to.

What IS real is below. The surface is narrower than I feared, and one item on it
matters more than anything I originally listed.

## The section list is tab-gated — read this before designing the inspector

**The company page is a tabbed layout, and unselected tabs are not in the DOM.**
`TABS = Overview | Expeditions | Treks | Reviews | Team | Gallery | About | FAQ`.
Team, Gallery, About and FAQ only exist as elements when their tab is active.

So a section can be legitimately unmeasurable, and your inspector cannot assume
"declared but no rectangle" means "broken". That is why the protocol has a
`showSection` message: to outline the FAQ, you ask the preview to switch to it.

## Protocol

`protocolVersion: 1`. Every message in both directions carries it. On mismatch,
refuse and surface it loudly — do not attempt to interpret.

### Parent → iframe

```ts
{ protocolVersion: 1, type: "icefall:preview:draft",  company: <partial record> }
{ protocolVersion: 1, type: "icefall:preview:show",   sectionId: string }
{ protocolVersion: 1, type: "icefall:preview:ping" }
```

- `draft` — render this instead of the stored record. Send it as often as you
  like; the page re-renders. **Partial is fine**: fields you omit fall back to
  the stored record, so an editor that only knows about `about` can send only
  `about`.
- `show` — switch the page to whichever tab contains `sectionId`, so it becomes
  measurable. Answered with a fresh `sections` message.
- `ping` — answered with `ready`. Use it to know the iframe has mounted rather
  than guessing with a timeout.

### Iframe → parent

```ts
{ protocolVersion: 1, type: "icefall:preview:ready",    sections: SectionId[] }
{ protocolVersion: 1, type: "icefall:preview:sections", activeTab: string,
  rects: { id: SectionId; rect: {x,y,width,height} | null; reason?: string }[] }
{ protocolVersion: 1, type: "icefall:preview:rejected", field: string, why: string }
```

`sections` is posted on mount, on every draft render, on `show`, on scroll, on
resize, and on tab change — debounced to animation frames. Coordinates are
relative to the iframe's own viewport, so add the iframe's offset yourself.

**Every declared id appears in `rects` every time.** A section that could not be
measured has `rect: null` and a `reason`, one of:

- `"tab-inactive"` — legitimate; ask for it with `show` if you need it.
- `"empty"` — the section rendered nothing because the record has no data for
  it (a company with no team). Legitimate; the page deliberately renders nothing
  rather than an empty frame.
- `"not-found"` — **this is the loud one.** The id is declared in the contract
  and the page could not find it. It means `icefall-web` renamed or restructured
  something and this contract went stale. Treat it as an error and surface it;
  do not silently skip it. That is the failure mode the whole design is against.

Treat an id you do not recognise as an error too, so that when I ADD a section
you find out immediately instead of silently not offering it.

### Section ids (v1)

`hero`, `about`, `story`, `why-climb`, `featured-trips`, `credentials`,
`reviews`, `team`, `gallery`, `faq`

Exported from `icefall-web` as the single source of the contract; the page
derives its sections from that list rather than each section naming itself, so
the list and the page cannot disagree.

## What the draft may carry, and what is silently dropped

Fields are **allowlisted, never spread**. Anything not named here is dropped
without comment (a spread is how an unaudited field reaches a sink).

| Field | Accepted as |
|---|---|
| `name`, `tagline`, `city`, `about` | string, length-capped |
| `yearsExperience`, `expeditionCount`, `summiteerCount`, `reviewCount` | finite integer ≥ 0, clamped |
| `rating` | finite number, clamped 0–5 |
| `summitSuccessPct` | finite number, clamped 0–100 |
| `logo`, `team[].photo`, `gallery[]` | URL, scheme-allowlisted (see below) |
| `credentials[]`, `team[]`, `pillars[]`, `highlights[]`, `faq[]`, `reviews[]` | arrays of objects with their own allowlisted string fields, length-capped |

**`realBusiness` IS NOT ACCEPTED FROM A DRAFT, ever.** It is read from the
stored record and nothing else. It is the flag that decides whether the page
carries the "this is a real company, ICEFALL has no partnership with it"
banner and the corrected demo notice. A draft that could clear it could render a
real operator's page with the disclosure removed. That is the single most
dangerous field in the record and it is the one nobody asked about — including
me, until I read the page. Do not send it; it will be ignored.

`id` is likewise not accepted. The preview renders the company in the route.

**URL scheme allowlist:** `https:` and app-relative paths beginning `/`. Not
`http:`, not `data:`, not `blob:`, not `javascript:`. A rejected URL renders the
existing fallback (the generated plate for imagery) and emits a `rejected`
message so your media validation can show the operator why — you are validating
at the drop, which is the right place, and this is the backstop for anything
that gets past it.

## Origin

The page accepts messages from the operator portal's origin only. But note the
thing I got wrong first and want you to carry: **the origin check is not the
security boundary.** It stops the wrong sender. It says nothing about the
payload, and in the real product the payload originates from an operator, who is
an untrusted external party by design. The allowlist above is the boundary.

## DEV-only, both ends

`/app/*` is dropped from `icefall-web` production builds (the `lazy()` call sits
inside `import.meta.env.DEV`, so Rollup removes the chunk). The preview mode and
its `postMessage` listener live inside that chunk and are additionally guarded on
`import.meta.env.DEV`, so `?preview=1` cannot become a second way in. Neither
app is deployed, so dev-to-dev is sufficient — but it does mean **this editor is
honest in development and unshippable until the marketplace gate lifts.** The
brain is taking that to the owner as a decision in its own right; it is the
second operator feature to hit the same wall.

— Session 02
