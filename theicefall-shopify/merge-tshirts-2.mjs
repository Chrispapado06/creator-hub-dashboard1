import fs from "node:fs";

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

const env = loadEnv(new URL("./.env", import.meta.url));
const DOMAIN = env.SHOPIFY_STORE_DOMAIN;
const TOKEN = env.SHOPIFY_ACCESS_TOKEN;
const API = `https://${DOMAIN}/admin/api/2026-07`;

async function shopify(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

const BASE_ID = 16055631217020;
const OTHER_IDS = [16055631249788, 16055631282556, 16055631315324];

// Images already copied onto base product in a prior run — main image per color:
const mainImageIdByColor = {
  White: 84396051956092,
  Coffee: 84396052382076,
  "Navy Blue": 84396053201276,
};

const base = (await shopify("GET", `/products/${BASE_ID}.json`)).product;
const colorOption = base.options.find((o) => o.name === "Color");
const sizeOption = base.options.find((o) => o.name === "Size");

const variants = base.variants.map((v) => ({
  id: v.id,
  option1: v.option1,
  option2: v.option2,
  price: v.price,
  sku: v.sku,
  weight: v.weight,
  weight_unit: v.weight_unit,
  inventory_management: v.inventory_management,
  inventory_policy: v.inventory_policy,
  image_id: v.image_id,
}));

const colorValues = [colorOption.values[0]]; // Black

for (const otherId of OTHER_IDS) {
  const other = (await shopify("GET", `/products/${otherId}.json`)).product;
  const color = other.options.find((o) => o.name === "Color").values[0];
  colorValues.push(color);
  for (const v of other.variants) {
    variants.push({
      option1: color,
      option2: v.option2,
      price: v.price,
      sku: v.sku,
      weight: v.weight,
      weight_unit: v.weight_unit,
      inventory_management: v.inventory_management,
      inventory_policy: v.inventory_policy,
      image_id: mainImageIdByColor[color],
    });
  }
}

console.log(`Updating base product with ${colorValues.length} colors, ${variants.length} variants...`);

const updated = await shopify("PUT", `/products/${BASE_ID}.json`, {
  product: {
    id: BASE_ID,
    options: [
      { id: colorOption.id, name: "Color", values: colorValues },
      { id: sizeOption.id, name: "Size", values: sizeOption.values },
    ],
    variants,
  },
});
console.log(`Success. Product now has ${updated.product.variants.length} variants.`);

for (const otherId of OTHER_IDS) {
  await shopify("PUT", `/products/${otherId}.json`, {
    product: { id: otherId, status: "archived" },
  });
  console.log(`Archived product ${otherId}`);
}

console.log("Done.");
