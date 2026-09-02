/**
 * ICEFALL — internal business CRM: attack tests.
 *
 * The consumer apps have no test suite and do not need one; this system holds
 * money and decides who may publish to a marketplace, so it does. Every check
 * below is an attempt to do something the specification forbids, and passing
 * means the database refused.
 *
 * Four things are being defended:
 *   · authorization — an operator reaching another company, or ICEFALL internals
 *   · publication state — content becoming public without an ICEFALL decision
 *   · placement occupancy — two companies in one paid position, or a slot
 *     changing hands because a date passed
 *   · the audit log — anyone, including staff, editing the record of what they did
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");

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
  -- or trigger that calls auth.uid() fails here but not in production (and
  -- probes pass for the wrong reason — the SS1 harness lesson).
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create publication supabase_realtime;
`);
await db.exec(SQL);

/* -------------------------------------------------------------------------- */
/* Seed (as superuser — stands in for the service role)                        */
/* -------------------------------------------------------------------------- */

const mkUser = async (email, role, name) => {
  const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = u.rows[0].id;
  await db.query(`update public.profiles set role=$2, display_name=$3 where id=$1`, [id, role, name]);
  return id;
};
const mkStaff = async (email, desk, name) => {
  const id = await mkUser(email, "admin", name);
  await db.query(`insert into public.staff_members (profile_id, staff_role) values ($1,$2)`, [id, desk]);
  return id;
};

const boss    = await mkStaff("boss@icefall.test", "super_admin", "Sam Boss");
const ops     = await mkStaff("ops@icefall.test", "operations", "Ola Ops");
const sales   = await mkStaff("sales@icefall.test", "sales", "Sean Sales");
const support = await mkStaff("support@icefall.test", "support", "Sue Support");
const athlete = await mkUser("climber@x.io", "athlete", "A Climber");

// Fictional companies only. No real business appears anywhere in this system.
const mkCompany = async (slug, name) =>
  (await db.query(
    `insert into public.companies (slug, name, status) values ($1,$2,'active') returning id`,
    [slug, name],
  )).rows[0].id;

const northwind = await mkCompany("northwind-ascents", "Northwind Ascents");
const serac     = await mkCompany("serac-and-stone", "Serac & Stone Expeditions");

await db.query(`insert into public.company_internal (company_id, notes) values ($1,$2)`,
  [northwind, "Margin is thin on this account — do not extend terms."]);

const opN = await mkUser("admin@northwind.test", "operator", "Nia Northwind");
const opS = await mkUser("admin@serac.test", "operator", "Sol Serac");
const opNsales = await mkUser("sales@northwind.test", "operator", "Nils Northwind");
await db.query(
  `insert into public.company_users (company_id, profile_id, company_role)
   values ($1,$2,'admin'),($3,$4,'admin'),($1,$5,'sales')`,
  [northwind, opN, serac, opS, opNsales],
);

await db.query(`insert into public.destinations (id, name, country, elevation_m) values
  ('everest','Everest','Nepal / China',8849),
  ('mont-blanc','Mont Blanc','France / Italy',4806),
  ('denali','Denali','United States',6190)`);

await db.query(`insert into public.company_destinations (company_id, destination_id) values ($1,'everest'),($1,'mont-blanc')`,
  [northwind]);
await db.query(`insert into public.company_destinations (company_id, destination_id) values ($1,'denali')`, [serac]);

// Northwind holds Everest #1, and its term has already run out.
const expiredPlacement = (await db.query(
  `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
   values ($1,'everest',1, current_date - 120, current_date - 10, 'active') returning id`,
  [northwind],
)).rows[0].id;

// A live product belonging to Northwind, and a draft.
const liveProduct = (await db.query(
  `insert into public.products (company_id, kind, slug, name, summary, status, live_at,
                                price_from_cents, price_state)
   values ($1,'expedition','everest-south-col','Everest South Col','As published.','live', now(), 6200000,'known')
   returning id`,
  [northwind],
)).rows[0].id;

const draftProduct = (await db.query(
  `insert into public.products (company_id, kind, slug, name, status)
   values ($1,'trek','khumbu-approach','Khumbu Approach','draft') returning id`,
  [northwind],
)).rows[0].id;

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

/** Like `as`, but keeps what the call did — for asserting on side effects. */
async function asCommitted(uid, fn) {
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  try {
    const value = await fn();
    await db.exec("commit");
    return { ok: true, value };
  } catch (e) {
    await db.exec("rollback");
    return { ok: false, error: e.message.split("\n")[0] };
  }
}

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });
const rows = (r) => (r.ok ? r.value.rows.length : -1);
let r;

/* ========================================================================== */
/* Authorization — one operator must never reach another                      */
/* ========================================================================== */

r = await as(opN, () => db.query(`select id from public.companies`));
check("operator sees only their own company", r.ok && rows(r) === 1, r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opN, () => db.query(`select * from public.company_internal`));
check("operator cannot read ICEFALL internal notes", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opS, () => db.query(`select id from public.placements`));
check("operator cannot see another company's placements", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opS, () => db.query(`select id from public.placement_status`));
check("the placement view does not leak past its table", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opN, () => db.query(`select id from public.products where status <> 'live'`));
check("operator sees their own drafts", r.ok && rows(r) === 1, r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opS, () => db.query(`select id from public.products where status <> 'live'`));
check("operator cannot see another company's drafts", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(athlete, () => db.query(`select id from public.products`));
check("an athlete sees live products only", r.ok && rows(r) === 1, r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(null, () => db.query(`select id from public.companies`));
check("anon is refused companies entirely", !r.ok, r.ok ? `LEAKED ${rows(r)}` : r.error);

r = await as(null, () => db.query(`select id from public.audit_events`));
check("anon is refused the audit log", !r.ok, r.ok ? `LEAKED ${rows(r)}` : r.error);

/* ========================================================================== */
/* Staff separation                                                           */
/* ========================================================================== */

r = await as(sales, () => db.query(
  `update public.placements set slot_position = 3 where id = $1`, [expiredPlacement]));
const salesMoved = r.ok
  ? (await db.query(`select slot_position from public.placements where id=$1`, [expiredPlacement])).rows[0].slot_position === 3
  : false;
check("Sales cannot change a marketplace position", !salesMoved,
  salesMoved ? "MOVED" : (r.ok ? "no rows changed" : r.error));

r = await as(sales, () => db.query(`select public.move_placement($1, 3, 'trying it on')`, [expiredPlacement]));
check("Sales cannot call the placement mover", !r.ok, r.ok ? "MOVED" : r.error);

r = await as(support, () => db.query(
  `insert into public.staff_members (profile_id, staff_role) values ($1,'super_admin')`, [athlete]));
check("Support cannot appoint staff", !r.ok, r.ok ? "APPOINTED" : r.error);

r = await as(athlete, () => db.query(`select public.is_staff()`));
check("a plain user is not staff", r.ok && r.value.rows[0].is_staff === false,
  r.ok ? String(r.value.rows[0].is_staff) : r.error);

r = await as(ops, () => db.query(`select public.move_placement($1, 3, 'agreed at renewal')`, [expiredPlacement]));
check("Operations CAN move a placement", r.ok, r.ok ? "moved" : r.error);

/* ========================================================================== */
/* Placement occupancy                                                        */
/* ========================================================================== */

r = await as(opN, () => db.query(
  `update public.placements set slot_position = 1 where id = $1`, [expiredPlacement]));
const opMoved = r.ok
  ? (await db.query(`select changed_at from public.placements where id=$1`, [expiredPlacement])).rows[0].changed_at !== null
  : false;
check("operator cannot change its own ranking", !opMoved, opMoved ? "MOVED" : (r.ok ? "no rows changed" : r.error));

r = await as(ops, () => db.query(
  `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
   values ($1,'everest',1, current_date, current_date + 30, 'active')`, [serac]));
check("a second company cannot take an occupied slot", !r.ok, r.ok ? "DOUBLE-SOLD" : r.error);

// The whole point: the term ran out ten days ago and the slot is STILL held.
r = await db.query(
  `select effective_status, needs_review from public.placement_status where id=$1`, [expiredPlacement]);
check("an expired placement reads as expired",
  r.rows[0].effective_status === "expired" && r.rows[0].needs_review === true,
  `${r.rows[0].effective_status}, needs_review=${r.rows[0].needs_review}`);

r = await db.query(`select status, slot_position from public.placements where id=$1`, [expiredPlacement]);
check("...but still holds #1, unchanged by any timer",
  r.rows[0].status === "active" && r.rows[0].slot_position === 1,
  `status=${r.rows[0].status}, position=#${r.rows[0].slot_position}`);

// Serac takes the free #4, then tries to move onto Northwind's held #1.
const seracEverest = (await db.query(
  `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
   values ($1,'everest',4, current_date, current_date + 30,'active') returning id`, [serac],
)).rows[0].id;

r = await as(ops, () => db.query(`select public.move_placement($1, 1, 'client asked')`, [seracEverest]));
check("moving onto a held slot is refused with a usable message",
  !r.ok && /already held/.test(r.error ?? ""), r.error);

r = await as(ops, () => db.query(`select public.move_placement($1, 2, 'agreed upgrade')`, [seracEverest]));
check("...but moving onto a free slot works", r.ok, r.ok ? "moved #4 to #2" : r.error);

await db.query(`delete from public.placements where id=$1`, [seracEverest]);

/* ========================================================================== */
/* Publication state                                                          */
/* ========================================================================== */

r = await as(opN, () => db.query(
  `update public.products set name = 'Renamed without asking' where id = $1`, [liveProduct]));
const renamed = r.ok
  ? (await db.query(`select name from public.products where id=$1`, [liveProduct])).rows[0].name !== "Everest South Col"
  : false;
check("operator cannot edit a LIVE product at all", !renamed,
  renamed ? "EDITED" : (r.ok ? "no rows changed" : r.error));

r = await as(opN, () => db.query(
  `update public.products set status='live', live_at=now() where id=$1`, [draftProduct]));
const published = r.ok
  ? (await db.query(`select status from public.products where id=$1`, [draftProduct])).rows[0].status === "live"
  : false;
check("operator cannot publish its own draft", !published,
  published ? "PUBLISHED" : (r.ok ? "no rows changed" : r.error));

r = await as(opN, () => db.query(
  `insert into public.products (company_id, kind, slug, name, status, live_at)
   values ($1,'trek','sneaky','Sneaky','live', now())`, [northwind]));
check("operator cannot create a product already live", !r.ok, r.ok ? "CREATED LIVE" : r.error);

r = await as(opS, () => db.query(
  `insert into public.products (company_id, kind, slug, name) values ($1,'trek','not-mine','Not Mine')`,
  [northwind]));
check("operator cannot create a product for another company", !r.ok, r.ok ? "CREATED" : r.error);

r = await as(opS, () => db.query(
  `insert into public.product_destinations (product_id, destination_id) values ($1,'everest')`, [liveProduct]));
check("operator cannot attach a product to an unassigned mountain", !r.ok, r.ok ? "ATTACHED" : r.error);

/* ========================================================================== */
/* The approval engine                                                        */
/* ========================================================================== */

const mkVersion = (uid, payload, entity = liveProduct) =>
  as(uid, () => db.query(
    `insert into public.content_versions (entity_type, entity_id, company_id, payload, state, submitted_by, submitted_at)
     values ('product',$1,$2,$3::jsonb,'pending',$4, now()) returning id`,
    [entity, northwind, JSON.stringify(payload), uid],
  ));

r = await mkVersion(opN, { status: "live" });
check("a submission cannot smuggle a publication state", !r.ok, r.ok ? "ACCEPTED" : r.error);

r = await mkVersion(opN, { company_id: "00000000-0000-0000-0000-000000000000" });
check("a submission cannot smuggle a change of owner", !r.ok, r.ok ? "ACCEPTED" : r.error);

// A real, legitimate price change.
const priceVersion = (await db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state, submitted_by, submitted_at)
   values ('product',$1,$2,'{"price_from_cents":5900000}'::jsonb,'pending',$3, now()) returning id`,
  [liveProduct, northwind, opN],
)).rows[0].id;

r = await mkVersion(opN, { price_from_cents: 100 });
check("a second pending edit to the SAME field is refused", !r.ok && /already pending/.test(r.error ?? ""), r.error);

r = await mkVersion(opN, { summary: "A different field entirely." });
check("a pending edit to a DIFFERENT field is allowed through", r.ok, r.ok ? "accepted" : r.error);

r = await as(opN, () => db.query(`select public.approve_content_version($1, null)`, [priceVersion]));
check("operator cannot approve its own submission", !r.ok, r.ok ? "APPROVED" : r.error);

r = await as(sales, () => db.query(`select public.approve_content_version($1, null)`, [priceVersion]));
check("Sales cannot approve content", !r.ok, r.ok ? "APPROVED" : r.error);

r = await as(ops, () => db.query(`select public.decide_content_version($1,'rejected','')`, [priceVersion]));
check("a refusal with no reason is refused", !r.ok, r.ok ? "REJECTED SILENTLY" : r.error);

// Approve for real, and confirm it changed the one field and nothing else.
await db.exec("begin");
await db.exec("set local role authenticated");
await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ops]);
let approveErr = null;
try { await db.query(`select public.approve_content_version($1,'agreed at renewal')`, [priceVersion]); }
catch (e) { approveErr = e.message.split("\n")[0]; }
const after = (await db.query(`select name, summary, price_from_cents from public.products where id=$1`, [liveProduct])).rows[0];
const audited = (await db.query(
  `select action, previous, next from public.audit_events where entity_id=$1 and action='content.approved'`,
  [liveProduct])).rows;
check("approving applies the proposed field",
  !approveErr && Number(after.price_from_cents) === 5900000, approveErr ?? `price=${after.price_from_cents}`);
check("...and leaves every other field alone",
  after.name === "Everest South Col" && after.summary === "As published.", `${after.name} / ${after.summary}`);
check("...and writes an audit event carrying the change",
  audited.length === 1 && audited[0].next?.price_from_cents === 5900000,
  audited.length ? JSON.stringify(audited[0].next) : "no audit event");
await db.exec("rollback");

/* ========================================================================== */
/* The audit log is append-only for EVERYONE                                  */
/* ========================================================================== */

await db.query(
  `insert into public.audit_events (actor_id, actor_role, action, entity_type, entity_id)
   values ($1,'operations','placement.moved','placement',$2)`, [ops, expiredPlacement]);

r = await as(boss, () => db.query(`update public.audit_events set action='nothing happened'`));
check("a super admin cannot rewrite the audit log", !r.ok, r.ok ? "REWRITTEN" : r.error);

r = await as(boss, () => db.query(`delete from public.audit_events`));
check("a super admin cannot delete an audit event", !r.ok, r.ok ? "DELETED" : r.error);

// The trigger, not the policy — this is the service role's own connection.
let ownerBlocked = false;
try { await db.query(`update public.audit_events set action='tidied'`); }
catch { ownerBlocked = true; }
check("not even the service role can edit it (trigger, not policy)", ownerBlocked,
  ownerBlocked ? "trigger refused" : "EDITED BY OWNER");

r = await as(opN, () => db.query(`select id from public.audit_events`));
check("operator cannot read the audit log", r.ok && rows(r) === 0, r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(athlete, () => db.query(
  `select public.record_audit_event('forged','company',$1)`, [northwind]));
check("a non-staff user cannot forge an audit event", !r.ok, r.ok ? "FORGED" : r.error);

/* ========================================================================== */
/* Honesty constraints — the database refuses to hold a fabrication           */
/* ========================================================================== */

let e = null;
try {
  await db.query(`insert into public.companies (slug, name, verification_status)
                  values ('ghost-peaks','Ghost Peaks','verified')`);
} catch (err) { e = err.message.split("\n")[0]; }
check("a company cannot be 'verified' with no reviewer or date", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(`update public.companies set documents_checked_at = now() where id = $1`, [serac]);
} catch (err) { e = err.message.split("\n")[0]; }
// Must fail on the COHERENCE CONSTRAINT, not on a missing column. This assertion
// silently passed for the wrong reason after the rename from `verified_at`, which
// is how a suite keeps reporting green while covering nothing.
check("an unverified company cannot carry a check date",
  e !== null && /companies_verification_coherent/.test(e), e ?? "ACCEPTED");

e = null;
try {
  await db.query(`insert into public.products (company_id, kind, slug, name, price_state, price_from_cents)
                  values ($1,'trek','free-lunch','Free Lunch','unknown',0)`, [serac]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an unknown price cannot be stored as a number", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(`insert into public.media_assets (company_id, kind, storage_path, state)
                  values ($1,'image','x.jpg','approved')`, [serac]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a photograph cannot be approved without a licence and credit", e !== null, e ?? "ACCEPTED");

/* -------------------------------------------------------------------------- */

/* ========================================================================== */
/* The two operator roles                                                     */
/* ========================================================================== */

r = await as(opNsales, () => db.query(`select id from public.products where status <> 'live'`));
check("a Sales Employee can READ their company's drafts", r.ok && rows(r) === 1,
  r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opNsales, () => db.query(
  `update public.products set name='Sales renamed it' where id=$1`, [draftProduct]));
const salesEdited = r.ok
  ? (await db.query(`select name from public.products where id=$1`, [draftProduct])).rows[0].name !== "Khumbu Approach"
  : false;
check("a Sales Employee cannot edit the catalogue", !salesEdited,
  salesEdited ? "EDITED" : (r.ok ? "no rows changed" : r.error));

r = await as(opNsales, () => db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('product',$1,$2,'{"summary":"nope"}'::jsonb,'pending')`, [liveProduct, northwind]));
check("a Sales Employee cannot submit content for review", !r.ok, r.ok ? "SUBMITTED" : r.error);

/* ========================================================================== */
/* Placements are read-only at the privilege layer                            */
/* ========================================================================== */

r = await as(ops, () => db.query(
  `update public.placements set slot_position = 5 where id = $1`, [expiredPlacement]));
check("even Operations cannot UPDATE placements directly", !r.ok,
  r.ok ? "UPDATED WITHOUT AUDIT" : r.error);

r = await as(ops, () => db.query(
  `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on)
   values ($1,'denali',1, current_date, current_date + 30)`, [serac]));
check("...nor INSERT one directly", !r.ok, r.ok ? "INSERTED WITHOUT AUDIT" : r.error);

r = await asCommitted(ops, () => db.query(
  `select public.create_placement($1,'denali',1, current_date, current_date + 30, 250000)`, [serac]));
check("Operations creates one through the audited function", r.ok, r.ok ? "created" : r.error);

r = await as(sales, () => db.query(
  `select public.create_placement($1,'denali',2, current_date, current_date + 30, 250000)`, [serac]));
check("Sales cannot create a placement", !r.ok, r.ok ? "CREATED" : r.error);

r = await as(ops, () => db.query(`select public.cancel_placement($1, '')`, [expiredPlacement]));
check("cancelling a paid position needs a reason", !r.ok, r.ok ? "CANCELLED SILENTLY" : r.error);

// Cancelling is the ONLY thing that frees a slot — and then only for a person.
await db.exec("begin");
await db.exec("set local role authenticated");
await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [ops]);
let freed = false, freeErr = null;
try {
  await db.query(`select public.cancel_placement($1,'term ended, not renewed')`, [expiredPlacement]);
  await db.query(
    `select public.create_placement($1,'everest',1, current_date, current_date + 365, 900000)`, [serac]);
  freed = true;
} catch (e) { freeErr = e.message.split("\n")[0]; }
await db.exec("rollback");
check("a cancelled slot can then be reassigned by a person", freed, freeErr ?? "reassigned");

// The audit event is a CONSEQUENCE of the write, not a second call the caller
// could forget: the only way to create a placement also wrote this row.
const created = (await db.query(
  `select actor_id, next from public.audit_events
   where action = 'placement.created' and entity_type = 'placement'`)).rows;
check("creating a placement wrote its own audit event",
  created.length === 1 && created[0].actor_id === ops && created[0].next?.destination_id === "denali",
  created.length ? JSON.stringify(created[0].next) : "no audit event");

/* ========================================================================== */
/* Departures — the split write path                                          */
/* ========================================================================== */

const departure = (await db.query(
  `insert into public.product_departures (product_id, departure_date, price_cents, availability, spots_total, spots_left)
   values ($1, current_date + 200, 6200000, 'available', 12, 12) returning id`, [liveProduct],
)).rows[0].id;

r = await as(opN, () => db.query(
  `update public.product_departures set spots_left = 3, availability='limited' where id=$1`, [departure]));
check("operator CAN mark its own departure nearly full", r.ok, r.ok ? "updated" : r.error);

r = await as(opN, () => db.query(
  `update public.product_departures set price_cents = 100 where id=$1`, [departure]));
check("operator CANNOT change the advertised price", !r.ok, r.ok ? "REPRICED" : r.error);

r = await as(opN, () => db.query(
  `update public.product_departures set departure_date = current_date + 400 where id=$1`, [departure]));
check("operator CANNOT move the departure date", !r.ok, r.ok ? "MOVED" : r.error);

r = await as(ops, () => db.query(
  `select public.set_departure_terms($1, current_date + 210, null, 6400000, 'agreed')`, [departure]));
check("Operations changes price and date through the function", r.ok, r.ok ? "set" : r.error);

r = await as(opN, () => db.query(
  `insert into public.product_departures (product_id, departure_date) values ($1, current_date + 300)`,
  [liveProduct]));
check("operator cannot add a departure to a LIVE product", !r.ok, r.ok ? "ADDED" : r.error);

/* ========================================================================== */
/* Approval will not overwrite a value that moved underneath it               */
/* ========================================================================== */

const staleVersion = (await db.query(
  `insert into public.content_versions
     (entity_type, entity_id, company_id, payload, base_snapshot, state, submitted_by, submitted_at)
   values ('product',$1,$2,'{"summary":"Rewritten by the operator."}'::jsonb,
           '{"summary":"What the operator was looking at."}'::jsonb,'pending',$3, now())
   returning id`,
  [draftProduct, northwind, opN],
)).rows[0].id;

r = await as(ops, () => db.query(`select public.approve_content_version($1, null)`, [staleVersion]));
check("a change proposed against a stale value is refused",
  !r.ok && /changed after this was proposed/.test(r.error ?? ""), r.error);

/* ========================================================================== */
/* Contact details are flagged for a person, never silently blocked           */
/* ========================================================================== */

const flagged = (await db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('product',$1,$2,'{"summary":"Book direct — email us at hello@example.com"}'::jsonb,'draft')
   returning flags`, [draftProduct, northwind],
)).rows[0].flags;
check("a contact address in submitted copy is flagged",
  Array.isArray(flagged) && flagged.includes("possible_contact_details"), JSON.stringify(flagged));

const unflagged = (await db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('product',$1,$2,'{"description":"Call the hut on arrival to confirm beds."}'::jsonb,'draft')
   returning flags`, [draftProduct, northwind],
)).rows[0].flags;
check("...but ordinary prose is not", Array.isArray(unflagged) && unflagged.length === 0,
  JSON.stringify(unflagged));


/* ========================================================================== */
/* Media storage — the row half of the bucket convention                      */
/* ========================================================================== */

// The storage policies live in a schema PGlite does not have, so what is checked
// here is the constraint that makes the convention hold on the row: an asset
// cannot name a path outside its own company's folder.
const okPath = `${northwind}/company/logo.webp`;

e = null;
try {
  await db.query(
    `insert into public.media_assets (company_id, kind, storage_path, mime_type, byte_size)
     values ($1,'image',$2,'image/webp',48000)`, [northwind, okPath]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an asset in its own company folder is accepted", e === null, e ?? "accepted");

e = null;
try {
  await db.query(
    `insert into public.media_assets (company_id, kind, storage_path, mime_type, byte_size)
     values ($1,'image',$2,'image/webp',48000)`, [northwind, `${serac}/company/stolen.webp`]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an asset cannot name another company's folder", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.media_assets (company_id, kind, storage_path, mime_type, byte_size)
     values ($1,'image',$2,'image/svg+xml',4000)`, [northwind, `${northwind}/company/logo.svg`]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an SVG is refused — it is a script vector, not a logo format", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.media_assets (company_id, kind, storage_path, mime_type, byte_size)
     values ($1,'image',$2,'image/jpeg', 40000000)`, [northwind, `${northwind}/company/huge.jpg`]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an oversized image is refused", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.media_assets (company_id, kind, storage_path, state, licence, credit)
     values ($1,'image',$2,'approved','CC BY 4.0','A Photographer')`,
    [northwind, `${northwind}/company/untyped.jpg`]);
} catch (err) { e = err.message.split("\n")[0]; }
check("nothing is approved without ICEFALL knowing what it is", e !== null, e ?? "ACCEPTED");


/* ========================================================================== */
/* The expiry sweep notifies. It must not act.                                */
/* ========================================================================== */

const before = (await db.query(
  `select slot_position, status, ends_on from public.placements where id=$1`, [expiredPlacement])).rows[0];

r = await as(athlete, () => db.query(`select public.raise_expiry_tasks()`));
check("a non-staff user cannot run the expiry sweep", !r.ok, r.ok ? "RAN" : r.error);

r = await asCommitted(ops, () => db.query(`select public.raise_expiry_tasks() as n`));
check("Operations runs the sweep", r.ok, r.ok ? `${r.value.rows[0].n} task(s)` : r.error);

const expiredTask = (await db.query(
  `select kind, priority, entity_id, detail from public.tasks
   where kind='placement_expired' and entity_id=$1`, [expiredPlacement])).rows;
check("the expired placement raised a task for a person",
  expiredTask.length === 1 && expiredTask[0].priority === "high",
  expiredTask.length ? expiredTask[0].priority : "none");

// THE POINT OF THE WHOLE DESIGN.
const afterSweep = (await db.query(
  `select slot_position, status, ends_on from public.placements where id=$1`, [expiredPlacement])).rows[0];
check("...and the sweep changed NOTHING about the placement",
  afterSweep.slot_position === before.slot_position
    && afterSweep.status === before.status
    && String(afterSweep.ends_on) === String(before.ends_on),
  `still #${afterSweep.slot_position}, ${afterSweep.status}`);

// An alert queue that duplicates is one people stop reading.
const firstCount = Number((await db.query(`select count(*) as n from public.tasks`)).rows[0].n);
await asCommitted(ops, () => db.query(`select public.raise_expiry_tasks()`));
const secondCount = Number((await db.query(`select count(*) as n from public.tasks`)).rows[0].n);
check("running the sweep twice does not duplicate its tasks",
  firstCount === secondCount, `${firstCount} then ${secondCount}`);

r = await as(opN, () => db.query(`select id from public.tasks`));
check("an operator cannot read ICEFALL's task queue", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

/* ---- deals --------------------------------------------------------------- */

e = null;
try {
  await db.query(
    `insert into public.deals (company_id, title, stage) values ($1,'Everest 2027','lost')`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a deal cannot be marked lost without saying why", e !== null, e ?? "ACCEPTED");

const deal = (await db.query(
  `insert into public.deals (company_id, title, stage, estimated_value_cents)
   values ($1,'Everest 2027 placements','proposal', 1200000) returning id, probability_pct`,
  [northwind])).rows[0];
check("a deal's probability is NOT derived from its stage",
  deal.probability_pct === null, `${deal.probability_pct}`);

r = await as(opN, () => db.query(`select id from public.deals`));
check("an operator cannot see what ICEFALL thinks they are worth", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(support, () => db.query(
  `insert into public.deals (company_id, title) values ($1,'Support wrote this')`, [northwind]));
check("Support cannot create a deal", !r.ok, r.ok ? "CREATED" : r.error);


/* ========================================================================== */
/* A company banner must be that company's OWN media                          */
/* ========================================================================== */

// The foreign key only says the asset exists. Without the trigger, one company
// could point its banner at another company's file — and a rejected image from
// one operator would appear on a competitor's page.
const ownBanner = (await db.query(
  `insert into public.media_assets (company_id, kind, storage_path, mime_type, byte_size)
   values ($1,'image',$2,'image/webp',180000) returning id`,
  [northwind, `${northwind}/company/banner.webp`])).rows[0].id;

const otherBanner = (await db.query(
  `insert into public.media_assets (company_id, kind, storage_path, mime_type, byte_size)
   values ($1,'image',$2,'image/webp',180000) returning id`,
  [serac, `${serac}/company/banner.webp`])).rows[0].id;

e = null;
try {
  await db.query(`update public.companies set banner_media_id = $1 where id = $2`,
    [ownBanner, northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a company can use its own image as a banner", e === null, e ?? "set");

e = null;
try {
  await db.query(`update public.companies set banner_media_id = $1 where id = $2`,
    [otherBanner, northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("A COMPANY CANNOT POINT ITS BANNER AT ANOTHER COMPANY'S FILE",
  e !== null && /own media asset/.test(e), e ?? "ACCEPTED");

// It is proposable through the approval engine, like every other operator field.
r = await as(opN, () => db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('company',$1,$1,$2::jsonb,'draft') returning id`,
  [northwind, JSON.stringify({ banner_media_id: ownBanner })]));
check("a banner can be proposed through a content version", r.ok, r.ok ? "accepted" : r.error);

/* ---- the film, which lives PER MOUNTAIN ---------------------------------- */

// THE GUARD, RESTORED ONE LEVEL ALONG. An earlier version of this schema put the
// film on `companies`, inferred from "the film appears in both places" — which is
// silent on whether it is the SAME film. The owner ruled one film per mountain:
// a climber looking at Denali should see Denali footage. This stops a future
// session putting it back on the entity that was ruled against.
const strayCols = (await db.query(
  `select column_name from information_schema.columns
   where table_name='companies' and column_name like 'video%'`)).rows;
check("the film is NOT on companies — it was ruled per-mountain",
  strayCols.length === 0, strayCols.map((c) => c.column_name).join(",") || "none");

const nwEverest = (await db.query(
  `select id from public.company_destinations where company_id=$1 and destination_id='everest'`,
  [northwind])).rows[0].id;

// The three columns cannot disagree about whether there is a film, or where it
// comes from. This is the part Session 04 said they actually cared about.
for (const [name, setter] of [
  ["youtube with no id", `video_source='youtube'`],
  ["upload with no asset", `video_source='upload'`],
  ["none but an id anyway", `video_source='none', video_youtube_id='dQw4w9WgXcQ'`],
]) {
  e = null;
  try {
    await db.query(`update public.company_destinations set ${setter} where id=$1`, [nwEverest]);
  } catch (err) { e = err.message.split("\n")[0]; }
  check(`a film cannot be ${name}`, e !== null, e ?? "ACCEPTED");
}

// AN ID, NEVER A URL. icefall-web mounts a youtube-nocookie iframe only after a
// click; a URL column is one step from embedding on load and contacting Google
// for every reader who never watches.
e = null;
try {
  await db.query(
    `update public.company_destinations set video_source='youtube', video_youtube_id=$1 where id=$2`,
    ["https://youtube.com/watch?v=dQw4w9WgXcQ", nwEverest]);
} catch (err) { e = err.message.split("\n")[0]; }
check("A URL CANNOT BE STORED WHERE AN ID BELONGS", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `update public.company_destinations set video_source='youtube', video_youtube_id='dQw4w9WgXcQ'
     where id=$1`, [nwEverest]);
} catch (err) { e = err.message.split("\n")[0]; }
check("...but a real eleven-character id is accepted", e === null, e ?? "REFUSED");

// A company can hold a DIFFERENT film on a different mountain. That is the whole
// point of the move, so it is asserted rather than assumed.
const nwMontBlanc = (await db.query(
  `select id from public.company_destinations where company_id=$1 and destination_id='mont-blanc'`,
  [northwind])).rows[0].id;
e = null;
try {
  await db.query(
    `update public.company_destinations set video_source='youtube', video_youtube_id='aBcDeFgHiJk'
     where id=$1`, [nwMontBlanc]);
} catch (err) { e = err.message.split("\n")[0]; }
const twoFilms = (await db.query(
  `select destination_id, video_youtube_id from public.company_destinations
   where company_id=$1 and video_youtube_id is not null order by destination_id`, [northwind])).rows;
check("one company can hold a different film on each mountain",
  e === null && twoFilms.length === 2 && twoFilms[0].video_youtube_id !== twoFilms[1].video_youtube_id,
  e ?? twoFilms.map((t) => `${t.destination_id}=${t.video_youtube_id}`).join(", "));

// The ownership rule reaches the film. On a mountain where two companies both
// hold placements, their blocks sit side by side — so a borrowed clip would play
// inside a competitor's block.
e = null;
try {
  await db.query(
    `update public.company_destinations
     set video_source='upload', video_youtube_id=null, video_media_id=$1 where id=$2`,
    [otherBanner, nwEverest]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a company cannot use another company's file as its film",
  e !== null && /own media asset/.test(e), e ?? "ACCEPTED");

r = await as(opN, () => db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('company_mountain',$1,$2,'{"video_source":"none"}'::jsonb,'draft') returning id`,
  [nwEverest, northwind]));
check("the film is proposable through a content version", r.ok, r.ok ? "accepted" : r.error);


/* ========================================================================== */
/* Treks are placeable inventory too                                          */
/* ========================================================================== */

await db.query(
  `insert into public.destinations (id, name, kind, region, country, max_altitude_m, max_altitude_of, duration_days_min, duration_days_max)
   values ('tour-du-mont-blanc','Tour du Mont Blanc','trek','Alps','France / Italy / Switzerland', 2665, 'Grand Col Ferret', 10, 11)`);

// A SUMMIT ELEVATION BELONGS TO A MOUNTAIN. A trek has a high point, which is a
// different claim — "5,364 m" beside a trek name reads as a summit reached.
e = null;
try {
  await db.query(`update public.destinations set elevation_m = 2665 where id='tour-du-mont-blanc'`);
} catch (err) { e = err.message.split("\n")[0]; }
check("a trek cannot carry a summit elevation", e !== null, e ?? "ACCEPTED");

// The five-slot rule is the destination's, not the mountain's — so it holds on a
// trek unchanged, including the index that makes double-selling impossible.
await db.query(
  `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
   values ($1,'tour-du-mont-blanc',1, current_date, current_date + 300, 'active')`, [northwind]);
e = null;
try {
  await db.query(
    `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
     values ($1,'tour-du-mont-blanc',1, current_date, current_date + 300, 'active')`, [serac]);
} catch (err) { e = err.message.split("\n")[0]; }
check("two companies cannot hold the same slot on a TREK either", e !== null, e ?? "DOUBLE-SOLD");

// The pairing has to mean what it says.
e = null;
try {
  await db.query(`insert into public.trek_mountains (trek_id, destination_id) values ('everest','mont-blanc')`);
} catch (err) { e = err.message.split("\n")[0]; }
check("a mountain cannot be filed as a trek", e !== null && /not a trek/.test(e), e ?? "ACCEPTED");

e = null;
try {
  await db.query(`insert into public.trek_mountains (trek_id, destination_id) values ('tour-du-mont-blanc','everest')`);
} catch (err) { e = err.message.split("\n")[0]; }
check("a trek links to a mountain", e === null, e ?? "linked");

const dest = (await db.query(
  `select d.kind, (select count(*) from public.placements p
                    where p.destination_id = d.id and p.status in ('reserved','active')) as held
   from public.destinations d where d.id='tour-du-mont-blanc'`)).rows[0];
check("a trek is a destination holding placements", dest.kind === "trek" && Number(dest.held) === 1,
  `${dest.kind}, ${dest.held} held`);


// A TREK HAS THREE POSITIONS, A MOUNTAIN FIVE. Owner decision 17: 252 treks at
// five apiece would be 1,260 sellable positions, and scarcity is the whole of
// what a featured slot is worth paying for.
e = null;
try {
  await db.query(
    `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
     values ($1,'tour-du-mont-blanc',4, current_date, current_date + 300, 'active')`, [serac]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a trek has no fourth position", e !== null && /no #4/.test(e), e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.placements (company_id, destination_id, slot_position, starts_on, ends_on, status)
     values ($1,'tour-du-mont-blanc',3, current_date, current_date + 300, 'active')`, [serac]);
} catch (err) { e = err.message.split("\n")[0]; }
check("...but it does have a third", e === null, e ?? "accepted");

// The mountain ceiling is unchanged.
const fifth = (await db.query(
  `select public.slots_for_kind('mountain') as m, public.slots_for_kind('trek') as t`)).rows[0];
check("mountains keep five, treks get three", fifth.m === 5 && fifth.t === 3, `${fifth.m} / ${fifth.t}`);

// ONE TABLE IS ONLY SAFE WHILE NO SLUG MEANS TWO THINGS. It holds across all 304
// rows today, and the primary key is what keeps it true — but a seed written
// with `on conflict do nothing` would SKIP the collision silently rather than
// fail, which is how a trek goes missing and nobody notices.
e = null;
try {
  await db.query(`insert into public.destinations (id, name, kind) values ('everest','Everest Trek','trek')`);
} catch (err) { e = err.message.split("\n")[0]; }
check("a slug cannot mean both a mountain and a trek", e !== null, e ?? "ACCEPTED");


/* ========================================================================== */
/* THE CROSS-COMPANY OVERWRITE — the one that mattered                        */
/* ========================================================================== */

// Company A reads B's LIVE product (the marketplace lets any signed-in user do
// that, deliberately), then submits a content version claiming its OWN company_id
// but B's entity_id. Every individual guard passed; nothing tied the two
// operator-supplied columns together. On approval it overwrote B's live listing
// and the audit event blamed A.
const seracProduct = (await db.query(
  `insert into public.products (company_id, kind, slug, name, status, live_at, price_from_cents, price_state)
   values ($1,'expedition','serac-denali','Denali — West Buttress','live', now(), 980000,'known')
   returning id`, [serac])).rows[0].id;

r = await as(opN, () => db.query(`select id, name from public.products where id=$1`, [seracProduct]));
check("a company CAN read another's live product — that is the marketplace",
  r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(opN, () => db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state, submitted_at)
   values ('product',$1,$2,'{"name":"Renamed by a competitor"}'::jsonb,'pending', now())`,
  [seracProduct, northwind]));
check("A COMPANY CANNOT SUBMIT AN EDIT AGAINST ANOTHER COMPANY'S PRODUCT",
  !r.ok && /belongs to another company/.test(r.error ?? ""), r.error);

// Same shape, one level along: claiming a company record that is not yours.
r = await as(opN, () => db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('company',$1,$2,'{"description":"theirs"}'::jsonb,'draft')`, [serac, northwind]));
check("...nor against another company's own record", !r.ok, r.ok ? "ACCEPTED" : r.error);

// And an entity that does not exist at all is refused rather than silently
// creating a version nobody can approve.
r = await as(opN, () => db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, state)
   values ('product','00000000-0000-4000-8000-000000000000',$1,'{"name":"ghost"}'::jsonb,'draft')`,
  [northwind]));
check("...nor against a product that does not exist", !r.ok, r.ok ? "ACCEPTED" : r.error);

// The validator refuses this even for the SERVICE ROLE — a trigger runs whoever
// you are — so the row has to be forced past it to test the second guard. That
// is the point of having two: a version can sit in the queue across an ownership
// change or a migration that alters what the first one does.
await db.exec("alter table public.content_versions disable trigger content_versions_validate");
const smuggled = (await db.query(
  `insert into public.content_versions (entity_type, entity_id, company_id, payload, changed_fields, state, submitted_at)
   values ('product',$1,$2,'{"name":"Slipped past"}'::jsonb, array['name'],'pending', now())
   returning id`, [seracProduct, northwind])).rows[0].id;
await db.exec("alter table public.content_versions enable trigger content_versions_validate");
r = await as(ops, () => db.query(`select public.approve_content_version($1, null)`, [smuggled]));
check("approval refuses a version naming another company's record",
  !r.ok && /does not belong to its company/.test(r.error ?? ""), r.error);

const untouched = (await db.query(`select name from public.products where id=$1`, [seracProduct])).rows[0];
check("...and the victim's listing is untouched", untouched.name === "Denali — West Buttress", untouched.name);


/* ========================================================================== */
/* INVITATIONS — the only path to an account you did not sign up for          */
/* ========================================================================== */

// Somebody with an account but no membership and no staff role.
const outsider = await mkUser("outsider@x.io", "athlete", "An Outsider");

r = await as(opNsales, () => db.query(
  `select public.invite_company_user($1,'colleague@northwind.test','sales')`, [northwind]));
check("a Sales Employee cannot invite colleagues", !r.ok, r.ok ? "INVITED" : r.error);

r = await as(opS, () => db.query(
  `select public.invite_company_user($1,'spy@serac.test','admin')`, [northwind]));
check("a company admin cannot invite into ANOTHER company", !r.ok, r.ok ? "INVITED" : r.error);

r = await as(support, () => db.query(`select public.invite_staff('newstaff@icefall.test','finance')`));
check("only a super admin may invite staff", !r.ok, r.ok ? "INVITED" : r.error);

r = await as(opN, () => db.query(
  `insert into public.invitations (email, kind, staff_role, invited_by)
   values ('self@x.io','staff','super_admin',$1)`, [opN]));
check("nobody can hand-write an invitation", !r.ok, r.ok ? "INSERTED" : r.error);

// The escalation path, exercised end to end.
r = await asCommitted(boss, () => db.query(
  `select public.invite_staff('outsider@x.io','support')`));
check("a super admin invites new staff", r.ok, r.ok ? "invited" : r.error);

const beforeAccept = (await db.query(`select role from public.profiles where id=$1`, [outsider])).rows[0];
check("...and the invitee is still only an athlete until they accept",
  beforeAccept.role === "athlete", beforeAccept.role);

r = await asCommitted(outsider, () => db.query(`select public.accept_invitations() as n`));
check("accepting consumes it", r.ok && r.value.rows[0].n === 1, r.ok ? `${r.value.rows[0].n}` : r.error);

const afterAccept = (await db.query(
  `select p.role, s.staff_role, s.active from public.profiles p
   left join public.staff_members s on s.profile_id = p.id where p.id=$1`, [outsider])).rows[0];
check("...and only then are they staff",
  afterAccept.role === "admin" && afterAccept.staff_role === "support" && afterAccept.active === true,
  `${afterAccept.role} / ${afterAccept.staff_role}`);

const accepted = (await db.query(
  `select action from public.audit_events where action='invitation.accepted'`)).rows;
check("becoming staff is audited", accepted.length === 1, `${accepted.length}`);

// Accepting twice does nothing — the invitation is consumed.
r = await asCommitted(outsider, () => db.query(`select public.accept_invitations() as n`));
check("there is nothing left to accept a second time",
  r.ok && r.value.rows[0].n === 0, r.ok ? `${r.value.rows[0].n}` : r.error);

// AN INVITATION IS TO AN ADDRESS, NOT A NAME. Somebody else signing in accepts
// nothing, because the function reads the caller's own email rather than
// trusting an argument.
await db.query(
  `insert into public.invitations (email, kind, staff_role, invited_by, expires_at)
   values ('someoneelse@x.io','staff','super_admin',$1, now() + interval '7 days')`, [boss]);
r = await asCommitted(athlete, () => db.query(`select public.accept_invitations() as n`));
check("you cannot accept somebody else's invitation",
  r.ok && r.value.rows[0].n === 0, r.ok ? `${r.value.rows[0].n} accepted` : r.error);
const stillAthlete = (await db.query(`select role from public.profiles where id=$1`, [athlete])).rows[0];
check("...and it did not touch their role", stillAthlete.role === "athlete", stillAthlete.role);

// Expired and revoked invitations are inert.
const stale = await mkUser("stale@x.io", "athlete", "Stale Invitee");
await db.query(
  `insert into public.invitations (email, kind, staff_role, invited_by, expires_at)
   values ('stale@x.io','staff','finance',$1, now() - interval '1 day')`, [boss]);
r = await asCommitted(stale, () => db.query(`select public.accept_invitations() as n`));
check("an expired invitation cannot be accepted",
  r.ok && r.value.rows[0].n === 0, r.ok ? `${r.value.rows[0].n}` : r.error);

r = await as(opS, () => db.query(`select id from public.invitations`));
check("a company cannot read another's invitations", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);


// THE OTHER BRANCH. An operator accepting is NOT staff at the moment the audit
// event is written, and `audit_events_insert` requires `is_staff()`. The staff
// branch passes that check only because it has just made itself staff. Nothing
// proved the company branch could write its own audit row.
const hire = await mkUser("hire@northwind.test", "athlete", "New Hire");
r = await asCommitted(boss, () => db.query(
  `select public.invite_company_user($1,'hire@northwind.test','sales')`, [northwind]));
check("staff invite a company's employee", r.ok, r.ok ? "invited" : r.error);

r = await asCommitted(hire, () => db.query(`select public.accept_invitations() as n`));
check("A COMPANY USER CAN ACCEPT — the non-staff branch writes its audit row",
  r.ok && r.value.rows[0].n === 1, r.ok ? `${r.value.rows[0].n}` : r.error);

const mem = (await db.query(
  `select cu.company_role, cu.status, p.role from public.company_users cu
   join public.profiles p on p.id = cu.profile_id
   where cu.profile_id=$1 and cu.company_id=$2`, [hire, northwind])).rows[0];
check("...the membership is live", mem && mem.company_role === "sales" && mem.status === "active",
  mem ? `${mem.company_role}/${mem.status}` : "NO MEMBERSHIP");
check("...and joining a company did NOT make them ICEFALL staff",
  mem && mem.role === "athlete", mem ? mem.role : "?");

const cAudit = (await db.query(
  `select count(*)::int c from public.audit_events
   where action='invitation.accepted' and entity_type='company_user'`)).rows[0].c;
check("...and the acceptance is on the record", cAudit === 1, `${cAudit}`);


/* ========================================================================== */
/* CATALOGUE FRESHNESS — what the phone app is allowed to believe             */
/* ========================================================================== */

r = await as(null, () => db.query(`select * from public.catalogue_changes`));
check("anon cannot read the change feed directly", !r.ok, r.ok ? `LEAKED ${rows(r)}` : r.error);

r = await as(null, () => db.query(`select * from public.catalogue_head()`));
check("anon CAN ask how fresh the catalogue is", r.ok && rows(r) === 1,
  r.ok ? "answered" : r.error);
const head = r.ok ? r.value.rows[0] : null;
check("...and the server states the time, not the caller",
  head && head.server_time instanceof Date, head ? typeof head.server_time : "?");
// A change token must never move backwards, or a client stops refetching.
const beforeRev = head ? Number(head.latest_revision) : -1;
await db.query(`update public.destinations set region = 'Khumbu' where id='everest'`);
r = await as(null, () => db.query(`select latest_revision from public.catalogue_head()`));
check("the change token only ever moves forward",
  r.ok && Number(r.value.rows[0].latest_revision) > beforeRev,
  r.ok ? `${beforeRev} -> ${r.value.rows[0].latest_revision}` : r.error);

// A DRAFT IS NOBODY'S BUSINESS. The feed is world-readable through the
// functions, so an unpublished listing must not appear in it even as an id.
const leaked = (await db.query(
  `select count(*)::int c from public.catalogue_changes where entity_id = $1`,
  [draftProduct])).rows[0].c;
check("A DRAFT PRODUCT NEVER ENTERS THE PUBLIC FEED", leaked === 0, `${leaked} entries`);

await db.query(`update public.products set summary='quietly reworded' where id=$1`, [draftProduct]);
const stillHidden = (await db.query(
  `select count(*)::int c from public.catalogue_changes where entity_id = $1`,
  [draftProduct])).rows[0].c;
check("...and editing it in private stays private", stillHidden === 0, `${stillHidden} entries`);

// Publication, revision and withdrawal each read correctly.
await db.query(
  `update public.products set status='live', live_at=now() where id=$1`, [draftProduct]);
let feed = (await db.query(
  `select change from public.catalogue_changes where entity_id=$1 order by revision`,
  [draftProduct])).rows.map(x => x.change);
check("publishing it appears as a creation", feed.join(",") === "created", feed.join(",") || "nothing");

await db.query(`update public.products set summary='now public' where id=$1`, [draftProduct]);
await db.query(`update public.products set status='archived' where id=$1`, [draftProduct]);
feed = (await db.query(
  `select change from public.catalogue_changes where entity_id=$1 order by revision`,
  [draftProduct])).rows.map(x => x.change);
check("editing then withdrawing reads created,updated,removed",
  feed.join(",") === "created,updated,removed", feed.join(","));

// THE POINT OF THE WHOLE DESIGN: a withdrawal must be something a stale client
// can learn about, because that is the change it most needs.
r = await as(null, () => db.query(
  `select entity_id, change from public.catalogue_since(now() - interval '1 hour')`));
const sawRemoval = r.ok && r.value.rows.some(x => x.entity_id === draftProduct && x.change === "removed");
check("a stale client is told the listing went away", sawRemoval,
  r.ok ? `${rows(r)} changes` : r.error);

// A placement's term ends with nobody writing anything, so the head has to say
// when that is due or a client will keep showing an operator who has gone.
await db.query(
  `update public.placements set ends_on = current_date + 3 where status='active'`);
r = await as(null, () => db.query(`select next_scheduled_change from public.catalogue_head()`));
const nxt = r.ok ? r.value.rows[0].next_scheduled_change : null;
check("THE HEAD ANNOUNCES A CHANGE NOBODY WILL WRITE", r.ok && nxt !== null,
  nxt ? String(nxt).slice(0, 10) : "NOT ANNOUNCED");


/* ========================================================================== */
/* REAL-BUSINESS DISCLOSURE FLAG — the column the fixture guard was missing   */
/* ========================================================================== */

// A company created without mentioning the flag is INVENTED by default. The
// unsafe default would silently cost a real company its disclosure banner.
r = await asCommitted(boss, () => db.query(
  `insert into public.companies (slug, name) values ('flag-check-co', 'Flag Check Co') returning real_business`));
check("a new company defaults to real_business = false",
  r.ok && r.value.rows[0].real_business === false,
  r.ok ? String(r.value.rows[0].real_business) : r.error);

// There is no third state: NULL would read as "we do not know", which the
// guard renders identically to "invented" — silence on the one listing where
// silence is the harm.
r = await as(boss, () => db.query(
  `update public.companies set real_business = null where slug = 'flag-check-co'`));
check("the flag cannot be NULL — no silent third state", !r.ok, r.ok ? "NULLED" : r.error);

// Staff may set it deliberately; an operator cannot touch the row at all (the
// existing update policy), so no draft or portal path can clear a disclosure.
r = await asCommitted(boss, () => db.query(
  `update public.companies set real_business = true where slug = 'flag-check-co' returning real_business`));
check("staff can mark a company as a real business",
  r.ok && r.value.rows[0].real_business === true, r.ok ? "marked" : r.error);
r = await as(opN, () => db.query(
  `update public.companies set real_business = false where slug = 'flag-check-co'`));
const flagStill = (await db.query(
  `select real_business from public.companies where slug = 'flag-check-co'`)).rows[0];
check("an operator cannot clear a real company's disclosure",
  flagStill.real_business === true, String(flagStill.real_business));


/* ========================================================================== */
/* COMPANY AUDIT TRIGGER — today's question, never unanswerable again         */
/* ========================================================================== */

// The exact scenario from 30 Aug: a company appears in the database. Who?
r = await asCommitted(boss, () => db.query(
  `insert into public.companies (slug, name) values ('mystery-co', 'Mystery Co') returning id`));
check("staff create a company", r.ok, r.ok ? "created" : r.error);
const mysteryId = r.ok ? r.value.rows[0].id : null;

let trail = (await db.query(
  `select actor_id, action, next from public.audit_events
   where action = 'company.created' and entity_id = $1`, [String(mysteryId)])).rows;
check("CREATION LEAVES A TRACE NAMING THE ACTOR",
  trail.length === 1 && trail[0].actor_id === boss,
  trail.length ? `actor ${trail[0].actor_id === boss ? "named" : "WRONG"}` : "NO TRACE");

// An update records only what changed — not the whole record restated.
await asCommitted(boss, () => db.query(
  `update public.companies set name = 'Mystery Company Ltd' where id = $1`, [mysteryId]));
trail = (await db.query(
  `select previous, next from public.audit_events
   where action = 'company.updated' and entity_id = $1`, [String(mysteryId)])).rows;
check("an update records exactly the changed fields",
  trail.length === 1
    && Object.keys(trail[0].next).join(",") === "name"
    && trail[0].previous.name === "Mystery Co",
  trail.length ? Object.keys(trail[0].next).join(",") : "NO TRACE");

// A write that changes nothing is not an event.
await asCommitted(boss, () => db.query(
  `update public.companies set name = name where id = $1`, [mysteryId]));
const noop = (await db.query(
  `select count(*)::int c from public.audit_events
   where action = 'company.updated' and entity_id = $1`, [String(mysteryId)])).rows[0].c;
check("a no-op write leaves no event", noop === 1, `${noop} events`);

// The deliberate act: flipping the disclosure flag demands a reason.
r = await as(boss, () => db.query(
  `select public.set_company_real_business($1, true, '')`, [mysteryId]));
check("flipping the disclosure without a reason is refused", !r.ok, r.ok ? "FLIPPED" : r.error);

r = await asCommitted(boss, () => db.query(
  `select public.set_company_real_business($1, true, 'Verified as a real operator against their companies-house record')`,
  [mysteryId]));
check("with a reason, the flag is raised", r.ok, r.ok ? "raised" : r.error);
const semantic = (await db.query(
  `select reason from public.audit_events
   where action = 'company.real_business_set' and entity_id = $1`, [String(mysteryId)])).rows;
check("...and WHY is a recorded sentence, not an inference",
  semantic.length === 1 && semantic[0].reason.includes("companies-house"),
  semantic.length ? "reason recorded" : "NO SEMANTIC EVENT");

r = await as(opN, () => db.query(
  `select public.set_company_real_business($1, false, 'operator says so')`, [mysteryId]));
check("an operator cannot work the disclosure switch", !r.ok, r.ok ? "CLEARED" : r.error);

// Deletion: the trail must survive the thing it records.
r = await asCommitted(boss, () => db.query(
  `delete from public.companies where id = $1`, [mysteryId]));
check("a super admin deletes the company", r.ok, r.ok ? "deleted" : r.error);
trail = (await db.query(
  `select actor_id, previous from public.audit_events
   where action = 'company.deleted' and entity_id = $1`, [String(mysteryId)])).rows;
check("THE DELETION TRAIL SURVIVES THE DELETION",
  trail.length === 1 && trail[0].actor_id === boss && trail[0].previous.name === "Mystery Company Ltd",
  trail.length ? "named, with the record it removed" : "NO TRACE");
const createdRow = (await db.query(
  `select count(*)::int c from public.audit_events where entity_id = $1`, [String(mysteryId)])).rows[0].c;
check("...and the earlier events survived the cascade too", createdRow >= 4, `${createdRow} events`);


// Support scopes (CR-14): known kinds only, and only a super admin sets them.
r = await asCommitted(boss, () => db.query(
  `select public.set_support_scopes($1, array['guide','athlete'])`, [support]));
check("a super admin scopes a support person", r.ok, r.ok ? "scoped" : r.error);
r = await as(boss, () => db.query(
  `select public.set_support_scopes($1, array['aliens'])`, [support]));
check("an unknown requester kind is refused", !r.ok, r.ok ? "ACCEPTED" : r.error);
r = await as(support, () => db.query(
  `select public.set_support_scopes($1, '{}')`, [support]));
check("staff cannot rescope themselves", !r.ok, r.ok ? "RESCOPED" : r.error);
r = await as(support, () => db.query(
  `update public.staff_members set support_scopes = '{}' where profile_id = $1 returning 1`, [support]));
const kept = (await db.query(`select support_scopes from public.staff_members where profile_id=$1`, [support])).rows[0];
check("...nor by writing the table directly", kept.support_scopes.length === 2,
  JSON.stringify(kept.support_scopes));
const scopeAudit = (await db.query(
  `select count(*)::int c from public.audit_events where action = 'staff.support_scopes_set'`)).rows[0].c;
check("scoping someone is on the record", scopeAudit === 1, `${scopeAudit}`);

/* ========================================================================== */
/* ENQUIRIES — the inbound queue's guarantees                                 */
/* ========================================================================== */

// A signed-in climber enquires about a live product; the function resolves the
// object and stamps who they are.
r = await asCommitted(athlete, () => db.query(
  `select public.open_enquiry('Do you run this trip in October as well?', $1, null, null, 'phone_app', '/expeditions/x') as res`,
  [liveProduct]));
check("a climber opens an enquiry about a trip", r.ok, r.ok ? "opened" : r.error);
const enqId = r.ok ? r.value.rows[0].res.id : null;

let enq = (await db.query(`select * from public.enquiries where id = $1`, [enqId])).rows[0];
check("...the sender kind is stamped, the company resolved from the product",
  enq.sender_kind === "athlete" && enq.company_id !== null && enq.object_label.length > 0,
  `${enq.sender_kind} / ${enq.object_label}`);

// A signed-in client cannot write the table directly — the missing INSERT
// grant is the enforcement, not a courtesy.
r = await as(athlete, () => db.query(
  `insert into public.enquiries (sender_id, sender_kind, company_id, object_label, body)
   values ($1, 'company', $2, 'Fake', 'I claim to be an operator!!')`, [athlete, northwind]));
check("a signed-in client cannot insert directly (or claim a kind)", !r.ok, r.ok ? "INSERTED" : r.error);

// No object → support's queue, not this one.
r = await as(athlete, () => db.query(
  `select public.open_enquiry('Hello, I just have a general question about stuff.')`));
check("an enquiry with no object is refused toward support", !r.ok, r.ok ? "OPENED" : r.error);

// The anonymous path: insert-only, forced into the visitor shape.
r = await as(null, () => db.query(
  `insert into public.enquiries (sender_kind, sender_email, destination_id, object_label, body)
   values ('visitor', 'someone@example.com', 'everest', 'Mount Everest', 'What permits do I need for Everest?')`));
check("an anonymous visitor can write (and gets nothing back — no select, no returning)", r.ok, r.ok ? "written" : r.error);
r = await as(null, () => db.query(
  `insert into public.enquiries (sender_kind, sender_email, destination_id, object_label, body)
   values ('athlete', 'x@example.com', 'everest', 'Mount Everest', 'I claim to be signed in somehow')`));
check("...but cannot claim any other kind", !r.ok, r.ok ? "CLAIMED" : r.error);
r = await as(null, () => db.query(`select body from public.enquiries`));
check("...and cannot read back what anyone wrote", !r.ok, r.ok ? `LEAKED ${rows(r)}` : r.error);

// The sender sees their own enquiry and its REAL state; not other people's.
r = await as(athlete, () => db.query(`select id, seen_at, answered_at, answer from public.enquiries`));
check("a sender sees exactly their own enquiries", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

// The desk works it: seen, then answered — and the words are immutable.
r = await asCommitted(boss, () => db.query(
  `update public.enquiries set seen_at = now(), seen_by = $1 where id = $2`, [boss, enqId]));
check("staff mark it seen", r.ok, r.ok ? "seen" : r.error);
r = await as(boss, () => db.query(
  `update public.enquiries set body = 'reworded politely' where id = $1`, [enqId]));
check("NOBODY EDITS THE CUSTOMER'S WORDS — staff included", !r.ok, r.ok ? "EDITED" : r.error);
r = await as(boss, () => db.query(
  `update public.enquiries set answered_at = now(), answered_by = $1 where id = $2`, [boss, enqId]));
check("a half-set answer (no text) is refused", !r.ok, r.ok ? "HALF-SET" : r.error);
r = await asCommitted(boss, () => db.query(
  `update public.enquiries set answered_at = now(), answered_by = $1,
   answer = 'October departures run until the 20th — details attached to the trip page.' where id = $2`,
  [boss, enqId]));
check("staff answer it", r.ok, r.ok ? "answered" : r.error);

// The reply ARRIVES: the sender reads the answer off their own row.
r = await as(athlete, () => db.query(`select answer from public.enquiries where id = $1`, [enqId]));
check("THE SENDER SEES THE ANSWER — the reply genuinely arrives",
  r.ok && r.value.rows[0].answer.includes("October"), r.ok ? "arrived" : r.error);

r = await as(boss, () => db.query(
  `update public.enquiries set answer = 'actually never mind' where id = $1`, [enqId]));
check("an answer does not change silently afterwards", !r.ok, r.ok ? "CHANGED" : r.error);

// SESSION 02'S HOLE, CLOSED ON THE PATH THAT HAD IT: the anonymous insert —
// the only path the public web can use — cannot choose what its enquiry is
// "about". The label is overwritten from the record by the table's trigger.
r = await asCommitted(boss, async () => {
  await db.exec(`set local role anon`);
  await db.query(
    `insert into public.enquiries (sender_kind, sender_email, destination_id, object_label, body)
     values ('visitor', 'liar@example.com', 'everest', 'FREE HELICOPTER RIDES CLICK HERE', 'A perfectly ordinary question about permits.')`);
  await db.exec(`set local role postgres`);
  return db.query(`select object_label from public.enquiries where sender_email = 'liar@example.com'`);
});
check("AN ANON CLIENT CANNOT CHOOSE ITS LABEL — the table overwrites it",
  r.ok && r.value.rows[0]?.object_label === "Everest",
  r.ok ? r.value.rows[0]?.object_label : r.error);

r = await as(null, () => db.query(
  `insert into public.enquiries (sender_kind, sender_email, destination_id, object_label, body)
   values ('visitor', 'x@example.com', 'no-such-mountain', 'Anything', 'A question about a place that is not real.')`));
check("...and cannot enquire about a place that does not exist", !r.ok, r.ok ? "INSERTED" : r.error);

// A product enquiry's company is the PRODUCT's company, whatever was claimed.
r = await asCommitted(boss, async () => {
  await db.exec(`set local role anon`);
  await db.query(
    `insert into public.enquiries (sender_kind, sender_email, product_id, company_id, body)
     values ('visitor', 'mismatch@example.com', $1, $2, 'Interested in this trip, what are the dates?')`,
    [liveProduct, serac]);
  await db.exec(`set local role postgres`);
  return db.query(
    `select company_id, object_label from public.enquiries where sender_email = 'mismatch@example.com'`);
});
check("...and a mismatched company claim is corrected to the product's owner",
  r.ok && r.value.rows[0]?.company_id === northwind,
  r.ok ? `label ${r.value.rows[0]?.object_label}` : r.error);

// Retention: only a super admin deletes, and the deletion leaves a trace.
r = await as(support, () => db.query(`delete from public.enquiries where id = $1 returning 1`, [enqId]));
const stillThere = (await db.query(`select count(*)::int c from public.enquiries where id=$1`, [enqId])).rows[0].c;
check("ordinary staff cannot delete an enquiry", stillThere === 1, `${stillThere} rows`);
r = await asCommitted(boss, () => db.query(`delete from public.enquiries where id = $1`, [enqId]));
check("a super admin can", r.ok, r.ok ? "deleted" : r.error);
const trace = (await db.query(
  `select actor_id from public.audit_events where action = 'enquiry.deleted' and entity_id = $1`,
  [String(enqId)])).rows;
check("...and the deletion is on the record, actor named",
  trace.length === 1 && trace[0].actor_id === boss, trace.length ? "traced" : "NO TRACE");


/* ========================================================================== */
/* GUIDE VERIFICATION — the pin lifted, the replacement harder                */
/* ========================================================================== */

// A guide claims their own trade (self-serve, the policy was written for it).
const guideUser = await mkUser("aguide@x.io", "athlete", "Gia Guide");
r = await asCommitted(guideUser, () => db.query(
  `insert into public.guide_profiles (id, based_in, mountains) values ($1, 'Chamonix', array['mont-blanc'])`,
  [guideUser]));
check("a guide creates their own profile", r.ok, r.ok ? "created" : r.error);

let st = (await db.query(
  `select public.guide_credentials_state(g) s from public.guide_profiles g where id = $1`, [guideUser])).rows[0];
check("...and starts unchecked — the claim is derived, not stored", st.s === "unchecked", st.s);

r = await as(guideUser, () => db.query(
  `update public.guide_profiles set credentials_checked_by = $1, credentials_checked_at = now(),
   credentials_document_ref = 'my own say-so', credentials_no_expiry = true where id = $1`, [guideUser]));
check("A GUIDE CANNOT NAME THEMSELVES CHECKED", !r.ok, r.ok ? "SELF-CHECKED" : r.error);

r = await as(boss, () => db.query(
  `update public.guide_profiles set credentials_checked_by = $1 where id = $2`, [boss, guideUser]));
check("...nor can an admin write the columns directly", !r.ok, r.ok ? "WRITTEN" : r.error);

r = await as(support, () => db.query(
  `select public.record_guide_document_check($1, 'IFMGA carnet 12345', '2027-06-30')`, [guideUser]));
check("the support desk cannot record a check — operations only", !r.ok, r.ok ? "RECORDED" : r.error);

r = await as(ops, () => db.query(
  `select public.record_guide_document_check($1, 'IFMGA carnet 12345')`, [guideUser]));
check("a check must state the expiry or explicitly that none exists", !r.ok, r.ok ? "RECORDED" : r.error);

r = await asCommitted(ops, () => db.query(
  `select public.record_guide_document_check($1, 'IFMGA carnet 12345', '2027-06-30')`, [guideUser]));
check("operations record the check, document named, expiry from the paper", r.ok, r.ok ? "recorded" : r.error);
st = (await db.query(
  `select public.guide_credentials_state(g) s, credentials_checked_by cb from public.guide_profiles g where id = $1`,
  [guideUser])).rows[0];
check("...state derives to checked, with the checker NAMED", st.s === "checked" && st.cb === ops, st.s);
const gTrail = (await db.query(
  `select count(*)::int c from public.audit_events where action = 'guide.documents_checked' and entity_id = $1`,
  [String(guideUser)])).rows[0].c;
check("...and the act is on the record", gTrail === 1, `${gTrail}`);

// EXPIRY REVOKES THE CLAIM AUTOMATICALLY — no boolean to forget to clear.
await asCommitted(ops, () => db.query(
  `select public.record_guide_document_check($1, 'Old insurance policy', '2026-01-01')`, [guideUser]));
st = (await db.query(
  `select public.guide_credentials_state(g) s from public.guide_profiles g where id = $1`, [guideUser])).rows[0];
check("A LAPSED DOCUMENT DERIVES TO EXPIRED, AUTOMATICALLY", st.s === "expired", st.s);

r = await as(ops, () => db.query(`select public.revoke_guide_document_check($1, '')`, [guideUser]));
check("revoking a check requires a reason", !r.ok, r.ok ? "REVOKED" : r.error);
r = await asCommitted(ops, () => db.query(
  `select public.revoke_guide_document_check($1, 'Document was for a different person')`, [guideUser]));
st = (await db.query(
  `select public.guide_credentials_state(g) s from public.guide_profiles g where id = $1`, [guideUser])).rows[0];
check("a revoked check returns the guide to unchecked, audited", r.ok && st.s === "unchecked", st.s);

/* ========================================================================== */
/* BOOKING AGREEMENTS — what the customer saw, pinned forever                 */
/* ========================================================================== */

const agBooking = (await db.query(
  `insert into public.bookings (kind, company_id, customer_id, destination_id, status, value_status)
   values ('expedition', $1, $2, 'everest', 'confirmed', 'pending') returning id`,
  [northwind, athlete])).rows[0].id;

r = await as(boss, () => db.query(
  `select public.record_booking_agreement($1, 'v1', 'Full terms text as displayed to the customer on booking.', 'More than 60 days: full refund minus pass-through costs.')`,
  [agBooking]));
check("STAFF CANNOT RECORD AN ACCEPTANCE FOR A CUSTOMER", !r.ok, r.ok ? "FABRICATED" : r.error);

r = await asCommitted(athlete, () => db.query(
  `select public.record_booking_agreement($1, 'v1',
     'Full terms text as displayed to the customer on booking.',
     'More than 60 days before start date: 100% refund minus pass-through costs.',
     '["Trip difficulty: Very Hard", "Max altitude: 6,962m", "Emergency evacuation not included"]'::jsonb,
     'phone_app')`, [agBooking]));
check("the customer records their own acceptance, text pinned", r.ok, r.ok ? "recorded" : r.error);

r = await as(athlete, () => db.query(
  `select public.record_booking_agreement($1, 'v2', 'Different terms text entirely, longer than twenty.', 'A different policy.')`,
  [agBooking]));
check("one agreement per booking — a second is refused", !r.ok, r.ok ? "DOUBLED" : r.error);

r = await as(boss, () => db.query(
  `update public.booking_agreements set terms_text = 'softer wording' where booking_id = $1`, [agBooking]));
check("IMMUTABLE INCLUDING TO STAFF — what they saw does not change", !r.ok, r.ok ? "EDITED" : r.error);

r = await as(boss, () => db.query(`delete from public.bookings where id = $1`, [agBooking]));
const bStill = (await db.query(`select count(*)::int c from public.bookings where id = $1`, [agBooking])).rows[0].c;
check("the agreement record BLOCKS deleting its booking", bStill === 1, `${bStill} rows`);

r = await as(athlete, () => db.query(
  `select terms_text, disclosures from public.booking_agreements where booking_id = $1`, [agBooking]));
check("the customer can always read what they agreed to",
  r.ok && rows(r) === 1 && r.value.rows[0].disclosures.length === 3, r.ok ? "readable" : r.error);
const other = await mkUser("other@x.io", "athlete", "Other Person");
r = await as(other, () => db.query(`select id from public.booking_agreements`));
check("...and nobody else's customer can", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(support, () => db.query(`delete from public.booking_agreements where booking_id = $1 returning 1`, [agBooking]));
const agStill = (await db.query(`select count(*)::int c from public.booking_agreements where booking_id = $1`, [agBooking])).rows[0].c;
check("ordinary staff cannot delete an agreement", agStill === 1, `${agStill} rows`);



/* -- S4: enquiry delivery to operators --------------------------------------
   Nothing flows automatically: an operator sees an enquiry about their company
   only after a named staff member stamps the hand-off — and even then through
   a view that withholds the customer's contact details. */

// A fresh enquiry for this block — earlier retention probes deleted the
// original one, and a probe against a vanished row passes for nothing.
r = await asCommitted(athlete, () => db.query(
  `select public.open_enquiry('Is the north route open in January?', $1, null, null, 'phone_app', '/expeditions/x') as res`,
  [liveProduct]));
const s4enq = r.ok ? r.value.rows[0].res.id : null;
await asCommitted(boss, () => db.query(
  `update public.enquiries set answered_at = now(), answered_by = $1,
   answer = 'The north route opens mid-February; January is closed.' where id = $2`, [boss, s4enq]));

// Before any hand-off: the operator sees nothing, anywhere.
r = await as(opN, () => db.query(`select id from public.operator_enquiries`));
check("S4: operator sees nothing before a hand-off", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)}` : r.error);
r = await as(opN, () => db.query(`select id from public.enquiries`));
check("S4: operator reads NOTHING off the base table", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

// An operator cannot stamp their own hand-off.
r = await as(opN, () => db.query(
  `update public.enquiries set handed_off_at = now(), handed_off_by = $1 where id = $2 returning 1`,
  [opN, s4enq]));
check("S4: an operator cannot hand off to themselves", !r.ok || rows(r) === 0,
  r.ok ? (rows(r) === 0 ? "0 rows — the policy never shows them the row" : "STAMPED") : r.error);

// Staff cannot stamp it in someone else's name.
r = await as(boss, () => db.query(
  `update public.enquiries set handed_off_at = now(), handed_off_by = $1 where id = $2`, [ops, s4enq]));
check("S4: a hand-off is stamped in the actor's own name", !r.ok, r.ok ? "MISATTRIBUTED" : r.error);

// An enquiry naming no company has nobody to hand off to.
const noCompanyEnq = (await db.query(
  `select id from public.enquiries where company_id is null limit 1`)).rows[0].id;
r = await as(boss, () => db.query(
  `update public.enquiries set handed_off_at = now(), handed_off_by = $1 where id = $2`, [boss, noCompanyEnq]));
check("S4: a company-less enquiry cannot be handed off", !r.ok, r.ok ? "HANDED OFF TO NOBODY" : r.error);

// The real thing.
r = await asCommitted(boss, () => db.query(
  `update public.enquiries set handed_off_at = now(), handed_off_by = $1 where id = $2 returning company_id`,
  [boss, s4enq]));
check("S4: staff hand the enquiry off", r.ok && rows(r) === 1, r.ok ? "stamped" : r.error);

r = await as(opN, () => db.query(
  `select id, object_label, body, answer from public.operator_enquiries`));
check("S4: THE COMPANY NOW SEES IT — words, object and ICEFALL's answer",
  r.ok && rows(r) === 1 && r.value.rows[0].id === s4enq && r.value.rows[0].answer !== null,
  r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(opNsales, () => db.query(`select id from public.operator_enquiries`));
check("S4: any active member of the company sees it, not only admins",
  r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(opS, () => db.query(`select id from public.operator_enquiries`));
check("S4: another company's operator sees NOTHING", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

// The view's column list is the privacy boundary.
r = await as(opN, () => db.query(`select sender_email from public.operator_enquiries`));
check("S4: the customer's email is not even a column the operator can name", !r.ok,
  r.ok ? "EXPOSED" : r.error);
r = await as(opN, () => db.query(`select origin_screen from public.operator_enquiries`));
check("S4: desk triage data (origin_screen) stays at the desk", !r.ok,
  r.ok ? "EXPOSED" : r.error);

// Once stamped, stamped.
r = await as(boss, () => db.query(
  `update public.enquiries set handed_off_at = now() + interval '1 day' where id = $1`, [s4enq]));
check("S4: a hand-off is not re-dated", !r.ok, r.ok ? "RE-DATED" : r.error);

// The disclosure leaves a trace.
const hoAudit = (await db.query(
  `select count(*)::int c from public.audit_events where action = 'enquiry.handed_off' and entity_id = $1`,
  [s4enq])).rows[0].c;
check("S4: the hand-off is audited", hoAudit === 1, `${hoAudit} event(s)`);

// Anonymous key: no path to the view at all.
r = await as(null, () => db.query(`select id from public.operator_enquiries`));
check("S4: anon cannot read the operator view", !r.ok || rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);


/* -- Identity verification: the grey mark's evidence ------------------------ */

r = await as(athlete, () => db.query(`select public.record_identity_check($1, 'passport, CY, ending 483')`, [athlete]));
check("GREY: a user cannot verify their own identity", !r.ok, r.ok ? "SELF-VERIFIED" : r.error);

r = await as(sales, () => db.query(`select public.record_identity_check($1, 'passport, CY, ending 483')`, [athlete]));
check("GREY: the sales desk cannot either — operations only", !r.ok, r.ok ? "RECORDED" : r.error);

r = await as(boss, () => db.query(
  `insert into public.identity_checks (profile_id, checked_by, document_ref) values ($1,$2,'direct write')`, [athlete, boss]));
check("GREY: even staff cannot write the table directly", !r.ok, r.ok ? "WROTE" : r.error);

r = await asCommitted(ops, () => db.query(`select public.record_identity_check($1, 'passport, CY, ending 483')`, [athlete]));
check("GREY: operations records the check", r.ok, r.ok ? "recorded" : r.error);

r = await as(athlete, () => db.query(
  `select public.identity_verified(p) as v from public.profiles p where p.id = $1`, [athlete]));
check("GREY: the mark derives TRUE from the record", r.ok && r.value.rows[0].v === true,
  r.ok ? String(r.value.rows[0].v) : r.error);

r = await as(athlete, () => db.query(`select document_ref from public.identity_checks where profile_id = $1`, [athlete]));
check("GREY: the person sees their own evidence row", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);
r = await as(opN, () => db.query(`select document_ref from public.identity_checks`));
check("GREY: nobody else sees the evidence", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(ops, () => db.query(`select public.revoke_identity_check($1, '')`, [athlete]));
check("GREY: a revocation without a reason is refused", !r.ok, r.ok ? "REVOKED" : r.error);
r = await asCommitted(ops, () => db.query(`select public.revoke_identity_check($1, 'document reported stolen')`, [athlete]));
check("GREY: revocation with a reason works", r.ok, r.ok ? "revoked" : r.error);
r = await as(athlete, () => db.query(
  `select public.identity_verified(p) as v from public.profiles p where p.id = $1`, [athlete]));
check("GREY: the mark derives FALSE after revocation — no stored boolean survives", r.ok && r.value.rows[0].v === false,
  r.ok ? String(r.value.rows[0].v) : r.error);
const idAudit = (await db.query(
  `select count(*)::int c from public.audit_events where action in ('identity.checked','identity.revoked') and entity_id = $1`,
  [athlete])).rows[0].c;
check("GREY: check and revocation are both audited", idAudit === 2, `${idAudit} event(s)`);

/* -- Trek catalogue rules (request 09 landed as columns, not new tables) --- */

r = await as(boss, () => db.query(
  `insert into public.destinations (id, name, kind, region, country, max_altitude_m)
   values ('nameless-trek','Nameless','trek','Alps','France', 3000)`));
check("TREK: an altitude with no named point is refused", !r.ok, r.ok ? "ACCEPTED BARE" : r.error);

e = null;
try {
  await db.query(
    `insert into public.destinations (id, name, kind, region, country, max_altitude_m, max_altitude_of, style)
     values ('named-trek','Named Trek','trek','Alps','France', 3000, 'Col des Fours', 'Circuit')`);
  await db.query(`delete from public.destinations where id = 'named-trek'`);
} catch (err) { e = err.message.split("\n")[0]; }
check("TREK: a named altitude and a drawn style are accepted", e === null, e ?? "accepted");

e = null;
try {
  await db.query(`update public.destinations set style = 'Circuit' where id = 'everest'`);
} catch (err) { e = err.message.split("\n")[0]; }
check("TREK: a mountain cannot carry a trek style", e !== null, e ?? "ACCEPTED");

// The proposed company_treks predicate, on the tables that already exist:
// grant the trek to Serac, the predicate answers, suspension switches it off.
await db.query(`insert into public.company_destinations (company_id, destination_id) values ($1,'tour-du-mont-blanc')`, [serac]);
r = await as(opS, () => db.query(`select public.company_may_edit_destination($1,'tour-du-mont-blanc') as v`, [serac]));
check("TREK: an active grant + membership lets the company edit its trek",
  r.ok && r.value.rows[0].v === true, r.ok ? String(r.value.rows[0].v) : r.error);
await db.query(`update public.company_destinations set status='suspended' where company_id=$1 and destination_id='tour-du-mont-blanc'`, [serac]);
r = await as(opS, () => db.query(`select public.company_may_edit_destination($1,'tour-du-mont-blanc') as v`, [serac]));
check("TREK: suspension switches the predicate off — active-only is load-bearing",
  r.ok && r.value.rows[0].v === false, r.ok ? String(r.value.rows[0].v) : r.error);

/* -- S2 social: posts, comments, follows, promotions ----------------------- */

// A guide account for the author_kind='guide' arm.
const guidey = await mkUser("guide@social.test", "guide", "Gia Guide");
await db.query(`insert into public.guide_profiles (id, listed) values ($1, true)`, [guidey]);

r = await asCommitted(athlete, () => db.query(
  `insert into public.posts (author_id, body) values ($1, 'Summited Denali — photos soon.') returning id`, [athlete]));
check("SOCIAL: a person posts as themselves", r.ok, r.ok ? "posted" : r.error);
const athletePost = r.ok ? r.value.rows[0].id : null;

r = await as(athlete, () => db.query(
  `insert into public.posts (author_id, author_kind, company_id, body) values ($1,'company',$2,'We speak for Northwind!')`,
  [athlete, northwind]));
check("SOCIAL: a non-member cannot speak for a company", !r.ok, r.ok ? "SPOKE" : r.error);

r = await as(athlete, () => db.query(
  `insert into public.posts (author_id, author_kind, body) values ($1,'guide','Trust me, I guide.')`, [athlete]));
check("SOCIAL: you cannot post as a guide without being one", !r.ok, r.ok ? "POSTED" : r.error);

r = await asCommitted(guidey, () => db.query(
  `insert into public.posts (author_id, author_kind, body) values ($1,'guide','Conditions on the north face are early-season.') returning id`,
  [guidey]));
check("SOCIAL: a real guide posts as a guide", r.ok, r.ok ? "posted" : r.error);

r = await asCommitted(opN, () => db.query(
  `insert into public.posts (author_id, author_kind, company_id, body) values ($1,'company',$2,'Northwind: two Everest places left.') returning id`,
  [opN, northwind]));
check("SOCIAL: a member speaks for their company", r.ok, r.ok ? "posted" : r.error);
const companyPost = r.ok ? r.value.rows[0].id : null;

r = await as(opN, () => db.query(
  `insert into public.posts (author_id, body) values ($1, 'forged') returning id`, [athlete]));
check("SOCIAL: nobody posts in another's name", !r.ok, r.ok ? "FORGED" : r.error);

r = await as(athlete, () => db.query(
  `update public.posts set body = 'edited later' where id = $1 returning 1`, [athletePost]));
check("SOCIAL: published words cannot be edited, even by their author", !r.ok,
  r.ok ? "EDITED" : r.error);

// A story that has already ended: seeded past-dated (superuser), then probed.
const story = (await db.query(
  `insert into public.posts (author_id, body, created_at, expires_at)
   values ($1, 'gone in a day', now() - interval '2 days', now() - interval '1 day') returning id`,
  [guidey])).rows[0].id;
r = await as(athlete, () => db.query(`select id from public.posts where id = $1`, [story]));
check("SOCIAL: an expired story is invisible to others", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);
r = await as(guidey, () => db.query(`select id from public.posts where id = $1`, [story]));
check("SOCIAL: ...but its author still sees their own history", r.ok && rows(r) === 1,
  r.ok ? `${rows(r)}` : r.error);
r = await as(athlete, () => db.query(
  `insert into public.post_comments (post_id, author_id, body) values ($1,$2,'too late')`, [story, athlete]));
check("SOCIAL: nobody comments on an ended story", !r.ok, r.ok ? "COMMENTED" : r.error);

r = await as(opS, () => db.query(
  `insert into public.post_comments (post_id, author_id, body) values ($1,$2,'Which route?') returning id`,
  [athletePost, opS]));
check("SOCIAL: a visible post takes comments", r.ok, r.ok ? "commented" : r.error);

// Blocks end the interaction: athlete blocks Sol, Sol can no longer comment/follow.
await db.query(`insert into public.blocks (blocker_id, blocked_id) values ($1,$2)`, [athlete, opS]);
r = await as(opS, () => db.query(
  `insert into public.post_comments (post_id, author_id, body) values ($1,$2,'still here')`, [athletePost, opS]));
check("SOCIAL: a blocked person cannot comment at you", !r.ok, r.ok ? "COMMENTED PAST A BLOCK" : r.error);
r = await as(opS, () => db.query(
  `insert into public.follows (follower_id, followed_profile_id) values ($1,$2)`, [opS, athlete]));
check("SOCIAL: ...or follow you", !r.ok, r.ok ? "FOLLOWED" : r.error);

r = await asCommitted(opNsales, () => db.query(
  `insert into public.follows (follower_id, followed_profile_id) values ($1,$2)`, [opNsales, guidey]));
check("SOCIAL: following a guide works (a guide is a person)", r.ok, r.ok ? "followed" : r.error);
r = await as(opNsales, () => db.query(
  `insert into public.follows (follower_id, followed_profile_id) values ($1,$2)`, [opNsales, guidey]));
check("SOCIAL: the same follow cannot exist twice", !r.ok, r.ok ? "DUPLICATED" : r.error);
r = await as(athlete, () => db.query(
  `insert into public.follows (follower_id, followed_profile_id, followed_company_id) values ($1,$2,$3)`,
  [athlete, guidey, northwind]));
check("SOCIAL: a follow has exactly one target", !r.ok, r.ok ? "TWO TARGETS" : r.error);
r = await as(guidey, () => db.query(`select follower_id from public.follows where followed_profile_id = $1`, [guidey]));
check("SOCIAL: you can see who follows you", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

/* -- Promotions: the labelled thing ---------------------------------------- */

r = await as(opNsales, () => db.query(
  `insert into public.promoted_placements (company_id, post_id, starts_on, ends_on, created_by)
   values ($1,$2,current_date,current_date+13,$3)`, [northwind, companyPost, opNsales]));
check("PROMO: a sales member cannot create campaigns — admin or desk", !r.ok, r.ok ? "CREATED" : r.error);
r = await as(opS, () => db.query(
  `insert into public.promoted_placements (company_id, post_id, starts_on, ends_on, created_by)
   values ($1,$2,current_date,current_date+13,$3)`, [northwind, companyPost, opS]));
check("PROMO: another company cannot promote your posts", !r.ok, r.ok ? "CREATED" : r.error);

r = await asCommitted(opN, () => db.query(
  `insert into public.promoted_placements (company_id, post_id, declared_goals, starts_on, ends_on, created_by)
   values ($1,$2,array['everest'],current_date,current_date+13,$3) returning id`,
  [northwind, companyPost, opN]));
check("PROMO: the company admin drafts a campaign", r.ok, r.ok ? "drafted" : r.error);
const promo = r.ok ? r.value.rows[0].id : null;

r = await as(athlete, () => db.query(`select id from public.promoted_placements`));
check("PROMO: a draft is invisible to the feed", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

// `surfaces` is named on the way to active, because since 20260903000000 an
// active placement that names no surface is refused — a promotion runs where
// somebody chose to run it, and the old default was every surface at once.
await asCommitted(opN, () => db.query(
  `update public.promoted_placements set status='active', surfaces = array['feed'] where id = $1`, [promo]));
r = await as(athlete, () => db.query(`select id, status from public.promoted_placements`));
check("PROMO: an ACTIVE campaign inside its dates reaches the feed — labelled by the table it came from",
  r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(athlete, () => db.query(
  `update public.promoted_placements set declared_goals = array['everyone'] where id = $1 returning 1`, [promo]));
check("PROMO: a reader cannot edit a campaign", !r.ok || rows(r) === 0, r.ok ? `${rows(r)} EDITED` : r.error);

// Deleting a post is real and leaves the moderation trace.
r = await asCommitted(athlete, () => db.query(
  `delete from public.posts where id = $1 returning 1`, [athletePost]));
check("SOCIAL: an author deletes their own words", r.ok && rows(r) === 1, r.ok ? "deleted" : r.error);
const postAudit = (await db.query(
  `select count(*)::int c from public.audit_events where action = 'post.deleted' and entity_id = $1`,
  [athletePost])).rows[0].c;
check("SOCIAL: the deletion is audited", postAudit === 1, `${postAudit} event(s)`);


/* -- Offers, company arm: membership is the coherence rule ------------------ */

const OQUOTE = JSON.stringify({
  lines: [{ label: "Expedition place", amount: 745000, per: "person" },
          { label: "Permit", amount: 90000, per: "person", passThrough: true }],
  exclusions: [], cancellation: { tiers: [], conditionsRefundPct: 100 }, partySize: 2,
});

// A thread the customer opened, with Northwind's Nia in it.
const offerTh = (await db.query(
  `insert into public.threads (peak_name, created_by) values ('Everest enquiry', $1) returning id`,
  [athlete])).rows[0].id;
await db.query(`insert into public.thread_participants (thread_id, profile_id) values ($1,$2),($1,$3)`,
  [offerTh, athlete, opN]);
await db.query(`insert into public.messages (thread_id, sender_id, body) values ($1,$2,'What would two places cost?')`,
  [offerTh, athlete]);

r = await as(opN, () => db.query(
  `select (public.send_offer($1, $2, $3::jsonb, now() + interval '14 days', 'company', $4)).id`,
  [offerTh, athlete, OQUOTE, northwind]));
check("OFFER: a member offers for their company", r.ok, r.ok ? "sent" : r.error);

r = await as(opN, () => db.query(
  `select public.send_offer($1, $2, $3::jsonb, now() + interval '14 days', 'company', $4)`,
  [offerTh, athlete, OQUOTE, serac]));
check("OFFER: nobody offers for a company they are not in", !r.ok, r.ok ? "SPOKE FOR SERAC" : r.error);

const companyOffer = (await db.query(
  `insert into public.offers (thread_id, sender_id, seller_kind, company_id, recipient_id, quote, valid_until)
   values ($1,$2,'company',$3,$4,$5::jsonb, now() + interval '14 days') returning id`,
  [offerTh, opN, northwind, athlete, OQUOTE])).rows[0].id;

r = await as(opNsales, () => db.query(`select id from public.offers where id = $1`, [companyOffer]));
check("OFFER: the company's team sees the company's offer", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);
r = await as(opS, () => db.query(`select id from public.offers where id = $1`, [companyOffer]));
check("OFFER: another company sees nothing", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);
r = await as(boss, () => db.query(`select id from public.offers where id = $1`, [companyOffer]));
check("OFFER: staff oversight reads it", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

console.log("\nCRM ATTACK RESULTS\n" + "=".repeat(76));
let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? " PASS" : " FAIL"}  ${t.name.padEnd(54)} ${t.detail ?? ""}`);
}
console.log("=".repeat(76));
console.log(`${results.length - failed}/${results.length} passed`);
await db.close();
process.exit(failed ? 1 : 0);
