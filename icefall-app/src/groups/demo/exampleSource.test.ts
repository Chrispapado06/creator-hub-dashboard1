/**
 * `npm run test:groups-demo-source`.
 *
 * Structure plan §3.3 and slice S2. The script bundles and runs this file twice:
 * once as a production bundle (no demo flag), and once with
 * `VITE_ICEFALL_DEMO: "1"`, the flag the shared demo on 5210 is built with.
 *
 * WHAT IS PROVEN
 *   1. Without `DEMO` there are no examples, no id is an example id, and the
 *      reads and writes go to the server path as before.
 *   2. With `DEMO`, every group, member, post and message says "Example", sits
 *      on a real mountain in both the app and the server catalogue, and uses no
 *      name, figure or text from the owner's mockups (redesign plan §7).
 *   3. Examples are read through the real seams (`GroupSpaceSource` and
 *      `GroupFeedSource`) and keep the members-only doors.
 *   4. Every write on an example is refused with "Examples can't be changed.",
 *      and nothing touches storage.
 *   5. The old demo modules are gone, and the old seeded id prefix appears only
 *      in the S1 clean-up and its test.
 *
 * WHAT IS NOT PROVEN: that the screens draw these answers, and that a non-demo
 * `vite build` carries no example literal. Both are checked by hand in S2 (the
 * headless run on 5210, and a grep over `dist/assets` from a scratchpad build).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  EXAMPLE_GROUPS,
  EXAMPLE_GROUP_NOTE,
  EXAMPLE_LABEL,
  EXAMPLE_READ_ONLY,
  exampleFeedSource,
  exampleGroupById,
  exampleRefusal,
  isExampleGroupId,
} from "@/groups/demo/exampleSource";
import {
  EXAMPLE_SPACE_SOURCE,
  MESSAGES_MEMBERS_ONLY,
  ROSTER_MEMBERS_ONLY,
  countOrganisedGroups,
  sourceForGroup,
} from "@/social/groupSpace";
import {
  POSTS_MEMBERS_ONLY,
  composeGroupPost,
  postToGroup,
  readGroupFeed,
} from "@/social/groupPosts";
import { canNameAnAccount } from "@/social/publicProfile";
import { MOUNTAINS } from "@/data/mock/mountains";
import { DEMO } from "@/offline/offline";

const DEMO_RUN = import.meta.env.VITE_ICEFALL_DEMO === "1";
const MONT_BLANC = "example-group-mont-blanc";
const UUID = "3f2b8a1e-6c4d-4e8f-9a0b-1c2d3e4f5a6b";

let passed = 0;
const failures: string[] = [];
const pending: Promise<void>[] = [];
const test = (name: string, fn: () => void | Promise<void>) => {
  const run = async () => {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failures.push(name);
      console.log(`  ✗ ${name}`);
      console.log(`    ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  pending.push(pending.length === 0 ? run() : pending[pending.length - 1].then(run));
};

const readSrc = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/* A storage stand-in that records every write, so "nothing is stored" is measured. */
const writes: string[] = [];
const recordingStorage = {
  getItem: () => null,
  setItem: (k: string) => void writes.push(k),
  removeItem: (k: string) => void writes.push(`remove:${k}`),
  clear: () => void writes.push("clear"),
  key: () => null,
  length: 0,
};
for (const key of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, key, { value: recordingStorage, configurable: true, writable: true });
}

console.log(`\nGroups example source — demo flag ${DEMO_RUN ? "ON" : "OFF"}\n`);

/* -------------------------------------------------------------------------- */
/* 1. The flag                                                                 */
/* -------------------------------------------------------------------------- */

test("examples exist exactly when DEMO is on", () => {
  assert.equal(DEMO, DEMO_RUN);
  assert.equal(EXAMPLE_GROUPS.length > 0, DEMO);
});

test("the builder gates on both demo flags inline, not through a shared constant", () => {
  const src = readSrc("src/groups/demo/exampleSource.ts");
  const builder = src.slice(src.indexOf("function buildExampleGroups"));
  const gate = builder.slice(0, builder.indexOf("return [];"));
  assert.match(gate, /import\.meta\.env\.VITE_ICEFALL_OFFLINE !== "1"/);
  assert.match(gate, /import\.meta\.env\.VITE_ICEFALL_DEMO !== "1"/);
  assert.equal(/from "@\/offline\/offline"|from "@\/lib\/demoFlag"/.test(src), false);
});

if (!DEMO_RUN) {
  test("without DEMO no id is an example and nothing is refused as one", () => {
    assert.equal(isExampleGroupId(MONT_BLANC), false);
    assert.equal(exampleGroupById(MONT_BLANC), null);
    assert.equal(exampleRefusal(MONT_BLANC), null);
    assert.notEqual(sourceForGroup(MONT_BLANC), EXAMPLE_SPACE_SOURCE);
  });

  test("without DEMO an example id reads through the server path (no client here)", async () => {
    const feed = await readGroupFeed(MONT_BLANC);
    assert.equal(feed.status, "no-backend");
    const post = await postToGroup({ groupId: MONT_BLANC, body: "words" });
    assert.equal(post.ok, false);
    assert.notEqual(!post.ok && post.message, EXAMPLE_READ_ONLY);
    const group = await sourceForGroup(MONT_BLANC).readGroup(MONT_BLANC);
    assert.equal(group.status, "no-backend");
  });
}

/* -------------------------------------------------------------------------- */
/* 2. Every record is labelled, real-mountain, and free of mockup content       */
/* -------------------------------------------------------------------------- */

if (DEMO_RUN) {
  test("every group, member, post and message says Example", () => {
    assert.equal(EXAMPLE_LABEL, "Example");
    assert.ok(EXAMPLE_GROUPS.length >= 2);
    for (const ex of EXAMPLE_GROUPS) {
      assert.match(ex.group.name, /\bExample\b/, ex.group.name);
      assert.ok(ex.group.id.startsWith("example-group-"), ex.group.id);
      assert.ok(ex.members.length > 0);
      assert.equal(ex.group.memberCount, ex.members.length);
      for (const m of ex.members) assert.match(m.name ?? "", /^Example\b/, String(m.name));
      for (const p of ex.posts) {
        assert.match(p.body, /^Example\b/, p.body);
        assert.match(p.author.display_name, /^Example\b/);
        assert.equal(p.group_id, ex.group.id);
      }
      for (const msg of ex.messages) assert.match(msg.body ?? "", /^Example\b/, String(msg.body));
    }
    assert.match(EXAMPLE_GROUP_NOTE, /example/i);
  });

  test("ids cannot name a real account or a real post", () => {
    for (const ex of EXAMPLE_GROUPS) {
      assert.equal(ex.group.foundedByMe, false);
      for (const m of ex.members) assert.equal(canNameAnAccount(m.profileId), false, m.profileId);
      for (const p of ex.posts) assert.equal(canNameAnAccount(p.id), false, p.id);
      for (const msg of ex.messages) assert.equal(msg.mine, false);
    }
  });

  test("each example sits on a real mountain in the app and on the server catalogue", () => {
    const catalogue = readSrc("../icefall-supabase/seed/catalogue.sql");
    for (const ex of EXAMPLE_GROUPS) {
      const app = MOUNTAINS.find((m) => m.id === ex.group.destinationId);
      assert.ok(app, `app has ${ex.group.destinationId}`);
      assert.equal(ex.group.mountain?.name, app.name);
      assert.equal(ex.group.mountain?.elevationM, app.elevationM);
      const row = new RegExp(
        `\\('${ex.group.destinationId}', '[^']+', 'mountain',[^\\n]*, (\\d+)\\)`,
      ).exec(catalogue);
      assert.ok(row, `server catalogue has mountain ${ex.group.destinationId}`);
      assert.equal(Number(row[1]), app.elevationM);
      // Dates are left unset rather than invented.
      assert.equal(ex.group.intendedOn, null);
    }
  });

  test("no name, figure or text from the owner's mockups (redesign plan §7)", () => {
    const text = JSON.stringify(EXAMPLE_GROUPS) + EXAMPLE_GROUP_NOTE + EXAMPLE_READ_ONLY;
    const names = ["Alex", "Sophie", "Ecrins", "Diego", "Delso", "Kimon", "Berlin"];
    for (const n of names) {
      assert.equal(new RegExp(`\\b${n}\\b`, "i").test(text), false, `contains ${n}`);
    }
    const phrases = [
      "Mont Blanc Team", "Alpine Women", "4,810", "4810", "1 of 4", "spots",
      "16–23 Jun", "16-23 Jun", "Jun 2027", "12.4 km", "1,840", "6:32", "3,800", "3,900",
      "3,000", "3,842", "£", "[price]", "Wikimedia", "Looks good", "we can go",
      "conditions report", "Great photo", "Route and permits", "Hut booked",
      "Good conditions", "Firm snow", "Crevasses", "Patchy snow", "Snowline",
      "microspikes", "Aiguille du Midi", "Cosmiques", "Chamonix", "Long alpine day",
      "Best boots", "mixed terrain", "rope length", "50 m", "60 m", "70 m",
      "Partner for Mont Blanc", "partners, intermediate", "Petzl", "Summit Evo",
      "Good condition", "via Goûter", "Goûter", "Clear morning", "Welcome to",
      "learn and climb", "Incredible day", "Windy on the ridge", "Aug 2027",
      "Jul 2027", "Mont Blanc Objectives", "Ama Dablam", "Denali",
    ];
    for (const p of phrases) {
      assert.equal(text.toLowerCase().includes(p.toLowerCase()), false, `contains "${p}"`);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* 3. Read through the real seams                                            */
  /* ------------------------------------------------------------------------ */

  test("an example id is answered by the example source; any other id is not", () => {
    for (const ex of EXAMPLE_GROUPS) {
      assert.equal(isExampleGroupId(ex.group.id), true);
      assert.equal(sourceForGroup(ex.group.id), EXAMPLE_SPACE_SOURCE);
    }
    // The old seeded id is built, not written, so this file stays out of the grep below.
    const oldSeeded = `${"demo"}-group-mont-blanc`;
    for (const id of [UUID, "expedition-1726000000000", "example-group-other", oldSeeded]) {
      assert.equal(isExampleGroupId(id), false, id);
      assert.notEqual(sourceForGroup(id), EXAMPLE_SPACE_SOURCE, id);
    }
  });

  test("group, roster and messages read as a member and as a non-member", async () => {
    for (const ex of EXAMPLE_GROUPS) {
      const src = sourceForGroup(ex.group.id);
      const group = await src.readGroup(ex.group.id);
      assert.equal(group.status, "ready");
      assert.ok(group.status === "ready" && group.membership === ex.membership);

      const roster = await src.readRoster(ex.group.id);
      const messages = await src.readMessages(ex.group.id);
      if (ex.membership === "member") {
        assert.ok(roster.status === "ready" && roster.members.length === ex.members.length);
        assert.ok(roster.status === "ready" && roster.requests.length === 0);
        assert.ok(messages.status === "ready" && messages.messages.length === ex.messages.length);
      } else {
        assert.deepEqual(roster, { status: "members-only", message: ROSTER_MEMBERS_ONLY });
        assert.deepEqual(messages, { status: "members-only", message: MESSAGES_MEMBERS_ONLY });
      }
    }
    const missing = await EXAMPLE_SPACE_SOURCE.readGroup(UUID);
    assert.equal(missing.status, "not-found");
  });

  test("a read hands back copies, so a screen cannot change the examples", async () => {
    const first = await sourceForGroup(MONT_BLANC).readGroup(MONT_BLANC);
    assert.ok(first.status === "ready");
    first.group.name = "changed";
    const second = await sourceForGroup(MONT_BLANC).readGroup(MONT_BLANC);
    assert.ok(second.status === "ready" && second.group.name !== "changed");
  });

  test("the feed reads examples through readGroupFeedFrom, with the members-only door", async () => {
    for (const ex of EXAMPLE_GROUPS) {
      const feed = await readGroupFeed(ex.group.id);
      if (ex.membership === "member") {
        assert.equal(feed.status, "ready");
        assert.ok(feed.status === "ready");
        assert.equal(feed.posts.length, ex.posts.length);
        assert.equal(feed.count, ex.posts.length);
        for (const post of feed.posts) {
          assert.match(post.body, /^Example\b/);
          assert.match(post.author.name, /^Example\b/);
          assert.equal(post.group?.id, ex.group.id);
          assert.equal(post.media, undefined);
        }
      } else {
        assert.deepEqual(feed, { status: "members-only", message: POSTS_MEMBERS_ONLY });
      }
    }
  });

  /* ------------------------------------------------------------------------ */
  /* 4. Every write is refused with its sentence                               */
  /* ------------------------------------------------------------------------ */

  test("every example write answers \"Examples can't be changed.\"", async () => {
    assert.equal(EXAMPLE_READ_ONLY, "Examples can't be changed.");
    for (const ex of EXAMPLE_GROUPS) {
      assert.equal(exampleRefusal(ex.group.id), EXAMPLE_READ_ONLY);
      const post = await postToGroup({ groupId: ex.group.id, body: "Anything at all" });
      assert.deepEqual(post, { ok: false, message: EXAMPLE_READ_ONLY });
      const empty = await postToGroup({ groupId: ex.group.id, body: "" });
      assert.deepEqual(empty, { ok: false, message: EXAMPLE_READ_ONLY });
    }
    assert.equal(exampleRefusal(UUID), null);
    assert.equal(exampleRefusal(undefined), null);

    const source = exampleFeedSource();
    const insert = await source.insert({ group_id: MONT_BLANC, body: "x" });
    assert.equal(insert.id, null);
    assert.equal(insert.error?.message, EXAMPLE_READ_ONLY);
    const composed = await composeGroupPost(source, { groupId: MONT_BLANC, body: "x" });
    assert.equal(composed.ok, false);
    const after = await readGroupFeed(MONT_BLANC);
    assert.ok(after.status === "ready" && after.posts.length === exampleGroupById(MONT_BLANC)?.posts.length);
  });

  test("organised-group counting never counts examples (no client in a demo build)", async () => {
    assert.equal(await countOrganisedGroups(), null);
  });
}

test("each group write in groupSpace.ts refuses an example before touching the network", () => {
  const src = readSrc("src/social/groupSpace.ts");
  for (const name of ["join", "requestJoin", "leave", "decide", "send"]) {
    const start = src.indexOf(`const ${name} = useCallback(`);
    assert.ok(start > 0, `${name} found`);
    const gateAt = src.indexOf("await gate()", start);
    const refusalAt = src.indexOf("exampleRefusal(groupId)", start);
    assert.ok(refusalAt > start && refusalAt < gateAt, `${name} refuses examples first`);
  }
});

test("the feed screen refuses comments and reports on examples with the sentence", () => {
  const src = readSrc("src/screens/explore/GroupFeedSection.tsx");
  assert.match(src, /isExampleGroupId\(groupId\)/);
  assert.equal(src.split("setExampleNote(EXAMPLE_READ_ONLY)").length - 1, 2);
});

test("nothing in the example source or its reads writes to storage", () => {
  const src = readSrc("src/groups/demo/exampleSource.ts");
  assert.equal(/localStorage|sessionStorage|indexedDB|AppState|useApp|supabase/.test(src), false);
  assert.deepEqual(writes, []);
});

/* -------------------------------------------------------------------------- */
/* 5. The old demo path is gone                                                 */
/* -------------------------------------------------------------------------- */

test("the old demo modules are deleted and nothing imports them", () => {
  assert.equal(existsSync(resolve(process.cwd(), "src/social/demoGroupRecords.ts")), false);
  assert.equal(existsSync(resolve(process.cwd(), "src/social/demoGroups.ts")), false);
  for (const p of ["src/screens/explore/Groups.tsx", "src/search/treksAndGroups.ts"]) {
    const src = readSrc(p);
    assert.equal(/demoGroups|DEMO_GROUPS|GROUPS_DEMO_NOTICE|entryForDemo|demoGroupHit/.test(src), false, p);
  }
});

test("the old seeded id prefix appears only in the S1 clean-up and its test", () => {
  const needle = ["demo", "group", ""].join("-");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && readFileSync(full, "utf8").includes(needle)) {
        hits.push(full.slice(resolve(process.cwd()).length + 1));
      }
    }
  };
  walk(resolve(process.cwd(), "src"));
  assert.deepEqual(hits.sort(), [
    "src/groups/local/stateCleanup.test.ts",
    "src/groups/local/stateCleanup.ts",
  ]);
});

void Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exit(1);
});
