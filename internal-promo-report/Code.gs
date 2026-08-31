/**
 * UNCVRD — Internal Promo Weekly Report
 * ============================================================================
 *
 * WHAT THIS DOES
 *   Builds a Monday-morning allocation report on top of the existing internal
 *   promo schedules. It answers: who got promo, how many slots, how much
 *   revenue those slots produced, and who should get more or less next week.
 *
 * DESIGN — read this before changing anything
 *   The script does exactly TWO things and nothing else:
 *     1. Flattens the three promo schedule tabs into `Raw Slots`
 *        (one row per slot). They have three different layouts, and the Feed
 *        tab's date column switches from real dates to TEXT part-way down, so
 *        this cannot be done readably in formulas.
 *     2. Calls the OnlyFans API for per-link weekly revenue into `Raw Revenue`.
 *
 *   Every number the manager reads is a FORMULA over those two tabs plus
 *   `Config`. The script never writes a reported figure. That means you can
 *   audit any cell by clicking it, and changing a threshold in Config updates
 *   the report instantly without re-running anything.
 *
 * WHY NOT SNAPSHOT DIFFERENCING
 *   The `/tracking-links` LIST endpoint reports lifetime totals. So does the
 *   `summary` block of the stats endpoint, even when you pass dates — this bit
 *   already caused a bug in telegram-webhook/index.ts, see the comment there.
 *   The ONLY window-respecting figures live in `daily_metrics` (one row per UTC
 *   day). We sum those, which gives true weekly revenue and lets us backfill
 *   history, so "Previous Week" works on the very first run.
 *
 * SETUP
 *   1. Extensions → Apps Script, paste this file, Save.
 *   2. Project Settings → Script Properties → add:
 *        ONLYFANSAPI_KEY = <your app.onlyfansapi.com key>
 *   3. Run `setup` once. Approve the permission prompt.
 *   4. Promo → Refresh now.
 *
 * @OnlyCurrentDoc
 */

// ── Sheet names ─────────────────────────────────────────────────────────────
var SH_REPORT   = 'Weekly Report';
var SH_SUMMARY  = 'Summary';
var SH_CONFIG   = 'Config';
var SH_SLOTS    = 'Raw Slots';
var SH_REVENUE  = 'Raw Revenue';
var SH_REGISTRY = 'Tracking Link';   // existing tab — never written to
var SH_LOG      = '_Log';            // hidden: run history + API errors

var API_BASE = 'https://app.onlyfansapi.com/api';

/**
 * The three promo schedule tabs, each with its own layout.
 * `promotedCols` are the columns holding the creator being promoted — one
 * entry per slot, which is why Feed and Story yield two slots per row.
 * All indices are 1-based to match getRange().
 */
var CHANNELS = [
  {
    key: 'Feed', sheet: 'Feed Promo Schedule - JA ', firstRow: 4,
    dateCol: 1, promoterCol: 3,
    slots: [{ promoted: 4, caption: 5, link: 6, status: 7 },
            { promoted: 9, caption: 10, link: 11, status: 12 }]
  },
  {
    key: 'Story', sheet: 'Story Promo Schedule - VEL', firstRow: 4,
    dateCol: 1, promoterCol: 2,
    // Story has no tracking link and uses a ✓ tick instead of a status word.
    slots: [{ promoted: 3, caption: 0, link: 0, status: 4 },
            { promoted: 5, caption: 0, link: 0, status: 6 }]
  },
  {
    key: 'MM', sheet: 'MM Promo Schedule - QAs', firstRow: 2,
    dateCol: 1, promoterCol: 2,
    slots: [{ promoted: 3, caption: 6, link: 5, status: 7 }]
  },
  {
    // Hidden superseded draft. Off by default via Config → IncludeDraftTab.
    key: 'Draft', sheet: 'Promo Schedule', firstRow: 4,
    dateCol: 1, promoterCol: 3,
    slots: [{ promoted: 4, caption: 5, link: 6, status: 7 },
            { promoted: 9, caption: 10, link: 11, status: 12 }]
  }
];

// ────────────────────────────────────────────────────────────────────────────
// Menu
// ────────────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Promo')
    .addItem('Refresh now', 'refreshAll')
    .addItem('Rebuild sheets + formulas', 'setup')
    .addSeparator()
    .addItem('Install auto-refresh triggers', 'installTriggers')
    .addItem('Remove auto-refresh triggers', 'removeTriggers')
    .addToUi();
}

// ────────────────────────────────────────────────────────────────────────────
// Config
// ────────────────────────────────────────────────────────────────────────────

/**
 * Every tunable lives here. Column B values get named ranges (CFG_*) so the
 * report formulas read like English instead of like cell references.
 * [key, label, value, note]
 */
function configDefaults_() {
  return [
    ['WeekStartDay',        'Week start day (1=Mon … 7=Sun)',            1,    'Defines the reporting week.'],
    ['WeekOverride',        'Report a specific week (blank = last full)', '',  'Put a Monday date here to freeze the report on that week.'],
    ['WeeksHistory',        'Weeks of revenue history to pull',           8,   'Higher = slower refresh. 8 is plenty for week-on-week.'],
    ['IncreaseFactor',      'Increase if rev/slot is this × roster avg',  1.25, 'Relative, so it self-adjusts in a slow week.'],
    ['ReduceFactor',        'Reduce if rev/slot is this × roster avg',    0.6,  ''],
    ['MinRevIncrease',      'Min revenue before "Increase" can trigger',  50,   'Absolute floor. Stops a 1-slot fluke reading as a star.'],
    ['LowRevenue',          'Revenue below this counts as "low"',         25,   ''],
    ['HighSlots',           'Slots at or above this counts as "many"',    6,    ''],
    ['MinSlots',            'Minimum slots per creator per week',         2,    'Never recommend reducing below this.'],
    ['MaxSlots',            'Maximum slots per creator per week',         10,   'Never recommend increasing above this.'],
    ['TopN',                'How many creators in the Top/Bottom lists',  5,    ''],
    ['Weight_Feed',         'Slot weight — Feed post',                    1,    'Raise if a feed post is worth more than a mass DM.'],
    ['Weight_Story',        'Slot weight — Story',                        1,    ''],
    ['Weight_MM',           'Slot weight — Mass DM',                      1,    ''],
    ['IncludeDraftTab',     'Include the hidden draft tab?',              false, 'The hidden "Promo Schedule" tab is a superseded draft.'],
    ['ExcludedStatuses',    'Statuses that do NOT count as a slot',       'Declined,Excluded', 'Comma separated, case-insensitive.'],
    ['CountUntickedStories','Count Story slots with no ✓ ?',              true,  'The tick is inconsistently filled in.']
  ];
}

/** Reads Config column A/B into a plain object. */
function cfg_() {
  var sh = ss_().getSheetByName(SH_CONFIG);
  if (!sh) throw new Error('Config sheet missing — run setup first.');
  var rows = sh.getRange(4, 1, Math.max(configDefaults_().length, 1), 3).getValues();
  var out = {};
  rows.forEach(function (r) { if (r[0]) out[String(r[0])] = r[2]; });
  return out;
}

/** Two-column lookup blocks (aliases, handles) read from their named ranges. */
function pairs_(rangeName) {
  var rng = ss_().getRangeByName(rangeName);
  if (!rng) return {};
  var out = {};
  rng.getValues().forEach(function (r) {
    var k = norm_(r[0]);
    if (k && r[1]) out[k] = String(r[1]).trim();
  });
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Name handling
// ────────────────────────────────────────────────────────────────────────────

/** Lowercase, collapse whitespace, strip punctuation. For map keys only. */
function norm_(v) {
  return String(v == null ? '' : v).toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Resolves a raw name cell to its canonical creator name.
 * Handles the observed drift: Blue/Blue Bear/Bluebear, Soph/Sophie, Ash/
 * Ashleigh, Ellla/Ella, "Antonella/Lilly", plus trailing spaces.
 * Unknown names pass through title-cased rather than being dropped — a new
 * creator should show up in the report, not vanish from it.
 */
function canonName_(raw, aliases) {
  var k = norm_(raw);
  if (!k) return '';
  if (aliases[k]) return aliases[k];
  // "Antonella/Lilly" and similar slash pairs → try each half.
  var parts = String(raw).split('/');
  for (var i = 0; i < parts.length; i++) {
    var pk = norm_(parts[i]);
    if (pk && aliases[pk]) return aliases[pk];
  }
  // Unknown name: title-case it. This is not cosmetic — Google Sheets UNIQUE()
  // (used to build the report's creator column) is case-sensitive while SUMIFS
  // is case-insensitive, so "capu" and "Capu" arriving from two tabs would make
  // two rows that each sum the other's total, double-counting. Normalising case
  // here at ingest collapses them to one.
  return String(raw).trim().replace(/\s+/g, ' ')
    .replace(/\b\w/g, function (m) { return m.toUpperCase(); });
}

/** Pulls the OF handle out of a tracking URL: .../emmasonne/c21 → emmasonne */
function handleFromUrl_(url) {
  var m = String(url || '').match(/onlyfans\.com\/([^\/\s?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Comparison key for an OF handle. Real handles contain dots and underscores
 * (`marissa.munoz`, `apple_kittii`, `mayyy.leee`), and those must survive as a
 * STABLE key on both sides of every lookup. Do not route handles through
 * norm_() — it turns separators into spaces and the two sides stop matching.
 */
function normHandle_(h) {
  return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ────────────────────────────────────────────────────────────────────────────
// Dates
// ────────────────────────────────────────────────────────────────────────────

/**
 * The spreadsheet's own timezone, read lazily (never at load time).
 *
 * Everything downstream is kept as 'yyyy-MM-dd' TEXT rather than Date objects,
 * on purpose. A Date written to a cell is re-interpreted in the SPREADSHEET
 * timezone, while the script's own date maths run in the SCRIPT timezone — and
 * those two settings default independently. When they differ, a week-start
 * Date lands on the cell carrying a fractional day, the report's exact-match
 * SUMIFS finds nothing, and every creator silently reads "No Data". Strings
 * compared to TEXT($C$2,"yyyy-mm-dd") in the report sidestep the whole class.
 */
function ssTz_() {
  if (!ssTz_._v) {
    var tz = ss_().getSpreadsheetTimeZone();
    // A sheet freshly converted from .xlsx can arrive with no timezone set, so
    // getSpreadsheetTimeZone() returns a non-string and Utilities.formatDate
    // then throws "Invalid argument: timeZone. Should be of type: String",
    // aborting the whole refresh. Fall back to the script's own zone, then UTC,
    // so a missing sheet timezone can never break the pull.
    ssTz_._v = (typeof tz === 'string' && tz) ? tz
             : (Session.getScriptTimeZone() || 'Etc/UTC');
  }
  return ssTz_._v;
}

/**
 * A schedule date cell → 'yyyy-MM-dd' string (or '' if it isn't a date).
 * Two shapes occur in the source:
 *   • a real Date (Feed rows 4–48, MM, hidden draft) — formatted in the SHEET
 *     timezone so the wall-clock day the sheet shows is the day we record.
 *   • TEXT like "07/01/2026 - 07/02/2026" (Feed row 50+, all of Story) — we
 *     take the FIRST date, since the slot ran from then.
 */
function cellYmd_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return Utilities.formatDate(v, ssTz_(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  if (!s) return '';
  var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);           // MM/DD/YYYY
  if (m) return m[3] + '-' + pad2_(m[1]) + '-' + pad2_(m[2]);
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);                              // ISO
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}

function pad2_(n) { n = String(n); return n.length < 2 ? '0' + n : n; }

/**
 * Week-start of a 'yyyy-MM-dd' string, as a 'yyyy-MM-dd' string.
 * All arithmetic is done in UTC (Date.UTC / getUTCDay) so it never touches a
 * local timezone and can't drift by a day. startDay: 1=Mon … 7=Sun.
 */
function weekStartYmd_(ymd, startDay) {
  var p = ymd.split('-');
  var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  var iso = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  var delta = (iso - startDay + 7) % 7;
  dt.setUTCDate(dt.getUTCDate() - delta);
  return Utilities.formatDate(dt, 'UTC', 'yyyy-MM-dd');
}

/** Today as 'yyyy-MM-dd' in the sheet timezone. */
function todayYmd_() { return Utilities.formatDate(new Date(), ssTz_(), 'yyyy-MM-dd'); }

/** Add whole days to a 'yyyy-MM-dd' string (UTC maths). */
function addDaysYmd_(ymd, days) {
  var p = ymd.split('-');
  var dt = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])));
  dt.setUTCDate(dt.getUTCDate() + days);
  return Utilities.formatDate(dt, 'UTC', 'yyyy-MM-dd');
}

// ────────────────────────────────────────────────────────────────────────────
// Slot ingestion
// ────────────────────────────────────────────────────────────────────────────

/**
 * Flattens every promo schedule tab into one row per slot.
 * Dedupe is deliberately conservative: only byte-identical slots collapse.
 * Two mass DMs on the same day for the same pair with different captions are
 * genuinely two slots, so pair-level dedupe would undercount.
 */
function buildSlots_() {
  var c = cfg_();
  var aliases = pairs_('CFG_Aliases');
  var startDay = Number(c.WeekStartDay) || 1;
  var excluded = String(c.ExcludedStatuses || '').split(',')
    .map(function (s) { return norm_(s); }).filter(String);
  var weights = { Feed: num_(c.Weight_Feed, 1), Story: num_(c.Weight_Story, 1),
                  MM: num_(c.Weight_MM, 1), Draft: num_(c.Weight_Feed, 1) };

  var rows = [], seen = {};

  CHANNELS.forEach(function (ch) {
    if (ch.key === 'Draft' && c.IncludeDraftTab !== true) return;
    var sh = ss_().getSheetByName(ch.sheet);
    if (!sh) return;                                  // tab renamed or removed
    var last = sh.getLastRow();
    if (last < ch.firstRow) return;
    var vals = sh.getRange(ch.firstRow, 1, last - ch.firstRow + 1,
                           Math.max(sh.getLastColumn(), 13)).getValues();

    vals.forEach(function (r, i) {
      var dYmd = cellYmd_(r[ch.dateCol - 1]);
      if (!dYmd) return;                              // section headers, blanks
      var promoter = canonName_(r[ch.promoterCol - 1], aliases);
      // 'yyyy-MM-dd' strings throughout — the report matches these against
      // TEXT($C$2,"yyyy-mm-dd"), which is timezone-proof. See ssTz_().
      var wk = weekStartYmd_(dYmd, startDay);

      ch.slots.forEach(function (slot, si) {
        var promoted = canonName_(r[slot.promoted - 1], aliases);
        if (!promoted) return;                        // empty slot
        var statusRaw = slot.status ? String(r[slot.status - 1] || '').trim() : '';
        var link = slot.link ? String(r[slot.link - 1] || '').trim() : '';

        // Status filter. Story uses a ✓ rather than a word.
        if (ch.key === 'Story') {
          var ticked = statusRaw.indexOf('✓') >= 0;
          if (!ticked && c.CountUntickedStories !== true) return;
        } else if (excluded.indexOf(norm_(statusRaw)) >= 0) {
          return;
        }

        // The caption MUST be part of the key. Marissa sent two different mass
        // DMs for Julie on 2026-07-15 — same date, same pair, same link, two
        // captions (MM rows 63 and 65). Those are two slots. Without the
        // caption they collapse into one and the creator is undercounted.
        var caption = slot.caption ? String(r[slot.caption - 1] || '').trim() : '';
        var key = [ch.key, wk, dYmd, promoter, promoted, link, caption, si].join('|');
        if (seen[key]) return;
        seen[key] = 1;

        rows.push([ch.key, wk, dYmd, promoter, promoted, statusRaw,
                   weights[ch.key] || 1, link, ch.sheet + '!' + (ch.firstRow + i)]);
      });
    });
  });

  writeTable_(SH_SLOTS,
    ['Channel', 'Week Start', 'Date', 'Promoter', 'Promoted Creator',
     'Status', 'Slot Weight', 'Tracking Link', 'Source Row'],
    rows);
  return rows.length;
}

function num_(v, dflt) { var n = Number(v); return isFinite(n) ? n : dflt; }

// ────────────────────────────────────────────────────────────────────────────
// Tracking link registry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Reads the existing `Tracking Link` tab (read-only) and returns
 * [{url, handle, owner}] — `owner` being the creator whose page the link
 * points at, i.e. the one RECEIVING the promo.
 *
 * Note: that tab's headers say "Promoting Creator | Promoted Creator" but the
 * columns are the other way round — column A is the page owner. Verified
 * against the Feed tab (Blue Bear → Emma resolves to emmasonne/c21, which the
 * registry lists under EMMA). We derive ownership from the URL handle instead
 * of trusting either header, so the mislabelling is harmless.
 */
function readRegistry_() {
  var sh = ss_().getSheetByName(SH_REGISTRY);
  if (!sh) return [];
  var vals = sh.getDataRange().getValues();
  var out = [], seen = {};
  vals.forEach(function (r) {
    for (var ci = 0; ci < r.length; ci++) {
      var v = String(r[ci] || '').trim();
      if (v.indexOf('http') !== 0) continue;
      var h = handleFromUrl_(v);
      if (!h || seen[v]) continue;
      seen[v] = 1;
      out.push({ url: v, handle: h, key: normHandle_(h) });
    }
  });
  return out;
}

/**
 * handle → canonical creator. Built from the Config handle map, which setup
 * seeds from the registry. Explicit, because guessing from the handle string
 * is actively wrong here: SANDRA's page is `thisisjunee`, which any
 * name-matching heuristic would attribute to June.
 */
function handleMap_() {
  var rng = ss_().getRangeByName('CFG_Handles');
  if (!rng) return {};
  var out = {};
  rng.getValues().forEach(function (r) {
    var k = normHandle_(r[0]);
    if (k && r[1]) out[k] = String(r[1]).trim();
  });
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// OnlyFans API
// ────────────────────────────────────────────────────────────────────────────

function apiKey_() {
  var k = PropertiesService.getScriptProperties().getProperty('ONLYFANSAPI_KEY');
  if (!k) throw new Error(
    'ONLYFANSAPI_KEY not set. Apps Script → Project Settings → Script Properties.');
  return k;
}

/** GET with the same envelope handling as src/lib/of-api.ts (ofPaginate). */
function apiGet_(path) {
  var res = UrlFetchApp.fetch(
    path.indexOf('http') === 0 ? path : API_BASE + path,
    { headers: { Authorization: 'Bearer ' + apiKey_(), Accept: 'application/json' },
      muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ' on ' + path);
  return JSON.parse(res.getContentText() || '{}');
}

/** Unwraps { data: { list } } | { data: [] } | [] — all three shapes occur. */
function listOf_(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  if (json && json.data && Array.isArray(json.data.list)) return json.data.list;
  if (json && Array.isArray(json.list)) return json.list;
  return [];
}

/**
 * Every tracking link for one account, following pagination.
 * The endpoint pages (10/page by default, `hasMore` + offset), so a single
 * `?limit=100` call silently drops everything past the first page on a busy
 * account. Mirrors ad-tracker/data-analyst/app.py and src/lib/of-api.ts.
 */
function listAllTrackingLinks_(acct) {
  var out = [], offset = 0, pages = 0;
  // Envelope verified against the live API (2026-08-03):
  //   { data: { list: [...], hasMore }, _pagination: { next_page }, _meta }
  // Page purely by offset while data.hasMore is true. An earlier version ALSO
  // tried to follow _pagination.next_page and corrupted the cursor — it fetched
  // the next page into a throwaway var without keeping it and reset offset to 0,
  // so on any account past two pages it looped on page 2 and dropped every link
  // beyond offset 200 (Nicole/rosewhitex has 253). Do not reintroduce that:
  // offset + hasMore is sufficient and was proven against that 253-link account.
  while (pages < 60) {                                 // 60 pages = up to 6000 links
    var j = apiGet_('/' + acct + '/tracking-links?limit=100&offset=' + offset);
    var list = listOf_(j);                             // = data.list
    out.push.apply(out, list);
    pages++;
    var more = j && j.data && (j.data.hasMore || j.data.has_more);
    if (!list.length || !more) break;
    offset += list.length;
  }
  return out;
}

/**
 * The set of internal-promo links to price, as {url, handleKey, handle}.
 *
 * CRITICAL: this must be the links the schedules ACTUALLY use, not the
 * `Tracking Link` registry tab. The registry covers only ~10 of the 14 pages
 * and ~half the live links — marissa.munoz, mayyy.leee, rosewhitex (Nicole)
 * and bella_leaa aren't in it at all, so a registry-only universe silently
 * reports $0 for Marissa, Maylee and Nicole and tells the manager to CUT the
 * very creators getting the most promo. buildSlots_ has already written every
 * scheduled link into Raw Slots column H; we read them back and union with the
 * registry (which usefully adds links issued but not yet scheduled).
 */
function promoLinkUniverse_() {
  var links = {};   // url → {url, key, handle}
  function add(url) {
    var u = String(url || '').trim().replace(/\/+$/, '');
    if (u.indexOf('http') !== 0) return;
    var h = handleFromUrl_(u);
    if (!h) return;
    if (!links[u]) links[u] = { url: u, key: normHandle_(h), handle: h };
  }
  var sh = ss_().getSheetByName(SH_SLOTS);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 8, sh.getLastRow() - 1, 1).getValues()   // column H = link
      .forEach(function (r) { add(r[0]); });
  }
  readRegistry_().forEach(function (l) { add(l.url); });
  return Object.keys(links).map(function (u) { return links[u]; });
}

/**
 * Weekly revenue per promoted creator, from the OnlyFans API.
 *
 * Cost: one /accounts call, one paginated tracking-link list per account we
 * touch (~13), and one stats call per distinct promo link. Each stats call
 * covers the whole history window in one request.
 */
function buildRevenue_() {
  var c = cfg_();
  var startDay = Number(c.WeekStartDay) || 1;
  var weeks = Math.max(2, num_(c.WeeksHistory, 8));
  var hmap = handleMap_();
  var aliases = pairs_('CFG_Aliases');
  var log = [];

  var universe = promoLinkUniverse_();

  // Window: `weeks` complete weeks up to and including the last complete one.
  var thisWeek = weekStartYmd_(todayYmd_(), startDay);
  var windowEnd = addDaysYmd_(thisWeek, -1);            // last day of last week
  var windowStart = addDaysYmd_(thisWeek, -weeks * 7);

  // handle key → accountId
  var byHandle = {};
  listOf_(apiGet_('/accounts')).forEach(function (a) {
    if (a && a.onlyfans_username) byHandle[normHandle_(a.onlyfans_username)] = a.id;
  });

  // Which handles are actually promoted? (From the link universe.)
  var handlesNeeded = {}, rawHandle = {};
  universe.forEach(function (l) { handlesNeeded[l.key] = 1; rawHandle[l.key] = l.handle; });

  // Per connected account: url → {id, acct}. Handles with no account are logged
  // once and their creators will show blank (not $0) in the report.
  var linkIndex = {}, connected = {};
  Object.keys(handlesNeeded).forEach(function (h) {
    var acct = byHandle[h];
    if (!acct) {
      log.push(['no-account', rawHandle[h] || h,
                'promoted page not connected to the API — its creator shows “not tracked”, not $0']);
      return;
    }
    connected[h] = 1;
    try {
      listAllTrackingLinks_(acct).forEach(function (l) {
        var u = String(l.campaignUrl || '').trim().replace(/\/+$/, '');
        if (u) linkIndex[u] = { id: l.id || l.campaignCode, acct: acct };
      });
    } catch (e) { log.push(['links-failed', rawHandle[h] || h, String(e)]); }
  });

  // Sum daily_metrics into (handleKey, week) buckets.
  var agg = {};
  universe.forEach(function (l) {
    if (!connected[l.key]) return;                     // already logged no-account
    var hit = linkIndex[l.url];
    if (!hit) { log.push(['unmatched-link', l.url, 'link not returned by the API for this account']); return; }
    var stats = '/' + hit.acct + '/tracking-links/' + hit.id + '/stats'
              + '?date_start=' + windowStart + '&date_end=' + windowEnd;
    var daily, sawDate = false;
    try {
      var j = apiGet_(stats);
      // IMPORTANT: `summary.*_total` is LIFETIME even with dates passed. Only
      // daily_metrics respects the window. Same trap as telegram-webhook.
      daily = (j && j.data && j.data.daily_metrics) || (j && j.daily_metrics) || [];
    } catch (e) { log.push(['stats-failed', l.url, String(e)]); return; }

    daily.forEach(function (d) {
      // The API's daily date field is `timestamp` (verified in
      // ad-tracker/data-analyst/app.py). Keep fallbacks in case of a rename.
      var dy = cellYmd_(d.timestamp || d.date || d.day || d.created_at);
      if (!dy) return;
      sawDate = true;
      var wk = weekStartYmd_(dy, startDay);
      var k = l.key + '|' + wk;
      if (!agg[k]) agg[k] = { rev: 0, subs: 0, clicks: 0 };
      agg[k].rev    += Number(d.revenue || 0);
      agg[k].subs   += Number(d.subs    || 0);
      agg[k].clicks += Number(d.clicks  || 0);
    });
    // Loud failure if a link returned rows but none had a parseable date —
    // that means the field was renamed and revenue would silently vanish.
    if (daily.length && !sawDate) {
      log.push(['stats-no-date', l.url, 'daily rows present but no date field parsed: '
                + JSON.stringify(Object.keys(daily[0] || {}))]);
    }
  });

  // Emit a row for every (connected handle, week in window) — including zero
  // weeks — so the report can tell "tracked and earned $0" from "not tracked".
  var weekList = [];
  for (var w = windowStart; w <= windowEnd; w = addDaysYmd_(w, 7)) {
    weekList.push(weekStartYmd_(w, startDay));
  }
  var uniqWeeks = {}; weekList.forEach(function (w) { uniqWeeks[w] = 1; });

  var rows = [];
  Object.keys(connected).forEach(function (hk) {
    var creator = hmap[hk] ? canonName_(hmap[hk], aliases) : '';
    if (!creator) {
      log.push(['unmapped-handle', rawHandle[hk] || hk, 'add it to Config → OF Handle Map']);
      creator = '⚠ ' + (rawHandle[hk] || hk);
    }
    Object.keys(uniqWeeks).forEach(function (wk) {
      var a = agg[hk + '|' + wk] || { rev: 0, subs: 0, clicks: 0 };
      rows.push([rawHandle[hk] || hk, wk, creator, a.rev, a.subs, a.clicks]);
    });
  });
  rows.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0; });

  writeTable_(SH_REVENUE,
    ['OF Handle', 'Week Start', 'Creator', 'Revenue', 'New Subs', 'Clicks'], rows);
  writeLog_(log);
  return rows.length;
}

// ────────────────────────────────────────────────────────────────────────────
// Writing
// ────────────────────────────────────────────────────────────────────────────

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, hidden) {
  var s = ss_().getSheetByName(name);
  if (!s) { s = ss_().insertSheet(name); if (hidden) s.hideSheet(); }
  return s;
}

/** Replaces a data tab wholesale. Header row frozen and bolded. */
function writeTable_(name, headers, rows) {
  var sh = sheet_(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#f1f3f4');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  return sh;
}

function writeLog_(entries) {
  var sh = sheet_(SH_LOG, true);
  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['When', 'Type', 'Subject', 'Detail']])
    .setFontWeight('bold');
  var stamp = new Date();
  var rows = entries.map(function (e) { return [stamp, e[0], e[1], e[2]]; });
  rows.unshift([stamp, 'run', 'refresh complete', entries.length + ' issue(s)']);
  sh.getRange(2, 1, rows.length, 4).setValues(rows);
}

// ────────────────────────────────────────────────────────────────────────────
// Entry points
// ────────────────────────────────────────────────────────────────────────────

function refreshAll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;          // a trigger is already running
  try {
    buildSlots_();
    buildRevenue_();
    ss_().getSheetByName(SH_REPORT)
      .getRange('G2').setValue(new Date());  // last-refreshed stamp
  } finally { lock.releaseLock(); }
}

/** Slots only — cheap, no API calls. Used by the on-edit trigger. */
function refreshSlotsOnly() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try { buildSlots_(); } finally { lock.releaseLock(); }
}

function installTriggers() {
  removeTriggers();
  // Monday 06:00 — full refresh, ready before the manager opens it.
  ScriptApp.newTrigger('refreshAll').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  // Nightly, so mid-week edits are reflected without waiting for Monday.
  ScriptApp.newTrigger('refreshAll').timeBased().everyDays(1).atHour(5).create();
  // Any edit to a schedule tab re-counts slots immediately (no API cost).
  ScriptApp.newTrigger('refreshSlotsOnly').forSpreadsheet(ss_()).onChange().create();
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
