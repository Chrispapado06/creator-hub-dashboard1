/**
 * `npm run test:groups-roster-assumptions`.
 *
 * Structure plan §1.3 and slice S7: NOTHING IN GROUPS MAY ASSUME A USER IS
 * ALONE IN THEIR OWN GROUP.
 *
 * For most of this app's life a "group" was an `Expedition` saved on one phone.
 * Its member list only ever held the person holding the phone, so every screen
 * over it could take three shortcuts safely: read `useApp().expeditions` for
 * the group, read `LOCAL_ATHLETE_ID` for "the member", and draw the party's
 * MEAN readiness, which was that one person's own figure. All three become
 * wrong the moment a second person is in the group — the last one dangerously
 * so, because in a party of two an average is the other person's score with one
 * step of arithmetic over it.
 *
 * So this test reads the group modules as TEXT and fails if any of those three
 * reappear outside the handful of modules that are about a phone group on
 * purpose. It also holds the shape of slice S7 itself: one create form, at one
 * route, with every old link still arriving.
 *
 * WHAT IT CANNOT PROVE: that the screens render correctly. That is the browser,
 * and the screenshots in the slice note.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

let passed = 0;
const failures: string[] = [];
const test = (name: string, fn: () => void) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    console.log(`    ${err instanceof Error ? err.message : String(err)}`);
  }
};

const abs = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(abs(p), "utf8");
const there = (p: string) => existsSync(abs(p));

/** Every file under a directory, recursively. `[]` when it does not exist. */
function walk(dir: string): string[] {
  if (!there(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs(dir))) {
    const rel = join(dir, entry);
    if (statSync(abs(rel)).isDirectory()) out.push(...walk(rel));
    else out.push(rel);
  }
  return out;
}

/**
 * Code with its comments and its string literals removed.
 *
 * Both have to go before anything is matched. This file's own subject is
 * `expeditions`, several of the modules explain at length why they no longer
 * read it, and `/explore/expeditions` is a ROUTE that has nothing to do with
 * the state field. A prose mention of a name is not a use of it.
 */
function code(source: string): string {
  return noComments(source)
    .replace(/`(?:[^`\\]|\\.)*`/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

/**
 * Code with its comments removed and its strings LEFT ALONE.
 *
 * Used wherever the thing being checked is itself a string — a route path, a
 * module specifier, a navigation target. `code()` would have blanked exactly
 * the text under test.
 */
function noComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/* -------------------------------------------------------------------------- */
/* The modules under the rule                                                  */
/* -------------------------------------------------------------------------- */

/** The four group files that still live under `screens/explore`. */
const EXPLORE_GROUP_FILES = [
  "src/screens/explore/Groups.tsx",
  "src/screens/explore/GroupWorkspace.tsx",
  "src/screens/explore/GroupFeedSection.tsx",
  "src/screens/explore/groupChrome.tsx",
];

const GROUP_MODULES = [
  ...walk("src/groups"),
  ...walk("src/components/groups"),
  ...walk("src/screens/groups"),
  ...EXPLORE_GROUP_FILES,
].filter((p) => !p.endsWith(".test.ts") && !p.includes("/fixtures/"));

/**
 * A GROUP SAVED ON ONE PHONE IS STILL A REAL RECORD, and these modules are the
 * ones whose whole job is that record: reading it, offering the tap that moves
 * it to the account, showing it read-only, and deleting it. They are allowed to
 * read `expeditions` and `LOCAL_ATHLETE_ID`. Nothing else is, and nothing at all
 * may draw a party's mean readiness.
 */
const PHONE_GROUP_MODULES = new Set([
  "src/groups/local/deviceMove.ts",
  "src/groups/local/phoneGroups.ts",
  "src/groups/local/stateCleanup.ts",
  "src/groups/local/useGroupPeak.ts",
  "src/screens/groups/local/DeviceGroupSummary.tsx",
  "src/screens/groups/local/MoveToAccount.tsx",
  "src/screens/groups/sections/tab/DeviceGroupsSection.tsx",
]);

console.log("\nGroups — nothing assumes you are alone in your own group\n");

test("the module inventory was actually read", () => {
  assert.ok(GROUP_MODULES.length >= 14, `only ${GROUP_MODULES.length} group modules found`);
  for (const f of EXPLORE_GROUP_FILES) assert.ok(there(f), `${f} is missing`);
  for (const f of PHONE_GROUP_MODULES) {
    assert.ok(there(f), `${f} is missing — update PHONE_GROUP_MODULES`);
  }
});

/* -------------------------------------------------------------------------- */
/* 1. The three assumptions                                                    */
/* -------------------------------------------------------------------------- */

test("no group module draws a party's mean readiness", () => {
  for (const f of GROUP_MODULES) {
    assert.equal(
      /\bmeanReadiness\b|\bGROUP_READINESS_NOTE\b/.test(code(read(f))),
      false,
      `${f} reads a group mean — in a party of two that is the other member's score`,
    );
  }
});

test("meanReadiness and groupSummary are gone from the whole app", () => {
  for (const f of [...walk("src/network"), ...walk("src/social")]) {
    if (f.endsWith(".test.ts")) continue;
    const c = code(read(f));
    assert.equal(/\bmeanReadiness\b/.test(c), false, `${f} still has meanReadiness`);
    assert.equal(/\bgroupSummary\b/.test(c), false, `${f} still has groupSummary`);
  }
  const groups = read("src/network/groups.ts");
  for (const name of [
    "export function meanReadiness",
    "export function groupSummary",
    "export const GROUP_CHAT_NOTICE",
    "export const CHECKLIST_SHARING_NOTICE",
    "export const GROUP_READINESS_NOTE",
    "export const SHARE_FOOTER",
    "export const SHARE_LINK_UNAVAILABLE",
  ]) {
    assert.equal(groups.includes(name), false, `network/groups.ts still exports ${name}`);
  }
});

test("only the phone-group modules read this device's expeditions", () => {
  for (const f of GROUP_MODULES) {
    if (PHONE_GROUP_MODULES.has(f)) continue;
    if (f === "src/screens/explore/GroupWorkspace.tsx") continue; // its own test below
    const c = code(read(f));
    assert.equal(
      /\bexpeditions\b/.test(c),
      false,
      `${f} reads useApp().expeditions — a group on the account is not on this phone`,
    );
    assert.equal(/\bLOCAL_ATHLETE_ID\b/.test(c), false, `${f} reads LOCAL_ATHLETE_ID`);
  }
});

test("the dispatcher is the only part of GroupWorkspace.tsx that reads expeditions", () => {
  const src = read("src/screens/explore/GroupWorkspace.tsx");
  const start = src.indexOf("export default function GroupWorkspace()");
  assert.ok(start > 0, "the dispatcher is not where this test expects it");
  const end = src.indexOf("\n}", src.indexOf("return <NoGroupUnderThatLink />;", start));
  assert.ok(end > start, "the dispatcher does not end where this test expects it");

  const dispatcher = code(src.slice(start, end));
  assert.match(dispatcher, /const \{ expeditions \} = useApp\(\);/);

  // Everything else in the file is the SERVER group page, and it may not.
  const rest = code(src.slice(0, start) + src.slice(end));
  assert.equal(/\bexpeditions\b/.test(rest), false, "the server group page reads expeditions");
  assert.equal(/\buseApp\(\)/.test(rest), false, "the server group page reads AppState");
  assert.equal(/\bLOCAL_ATHLETE_ID\b/.test(rest), false);
});

/* -------------------------------------------------------------------------- */
/* 2. The retired screens (structure plan §2.5)                                */
/* -------------------------------------------------------------------------- */

test("the phone create screen, its card and the crew re-export are gone", () => {
  for (const f of [
    "src/screens/explore/CreateExpedition.tsx",
    "src/components/network/GroupCard.tsx",
    "src/screens/explore/Expeditions.tsx",
  ]) {
    assert.equal(there(f), false, `${f} still exists`);
  }
});

test("nothing imports them", () => {
  /* A lazy import is a string, so this reads the code with its strings intact
     and only its comments stripped — several files explain in prose where each
     of these went, and naming one in a comment is not importing it. This test
     file names all three, and is left out for that reason. */
  const all = [...walk("src")].filter(
    (p) => /\.tsx?$/.test(p) && p !== "src/groups/rosterAssumptions.test.ts",
  );
  for (const f of all) {
    const raw = noComments(read(f));
    for (const spec of [
      "@/screens/explore/CreateExpedition",
      "@/components/network/GroupCard",
      "@/screens/explore/Expeditions",
    ]) {
      assert.equal(raw.includes(spec), false, `${f} still imports ${spec}`);
    }
  }
});

test("AppState can read and delete a phone group, and cannot make one", () => {
  const c = code(read("src/state/AppState.tsx"));
  assert.equal(/\bcreateExpedition\b/.test(c), false, "createExpedition is still there");
  assert.equal(/\bleaveExpedition\b/.test(c), false, "leaveExpedition is still there");
  assert.match(c, /const deleteExpedition = useCallback/);
  assert.match(c, /const markExpeditionMoved = useCallback/);
});

/* -------------------------------------------------------------------------- */
/* 3. The two pieces that were moved OUT before the screen was deleted          */
/* -------------------------------------------------------------------------- */

test("useMemberReadiness moved to groups/readiness, whole", () => {
  assert.ok(there("src/groups/readiness.ts"));
  const src = read("src/groups/readiness.ts");
  assert.match(src, /export function useMemberReadiness\(peak: GroupPeak\): DerivedReadiness/);
  assert.match(src, /export interface DerivedReadiness/);
  // The withholding is the point of the hook: no elevation and no curated
  // record each give an absence, never a number.
  assert.match(src, /unavailable\("no-data"\)/);
  assert.match(src, /REFERENCE_NO_READINESS/);
  assert.match(src, /simulated/);
  assert.equal(
    /\bmeanReadiness\b/.test(code(src)),
    false,
    "the moved hook must stay one person's own figure",
  );
  assert.equal(
    code(read("src/screens/explore/GroupWorkspace.tsx")).includes("useMemberReadiness"),
    false,
    "it was copied rather than moved",
  );
});

test("Operators moved to components/groups, whole", () => {
  assert.ok(there("src/components/groups/Operators.tsx"));
  const src = read("src/components/groups/Operators.tsx");
  assert.match(src, /export function Operators\(\{ peak \}: \{ peak: GroupPeak \}\)/);
  assert.match(src, /operatorsFor\(\{ country: peak\.country, elevationM \}\)/);
  assert.match(src, /OPERATOR_DISCLAIMER/);
  assert.match(src, /DEMO_NOTICE/);
  // With no elevation there is no class of objective to filter by, and the
  // section says so instead of listing the whole directory under a heading.
  assert.match(src, /Nothing to filter by/);
  assert.equal(
    code(read("src/screens/explore/GroupWorkspace.tsx")).includes("function Operators"),
    false,
    "it was copied rather than moved",
  );
});

/* -------------------------------------------------------------------------- */
/* 4. ONE CREATE FORM, AT ONE ROUTE                                            */
/* -------------------------------------------------------------------------- */

test("/social/groups/new renders the server form, full-screen", () => {
  const app = read("src/App.tsx");
  assert.match(app, /<Route path="\/social\/groups\/new" element=\{<CreateGroupPage \/>\} \/>/);
  assert.match(
    app,
    /const CreateGroupPage = lazy\(\(\) => import\("@\/screens\/groups\/create\/CreateGroupPage"\)\)/,
  );

  const page = read("src/screens/groups/create/CreateGroupPage.tsx");
  assert.match(page, /import \{ CreateGroupCard, useGroupPrivacy \} from "@\/screens\/explore\/Groups"/);
  assert.match(page, /<ScreenHeader/);
  // The page owns the title and the way back, so the form's own heading row is
  // off — two headings over one form is two answers to "how do I leave this".
  assert.match(page, /titleRow=\{false\}/);
  assert.match(page, /back="\/social\?tab=groups"/);
  // `Rise` is the DIRECT child of `Stagger`; anything else sits at opacity 0.
  assert.match(page, /<Stagger[^>]*>\s*<Rise>/);
});

test("?create=1 redirects to that route and does not open a second form", () => {
  const groups = noComments(read("src/screens/explore/Groups.tsx"));
  assert.match(groups, /params\.get\("create"\) === "1"/);
  assert.match(groups, /navigate\("\/social\/groups\/new", \{ replace: true \}\)/);
  // The inline flow is gone: no `creating` state, no second copy of the form.
  assert.equal(/setCreating\(/.test(groups), false, "the inline create flow is still wired");
  assert.equal(/const \[creating, setCreating\]/.test(groups), false);
});

test("every door leads to the one form", () => {
  // Social's + on the Groups tab.
  const social = noComments(read("src/screens/social/Social.tsx"));
  assert.match(social, /navigate\("\/social\/groups\/new"\)/);
  assert.equal(
    /setParams\(\{ tab: "groups", create: "1" \}\)/.test(social),
    false,
    "the + still sets the old param",
  );

  // The pill under the groups list is a link, not a switch on that screen.
  const groups = read("src/screens/explore/Groups.tsx");
  const pill = groups.slice(groups.indexOf('{/* ---- Create ---'));
  assert.match(pill.slice(0, 900), /<Link\s+to="\/social\/groups\/new"/);

  // People's empty state.
  assert.match(read("src/screens/explore/People.tsx"), /to="\/social\/groups\/new"/);
});

test("the create form is what the route gets: the server one, not a phone one", () => {
  const groups = read("src/screens/explore/Groups.tsx");
  const create = groups.slice(
    groups.indexOf("export function CreateGroupCard"),
    groups.indexOf("/* ---- The form ---"),
  );
  // It writes a row in `public.groups` through the shared actions hook.
  assert.match(create, /useGroupActions\(\)/);
  assert.match(create, /useGroupDestinations\(\)/);
  // And it never writes one to this device.
  assert.equal(/\bcreateExpedition\b/.test(code(create)), false);
});

/* -------------------------------------------------------------------------- */
/* 5. OLD LINKS STILL WORK (the brief's standing rule)                          */
/* -------------------------------------------------------------------------- */

test("the five legacy routes are all still declared", () => {
  const app = read("src/App.tsx");
  assert.match(app, /path="\/explore\/groups"/);
  assert.match(app, /path="\/explore\/groups\/new"/);
  assert.match(app, /path="\/explore\/groups\/:id"/);
  assert.match(app, /path="\/explore\/crew"/);
  assert.match(app, /path="\/explore\/crew\/new"/);
  // Both `/new` twins land on the one create form.
  const news = app.match(/<LegacySocialRedirect to="\/social\/groups\/new" \/>/g) ?? [];
  assert.equal(news.length, 2, `${news.length} legacy /new redirects, expected 2`);
  // And every redirect carries the search string, or `?create=1` is dropped.
  assert.match(app, /function LegacySocialRedirect[\s\S]*?\$\{to\}\$\{search\}/);
  assert.match(app, /function SocialTabRedirect[\s\S]*?const \{ search \} = useLocation\(\)/);
});

test("a phone group's own link still resolves, moved or not", () => {
  const src = noComments(read("src/screens/explore/GroupWorkspace.tsx"));
  assert.match(src, /hasMoved\(group\)/);
  assert.match(src, /<Navigate to=\{`\/social\/groups\/\$\{group\.movedTo\}`\} replace \/>/);
  assert.match(src, /<DeviceGroupSummary key=\{group\.id\} expedition=\{group\} \/>/);
  assert.match(src, /NoGroupUnderThatLink/);
});

/* -------------------------------------------------------------------------- */
/* 6. Standing checks for every group slice                                    */
/* -------------------------------------------------------------------------- */

test("no hex colour anywhere in the group files", () => {
  for (const f of [...walk("src/groups"), ...walk("src/components/groups"), ...walk("src/screens/groups")]) {
    const hits = read(f).match(/#[0-9a-fA-F]{3,8}\b/g);
    assert.equal(hits, null, `${f} has a hex colour: ${hits?.join(", ")}`);
  }
});

test("the retired screens left no dangling route or lazy import", () => {
  const app = code(read("src/App.tsx"));
  assert.equal(/\bCreateExpedition\b/.test(app), false);
  assert.equal(/\bCrewExpeditions\b/.test(app), false);
});

/* -------------------------------------------------------------------------- */

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
