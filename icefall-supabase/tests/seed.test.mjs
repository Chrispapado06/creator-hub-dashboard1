/**
 * The seed has to survive its own constraints.
 *
 * A seed file is the first thing that breaks when a CHECK is tightened, and it
 * breaks silently — somebody runs it against a development database months later
 * and gets half a dataset. This applies every migration and then the seed to a
 * fresh Postgres, and asserts the states the seed claims to demonstrate actually
 * came out the other side.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const SEED = join(HERE, "..", "seed", "crm_seed.sql");

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
  create publication supabase_realtime;
`);
await db.exec(SQL);

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

// The seed borrows an existing athlete rather than forging an auth user, so
// give it one — otherwise it correctly skips the funnel and this file would
// silently test half of it.
const u = await db.query(`insert into auth.users (email) values ('seed-climber@x.io') returning id`);
await db.query(`update public.profiles set display_name='Seed Climber' where id=$1`, [u.rows[0].id]);

let seedError = null;
try {
  await db.exec(readFileSync(SEED, "utf8"));
} catch (e) {
  seedError = e.message.split("\n")[0];
}
check("the seed applies cleanly", seedError === null, seedError ?? "applied");

if (!seedError) {
  const one = async (sql) => (await db.query(sql)).rows[0];
  const all = async (sql) => (await db.query(sql)).rows;

  const counts = await one(`select
    (select count(*) from public.companies)  as companies,
    (select count(*) from public.destinations)  as mountains,
    (select count(*) from public.products)   as products`);
  check("at least 3 companies", Number(counts.companies) >= 3, `${counts.companies}`);
  check("at least 5 mountains", Number(counts.mountains) >= 5, `${counts.mountains}`);

  const slots = (await all(
    `select slot_position from public.placement_status
     where destination_id='everest' and effective_status <> 'cancelled' order by slot_position`
  )).map((r) => r.slot_position);
  check("positions #1–#5 are all occupied on one mountain",
    JSON.stringify(slots) === "[1,2,3,4,5]", JSON.stringify(slots));

  const expired = await all(
    `select slot_position, status, effective_status, needs_review
     from public.placement_status where needs_review`);
  check("a placement has expired and STILL holds its slot",
    expired.length === 1 && expired[0].effective_status === "expired" && expired[0].status === "active",
    expired.length ? `#${expired[0].slot_position} ${expired[0].effective_status}, stored=${expired[0].status}` : "none");

  // The doctrine, checked rather than asserted in a comment.
  const verified = await all(`select id from public.companies where verification_status='verified'`);
  check("nothing in the seed claims to be verified", verified.length === 0, `${verified.length}`);

  const fakePrice = await all(
    `select id from public.products where price_state <> 'known' and price_from_cents is not null`);
  check("no unknown price is stored as a number", fakePrice.length === 0, `${fakePrice.length}`);

  const states = (await all(`select distinct price_state from public.products order by 1`)).map((r) => r.price_state);
  check("the seed exercises every price state", states.length === 3, states.join(", "));

  const pending = await all(
    `select changed_fields from public.content_versions where state='pending'`);
  check("two pending changes coexist on one product",
    pending.length === 2 && pending.every((p) => p.changed_fields.length === 1),
    pending.map((p) => p.changed_fields.join("+")).join(" / "));

  // And a third touching a field already pending is still refused.
  let clash = null;
  try {
    await db.query(
      `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
       values ('product','aaaaaaaa-0000-4000-8000-000000000001',
               '11111111-1111-4111-8111-111111111111','{"price_from_cents":1}'::jsonb,'pending')`);
  } catch (e) { clash = e.message.split("\n")[0]; }
  check("a clashing third change is still refused", clash !== null, clash ?? "ACCEPTED");

  const stages = (await all(
    `select distinct status from public.leads order by 1`)).map((r) => r.status);
  check("leads exist at every stage of the pipeline", stages.length === 7, stages.join(", "));

  const bookingValues = await all(
    `select value_status, value_cents from public.bookings order by value_status`);
  check("one booking is reported with a value, one pending with none",
    bookingValues.length === 2
      && bookingValues.some((b) => b.value_status === "reported" && b.value_cents !== null)
      && bookingValues.some((b) => b.value_status === "pending" && b.value_cents === null),
    bookingValues.map((b) => `${b.value_status}=${b.value_cents}`).join(", "));

  const bookedLead = await one(
    `select l.status, l.booking_id from public.leads l where l.status='booked'`);
  check("the booked lead is linked to its booking",
    bookedLead?.booking_id !== null && bookedLead?.booking_id !== undefined, `${bookedLead?.booking_id}`);

  // The point of not seeding a rate: the engine must say so, not guess.
  const rules = await all(`select id from public.commission_rules`);
  check("no commission rate is seeded — the rate is an open decision", rules.length === 0, `${rules.length}`);

  const booking = await one(`select id from public.bookings where value_status='reported'`);
  const staff = await db.query(`insert into auth.users (email) values ('seed-fin@x.io') returning id`);
  await db.query(`update public.profiles set role='admin' where id=$1`, [staff.rows[0].id]);
  await db.query(`insert into public.staff_members (profile_id, staff_role) values ($1,'finance')`, [staff.rows[0].id]);

  let engineErr = null;
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [staff.rows[0].id]);
  try { await db.query(`select public.record_commission($1,'referral')`, [booking.id]); }
  catch (e) { engineErr = e.message.split("\n")[0]; }
  await db.exec("rollback");
  // A refusal message is really an assertion about WHICH refusal takes
  // precedence, so this asserts that the engine reports EVERYTHING blocking the
  // booking rather than the first thing it happens to check. Both are true of a
  // seeded booking: no rate is configured, and nothing states its pass-through.
  // Reporting only one sends somebody away to fix it and surprises them with the
  // other.
  check("...and the engine refuses, naming every reason at once",
    engineErr !== null
      && /no referral commission rule is configured/.test(engineErr)
      && /passed straight on/.test(engineErr),
    engineErr ?? "INVENTED ONE");

  const nullPrice = await all(`select id from public.placements where price_cents is null`);
  check("an unagreed placement price is NULL, not 0", nullPrice.length >= 1, `${nullPrice.length}`);

  const nullSpots = await all(
    `select id from public.product_departures where spots_left is null and availability='unknown'`);
  check("'not stated' spots stay NULL rather than 0", nullSpots.length >= 1, `${nullSpots.length}`);
}

console.log("\nSEED RESULTS\n" + "=".repeat(76));
let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? " PASS" : " FAIL"}  ${t.name.padEnd(54)} ${t.detail ?? ""}`);
}
console.log("=".repeat(76));
console.log(`${results.length - failed}/${results.length} passed`);
await db.close();
process.exit(failed ? 1 : 0);
