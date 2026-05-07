// Agency Console — Chatter Logger popup.
//
// State machine:
//   1. No supabase config in chrome.storage.local → show "needs setup"
//   2. Have config but no session → show login form
//   3. Logged in but no active shift → show "open staff portal" prompt
//   4. Logged in + active shift → show workspace with quick-log buttons
//
// All Supabase calls go through fetch() against the REST API, so we don't
// need to bundle the JS SDK (smaller extension, fewer permissions).

// ─────────────────────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────────────────────

const KEYS = {
  config: "agency_supabase_config",  // { url, anonKey, portalUrl }
  session: "agency_session",          // { username, chatterId, signedInAt }
};

async function getStored(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (res) => resolve(res[key] ?? null));
  });
}
async function setStored(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}
async function clearStored(key) {
  return new Promise((resolve) => {
    chrome.storage.local.remove([key], () => resolve());
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Supabase REST helpers
// ─────────────────────────────────────────────────────────────────────────

async function sbFetch(path, init = {}) {
  const config = await getStored(KEYS.config);
  if (!config?.url || !config?.anonKey) throw new Error("Supabase config missing");
  const url = `${config.url.replace(/\/$/, "")}/rest/v1${path}`;
  const headers = {
    "apikey": config.anonKey,
    "Authorization": `Bearer ${config.anonKey}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 160) || res.statusText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────

async function login(username, password) {
  // Match against access_codes (same logic as the dashboard's /login route)
  const rows = await sbFetch(
    `/access_codes?select=id,username,password,active,account_type,chatter_id` +
    `&username=eq.${encodeURIComponent(username)}` +
    `&password=eq.${encodeURIComponent(password)}` +
    `&active=eq.true` +
    `&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Invalid username or password");
  }
  const row = rows[0];
  if (row.account_type !== "staff" || !row.chatter_id) {
    throw new Error("This account isn't a staff (chatter) login. Use the staff portal account here.");
  }
  await setStored(KEYS.session, {
    username: row.username,
    chatterId: row.chatter_id,
    signedInAt: new Date().toISOString(),
  });
}

async function signOut() {
  await clearStored(KEYS.session);
}

// ─────────────────────────────────────────────────────────────────────────
// Shift operations
// ─────────────────────────────────────────────────────────────────────────

async function findActiveShift(chatterId) {
  const rows = await sbFetch(
    `/shifts?select=*,creators(name)` +
    `&chatter_id=eq.${chatterId}` +
    `&end_at=is.null` +
    `&order=start_at.desc` +
    `&limit=1`
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

async function refreshShift(shiftId) {
  const rows = await sbFetch(
    `/shifts?select=*,creators(name)&id=eq.${shiftId}&limit=1`
  );
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/** Atomically log a sale by recomputing total_revenue from the latest row. */
async function logToShift(shift, patch) {
  // Fetch the latest first to avoid losing concurrent updates from the
  // dashboard or another tab.
  const latest = await refreshShift(shift.id);
  if (!latest) throw new Error("Shift not found — did it just end?");

  const next = {
    ppv_count:      (latest.ppv_count ?? 0)      + (patch.ppv_count ?? 0),
    ppv_revenue:    (latest.ppv_revenue ?? 0)    + (patch.ppv_revenue ?? 0),
    tips_revenue:   (latest.tips_revenue ?? 0)   + (patch.tips_revenue ?? 0),
    custom_revenue: (latest.custom_revenue ?? 0) + (patch.custom_revenue ?? 0),
    message_count:  (latest.message_count ?? 0)  + (patch.message_count ?? 0),
  };
  next.total_revenue = next.ppv_revenue + next.tips_revenue + next.custom_revenue;

  const updated = await sbFetch(
    `/shifts?id=eq.${shift.id}&select=*,creators(name)`,
    {
      method: "PATCH",
      headers: { "Prefer": "return=representation" },
      body: JSON.stringify(next),
    }
  );
  return Array.isArray(updated) && updated[0] ? updated[0] : null;
}

// ─────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

function showScreen(name) {
  for (const id of ["needs-setup", "login", "no-shift", "workspace"]) {
    $(id).classList.toggle("hidden", id !== name);
  }
}

function setStatusLine(msg, kind) {
  const el = $("status-line");
  el.textContent = msg ?? "";
  el.classList.remove("error", "muted");
  if (kind === "error") el.classList.add("error");
  if (kind === "muted") el.classList.add("muted");
}

function fmt$(n) {
  return `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtSince(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `started ${min}m ago`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `started ${h}h ${m}m ago`;
}

function renderShift(shift) {
  $("shift-creator").textContent = shift.creators?.name ?? "(creator)";
  const parts = [fmtSince(shift.start_at)];
  if (shift.target_account_name) parts.push(`on ${shift.target_account_name}`);
  $("shift-meta").textContent = parts.join(" · ");
  $("total-revenue").textContent = fmt$(shift.total_revenue ?? 0);
  $("total-ppv-count").textContent = String(shift.ppv_count ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────

let activeShift = null;

async function boot() {
  const config = await getStored(KEYS.config);
  if (!config?.url || !config?.anonKey) {
    showScreen("needs-setup");
    return;
  }

  const session = await getStored(KEYS.session);
  if (!session?.chatterId) {
    showScreen("login");
    $("brand-sub").textContent = "Sign in to log shifts";
    return;
  }

  $("brand-sub").textContent = `Hi, ${session.username}`;
  await refreshShiftView(session.chatterId);
}

async function refreshShiftView(chatterId) {
  try {
    const shift = await findActiveShift(chatterId);
    activeShift = shift;
    if (!shift) {
      showScreen("no-shift");
      return;
    }
    renderShift(shift);
    showScreen("workspace");
  } catch (err) {
    console.error("[agency-extension] refreshShiftView:", err);
    showScreen("no-shift");
    setStatusLine(err.message, "error");
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Wire up event handlers
// ─────────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  // Settings
  $("settings-btn").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("open-settings").addEventListener("click", () => chrome.runtime.openOptionsPage());

  // Login
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const u = $("username").value.trim();
    const p = $("password").value;
    if (!u || !p) return;
    const btn = $("login-btn");
    const errEl = $("login-error");
    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      await login(u, p);
      $("password").value = "";
      btn.textContent = "Sign in";
      btn.disabled = false;
      await boot();
    } catch (err) {
      errEl.textContent = err.message ?? String(err);
      errEl.classList.remove("hidden");
      btn.textContent = "Sign in";
      btn.disabled = false;
    }
  });

  // Open portal in new tab (for clock-in)
  const openPortal = async () => {
    const config = await getStored(KEYS.config);
    const portal = config?.portalUrl?.trim();
    if (portal) {
      chrome.tabs.create({ url: `${portal.replace(/\/$/, "")}/clock` });
    } else {
      chrome.runtime.openOptionsPage();
    }
  };
  $("open-portal").addEventListener("click", openPortal);

  // Sign out
  const signOutAll = async () => { await signOut(); await boot(); };
  $("signout").addEventListener("click", signOutAll);
  $("signout-noshift").addEventListener("click", signOutAll);

  // Logging buttons
  const logSale = async (kind) => {
    if (!activeShift) return;
    const session = await getStored(KEYS.session);
    if (!session) return;

    let patch;
    let label;
    if (kind === "ppv") {
      const amt = Number($("ppv-amount").value) || 0;
      if (amt <= 0) { setStatusLine("Enter a PPV amount", "error"); return; }
      patch = { ppv_count: 1, ppv_revenue: amt };
      label = `+1 PPV · ${fmt$(amt)}`;
    } else if (kind === "tip") {
      const amt = Number($("tip-amount").value) || 0;
      if (amt <= 0) { setStatusLine("Enter a tip amount", "error"); return; }
      patch = { tips_revenue: amt };
      label = `Tip ${fmt$(amt)}`;
    } else if (kind === "custom") {
      const amt = Number($("custom-amount").value) || 0;
      if (amt <= 0) { setStatusLine("Enter a custom amount", "error"); return; }
      patch = { custom_revenue: amt };
      label = `Custom ${fmt$(amt)}`;
    } else if (kind === "messages") {
      const n = Number($("msg-count").value) || 0;
      if (n <= 0) { setStatusLine("Enter a message count", "error"); return; }
      patch = { message_count: n };
      label = `+${n} messages`;
    }
    if (!patch) return;

    setStatusLine("Logging…", "muted");
    try {
      const updated = await logToShift(activeShift, patch);
      if (updated) {
        activeShift = updated;
        renderShift(updated);
      }
      // Clear the input we just used
      const inputId = kind === "messages" ? "msg-count" : `${kind}-amount`;
      $(inputId).value = "";
      setStatusLine(`Logged ${label}`, undefined);
      setTimeout(() => setStatusLine("", "muted"), 2500);
    } catch (err) {
      setStatusLine(err.message ?? String(err), "error");
    }
  };

  $("log-ppv").addEventListener("click", () => logSale("ppv"));
  $("log-tip").addEventListener("click", () => logSale("tip"));
  $("log-custom").addEventListener("click", () => logSale("custom"));
  $("log-messages").addEventListener("click", () => logSale("messages"));

  // Submit-on-enter for each amount input
  for (const [inputId, kind] of [["ppv-amount","ppv"], ["tip-amount","tip"], ["custom-amount","custom"], ["msg-count","messages"]]) {
    $(inputId).addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); logSale(kind); }
    });
  }

  void boot();
});
