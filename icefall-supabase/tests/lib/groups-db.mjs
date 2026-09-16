// Shared loader for the groups rebuild DB tests (tests/groups-*.test.mjs).
//
// Not a test itself. Plan: icefall-app/docs/groups-structure-plan.md §6.4.
//
// WHAT IT LOADS
//   1. Every file in migrations/, in name order, like tests/rls.test.mjs.
//   2. Then each staged groups file, in the plan's apply order, up to and
//      including the one a test names. A file already moved into migrations/
//      (as <timestamp>_<slug>.sql) was loaded in step 1 and is not run again.
//
// Nothing here writes into migrations/ or migrations-staged/. It only reads.
//
// WHY THE WHOLE CHAIN LOADS HERE when rls.test.mjs does not: that harness
// creates `anon` and `authenticated` but not `authenticator` or
// `service_role`, and 20260903060000 grants to `authenticator`. Creating both
// roles first is all it takes. rls.test.mjs is left alone.

import { PGlite } from "@electric-sql/pglite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const MIGRATIONS = join(ROOT, "migrations");
const STAGED = join(ROOT, "migrations-staged", "groups");

/** Plan §6.2 apply order. */
export const GROUP_FILES = [
  "groups_hardening",
  "group_roles",
  "group_type_and_trip",
  "group_invites",
  "group_post_kinds",
  "group_plan",
  "group_readiness_consent",
  "group_overview_and_read_marks",
];

/**
 * Where a staged groups file lives right now: moved into migrations/, still
 * staged, or missing.
 */
export function locateGroupFile(slug) {
  const moved = readdirSync(MIGRATIONS).find((f) => new RegExp(`^\\d{14}_${slug}\\.sql$`).test(f));
  if (moved) return { where: "migrations", path: join(MIGRATIONS, moved) };
  const staged = join(STAGED, `${slug}.sql`);
  if (existsSync(staged)) return { where: "staged", path: staged };
  return { where: "missing", path: null };
}

/**
 * A fresh PGlite database with the real schema and the groups files up to
 * `through`. Returns the db, where each groups file came from, and helpers.
 */
export async function openGroupsDb(through) {
  const last = GROUP_FILES.indexOf(through);
  if (last < 0) throw new Error(`unknown groups file: ${through}`);

  const db = await PGlite.create();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text,
                             raw_user_meta_data jsonb default '{}'::jsonb);
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
      if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator; end if;
    end $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
    -- Supabase grants these to every API role; without them an INVOKER
    -- function that calls auth.uid() fails here but not in production.
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create publication supabase_realtime;
  `);

  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
    } catch (e) {
      throw new Error(`migrations/${f} did not load: ${e.message.split("\n")[0]}`);
    }
  }

  const sources = {};
  for (const slug of GROUP_FILES.slice(0, last + 1)) {
    const found = locateGroupFile(slug);
    sources[slug] = found.where;
    if (found.where === "missing") throw new Error(`groups file ${slug}.sql is missing`);
    if (found.where === "staged") {
      try {
        await db.exec(readFileSync(found.path, "utf8"));
      } catch (e) {
        throw new Error(`staged ${slug}.sql did not load: ${e.message.split("\n")[0]}`);
      }
    }
  }

  /** A signed-in user with a profile; `staff` also makes them active staff. */
  const mkUser = async (email, name, { staff = false } = {}) => {
    const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
    const id = u.rows[0].id;
    await db.query(`update public.profiles set role=$2, display_name=$3 where id=$1`, [
      id,
      staff ? "admin" : "athlete",
      name,
    ]);
    if (staff) {
      await db.query(`insert into public.staff_members (profile_id, staff_role) values ($1, 'support')`, [id]);
    }
    return id;
  };

  /** Run fn as a signed-in user, then roll back. `keep: true` commits instead. */
  const as = async (uid, fn, { keep = false } = {}) => {
    await db.exec("begin");
    await db.exec(`set local role authenticated`);
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
    try {
      const value = await fn();
      await db.exec(keep ? "commit" : "rollback");
      return { ok: true, value };
    } catch (e) {
      await db.exec("rollback");
      return { ok: false, error: e.message.split("\n")[0] };
    }
  };

  const results = [];
  const check = (name, pass, detail) => results.push({ name, pass, detail });
  const finish = () => {
    let failed = 0;
    for (const { name, pass, detail } of results) {
      if (!pass) failed++;
      console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : `  — ${detail}`}`);
    }
    console.log(failed === 0 ? `\nALL GREEN (${results.length})` : `\n${failed} FAILING of ${results.length}`);
    process.exit(failed === 0 ? 0 : 1);
  };

  return { db, sources, mkUser, as, check, finish, results };
}
