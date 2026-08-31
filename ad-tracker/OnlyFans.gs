/**
 * UNCVRD Ad Tracker — OnlyFans.gs  (the backend half)
 * ---------------------------------------------------------------------------
 * Pulls per-link clicks / new fans / revenue from the OnlyFans API and writes
 * them into Daily Log, matched on link name == Variant name.
 *
 *   ▸ listLinks()  — run once: writes the "OF Links" tab (name + id per link).
 *   ▸ ofPull()     — run by the daily trigger (or by hand) to fill today's rows.
 *
 * Auth + shapes mirror the production dashboard: Bearer token against
 * https://app.onlyfansapi.com/api. If your key needs x-api-key instead, change
 * the header in ofFetch_().
 * ---------------------------------------------------------------------------
 */

const OF_BASE = 'https://app.onlyfansapi.com/api';

function ofFetch_(path) {
  const key = getProp('OFAPI_KEY', { required: true });
  const url = path.charAt(0) === '/' ? OF_BASE + path : OF_BASE + '/' + path;
  const res = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('OF API ' + code + ' on ' + path + ': ' + body.slice(0, 300));
  }
  return JSON.parse(body);
}

/** API list endpoints return either a bare array or { data: [...] }. */
function ofList_(json) {
  if (Array.isArray(json)) return json;
  return (json && json.data) || [];
}

/** All OF accounts connected to this key: [{id, onlyfans_username}, ...]. */
function ofAccounts_() {
  return ofList_(ofFetch_('/accounts')).map(function (a) {
    return { id: a.id, username: a.onlyfans_username };
  });
}

/** Every tracking link for one account, normalised. */
function ofTrackingLinks_(accountId) {
  return ofList_(ofFetch_('/' + accountId + '/tracking-links')).map(function (l) {
    const rev = l.revenue || {};
    return {
      code: String(l.campaignCode),
      name: l.name || '',
      url: l.campaignUrl || '',
      clicks: Number(l.clicksCount || 0),
      subs: Number(l.subscribersCount || 0),
      revenue: Number(rev.total || 0),
    };
  });
}

/**
 * listLinks() — writes/refreshes the "OF Links" tab so you can see every link's
 * exact name + id. Name each link the same as the Variant you log.
 */
function listLinks() {
  const book = ss();
  let s = book.getSheetByName(TAB.OFLINKS);
  if (!s) s = book.insertSheet(TAB.OFLINKS);
  s.clear();
  s.getRange(1, 1, 1, 5).setValues([['Account', 'Link Name', 'Campaign Code', 'Clicks', 'URL']])
    .setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');

  const out = [];
  const accounts = ofAccounts_();
  accounts.forEach(function (acct) {
    ofTrackingLinks_(acct.id).forEach(function (l) {
      out.push([acct.username, l.name, l.code, l.clicks, l.url]);
    });
  });
  if (out.length) s.getRange(2, 1, out.length, 5).setValues(out);
  s.setFrozenRows(1);
  s.autoResizeColumns(1, 5);
  toast('OF Links: ' + out.length + ' link(s) across ' + accounts.length + ' account(s).', 'listLinks');
  Logger.log('listLinks wrote ' + out.length + ' rows');
}

// ── snapshot store (hidden _Snapshots tab) ─────────────────────────────────

function readSnapshots_() {
  const s = ensureSnapshotTab_();
  const last = s.getLastRow();
  const map = {};
  if (last < 2) return map;
  const rows = s.getRange(2, 1, last - 1, SNAP_HEADERS.length).getValues();
  rows.forEach(function (r) {
    const key = nameKey(r[0]);
    if (!key) return;
    map[key] = {
      baseClicks: Number(r[1] || 0),
      baseSubs: Number(r[2] || 0),
      baseRevenue: Number(r[3] || 0),
      baseDate: dateKey(r[4]),
      lastClicks: Number(r[5] || 0),
      lastSubs: Number(r[6] || 0),
      lastRevenue: Number(r[7] || 0),
    };
  });
  return map;
}

function writeSnapshots_(map) {
  const s = ensureSnapshotTab_();
  const keys = Object.keys(map);
  if (s.getLastRow() > 1) s.getRange(2, 1, s.getLastRow() - 1, SNAP_HEADERS.length).clearContent();
  if (!keys.length) return;
  const rows = keys.map(function (k) {
    const v = map[k];
    return [k, v.baseClicks, v.baseSubs, v.baseRevenue, v.baseDate,
            v.lastClicks, v.lastSubs, v.lastRevenue];
  });
  s.getRange(2, 1, rows.length, SNAP_HEADERS.length).setValues(rows);
}

/**
 * ofPull() — the daily backend refresh.
 *
 * For every link: today's delta = current cumulative − the cumulative captured
 * at the start of today. We then write Clicks / New Fans / Revenue into the
 * matching Daily Log row (date == today AND OF Link == link name). If no such
 * row exists and AD_APPEND_MISSING isn't "false", a backend-only row is added
 * so no day's revenue is lost.
 */
function ofPull() {
  const today = todayStr();
  const snaps = readSnapshots_();
  const appendMissing = getProp('AD_APPEND_MISSING') !== 'false';

  // Build per-link deltas + advance the snapshot store.
  const deltas = {}; // linkKey -> {clicks, newFans, revenue, name}
  let accounts;
  try {
    accounts = ofAccounts_();
  } catch (e) {
    toast('OF pull failed: ' + e.message, 'ofPull');
    throw e;
  }

  accounts.forEach(function (acct) {
    let links;
    try {
      links = ofTrackingLinks_(acct.id);
    } catch (e) {
      Logger.log('Skipping @' + acct.username + ': ' + e.message);
      return;
    }
    links.forEach(function (l) {
      const key = nameKey(l.name);
      if (!key) return;
      let snap = snaps[key];
      if (!snap) {
        // First time we've seen this link — baseline at "now", so today counts
        // gains from this run forward (no retroactive spike).
        snap = {
          baseClicks: l.clicks, baseSubs: l.subs, baseRevenue: l.revenue, baseDate: today,
          lastClicks: l.clicks, lastSubs: l.subs, lastRevenue: l.revenue,
        };
      } else if (snap.baseDate !== today) {
        // First run of a new day — roll the base forward to yesterday's close.
        snap.baseClicks = snap.lastClicks;
        snap.baseSubs = snap.lastSubs;
        snap.baseRevenue = snap.lastRevenue;
        snap.baseDate = today;
      }
      // Update last-seen cumulative every run.
      snap.lastClicks = l.clicks;
      snap.lastSubs = l.subs;
      snap.lastRevenue = l.revenue;
      snaps[key] = snap;

      deltas[key] = {
        name: l.name,
        clicks: Math.max(0, l.clicks - snap.baseClicks),
        newFans: Math.max(0, l.subs - snap.baseSubs),
        revenue: Math.max(0, l.revenue - snap.baseRevenue),
      };
    });
  });

  writeSnapshots_(snaps);

  // Write deltas into Daily Log.
  const s = sheet(TAB.LOG);
  const last = s.getLastRow();
  const matchedKeys = {};
  let updated = 0;

  if (last >= 2) {
    const range = s.getRange(2, 1, last - 1, LOG_LAST_COL);
    const values = range.getValues();
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (dateKey(row[COL.DATE - 1]) !== today) continue;
      const key = nameKey(row[COL.LINK - 1]);
      const d = deltas[key];
      if (!d) continue;
      // Only write the backend numbers once per link/day (first matching row).
      if (matchedKeys[key]) continue;
      matchedKeys[key] = true;
      // New Fans + Revenue are the backend truth — always authoritative.
      // Clicks only fill when blank, so a pasted/Meta paid-click count wins.
      if (row[COL.CLICKS - 1] === '' || row[COL.CLICKS - 1] == null) {
        row[COL.CLICKS - 1] = d.clicks;
      }
      row[COL.NEW_FANS - 1] = d.newFans;
      row[COL.REVENUE - 1] = d.revenue;
      updated++;
    }
    range.setValues(values);
  }

  // Append backend-only rows for links with revenue/fans but no logged row.
  let appended = 0;
  if (appendMissing) {
    const newRows = [];
    Object.keys(deltas).forEach(function (key) {
      if (matchedKeys[key]) return;
      const d = deltas[key];
      if (d.clicks === 0 && d.newFans === 0 && d.revenue === 0) return;
      const r = new Array(LOG_LAST_COL).fill('');
      r[COL.DATE - 1] = today;
      r[COL.CAMPAIGN - 1] = 'auto (fill platform/creator)';
      r[COL.VARIANT - 1] = d.name;
      r[COL.LINK - 1] = d.name;
      r[COL.CLICKS - 1] = d.clicks;
      r[COL.NEW_FANS - 1] = d.newFans;
      r[COL.REVENUE - 1] = d.revenue;
      newRows.push(r.slice(0, COL.REVENUE)); // only A–K; L–R are array formulas
    });
    if (newRows.length) {
      s.getRange(s.getLastRow() + 1, 1, newRows.length, COL.REVENUE).setValues(newRows);
      appended = newRows.length;
    }
  }

  toast('OF pull: updated ' + updated + ', appended ' + appended + ' row(s) for ' + today, 'ofPull');
  return { updated: updated, appended: appended, links: Object.keys(deltas).length };
}
