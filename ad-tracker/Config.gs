/**
 * UNCVRD Ad Tracker — Config.gs
 * ---------------------------------------------------------------------------
 * Shared constants + Script-Property helpers for the whole project.
 *
 * KEYS LIVE IN SCRIPT PROPERTIES, NEVER IN CODE.
 * (Extensions ▸ Apps Script ▸ Project Settings ▸ Script properties)
 *
 *   OFAPI_KEY               — OnlyFans API key  (required for the backend pull)
 *   META_TOKEN              — Meta/Facebook long-lived access token (optional)
 *   META_AD_ACCT            — Meta ad account id WITHOUT the "act_" prefix (optional)
 *   ONLYFINDER_ENDPOINT     — OnlyFinder insights URL, if you have API access (optional)
 *   ONLYFINDER_KEY          — OnlyFinder API key (optional)
 *   SUPABASE_URL            — e.g. https://xxxx.supabase.co   (optional mirror)
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key for writes   (optional mirror)
 * ---------------------------------------------------------------------------
 */

// ── Tab names ──────────────────────────────────────────────────────────────
const TAB = {
  SETTINGS: 'Settings',
  LOG: 'Daily Log',
  SPLIT: 'Split Tests',
  CREATORS: 'Creator Dashboard',
  PLATFORM: 'Platform Summary',
  OFLINKS: 'OF Links',
  SNAP: '_Snapshots', // hidden: yesterday's cumulative totals, for daily deltas
};

// ── Daily Log column layout (1-based) ──────────────────────────────────────
// A–G you type; H–I come from the ad side (Meta/OnlyFinder); J–K from the OF
// API; L–R are formulas. The auto-pull only ever writes H/I (ad) and I/J/K (OF).
const COL = {
  DATE: 1,
  PLATFORM: 2,
  CREATOR: 3,
  CAMPAIGN: 4,
  TEST: 5,
  VARIANT: 6,
  LINK: 7, // OF tracking-link name — MUST equal the Variant name
  SPEND: 8,
  CLICKS: 9,
  NEW_FANS: 10,
  REVENUE: 11,
  CPC: 12,
  CAC: 13,
  CLICK_SUB: 14,
  LTV: 15,
  ROAS: 16,
  PROFIT: 17,
  VERDICT: 18,
};
const LOG_LAST_COL = COL.VERDICT;
const LOG_HEADERS = [
  'Date', 'Platform', 'Creator', 'Campaign', 'Test', 'Variant', 'OF Link',
  'Spend', 'Clicks', 'New Fans', 'Revenue',
  'CPC', 'CAC', 'Click→Sub %', 'LTV', 'ROAS', 'Profit', 'Verdict',
];

// First data row in every tab (row 1 is headers).
const FIRST_DATA_ROW = 2;

const PLATFORMS = ['Meta', 'OnlyFinder'];

// Hidden _Snapshots schema (cumulative OF totals, for daily deltas).
const SNAP_HEADERS = [
  'linkKey', 'baseClicks', 'baseSubs', 'baseRevenue', 'baseDate',
  'lastClicks', 'lastSubs', 'lastRevenue',
];

// ── Script-Property helpers ────────────────────────────────────────────────
function _props() {
  return PropertiesService.getScriptProperties();
}

/** Read a Script Property, throwing a friendly error when required and missing. */
function getProp(key, opts) {
  const required = opts && opts.required;
  const val = _props().getProperty(key);
  if (!val && required) {
    throw new Error(
      'Missing Script Property "' + key + '". Add it under ' +
      'Project Settings ▸ Script properties, then run again.'
    );
  }
  return val || '';
}

function hasProp(key) {
  return !!_props().getProperty(key);
}

// ── Sheet helpers ──────────────────────────────────────────────────────────
function ss() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Get a sheet by name or throw (so callers fail loudly before writing). */
function sheet(name) {
  const s = ss().getSheetByName(name);
  if (!s) throw new Error('Tab "' + name + '" not found. Run buildTracker() first.');
  return s;
}

/** Today as YYYY-MM-DD in the spreadsheet's own timezone (matches cell dates). */
function todayStr() {
  return Utilities.formatDate(new Date(), ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/** Normalise any date-ish cell value to YYYY-MM-DD for matching. */
function dateKey(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, ss().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  return String(v || '').trim().slice(0, 10);
}

/** Case/space-insensitive key for matching link / variant / ad names. */
function nameKey(v) {
  return String(v || '').trim().toLowerCase();
}

/** Small toast so manually-run functions give visible feedback. */
function toast(msg, title) {
  try {
    ss().toast(msg, title || 'Ad Tracker', 6);
  } catch (e) {
    // running headless (trigger) — toast unavailable, ignore
  }
  Logger.log((title ? title + ': ' : '') + msg);
}
