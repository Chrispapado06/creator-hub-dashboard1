// One-off helper: register ICEFALL as a public OAuth client with COROS's
// self-serve MCP tier, for one region at a time.
//
// COROS's MCP OAuth discovery documents (fetched 2026-09-07) publish an open
// Dynamic Client Registration endpoint per region — no approval, no signed
// agreement, which is exactly why this tier is `gate: "none"` in registry.ts.
// The request body below is COROS's OWN reference client's DCR body, copied
// from its login script, not guessed:
//
//   { client_name, redirect_uris: [...], grant_types: ["authorization_code",
//     "refresh_token"], response_types: ["code"], scope, token_endpoint_auth_method: "none" }
//
// This is a LOCAL, MANUAL, RUN-ONCE-PER-REGION script — it is not deployed,
// it touches nothing in Supabase, and it makes no change ICEFALL depends on
// until a human takes its output and runs
// `supabase secrets set COROS_CLIENT_ID_EU=...` (or `_US`) by hand.
//
// USAGE:
//   deno run --allow-net icefall-supabase/scripts/coros-register-client.ts eu \
//     https://bckukbtwqqncnhzxygaf.functions.supabase.co/watch/coros/callback
//   deno run --allow-net icefall-supabase/scripts/coros-register-client.ts us \
//     https://bckukbtwqqncnhzxygaf.functions.supabase.co/watch/coros/callback
//
// Run it once for "eu" and once for "us" — the DCR registration_endpoint
// genuinely differs per issuer (mcpeu.coros.com vs mcpus.coros.com), so a
// client registered against one is not a valid client_id against the other.
// That is also why registry.ts's COROS adapter needs TWO secrets
// (COROS_CLIENT_ID_EU, COROS_CLIENT_ID_US) rather than one.

const ISSUER: Record<"eu" | "us", string> = {
  eu: "https://mcpeu.coros.com",
  us: "https://mcpus.coros.com",
};

/** Must match coros.ts's SCOPE exactly — a client registered with a narrower
 *  scope than the app later requests will have the authorize step refused. */
const SCOPE = "openid offline_access mcp.tools";

async function main() {
  const [regionArg, redirectUri] = Deno.args;
  if (regionArg !== "eu" && regionArg !== "us") {
    console.error("Usage: coros-register-client.ts <eu|us> <redirect_uri>");
    Deno.exit(1);
  }
  if (!redirectUri) {
    console.error("Usage: coros-register-client.ts <eu|us> <redirect_uri>");
    Deno.exit(1);
  }

  const issuer = ISSUER[regionArg];
  const res = await fetch(`${issuer}/connect/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: `ICEFALL (${regionArg.toUpperCase()})`,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: SCOPE,
      // Public client — no secret held anywhere, matches the token
      // endpoint's documented `token_endpoint_auth_methods_supported`
      // including "none".
      token_endpoint_auth_method: "none",
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`COROS DCR failed (${res.status}):`, body);
    Deno.exit(1);
  }

  console.log(`COROS ${regionArg.toUpperCase()} client registered:`);
  console.log(body);
  console.log("");
  console.log(
    `Now run: supabase secrets set COROS_CLIENT_ID_${regionArg.toUpperCase()}=<client_id from above>`,
  );
}

if (import.meta.main) {
  await main();
}
