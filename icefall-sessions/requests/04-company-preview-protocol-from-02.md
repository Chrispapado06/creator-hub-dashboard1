# Contract — company page live preview (Session 02 → Session 04)

**Status:** FROZEN. Build against this. Full rationale in the copy Session 02
holds; this is the authoritative shape.

`protocolVersion: 1` on every message, both directions. On mismatch, refuse
loudly rather than interpret.

## Parent → iframe

    { protocolVersion: 1, type: "icefall:preview:draft", company: <partial record> }
    { protocolVersion: 1, type: "icefall:preview:show",  sectionId: string }
    { protocolVersion: 1, type: "icefall:preview:ping" }

`draft` may be partial — omitted fields fall back to the stored record.

## Iframe → parent

    { protocolVersion: 1, type: "icefall:preview:ready",    sections: SectionId[] }
    { protocolVersion: 1, type: "icefall:preview:sections", activeTab: string,
      rects: { id, rect: {x,y,width,height} | null, reason? }[] }
    { protocolVersion: 1, type: "icefall:preview:rejected", field, why }

Every declared id appears in `rects` every time. `reason` when `rect` is null:

- `tab-inactive` — legitimate. Ask for it with `show`.
- `empty` — legitimate. No data for that section.
- `not-found` — **loud.** The contract has gone stale against the page. Error.

An unrecognised id is likewise an error, so added sections surface immediately.

## Section ids (v1)

`hero`, `about`, `story`, `why-climb`, `featured-trips`, `credentials`,
`reviews`, `team`, `gallery`, `faq`

## THE PAGE IS TABBED

Team, Gallery, About and FAQ are not in the DOM unless their tab is active.
"Declared but no rectangle" therefore does not mean broken. Use `show` to make a
section measurable before outlining it. An inspector that ignores this appears to
work on Overview and silently fails on half the sections.

## Draft allowlist — never spread

Accepted: `name`, `tagline`, `city`, `about` (strings, capped);
`yearsExperience`, `expeditionCount`, `summiteerCount`, `reviewCount` (finite
int ≥ 0); `rating` (0–5); `summitSuccessPct` (0–100); `logo`, `team[].photo`,
`gallery[]` (URLs, scheme-allowlisted); `credentials[]`, `team[]`, `pillars[]`,
`highlights[]`, `faq[]`, `reviews[]` (arrays of objects with allowlisted string
fields). Anything else is dropped silently.

**`realBusiness` is NEVER accepted from a draft**, nor is `id`. `realBusiness`
decides whether the page carries the "this is a real company, ICEFALL has no
partnership with it" banner and the corrected demo notice. A draft that could
clear it would render a real operator's page with the disclosure removed. It is
the most dangerous field in the record.

URL schemes: `https:` and app-relative `/…` only. Not `http:`, `data:`, `blob:`
or `javascript:`. A rejected URL falls back to the generated plate and emits
`rejected` so the editor can tell the operator why.

## Origin

Operator portal origin only — but the origin check is NOT the boundary. It stops
the wrong sender and says nothing about the payload, which in the real product
comes from an operator: an untrusted external party by design. The allowlist is
the boundary.

## Two corrections to earlier guidance from Session 02

- **There is no video to refuse — as of 2026-08-29, and this may change.**
  `Company.tsx` today has no `videoId`, no iframe, no embed. "Watch the video" is
  a button that reveals "No video has been published by this operator." So do not
  build a defence for a company-page embed that does not exist, and do not assume
  the page can play video.

  **Conditional, flagged so it does not quietly become the stale line that
  misleads you:** a company-page video block is under consideration and is
  currently ON HOLD, because decisions 14 and 15 contradict each other — 14 puts
  a film on the company page, 15 says films live per mountain-placement and there
  is no company-level film. If the owner resolves that in favour of a company-page
  block, this paragraph stops being true. When it does, `videoId` joins the
  allowlist table as a **hard-validated** field (`^[A-Za-z0-9_-]{11}$`) that is
  nonetheless **refused from a draft**, a `video` section id is added to
  `SECTION_IDS`, and you will be told before either happens — an unrecognised id
  is an error on your side by design, and that is the mechanism working, not a
  bug.
- **There is no `href` sink.** The only `Link` is a hardcoded `/app/explore`.
  Nothing on this page routes from company data. The rule stands generally;
  there is nothing here to apply it to.

## Both ends are DEV-only

`/app/*` is dropped from `icefall-web` production builds. The preview mode and
its listener live in that chunk and are additionally guarded on
`import.meta.env.DEV`, so `?preview=1` cannot become a second way in. Neither app
is deployed, so dev-to-dev is sufficient — but this editor is honest in
development and **unshippable until the marketplace gate lifts**, which is the
second operator feature to hit that wall.

— Session 02, 2026-08-29
