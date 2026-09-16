/**
 * `npm run test:groups-discover-client`.
 *
 * Structure plan D13, for the OTHER optional select — the one that draws the
 * Discover list on the Groups tab and the group rows in Search.
 *
 * WHY THIS FILE EXISTS. `social/groupSpace.ts` asks for the columns file 3 adds
 * and retries without them, and `groupRoster.test.ts` proves both halves. This
 * module does the same thing for the LIST, and for a whole slice its retry
 * could not fire: `classify` knew `PGRST205` and `42P01` but not `42703`, so a
 * missing column fell through to "refused" and every signed-in reader on a
 * server without file 3 was told the shared list is not live — about a list
 * that plainly is. A typecheck cannot see that, and no test covered this file
 * at all, so it shipped. These are the four things it could not see:
 *
 *   1. THAT THE RETRY FIRES for a column or an embed the server has not got,
 *      and that the second ask is the columns today's server can answer.
 *   2. THAT IT DOES NOT FIRE for anything else. Asking a server with no such
 *      table twice buys a round trip and the same answer.
 *   3. THAT "NOT LIVE" IS ONLY SAID WHEN IT IS TRUE, and never in place of a
 *      list that came back.
 *   4. THAT A PLACE IS ONLY EVER NAMED WHERE ITS NAME CAME BACK. Nothing is
 *      built from the slug, and a trek is never called a mountain.
 *
 * There is no network and no Supabase client: `selectGroups` takes a way of
 * asking, and every answer below is one this file wrote.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { PostgrestError } from "@supabase/supabase-js";

import {
  GROUP_COLUMNS,
  GROUP_COLUMNS_WITH_SUBJECT,
  selectGroups,
  type GroupsAnswer,
} from "@/network/interest";

let passed = 0;
const failures: string[] = [];
const tests: { name: string; fn: () => Promise<void> | void }[] = [];
const test = (name: string, fn: () => Promise<void> | void) => {
  tests.push({ name, fn });
};

const readSrc = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/** A PostgREST error, as the client hands one back. */
const err = (code: string, message = "refused"): PostgrestError =>
  ({ code, message, details: "", hint: "" }) as PostgrestError;

/** A row as today's server answers: the base columns and nothing else. */
const baseRow = (over: Record<string, unknown> = {}) => ({
  id: "g-1",
  destination_id: "mont-blanc",
  name: "June push",
  intended_on: "2027-06-02",
  created_at: "2026-09-01T00:00:00.000Z",
  member_count: 4,
  joined_by_me: true,
  ...over,
});

/** The same row from a server with file 3 applied and the embed served. */
const fullRow = (over: Record<string, unknown> = {}) =>
  baseRow({
    topic: null,
    destinations: { name: "Mont Blanc", kind: "mountain" },
    ...over,
  });

/**
 * A server, as a way of asking it. Every call is recorded, because the number
 * of round trips is half of what is being proved here.
 */
function server(answer: (columns: string) => GroupsAnswer) {
  const asked: string[] = [];
  return {
    asked,
    ask: (columns: string) => {
      asked.push(columns);
      return Promise.resolve(answer(columns));
    },
  };
}

/** A server with file 3 applied: it answers whatever it is asked. */
const migrated = (rows: Record<string, unknown>[]) => server(() => ({ data: rows, error: null }));

/**
 * TODAY'S SERVER. It has `groups` and it has not got `topic`, so the first ask
 * fails exactly as PostgREST fails it — the whole select, on one column.
 */
const beforeFileThree = (rows: Record<string, unknown>[], code = "42703") =>
  server((columns) =>
    columns === GROUP_COLUMNS
      ? { data: rows, error: null }
      : { data: null, error: err(code, 'column groups.topic does not exist') },
  );

console.log("\nGroups discover — the list survives a server without file 3\n");

/* -------------------------------------------------------------------------- */
/* 1. The two selects                                                          */
/* -------------------------------------------------------------------------- */

test("the subject select is the base select plus the subject and the place", () => {
  assert.equal(GROUP_COLUMNS_WITH_SUBJECT, `${GROUP_COLUMNS}, topic, destinations(name, kind)`);
  assert.equal(GROUP_COLUMNS.includes("topic"), false);
  assert.equal(GROUP_COLUMNS.includes("destinations("), false);
});

test("the base select still asks for the count by name, so a missing one is a fault", () => {
  // A count that quietly did not arrive would be drawn as nothing; a count
  // this select asked for and did not get is a bug, which is the point.
  for (const column of ["member_count", "joined_by_me", "destination_id", "intended_on"]) {
    assert.ok(GROUP_COLUMNS.includes(column), `${column} is not in the base select`);
  }
});

/* -------------------------------------------------------------------------- */
/* 2. A server that has everything                                             */
/* -------------------------------------------------------------------------- */

test("one ask, and the list comes back with its subject and its place", async () => {
  const s = migrated([fullRow({ topic: null }), fullRow({ id: "g-2", destination_id: null, destinations: null, topic: "Women who climb" })]);
  const state = await selectGroups(s.ask);
  assert.equal(s.asked.length, 1, "a migrated server was asked twice");
  assert.equal(s.asked[0], GROUP_COLUMNS_WITH_SUBJECT);
  assert.equal(state.status, "ready");
  if (state.status !== "ready") return;
  assert.equal(state.groups.length, 2);
  assert.equal(state.groups[0].destination?.name, "Mont Blanc");
  assert.equal(state.groups[0].destination?.kind, "mountain");
  assert.equal(state.groups[0].topic, null);
  assert.equal(state.groups[1].destinationId, null);
  assert.equal(state.groups[1].destination, null);
  assert.equal(state.groups[1].topic, "Women who climb");
});

test("a trek comes back as a trek, never as a mountain", async () => {
  const s = migrated([
    fullRow({
      destination_id: "tour-du-mont-blanc",
      destinations: { name: "Tour du Mont Blanc", kind: "trek" },
    }),
  ]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status, "ready");
  if (state.status !== "ready") return;
  assert.equal(state.groups[0].destination?.name, "Tour du Mont Blanc");
  assert.equal(state.groups[0].destination?.kind, "trek");
});

test("an embed handed back as an array is the same row", async () => {
  const s = migrated([fullRow({ destinations: [{ name: "Mont Blanc", kind: "mountain" }] })]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status === "ready" && state.groups[0].destination?.name, "Mont Blanc");
});

test("a kind outside the catalogue's own two words is not an answer", async () => {
  const s = migrated([fullRow({ destinations: { name: "Somewhere", kind: "volcano" } })]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status === "ready" && state.groups[0].destination?.kind, null);
  assert.equal(state.status === "ready" && state.groups[0].destination?.name, "Somewhere");
});

test("a place with no name is no place at all — the slug is never made into one", async () => {
  const s = migrated([fullRow({ destinations: { kind: "mountain" } })]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status === "ready" && state.groups[0].destination, null);
  assert.equal(state.status === "ready" && state.groups[0].destinationId, "mont-blanc");
});

/* -------------------------------------------------------------------------- */
/* 3. A server without file 3 — the failure this file was written for          */
/* -------------------------------------------------------------------------- */

test("a missing column is asked around, and the list is drawn", async () => {
  const s = beforeFileThree([baseRow(), baseRow({ id: "g-2", name: "Autumn attempt" })]);
  const state = await selectGroups(s.ask);
  assert.deepEqual(s.asked, [GROUP_COLUMNS_WITH_SUBJECT, GROUP_COLUMNS]);
  assert.equal(state.status, "ready", "the Discover list reported a failure instead of listing");
  if (state.status !== "ready") return;
  assert.equal(state.groups.length, 2);
  assert.equal(state.groups[0].name, "June push");
  assert.equal(state.groups[0].memberCount, 4);
  assert.equal(state.groups[0].intendedOn, "2027-06-02");
});

test("and nothing the second ask did not ask for is claimed", async () => {
  const s = beforeFileThree([baseRow()]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status === "ready" && state.groups[0].topic, null);
  assert.equal(state.status === "ready" && state.groups[0].destination, null);
  // The slug still came back, so the screen can still look for its own record.
  assert.equal(state.status === "ready" && state.groups[0].destinationId, "mont-blanc");
});

test("PGRST204 is the same absence and is asked around too", async () => {
  const s = beforeFileThree([baseRow()], "PGRST204");
  const state = await selectGroups(s.ask);
  assert.equal(s.asked.length, 2);
  assert.equal(state.status, "ready");
});

test("an embed this server will not resolve is asked around, not reported", async () => {
  // PGRST200 is "could not find a relationship". The foreign key is there
  // today, and this list must not be the thing that goes down if it is not.
  const s = beforeFileThree([baseRow()], "PGRST200");
  const state = await selectGroups(s.ask);
  assert.deepEqual(s.asked, [GROUP_COLUMNS_WITH_SUBJECT, GROUP_COLUMNS]);
  assert.equal(state.status, "ready");
});

/* -------------------------------------------------------------------------- */
/* 4. The absences that are real                                               */
/* -------------------------------------------------------------------------- */

test("no such table is said once, and not asked twice", async () => {
  for (const code of ["PGRST205", "42P01"]) {
    const s = server(() => ({ data: null, error: err(code, "no such table") }));
    const state = await selectGroups(s.ask);
    assert.equal(state.status, "not-provisioned");
    assert.equal(s.asked.length, 1, `${code} was asked around, which cannot help`);
  }
});

test("a refusal is not asked around either — asking again cannot produce a grant", async () => {
  /*
   * 42501 is a missing grant or an expired session. It is not retried, which is
   * what this asserts. What a reader is TOLD about it is another matter:
   * `SharedGroups` has no `refused` status, so it collapses into
   * "not-provisioned" here where `groupSpace.ts` keeps the two apart. That is
   * older than this slice and is in the report for the owner rather than
   * asserted as right.
   */
  const s = server(() => ({ data: null, error: err("42501", "permission denied") }));
  await selectGroups(s.ask);
  assert.equal(s.asked.length, 1);
});

test("a failed request is never an empty list", async () => {
  const s = server(() => ({ data: null, error: err("", "TypeError: failed to fetch") }));
  const state = await selectGroups(s.ask);
  assert.equal(state.status, "unreachable");
});

test("a broken row is dropped rather than drawn as a nameless group", async () => {
  const s = migrated([fullRow({ name: null }), fullRow({ id: "g-2" }), fullRow({ id: null })]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status === "ready" && state.groups.length, 1);
  assert.equal(state.status === "ready" && state.groups[0].id, "g-2");
});

test("a count that did not come back is null, and never a zero", async () => {
  const s = migrated([fullRow({ member_count: null })]);
  const state = await selectGroups(s.ask);
  assert.equal(state.status === "ready" && state.groups[0].memberCount, null);
});

/* -------------------------------------------------------------------------- */
/* 5. What the screen says about a place it cannot draw                        */
/* -------------------------------------------------------------------------- */

test("Discover no longer calls an unknown place a mountain", () => {
  const src = readSrc("src/screens/explore/Groups.tsx");
  assert.equal(
    /Not a mountain this build carries/.test(src),
    false,
    "the list still claims a group is about a mountain on a read that cannot know",
  );
  // The catalogue's own name, where the read has it.
  assert.match(src, /function aboutPlace\(place: GroupPlace\): string/);
  assert.match(src, /place\.kind === "trek"/);
});

test("the group page reads the place, not only the peak", () => {
  const src = readSrc("src/screens/explore/GroupWorkspace.tsx");
  const sentence = "The place's record did not come back with this group";
  const occurrences = src.split(sentence).length - 1;
  assert.equal(occurrences, 2, "the unresolved-record sentence moved — re-check its guards");
  // Every one of them is behind "nothing resolved at all", so a trek — which
  // resolves into `destination` and never into `mountain` — cannot reach it.
  assert.match(src, /!mountain && destination === null && group\.destinationId !== null/);
  const details = src.slice(src.indexOf("function GroupDetails"));
  assert.match(details.slice(0, details.indexOf(sentence)), /\) : destination \? \(/);
  assert.match(details, /const destination = group\.destination;/);
});

/* -------------------------------------------------------------------------- */

const run = async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failures.push(name);
      console.log(`  ✗ ${name}`);
      console.log(`    ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    for (const f of failures) console.log(`  - ${f}`);
    process.exitCode = 1;
  }
};

void run();
