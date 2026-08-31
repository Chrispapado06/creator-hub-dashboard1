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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

const BASE_ID = 16055631217020; // Black
const OTHER_IDS = [16055631249788, 16055631282556, 16055631315324]; // White, Coffee, Navy Blue

const base = (await shopify("GET", `/products/${BASE_ID}.json`)).product;
console.log("Base product:", base.title, base.id);

const colorValues = [...base.options.find((o) => o.name === "Color").values];
const sizeValues = base.options.find((o) => o.name === "Size").values;

const newVariants = [];
const imageIdByColor = {};

for (const otherId of OTHER_IDS) {
  const other = (await shopify("GET", `/products/${otherId}.json`)).product;
  const color = other.options.find((o) => o.name === "Color").values[0];
  console.log(`Processing ${color} from product ${otherId}...`);

  let mainImageId = null;
  for (const img of other.images) {
    const created = await shopify("POST", `/products/${BASE_ID}/images.json`, {
      image: { src: img.src },
    });
    if (img.id === other.variants[0].image_id) {
      mainImageId = created.image.id;
    }
    console.log(`  copied image ${img.id} -> ${created.image.id}`);
  }
  imageIdByColor[color] = mainImageId;
  colorValues.push(color);

  for (const v of other.variants) {
    newVariants.push({
      option1: color,
      option2: v.option2, // size
      price: v.price,
      sku: v.sku,
      weight: v.weight,
      weight_unit: v.weight_unit,
      inventory_management: v.inventory_management,
      inventory_policy: v.inventory_policy,
      image_id: mainImageId,
    });
  }
}

// Update base product's Color option to include all 4 colors
const colorOption = base.options.find((o) => o.name === "Color");
await shopify("PUT", `/products/${BASE_ID}/options/${colorOption.id}.json`, {
  option: { id: colorOption.id, values: colorValues },
});
console.log("Updated Color option values:", colorValues);

// Create the new variants (existing Black variants stay as-is)
for (const v of newVariants) {
  const created = await shopify("POST", `/products/${BASE_ID}/variants.json`, {
    variant: v,
  });
  console.log(`  created variant ${created.variant.title} (${created.variant.id})`);
}

// Archive the 3 now-redundant products (reversible, not deleted)
for (const otherId of OTHER_IDS) {
  await shopify("PUT", `/products/${otherId}.json`, {
    product: { id: otherId, status: "archived" },
  });
  console.log(`Archived product ${otherId}`);
}

console.log("Done. Base product now has all 4 colors merged.");
