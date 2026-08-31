/**
 * UNCVRD — Salary Creator CRM : the money layer
 * ============================================================================
 * Every money figure the OnlyFans API can supply, pulled here instead of typed
 * or imported from a file nobody updates.
 *
 *   _LinkStats  — every tracking link on every connected account, with its
 *                 CUMULATIVE clicks / subs / revenue, refreshed nightly.
 *   _LinkBase   — the same numbers as they stood at the start of this week.
 *
 * Link revenue from the API is a running total, not a daily figure, so a
 * week's earnings is (now − base). That is the whole reason a baseline exists;
 * without it you can only ever report lifetime numbers and every week looks
 * like a record.
 *
 * Each link is classified once, at pull time, against the Tracking Links tab:
 *   promoter is a creator on the roster → Internal SFS
 *   promoter is a network (TrafficHaus, Meta, …) → Paid ad
 *   no matching row → Unmapped, and it is counted separately rather than
 *   silently folded into either.
 */

var LINK_NOW  = '_LinkStats';
var LINK_BASE = '_LinkBase';
var LINK_COLS = ['Handle', 'Creator', 'Code', 'URL', 'Source type', 'Promoter',
                 'Clicks', 'Subs', 'Revenue', 'Pulled'];

/**
 * Create the two link tabs, empty but with headers, if they do not exist.
 *
 * MUST run before anything writes a formula that points at them. A formula
 * referencing a sheet that does not exist yet is rewritten to #REF! at write
 * time and stays broken after the sheet appears — which is exactly how the SFS
 * report ended up as a wall of #N/A.
 */
function ensureLinkTabs_() {
  [LINK_NOW, LINK_BASE].forEach(function (name) {
    var sh = ss_().getSheetByName(name);
    if (!sh) {
      sh = ss_().insertSheet(name);
      ensureSize_(sh, 50, LINK_COLS.length + 1);
    }
    if (sh.getLastRow() < 1 || !sh.getRange(1, 1).getValue()) {
      sh.getRange(1, 1, 1, LINK_COLS.length).setValues([LINK_COLS]).setFontWeight('bold');
    }
    sh.hideSheet();
  });
}

// ── Fetch ───────────────────────────────────────────────────────────────────

/**
 * Every tracking link for one account, paged.
 *
 * The endpoint returns { data: { list, hasMore } } and pages by offset. Do not
 * try to follow _pagination.next_page as well — that bug is documented in the
 * internal promo report and it silently dropped every link past offset 200 on
 * the one account that has 253 of them.
 */
function ofAllLinks_(acctId) {
  var out = [], offset = 0, pages = 0;
  while (pages < 60) {
    var j = ofGet_('/' + acctId + '/tracking-links?limit=100&offset=' + offset);
    var d = j && j.data;
    var list = (d && d.list) || (Array.isArray(d) ? d : []);
    out = out.concat(list);
    pages++;
    if (!list.length || !(d && (d.hasMore || d.has_more))) break;
    offset += list.length;
  }
  return out;
}

// ── The nightly pull ────────────────────────────────────────────────────────

function pullLinkStats() {
  var accounts = ofAccounts_();
  if (!accounts.length) throw new Error('The API key can see no accounts.');

  // handle → creator, and url → {promoter, sourceType}, both from the CRM.
  var byHandle = {};
  creatorRows_().forEach(function (c) {
    var h = String(c.handle || '').toLowerCase().replace(/^@/, '');
    if (h) byHandle[h] = c.name;
  });
  var roster = {};
  rosterNames_().forEach(function (n) { roster[n.toLowerCase()] = true; });

  var byUrl = {};
  tabRows_(TABS.links).forEach(function (r) {
    var u = String(r['Tracking link'] || '').trim().toLowerCase().replace(/\/$/, '');
    if (!u || u === 'n/a') return;
    byUrl[u] = String(r['Promoter / source'] || r['Promoter'] || '').trim();
  });

  // The API already knows who drove the traffic — campaignName is the promoter
  // ("MACY", "CHARLOTTE") or the paid source ("TrafficHaus", "IG - BJJ Reels").
  // Reading it only from the Tracking Links tab was circular: that tab's
  // promoter column is filled from this pull, and this pull was filled from
  // that tab, so both stayed empty and all 607 links came back "Unmapped".
  // A typed value on the sheet still wins — it is the human correction.
  var norm = function (x) { return String(x || '').toLowerCase().replace(/[^a-z]/g, ''); };
  var rosterNorm = {};
  rosterNames_().forEach(function (n) { rosterNorm[norm(n)] = n; });

  var PAID = new RegExp([
    'traffichaus', 'onlyfinder', 'onlyguider', 'onlyseeker', 'onlytraffic',
    'meta', 'reddit', 'reels', '\\big\\b', 'traffic/', 'spender', 'slt link'
  ].join('|'), 'i');

  var classify = function (campaignName) {
    var raw = String(campaignName || '').trim();
    if (!raw) return { promoter: '', type: 'Unmapped' };

    // "MACY FREE" is still Macy; "SOPH" is Sophie; "BLUEBEAR" is Blue Bear.
    var k = norm(raw.replace(/\s+free$/i, ''));
    if (rosterNorm[k]) return { promoter: rosterNorm[k], type: 'Internal SFS' };
    if (k.length >= 4) {
      for (var rk in rosterNorm) {
        if (rk.indexOf(k) === 0 || k.indexOf(rk) === 0) {
          return { promoter: rosterNorm[rk], type: 'Internal SFS' };
        }
      }
    }
    if (PAID.test(raw)) return { promoter: raw, type: 'Paid ad' };
    return { promoter: raw, type: 'Unmapped' };
  };

  var now = new Date(), rows = [], perAccount = [];
  accounts.forEach(function (a) {
    var links = ofAllLinks_(a.id);
    perAccount.push(a.username + ':' + links.length);
    links.forEach(function (l) {
      var url = String(l.campaignUrl || '').trim().toLowerCase().replace(/\/$/, '');
      var typed = byUrl[url] || '';
      var guess = classify(l.campaignName);
      var promoter = typed || guess.promoter;
      var type = typed
        ? (roster[typed.toLowerCase()] ? 'Internal SFS' : 'Paid ad')
        : guess.type;
      rows.push([
        a.username,
        byHandle[a.username] || '',
        'c' + l.campaignCode,
        l.campaignUrl || '',
        type,
        promoter,
        Number(l.clicksCount || 0),
        Number(l.subscribersCount || 0),
        Number((l.revenue && l.revenue.total) || 0),
        now
      ]);
    });
  });

  writeLinkTab_(LINK_NOW, rows);

  // Seed the weekly baseline the first time, or nothing can be a delta.
  var base = ss_().getSheetByName(LINK_BASE);
  if (!base || base.getLastRow() < 2) snapshotLinkBase();

  log_('pullLinkStats', rows.length + ' links across ' + accounts.length +
       ' accounts (' + perAccount.join(', ') + ')');
  return { links: rows.length, accounts: accounts.length };
}

function writeLinkTab_(name, rows) {
  var sh = sheet_(name);
  sh.clear();
  ensureSize_(sh, Math.max(rows.length + 10, 50), LINK_COLS.length + 1);
  sh.getRange(1, 1, 1, LINK_COLS.length).setValues([LINK_COLS]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, LINK_COLS.length).setValues(rows);
  sh.hideSheet();
  return sh;
}

/** Freeze today's cumulative numbers as the start-of-week baseline. */
function snapshotLinkBase() {
  var src = ss_().getSheetByName(LINK_NOW);
  if (!src || src.getLastRow() < 2) throw new Error('Run Pull link stats first.');
  var vals = src.getRange(2, 1, src.getLastRow() - 1, LINK_COLS.length).getValues();
  writeLinkTab_(LINK_BASE, vals);
  log_('snapshotLinkBase', vals.length + ' links baselined');
}

// ── Everything else the key can fill ────────────────────────────────────────

/** Tick "API tracked" for any creator whose handle the key can actually see. */
function syncApiTracked_() {
  var accounts = {};
  ofAccounts_().forEach(function (a) { accounts[a.username] = true; });
  var def = TABS.creators, sh = sheet_(def.name);
  var last = sh.getLastRow();
  if (last < FIRST_ROW) return 0;

  var nameCol   = headerIndex_(def, 'Creator');
  var handleCol = headerIndex_(def, 'OF handle');
  var trackCol  = headerIndex_(def, 'API tracked');
  var n = last - HEADER_ROW;
  var names   = sh.getRange(FIRST_ROW, nameCol,   n, 1).getValues();
  var handles = sh.getRange(FIRST_ROW, handleCol, n, 1).getValues();
  var track   = sh.getRange(FIRST_ROW, trackCol,  n, 1).getValues();

  var changed = 0;
  for (var i = 0; i < n; i++) {
    if (!names[i][0]) continue;
    var h = String(handles[i][0] || '').toLowerCase().replace(/^@/, '');
    var should = !!(h && accounts[h]);
    if (track[i][0] !== should) { track[i][0] = should; changed++; }
  }
  if (changed) sh.getRange(FIRST_ROW, trackCol, n, 1).setValues(track);
  return changed;
}

/**
 * One Revenue & Targets row per salary creator per week, rolled up from the
 * daily figures the API already provides. Upsert on week + creator.
 */
function rollupRevenueTargets_() {
  var def = TABS.revenue, sh = sheet_(def.name);
  var daily = tabRows_(TABS.earnings);
  if (!daily.length) return 0;

  var tally = {};
  daily.forEach(function (r) {
    if (!(r['Date'] instanceof Date) || !r['Creator']) return;
    var wk = weekStart_(r['Date']);
    var k = dayKey_(wk) + '|' + String(r['Creator']).trim();
    if (!tally[k]) tally[k] = { week: wk, name: String(r['Creator']).trim(), earn: 0, subs: 0, pend: 0 };
    tally[k].earn += Number(r['Total earnings $']) || 0;
    tally[k].subs += Number(r['New subs']) || 0;
    tally[k].pend += Number(r['Pending $']) || 0;
  });

  var iWk = headerIndex_(def, 'Week starting') - 1;
  var iNm = headerIndex_(def, 'Creator') - 1;
  var last = sh.getLastRow();
  var rowOf = {};
  if (last >= FIRST_ROW) {
    sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues()
      .forEach(function (r, i) {
        if (r[iNm] && r[iWk] instanceof Date) rowOf[dayKey_(r[iWk]) + '|' + String(r[iNm]).trim()] = FIRST_ROW + i;
      });
  }

  var add = [], touched = 0;
  Object.keys(tally).forEach(function (k) {
    var t = tally[k];
    var at = rowOf[k];
    if (at) {
      sh.getRange(at, headerIndex_(def, 'Total earnings $')).setValue(t.earn);
      sh.getRange(at, headerIndex_(def, 'Subs added')).setValue(t.subs);
      if (t.pend) sh.getRange(at, headerIndex_(def, 'OF pending $')).setValue(t.pend);
      touched++;
    } else {
      var row = new Array(def.headers.length).fill('');
      row[iWk] = t.week;
      row[iNm] = t.name;
      row[headerIndex_(def, 'Total earnings $') - 1] = t.earn;
      row[headerIndex_(def, 'Subs added') - 1] = t.subs;
      if (t.pend) row[headerIndex_(def, 'OF pending $') - 1] = t.pend;
      add.push(row);
    }
  });

  if (add.length) {
    var at2 = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
    if (at2 + add.length > sh.getMaxRows()) {
      sh.insertRowsAfter(sh.getMaxRows(), at2 + add.length - sh.getMaxRows() + 20);
    }
    sh.getRange(at2, 1, add.length, def.headers.length).setValues(add);
    sh.getRange(at2, iWk + 1, add.length, 1).setNumberFormat('yyyy-mm-dd');
  }
  return add.length + touched;
}

/** Fill the Tracking Links tab's live columns from the latest pull. */
function syncTrackingLinkStats_() {
  var def = TABS.links, sh = sheet_(def.name);
  var last = sh.getLastRow();
  if (last < FIRST_ROW) return 0;

  var stats = {};
  var src = ss_().getSheetByName(LINK_NOW);
  if (!src || src.getLastRow() < 2) return 0;
  src.getRange(2, 1, src.getLastRow() - 1, LINK_COLS.length).getValues().forEach(function (r) {
    var u = String(r[3] || '').trim().toLowerCase().replace(/\/$/, '');
    // Promoter and source type come across too, not just the numbers. Without
    // the promoter the schedule cannot find its link at all: the Link formula
    // matches on promoted creator AND promoter, and that column sat empty on
    // every one of the 118 rows, so every Tracking Link cell stayed blank.
    if (u) stats[u] = { clicks: r[6], subs: r[7], rev: r[8],
                        promoter: String(r[5] || '').trim(),
                        srcType:  String(r[4] || '').trim() };
  });

  var n = last - HEADER_ROW;
  var urls = sh.getRange(FIRST_ROW, headerIndex_(def, 'Tracking link'), n, 1).getValues();
  var out = urls.map(function (r) {
    var u = String(r[0] || '').trim().toLowerCase().replace(/\/$/, '');
    var s = stats[u];
    return s ? [s.clicks, s.subs, s.rev] : ['', '', ''];
  });
  sh.getRange(FIRST_ROW, headerIndex_(def, 'Clicks'), n, 3).setValues(out);

  // Fill in the promoter and source type where they are missing. Only blanks —
  // a name typed by hand always wins, because the API's campaign name is a
  // label somebody chose and may not match the roster spelling.
  var cP = headerIndex_(def, 'Promoter / source'), cS = headerIndex_(def, 'Source type');
  var cur = sh.getRange(FIRST_ROW, cP, n, 2).getValues();
  var filled = 0;
  var meta = urls.map(function (r, i) {
    var s = stats[String(r[0] || '').trim().toLowerCase().replace(/\/$/, '')];
    var p = String(cur[i][0] || '').trim(), t = String(cur[i][1] || '').trim();
    if (s && !p && s.promoter) { p = s.promoter; filled++; }
    if (s && !t && s.srcType)  { t = s.srcType; }
    return [p, t];
  });
  if (filled) sh.getRange(FIRST_ROW, cP, n, 2).setValues(meta);
  if (filled) log_('syncTrackingLinkStats', 'filled promoter on ' + filled + ' link(s)');

  return out.filter(function (r) { return r[0] !== ''; }).length;
}

// ── The job ─────────────────────────────────────────────────────────────────

/** Everything money, in one nightly pass. Each step is isolated. */
function pullMoney() {
  var notes = [];
  var step = function (name, fn) {
    try { notes.push(name + ': ' + fn()); }
    catch (e) { notes.push(name + ' FAILED — ' + e.message); }
  };
  step('earnings',  function () { var r = pullEarnings(); return r.added + ' added, ' + r.updated + ' updated'; });
  step('links',     function () { var r = pullLinkStats(); return r.links + ' links'; });
  step('link stats',function () { return syncTrackingLinkStats_() + ' rows matched'; });
  step('api flag',  function () { return syncApiTracked_() + ' creators corrected'; });
  step('weekly',    function () { return rollupRevenueTargets_() + ' week-rows'; });
  log_('pullMoney', notes.join(' | '));
  return notes;
}

function pullMoneyNow() {
  var notes = pullMoney();
  alert_('Money pulled from OnlyFans', notes.join('\n'));
  ss_().setActiveSheet(sheet_(TABS.daily.name));
}

/** Monday: this week's deltas start from today's cumulative numbers. */
function weeklyMoneyBaseline() {
  try { pullLinkStats(); snapshotLinkBase(); }
  catch (e) { log_('weeklyMoneyBaseline FAILED', e.message); }
}

function weekStart_(d) {
  var m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
