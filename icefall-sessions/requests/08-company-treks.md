# Request 08 → Session 03 (schema owner): the trek equivalent of `company_mountains`

**From:** Session 04 (`icefall-operator/`)
**Date:** 2026-08-31
**Blocks:** `OP-04` Treks, entirely. Not a polish item — the mechanism the owner
asked for cannot be built against the data that exists, in any honest form.

> **SUPERSEDED IN PART, 2026-08-31 — read `09-company-treks-migration.md` first.**
> The owner has since ANSWERED the open question ("Yes add them to also request a
> trek"), and Session 04 has built the whole chain against the in-memory backend:
> `Trek`, `CompanyTrek`, `getTreks()`, `getTrekAccess()`, `canManageTrek`, and a
> select-first request panel on `Treks.tsx` identical to the mountain one.
> **Request 09 carries the proposed SQL and the RLS posture; §5.2 below no longer
> does.** This file stays as the investigation that produced the ask — the
> `operatorIds`-is-empty finding (§3) and the 207-of-252 count (§2) are still the
> evidence — but the SQL to apply is in 09, in one place.

---

## The ask in one line

`OP-03` works because a company **requests access to a catalogue row**
(`company_mountains`). `OP-04` asks for the same sentence with the word "trek"
in it. **There is no trek catalogue in this portal's schema and no trek access
table, so there is nothing to request against.** I am asking you for both, plus
the write path that carries the request — which, it turns out, does not exist
for mountains either (§4).

I have not built a substitute. A second, cleverer mechanism invented inside one
app is exactly what the handbook says not to do, and a "request a trek" panel
over a catalogue that is not there would be a button that files nothing.

---

## 1. The owner's words

> So when a company requests to add a Trek, they should select Trek first and
> then send request to the company. Companies also should edit how many spots
> they have, there exact Itinerary. Difficulty should be already there since
> doesnt change + highest point they dont make sense. Also make Edit page bigger
> to be seen and preview acc show how prev looks on the app or the web.

Word for word the same note as `OP-03`, with "Trek" substituted for "mountain".
The owner is asking for one mechanism, twice. That is the right instinct and it
is why this is a schema request rather than a screen.

---

## 2. What exists for mountains, and what a trek has instead

### Mountains — a catalogue row, an access row, and a predicate

| Piece | Symbol | File |
|---|---|---|
| The catalogue | `Mountain` (`id` IS the slug) | `icefall-operator/src/domain/types.ts:171` |
| The access row | `CompanyMountain { companyId, mountainId, status, assignedAt }` | `types.ts:193` |
| Its lifecycle | `MountainAccessStatus = "active" \| "suspended" \| "ended"` | `types.ts:181` |
| The read | `OperatorBackend.getAccess(session)` | `src/domain/adapter.ts:250` |
| The predicate | `canManageMountain(session, access, mountainId)` | `src/domain/authz.ts:95` |
| Its list form | `manageableMountainIds(session, access)` | `authz.ts:107` |

`canManageMountain` mirrors the SECURITY DEFINER function
`company_may_edit_mountain(company_id, mountain_id)` one for one, and every
mountain-facing screen consults it. That chain — catalogue row → access row →
predicate → UI — is the whole of `OP-03`.

### Treks — none of that

In this portal a trek is **not a catalogue row a company is granted**. It is a
`Product` the company authors:

```ts
export type ProductKind = "expedition" | "trek";   // types.ts:247
```

`Product` (`types.ts:264`) carries `mountainIds: string[]` and **no `trekId` of
any kind**. `NewProductInput` (`adapter.ts:200`) is:

```ts
export interface NewProductInput {
  kind: ProductKind;
  name: string;
  mountainId: string;      // REQUIRED, and it is a MOUNTAIN
}
```

and `memoryBackend.createProduct` gates it on
`canManageMountain(session, db.access, input.mountainId)`. So today:

- a trek is authorised **by mountain**, because that is the only access row there
  is;
- a trek that is on no mountain **cannot be created at all** — and **207 of the
  252** catalogue treks have an empty `mountainIds` (the Camino Francés, the West
  Highland Way, Gosaikunda, the Tamang Heritage Trail…), which is 82% of the
  catalogue this portal could not express;
- `Product.difficulty` is a free-text string the company types. The seed has
  `"Demanding walking, no technical ground"`, `"Sustained, long days above
  5,000 m"`, `"Strenuous walking at altitude"` — three phrasings, three trips, no
  scale. The owner's "difficulty should be already there since doesn't change"
  has nothing to read it from.

---

## 3. Where the trek catalogue actually is — another app

`icefall-web/src/data/trekRecords.ts` — `TREK_RECORDS: Trek[]`, **252 records**,
across 22 regions (`TREK_REGIONS` in `trekTypes.ts`). The type is a proper
catalogue row and it already carries the two fields `OP-04` needs:

```ts
export interface Trek {
  id: string;                       // slug, and the id in every relation
  name: string;
  regionId: string;
  country: string;
  mountainIds: string[];            // MAY BE EMPTY, and often is
  durationDays: [number, number] | null;
  difficulty: TrekDifficulty | null;   // "Easy" | "Moderate" | "Strenuous" | "Very strenuous"
  /** Highest point ON THE ROUTE — never the summit of a mountain beside it. */
  maxAltitudeM: number | null;
  season: string | null;
  priceFromEur: Cents | null;       // ALWAYS NULL — a price is an operator's claim
  style: TrekStyle;
  summary: string;
  operatorIds: string[];            // <- see below
  guideIds: string[];
}
```

### The finding that matters most here

`operatorIds` **is empty on all 252 records.** I checked every one. The web app
does not use it. `operatorsForTrek(trekId)` in `icefall-web/src/data/treks.ts:52`
does this instead:

```ts
const OPERATOR_REGIONS: Record<string, string[]> = {
  "solukhumbu-expeditions": ["khumbu", "annapurna", "langtang", "nepal-remote", "bhutan"],
  "cordillera-ascents":     ["cusco", "cordillera", "patagonia", "andes-north"],
  "chamonix-alpine-guides": ["alps", "dolomites", "iberia", "iceland", "uk-ireland", "atlas"],
};

export function operatorsForTrek(trekId: string): Company[] {
  const trek = trekById(trekId);
  if (!trek) return [];
  return COMPANIES.filter(
    (c) => !c.realBusiness && (OPERATOR_REGIONS[c.id] ?? []).includes(trek.regionId),
  );
}
```

**That is a hand-written region map over three invented companies, not an
operator↔trek relation.** It is honestly built and correctly excludes the one
real business (`!c.realBusiness` keeps Elite Exped off routes it has not told us
it runs). But it means the answer to "which operator runs this trek" is
**demo scaffolding in a second app**, not a fact any table holds. So:

- the catalogue exists, in `icefall-web`, as TypeScript data;
- the relation does not exist anywhere, in any app;
- and the operator portal can see neither.

---

## 4. The write path is missing for mountains too

While verifying this I found that `OP-03`'s request flow has no transport
either. `OperatorBackend`'s entire mountain surface is `getAccess`,
`getPlacements` and `getMountains` — three reads, no write. Session 04's rebuilt
`src/screens/Mountains.tsx` now names the peak before it asks, and says in words
that nothing was transmitted rather than printing "Request sent" over a method
that does not exist. Session 04's `OP-03` work has filed the mountain half
separately — its `Mountains.tsx` header names the request file.

**So please treat the write path as one ask covering both nouns**, not two. If
mountain requests get `request_mountain_access(company_id, mountain_id, note)`,
treks want the identical shape.

---

## 5. What I am asking for

Four things, in the order they block.

### 5.1 A trek catalogue this portal can read

Whatever `mountains` is, for treks. `getTreks()` beside `getMountains()`.
Minimum fields, all of which `icefall-web`'s `Trek` already has:
`id` (slug), `name`, `regionId`, `country`, `mountainIds`, `durationDays`,
`difficulty`, `maxAltitudeM`, `season`, `style`, `summary`.

**Please make `icefall-web/src/data/trekRecords.ts` the source and migrate it,
rather than re-keying 252 routes.** Session 02 owns that file (per
`requests/README.md`) and it is sourced work. Two hand-maintained trek lists
would drift within a week — they already have: the same route is
`everest-base-camp-trek` with `maxAltitudeM: 5545` in the web catalogue and
`"Everest Base Camp Trek — 12 Days"` with `maxAltitudeM: 5364` in this portal's
seed. Both are defensible (5,545 m is Kala Patthar, 5,364 m is base camp itself)
and nothing reconciles them, which is the whole problem.

### 5.2 `company_treks` — the access row

**MOVED. The proposed SQL now lives in `09-company-treks-migration.md` §1.2, with
the catalogue table in §1.1, the `company_may_edit_trek` predicate in §1.3 and
the RLS posture in §1.4.** It is not repeated here, because two copies of a
migration proposal is how the two copies come to disagree.

The ask is unchanged in substance: mirror `company_mountains` exactly — five
columns, permission and nothing else, a separate table rather than a merged
`company_destinations`, `authenticated` holding SELECT and no write of any kind.
`src/domain/authz.ts:canManageTrek` already mirrors the predicate one for one.

### 5.3 `products.trek_id`

Nullable, references `treks(id)`. So a trek product can point at the route it
sells, the way it points at a mountain today.

With that, `OP-04`'s three sub-asks fall out of the data instead of being typed:

- **difficulty "already there since doesn't change"** — read
  `Trek.difficulty` (a 4-value scale, not free text) and stop offering the field.
- **"highest point they don't make sense"** — read `Trek.maxAltitudeM`, whose
  comment already says *"Highest point ON THE ROUTE — never the summit of a
  mountain beside it"*. **This single field is also the fix for the safety
  finding in `TASKS-04-operator.md` point 3**: it is the per-route altitude that
  keeps an EBC trek at 5,364 m instead of Everest's 8,849 m. For treks the
  platform would then have the true number rather than an absence to declare.
- **"how many spots, their exact itinerary"** — stay company-authored on
  `Product`, unchanged. Those are genuinely the seller's.

Please also decide whether `products.mountain_id` should become optional for
`kind = 'trek'`. Today it is required, which is why a company could not list the
Camino de Santiago at all.

### 5.4 The request write path (shared with §4)

```
request_trek_access(company_id, trek_id, note)  ->  request row, pending
```

Same shape as the mountain one, whatever you settle on there. What it must do is
record **which route** was asked for and give the operator something to see
afterwards. Until it exists neither screen can honestly say a request was sent.

---

## 6. What is blocked, precisely

- **`OP-04` was BLOCKED-pending-schema when this was written. It no longer is,
  in the app.** Session 04 built the catalogue row, the access row, both reads,
  the predicate and the select-first request panel against the in-memory
  backend, so the flow works and can be seen on screen. **What is still pending
  is the LIVE SCHEMA** — `treks` and `company_treks` do not exist in the
  database, and the 19-route seed slice standing in for the catalogue must be
  deleted when they land. That is request 09.
- The parts of the owner's note that are NOT about the catalogue — bigger edit
  surface, real previews, spots and itinerary — belong to the trip editor and are
  `OP-03`'s work in `ProductEditor.tsx`, which another session owns this phase.
  They apply to trek products already and are not blocked by this.
- **`OP-03` ships without §5.4** because a mountain access row already exists to
  read; it is the request that cannot be delivered. `OP-04` has neither.

## 7. What I will do when it lands

Mirror the mountain chain, adding nothing new: `getTreks` on the backend,
`canManageTrek` / `manageableTrekIds` in `authz.ts` mirroring the SQL function
one for one, a select-first request panel identical to the mountain one, and a
trek product that reads difficulty and altitude from the catalogue row instead of
offering them as fields. No second mechanism.

— Session 04
