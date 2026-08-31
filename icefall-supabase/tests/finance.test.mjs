/**
 * ICEFALL — invoicing, payments, verification and support.
 *
 * Five tables that decide what a company owes ICEFALL and whether they are
 * behind on it, plus the trust records that decide whether a company trades at
 * all. Both halves fail silently: an over-credited invoice does not throw, and
 * an operator reading another operator's arrears looks exactly like an operator
 * reading their own.
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

const finance = await mkStaff("fin@icefall.test", "finance", "Fay Finance");
const ops = await mkStaff("ops@icefall.test", "operations", "Ola Ops");
const support = await mkStaff("sup@icefall.test", "support", "Sue Support");
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
let r, e;

/* ========================================================================== */
/* Invoices                                                                   */
/* ========================================================================== */

const inv = (await db.query(
  `insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status)
   values ('INV-1001',$1, current_date - 20, current_date - 6, 500000, 500000, 'issued') returning id`,
  [northwind])).rows[0].id;

const seracInv = (await db.query(
  `insert into public.invoices (number, company_id, issued_on, due_on, subtotal_cents, total_cents, status)
   values ('INV-1002',$1, current_date - 10, current_date + 4, 350000, 350000, 'issued') returning id`,
  [serac])).rows[0].id;

e = null;
try {
  await db.query(
    `insert into public.invoices (number, company_id, subtotal_cents, total_cents, status)
     values ('INV-1003',$1, 1000, 1000, 'void')`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an invoice cannot be voided without a reason", e !== null, e ?? "ACCEPTED");

/* ---- the outstanding balance is derived, and cannot go negative ---------- */

let bal = (await db.query(`select outstanding_cents, is_overdue from public.invoice_balances where id=$1`, [inv])).rows[0];
check("a new invoice is outstanding in full", Number(bal.outstanding_cents) === 500000, `${bal.outstanding_cents}`);
check("...and is flagged overdue once its due date passes", bal.is_overdue === true, `${bal.is_overdue}`);

r = await as(ops, () => db.query(`select public.record_payment($1, 100000, current_date)`, [inv]));
check("Operations cannot record a payment", !r.ok, r.ok ? "RECORDED" : r.error);

r = await asCommitted(finance, () => db.query(
  `select public.record_payment($1, 200000, current_date, 'bank_transfer','NWA-1')`, [inv]));
check("Finance records a part payment", r.ok, r.ok ? "recorded" : r.error);

bal = (await db.query(`select outstanding_cents, status from public.invoice_balances where id=$1`, [inv])).rows[0];
check("the balance falls by exactly what was paid", Number(bal.outstanding_cents) === 300000, `${bal.outstanding_cents}`);
check("...and the invoice reads part paid", bal.status === "part_paid", bal.status);

// An overpayment must not produce a negative balance that then nets off against
// something else. It clamps at zero and the invoice reads paid.
r = await asCommitted(finance, () => db.query(
  `select public.record_payment($1, 400000, current_date, 'bank_transfer','NWA-2')`, [inv]));
bal = (await db.query(`select outstanding_cents, status from public.invoice_balances where id=$1`, [inv])).rows[0];
check("an overpayment cannot drive the balance negative",
  Number(bal.outstanding_cents) === 0 && bal.status === "paid",
  `${bal.outstanding_cents}, ${bal.status}`);

r = await as(finance, () => db.query(`select public.record_payment($1, -5000, current_date)`, [inv]));
check("a negative payment is refused", !r.ok, r.ok ? "RECORDED" : r.error);

r = await as(finance, () => db.query(`select public.void_invoice($1, 'raised in error')`, [inv]));
check("an invoice with payments against it cannot be voided",
  !r.ok && /credit note/.test(r.error ?? ""), r.error);

r = await as(finance, () => db.query(`select public.void_invoice($1, '')`, [seracInv]));
check("voiding needs a reason", !r.ok, r.ok ? "VOIDED" : r.error);

/* ---- credit notes -------------------------------------------------------- */

r = await as(finance, () => db.query(
  `select public.issue_credit_note($1, 900000, 'goodwill')`, [inv]));
check("A CREDIT NOTE CANNOT EXCEED THE INVOICE IT CREDITS",
  !r.ok && /would credit .* against an invoice of/.test(r.error ?? ""), r.error);

// AND NOT CUMULATIVELY EITHER. Capping each note at the invoice total let two
// full-value notes both pass, refunding twice what was billed. The second one is
// the test that matters — the first always passed.
const halfInv = (await db.query(
  `insert into public.invoices (number, company_id, subtotal_cents, total_cents, status)
   values ('INV-2001',$1, 100000, 100000, 'issued') returning id`, [serac])).rows[0].id;

r = await asCommitted(finance, () => db.query(
  `select public.issue_credit_note($1, 60000, 'first, partial')`, [halfInv]));
check("a partial credit note is accepted", r.ok, r.ok ? "issued" : r.error);

r = await as(finance, () => db.query(
  `select public.issue_credit_note($1, 60000, 'second, would take it past 100%')`, [halfInv]));
check("...but a second cannot take the total past what was billed",
  !r.ok && /already credited/.test(r.error ?? ""), r.error);

r = await as(finance, () => db.query(
  `select public.issue_credit_note($1, 40000, 'second, exactly to the total')`, [halfInv]));
check("...while one that lands exactly on the total is fine", r.ok, r.ok ? "issued" : r.error);

r = await as(finance, () => db.query(`select public.issue_credit_note($1, 50000, '')`, [inv]));
check("a credit note requires a reason", !r.ok, r.ok ? "ISSUED" : r.error);

r = await as(opN, () => db.query(`select public.issue_credit_note($1, 1000, 'give me money')`, [inv]));
check("an operator cannot credit its own invoice", !r.ok, r.ok ? "ISSUED" : r.error);

/* ---- company isolation, the most commercially sensitive read ------------- */

r = await as(opN, () => db.query(`select id from public.invoices`));
check("a company sees its own invoices", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

r = await as(opS, () => db.query(`select number from public.invoices where company_id=$1`, [northwind]));
check("A COMPANY CANNOT SEE ANOTHER COMPANY'S INVOICES", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(opS, () => db.query(`select company_id from public.invoice_balances`));
check("...nor their arrears through the balance view",
  r.ok && rows(r) > 0 && r.value.rows.every((x) => x.company_id === serac),
  r.ok ? `${rows(r)} row(s), all their own: ${r.value.rows.every((x) => x.company_id === serac)}` : r.error);

r = await as(opN, () => db.query(`select * from public.payments`));
check("an operator cannot read the payment ledger at all", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(opN, () => db.query(`select * from public.credit_notes`));
check("...nor credit notes", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(opN, () => db.query(`select * from public.contracts`));
check("...nor contracts", r.ok && rows(r) === 0, r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(null, () => db.query(`select * from public.invoices`));
check("anon is refused invoices entirely", !r.ok, r.ok ? "LEAKED" : r.error);

r = await as(opN, () => db.query(
  `insert into public.payments (company_id, amount_cents, received_on, recorded_by)
   values ($1, 100, current_date, $2)`, [northwind, opN]));
check("nobody writes a payment directly — it must go through the function", !r.ok,
  r.ok ? "INSERTED" : r.error);

const paid = (await db.query(`select recorded_by from public.payments limit 1`)).rows[0];
check("every payment names the person who recorded it", paid?.recorded_by === finance, `${paid?.recorded_by}`);

/* ========================================================================== */
/* Verification — the honesty constraints                                     */
/* ========================================================================== */

e = null;
try {
  await db.query(
    `insert into public.verification_documents (company_id, document_type, label, state)
     values ($1,'insurance','Public liability','checked')`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a document cannot be 'checked' with no reviewer or date", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.verification_documents (company_id, document_type, label, expires_on)
     values ($1,'insurance','Public liability', current_date + 30)`, [northwind]);
} catch (err) { e = err.message.split("\n")[0]; }
check("AN EXPIRY DATE CANNOT BE STORED WITHOUT SAYING WHERE IT CAME FROM", e !== null, e ?? "ACCEPTED");

e = null;
try {
  await db.query(
    `insert into public.verification_documents (company_id, guide_profile_id, document_type, label)
     values ($1,$2,'insurance','Both at once')`, [northwind, customer]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a document belongs to a company or a guide, never both", e !== null, e ?? "ACCEPTED");

const docNoExpiry = (await db.query(
  `insert into public.verification_documents (company_id, document_type, label)
   values ($1,'business_registration','Company registration') returning id`, [northwind])).rows[0].id;

const docExpiring = (await db.query(
  `insert into public.verification_documents (company_id, document_type, label, expires_on, expiry_source)
   values ($1,'insurance','Public liability 2026', current_date + 10, 'printed_on_document') returning id`,
  [northwind])).rows[0].id;

const st = (await db.query(
  `select id, effective_state, days_until_expiry from public.verification_document_status
   where id in ($1,$2) order by id`, [docNoExpiry, docExpiring])).rows;
const noExp = st.find((x) => x.id === docNoExpiry);
check("a document with no expiry is NOT reported as expired",
  noExp.effective_state === "pending" && noExp.days_until_expiry === null,
  `${noExp.effective_state}, days=${noExp.days_until_expiry}`);

r = await asCommitted(ops, () => db.query(`select public.raise_document_expiry_tasks() as n`));
check("the document sweep runs", r.ok, r.ok ? `${r.value.rows[0].n} task(s)` : r.error);

const docTasks = (await db.query(
  `select entity_id from public.tasks where kind='document_expiring'`)).rows.map((x) => x.entity_id);
check("...raising a task for the expiring document", docTasks.includes(docExpiring), docTasks.join(","));
check("...AND NONE for the document whose expiry ICEFALL does not hold",
  !docTasks.includes(docNoExpiry), docTasks.includes(docNoExpiry) ? "RAISED ANYWAY" : "correctly skipped");

r = await asCommitted(ops, () => db.query(`select public.raise_document_expiry_tasks()`));
const twice = Number((await db.query(
  `select count(*) as n from public.tasks where kind='document_expiring'`)).rows[0].n);
check("running the document sweep twice does not duplicate", twice === 1, `${twice}`);

/* ========================================================================== */
/* Support — an internal note must not reach the person it is about           */
/* ========================================================================== */

const ticket = (await db.query(
  `insert into public.support_tickets (reference, subject, type, requester_id, company_id)
   values ('T-1','Asked to pay off-platform','safety',$1,$2) returning id`,
  [customer, northwind])).rows[0].id;

await db.query(
  `insert into public.support_ticket_messages (ticket_id, author_id, body, internal)
   values ($1,$2,'We are looking into it.', false),
          ($1,$3,'Second complaint about this operator this month.', true)`,
  [ticket, customer, support]);

r = await as(customer, () => db.query(`select body from public.support_ticket_messages`));
check("the person who raised the ticket sees only the reply, not the internal note",
  r.ok && rows(r) === 1, r.ok ? `${rows(r)} row(s)` : r.error);

r = await as(support, () => db.query(`select body from public.support_ticket_messages`));
check("support sees both", r.ok && rows(r) === 2, r.ok ? `${rows(r)}` : r.error);

r = await as(opN, () => db.query(`select subject from public.support_tickets`));
check("a company cannot read tickets raised about it", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

e = null;
try {
  await db.query(`update public.support_tickets set status='resolved' where id=$1`, [ticket]);
} catch (err) { e = err.message.split("\n")[0]; }
check("a ticket cannot be resolved without saying how", e !== null, e ?? "ACCEPTED");

/* ---- internal notes on a company ----------------------------------------- */

await db.query(
  `insert into public.company_notes (company_id, author_id, body)
   values ($1,$2,'Margin is thin here. Do not extend terms.')`, [northwind, finance]);

r = await as(opN, () => db.query(`select body from public.company_notes`));
check("a company cannot read ICEFALL's notes about it", r.ok && rows(r) === 0,
  r.ok ? `${rows(r)} LEAKED` : r.error);

r = await as(support, () => db.query(`select body from public.company_notes`));
check("staff can", r.ok && rows(r) === 1, r.ok ? `${rows(r)}` : r.error);

/* ---- account status ------------------------------------------------------ */

e = null;
try {
  await db.query(`update public.profiles set account_status='suspended' where id=$1`, [customer]);
} catch (err) { e = err.message.split("\n")[0]; }
check("an account cannot be suspended without a reason", e !== null, e ?? "ACCEPTED");

console.log("\nFINANCE & TRUST RESULTS\n" + "=".repeat(80));
let failed = 0;
for (const t of results) {
  if (!t.pass) failed++;
  console.log(`${t.pass ? " PASS" : " FAIL"}  ${t.name.padEnd(58)} ${t.detail ?? ""}`);
}
console.log("=".repeat(80));
console.log(`${results.length - failed}/${results.length} passed`);
await db.close();
process.exit(failed ? 1 : 0);
