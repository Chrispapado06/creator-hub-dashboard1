/**
 * UNCVRD — weekly archive ONLY (the live data comes from the server; this script
 * never touches it). Every Monday it freezes last week's Scorecard into its own
 * tab ("Wk Jun 7"), keeping every week forever.
 *
 * Setup: Extensions ▸ Apps Script ▸ paste ▸ Save ▸ reload the sheet ▸
 *        UNCVRD Archive ▸ Turn ON weekly auto-archive.
 */

var MY_TIMEZONE = 'Europe/Athens';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('UNCVRD Archive')
    .addItem('Save THIS week as a tab now', 'archiveThisWeekNow')
    .addItem('Save LAST week as a tab now', 'archiveLastWeekNow')
    .addSeparator()
    .addItem('Turn ON weekly auto-archive (Mondays)', 'installArchive')
    .addItem('Turn OFF weekly auto-archive', 'removeArchive')
    .addToUi();
}

function tz_() {
  var tz = null;
  try { tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone(); } catch (e) {}
  if (typeof tz !== 'string' || !tz || tz.indexOf('Etc/') === 0 || /^GMT/.test(tz)) tz = MY_TIMEZONE;
  return tz;
}

function weekSunday_(d) {
  var tz = tz_();
  var base = Utilities.parseDate(Utilities.formatDate(d, tz, 'yyyy-MM-dd'), tz, 'yyyy-MM-dd');
  var dow = (+Utilities.formatDate(d, tz, 'u')) % 7;   // Mon=1..Sun=7 → Sun=0
  return new Date(base.getTime() - dow * 86400000);
}

function archiveWeek_(sunday) {
  var ss = SpreadsheetApp.getActive();
  var sc = ss.getSheetByName('Scorecard');
  if (!sc) throw new Error('No "Scorecard" tab found.');
  var name = 'Wk ' + Utilities.formatDate(sunday, tz_(), 'MMM d');
  if (ss.getSheetByName(name)) return name + ' (already saved)';
  var saved = sc.getRange(3, 3).getValue();        // remember the live week
  sc.getRange(3, 3).setValue(sunday);              // point the Scorecard at the week to save
  SpreadsheetApp.flush();
  Utilities.sleep(4000);                           // let IMPORTDATA-driven formulas settle
  var copy = sc.copyTo(ss);
  var r = copy.getDataRange();
  r.copyTo(r, { contentsOnly: true });             // freeze formulas → values
  copy.setName(name);
  ss.setActiveSheet(copy); ss.moveActiveSheet(ss.getNumSheets());
  sc.getRange(3, 3).setValue(saved);               // restore the live view
  SpreadsheetApp.flush();
  return name;
}

function archiveThisWeekNow() {
  SpreadsheetApp.getUi().alert('Saved: ' + archiveWeek_(weekSunday_(new Date())));
}
function archiveLastWeekNow() {
  var s = weekSunday_(new Date()); s.setDate(s.getDate() - 7);
  SpreadsheetApp.getUi().alert('Saved: ' + archiveWeek_(s));
}

// Monday ~01:00: freeze last week, leave the live Scorecard on the new week
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
  SpreadsheetApp.getUi().alert('Weekly auto-archive is ON — every Monday last week becomes its own tab.');
}
function removeArchive() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'weeklyRollover_') ScriptApp.deleteTrigger(t);
  });
}
