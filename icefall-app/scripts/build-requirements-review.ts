/**
 * BUILDS THE GUIDE REVIEW SHEET.
 *
 *   npm run requirements:sheet   →   docs/requirements-review.md
 *
 * One file, one section per curated mountain: what ICEFALL currently tells
 * people about that objective, printed exactly as it ships, beside the empty
 * structured fields a certified guide fills in.
 *
 * IT IS GENERATED, NOT WRITTEN. The prose is read off `data/mock/mountains.ts`
 * at build time, so the sheet cannot quietly disagree with what the app shows —
 * regenerate it whenever a mountain page's requirements change, and the guide
 * is always reviewing the live copy.
 *
 * It writes MARKDOWN because the reader is a mountain guide, not a program. The
 * answers come back as prose in this file's tables and are transcribed into
 * `data/mock/mountainRequirements.ts` by hand, by someone who then has to make
 * `requirements.test.ts` pass — which is the point at which a half-finished
 * review gets caught.
 */
import { MOUNTAINS } from "@/data/mock/mountains";
import { requirementSetFor } from "@/data/mock/mountainRequirements";
import { ATHLETE_SKILLS, GRADE_SCALE_LABEL } from "@/objectives/requirements";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUT = resolve(process.cwd(), "docs/requirements-review.md");

const bullets = (items: string[]) =>
  items.length > 0 ? items.map((i) => `- ${i}`).join("\n") : "_(none recorded)_";

function header(): string {
  const skills = ATHLETE_SKILLS.map((s) => `| \`${s.id}\` | ${s.label} |`).join("\n");
  const scales = Object.entries(GRADE_SCALE_LABEL)
    .map(([id, label]) => `| \`${id}\` | ${label} |`)
    .join("\n");

  return `# ICEFALL — objective requirements, for review

**What this is.** ICEFALL currently judges how ready somebody is for a mountain
from its **elevation alone**. Every 4,478 m peak on earth is given the same
requirements as the Matterhorn, because elevation is the only thing the app
knows how to compare against. The written requirements on each mountain page —
reproduced below, unedited — are display text: nothing reads them.

**What we are asking for.** Turn those sentences into figures the app can check
a person against. Once two or more certified guides have signed a mountain's
sheet, ICEFALL stops using the elevation band for that mountain and compares
against what you wrote instead. Until then it keeps using the band **and says
so on the screen**.

**What we are not asking for.** Nothing here is a route description or a
guarantee. The app never tells anyone they are ready to climb; it tells them
which of your lines its record of them does and does not reach, and it says on
every screen that the assessment that counts is made in person by you.

---

## How to fill a section in

Each mountain below has a table with one row per requirement. Add as many rows
as the objective needs and delete the rest. Every row needs all six columns.

| Column | What goes in it |
|---|---|
| **Kind** | One of the eight kinds in the next table. |
| **Figure** | The number or value, in that kind's unit. |
| **Required / recommended** | \`required\` means falling short of it stops the objective. If everything is \`required\`, the field stops meaning anything — please choose. |
| **Why** | One sentence: why this mountain asks for it. It is shown to the athlete beside your figure. |
| **Source** | Where the figure comes from: your own judgement, an operator's published prerequisites, a named guidebook, or a permit authority. Name it. |
| **Notes** | Anything we should know — seasonal caveats, "this is for the normal route only", a figure you are uneasy about. |

### The eight kinds

| Kind | Unit | What it means | Can ICEFALL check it today? |
|---|---|---|---|
| \`skill\` | one of the competences below | A competence the climber must hold. | Yes — against what they have told us. Self-declared, and always labelled as such. |
| \`altitude-reached\` | metres | The climber must already have been this high. | Yes — from recorded sessions, marked summits, or their own answer. |
| \`single-day-ascent\` | metres | A single day of this much ascent, demonstrated in training. | Yes — from recorded activity. |
| \`single-day-duration\` | hours | This many hours on the move in one day. | Yes — from recorded activity. |
| \`weekly-ascent\` | metres per week | Weekly ascent held across a build. | Yes — from recorded activity. |
| \`prior-summits\` | a count, plus a height | e.g. two prior summits at or above 4,000 m. | Yes — but only summits the climber has marked in the app. |
| \`technical-grade\` | a grade, plus its scale | e.g. AD overall, or UIAA IV. | **No.** ICEFALL holds no record of what anyone has climbed or led, and will not guess from training. It will show your grade and say it cannot check it. Please still write it down. |
| \`certification\` | the name of a course or qualification | e.g. a glacier travel and crevasse rescue course. | **Not yet.** Certificate upload is planned. Until then ICEFALL shows it and says it cannot check it. |

### The competences a climber can claim

These are the exact tiles somebody taps when they set up the app. A \`skill\` row
must name one of these ids — anything else could never be matched, so please
tell us if the competence you need is missing rather than approximating it.

| id | What the climber sees |
|---|---|
${skills}

### Grade scales

| id | Scale |
|---|---|
${scales}

---

## Signing a mountain off

At the bottom of each section:

- **Reviewers** — at least two, with your full name, your certification as
  awarded (e.g. "IFMGA/UIAGM Mountain Guide"), and the body that awarded it.
  A licence number if you give one. ICEFALL shows these names beside the
  requirements: an athlete is entitled to know who set the bar.
- **Date** — the day you reviewed it.
- **Scope** — what exactly you are signing. "Hörnli ridge, summer conditions"
  is a scope; "the Matterhorn" is not. The app shows this too.

A mountain you are **not** willing to put figures on is a valid answer. Sign it
off with an empty table and say why in the notes; ICEFALL will keep using the
elevation band and keep saying so.

---
`;
}

function section(mountainId: string): string {
  const m = MOUNTAINS.find((x) => x.id === mountainId);
  if (!m) return "";
  const set = requirementSetFor(m);
  const reviewLine = set && !set.review.reviewed ? set.review.awaiting : "Reviewed.";

  const routes = m.routes
    .map(
      (r) =>
        `| ${r.name} | ${r.gradeLabel} | ${r.elevationGainM.toLocaleString("en-GB")} m | ${r.distanceKm} km | ${r.durationLabel} |`,
    )
    .join("\n");

  return `
## ${m.name} — ${m.elevationM.toLocaleString("en-GB")} m

\`${m.id}\` · ${m.range} · ${m.country} · ${m.difficultyLabel} · typically ${m.typicalDurationLabel}${
    m.permitIssuedToOperator ? " · permit issued to an operator, not to a person" : ""
  }${m.requiresProfessionalSupport ? " · ICEFALL marks this as needing a certified guide or operator" : ""}

**Status:** ${reviewLine}

### Routes ICEFALL holds

| Route | Grade as written | Ascent | Distance | Duration |
|---|---|---|---|---|
${routes}

### What ICEFALL currently says — unedited, for your correction

**Technical requirements**

${bullets(m.technicalRequirements)}

**Required experience**

> ${m.requiredExperience}

**Training requirements**

${bullets(m.trainingRequirements)}

### Structured requirements — to fill in

| Kind | Figure | Required / recommended | Why | Source | Notes |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

**Does the prose above need correcting?**

>

### Sign-off

| Reviewer | Certification as awarded | Awarded by | Licence no. |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |

- **Date reviewed:**
- **Scope of this review:**

---
`;
}

function main() {
  const body = MOUNTAINS.map((m) => section(m.id)).join("");
  const sheet = `${header()}${body}
_Generated by \`npm run requirements:sheet\` from \`src/data/mock/mountains.ts\`. ${MOUNTAINS.length} objectives. Regenerate rather than editing the prose here — this file is a copy, the app is the original._
`;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, sheet, "utf8");
  console.log(`Wrote ${OUT} — ${MOUNTAINS.length} objectives, none reviewed.`);
}

main();

export {};
