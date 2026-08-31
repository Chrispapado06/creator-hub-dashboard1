#!/usr/bin/env node
// Christos's operating cadence, seeded into the existing recurring_tasks table.
//
// The full extracted cadence is ~50 rules / ~52h a week (see
// ../CHRISTOS_OPERATING_CADENCE.md). This seeds the 21 with the most leverage.
//
// TITLES ARE SHORT ON PURPOSE — "Salary Payments", not "Salary payment run — no
// row pays without a final-check verdict". The title is what you scan in a list
// of fifteen; the description is what you read when you open one. Everything
// the old long titles carried now lives in the first line of the description,
// so nothing was lost in the shortening.
//
// recurring_tasks has no weekday column, so a weekly rule is interval_days=7
// with next_run set to the correct upcoming weekday.
//
// Idempotent three ways: renames a rule if its old title is still in the table,
// updates a description that has changed, and inserts only what is missing.
// Running it twice does nothing the second time.
//
//   node seed-rules.mjs            # dry run — prints the plan
//   node seed-rules.mjs --apply    # writes
//
// Env: SUPABASE_URL, SUPABASE_KEY (publishable is enough — RLS is open).

const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_KEY;
const APPLY = process.argv.includes("--apply");
const ASSIGNEE = process.env.CADENCE_ASSIGNEE_ID || "06e819db-1ec4-436c-b76e-1ff563e3ac93"; // Christofis
if (!U || !K) { console.error("SUPABASE_URL / SUPABASE_KEY missing"); process.exit(1); }

const TODAY = process.env.SEED_TODAY || new Date().toISOString().slice(0, 10);

const iso = (d) => d.toISOString().slice(0, 10);
function nextWeekday(target) {           // 1=Mon .. 7=Sun, never today
  const d = new Date(`${TODAY}T00:00:00Z`);
  const cur = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Parenthesised deliberately: `a + b % 7 || 7` parses as `(a + b) || 7`, so
  // the "same weekday as today" case silently returned TODAY instead of +7.
  const delta = ((((target - cur) % 7) + 7) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return iso(d);
}
const tomorrow = () => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return iso(d); };
function endOfMonth() {                  // last WORKING day of this month
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
  return iso(d);
}

const MON = 1, TUE = 2, WED = 3, THU = 4, FRI = 5;

// [ title, interval, next_run, description, previousTitle ]
const RULES = [
  // ── Daily ─────────────────────────────────────────────────────────────────
  ["Mass Message Approval", 1, tomorrow(),
   "Approve every account's Day-block MM batch before 11:00, and set the send-deadline slot for each. Eight chatters stall behind this for eight hours if it slips. (p8 #5)",
   "Approve Day-block MMs before 11:00"],

  ["Chatting QA Sweep", 1, tomorrow(),
   "Review overnight breaches, PPV follow-ups and response times across the Night and Evening blocks. Give every flagged account or chatter a disposition: coach, ignore, or escalate. Exceptions only — not all 8 accounts daily. (p8 #1/#2/#3)",
   "Overnight exception sweep — breaches, PPV follow-ups, response times"],

  ["Meta Ads", 1, tomorrow(),
   "Read spend / CPA / ROAS per creator, then make ONE change. Kill or scale a single thing — do not browse. First item on the daily checklist. (p2 #3, p3)",
   "Meta ads — make ONE change, do not browse"],

  ["Posting Checkpoint", 1, tomorrow(),
   "Mid-day check: which accounts are behind on stories, where the feed-post gaps are, which tracking links went dead. The only posting report today fires at 23:00 — six hours after your day ends. (p21 #1, p23 #3, p25)",
   "Mid-day posting + promo checkpoint"],

  ["Compliance Check", 1, tomorrow(),
   "Two hard rules. NO NUDITY UNDER $100 ON 18YO ACCOUNTS — the only all-caps rule in the document. And no more than 2 active unsent mass messages on any account. A banned account is total revenue loss, not a dip. (p8 #9, p8 #6)",
   "Compliance sweep — nudity price floor + unsent MM cap"],

  ["Whale Morning Touch", 1, tomorrow(),
   "Check which whales got no personalised message this morning and assign each miss to a named chatter. Whales also need non-sexual background touchpoints. A neglected whale sends no signal, so nothing surfaces it unless you look. (p8 #15)",
   "Whale morning touch — who got no message today"],

  ["Luca Sync", 1, tomorrow(),
   "Standing daily sync: EOM position against the $50k target, plus today's blockers. The only daily sync in the doc, and it currently produces no artifact. Bring the money number and the flag list. (p2, p3, p7)",
   "Daily Luca sync — EOM position + today's blockers"],

  // ── Monday ────────────────────────────────────────────────────────────────
  ["Weekly Focus", 7, nextWeekday(MON),
   "Name ONE chatter, ONE team and ONE account to focus on this week, and put everything else explicitly on trust-the-system. The doc's own answer to being over capacity. If one rule survives, make it this one. (p7 #5)",
   "Weekly focus decision — ONE chatter, ONE team, ONE account"],

  ["Salary Payments", 7, nextWeekday(MON),
   "Pay the salary creators. HARD RULE: no row pays without a final-check verdict on its content — otherwise 'we're paying for nothing' fires weekly. Luca asks for this reminder verbatim. (p16, p17)",
   "Salary payment run — no row pays without a final-check verdict"],

  ["Script Review", 7, nextWeekday(MON),
   "60 min, fixed agenda: verdicts due (40 sends or 14 days), tired sweep (<70% of own first-week rate, or >90 days live), depth check (>=6 core per account), iteration reads, cross-account duplicate check. (p8, p17, p18)",
   "Weekly script review — verdicts, tired sweep, depth check"],

  // ── Tuesday ───────────────────────────────────────────────────────────────
  ["Chatter Training", 7, nextWeekday(TUE),
   "Weekly improvement session. Challenge their thinking, let them challenge their own. Every chatter leaves with last week's area reviewed and ONE new named area. The only mechanism that makes '1% better every day' real. (p8 #19, p9)",
   "Chatter improvement session — one named area each"],

  // ── Wednesday ─────────────────────────────────────────────────────────────
  ["Account QC", 7, nextWeekday(WED),
   "Antonella, Nicole and Ella — all three named in the doc. More stories, better quality posts, everything edited before it goes live. Nicole and Ella also need more daytime SFS slots. Check story count is up week-on-week. (p21 #2/#3, p25)",
   "Account QC — Antonella, Nicole, Ella"],

  ["Account Optimisation", 7, nextWeekday(WED),
   "Audit 2 accounts this week: right pictures, bio correct, niche down, name done, feed posts better. Named right now — Rose needs an optimised banner, emily/charlotte captions need reviewing. Rotate so every account is audited monthly. (p17, p20, p21 #4/#8)",
   "Account optimisation audit — 2 accounts this week"],

  // ── Thursday ──────────────────────────────────────────────────────────────
  ["Promo Assets to JA", 7, nextWeekday(THU),
   "HARD DEADLINE. Captions and edited assets due to JA for next week's promo schedule. JA builds the schedule from these; Liz/Lance approve Mon/Tue. Miss it and the whole week's promo slips. This deadline is derived from the chain — it appears nowhere in the doc.",
   "Captions + edited assets due to JA for next week's promo"],

  // ── Friday ────────────────────────────────────────────────────────────────
  ["Master List", 7, nextWeekday(FRI),
   "Maintain the list: who gets more slots, who can run permanent feed-post SFS, who can't, which content/caption/model rotations apply. This artifact does not exist yet, and until it does you are in the loop for every scheduling decision. (p23 #2, p21 #9)",
   "Maintain the MASTER LIST — slots, permanent SFS, rotations"],

  ["Content Final Check", 7, nextWeekday(FRI),
   "Every content row this week needs a verdict before you leave Friday. Unverdicted rows are BLOCKED from Monday's payment run — this deliberately sits before the pay clock. (p17)",
   "Final check on all edited content — before Monday's pay gate"],

  ["Flag to Luca", 7, nextWeekday(FRI),
   "Send the standing weak-areas list with severity and age; re-ping anything over two weeks old. Luca asks for this in capitals: 'URGENTLY FLAGGING TO ME (LUCA) areas that aren't up to speed.' (p7)",
   "Weekly flag-to-Luca sweep — everything not up to speed"],

  ["External SFS Swaps", 7, nextWeekday(FRI),
   "Promised vs delivered per partner. Current: Tom, huzz, Dan. Still to set up: Blue, Marissa, Emma, Antonella, Ella. External partners expose no API, so one-sided delivery is invisible — tick off every promised slot and flag under-deliverers BEFORE giving them more. (p2 #1, p5)",
   "External SFS swaps — promised vs delivered per partner"],

  ["Whale Audit", 7, nextWeekday(FRI),
   "Every fan spending $3k+ this month needs an identifiable above-and-beyond touchpoint logged this week, plus WHITEKNIGHT and model KYC in use. One whale held for the stated year is $36k. Highest revenue-per-hour obligation in the document. (p8 #16, p8 #17)",
   "$3k+/month whale audit — special treatment actually happening"],

  // ── Monthly ───────────────────────────────────────────────────────────────
  ["EOM Close", 30, endOfMonth(),
   "Record the month against target: $50k generated and 3 salaries signed, each with a variance reason. NOTE: interval_days cannot express month-end, so this drifts a few days each month — reset next_run manually, same as the monthly invoicing rule. (p2)",
   "EOM close — $50k generated + 3 salaries signed"],
];

// One-off: done once, then it exists forever.
const ONE_OFFS = [
  ["Optimised OF Standard", nextWeekday(MON),
   "Write the one-page definition of what an optimised OF page is: pictures, bio, niche, name, and the feed-post bar — written so someone ELSE can pass an account against it without you. p21 #8 asks for this by name. It is the delegation unlock for every account audit you currently do yourself. ~60 min, once.",
   "Write the one-page 'what an optimised OF page is'"],
];

async function sb(path, init) {
  const r = await fetch(`${U}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: K, Authorization: `Bearer ${K}`, "Content-Type": "application/json", ...(init && init.headers) },
  });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
const enc = encodeURIComponent;
const DOW = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dowOf = (d) => DOW[(new Date(`${d}T00:00:00Z`).getUTCDay() || 7)];

const rules = await sb("recurring_tasks?select=id,title,description");
const byTitle = new Map(rules.map((r) => [r.title, r]));

// Tasks already generated from a rule carry the OLD title as a snapshot — the
// generator copies title and description at insert time, so renaming the rule
// alone would leave today's open task showing the long title.
const openTasks = await sb(`standalone_tasks?status=eq.open&assignee_id=eq.${ASSIGNEE}&select=id,title`);
const openByTitle = new Map(openTasks.map((t) => [t.title, t]));

const priorTasks = await sb(`standalone_tasks?assignee_id=eq.${ASSIGNEE}&select=title`);
const haveTask = new Set(priorTasks.map((t) => t.title));

const plan = { rename: [], describe: [], insert: [], retitleTask: [], oneOff: [] };

for (const [title, interval_days, next_run, description, was] of RULES) {
  const current = byTitle.get(title);
  const old = was && was !== title ? byTitle.get(was) : null;
  if (old) plan.rename.push({ id: old.id, from: was, to: title, description });
  else if (!current) plan.insert.push({ title, description, assignee_id: ASSIGNEE, interval_days, next_run, active: true, created_by: "cadence" });
  else if (current.description !== description) plan.describe.push({ id: current.id, title, description });

  // Fix any live task still carrying the long title.
  const t = was && openByTitle.get(was);
  if (t) plan.retitleTask.push({ id: t.id, from: was, to: title, description });
}

for (const [title, due_date, description, was] of ONE_OFFS) {
  if (haveTask.has(title)) continue;
  const old = was && haveTask.has(was) ? was : null;
  if (old) {
    const t = openByTitle.get(was);
    if (t) plan.retitleTask.push({ id: t.id, from: was, to: title, description });
  } else {
    plan.oneOff.push({ title, description, assignee_id: ASSIGNEE, due_date, status: "open", created_by: "cadence" });
  }
}

console.log(`today ${TODAY} · assignee ${ASSIGNEE} · ${rules.length} rules in table\n`);
for (const r of plan.rename)      console.log(`  ~ rename rule   "${r.from}"\n                → "${r.to}"`);
for (const r of plan.describe)    console.log(`  ~ description   ${r.title}`);
for (const r of plan.insert)      console.log(`  + every ${String(r.interval_days).padStart(2)}d  ${r.next_run} (${dowOf(r.next_run)})  ${r.title}`);
for (const r of plan.retitleTask) console.log(`  ~ live task     "${r.from}" → "${r.to}"`);
for (const r of plan.oneOff)      console.log(`  + one-off       due ${r.due_date} (${dowOf(r.due_date)})  ${r.title}`);

const n = plan.rename.length + plan.describe.length + plan.insert.length + plan.retitleTask.length + plan.oneOff.length;
if (!n) { console.log("nothing to do"); process.exit(0); }
if (!APPLY) { console.log(`\n${n} change${n === 1 ? "" : "s"}. Re-run with --apply.`); process.exit(0); }

for (const r of plan.rename) {
  await sb(`recurring_tasks?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ title: r.to, description: r.description }), headers: { Prefer: "return=minimal" } });
}
for (const r of plan.describe) {
  await sb(`recurring_tasks?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ description: r.description }), headers: { Prefer: "return=minimal" } });
}
if (plan.insert.length) await sb("recurring_tasks", { method: "POST", body: JSON.stringify(plan.insert), headers: { Prefer: "return=minimal" } });
for (const r of plan.retitleTask) {
  await sb(`standalone_tasks?id=eq.${r.id}`, { method: "PATCH", body: JSON.stringify({ title: r.to, description: r.description }), headers: { Prefer: "return=minimal" } });
}
if (plan.oneOff.length) await sb("standalone_tasks", { method: "POST", body: JSON.stringify(plan.oneOff), headers: { Prefer: "return=minimal" } });

console.log(`\n${plan.rename.length} renamed · ${plan.describe.length} descriptions · ${plan.insert.length} new rules · ${plan.retitleTask.length} live tasks retitled · ${plan.oneOff.length} one-off`);
