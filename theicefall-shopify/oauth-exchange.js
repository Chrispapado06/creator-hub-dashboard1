import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { URL } from "node:url";

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  return env;
}

const envPath = new URL("./.env", import.meta.url);
const env = loadEnv(envPath);

const {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_CLIENT_ID,
  SHOPIFY_CLIENT_SECRET,
  SHOPIFY_SCOPES,
  SHOPIFY_REDIRECT_URI,
} = env;

const redirect = new URL(SHOPIFY_REDIRECT_URI);
const port = Number(redirect.port);
const state = crypto.randomBytes(16).toString("hex");

const authorizeUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${encodeURIComponent(SHOPIFY_SCOPES)}&redirect_uri=${encodeURIComponent(SHOPIFY_REDIRECT_URI)}&state=${state}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname !== redirect.pathname) {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const shop = url.searchParams.get("shop");

  if (returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("State mismatch — aborting.");
    console.error("State mismatch, aborting.");
    server.close();
    return;
  }
  if (shop && shop !== SHOPIFY_STORE_DOMAIN) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Unexpected shop domain — aborting.");
    console.error(`Unexpected shop domain in callback: ${shop}`);
    server.close();
    return;
  }

  try {
    const tokenRes = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: SHOPIFY_CLIENT_ID,
        client_secret: SHOPIFY_CLIENT_SECRET,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${text}`);
    }

    const data = await tokenRes.json();
    const accessToken = data.access_token;

    const envContent = fs.readFileSync(envPath, "utf8");
    const updated = envContent.includes("SHOPIFY_ACCESS_TOKEN=")
      ? envContent.replace(/SHOPIFY_ACCESS_TOKEN=.*/g, `SHOPIFY_ACCESS_TOKEN=${accessToken}`)
      : envContent.trimEnd() + `\nSHOPIFY_ACCESS_TOKEN=${accessToken}\n`;
    fs.writeFileSync(envPath, updated);

    res.writeHead(200, { "Content-Type": "text/plain" }).end("Success! Access token saved. You can close this tab and return to the terminal.");
    console.log("Access token saved to .env as SHOPIFY_ACCESS_TOKEN.");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed — check the terminal.");
    console.error(err.message);
  } finally {
    server.close();
  }
});

server.listen(port, () => {
  console.log(`Listening on ${SHOPIFY_REDIRECT_URI}`);
  console.log("\nOpen this URL in your browser (the one where you're logged into Shopify admin) to authorize:\n");
  console.log(authorizeUrl);
  console.log("\nWaiting for the redirect...");
});
