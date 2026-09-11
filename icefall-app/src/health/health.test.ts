/**
 * THE HEALTH CONNECTIONS, MEASURED AGAINST THE THINGS THAT WOULD ACTUALLY HURT.
 *
 * WHY THIS FILE EXISTS. A green typecheck says four vendor cards have the right
 * shape. It says nothing about whether Polar's required credit is on screen,
 * whether Oura is genuinely switched off in all three places it has to be,
 * whether a client secret has crept into a bundle that ships to every visitor,
 * or whether the WHOOP card has quietly grown a step count WHOOP does not have.
 * Those are the failures with a consequence, so those are what is checked.
 *
 * Two kinds of check live here, and the second kind is unusual enough to
 * justify itself:
 *
 *   1. ORDINARY ASSERTIONS on code this suite can import — the vendor copy, the
 *      credit constant, the provenance label an imported Polar activity carries.
 *
 *   2. SOURCE READS of files this suite CANNOT import, because they are Deno
 *      Edge Functions and Node has no `Deno`. Reading their text is a blunt
 *      instrument and it is used narrowly: only for code tokens (`gate:
 *      "legal-hold"`, `const OURA_LEGAL_HOLD = true`), never for prose, so
 *      rewording a comment cannot fail the build but deleting a lock can.
 *
 * It follows the six suites beside it exactly: a plain TypeScript program with
 * a small harness, inside `src/` so `npm run typecheck` checks it against the
 * same types the app uses. Nothing in the app imports it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { HEALTH_PROVIDERS, HEALTH_PROVIDER_NAME, type HealthProvider } from "./types";
import { HEALTH_VENDORS } from "./vendors";
import { POLAR_SOURCE_CREDIT } from "./PolarCredit";
import { OURA_LEGAL_HOLD, OURA_LEGAL_HOLD_SENTENCE } from "@/tracking/sources/oura";
import { recordedToActivity } from "@/tracking/adapt";
import type { RecordedActivity } from "@/tracking/types";
import type { WatchProvider } from "@/watch/types";

/* -------------------------------------------------------------------------- */
/* Harness — the same thirty lines as the six suites beside it                 */
/* -------------------------------------------------------------------------- */

const proc = (globalThis as { process?: { exitCode?: number; cwd?: () => string } }).process;

let passCount = 0;
const failures: string[] = [];
let currentCase = "";

function testCase(title: string) {
  currentCase = title;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passCount++;
    console.log(`  \x1b[32mPASS\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    failures.push(`${currentCase} — ${name}${detail ? `: ${detail}` : ""}`);
    console.log(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/**
 * Reads a file the suite cannot import.
 *
 * A MISSING FILE IS A FAILURE, NOT A SKIP. A lock that has been deleted and a
 * lock that cannot be found are the same fact from here, and a suite that
 * quietly passed when the server was moved would be worse than no suite.
 */
function sourceOf(relative: string): string {
  const root = proc?.cwd?.() ?? ".";
  try {
    return readFileSync(resolve(root, relative), "utf8");
  } catch {
    return "";
  }
}

/**
 * The same file with its comments removed.
 *
 * EVERY "THIS MUST NOT EXIST" CHECK RUNS ON THIS, NOT ON THE RAW TEXT. These
 * files are heavily commented, and several of the comments quote the very
 * thing being forbidden — `withings.ts` says in prose "No cron, no
 * setInterval", which a naive scan reads as a cron. Failing a build because
 * somebody explained a rule correctly is the opposite of what the rule is for.
 * So prose is stripped and only code is searched.
 */
function codeOf(relative: string): string {
  return sourceOf(relative)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const SERVER = "../icefall-supabase/supabase/functions/health";

/* -------------------------------------------------------------------------- */
/* 1. The two copies of the vocabulary have not drifted                        */
/* -------------------------------------------------------------------------- */

{
  testCase("The app and the server agree on who the four vendors are");

  const serverTypes = sourceOf(`${SERVER}/types.ts`);
  check("the server's types.ts was found", serverTypes.length > 0, `${SERVER}/types.ts`);

  /* Both halves of a union written twice can only be kept honest by comparing
     them. This is the drift the file headers on both sides promise to prevent. */
  const unionLine = /export type HealthProvider =([^;]+);/.exec(serverTypes)?.[1] ?? "";
  const serverUnion = [...unionLine.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort();
  const clientUnion = [...HEALTH_PROVIDERS].sort();
  check(
    "the provider union matches, member for member",
    serverUnion.join(",") === clientUnion.join(","),
    `server [${serverUnion.join(", ")}] vs app [${clientUnion.join(", ")}]`,
  );

  const orderBlock = /HEALTH_PROVIDERS: readonly HealthProvider\[\] = \[([\s\S]*?)\]/.exec(
    serverTypes,
  )?.[1];
  const serverOrder = [...(orderBlock ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  check(
    "and the display ORDER matches too",
    serverOrder.join(",") === HEALTH_PROVIDERS.join(","),
    `server [${serverOrder.join(", ")}] vs app [${HEALTH_PROVIDERS.join(", ")}]`,
  );

  /* The availability words are what the app's state machine branches on. A new
     one on the server that the app has never heard of falls into
     "needs-credentials", which is a safe landing but a wrong sentence — so the
     drift is caught here rather than shown to somebody. */
  for (const word of ["ready", "needs-credentials", "legal-hold"]) {
    check(`the server still reports "${word}"`, serverTypes.includes(`"${word}"`));
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Every card can be drawn, and none of them says "health data"             */
/* -------------------------------------------------------------------------- */

{
  testCase("Every vendor card names the readings rather than a category");

  for (const provider of HEALTH_PROVIDERS) {
    const v = HEALTH_VENDORS[provider];
    check(`${provider}: there is copy for it at all`, !!v);
    check(`${provider}: the name matches the shared table`, v.name === HEALTH_PROVIDER_NAME[provider]);
    check(`${provider}: it names at least three specific readings`, v.reads.length >= 3, `${v.reads.length}`);
    check(`${provider}: it says what would be sent`, v.sends.trim().length > 0);
    check(
      `${provider}: it says plainly why there is nothing to connect to`,
      v.needsCredentials.trim().length > 0,
    );
    check(`${provider}: it states the obligation ICEFALL carries`, v.obligation.trim().length > 0);

    /* "Health data" is the sentence this whole file exists to make impossible.
       Somebody deciding whether to hand over their sleep is deciding about
       specific things, and a category name hides the part they wanted. */
    const vague = v.reads.some((r) => /health data|your data|metrics$/i.test(r.trim()));
    check(`${provider}: no reading is described as a category`, !vague);

    /* All four are read-only. A card that said otherwise would be describing a
       permission ICEFALL never requests. */
    check(`${provider}: it sends nothing`, /^nothing/i.test(v.sends.trim()));
  }
}

/* -------------------------------------------------------------------------- */
/* 3. WHOOP has no GPS and no steps, and no card implies otherwise             */
/* -------------------------------------------------------------------------- */

{
  testCase("WHOOP's absences are named, not left to be assumed");

  const whoop = HEALTH_VENDORS.whoop;
  const absent = whoop.absent.join(" ").toLowerCase();
  check("the card says there is no GPS track", absent.includes("gps"));
  check("the card says there is no step count", absent.includes("step"));

  /* The failure this guards against is a future edit adding "steps" to the
     read list because every other tracker has them. WHOOP's API does not. */
  const reads = whoop.reads.join(" ").toLowerCase();
  check("the read list does not claim steps", !reads.includes("step"));
  check("the read list does not claim a GPS route", !/gps|route/.test(reads));

  const serverWhoop = codeOf(`${SERVER}/whoop.ts`);
  check("the server's whoop.ts was found", sourceOf(`${SERVER}/whoop.ts`).length > 0);
  /* The scopes are the evidence: there is no route or step scope to ask for,
     so the adapter must not be requesting one. */
  check(
    "and it requests no location or step scope",
    !/read:(location|steps)/.test(serverWhoop),
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Withings is webhook-driven, and there is nothing that polls              */
/* -------------------------------------------------------------------------- */

{
  testCase("Withings is never polled");

  const withings = HEALTH_VENDORS.withings;
  check(
    "the card tells people ICEFALL never asks unprompted",
    /never asks unprompted|tells ICEFALL/i.test(withings.delivery),
  );
  /* The obligation, and the reason the card has no "check now" button. */
  check("and that there is no check-now control", /check now|no “check now”/i.test(withings.delivery));

  const index = sourceOf(`${SERVER}/index.ts`);
  check("the server's index.ts was found", index.length > 0);
  check("the webhook route exists", index.includes('action === "webhook"'));
  check(
    "the reachability probe Withings makes is answered",
    index.includes('req.method === "HEAD"'),
  );

  const serverWithings = sourceOf(`${SERVER}/withings.ts`);
  check("the subscriptions are registered on connect", serverWithings.includes('action: "subscribe"'));

  /* THE NEGATIVE DUTY, CHECKED AS AN ABSENCE. No timer, no interval, no cron
     anywhere in the function — the whole reason `afterConnect` exists. */
  for (const file of ["index.ts", "withings.ts", "polar.ts", "whoop.ts", "registry.ts"]) {
    const text = codeOf(`${SERVER}/${file}`);
    const polls = /setInterval|setTimeout\s*\(\s*[^,]+,\s*\d{4,}/.test(text) || /cron/i.test(text);
    check(`${file} contains no timer that could poll`, !polls);
  }
}

/* -------------------------------------------------------------------------- */
/* 5. Polar's credit is the exact words, and it travels with the data          */
/* -------------------------------------------------------------------------- */

{
  testCase("“Source: Polar” appears wherever Polar data does");

  /* The words ARE the obligation. "Data from Polar" is better English and is
     not what the agreement names. */
  check("the credit is the literal required text", POLAR_SOURCE_CREDIT === "Source: Polar");

  const imported = (provider: WatchProvider): RecordedActivity =>
    ({
      id: `test-${provider}`,
      activityTypeId: "hike",
      title: "A day out",
      startedAt: "2026-09-11T06:00:00.000Z",
      endedAt: "2026-09-11T09:00:00.000Z",
      simulated: false,
      origin: {
        kind: "imported",
        provider,
        providerActivityId: "abc",
        deviceName: "Vantage V3",
        importedAt: "2026-09-11T10:00:00.000Z",
        vendorEntered: null,
        movingSecMeasured: false,
      },
      durationSec: 10_800,
      movingSec: 10_800,
      distanceM: 12_000,
      elevationGainM: 900,
      elevationLossM: 900,
      maxAltitudeM: null,
      minAltitudeM: null,
      avgSpeedMps: null,
      avgPaceSecPerKm: null,
      avgHeartRateBpm: null,
      maxHeartRateBpm: null,
      avgCadenceSpm: null,
      calories: null,
      temperatureC: null,
      points: [],
      splits: [],
    }) as unknown as RecordedActivity;

  const polarActivity = recordedToActivity(imported("polar"));
  check(
    "an imported Polar activity carries the credit in the line that travels with it",
    (polarActivity.location ?? "").includes(POLAR_SOURCE_CREDIT),
    polarActivity.location ?? "(no location)",
  );
  check(
    "and it still says which watch it came from",
    (polarActivity.location ?? "").includes("Vantage V3"),
  );

  /* The credit belongs to Polar and to nothing else — attaching it to another
     vendor's activity would be a false attribution, not a harmless extra. */
  const corosActivity = recordedToActivity(imported("coros"));
  check(
    "a COROS activity is not credited to Polar",
    !(corosActivity.location ?? "").includes(POLAR_SOURCE_CREDIT),
    corosActivity.location ?? "(no location)",
  );

  /* And no logo, anywhere. ICEFALL has no written consent for a Polar mark. */
  const credit = codeOf("src/health/PolarCredit.tsx");
  check(
    "the credit component draws text and not an image",
    sourceOf("src/health/PolarCredit.tsx").length > 0 &&
      !/<img|<svg|logo\.(png|svg)/i.test(credit),
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Oura is switched off, in all three places, and cannot be switched on by  */
/*    an environment variable                                                  */
/* -------------------------------------------------------------------------- */

{
  testCase("Oura is held off by three separate locks");

  check("the app's lock is engaged", OURA_LEGAL_HOLD === true);
  check(
    "and its sentence names the charging clause",
    /charg/i.test(OURA_LEGAL_HOLD_SENTENCE),
    OURA_LEGAL_HOLD_SENTENCE.slice(0, 60) + "…",
  );
  check("and the AI-training clause", /AI model/i.test(OURA_LEGAL_HOLD_SENTENCE));

  const serverOura = sourceOf(`${SERVER}/oura.ts`);
  check(
    "the shared connection path's lock is engaged",
    /const OURA_LEGAL_HOLD_CLEARED = false/.test(serverOura),
  );
  check(
    "and the gate is checked before any credential",
    /gate: OURA_LEGAL_HOLD_CLEARED \? "none" : "legal-hold"/.test(serverOura),
  );

  const vercelOura = sourceOf("../icefall-web/api/_oura.mjs");
  check("the Vercel server's lock is engaged", /const OURA_LEGAL_HOLD = true/.test(vercelOura));
  check(
    "and ouraReady refuses before it looks at configuration",
    /if \(OURA_LEGAL_HOLD\) return \{ ready: false, reason: "legal_hold" \}/.test(vercelOura),
  );

  /* THE POINT OF A CONSTANT. A hold that an environment variable could lift is
     a hold anybody can lift in a hurry, from a dashboard, with no record that
     the two clauses were ever read. */
  for (const [label, text] of [
    ["the app", sourceOf("src/tracking/sources/oura.ts")],
    ["the shared path", serverOura],
    ["the Vercel server", vercelOura],
  ] as const) {
    const envLifted = /(OURA_LEGAL_HOLD|LEGAL_HOLD_CLEARED)[^\n]*(import\.meta\.env|process\.env|Deno\.env)/.test(
      text,
    );
    check(`${label}'s lock is not readable from the environment`, !envLifted);
  }

  /* Reading and deleting what is already stored must survive the hold — a hold
     that trapped somebody's health data would be worse than the thing it
     prevents. `/summary` and `/disconnect` do not call `ouraReady`. */
  const summaryGated = /export async function handleOuraSummary[\s\S]{0,400}?ouraReady\(/.test(
    vercelOura,
  );
  const disconnectGated = /export async function handleOuraDisconnect[\s\S]{0,400}?ouraReady\(/.test(
    vercelOura,
  );
  check("reading an existing summary is not blocked by the hold", !summaryGated);
  check("and neither is disconnecting", !disconnectGated);
}

/* -------------------------------------------------------------------------- */
/* 7. No client secret can reach the browser                                   */
/* -------------------------------------------------------------------------- */

{
  testCase("The bundle holds no secret, and could not");

  /* Anything named VITE_* is compiled into the public bundle. The Oura work
     said it first: "If a VITE_OURA_CLIENT_SECRET ever appears, it has already
     leaked." This is that sentence as a test, over every file this feature
     added to the app. */
  const appFiles = [
    "src/health/connections.ts",
    "src/health/vendors.ts",
    "src/health/types.ts",
    "src/health/PolarCredit.tsx",
    "src/screens/settings/HealthAccounts.tsx",
  ];
  for (const file of appFiles) {
    const text = codeOf(file);
    check(`${file} was found`, sourceOf(file).length > 0);
    const leak = /VITE_[A-Z_]*(SECRET|TOKEN|KEY)/.exec(text)?.[0];
    /* VITE_SUPABASE_PUBLISHABLE_KEY is the one legitimate exception anywhere in
       this app — it grants nothing on its own and row-level security is what
       protects the data — and none of these files uses even that. */
    check(`${file} references no VITE_ secret`, !leak, leak ?? "");
    check(
      `${file} names no vendor client secret at all`,
      !/CLIENT_SECRET/.test(text),
    );
  }

  /* And the server end: the tokens it writes must be sealed before the insert,
     with no branch that stores a readable one. */
  const index = sourceOf(`${SERVER}/index.ts`);
  check(
    "the server seals the access token before writing it",
    /access_token: await sealToken\(/.test(index),
  );
  check(
    "and the refresh token too",
    /refresh_token: await sealNullable\(/.test(index),
  );
  check(
    "and refuses every vendor when there is no key to seal with",
    /if \(!hasTokenKey\(\)\) return "needs-credentials"/.test(index),
  );

  const migration = sourceOf("../icefall-supabase/migrations/20260911120000_health_connections.sql");
  check("the migration was found", migration.length > 0);
  check(
    "the connection table grants the browser nothing",
    /revoke all on public\.health_connections from anon, authenticated/.test(migration),
  );
  check(
    "and health_status() returns no token column",
    !/access_token|refresh_token/.test(
      /create or replace function public\.health_status\(\)[\s\S]*?\$\$/.exec(migration)?.[0] ?? "",
    ),
  );
}

/* -------------------------------------------------------------------------- */

console.log(
  failures.length === 0
    ? `\n\x1b[1m${passCount} passed, 0 failed\x1b[0m`
    : `\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m\n${failures.map((f) => `  · ${f}`).join("\n")}`,
);
console.log(
  "\n\x1b[2mWHAT THIS RUN DOES NOT PROVE: that any of the four OAuth flows works.\n" +
    "ICEFALL holds no credentials for Polar, WHOOP, Withings or Oura, so no\n" +
    "token exchange has ever been run against a real vendor — the endpoints,\n" +
    "the scope strings and the refresh behaviour are unverified until Charlie\n" +
    "registers each app. What is proved is that with no credentials the screen\n" +
    "says so per vendor, that Polar's credit and Oura's hold are where they\n" +
    "have to be, and that nothing in the browser bundle holds a secret.\x1b[0m",
);
if (failures.length > 0 && proc) proc.exitCode = 1;
