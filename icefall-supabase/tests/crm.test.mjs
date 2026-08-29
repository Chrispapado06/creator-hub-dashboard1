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
  `insert into public.destinations (id, name, kind, region, country, max_altitude_m, duration_days_min, duration_days_max)
   values ('tour-du-mont-blanc','Tour du Mont Blanc','trek','Alps','France / Italy / Switzerland', 2665, 10, 11)`);

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
