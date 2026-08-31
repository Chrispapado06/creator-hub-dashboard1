/**
 * UNCVRD Ad Scorecard — live auto-fill from OnlyFans + Meta.
 * Paste this into the sheet: Extensions ▸ Apps Script ▸ paste ▸ Save.
 * Then reload the sheet and use the new "UNCVRD" menu (steps 1→4).
 *
 * What it fills in the "Daily Log" tab each run:
 *   • Ad Spend Meta        (Meta API, today's spend)        — SET
 *   • Clicks / Fans (per platform) + Revenue (OnlyFans API) — ADDED as the day's increase
 * Manual (never touched): OnlyFinder/Guider/Seeker spend (amber columns).
 */

var LOG_SHEET    = 'Daily Log';
var CONFIG_SHEET = 'Config';
var OF_BASE      = 'https://app.onlyfansapi.com/api';
var PLATFORMS    = ['Meta', 'OnlyFinder', 'OnlyGuider', 'OnlySeeker'];
var DATA_START   = 3;   // first data row in Daily Log (row 1 title, row 2 headers)
// Daily Log columns (1-based): A Date, B Creator, C Meta spend, D-F manual spend,
// G-J clicks(Meta,Finder,Guider,Seeker), K-N fans(...), O Revenue, P-S derived
var CREATOR_COL = 2, META_SPEND_COL = 3;
var CLICK_COL = { Meta: 7, OnlyFinder: 8, OnlyGuider: 9, OnlySeeker: 10 };
var FAN_COL   = { Meta: 11, OnlyFinder: 12, OnlyGuider: 13, OnlySeeker: 14 };
var REV_COL   = 15;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('UNCVRD')
    .addItem('1 · Set API keys', 'setKeys')
    .addItem('2 · Build Config from OnlyFans', 'buildConfig')
    .addItem('3 · Refresh now', 'refreshNow')
    .addSeparator()
    .addItem('4 · Turn ON daily auto-update', 'installTrigger')
    .addItem('5 · Turn ON weekly auto-archive (Mondays)', 'installArchive')
    .addSeparator()
    .addItem('Save THIS week as a tab now', 'archiveThisWeekNow')
    .addItem('Turn OFF daily auto-update', 'removeTrigger')
    .addItem('Turn OFF weekly auto-archive', 'removeArchive')
    .addToUi();
}

function props_() { return PropertiesService.getScriptProperties(); }

function setKeys() {
  var ui = SpreadsheetApp.getUi();
  var of = ui.prompt('OnlyFans API key', 'Paste your OnlyFans key (ofapi_...)', ui.ButtonSet.OK_CANCEL);
  if (of.getSelectedButton() != ui.Button.OK) return;
  var mt = ui.prompt('Meta access token', 'Paste your Meta token (EAA...) — or leave blank', ui.ButtonSet.OK_CANCEL);
  if (mt.getSelectedButton() != ui.Button.OK) return;
  var ma = ui.prompt('Meta ad account ID', 'Numbers only (e.g. 1659771388130436) — or leave blank', ui.ButtonSet.OK_CANCEL);
  if (ma.getSelectedButton() != ui.Button.OK) return;
  props_().setProperties({
    ONLYFANS_KEY: of.getResponseText().trim(),
    META_TOKEN: mt.getResponseText().trim(),
    META_AD_ACCT: ma.getResponseText().trim()
  });
  ui.alert('Saved. Next: run "2 · Build Config from OnlyFans".');
}

// ---------- OnlyFans ----------
function ofFetch_(path) {
  var key = props_().getProperty('ONLYFANS_KEY');
  if (!key) throw new Error('Set the OnlyFans key first (menu 1).');
  var res = UrlFetchApp.fetch(OF_BASE + path, {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json', 'User-Agent': 'UNCVRD-AdTracker/1.0' },
    muteHttpExceptions: true
  });
  return JSON.parse(res.getContentText() || '{}');
}
function ofAccounts_() {
  var d = ofFetch_('/accounts');
  if (Array.isArray(d)) return d;
  if (d.data && Array.isArray(d.data.list)) return d.data.list;
  if (Array.isArray(d.data)) return d.data;
  return [];
}
function isAdLink_(n) {
  n = (n || '').trim();
  if (!n) return true;
  if (n.toLowerCase().indexOf('traffic/') === 0) return false;
  if (n.indexOf('/#') >= 0) return false;   // hide auto-generated Traffic/.../#.. links
  return true;
}
function ofLinks_(aid) {
  var out = [], off = 0;
  for (var p = 0; p < 30; p++) {
    var d = ofFetch_('/' + aid + '/tracking-links?limit=100&offset=' + off);
    var dd = (d && d.data) || {}, lst = dd.list || [];
    out = out.concat(lst);
    if (!dd.hasMore || !lst.length) break;
    off += lst.length;
  }
  return out;
}

// ---------- Config tab (link -> platform) ----------
function buildConfig() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(CONFIG_SHEET) || ss.insertSheet(CONFIG_SHEET);
  // keep any Platform tags you already set (so re-running is safe + adds new creators)
  var prev = {}, existing = sh.getDataRange().getValues();
  for (var i = 1; i < existing.length; i++) {
    var pc = String(existing[i][0] || '').toLowerCase(), pcode = String(existing[i][2] || ''), pplat = String(existing[i][3] || '').trim();
    if (pcode && pplat) prev[pc + '|' + pcode] = pplat;
  }
  sh.clear();
  sh.getRange(1, 1, 1, 4).setValues([['Creator', 'Tracking link', 'Code', 'Platform']]).setFontWeight('bold');
  var rows = [], added = 0, creators = [];
  ofAccounts_().forEach(function (a) {
    if (!a.is_authenticated) return;
    var creator = a.display_name || a.onlyfans_username || '';
    if (creator && creators.indexOf(creator) < 0) creators.push(creator);
    var links; try { links = ofLinks_(a.id); } catch (e) { return; }
    links.forEach(function (l) {
      if (!isAdLink_(l.campaignName)) return;
      var code = String(l.campaignCode || '');
      var tag = prev[creator.toLowerCase() + '|' + code] || '';
      if (!tag) added++;
      rows.push([creator, l.campaignName || ('c' + code), code, tag]);
    });
  });
  if (rows.length) sh.getRange(2, 1, rows.length, 4).setValues(rows);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(PLATFORMS, true).build();
  sh.getRange(2, 4, Math.max(rows.length, 1), 1).setDataValidation(rule);
  sh.autoResizeColumns(1, 4);
  // fill the Scorecard's Creator dropdown (All + each creator)
  var scsh = SpreadsheetApp.getActive().getSheetByName('Scorecard');
  if (scsh) {
    var picker = SpreadsheetApp.newDataValidation().requireValueInList(['All'].concat(creators), true).build();
    scsh.getRange(3, 6).setDataValidation(picker);
  }
  SpreadsheetApp.getUi().alert('Config refreshed: ' + rows.length + ' links total (' + added + ' untagged).\n\nYour existing Platform tags were kept. Tag any new links, then run "3 · Refresh now".');
}
function readConfig_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(CONFIG_SHEET);
  if (!sh) return {};
  var v = sh.getDataRange().getValues(), map = {};
  for (var i = 1; i < v.length; i++) {
    var creator = String(v[i][0] || '').toLowerCase(), code = String(v[i][2] || ''), plat = String(v[i][3] || '').trim();
    if (code && plat) map[creator + '|' + code] = plat;
  }
  return map;
}

// ---------- Meta ----------
// Meta blocks Google's servers (Apps Script) directly, so we ask our own app
// (https://uncvrd-ad-suite.onrender.com) for today's Meta spend — it can reach Meta.
var APP_URL = 'https://uncvrd-ad-suite.onrender.com';
var APP_KEY = 'uncvrd2026';   // the app password
// today's Meta spend per creator (campaigns are named by creator; we match them)
function metaSpendByCreator_(cur) {
  var out = {};
  try {
    var res = UrlFetchApp.fetch(APP_URL + '/meta-today?key=' + encodeURIComponent(APP_KEY),
                                { muteHttpExceptions: true });
    var byCamp = (JSON.parse(res.getContentText() || '{}').by_campaign) || {};
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    Object.keys(cur).forEach(function (ck) {
      var cn = norm(cur[ck].name), tot = 0;
      for (var camp in byCamp) {
        var k = norm(camp);
        if (k && (k === cn || k.indexOf(cn) >= 0 || cn.indexOf(k) >= 0)) tot += Number(byCamp[camp]) || 0;
      }
      out[ck] = tot;
    });
  } catch (e) {}
  return out;
}

// ---------- the daily write ----------
// cumulative totals grouped PER CREATOR -> { creatorKey: {name, clicks:{plat}, fans:{plat}, rev} }
function ofCumulativeByCreator_(cfg) {
  var out = {};
  ofAccounts_().forEach(function (a) {
    if (!a.is_authenticated) return;
    var name = a.display_name || a.onlyfans_username || '';
    var ck = name.toLowerCase();
    var links; try { links = ofLinks_(a.id); } catch (e) { return; }
    links.forEach(function (l) {
      if (!isAdLink_(l.campaignName)) return;
      var plat = cfg[ck + '|' + String(l.campaignCode || '')];
      if (!plat) return;                       // only tagged links count
      if (!out[ck]) { out[ck] = { name: name, clicks: {}, fans: {}, rev: 0 };
        PLATFORMS.forEach(function (p) { out[ck].clicks[p] = 0; out[ck].fans[p] = 0; }); }
      out[ck].clicks[plat] += Number(l.clicksCount || 0);
      out[ck].fans[plat]   += Number(l.subscribersCount || 0);
      out[ck].rev          += Number((l.revenue && l.revenue.total) || 0);
    });
  });
  return out;
}
// the spreadsheet's own timezone — so "today" matches what YOU see, not Google's server.
// Falls back safely if the sheet has no timezone set (common after .xlsx import).
var MY_TIMEZONE = 'Europe/Athens';   // your local timezone — used when the sheet has none set
function sheetTz_() {
  var tz = null;
  try { tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(); } catch (e) {}
  // ignore unset/garbage timezones (xlsx imports often carry GMT-offsets far from yours)
  if (typeof tz !== 'string' || !tz || tz.indexOf('Etc/') === 0 || /^GMT/.test(tz)) tz = MY_TIMEZONE;
  return tz;
}
// find (or create) today's row for a specific creator
function todayRow_(sh, creatorName) {
  var tz = sheetTz_();
  var todayStr = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var last = sh.getLastRow();
  for (var r = DATA_START; r <= last; r++) {
    var d = sh.getRange(r, 1).getValue();
    if (d instanceof Date && Utilities.formatDate(d, tz, 'yyyy-MM-dd') === todayStr
        && String(sh.getRange(r, 2).getValue() || '') === creatorName) return r;
  }
  var r2 = Math.max(last + 1, DATA_START);
  // exact midnight in the sheet's timezone (no hidden time) so SUMIFS date-match works
  sh.getRange(r2, 1).setValue(Utilities.parseDate(todayStr, tz, 'yyyy-MM-dd'))
    .setNumberFormat('yyyy-mm-dd');
  sh.getRange(r2, 2).setValue(creatorName);
  sh.getRange(r2, 16).setFormula('=SUM(C' + r2 + ':F' + r2 + ')');   // Total Spend
  sh.getRange(r2, 17).setFormula('=SUM(K' + r2 + ':N' + r2 + ')');   // Total Fans
  sh.getRange(r2, 18).setFormula('=IFERROR(O' + r2 + '/P' + r2 + ')'); // ROAS (no comma — locale-proof)
  sh.getRange(r2, 19).setFormula('=O' + r2 + '-P' + r2);            // Profit
  return r2;
}
function addTo_(sh, r, c, delta) {
  if (!delta) return;
  var cell = sh.getRange(r, c);
  cell.setValue(Number(cell.getValue() || 0) + delta);
}
function writeToday_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(LOG_SHEET);
  if (!sh) throw new Error('No "Daily Log" tab found.');
  var cfg = readConfig_();
  var cur = ofCumulativeByCreator_(cfg);
  var prevRaw = props_().getProperty('OF_CUM_BYCREATOR');
  var prev = prevRaw ? JSON.parse(prevRaw) : {};
  var meta = metaSpendByCreator_(cur);
  Object.keys(cur).forEach(function (ck) {
    var c = cur[ck], r = todayRow_(sh, c.name), p = prev[ck];
    sh.getRange(r, META_SPEND_COL).setValue(meta[ck] || 0);      // per-creator Meta spend
    if (p) {                                                     // add the increase since last run
      PLATFORMS.forEach(function (pl) {
        addTo_(sh, r, CLICK_COL[pl], Math.max(0, (c.clicks[pl] || 0) - ((p.clicks && p.clicks[pl]) || 0)));
        addTo_(sh, r, FAN_COL[pl],   Math.max(0, (c.fans[pl]   || 0) - ((p.fans   && p.fans[pl])   || 0)));
      });
      addTo_(sh, r, REV_COL, Math.max(0, (c.rev || 0) - (p.rev || 0)));
    }
  });
  props_().setProperty('OF_CUM_BYCREATOR', JSON.stringify(cur));
}
function refreshNow() { writeToday_(); SpreadsheetApp.getUi().alert("Done — today's row updated."); }

// ---------- daily trigger ----------
function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger('writeToday_').timeBased().everyHours(2).create();
  SpreadsheetApp.getUi().alert('Auto-update is ON — runs every 2 hours.');
}
function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'writeToday_') ScriptApp.deleteTrigger(t);
  });
}

// ---------- weekly archive (a frozen tab per week) ----------
function weekSunday_(d) {
  var tz = sheetTz_();
  var base = Utilities.parseDate(Utilities.formatDate(d, tz, 'yyyy-MM-dd'), tz, 'yyyy-MM-dd');
  var dow = (+Utilities.formatDate(d, tz, 'u')) % 7;   // ISO day: Mon=1..Sun=7 → Sun=0
  return new Date(base.getTime() - dow * 86400000);
}
// snapshot the given week (its Sunday) of the Scorecard into a frozen tab "Wk Mon d"
function archiveWeek_(sunday) {
  var ss = SpreadsheetApp.getActive();
  var sc = ss.getSheetByName('Scorecard');
  if (!sc) return '';
  var name = 'Wk ' + Utilities.formatDate(sunday, Session.getScriptTimeZone(), 'MMM d');
  if (ss.getSheetByName(name)) return name + ' (already saved)';
  var saved = sc.getRange(3, 3).getValue();      // remember the live view
  sc.getRange(3, 3).setValue(sunday);            // point Scorecard at the week to save
  SpreadsheetApp.flush();
  var copy = sc.copyTo(ss);                       // duplicate it...
  var r = copy.getDataRange();
  r.copyTo(r, { contentsOnly: true });            // ...and freeze formulas to values
  copy.setName(name);
  ss.setActiveSheet(copy); ss.moveActiveSheet(ss.getNumSheets());
  sc.getRange(3, 3).setValue(saved);             // restore the live view
  SpreadsheetApp.flush();
  return name;
}
function archiveThisWeekNow() {
  var name = archiveWeek_(weekSunday_(new Date()));
  SpreadsheetApp.getUi().alert('Saved current week as tab: ' + name);
}
// runs every Monday: freeze last week as a tab, then roll the live Scorecard to the new week
function weeklyRollover_() {
  var thisWk = weekSunday_(new Date());
  var lastWk = new Date(thisWk); lastWk.setDate(thisWk.getDate() - 7);
  archiveWeek_(lastWk);
  var sc = SpreadsheetApp.getActive().getSheetByName('Scorecard');
  if (sc) { sc.getRange(3, 3).setValue(thisWk); SpreadsheetApp.flush(); }
}
function installArchive() {
  removeArchive();
  ScriptApp.newTrigger('weeklyRollover_').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(1).create();
  SpreadsheetApp.getUi().alert('Weekly auto-archive is ON — every Monday it saves last week as its own tab and rolls the Scorecard to the new week.');
}
function removeArchive() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyRollover_') ScriptApp.deleteTrigger(t);
  });
}
