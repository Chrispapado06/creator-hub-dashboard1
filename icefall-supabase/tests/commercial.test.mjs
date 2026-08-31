/**
 * ICEFALL — the commercial system: attack and arithmetic tests.
 *
 * This is the half that decides what money is owed, so the checks here are of
 * two kinds: the usual "an operator must not reach that" attacks, and arithmetic
 * that has to keep being true after somebody changes a rate.
 *
 * The single most important test in the file is the last one in its section:
 * changing the commission rate must not move a figure that was already earned.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const SQL = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8")).join("\n");

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
  -- or trigger that calls auth.uid() fails here but not in production (and
  -- probes pass for the wrong reason — the SS1 harness lesson).
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`);
await db.exec(SQL);

const mkUser = async (email, role, name) => {
  const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  await db.query(`update public.profiles set role=$2, display_name=$3 where id=$1`, [u.rows[0].id, role, name]);
  return u.rows[0].id;
};
const mkStaff = async (email, desk, name) => {
  const id = await mkUser(email, "admin", name);
  await db.query(`insert into public.staff_members (profile_id, staff_role) values ($1,$2)`, [id, desk]);
  return id;
};

const ops = await mkStaff("ops@icefall.test", "operations", "Ola Ops");
const finance = await mkStaff("fin@icefall.test", "finance", "Fay Finance");
const boss = await mkStaff("boss@icefall.test", "super_admin", "Sam Boss");
const support = await mkStaff("sup@icefall.test", "support", "Sue Support");
const sales = await mkStaff("sales@icefall.test", "sales", "Sean Sales");
const customer = await mkUser("climber@x.io", "athlete", "A Climber");

const northwind = (await db.query(
  `insert into public.companies (slug,name,status) values ('northwind','Northwind Ascents','active') returning id`)).rows[0].id;
const serac = (await db.query(
  `insert into public.companies (slug,name,status) values ('serac','Serac & Stone','active') returning id`)).rows[0].id;

const opN = await mkUser("a@northwind.test", "operator", "Nia Northwind");
const opS = await mkUser("a@serac.test", "operator", "Sol Serac");
await db.query(
  `insert into public.company_users (company_id,profile_id,company_role) values ($1,$2,'admin'),($3,$4,'admin')`,
  [northwind, opN, serac, opS]);

await db.query(`insert into public.destinations (id,name) values ('everest','Everest')`);
const product = (await db.query(
  `insert into public.products (company_id,kind,slug,name,status,live_at,price_from_cents,price_state)
   values ($1,'expedition','south-col','South Col','live',now(),6200000,'known') returning id`,
  [northwind])).rows[0].id;

// An enquiry thread addressed to Northwind, which nobody there has opened yet.
const thread = (await db.query(
  `insert into public.threads (kind, peak_name, created_by, company_id, product_id, product_name_at_creation)
   values ('enquiry','Everest',$1,$2,$3,'South Col') returning id`,
  [customer, northwind, product])).rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`, [thread, customer]);
await db.query(`insert into public.messages (thread_id, sender_id, body) values ($1,$2,'My dates and my experience.')`,
  [thread, customer]);

async function as(uid, fn) {
  await db.exec("begin");
  await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
  if (uid) await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  else await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, error: e.message.split("\n")[0] }; }
  finally { await db.exec("rollback"); }
}
async function asCommitted(uid, fn) {
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  try { const value = await fn(); await db.exec("commit"); return { ok: true, value }; }
  catch (e) { await db.exec("rollback"); return { ok: false, error: e.message.split("\n")[0] }; }
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });
const rows = (r) => (r.ok ? r.value.rows.length : -1);
let r;

/* ========================================================================== */
/* The inbox widening — a thread row is visible, the correspondence is not    */
/* ========================================================================== */

r = await as(opN, () => db.query(`select id from public.threads`));
check("company sees an enquiry addressed to it, unopened", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(opS, () => db.query(`select id from public.threads`));
check("another company sees nothing", r.ok && rows(r) === 0, r.ok ? `${rows(r)}` : r.error);

// The deliberate split: seeing that an enquiry exists is not reading it.
r = await as(opN, () => db.query(`select body from public.messages`));
check("...but cannot read the messages without joining", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(opN, () => db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`, [thread, opN]));
check("a company user may join its own company's thread", r.ok, r.ok ? "joined" : r.error);

r = await as(opS, () => db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`, [thread, opS]));
check("someone else's company user cannot join it", !r.ok, r.ok ? "JOINED" : r.error);

/* ========================================================================== */
/* Internal notes must never reach the customer                               */
/* ========================================================================== */

await db.query(
  `insert into public.conversation_notes (thread_id, company_id, author_id, body)
   values ($1,$2,$3,'Price-sensitive. Do not discount below the published rate.')`,
  [thread, northwind, opN]);

r = await as(customer, () => db.query(`select body from public.conversation_notes`));
check("the customer cannot read a note written about them", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(opN, () => db.query(`select body from public.conversation_notes`));
check("the company can read its own note", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(opS, () => db.query(`select body from public.conversation_notes`));
check("another company cannot", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

/* ========================================================================== */
/* Bookings, and a value that is not a number                                 */
/* ========================================================================== */

let e = null;
try {
  await db.query(
    `insert into public.bookings (kind, company_id, status, value_status, value_cents)
     values ('expedition',$1,'reported','unknown',0)`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an unknown booking value cannot be stored as 0", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.bookings (kind, company_id, status, value_status)
     values ('expedition',$1,'awaiting_deposit','pending')`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a guide status cannot be used on an expedition booking", e !== null, e ?? "ACCEPTED");

const pendingBooking = (await db.query(
  `insert into public.bookings (kind, company_id, product_id, destination_id, customer_id, status, value_status)
   values ('expedition',$1,$2,'everest',$3,'reported','pending') returning id`,
  [northwind, product, customer])).rows[0].id;
check("a booking CAN be recorded with no value at all", pendingBooking != null, "recorded as pending");

const booking = (await db.query(
  `insert into public.bookings (kind, company_id, product_id, destination_id, customer_id, status,
                                value_status, value_cents, pass_through_state, pass_through_cents, booked_at)
   values ('expedition',$1,$2,'everest',$3,'confirmed','reported',6200000,'none',0, now()) returning id`,
  [northwind, product, customer])).rows[0].id;

r = await as(opN, () => db.query(`update public.bookings set value_cents = 100 where id=$1`, [booking]));
const moved = r.ok
  ? Number((await db.query(`select value_cents from public.bookings where id=$1`, [booking])).rows[0].value_cents) !== 6200000
  : false;
check("an operator cannot rewrite its own booking value", !moved,
  moved ? "REWRITTEN" : (r.ok ? "no rows changed" : r.error));

/* ========================================================================== */
/* The commission engine                                                      */
/* ========================================================================== */

// NOTHING IS CONFIGURED YET, and the engine must say so rather than assume.
r = await as(finance, () => db.query(`select public.record_commission($1,'referral')`, [booking]));
check("with no rule configured, the engine REFUSES rather than guessing",
  !r.ok && /no referral commission rule is configured/.test(r.error ?? ""), r.error);
// (The multi-reason case is asserted in seed.test.mjs, on a booking that is
// genuinely blocked by both a missing rate and an unstated pass-through. This
// one states "none", so reporting a single reason is correct here.)

// A placeholder rate. Visibly not a decision: the owner has not chosen between
// 7.5% and 10%, so the test uses a number that is obviously neither.
await db.query(
  `insert into public.commission_rules (kind, scope, rate_bps, effective_from, note)
   values ('referral','default',500, current_date - 400,'PLACEHOLDER — the real rate is an open decision')`);

r = await as(finance, () => db.query(`select public.record_commission($1,'referral')`, [pendingBooking]));
check("a booking with no recorded value gets no commission",
  !r.ok && /booking value has not been reported/.test(r.error ?? ""), r.error);

r = await as(sales, () => db.query(`select public.record_commission($1,'referral')`, [booking]));
check("Sales cannot record a commission", !r.ok, r.ok ? "RECORDED" : r.error);

// Company override beats the default; product override beats the company.
await db.query(
  `insert into public.commission_rules (kind, scope, scope_company_id, rate_bps, effective_from)
   values ('referral','company',$1,600, current_date - 300)`, [northwind]);

let resolved = (await db.query(
  `select scope, rate_bps from public.resolve_commission_rule('referral',$1,$2, null, current_date)`,
  [northwind, product])).rows[0];
check("a company override beats the default", resolved.scope === "company" && resolved.rate_bps === 600,
  `${resolved.scope} @ ${resolved.rate_bps}bps`);

// A product-level override, which the specification allows to be a FIXED FEE
// rather than a percentage.
const productRule = (await db.query(
  `insert into public.commission_rules (kind, scope, scope_product_id, fixed_fee_cents, effective_from)
   values ('referral','product',$1, 250000, current_date - 200) returning id`, [product])).rows[0].id;

resolved = (await db.query(
  `select scope, fixed_fee_cents from public.resolve_commission_rule('referral',$1,$2, null, current_date)`,
  [northwind, product])).rows[0];
check("a product override beats the company override",
  resolved.scope === "product" && Number(resolved.fixed_fee_cents) === 250000,
  `${resolved.scope} @ ${resolved.fixed_fee_cents} cents fixed`);

// A rule that has not started yet must not be reachable. Effective dating is
// what lets a rate be agreed in advance without applying early.
await db.query(
  `insert into public.commission_rules (kind, scope, scope_product_id, rate_bps, effective_from)
   values ('referral','product',$1, 9999, current_date + 30)`, [product]);
resolved = (await db.query(
  `select scope, fixed_fee_cents, rate_bps from public.resolve_commission_rule('referral',$1,$2, null, current_date)`,
  [northwind, product])).rows[0];
check("a rule that starts in the future is not applied yet",
  resolved.rate_bps === null && Number(resolved.fixed_fee_cents) === 250000,
  `still the ${resolved.fixed_fee_cents}-cent rule`);

// ...and IS applied once that day arrives.
resolved = (await db.query(
  `select rate_bps from public.resolve_commission_rule('referral',$1,$2, null, current_date + 31)`,
  [northwind, product])).rows[0];
check("...and takes effect on its start date", resolved.rate_bps === 9999, `${resolved.rate_bps}bps`);

// An expired rule falls out of scope and the next-most-specific one takes over.
await db.query(
  `update public.commission_rules set effective_to = current_date - 1 where id=$1`, [productRule]);
resolved = (await db.query(
  `select scope, rate_bps from public.resolve_commission_rule('referral',$1,$2, null, current_date)`,
  [northwind, product])).rows[0];
check("an expired rule stops applying and the company rule resumes",
  resolved.scope === "company" && resolved.rate_bps === 600, `${resolved.scope} @ ${resolved.rate_bps}bps`);

// Clear the product rules so the commission below is computed from the company
// override, which is what the rest of this section asserts against.
await db.query(`delete from public.commission_rules where scope='product'`);

r = await asCommitted(finance, () => db.query(`select public.record_commission($1,'referral')`, [booking]));
check("Finance records the commission", r.ok, r.ok ? "recorded" : r.error);

const c = (await db.query(`select * from public.commissions where booking_id=$1`, [booking])).rows[0];
check("the amount is the rate applied to the booking value",
  Number(c.amount_cents) === Math.round((6200000 * 600) / 10000), `${c.amount_cents} cents`);
check("the rate is stored ON the record, not looked up later", c.rate_bps === 600, `${c.rate_bps}bps`);

const rev = (await db.query(`select * from public.revenue_records where commission_id=$1`, [c.id])).rows[0];
check("a revenue record lands in the referral stream",
  rev?.stream === "referral" && Number(rev.amount_cents) === Number(c.amount_cents),
  rev ? `${rev.stream} ${rev.amount_cents}` : "none");

/* -- THE ONE THAT MATTERS ------------------------------------------------- */

// The rate changes. Everything already earned must be untouched.
await db.query(
  `update public.commission_rules set rate_bps = 1500
   where kind='referral' and scope='company' and scope_company_id=$1`, [northwind]);

const after = (await db.query(`select rate_bps, amount_cents from public.commissions where id=$1`, [c.id])).rows[0];
check("CHANGING THE RATE DOES NOT REWRITE HISTORICAL REVENUE",
  after.rate_bps === 600 && Number(after.amount_cents) === Number(c.amount_cents),
  `still ${after.rate_bps}bps / ${after.amount_cents} cents`);

const revAfter = (await db.query(`select amount_cents from public.revenue_records where commission_id=$1`, [c.id])).rows[0];
check("...and the revenue record does not move either",
  Number(revAfter.amount_cents) === Number(c.amount_cents), `${revAfter.amount_cents} cents`);

// Deleting the rule must not orphan or alter the fee.
await db.query(`delete from public.commission_rules where scope='company' and scope_company_id=$1`, [northwind]);
const orphan = (await db.query(`select rate_bps, amount_cents, rule_id from public.commissions where id=$1`, [c.id])).rows[0];
check("deleting the rule leaves the historical fee intact",
  orphan.rate_bps === 600 && orphan.rule_id === null, `${orphan.rate_bps}bps, rule_id=${orphan.rule_id}`);

// Once the booking is completed, the arithmetic is frozen — even for the owner.
await db.query(`update public.bookings set status='completed', completed_at=now() where id=$1`, [booking]);
e = null;
try { await db.query(`update public.commissions set amount_cents = 1 where id=$1`, [c.id]); }
catch (err) { e = err.message.split("\n")[0]; }
check("a completed booking's commission cannot be rewritten, even by the service role",
  e !== null, e ?? "REWRITTEN");

e = null;
try { await db.query(`update public.commissions set status='paid' where id=$1`, [c.id]); }
catch (err) { e = err.message.split("\n")[0]; }
check("...but its status can still move to paid", e === null, e ?? "accrued → paid");

/* ========================================================================== */
/* Internal commercial information stays internal                             */
/* ========================================================================== */

// A lead belonging to Northwind. Serac must not be able to see that it exists.
await db.query(
  `insert into public.leads (company_id, customer_id, thread_id, product_id, destination_id, status)
   values ($1,$2,$3,$4,'everest','qualified')`, [northwind, customer, thread, product]);

r = await as(opN, () => db.query(`select id from public.leads`));
check("a company sees its own leads", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(opS, () => db.query(`select id from public.leads`));
check("a company cannot see another's leads", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(opS, () => db.query(`select id from public.bookings`));
check("a company cannot see another's bookings", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

for (const [label, table] of [["commission rates", "commission_rules"], ["commissions", "commissions"], ["revenue", "revenue_records"]]) {
  r = await as(opN, () => db.query(`select * from public.${table}`));
  check(`an operator cannot read ICEFALL's ${label}`, r.ok && rows(r) === 0,
    r.ok ? `${rows(r)} LEAKED` : r.error);
}

r = await as(null, () => db.query(`select * from public.bookings`));
check("anon is refused bookings entirely", !r.ok, r.ok ? "LEAKED" : r.error);

/* ========================================================================== */
/* Analytics events are self-reported, and cannot claim otherwise             */
/* ========================================================================== */

r = await as(customer, () => db.query(
  `insert into public.analytics_events (event_type, company_id, source) values ('listing_view',$1,'server')`,
  [northwind]));
check("a browser cannot claim its event came from the server", !r.ok, r.ok ? "FORGED" : r.error);

r = await as(customer, () => db.query(
  `insert into public.analytics_events (event_type, company_id) values ('listing_view',$1)`, [northwind]));
check("...but may emit a client event", r.ok, r.ok ? "emitted" : r.error);

r = await as(opN, () => db.query(`select * from public.analytics_events`));
check("an operator cannot enumerate raw traffic rows", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

/* ========================================================================== */
/* The guide stream — the branch that was unreachable until 20260829090000    */
/* ========================================================================== */

// `commission_rules` always permitted scope='guide', but resolve_commission_rule
// matched only product/company/default and took no guide argument, so a guide
// rule was storable and unreachable and every guide commission raised. The tests
// never caught it because they only ever exercised the referral path.

const guideProfile = await mkUser("guide@x.io", "guide", "Tobias Frei");
await db.query(`insert into public.guide_profiles (id, listed) values ($1, true)`, [guideProfile]);

e = null;
try {
  await db.query(
    `insert into public.bookings (kind, company_id, status, value_status, value_cents)
     values ('guide',$1,'paid_in_full','reported',180000)`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a guide booking must name its guide", e !== null, e ?? "ACCEPTED");

const guideBooking = (await db.query(
  `insert into public.bookings (kind, company_id, guide_id, destination_id, customer_id, status,
                                value_status, value_cents, pass_through_state, pass_through_cents, booked_at)
   values ('guide',$1,$2,'everest',$3,'paid_in_full','reported',180000,'none',0, now()) returning id`,
  [northwind, guideProfile, customer])).rows[0].id;

r = await as(finance, () => db.query(`select public.record_commission($1,'guide')`, [guideBooking]));
check("a guide commission with no rule still refuses rather than guessing",
  !r.ok && /no guide commission rule is configured/.test(r.error ?? ""), r.error);

// A rate for this specific guide. Before the fix this row could be stored and
// could never be found.
await db.query(
  `insert into public.commission_rules (kind, scope, scope_profile_id, rate_bps, effective_from)
   values ('guide','guide',$1, 1200, current_date - 100)`, [guideProfile]);

resolved = (await db.query(
  `select scope, rate_bps from public.resolve_commission_rule('guide',$1,null,$2, current_date)`,
  [northwind, guideProfile])).rows[0];
check("a guide-scoped rule now resolves at all",
  resolved?.scope === "guide" && resolved.rate_bps === 1200, `${resolved?.scope} @ ${resolved?.rate_bps}bps`);

// And it outranks a company rule, because terms agreed with a named person beat
// anything inherited.
await db.query(
  `insert into public.commission_rules (kind, scope, scope_company_id, rate_bps, effective_from)
   values ('guide','company',$1, 500, current_date - 90)`, [northwind]);
resolved = (await db.query(
  `select scope, rate_bps from public.resolve_commission_rule('guide',$1,null,$2, current_date)`,
  [northwind, guideProfile])).rows[0];
check("a guide rule outranks a company rule", resolved?.scope === "guide", `${resolved?.scope}`);

r = await asCommitted(finance, () => db.query(`select public.record_commission($1,'guide')`, [guideBooking]));
check("a guide commission can now actually be recorded", r.ok, r.ok ? "recorded" : r.error);

const gc = (await db.query(`select * from public.commissions where booking_id=$1`, [guideBooking])).rows[0];
check("...at the guide's own rate, stored on the record",
  gc && gc.rate_bps === 1200 && Number(gc.amount_cents) === Math.round((180000 * 1200) / 10000),
  gc ? `${gc.rate_bps}bps / ${gc.amount_cents}` : "none");

const gRev = (await db.query(`select stream from public.revenue_records where commission_id=$1`, [gc.id])).rows[0];
check("...and lands in the guide commission stream, not the referral one",
  gRev?.stream === "guide_commission", gRev?.stream);

// A referral rule must not capture a guide booking, nor the reverse. The two
// streams share a table and are kept apart by `kind` alone, so this is the one
// assertion standing between them.
await db.query(
  `insert into public.commission_rules (kind, scope, rate_bps, effective_from)
   values ('referral','default',900, current_date - 500)`);
resolved = (await db.query(
  `select kind, scope, rate_bps from public.resolve_commission_rule('guide',$1,null,$2, current_date)`,
  [northwind, guideProfile])).rows[0];
check("a referral rule cannot capture a guide booking",
  resolved?.kind === "guide" && resolved.rate_bps === 1200, `${resolved?.kind} @ ${resolved?.rate_bps}bps`);

// THE ONE THAT MATTERS MOST ON THIS STREAM. A guide is a person, and their past
// earnings restating is a worse failure than a company's: they would have been
// paid one figure and shown another.
await db.query(
  `update public.commission_rules set rate_bps = 2500 where scope='guide' and scope_profile_id=$1`,
  [guideProfile]);
const gcAfter = (await db.query(`select rate_bps, amount_cents from public.commissions where id=$1`, [gc.id])).rows[0];
check("CHANGING A GUIDE'S RATE DOES NOT REWRITE WHAT THEY ALREADY EARNED",
  gcAfter.rate_bps === 1200 && Number(gcAfter.amount_cents) === Number(gc.amount_cents),
  `still ${gcAfter.rate_bps}bps / ${gcAfter.amount_cents} cents`);

await db.query(`update public.bookings set status='completed', completed_at=now() where id=$1`, [guideBooking]);
e = null;
try { await db.query(`update public.commissions set amount_cents = 1 where id=$1`, [gc.id]); }
catch (err) { e = err.message.split("\n")[0]; }
check("a completed guide booking's commission is frozen too", e !== null, e ?? "REWRITTEN");

// A BOOKING CANNOT BE COMMISSIONED TWICE. `unique (booking_id, kind)` permits one
// row of each kind, and record_commission's parameter DEFAULTS to 'referral' — so
// a guide booking could quietly earn both a guide commission and a referral fee,
// producing two revenue records for one transaction.
r = await as(finance, () => db.query(`select public.record_commission($1,'referral')`, [guideBooking]));
check("a guide booking cannot also earn a REFERRAL fee",
  !r.ok && /cannot earn a referral commission/.test(r.error ?? ""), r.error);

r = await as(finance, () => db.query(`select public.record_commission($1,'guide')`, [booking]));
check("...nor an expedition booking a GUIDE commission",
  !r.ok && /cannot earn a guide commission/.test(r.error ?? ""), r.error);


/* ========================================================================== */
/* THE CUSTOMER OPENS EVERY CONVERSATION (owner decision 19)                  */
/* ========================================================================== */

// A guide or operator may REPLY but may never OPEN. The risk being blocked is
// off-platform solicitation — a provider taking a client outside ICEFALL, where
// the client loses the record of what was agreed and the refund terms with it.
// Cold outreach is the attack; a paid booking (the older documented rule) is a
// poor proxy for it, because the risk is identical the day after one.

// A thread nobody has spoken in yet, with the operator already a participant.
const cold = (await db.query(
  `insert into public.threads (kind, peak_name, created_by, company_id)
   values ('enquiry','Everest',$1,$2) returning id`, [customer, northwind])).rows[0].id;
await db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [cold, customer, opN]);

r = await as(opN, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'Interested in Everest? Call me.')`,
  [cold, opN]));
check("AN OPERATOR CANNOT SEND THE FIRST MESSAGE", !r.ok, r.ok ? "SENT" : r.error);

// The customer may always open.
r = await asCommitted(customer, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'Is October realistic?')`,
  [cold, customer]));
check("the customer opens it", r.ok, r.ok ? "sent" : r.error);

r = await as(opN, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'Yes — we run two teams that month.')`,
  [cold, opN]));
check("...and now the operator may reply", r.ok, r.ok ? "sent" : r.error);

// A guide is gated the same way. `guideProfile` is a guide role.
const guideThread = (await db.query(
  `insert into public.threads (kind, peak_name, created_by) values ('enquiry','Matterhorn',$1) returning id`,
  [customer])).rows[0].id;
await db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [guideThread, customer, guideProfile]);
r = await as(guideProfile, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'Available in July.')`,
  [guideThread, guideProfile]));
check("a guide cannot open one either", !r.ok, r.ok ? "SENT" : r.error);

// UNAFFECTED, deliberately. A party talking among themselves is not a sales
// channel, and gating it would break group chat for everybody in it.
const party = (await db.query(
  `insert into public.threads (kind, title, created_by) values ('group','Everest team',$1) returning id`,
  [guideProfile])).rows[0].id;
await db.query(
  `insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [party, guideProfile, customer]);
r = await as(guideProfile, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'Kit list attached.')`,
  [party, guideProfile]));
check("party chat is not gated", r.ok, r.ok ? "sent" : r.error);

// Staff are not gated either — the decision names guides and operators, and
// widening it would stop Support answering anybody.
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2)`,
  [guideThread, support]);
r = await as(support, () => db.query(
  `insert into public.messages (thread_id, sender_id, body) values ($1,$2,'ICEFALL support here.')`,
  [guideThread, support]));
check("ICEFALL staff are not gated", r.ok, r.ok ? "sent" : r.error);

// And the invariant the gate must not have disturbed.
r = await as(customer, () => db.query(`update public.messages set body='rewritten' where thread_id=$1`, [cold]));
check("a sent message still cannot be edited by anyone", !r.ok, r.ok ? "EDITED" : r.error);


/* ========================================================================== */
/* Appointing staff is now auditable                                          */
/* ========================================================================== */

r = await as(boss, () => db.query(
  `insert into public.staff_members (profile_id, staff_role) values ($1,'super_admin')`, [customer]));
check("even a super admin cannot write staff_members directly", !r.ok, r.ok ? "INSERTED" : r.error);

r = await as(sales, () => db.query(
  `select public.set_staff_role($1,'super_admin','active','trying it on')`, [customer]));
check("Sales cannot appoint staff through the function either", !r.ok, r.ok ? "APPOINTED" : r.error);

r = await asCommitted(boss, () => db.query(
  `select public.set_staff_role($1,'support','active','new support hire')`, [customer]));
check("a super admin appoints through the function", r.ok, r.ok ? "appointed" : r.error);

const appointed = (await db.query(
  `select actor_id, next, reason from public.audit_events where action='staff.appointed'`)).rows;
check("appointing somebody left an audit event",
  appointed.length === 1 && appointed[0].next?.staff_role === "support",
  appointed.length ? JSON.stringify(appointed[0].next) : "NO TRACE");


/* ========================================================================== */
/* What the commission is charged ON — settled, and pinned                    */
/* ========================================================================== */

// OWNER DECISION 13, 2026-08-28: ICEFALL charges only on what the counterparty
// KEEPS, never on money that merely passed through their hands. This replaces an
// earlier test that pinned the opposite basis while the question was open; it
// pins the decided one the same way, so the next person to change it has to
// argue for it rather than discover it.
//
// The owner's own worked example, as the test: an Everest expedition sells for
// EUR 62,000 of which EUR 10,000 is the Nepal permit the company collects and
// hands to the government. 7.5% applies to EUR 52,000. EUR 3,900, not EUR 4,650.

await db.query(
  `insert into public.commission_rules (kind, scope, scope_company_id, rate_bps, effective_from)
   values ('referral','company',$1, 750, current_date - 10)`, [serac]);

// 1. Nobody has said what was passed through. The engine must refuse, not guess.
const unstated = (await db.query(
  `insert into public.bookings (kind, company_id, product_id, destination_id, customer_id, status,
                                value_status, value_cents, booked_at)
   values ('expedition',$1,$2,'everest',$3,'confirmed','reported', 6200000, now()) returning id`,
  [serac, product, customer])).rows[0].id;

r = await as(finance, () => db.query(`select public.record_commission($1,'referral')`, [unstated]));
check("a booking that does not say what it passed through gets NO commission",
  !r.ok && /passed straight on/.test(r.error ?? ""), r.error);

// 2. "Unknown" must not be storable as zero — that would silently charge on gross.
e = null;
try {
  await db.query(
    `update public.bookings set pass_through_cents = 0 where id = $1`, [unstated]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an unstated pass-through cannot be quietly recorded as zero", e !== null, e ?? "ACCEPTED");

// 3. Stated. The permit comes out before the rate is applied.
await db.query(
  `update public.bookings set pass_through_state='stated', pass_through_cents = 1000000
   where id = $1`, [unstated]);

r = await asCommitted(finance, () => db.query(`select public.record_commission($1,'referral')`, [unstated]));
check("with the permit stated, the commission is recorded", r.ok, r.ok ? "recorded" : r.error);

const netC = (await db.query(
  `select gross_cents, pass_through_cents, basis_cents, amount_cents
   from public.commissions where booking_id=$1`, [unstated])).rows[0];
check("THE BASIS EXCLUDES WHAT THE COMPANY ONLY PASSED ON",
  Number(netC.basis_cents) === 5200000, `${netC.basis_cents}`);
check("...so the fee is EUR 3,900, not EUR 4,650",
  Number(netC.amount_cents) === 390000, `${netC.amount_cents}`);
check("...and the record carries the whole sum, not just the answer",
  Number(netC.gross_cents) === 6200000 && Number(netC.pass_through_cents) === 1000000,
  `gross ${netC.gross_cents}, passed ${netC.pass_through_cents}`);

// 4. A pass-through larger than the booking is arithmetic gone wrong.
e = null;
try {
  await db.query(
    `update public.bookings set pass_through_cents = 99000000 where id = $1`, [unstated]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a pass-through cannot exceed the booking", e !== null, e ?? "ACCEPTED");

// 5. Rounding still never favours ICEFALL, now on the net basis.
const oddBooking = (await db.query(
  `insert into public.bookings (kind, company_id, product_id, destination_id, customer_id, status,
                                value_status, value_cents, pass_through_state, pass_through_cents, booked_at)
   values ('expedition',$1,$2,'everest',$3,'confirmed','reported', 2333, 'stated', 1000, now()) returning id`,
  [serac, product, customer])).rows[0].id;
await asCommitted(finance, () => db.query(`select public.record_commission($1,'referral')`, [oddBooking]));
const oddC = (await db.query(`select basis_cents, amount_cents from public.commissions where booking_id=$1`,
  [oddBooking])).rows[0];
check("rounding is never in ICEFALL's favour",
  Number(oddC.basis_cents) === 1333 && Number(oddC.amount_cents) === 99,
  `basis ${oddC.basis_cents}, fee ${oddC.amount_cents} cents`);



console.log("\nCOMMERCIAL RESULTS\n" + "=".repeat(80));
let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? " PASS" : " FAIL"}  ${t.name.padEnd(58)} ${t.detail ?? ""}`);
}
console.log("=".repeat(80));

/* ========================================================================== */
/* OPERATOR-CREATED LEADS — request 04's guarantees, enforced by the database */
/* ========================================================================== */

// The smuggle test, the strong way round: origin='icefall' from an operator is
// REFUSED, not coerced — a database that silently rewrites teaches clients it
// accepted them.
r = await as(opN, () => db.query(
  `insert into public.leads (company_id, origin, source_page) values ($1, 'icefall', 'Phone')`,
  [northwind]));
check("an operator cannot file their own enquiry as ICEFALL's", !r.ok, r.ok ? "SMUGGLED" : r.error);

r = await as(opN, () => db.query(
  `insert into public.leads (company_id, origin, customer_id, source_page) values ($1, 'company', $2, 'Phone')`,
  [northwind, customer]));
check("...nor attach an ICEFALL user to their own-origin lead", !r.ok, r.ok ? "ATTACHED" : r.error);

r = await asCommitted(opN, () => db.query(
  `insert into public.leads (company_id, origin, source_page, tags)
   values ($1, 'company', 'Walk-in', array['Deposit',' deposit ','VIP  client'])
   returning id, tags, customer_id`, [northwind]));
check("an operator records their own walk-in", r.ok, r.ok ? "recorded" : r.error);
const opLead = r.ok ? r.value.rows[0] : null;
check("...tags are de-duplicated case-insensitively, first casing kept, whitespace collapsed",
  opLead && JSON.stringify(opLead.tags) === JSON.stringify(["Deposit", "VIP client"]),
  opLead ? JSON.stringify(opLead.tags) : "?");
check("...and no customer is attached", opLead && opLead.customer_id === null,
  opLead ? String(opLead.customer_id) : "?");

r = await as(opN, () => db.query(
  `update public.leads set origin = 'icefall' where id = $1`, [opLead.id]));
const still = (await db.query(`select origin from public.leads where id=$1`, [opLead.id])).rows[0];
check("an operator cannot later promote it into ICEFALL's numbers",
  still.origin === "company", still.origin);

r = await as(opN, () => db.query(`delete from public.leads where id = $1`, [opLead.id]));
const survives = (await db.query(`select count(*)::int c from public.leads where id=$1`, [opLead.id])).rows[0].c;
check("an operator cannot delete a lead — even their own", survives === 1, `${survives} rows`);

r = await as(opN, () => db.query(
  `insert into public.leads (company_id, origin, source_page, tags)
   values ($1, 'company', 'x', array['1','2','3','4','5','6','7','8','9'])`, [northwind]));
check("a ninth tag is refused, not trimmed", !r.ok, r.ok ? "ACCEPTED" : r.error);

r = await as(opN, () => db.query(
  `insert into public.leads (company_id, origin, source_page, tags)
   values ($1, 'company', 'x', array['this tag is far too long to be allowed'])`, [northwind]));
check("a 25+ character tag is refused with the tag named", !r.ok, r.ok ? "ACCEPTED" : r.error);

r = await as(ops, () => db.query(
  `insert into public.leads (company_id, origin, source_page) values ($1, 'icefall', '/mountains/everest')`,
  [northwind]));
check("an ICEFALL lead without a customer is a broken record and refused", !r.ok,
  r.ok ? "INSERTED" : r.error);

r = await as(opS, () => db.query(
  `update public.leads set tags = array['poached'] where id = $1`, [opLead.id]));
const untagged = (await db.query(`select tags from public.leads where id=$1`, [opLead.id])).rows[0];
check("another company cannot touch the lead",
  JSON.stringify(untagged.tags) === JSON.stringify(["Deposit", "VIP client"]),
  JSON.stringify(untagged.tags));

console.log(`${results.length - failed}/${results.length} passed`);
await db.close();
process.exit(failed ? 1 : 0);
