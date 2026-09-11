// What the Coach's server-side limits actually do, run against a real Postgres.
//
// `node tests/coach-limits.test.mjs` — standalone, and deliberately NOT part of
// the `npm test` chain yet. That chain is `a && b && c` and its first link,
// tests/rls.test.mjs, currently dies loading migration 20260903060000 with
// `role "authenticator" does not exist` — the harness there creates anon and
// authenticated and not that one. Nothing downstream of a failing `&&` runs, so
// adding this file to the chain today would only mean it never executed. That
// breakage predates this file and is not fixed here.
//
// WHY THIS BUILDS ITS OWN MINIMAL SCHEMA rather than loading every migration:
// the file under test needs exactly two things from the rest of the database —
// `public.profiles` and `auth.uid()` — and standing those up in nine lines
// keeps this test running while the full-schema loader is broken. The cost is
// that it would not catch a collision with a table added elsewhere; the RLS
// suite is where that belongs.
//
// WHAT IS BEING PROVED, in one sentence each: the caps bind, the burst window
// bites, the money backstop is checked against the estimate BEFORE the call,
// the trial cannot be extended, a signed-in athlete cannot read the ledger or
// promote themselves, and the allowance an athlete may read carries counts and
// no money.

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "..", "migrations", "20260911140000_coach_limits.sql");

const db = await PGlite.create();

// The bare minimum this migration leans on. `service_role` is created here
// because production has it and this harness does not; without it the GRANTs at
// the end of the migration would fail for a reason that says nothing about the
// migration.
await db.exec(`
  create schema if not exists auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text);
  do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid; $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key references auth.users(id) on delete cascade,
                                display_name text not null default 'x');
`);

await db.exec(readFileSync(FILE, "utf8"));

const mk = async (email) => {
  const u = await db.query(`insert into auth.users (email) values ($1) returning id`, [email]);
  const id = u.rows[0].id;
  await db.query(`insert into public.profiles (id) values ($1)`, [id]);
  return id;
};
const alice = await mk("alice@x.io");
const bob = await mk("bob@x.io");

const results = [];
const check = (name, pass, detail) => results.push({ name, pass, detail });

/** One reservation, as the service role would make it. */
const consume = async (uid, strong = false, estimate = 0) =>
  (await db.query(`select * from public.coach_consume($1,$2,$3)`, [uid, strong, estimate])).rows[0];

/** Push the burst window into the past, so a loop can reach the DAILY cap. */
const ageWindow = () =>
  db.query(`update public.coach_rate set window_started_at = now() - interval '10 minutes'`);

/** Run something as a signed-in athlete, then roll it back. */
async function asUser(uid, fn) {
  await db.exec("begin");
  await db.exec("set local role authenticated");
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: e.message.split("\n")[0] };
  } finally {
    await db.exec("rollback");
  }
}

/* 1. A fresh account is free, and free never escalates. */
let r = await consume(alice);
check("first call allowed", r.allowed === true, JSON.stringify(r));
check("tier is free by default", r.tier === "free", r.tier);
check("free is never given the strong model", (await consume(alice, true)).strong_granted === false, "");

/* 2. Three a month, matching FREE_COACH_INTERACTIONS_PER_MONTH. */
r = await consume(alice);
check("third call allowed", r.allowed === true, JSON.stringify(r));
r = await consume(alice);
check("fourth call refused: monthly_calls", r.allowed === false && r.reason === "monthly_calls",
  JSON.stringify(r));

/* 3. The trial: startable once, never extendable, and it lifts the month cap. */
const noSession = (await db.query(`select public.coach_start_trial() as e`)).rows[0].e;
check("start_trial with no session returns null", noSession === null, String(noSession));

await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [alice]);
const first = (await db.query(`select public.coach_start_trial() as e`)).rows[0].e;
const again = (await db.query(`select public.coach_start_trial() as e`)).rows[0].e;
check("trial starts", first !== null, String(first));
check("trial is once ever, never extended", String(first) === String(again), `${first} vs ${again}`);

await ageWindow();
r = await consume(alice, true);
check("a trialing athlete reads as pro", r.tier === "pro", r.tier);
check("pro is not metered by month", r.allowed === true, JSON.stringify(r));
check("pro is given the strong model", r.strong_granted === true, String(r.strong_granted));

/* 4. The daily cap binds the paid plan too — it is an abuse stop, not a paywall. */
let last;
for (let i = 0; i < 10; i++) {
  await ageWindow();
  last = await consume(alice, true);
}
check("daily cap stops pro too", last.allowed === false && last.reason === "daily_calls",
  JSON.stringify(last));

/* 5. …and the stronger model has its own, smaller daily count. */
const strongToday = (
  await db.query(`select strong_calls from public.coach_usage_days where user_id=$1`, [alice])
).rows[0].strong_calls;
check("strong calls capped at 3/day on pro", strongToday === 3, String(strongToday));

/* 6. The burst window, on an account whose other ceilings are out of the way. */
await db.query(`update public.coach_tier_limits set daily_calls = 100, monthly_calls = null where tier='free'`);
let limited = null;
for (let i = 0; i < 8; i++) {
  const x = await consume(bob);
  if (!x.allowed) {
    limited = x;
    break;
  }
}
check("burst window fires", limited !== null && limited.reason === "rate_limited", JSON.stringify(limited));
check("and says when to try again", limited && limited.retry_after_seconds >= 1,
  String(limited && limited.retry_after_seconds));

/* 7. The money backstop is checked against the ESTIMATE, so it is refused
      before the call rather than discovered after it. */
await ageWindow();
await db.query(`update public.coach_usage_days set spend_micros = 999000 where user_id=$1`, [bob]);
r = await consume(bob, false, 2000);
check("an estimate over the backstop is refused", r.allowed === false && r.reason === "monthly_spend",
  JSON.stringify(r));
r = await consume(bob, false, 500);
check("an estimate under it is allowed", r.allowed === true, JSON.stringify(r));

/* 8. Settling banks the real figure. */
await db.query(`select public.coach_settle($1, $2)`, [bob, 1234]);
const spent = (
  await db.query(`select spend_micros from public.coach_usage_days where user_id=$1`, [bob])
).rows[0].spend_micros;
check("settle adds to the day", Number(spent) === 999000 + 1234, String(spent));

/* 9. What an athlete may read: counts, and no money. */
const allowance = await asUser(alice, () => db.query(`select * from public.coach_allowance()`));
check("an athlete can read their own allowance", allowance.ok && allowance.value.rows.length === 1,
  allowance.ok ? JSON.stringify(allowance.value.rows[0]) : allowance.error);
if (allowance.ok) {
  const cols = allowance.value.fields.map((f) => f.name);
  check("allowance carries no money column",
    !cols.some((c) => c.includes("micros") || c.includes("spend_this")), cols.join(","));
}

/* 10. And what they may not: the ledger, the entitlement, or the decision. */
for (const t of ["coach_entitlements", "coach_usage_days", "coach_rate", "coach_tier_limits"]) {
  const rd = await asUser(alice, () => db.query(`select * from public.${t}`));
  check(`${t} unreadable by authenticated`, rd.ok === false, rd.ok ? "READABLE" : rd.error);
}
const promote = await asUser(alice, () => db.query(`update public.coach_entitlements set tier='pro'`));
check("an athlete cannot make themselves pro", promote.ok === false, promote.ok ? "WROTE" : promote.error);
const direct = await asUser(alice, () => db.query(`select * from public.coach_consume($1)`, [alice]));
check("coach_consume is not callable by authenticated", direct.ok === false,
  direct.ok ? "CALLED" : direct.error);

let failed = 0;
for (const { name, pass, detail } of results) {
  if (!pass) failed++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : `  — ${detail}`}`);
}
console.log(failed === 0 ? "\nALL GREEN" : `\n${failed} FAILING`);
process.exit(failed === 0 ? 0 : 1);
