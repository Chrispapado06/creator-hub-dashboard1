/**
 * THE GROUP FEED, MEASURED AGAINST A SERVER THAT ANSWERS ON DEMAND.
 *
 * WHY THIS FILE EXISTS. Three of the claims `groupPosts.ts` makes are claims a
 * typecheck cannot see:
 *
 *   1. THAT A NON-MEMBER IS TOLD A DOOR IS CLOSED RATHER THAN SHOWN AN EMPTY
 *      ROOM. Row-level security FILTERS — a stranger's query returns `[]` with
 *      no error, byte for byte what an empty group returns — so the only thing
 *      separating "you cannot see this" from "nobody has posted" is the
 *      head-check running FIRST and the post query not running at all. That
 *      ordering is invisible to the compiler and is asserted here by counting
 *      the requests a fake server received.
 *
 *   2. THAT EVERY POST WRITTEN BEFORE ANY OF THIS EXISTED STILL READS EXACTLY
 *      AS IT DID. A nullable column and an optional field are the kind of
 *      change that is obviously safe right up until the mapper starts filling
 *      one in, so a row with no `group_id` is put through the real mapper and
 *      every field is compared.
 *
 *   3. THAT AN ABSENCE CARRIES THE RIGHT REASON. "Not deployed", "refused",
 *      "could not reach" and "nobody has posted" are four different sentences
 *      and only one of them is ever true at a time; getting them confused is
 *      how a screen ends up telling eleven climbers their group is empty
 *      because a migration has not been pushed.
 *
 * It follows the suites beside it exactly: a plain TypeScript program with a
 * small harness, inside `src/` so `npm run typecheck` checks it against the
 * same types the app uses. Nothing in the app imports it. There is no network
 * and no Supabase client — every server answer below is one this file wrote.
 */

import {
  GROUP_FEED_NOT_LIVE,
  GROUP_FEED_NO_SUCH_GROUP,
  GROUP_FEED_REFUSED,
  GROUP_FEED_UNREACHABLE,
  GROUP_POST_MEMBERS_ONLY,
  MAX_GROUP_POST_BODY,
  POSTS_MEMBERS_ONLY,
  composeGroupPost,
  feedAbsence,
  postFailure,
  readGroupFeedFrom,
  toGroupFeedPost,
  type FeedError,
  type GroupFeedSource,
} from "./groupPosts";
import type { Post } from "./types";

/* -------------------------------------------------------------------------- */
/* Harness — the same thirty lines as the suites beside it                     */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/* -------------------------------------------------------------------------- */
/* A server that answers what it is told to, and records what it was asked     */
/* -------------------------------------------------------------------------- */

interface FakePlan {
  membership?: { found: boolean; joined: boolean; error?: FeedError | null };
  rows?: Record<string, unknown>[];
  count?: number | null;
  pageError?: FeedError | null;
  signed?: Record<string, string>;
  insertId?: string | null;
  insertError?: FeedError | null;
}

interface Fake extends GroupFeedSource {
  /** Every method call, in order. The ordering assertions read this. */
  calls: string[];
  /** The object the insert was handed, or null if it never ran. */
  inserted: Record<string, unknown> | null;
}

function fakeServer(plan: FakePlan): Fake {
  const calls: string[] = [];
  const fake: Fake = {
    calls,
    inserted: null,
    uid: "uid-reader",
    async membership() {
      calls.push("membership");
      const m = plan.membership ?? { found: true, joined: true };
      return { found: m.found, joined: m.joined, error: m.error ?? null };
    },
    async page() {
      calls.push("page");
      if (plan.pageError) return { rows: [], count: null, error: plan.pageError };
      return {
        rows: plan.rows ?? [],
        count: plan.count === undefined ? (plan.rows?.length ?? 0) : plan.count,
        error: null,
      };
    },
    async sign(paths) {
      calls.push("sign");
      const out = new Map<string, string>();
      for (const p of paths) {
        const url = plan.signed?.[p];
        if (url) out.set(p, url);
      }
      return out;
    },
    async insert(row) {
      calls.push("insert");
      fake.inserted = row;
      return { id: plan.insertId ?? null, error: plan.insertError ?? null };
    },
  };
  return fake;
}

/** A `posts` row as PostgREST actually serves one, with the author embedded. */
function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    author_id: "aaaaaaaa-1111-4111-8111-111111111111",
    author_kind: "profile",
    body: "The fixed rope ends thirty metres below the col.",
    media_path: null,
    media_meta: null,
    created_at: "2026-09-10T08:00:00.000Z",
    expires_at: null,
    group_id: null,
    author: {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      display_name: "Ana Ruiz",
      username: "anaruiz",
      avatar_url: "avatars/ana.jpg",
      location_label: "Chamonix, France",
    },
    company: null,
    group: null,
    ...over,
  };
}

const EMPTY_SIGNED = new Map<string, string>();

/* -------------------------------------------------------------------------- */

testCase("THE MEMBERSHIP GATE — a closed door, never an empty room");
{
  const stranger = fakeServer({ membership: { found: true, joined: false }, rows: [row()] });
  const read = await readGroupFeedFrom(stranger, "g-1");

  check("a non-member gets `members-only`", read.status === "members-only", read.status);
  check(
    "and the members-only sentence, not an empty feed",
    read.status !== "ready" && read.message === POSTS_MEMBERS_ONLY,
  );
  check(
    "NO POST QUERY IS MADE AT ALL for a non-member",
    !stranger.calls.includes("page"),
    stranger.calls.join(" → "),
  );
  check(
    "the head-check runs first, and it is the only request",
    stranger.calls.join(",") === "membership",
    stranger.calls.join(" → "),
  );
}
{
  // THE CASE THE WHOLE ORDERING EXISTS FOR: RLS filtered every row away, so
  // the page is empty either way. Only the head-check can tell these apart.
  const strangerFiltered = fakeServer({ membership: { found: true, joined: false }, rows: [] });
  const memberEmpty = fakeServer({ membership: { found: true, joined: true }, rows: [], count: 0 });
  const a = await readGroupFeedFrom(strangerFiltered, "g-1");
  const b = await readGroupFeedFrom(memberEmpty, "g-1");

  check(
    "an empty answer to a stranger and an empty answer to a member are DIFFERENT states",
    a.status === "members-only" && b.status === "ready",
    `${a.status} vs ${b.status}`,
  );
  check(
    "the member's empty feed is `ready` with no posts and a real zero",
    b.status === "ready" && b.posts.length === 0 && b.count === 0,
  );
  check(
    "and carries no failure sentence",
    b.status === "ready" && !("message" in b),
  );
}
{
  const member = fakeServer({ membership: { found: true, joined: true }, rows: [row()] });
  const read = await readGroupFeedFrom(member, "g-1");
  check("a member gets `ready`", read.status === "ready", read.status);
  check("with the post", read.status === "ready" && read.posts.length === 1);
  check(
    "and the head-check still ran before the page",
    member.calls.indexOf("membership") < member.calls.indexOf("page"),
    member.calls.join(" → "),
  );
}
{
  const missing = fakeServer({ membership: { found: false, joined: false } });
  const read = await readGroupFeedFrom(missing, "g-nope");
  check("no such group is `not-found`, not `members-only`", read.status === "not-found", read.status);
  check(
    "with the sentence that says the group is absent",
    read.status !== "ready" && read.message === GROUP_FEED_NO_SUCH_GROUP,
  );
}
{
  // `joined_by_me` absent or unreadable must NOT read as membership.
  const ambiguous: GroupFeedSource = {
    ...fakeServer({}),
    async membership() {
      return { found: true, joined: false, error: null };
    },
  };
  const read = await readGroupFeedFrom(ambiguous, "g-1");
  check("an unreadable membership value fails closed", read.status === "members-only", read.status);
}

/* -------------------------------------------------------------------------- */

testCase("THE READ — newest first, a real count, and nothing invented");
{
  const newest = row({ id: "aaa", created_at: "2026-09-10T12:00:00.000Z" });
  const older = row({ id: "bbb", created_at: "2026-09-01T12:00:00.000Z" });
  // The source orders `created_at desc`; the reader must not re-sort or reverse.
  const member = fakeServer({ rows: [newest, older], count: 214 });
  const read = await readGroupFeedFrom(member, "g-1");

  check(
    "the server's order is kept — newest first",
    read.status === "ready" && read.posts[0]?.id === "aaa" && read.posts[1]?.id === "bbb",
  );
  check(
    "the COUNT is the server's total, not the page length",
    read.status === "ready" && read.count === 214,
    read.status === "ready" ? String(read.count) : "",
  );
}
{
  const noCount = fakeServer({ rows: [row()], count: null });
  const read = await readGroupFeedFrom(noCount, "g-1");
  check(
    "a count that did not arrive is null, NEVER 0 and never the page length",
    read.status === "ready" && read.count === null,
    read.status === "ready" ? String(read.count) : "",
  );
}
{
  const nameless = fakeServer({ rows: [row({ author: null })] });
  const read = await readGroupFeedFrom(nameless, "g-1");
  check(
    "a post whose author did not resolve is DROPPED, not drawn under an invented name",
    read.status === "ready" && read.posts.length === 0,
  );
}
{
  const withPhoto = fakeServer({
    rows: [row({ media_path: "uid/photo.jpg", media_meta: { kind: "image", width: 1200 } })],
    signed: { "uid/photo.jpg": "https://signed.example/photo" },
  });
  const read = await readGroupFeedFrom(withPhoto, "g-1");
  check(
    "an attachment that signed is carried with its signed URL",
    read.status === "ready" && read.posts[0]?.media?.url === "https://signed.example/photo",
  );
  check(
    "and the measured width came through, unguessed",
    read.status === "ready" && read.posts[0]?.media?.width === 1200,
  );
}
{
  const unsignable = fakeServer({
    rows: [row({ media_path: "uid/photo.jpg", media_meta: { kind: "image" } })],
    signed: {},
  });
  const read = await readGroupFeedFrom(unsignable, "g-1");
  check(
    "a path that would not sign leaves the post as its words",
    read.status === "ready" && read.posts.length === 1 && read.posts[0]?.media === undefined,
  );
}
{
  const nothingToSign = fakeServer({ rows: [row()] });
  await readGroupFeedFrom(nothingToSign, "g-1");
  check(
    "no signing request is made when no row carries a path",
    !nothingToSign.calls.includes("sign"),
    nothingToSign.calls.join(" → "),
  );
}

/* -------------------------------------------------------------------------- */

testCase("EXISTING POSTS STILL WORK — a row with no group is the post it was");
{
  const plain = toGroupFeedPost(row(), EMPTY_SIGNED);
  check("a row with `group_id: null` still reads as a post", plain !== null);
  check(
    "and carries NO group — absent, not a null-named placeholder",
    plain !== null && plain.group === undefined,
    plain ? JSON.stringify(plain.group) : "",
  );
  check("the body is untouched", plain?.body === "The fixed rope ends thirty metres below the col.");
  check("the author is untouched", plain?.author.name === "Ana Ruiz");
  check("the handle is untouched", plain?.author.handle === "anaruiz");
  check("the location is untouched", plain?.author.location === "Chamonix, France");
  check("the kind defaults to a person", plain?.author.kind === "profile");
  check("createdAt is carried exactly", plain?.createdAt === "2026-09-10T08:00:00.000Z");
  check("expiresAt is carried as null, not dropped", plain?.expiresAt === null);
  check("no like total is claimed", plain?.likeCount === undefined);
  check("no comment total is claimed", plain?.commentCount === undefined);
  check(
    "no identity mark is claimed either way — it was not asked for",
    plain?.author.identityVerified === undefined,
  );

  // THE GUARANTEE, STATED AS A COMPARISON: adding a group to the row changes
  // exactly one field and nothing else.
  const grouped = toGroupFeedPost(
    row({ group_id: "g-1", group: { id: "g-1", name: "Cyprus Climbers" } }),
    EMPTY_SIGNED,
  );
  const stripped = (p: Post | null) => {
    if (!p) return null;
    const { group: _group, ...rest } = p;
    return JSON.stringify(rest);
  };
  check(
    "every field but `group` is identical between a grouped and an ungrouped row",
    stripped(plain) === stripped(grouped),
  );
  check(
    "and the group carries its real name",
    grouped?.group?.id === "g-1" && grouped?.group?.name === "Cyprus Climbers",
  );
}
{
  // The embed failed but the column answered. The id is what a card links with.
  const unresolved = toGroupFeedPost(row({ group_id: "g-1", group: null }), EMPTY_SIGNED);
  check(
    "an unresolved group embed keeps the id and leaves the name null",
    unresolved?.group?.id === "g-1" && unresolved?.group?.name === null,
  );
}
{
  // PostgREST serves a to-one embed as an array wherever it cannot prove it is
  // to-one. Both shapes must read.
  const asArray = toGroupFeedPost(
    row({ group_id: "g-1", group: [{ id: "g-1", name: "Cyprus Climbers" }] }),
    EMPTY_SIGNED,
  );
  check("a to-one embed served as an array still reads", asArray?.group?.name === "Cyprus Climbers");
}
{
  check("a row with no body is not a post", toGroupFeedPost(row({ body: "" }), EMPTY_SIGNED) === null);
  check("a row with no id is not a post", toGroupFeedPost(row({ id: null }), EMPTY_SIGNED) === null);
  check(
    "a company post whose company did not resolve is dropped, not relabelled",
    toGroupFeedPost(row({ author_kind: "company", company: null }), EMPTY_SIGNED) === null,
  );
}

/* -------------------------------------------------------------------------- */

testCase("ABSENCE CARRIES ITS REASON — four failures, four sentences");
{
  const codes: [string, string, string][] = [
    // PGRST200 is TODAY'S answer: no `posts → groups` relationship exists until
    // the migration is pushed, so PostgREST refuses over its schema cache.
    ["PGRST200", "not-provisioned", GROUP_FEED_NOT_LIVE],
    // A missing column — the same deployment fact from Postgres.
    ["42703", "not-provisioned", GROUP_FEED_NOT_LIVE],
    // A missing table.
    ["PGRST205", "not-provisioned", GROUP_FEED_NOT_LIVE],
    // A refusal. NOT a deployment fact — most often an expired session.
    ["42501", "refused", GROUP_FEED_REFUSED],
    // An ambiguous embed is OUR query being wrong, never the server not existing.
    ["PGRST201", "refused", GROUP_FEED_REFUSED],
  ];
  for (const [code, status, sentence] of codes) {
    const answer = feedAbsence({ code, message: "" });
    check(`${code} reads as ${status}`, answer.status === status, answer.status);
    check(`${code} gets its own sentence`, answer.message === sentence);
  }
  const transport = feedAbsence({ code: null, message: "TypeError: failed to fetch" });
  check("a bodiless transport failure is unreachable", transport.status === "unreachable");
  check("with the unreachable sentence", transport.message === GROUP_FEED_UNREACHABLE);

  check(
    "NO failure sentence ever claims the group is empty",
    [GROUP_FEED_NOT_LIVE, GROUP_FEED_REFUSED, GROUP_FEED_UNREACHABLE, POSTS_MEMBERS_ONLY].every(
      (s) => !/no posts yet|has not posted|nobody has posted/i.test(s),
    ),
  );
}
{
  const brokenHead = fakeServer({ membership: { found: false, joined: false, error: { code: "PGRST200" } } });
  const read = await readGroupFeedFrom(brokenHead, "g-1");
  check(
    "a failed head-check reports the failure, NOT `members-only`",
    read.status === "not-provisioned",
    read.status,
  );
  check("and makes no post query", !brokenHead.calls.includes("page"));
}
{
  const brokenPage = fakeServer({ membership: { found: true, joined: true }, pageError: { code: "42703" } });
  const read = await readGroupFeedFrom(brokenPage, "g-1");
  check(
    "a member whose read failed is told the column is not live, not that the feed is empty",
    read.status === "not-provisioned" && read.message === GROUP_FEED_NOT_LIVE,
  );
}

/* -------------------------------------------------------------------------- */

testCase("POSTING INTO A GROUP — the gate is on the write too");
{
  const stranger = fakeServer({ membership: { found: true, joined: false }, insertId: "new-id" });
  const result = await composeGroupPost(stranger, { groupId: "g-1", body: "Hello" });
  check("a non-member cannot post", result.ok === false);
  check("and is told so in English", !result.ok && result.message === GROUP_POST_MEMBERS_ONLY);
  check(
    "NO INSERT IS ATTEMPTED — the words never leave the device",
    stranger.inserted === null && !stranger.calls.includes("insert"),
    stranger.calls.join(" → "),
  );
}
{
  const member = fakeServer({ insertId: "new-id" });
  const result = await composeGroupPost(member, {
    groupId: "g-1",
    body: "  Rope fixed to the col.  ",
  });
  check("a member can post", result.ok === true);
  check("and gets the server's id back", result.ok && result.id === "new-id");
  check("the body is trimmed", member.inserted?.body === "Rope fixed to the col.");
  check("the group is named on the row", member.inserted?.group_id === "g-1");
  check("the author is the signed-in reader", member.inserted?.author_id === "uid-reader");
  check("the app posts as a person, never for a company", member.inserted?.author_kind === "profile");
  check("no company is claimed", member.inserted?.company_id === undefined);
  check("an ordinary post is not a story", member.inserted?.expires_at === null);
  check(
    "membership was established before the insert",
    member.calls.indexOf("membership") < member.calls.indexOf("insert"),
    member.calls.join(" → "),
  );
}
{
  const member = fakeServer({ insertId: "new-id" });
  await composeGroupPost(member, {
    groupId: "g-1",
    body: "A picture from the hut",
    mediaPath: "uid/hut.jpg",
    mediaMeta: { kind: "image", mime: "image/jpeg", bytes: 400 },
  });
  check("an attachment path is carried", member.inserted?.media_path === "uid/hut.jpg");
  check(
    "and only what was measured about it",
    JSON.stringify(member.inserted?.media_meta) ===
      JSON.stringify({ kind: "image", mime: "image/jpeg", bytes: 400 }),
  );
}
{
  const member = fakeServer({ insertId: null, insertError: null });
  const result = await composeGroupPost(member, { groupId: "g-1", body: "Hello" });
  check(
    "no returned id means NOT POSTED, even with no error — the id is the only evidence",
    result.ok === false,
  );
}
{
  const refused = fakeServer({ insertError: { code: "42501" } });
  const result = await composeGroupPost(refused, { groupId: "g-1", body: "Hello" });
  check(
    "the database refusing the membership arm reads as members-only",
    !result.ok && result.message === GROUP_POST_MEMBERS_ONLY,
  );
}
{
  const empty = fakeServer({});
  const blank = await composeGroupPost(empty, { groupId: "g-1", body: "   " });
  check("an empty post is refused before any request", !blank.ok && empty.calls.length === 0);

  const long = await composeGroupPost(empty, {
    groupId: "g-1",
    body: "x".repeat(MAX_GROUP_POST_BODY + 1),
  });
  check("a post over the column's limit is refused before any request", !long.ok);
  check("and still nothing was asked of the server", empty.calls.length === 0);

  const atLimit = fakeServer({ insertId: "ok" });
  const exact = await composeGroupPost(atLimit, {
    groupId: "g-1",
    body: "x".repeat(MAX_GROUP_POST_BODY),
  });
  check("a post exactly at the limit is allowed", exact.ok === true);
}
{
  check(
    "a write failure never says the post went through",
    postFailure({ code: "42703" }).length > 0 && !/posted\.?$/i.test(postFailure({ code: "42703" })),
  );
  check(
    "an unreachable write says nothing was half-saved",
    /half-saved/.test(postFailure({ code: null, message: "failed to fetch" })),
  );
}

/* -------------------------------------------------------------------------- */

console.log(
  failures.length === 0
    ? `\n\x1b[1m${passCount} passed, 0 failed\x1b[0m`
    : `\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m\n${failures.map((f) => `  · ${f}`).join("\n")}`,
);
console.log(
  "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that the DATABASE enforces any of it.\n" +
    "Every server answer above was written by this file. The real gate is the\n" +
    "`group_id is null or is_group_member(group_id)` arm on posts_select and\n" +
    "posts_insert in 20260912090000_post_group_id.sql, which is NOT APPLIED — so\n" +
    "nothing here has been checked against Postgres, and until that migration is\n" +
    "pushed a group post cannot be written at all. Nor does this prove the screen\n" +
    "draws the sentences: it proves which sentence the data layer hands it.\x1b[0m",
);
if (failures.length > 0 && proc) proc.exitCode = 1;
