import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Phase 1 acceptance: multi-tenant isolation is enforced at the DATABASE.
 *
 * Runs the real migration on real Postgres (PGlite/WASM — no Docker), then
 * attacks it as two unrelated tenants. The bar the spec sets (§29, §39) is
 * absolute: a member of one account must not be able to read, write, or reach
 * anything belonging to another, however the query is phrased.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "migrations");
const SQL = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
  .join("\n");

const db = await PGlite.create();

// Minimal Supabase surface the migration expects.
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
`);
await db.exec(SQL);

let pass = 0;
const fails = [];
const check = (name, ok, detail) => {
  if (ok) { pass++; console.log(` PASS  ${name}${detail ? `  (${detail})` : ""}`); }
  else { fails.push(name); console.log(` FAIL  ${name}  ${detail ?? ""}`); }
};

// Superuser seeding (stands in for the service role / signup trigger path).
// Insert into auth.users; the on_auth_user_created trigger creates the profile,
// exactly as a real Supabase signup would. No manual profile insert.
const mkUser = async (email, name) => {
  const u = (await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, jsonb_build_object('full_name',$2::text)) returning id`,
    [email, name])).rows[0].id;
  return u;
};

async function as(uid, fn) {
  await db.exec("begin");
  await db.exec(`set local role ${uid ? "authenticated" : "anon"}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ""]);
  try { return { ok: true, value: await fn() }; }
  catch (e) { return { ok: false, error: e.message.split("\n")[0] }; }
  finally { await db.exec("rollback"); }
}

/* -- Users. PGlite runs as superuser, which BYPASSES rls (even forced), so the
      plain db.query seeding below persists and stands in for the service role. -- */
const alice = await mkUser("alice@acme.test", "Alice");       // Acme owner
const bob = await mkUser("bob@acme.test", "Bob");             // Acme member
const carol = await mkUser("carol@globex.test", "Carol");     // Globex owner
const mallory = await mkUser("mallory@evil.test", "Mallory"); // no tenant
const dave = await mkUser("dave@newco.test", "Dave");         // will create a tenant

// Persistent seed (bypasses RLS as superuser): two isolated tenants with data.
const acme = (await db.query(`insert into public.tenants (name,slug,industry) values ('Acme','acme','SaaS') returning id`)).rows[0].id;
const globex = (await db.query(`insert into public.tenants (name,slug) values ('Globex','globex') returning id`)).rows[0].id;
await db.query(`insert into public.memberships (tenant_id,profile_id,role) values ($1,$2,'owner')`, [acme, alice]);
await db.query(`insert into public.memberships (tenant_id,profile_id,role) values ($1,$2,'member')`, [acme, bob]);
await db.query(`insert into public.memberships (tenant_id,profile_id,role) values ($1,$2,'owner')`, [globex, carol]);
await db.query(`insert into public.contacts (tenant_id,first_name,last_name,email) values ($1,'Dana','Ray','dana@lead.test')`, [acme]);
await db.query(`insert into public.contacts (tenant_id,first_name,email) values ($1,'Otto','otto@lead.test')`, [globex]);
await db.query(`insert into public.audit_log (tenant_id,actor_id,action,entity) values ($1,$2,'tenant.created','tenant')`, [acme, alice]);

/* ---- create_tenant: a new user becomes owner of what they create --------- */
let r = await as(dave, async () => {
  const id = (await db.query(`select public.create_tenant('NewCo','newco') as id`)).rows[0].id;
  const role = (await db.query(`select role from public.memberships where tenant_id=$1 and profile_id=$2`, [id, dave])).rows[0]?.role;
  return { id, role };
});
check("create_tenant makes the caller an owner", r.ok && r.value.role === "owner",
  r.ok ? `role=${r.value.role}` : r.error);

/* ---- an owner can add a member ------------------------------------------- */
const erin = await mkUser("erin@acme.test", "Erin");
r = await as(alice, () => db.query(`insert into public.memberships (tenant_id,profile_id,role) values ($1,$2,'member')`, [acme, erin]));
check("an owner can add a member", r.ok, r.ok ? "Erin added" : r.error);

/* ---- the isolation bar --------------------------------------------------- */
r = await as(bob, () => db.query(`select * from public.contacts`));
check("a member sees ONLY their tenant's contacts", r.ok && r.value.rows.length === 1,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(carol, () => db.query(`select * from public.contacts where email = 'dana@lead.test'`));
check("cross-tenant read returns nothing", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(mallory, () => db.query(`select * from public.contacts`));
check("a user with no membership sees nothing", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// The critical write attack: insert a row INTO another tenant.
r = await as(carol, () => db.query(
  `insert into public.contacts (tenant_id, first_name) values ($1,'Injected')`, [acme]));
check("cannot insert a row into another tenant", !r.ok, r.ok ? "INSERTED — LEAK" : r.error);

// And the move attack: re-tag your own row to another tenant.
r = await as(carol, () => db.query(`update public.contacts set tenant_id = $1 where email='otto@lead.test'`, [acme]));
const moved = r.ok
  ? (await db.query(`select tenant_id from public.contacts where email='otto@lead.test'`)).rows[0]?.tenant_id === acme
  : false;
check("cannot move a row into another tenant", !moved, moved ? "MOVED — LEAK" : (r.ok ? "no rows changed" : r.error));

r = await as(null, () => db.query(`select * from public.contacts`));
check("anon is refused entirely", !r.ok, r.ok ? "LEAK" : r.error);

/* ---- role gating (§28 floor) --------------------------------------------- */
// Bob is a plain member. He must not perform admin actions.
r = await as(bob, () => db.query(`insert into public.teams (tenant_id, name) values ($1,'Bob''s team')`, [acme]));
check("a member cannot create a team (admin only)", !r.ok, r.ok ? "CREATED" : r.error);

r = await as(bob, () => db.query(`update public.memberships set role='owner' where tenant_id=$1 and profile_id=$2`, [acme, bob]));
const escalated = r.ok
  ? (await db.query(`select role from public.memberships where tenant_id=$1 and profile_id=$2`, [acme, bob])).rows[0].role === "owner"
  : false;
check("a member cannot promote themselves to owner", !escalated, escalated ? "ESCALATED" : (r.ok ? "no change" : r.error));

r = await as(alice, () => db.query(`insert into public.teams (tenant_id, name) values ($1,'Sales EU')`, [acme]));
check("an owner CAN create a team", r.ok, r.ok ? "created" : r.error);

r = await as(mallory, () => db.query(`update public.tenants set name='Pwned' where id=$1`, [acme]));
const renamed = r.ok
  ? (await db.query(`select name from public.tenants where id=$1`, [acme])).rows[0].name === "Pwned"
  : false;
check("an outsider cannot rename a tenant", !renamed, renamed ? "RENAMED" : (r.ok ? "no change" : r.error));

/* ---- audit log ----------------------------------------------------------- */
r = await as(alice, () => db.query(`select * from public.audit_log where tenant_id=$1`, [acme]));
check("owner sees their tenant's audit log", r.ok && r.value.rows.length >= 1,
  r.ok ? `${r.value.rows.length} entr(ies)` : r.error);

r = await as(carol, () => db.query(`select * from public.audit_log where tenant_id=$1`, [acme]));
check("audit log does not cross tenants", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(bob, () => db.query(`delete from public.audit_log where tenant_id=$1`, [acme]));
check("nobody can delete audit entries (append-only)", !r.ok, r.ok ? "DELETED" : r.error);


/* ---- deals + pipelines isolation (Phase 2-5) ----------------------------- */
// Seed a pipeline+stage+deal in each tenant (superuser, persists).
const acmePipe = (await db.query(`insert into public.pipelines (tenant_id,name,is_default) values ($1,'Sales',true) returning id`,[acme])).rows[0].id;
const acmeStage = (await db.query(`insert into public.pipeline_stages (tenant_id,pipeline_id,name,probability) values ($1,$2,'Proposal',40) returning id`,[acme,acmePipe])).rows[0].id;
await db.query(`insert into public.deals (tenant_id,title,value,pipeline_id,stage_id,owner_id) values ($1,'Acme x BigCo',5000000,$2,$3,$4)`,[acme,acmePipe,acmeStage,alice]);

const gPipe = (await db.query(`insert into public.pipelines (tenant_id,name,is_default) values ($1,'Sales',true) returning id`,[globex])).rows[0].id;
const gStage = (await db.query(`insert into public.pipeline_stages (tenant_id,pipeline_id,name,probability) values ($1,$2,'Proposal',40) returning id`,[globex,gPipe])).rows[0].id;
await db.query(`insert into public.deals (tenant_id,title,value,pipeline_id,stage_id) values ($1,'Globex secret',9900000,$2,$3)`,[globex,gPipe,gStage]);

r = await as(bob, () => db.query(`select title, value from public.deals`));
check("a member sees ONLY their tenant's deals", r.ok && r.value.rows.length === 1 && r.value.rows[0].title === "Acme x BigCo",
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

r = await as(carol, () => db.query(`select * from public.deals where title = 'Acme x BigCo'`));
check("cross-tenant deal read returns nothing", r.ok && r.value.rows.length === 0,
  r.ok ? `${r.value.rows.length} row(s)` : r.error);

// Attack: create a deal in another tenant, referencing that tenant's stage.
r = await as(carol, () => db.query(`insert into public.deals (tenant_id,title,value,pipeline_id,stage_id) values ($1,'Injected',1,$2,$3)`,[acme,acmePipe,acmeStage]));
check("cannot create a deal in another tenant", !r.ok, r.ok ? "INSERTED — LEAK" : r.error);

// The won/lost consistency constraint.
r = await as(alice, () => db.query(`insert into public.deals (tenant_id,title,value,pipeline_id,stage_id,status) values ($1,'Bad',1,$2,$3,'won')`,[acme,acmePipe,acmeStage]));
check("a 'won' deal without won_at is rejected", !r.ok, r.ok ? "ACCEPTED" : r.error);


console.log("\n" + "=".repeat(60));
console.log(`${pass}/${pass + fails.length} passed`);
await db.close();
if (fails.length) { console.log("FAILED: " + fails.join(", ")); process.exit(1); }
