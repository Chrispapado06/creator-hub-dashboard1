import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");

// Every migration, in order — so this stays honest as the schema grows.
const SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

const db = await PGlite.create();
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text,
                           raw_user_meta_data jsonb default '{}'::jsonb);
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  end $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
  -- Supabase grants these to every API role; without them an INVOKER function
  -- that calls auth.uid() fails here but not in production.
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`);
await db.exec(SQL);

// Seed as superuser (stands in for the service role).
const mk = async (email, role, name) => {
  const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = u.rows[0].id;
  await db.query(`update public.profiles set role=$2, display_name=$3 where id=$1`, [id, role, name]);
  return id;
};
const alice = await mk("alice@x.io", "athlete", "Alice");   // in the thread
const bob = await mk("bob@x.io", "athlete", "Bob");         // NOT in the thread
const guide = await mk("guide@x.io", "guide", "Guide G");
const admin = await mk("admin@x.io", "admin", "Staff");

// The guide holds a real (listed) guide profile — availability hangs off it.
await db.query(`insert into public.guide_profiles (id, listed) values ($1, true)`, [guide]);

const th = await db.query(
  `insert into public.threads (peak_name, created_by) values ('Mont Blanc', $1) returning id`, [alice]);
const threadId = th.rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [threadId, alice, guide]);
await db.query(`insert into public.messages (thread_id, sender_id, body) values ($1,$2,'My dates and my experience.')`,
  [threadId, alice]);

/** Run fn as a signed-in user (or anon when uid is null). */
async function as(uid, fn) {
  await db.exec("begin");
  await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
  if (uid) await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  else await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e.message.split("\n")[0] };
  } finally {
    await db.exec("rollback");
  }
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

// 1. participants can read
let r = await as(alice, () => db.query(`select body from public.messages`));
check("Alice (participant) reads her thread", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(guide, () => db.query(`select body from public.messages`));
check("Guide (participant) reads the thread", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 2. THE ONE THAT MATTERS — an outsider must see nothing
r = await as(bob, () => db.query(`select body from public.messages`));
check("Bob (outsider) reads NOTHING", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(bob, () => db.query(`select * from public.threads`));
check("Bob cannot see the thread row", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(bob, () => db.query(`select * from public.thread_participants`));
check("Bob cannot enumerate participants", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 3. anon gets nothing at all
r = await as(null, () => db.query(`select body from public.messages`));
check("anon is refused messages", !r.ok, r.ok ? `LEAKED ${r.value.rows.length} row(s)` : r.error);

// 4. outsider cannot inject himself into the conversation
r = await as(bob, () => db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`, [threadId, bob]));
check("Bob cannot add himself to the thread", !r.ok, r.ok ? "INSERTED" : r.error);

// 5. outsider cannot post into it
r = await as(bob, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'hi')`, [threadId, bob]));
check("Bob cannot post into the thread", !r.ok, r.ok ? "INSERTED" : r.error);

// 6. forgery — participant writing in someone else's name
r = await as(guide, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'forged')`, [threadId, alice]));
check("Guide cannot forge a message as Alice", !r.ok, r.ok ? "INSERTED" : r.error);

// 7. history is immutable, even for a participant
r = await as(alice, () => db.query(`update public.messages set body='rewritten'`));
check("Alice cannot edit a sent message", !r.ok, r.ok ? "UPDATED" : r.error);
r = await as(alice, () => db.query(`delete from public.messages`));
check("Alice cannot delete a sent message", !r.ok, r.ok ? "DELETED" : r.error);

// 8. privilege escalation
r = await as(bob, () => db.query(`update public.profiles set role='admin' where id=$1`, [bob]));
const escalated = r.ok
  ? (await db.query(`select role from public.profiles where id=$1`, [bob])).rows[0].role === "admin"
  : false;
check("Bob cannot promote himself to admin", !escalated, escalated ? "ESCALATED" : (r.ok ? "no rows changed" : r.error));

// 9. admin oversight works
r = await as(admin, () => db.query(`select body from public.messages`));
check("Admin can read for support", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 10. unlisted providers stay hidden (the profile is seeded above, listed —
// unlist it for this probe; the availability block re-lists it explicitly)
// (superuser seed rides the sanctioned-change GUC the pin trigger honours)
await db.exec(`select set_config('icefall.listing_change','sanctioned',true); update public.guide_profiles set listed = false where id = '${guide}'`);
r = await as(bob, () => db.query(`select * from public.guide_profiles`));
check("Unlisted guide profile hidden from others", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// 11. the verification lock
r = await as(guide, () => db.query(`update public.guide_profiles set credentials_verified=true where id=$1`, [guide]));
check("Guide cannot mark themselves verified", !r.ok, r.ok ? "VERIFIED ITSELF" : r.error);

/* ---- chat: blocking, idempotency, reporting ------------------------------ */

// A direct thread between Alice and Bob so blocking can be exercised.
const dm = (await db.query(
  `insert into public.threads (kind, created_by) values ('direct', $1) returning id`, [alice])).rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [dm, alice, bob]);

r = await as(bob, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'hello')`, [dm, bob]));
check("Bob can message Alice before any block", r.ok, r.ok ? "sent" : r.error);

// Alice blocks Bob.
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [alice, bob]);

r = await as(bob, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'again')`, [dm, bob]));
check("blocked user cannot post", !r.ok, r.ok ? "SENT ANYWAY" : r.error);

// Symmetric: the blocker cannot keep talking at them either.
r = await as(alice, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'still here')`, [dm, alice]));
check("block is symmetric — blocker also stopped", !r.ok, r.ok ? "SENT ANYWAY" : r.error);

// The blocked party must not be able to discover the block.
r = await as(bob, () => db.query(`select * from public.blocks`));
check("blocked user cannot see the block", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(alice, () => db.query(`select * from public.blocks`));
check("blocker sees their own block", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// Offline send: the same client_id retried must insert once, not twice.
const cid = "11111111-2222-3333-4444-555555555555";
await db.exec("begin");
await db.exec("set local role authenticated");
await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [guide]);
let dupOk = false;
try {
  await db.query(
    `insert into public.messages (thread_id, sender_id, body, client_id) values ($1,$2,'queued',$3)`,
    [threadId, guide, cid]);
  try {
    await db.query(
      `insert into public.messages (thread_id, sender_id, body, client_id) values ($1,$2,'queued',$3)`,
      [threadId, guide, cid]);
  } catch { dupOk = true; }
} catch (e) { dupOk = false; }
await db.exec("rollback");
check("a retried offline message inserts once", dupOk, dupOk ? "second insert rejected" : "DUPLICATED");

// Reporting
r = await as(bob, () => db.query(
  `insert into public.reports (reporter_id, subject_id, reason, detail) values ($1,$2,'off_platform_payment','asked me to pay by bank transfer')`,
  [bob, guide]));
check("anyone can file a report", r.ok, r.ok ? "filed" : r.error);

r = await as(bob, () => db.query(
  `insert into public.reports (reporter_id, subject_id, reason) values ($1,$2,'spam')`, [alice, guide]));
check("cannot file a report as someone else", !r.ok, r.ok ? "FILED" : r.error);

/* -- waitlist: insert-only to the public ------------------------------------
   The launch page writes here with the publishable key, so `anon` is the
   attacker as well as the customer. Adding yourself must work; everything else
   must not — a list of customer email addresses that anon can SELECT is a list
   that has been published. */

// Seeded as superuser, standing in for an address someone already left.
await db.query(`insert into public.waitlist (email, name, source) values ('early@x.io','Early Bird','hero')`);

r = await as(null, () => db.query(
  `insert into public.waitlist (email, name, source) values ('stranger@x.io','A Stranger','hero')`));
check("anon can join the waitlist", r.ok, r.ok ? "inserted" : r.error);

r = await as(null, () => db.query(`select email from public.waitlist`));
check("anon CANNOT read the waitlist", !r.ok || r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s) LEAKED` : r.error);

r = await as(alice, () => db.query(`select email from public.waitlist`));
check("a signed-in user cannot read it either", !r.ok || r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s) LEAKED` : r.error);

r = await as(null, () => db.query(`update public.waitlist set email='hijack@x.io'`));
check("anon cannot rewrite an address", !r.ok, r.ok ? "UPDATED" : r.error);

r = await as(null, () => db.query(`delete from public.waitlist`));
check("anon cannot delete the list", !r.ok, r.ok ? "DELETED" : r.error);

// The API lowercases and trims before it gets here; the constraint is what makes
// `unique (email)` mean one person rather than one spelling.
r = await as(null, () => db.query(
  `insert into public.waitlist (email, source) values ('Mixed.Case@X.IO','hero')`));
check("an unnormalised address is rejected", !r.ok, r.ok ? "ACCEPTED" : r.error);

r = await as(null, () => db.query(
  `insert into public.waitlist (email, source) values ('early@x.io','footer')`));
check("the same address cannot be added twice", !r.ok, r.ok ? "DUPLICATED" : r.error);

r = await as(null, () => db.query(
  `insert into public.waitlist (email, source) values ('not-an-email','hero')`));
check("a malformed address is rejected", !r.ok, r.ok ? "ACCEPTED" : r.error);


/* -- S1 messaging: the two locks, the send path, receipts -------------------
   HOLE 1 probe first — it is the one that reads private mail if it regresses. */

// Bob creates his own thread so he owns a participant row he can try to move.
const bobTh = await db.query(
  `insert into public.threads (peak_name, created_by) values ('Bob peak', $1) returning id`, [bob]);
const bobThread = bobTh.rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`,
  [bobThread, bob]);

r = await as(bob, () => db.query(
  `update public.thread_participants set thread_id = $1 where profile_id = $2 and thread_id = $3 returning thread_id`,
  [threadId, bob, bobThread]));
check("HOLE 1: membership row cannot be MOVED into a private thread", !r.ok,
  r.ok ? "MOVED — Bob is now inside Alice's thread" : r.error);

r = await as(alice, () => db.query(
  `update public.threads set peak_name = 'Everest', group_size = 12 where id = $1 returning peak_name`, [threadId]));
check("HOLE 2: a participant cannot rewrite the objective", !r.ok, r.ok ? "REWRITTEN" : r.error);

r = await as(admin, () => db.query(
  `update public.threads set from_date = '2026-09-01' where id = $1 returning id`, [threadId]));
check("staff cannot rewrite the objective either", !r.ok, r.ok ? "REWRITTEN by staff" : r.error);

r = await as(alice, () => db.query(
  `update public.threads set status = 'closed' where id = $1 returning status`, [threadId]));
check("a participant can still close the thread", r.ok && r.value.rows[0]?.status === "closed",
  r.ok ? "closed" : r.error);

r = await as(alice, () => db.query(
  `update public.threads set title = 'My renamed enquiry' where id = $1 returning id`, [threadId]));
check("an enquiry thread cannot be retitled", !r.ok, r.ok ? "RETITLED" : r.error);

// Read receipts: forward only.
r = await as(alice, () => db.query(
  `update public.thread_participants set last_read_at = now() - interval '10 years'
    where thread_id = $1 and profile_id = $2 returning 1`, [threadId, alice]));
check("a read receipt cannot move backwards", !r.ok, r.ok ? "REWOUND" : r.error);

r = await as(alice, () => db.query(`select public.mark_thread_read($1) as at`, [threadId]));
check("mark_thread_read stamps the caller's receipt", r.ok && r.value.rows[0].at !== null,
  r.ok ? String(r.value.rows[0].at) : r.error);

r = await as(bob, () => db.query(`select public.mark_thread_read($1) as at`, [threadId]));
check("an outsider's mark_thread_read stamps nothing", r.ok && r.value.rows[0].at === null,
  r.ok ? String(r.value.rows[0].at) : r.error);

// The send path: policy conjuncts hold THROUGH the function (invoker).
r = await as(bob, () => db.query(
  `select public.send_message($1, 'let me in') `, [threadId]));
check("send_message: an outsider cannot send", !r.ok, r.ok ? "SENT" : r.error);

r = await as(alice, () => db.query(
  `select (public.send_message($1, 'hello from the send path')).id`, [threadId]));
check("send_message: a participant can send", r.ok, r.ok ? "sent" : r.error);

// Decision 19 through the function: the guide may not OPEN a fresh thread.
const gTh = await db.query(
  `insert into public.threads (peak_name, created_by) values ('Cold call', $1) returning id`, [guide]);
const guideThread = gTh.rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [guideThread, guide, bob]);
r = await as(guide, () => db.query(
  `select public.send_message($1, 'buy my expedition')`, [guideThread]));
check("send_message: a guide cannot send the FIRST message", !r.ok, r.ok ? "COLD-CALLED" : r.error);

// Idempotent resend: same client_id twice inside one transaction -> one row.
r = await as(alice, async () => {
  const cid = (await db.query(`select gen_random_uuid() as id`)).rows[0].id;
  const first = await db.query(`select (public.send_message($1, 'offline msg', $2)).id`, [threadId, cid]);
  const second = await db.query(`select (public.send_message($1, 'offline msg', $2)).id`, [threadId, cid]);
  const count = await db.query(`select count(*)::int c from public.messages where client_id = $1`, [cid]);
  return { same: first.rows[0].id === second.rows[0].id, c: count.rows[0].c };
});
check("send_message: a retried client_id inserts once", r.ok && r.value.same && r.value.c === 1,
  r.ok ? `count=${r.value.c}, same id=${r.value.same}` : r.error);

// Sending stamps the sender's own receipt in the same call.
r = await as(alice, async () => {
  await db.query(`select public.send_message($1, 'stamping my own receipt')`, [threadId]);
  const rec = await db.query(
    `select last_read_at is not null as stamped from public.thread_participants
      where thread_id = $1 and profile_id = $2`, [threadId, alice]);
  return rec.rows[0].stamped;
});
check("send_message: sending stamps the sender's receipt", r.ok && r.value === true,
  r.ok ? "stamped" : r.error);

// The immutable-record posture, re-probed through this migration's surface.
r = await as(alice, () => db.query(`update public.messages set body = 'softer wording' returning 1`));
check("messages still cannot be edited by anyone", !r.ok || r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} EDITED` : r.error);

r = await as(admin, () => db.query(`delete from public.messages returning 1`));
check("messages still cannot be deleted, staff included", !r.ok || r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} DELETED` : r.error);


/* -- Guide availability: a row means the guide SPOKE ------------------------ */

r = await as(guide, () => db.query(
  `insert into public.guide_availability (guide_profile_id, day, state) values ($1, current_date + 30, 'available') returning day`,
  [guide]));
check("availability: a guide marks their own day", r.ok && r.value.rows.length === 1,
  r.ok ? "marked" : r.error);

r = await as(alice, () => db.query(
  `insert into public.guide_availability (guide_profile_id, day, state) values ($1, current_date + 31, 'unavailable')`,
  [guide]));
check("availability: nobody speaks for the guide", !r.ok, r.ok ? "SPOKE FOR THEM" : r.error);

r = await as(guide, () => db.query(
  `insert into public.guide_availability (guide_profile_id, day, state) values ($1, current_date + 32, 'busy')`,
  [guide]));
check("availability: 'busy'/'booked' is not a state — booked derives from bookings", !r.ok,
  r.ok ? "ACCEPTED" : r.error);

// Seeded as the guide would have written it, so reads can be probed after rollback.
await db.exec(`select set_config('icefall.listing_change','sanctioned',true); update public.guide_profiles set listed = true where id = '${guide}'`);
await db.query(
  `insert into public.guide_availability (guide_profile_id, day, state, note)
   values ($1, current_date + 40, 'available', 'valley day, short notice ok')`, [guide]);

r = await as(alice, () => db.query(`select day, state from public.guide_availability`));
check("availability: a listed guide's calendar is readable", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

await db.exec(`select set_config('icefall.listing_change','sanctioned',true); update public.guide_profiles set listed = false where id = '${guide}'`);
r = await as(alice, () => db.query(`select day from public.guide_availability`));
check("availability: unlisting hides the calendar with the profile", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} LEAKED` : r.error);
r = await as(guide, () => db.query(`select day from public.guide_availability`));
check("availability: ...but the guide keeps their own words", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length}` : r.error);
await db.exec(`select set_config('icefall.listing_change','sanctioned',true); update public.guide_profiles set listed = true where id = '${guide}'`);

r = await as(guide, () => db.query(
  `delete from public.guide_availability where guide_profile_id = $1 and day = current_date + 40 returning 1`, [guide]));
check("availability: clearing a day is a DELETE — back to 'not said'", r.ok && r.value.rows.length === 1,
  r.ok ? "cleared" : r.error);


console.log("\nRLS ATTACK RESULTS\n" + "=".repeat(64));
let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? " PASS" : " FAIL"}  ${t.name.padEnd(42)} ${t.detail ?? ""}`);
}
console.log("=".repeat(64));
console.log(`${results.length - failed}/${results.length} passed`);
await db.close();
process.exit(failed ? 1 : 0);
