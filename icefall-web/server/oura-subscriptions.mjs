/**
 * Oura webhook subscriptions — an OPERATOR COMMAND, not an endpoint.
 *
 *   node server/oura-subscriptions.mjs list
 *   node server/oura-subscriptions.mjs create
 *   node server/oura-subscriptions.mjs renew
 *   node server/oura-subscriptions.mjs delete <id>
 *   node server/oura-subscriptions.mjs delete-all
 *
 * ── WHY THIS IS NOT AN HTTP ROUTE ───────────────────────────────────────────
 *
 * Subscription management authenticates with `x-client-id` and
 * `x-client-secret` — the OAuth client secret, sent as a header. It is not a
 * user action, it takes the application-wide credential, and it changes what
 * every ICEFALL user's ring delivers. A URL that does that is a URL somebody
 * eventually finds; a command in a terminal is not.
 *
 * ── SUBSCRIPTIONS ARE PER APPLICATION, NOT PER PERSON ───────────────────────
 *
 * One set covers everybody who has ever authorised ICEFALL. That is why the
 * webhook handler never answers 410 for a disconnected user: 410 cancels the
 * subscription, and it would cancel it for all of them at once.
 *
 * ── SUBSCRIPTIONS EXPIRE, AND THE PERIOD IS NOT PUBLISHED ───────────────────
 *
 * Every subscription carries `expiration_time` and there is a renew endpoint,
 * but Oura documents no duration anywhere I could find. `list` prints the
 * expiry and the days remaining, so the renewal interval can be read off a real
 * subscription rather than guessed. UNTIL SOMETHING CALLS `renew` ON A
 * SCHEDULE, DELIVERY WILL STOP SILENTLY when they lapse — which is why stale
 * rows age out into "no recent data" in `_oura.mjs` instead of sitting on a
 * screen looking current.
 */

import { readFileSync } from "node:fs";
import {
  WEBHOOK_DATA_TYPES,
  WEBHOOK_EVENT_TYPES,
  createSubscription,
  deleteSubscription,
  listSubscriptions,
  renewSubscription,
} from "../api/_oura-client.mjs";

/* Same loader and precedence as index.mjs — environment beats both files. */
function loadEnvFile(url) {
  try {
    for (const line of readFileSync(url, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    /* file absent — normal */
  }
}
loadEnvFile(new URL("./.env", import.meta.url));
loadEnvFile(new URL("../.env.local", import.meta.url));

const env = process.env;
const [, , command, arg] = process.argv;

function requireEnv(names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) {
    console.error(`Missing: ${missing.join(", ")}\nSet them in icefall-web/server/.env — see .env.example.`);
    process.exit(1);
  }
}

const daysLeft = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? Math.round((t - Date.now()) / 86_400_000) : null;
};

async function cmdList() {
  requireEnv(["OURA_CLIENT_ID", "OURA_CLIENT_SECRET"]);
  const subs = (await listSubscriptions(env)) || [];
  if (!subs.length) {
    console.log("No subscriptions. Nothing will be delivered to the webhook.");
    return;
  }
  console.log(`${subs.length} subscription(s):\n`);
  for (const s of subs) {
    const left = daysLeft(s.expiration_time);
    console.log(
      `  ${s.data_type.padEnd(18)} ${s.event_type.padEnd(7)} expires ${s.expiration_time}` +
        (left === null ? "" : `  (${left} day${left === 1 ? "" : "s"} left)`),
    );
    console.log(`    id ${s.id}  ->  ${s.callback_url}`);
  }
  console.log(
    "\nThe expiry above is the ONLY published statement of the renewal period.\n" +
      "Set a reminder for well before the earliest one, and run `renew`.",
  );
}

async function cmdCreate() {
  requireEnv([
    "OURA_CLIENT_ID",
    "OURA_CLIENT_SECRET",
    "OURA_WEBHOOK_URL",
    "OURA_WEBHOOK_VERIFICATION_TOKEN",
  ]);
  const callbackUrl = env.OURA_WEBHOOK_URL;

  if (!callbackUrl.startsWith("https://")) {
    // Oura performs the verification handshake against this URL from their own
    // servers, so it has to be publicly reachable over HTTPS. localhost fails
    // at their end, not ours, which makes it a confusing failure to debug.
    console.error(`OURA_WEBHOOK_URL must be a public https URL. Got: ${callbackUrl}`);
    process.exit(1);
  }

  const existing = (await listSubscriptions(env)) || [];
  const has = (d, e) => existing.some((s) => s.data_type === d && s.event_type === e);

  let made = 0;
  for (const dataType of WEBHOOK_DATA_TYPES) {
    for (const eventType of WEBHOOK_EVENT_TYPES) {
      if (has(dataType, eventType)) {
        console.log(`  = ${dataType} / ${eventType} already exists`);
        continue;
      }
      try {
        const s = await createSubscription(env, { callbackUrl, eventType, dataType });
        made++;
        console.log(`  + ${dataType} / ${eventType}  expires ${s?.expiration_time || "?"}`);
      } catch (e) {
        // Reported and continued: one refused pair should not abandon the rest,
        // and the message from Oura is the useful part.
        console.error(`  ! ${dataType} / ${eventType}: ${e.message}`);
      }
    }
  }
  console.log(`\n${made} created. Run \`list\` to see the expiry dates.`);
}

async function cmdRenew() {
  requireEnv(["OURA_CLIENT_ID", "OURA_CLIENT_SECRET"]);
  const subs = (await listSubscriptions(env)) || [];
  for (const s of subs) {
    try {
      const r = await renewSubscription(env, s.id);
      console.log(`  ~ ${s.data_type} / ${s.event_type} -> ${r?.expiration_time || "renewed"}`);
    } catch (e) {
      console.error(`  ! ${s.data_type} / ${s.event_type}: ${e.message}`);
    }
  }
}

async function cmdDelete(id) {
  requireEnv(["OURA_CLIENT_ID", "OURA_CLIENT_SECRET"]);
  if (!id) {
    console.error("Usage: node server/oura-subscriptions.mjs delete <id>");
    process.exit(1);
  }
  await deleteSubscription(env, id);
  console.log(`deleted ${id}`);
}

async function cmdDeleteAll() {
  requireEnv(["OURA_CLIENT_ID", "OURA_CLIENT_SECRET"]);
  const subs = (await listSubscriptions(env)) || [];
  for (const s of subs) {
    await deleteSubscription(env, s.id);
    console.log(`  - ${s.data_type} / ${s.event_type}`);
  }
  console.log(`\n${subs.length} deleted. NOTHING will be delivered until \`create\` is run again.`);
}

const commands = {
  list: cmdList,
  create: cmdCreate,
  renew: cmdRenew,
  delete: () => cmdDelete(arg),
  "delete-all": cmdDeleteAll,
};

const run = commands[command];
if (!run) {
  console.log(
    "Usage: node server/oura-subscriptions.mjs <list|create|renew|delete <id>|delete-all>",
  );
  process.exit(1);
}

run().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
