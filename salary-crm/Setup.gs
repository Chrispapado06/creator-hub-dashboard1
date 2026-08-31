/**
 * UNCVRD — Salary Creator CRM : builder
 * ============================================================================
 * `installCRM()` is idempotent. It rewrites banners, headers, formats,
 * dropdowns, conditional formatting and the calculated columns every time —
 * and never touches a row anyone has typed into. Seed rows are written only
 * into a tab that is completely empty.
 *
 * Run it again after editing Config.gs; that is the intended workflow.
 */

// ── Entry points ────────────────────────────────────────────────────────────

/**
 * Where a rebuild got to, so the next one can carry on.
 *
 * The build outgrew the six-minute limit, and the way it failed was the problem:
 * Apps Script kills the script mid-step with "Exceeded maximum execution time",
 * and the next run starts again from the top — hits the same wall on the same
 * tab, and the tabs past it are never reached no matter how many times you press
 * it. Recording the finished steps turns that into a job you can finish in two
 * or three goes.
 */
var BUILD_PROGRESS = 'crmBuildProgress';

function buildProgress_() {
  var sh = ss_().getSheetByName(TABS.config.name);
  if (!sh) return { done: {}, at: 0 };
  var p = readMeta_(sh, BUILD_PROGRESS);
  if (!p || !p.at) return { done: {}, at: 0 };
  // Anything older than an hour is a different session's business.
  if (new Date().getTime() - p.at > 3600000) return { done: {}, at: 0 };
  return { done: p.done || {}, at: p.at };
}

function saveProgress_(done, finished) {
  var sh = ss_().getSheetByName(TABS.config.name);
  if (!sh) return;
  if (finished) writeMeta_(sh, BUILD_PROGRESS, { done: {}, at: 0 });
  else writeMeta_(sh, BUILD_PROGRESS, { done: done, at: new Date().getTime() });
}

function installCRM() {
  var t0 = new Date();

  // Every tab has to exist before any formula is written, or a cross-tab
  // reference to a sheet that does not exist yet is rewritten to #REF! and
  // stays broken after the sheet appears.
  TAB_ORDER.forEach(function (key) { sheet_(TABS[key].name); });

  var prior = buildProgress_();
  var done  = prior.done, resumed = Object.keys(done).length;

  // Each step is isolated. One tab that throws used to abort the whole build
  // and leave the file half-old with nothing written to the log explaining it —
  // which is exactly how a broken run reads as "no change yet".
  var failed = [], timing = [], skipped = 0, ran = [];
  var step = function (name, fn) {
    if (done[name]) { skipped++; return; }

    // Stop BEFORE starting a step we might not finish. Checking afterwards let
    // one slow tab run past the limit and get killed mid-write, which is how a
    // tab ends up with new headers over unmoved rows.
    var spent = (new Date() - t0) / 1000;
    if (spent > 240) {
      saveProgress_(done, false);
      throw new Error(
        'Stopped cleanly at ' + spent.toFixed(0) + 's, before "' + name + '", to stay ' +
        'inside the six-minute limit.\n\n' +
        ran.length + ' step(s) finished this run' + (resumed ? ' (' + resumed + ' were already done)' : '') +
        '.\n\nRUN IT AGAIN — it carries on from here rather than starting over. ' +
        'Repeat until it says it is finished.\n\n' +
        'Slowest so far: ' + (timing.join(', ') || 'nothing over 3s'));
    }

    var t = new Date();
    try { fn(); done[name] = 1; ran.push(name); }
    catch (e) {
      failed.push(name + ': ' + (e && e.message ? e.message : e));
      log_('installCRM FAILED', name + ' — ' + (e && e.stack ? e.stack : e));
      done[name] = 1;                       // do not retry a step that throws every time
    }
    var secs = (new Date() - t) / 1000;
    if (secs >= 3) timing.push(name + ' ' + secs.toFixed(1) + 's');
  };

  // First, before anything is written. The caption bank is the only tab whose
  // content cannot be rebuilt from the API or from another sheet, so it gets a
  // copy taken every single time this runs — including the runs that go wrong.
  step('Caption backup', archiveCaptions_);

  step('Start Here',   buildStartHere_);
  step('Config',       buildConfig_);      // named ranges — everything else reads them
  step('Ad imports',   buildAdHelpers_);
  step('SFS imports',  buildSfsHelpers_);
  step('Link tabs',    ensureLinkTabs_);   // before any formula points at them

  TAB_ORDER.forEach(function (key) {
    var def = TABS[key];
    if (def.kind === 'doc' || def.kind === 'config') return;
    if (def.kind === 'ad' || def.kind === 'sfs' || def.kind === 'daily') return;
    if (def.kind === 'dash')  return;                       // needs every other tab to exist
    step(def.name, function () { buildDataTab_(key); });
  });

  step('Weekly AD Stats',    buildAdStats_);
  step('ADs Summary',        buildAdSummary_);
  step('SFS Weekly Report',  buildSfsReport_);
  step('SFS Summary',        buildSfsSummary_);
  step('Daily Report',       buildDailyReport_);
  step('Dashboard',          buildDashboard_);
  step('Tracking links',     ensureLinks_);
  step('Roster',             ensureRoster_);
  step('Salary roster',      ensureSalaryRoster_);
  step('Roster defaults',    fillRosterDefaults_);
  step('Retire old tabs',    retireTabs_);
  step('Tab order',          orderTabs_);
  ensureLog_();
  saveProgress_(done, true);               // got to the end — next run starts fresh

  var secs = ((new Date() - t0) / 1000).toFixed(1);
  log_('installCRM', (failed.length
    ? 'finished in ' + secs + 's with ' + failed.length + ' FAILED: ' + failed.join(' | ')
    : 'built in ' + secs + 's, no errors') +
    (timing.length ? ' | slowest: ' + timing.join(', ') : ''));
  ss_().setActiveSheet(sheet_(failed.length ? TABS.config.name : TABS.start.name));

  if (failed.length) {
    alert_('Built, but ' + failed.length + ' tab(s) failed',
      failed.join('\n\n') + '\n\nEverything else was written. Send this text to Claude.');
  } else {
    alert_('Salary CRM built — finished',
      (resumed ? 'Carried on from an earlier run: ' + resumed + ' step(s) were already done, ' +
                 ran.length + ' finished this time.\n\n' : '') +
      'Built in ' + secs + 's.\n\n' +
      '1. Config → CONNECTIONS: anything showing #REF! needs Allow access clicked once.\n' +
      '2. Creators: fill in Status, Type and Tier.\n' +
      '3. UNCVRD CRM → Install reminders.\n\n' +
      'Start Here explains the rest.');
  }
}

/**
 * getUi() throws when there is no document context — running from the editor,
 * or from a time-based trigger. Nothing here is important enough to fail a
 * build over, so fall back to the log.
 */
function ui_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}

function alert_(title, msg) {
  var ui = ui_();
  if (ui) {
    if (msg === undefined) ui.alert(title);
    else ui.alert(title, msg, ui.ButtonSet.OK);
    return;
  }
  Logger.log(title + (msg ? '\n\n' + msg : ''));
  log_('alert', title + (msg ? ' — ' + msg : ''));
}

// ── Data tabs ───────────────────────────────────────────────────────────────

function buildDataTab_(key) {
  var def  = TABS[key];
  var sh   = sheet_(def.name);
  var cols = def.headers.length;
  var last = FIRST_ROW + DATA_ROWS - 1;

  var visible = def.lookup ? cols + 3 : cols;
  clearCharts_(sh);
  ensureSize_(sh, last + 5, visible + 1);

  // Rows 1–3 are ours; everything below belongs to whoever uses the sheet.
  try { sh.getRange(1, 1, 3, sh.getMaxColumns()).breakApart(); } catch (e) { /* nothing merged */ }
  sh.getRange(1, 1, 3, sh.getMaxColumns()).clearContent().clearNote()
    .setBackground(null).setFontColor(null).setFontWeight('normal').setFontStyle('normal');
  // The indigo banner is a filled row, not a merged cell: these tabs freeze
  // column 1, and Sheets refuses to freeze a column that would cut a merge in
  // half. Filling the whole row and letting the text overflow looks identical.
  sh.getRange(1, 1, 1, sh.getMaxColumns()).setBackground(C.brand);
  sh.getRange(1, 1).setValue(def.title)
    .setFontSize(14).setFontWeight('bold').setFontColor(C.brandTx);
  sh.setRowHeight(1, 26);
  if (def.groups) {
    // Their schedule puts POST 1 / POST 2 banners over the two halves of the
    // row. It is the thing that makes a 13-column table readable at a glance.
    sh.getRange(1, 1).setNote(def.help);
    def.groups.forEach(function (g) {
      var a = headerIndex_(def, g.from), b = headerIndex_(def, g.to);
      sh.getRange(2, a, 1, b - a + 1).merge().setValue(g.label)
        .setBackground(g.bg).setFontColor('#ffffff').setFontWeight('bold')
        .setHorizontalAlignment('center');
    });
  } else {
    sh.getRange(2, 1).setValue(def.help)
      .setFontSize(10).setFontColor(C.help).setWrap(false);
  }
  sh.setRowHeight(2, 22);

  // If the column list has changed since this tab was last built, move the
  // existing rows to match BEFORE the new headers are written over the old
  // ones. Without this, inserting a column silently shifts every value one to
  // the left and the data still looks fine.
  migrateColumns_(sh, def);

  sh.getRange(HEADER_ROW, 1, 1, cols).setValues([def.display || def.headers])
    .setFontWeight('bold').setBackground(C.head).setFontColor(C.headTxt)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(HEADER_ROW, 34);

  // Every rule below covers the real extent of the tab, not a fixed 250 rows.
  // A tab whose rows ran past row 253 — 252 captions, an append that landed
  // low — used to keep them outside the block entirely: no dropdown, no
  // checkbox, no number format and no calculated column, on rows that hold
  // real data. That reads as "the sheet stopped working after row 253".
  var span = dataSpan_(sh);
  ensureSize_(sh, FIRST_ROW + span + 4, visible + 1);

  // Plain white = you type. Yellow is reserved for genuine control cells, and
  // pale grey for formulas — the same three-way code as the ad sheet.
  var body = sh.getRange(FIRST_ROW, 1, span, cols);
  body.setVerticalAlignment('top');
  body.setBackground(null);
  body.setFontColor(C.ink);
  body.setDataValidation(null);

  if (def.lookup) buildLinkLookup_(sh, cols);

  // Seed before formats, so number formats and validation land on real values.
  if (isEmptyBelowHeader_(sh, cols)) seedTab_(key, sh, cols);

  applyFormats_(sh, def, cols, span);
  applyChecks_(sh, def, span);
  applyLists_(sh, def, span);
  applyCalc_(sh, def, span);
  applyNotes_(sh, def);
  applyWidths_(sh, def);
  applyConditional_(sh, def, key, span);

  sh.setFrozenRows(HEADER_ROW);
  sh.setFrozenColumns(1);
  sh.setTabColor(SECTION[def.section]);
  if (sh.getMaxColumns() > visible) {
    sh.hideColumns(visible + 1, sh.getMaxColumns() - visible);
  }
}

/**
 * Re-align a tab's rows when its column list changes between builds.
 *
 * The previous layout is stamped on the sheet as developer metadata rather
 * than inferred from the header text, because display labels are not unique —
 * the feed schedule shows "Caption" and "Status" twice — so reading the header
 * row back cannot tell you which column was which.
 *
 * Columns that no longer exist are kept, parked to the right under an
 * ARCHIVED heading. Nothing is deleted; the user decides what to drop.
 */
function migrateColumns_(sh, def) {
  var prev = readMeta_(sh, 'crmHeaders');
  var want = def.headers;
  if (!prev || prev.join('\u0001') === want.join('\u0001')) { writeMeta_(sh, 'crmHeaders', want); return; }

  var lastRow = sh.getLastRow();
  if (lastRow < FIRST_ROW) { writeMeta_(sh, 'crmHeaders', want); return; }

  var rows = lastRow - HEADER_ROW;
  var old  = sh.getRange(FIRST_ROW, 1, rows, prev.length).getValues();
  if (!old.some(function (r) {
        return r.some(function (v) { return v !== '' && v !== null && v !== false; });
      })) { writeMeta_(sh, 'crmHeaders', want); return; }   // nothing typed yet

  // A renamed column is the same column. Without this map a rename reads as a
  // drop plus an add: the values get archived off to the right and the new
  // column comes back empty, which looks exactly like data loss to whoever
  // typed them. def.renames is {oldHeader: newHeader}.
  var ren = def.renames || {}, oldNameFor = {};
  Object.keys(ren).forEach(function (o) { oldNameFor[ren[o]] = o; });

  var dropped = prev.filter(function (h) { return want.indexOf(h) < 0 && !ren[h]; });
  var before = old.filter(function (r) {
    return r.some(function (v) { return v !== '' && v !== null && v !== false; });
  }).length;
  var out = old.map(function (r) {
    var line = want.map(function (h) {
      var i = prev.indexOf(h);
      if (i < 0 && oldNameFor[h]) i = prev.indexOf(oldNameFor[h]);   // carried across a rename
      return i < 0 ? '' : r[i];
    });
    dropped.forEach(function (h) { line.push(r[prev.indexOf(h)]); });
    return line;
  });

  // Count BEFORE writing. This check used to sit after the setValues and still
  // said "Nothing written" — on the one tab that has already lost rows once,
  // the last line of defence was firing after the damage was done. `out` is
  // computed in memory, so the comparison costs nothing here and means the
  // sheet is never touched on a bad migration.
  var after = out.filter(function (r) {
    return r.some(function (v) { return v !== '' && v !== null && v !== false; });
  }).length;
  if (after < before) {
    throw new Error('Refusing to migrate ' + def.name + ': ' + before + ' populated rows in, ' +
                    after + ' out. Nothing written — the sheet is untouched. ' +
                    'This is a bug in the column map, not your data.');
  }

  // ONE atomic write, padded to cover the old width. A clearContent() followed
  // by a setValues() is two operations, and Apps Script's six-minute kill can
  // land between them — which is precisely how a rebuild once wiped rows it was
  // meant to be protecting. Never separate the two again.
  var width = Math.max(prev.length, want.length + dropped.length);
  ensureSize_(sh, lastRow + 5, width + 2);
  out.forEach(function (line) { while (line.length < width) line.push(''); });
  sh.getRange(FIRST_ROW, 1, rows, width).setValues(out);

  if (dropped.length) {
    sh.getRange(HEADER_ROW, want.length + 1, 1, dropped.length)
      .setValues([dropped.map(function (h) { return 'ARCHIVED — ' + h; })])
      .setBackground('#9aa0a6').setFontColor('#ffffff').setFontWeight('bold');
  }
  log_('migrateColumns', def.name + ': ' + prev.length + ' → ' + want.length + ' columns, ' +
       before + ' populated rows realigned' +
       (dropped.length ? ', kept ' + dropped.length + ' retired column(s) to the right' : ''));
  writeMeta_(sh, 'crmHeaders', want);
}

/** The tab's own record of how it was last built. */
function readMeta_(sh, key) {
  var all = sh.getDeveloperMetadata();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getKey() === key) {
      try { return JSON.parse(all[i].getValue()); } catch (e) { return null; }
    }
  }
  return null;
}

function writeMeta_(sh, key, obj) {
  sh.getDeveloperMetadata().forEach(function (m) { if (m.getKey() === key) m.remove(); });
  sh.addDeveloperMetadata(key, JSON.stringify(obj));
}

/** Number formats + the grey "this is calculated" background. */
function applyFormats_(sh, def, cols, span) {
  span = span || dataSpan_(sh);
  var fmt = function (headers, pattern, align) {
    (headers || []).forEach(function (h) {
      var r = sh.getRange(FIRST_ROW, headerIndex_(def, h), span, 1);
      r.setNumberFormat(pattern);
      if (align) r.setHorizontalAlignment(align);
    });
  };
  fmt(def.dates, 'yyyy-mm-dd', 'center');
  fmt(def.money, '$#,##0.00',  'right');
  fmt(def.pct,   '0%',         'center');
  fmt(def.int,   '#,##0',      'right');

  Object.keys(def.calc || {}).forEach(function (h) {
    sh.getRange(FIRST_ROW, headerIndex_(def, h), span, 1)
      .setBackground(C.calc).setFontColor('#3c4043');
  });
}

function applyChecks_(sh, def, span) {
  span = span || dataSpan_(sh);
  var isBox = {};
  if (def.checkBlock) {
    var a = headerIndex_(def, def.checkBlock[0]);
    var b = headerIndex_(def, def.checkBlock[1]);
    sh.getRange(FIRST_ROW, a, span, b - a + 1).insertCheckboxes();
    for (var c = a; c <= b; c++) isBox[c] = true;
  }
  (def.checks || []).forEach(function (h) {
    var i = headerIndex_(def, h);
    sh.getRange(FIRST_ROW, i, span, 1).insertCheckboxes();
    isBox[i] = true;
  });

  // A column that used to be a checkbox and no longer is keeps its TRUE/FALSE
  // values after the validation is dropped, so the tab shows a wall of FALSE
  // under a heading that has nothing to do with checkboxes. Clear those, and
  // only those — a boolean anywhere else is always leftover.
  //
  // One read and one write for the whole body. Doing it per column was 74
  // round-trips on the wide tabs and was a real part of the 6-minute timeout.
  var body = sh.getRange(FIRST_ROW, 1, span, def.headers.length);
  var vals = body.getValues();
  var cleared = 0;
  vals.forEach(function (row) {
    for (var c = 0; c < row.length; c++) {
      if (!isBox[c + 1] && typeof row[c] === 'boolean') { row[c] = ''; cleared++; }
    }
  });
  if (cleared) {
    body.setValues(vals);
    log_('applyChecks', def.name + ': cleared ' + cleared + ' stale checkbox values');
  }
}

function applyLists_(sh, def, span) {
  span = span || dataSpan_(sh);
  Object.keys(def.lists || {}).forEach(function (h) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(LIST[def.lists[h]], true)
      .setAllowInvalid(false).build();
    sh.getRange(FIRST_ROW, headerIndex_(def, h), span, 1).setDataValidation(rule);
  });

  // The promoter on a tracking link can be a creator OR an ad platform.
  if (def.sourceCol && def.headers.indexOf(def.sourceCol) >= 0) {
    sh.getRange(FIRST_ROW, headerIndex_(def, def.sourceCol), span, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInRange(ss_().getRangeByName('CRM_Sources'), true)
        .setAllowInvalid(true).build());
  }

  // Every "which creator" column reads the roster, so names stay spelled once.
  ['Creator', 'Promoted creator', 'Promoting', 'Our creator', 'Fits creator',
   'Account', 'Home account (target)', 'Current account',
   'Model (Promoter)', '1st Promote', '2nd Promote', '3rd Promote', '4th Promote',
   '1st Promoting Model', '2nd Promoting Model',
   'Promoting Creator', 'Promoted Creator'].forEach(function (h) {
    if (def.headers.indexOf(h) < 0) return;
    if (def.sourceCol === h) return;                       // already a source dropdown
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss_().getRangeByName('CRM_Roster'), true)
      .setAllowInvalid(true).build();          // allow-invalid: new names before the roster catches up
    sh.getRange(FIRST_ROW, headerIndex_(def, h), span, 1).setDataValidation(rule);
  });
}

function applyCalc_(sh, def, span) {
  span = span || dataSpan_(sh);
  Object.keys(def.calc || {}).forEach(function (h) {
    var tpl = def.calc[h];
    var out = [];
    for (var i = 0; i < span; i++) {
      out.push([tpl.replace(/\{r\}/g, String(FIRST_ROW + i))]);
    }
    sh.getRange(FIRST_ROW, headerIndex_(def, h), span, 1).setFormulas(out);
  });
}

function applyNotes_(sh, def) {
  Object.keys(def.notes || {}).forEach(function (h) {
    sh.getRange(HEADER_ROW, headerIndex_(def, h)).setNote(def.notes[h]);
  });
}

function applyWidths_(sh, def) {
  for (var c = 1; c <= def.headers.length; c++) sh.setColumnWidth(c, 110);
  Object.keys(def.widths || {}).forEach(function (h) {
    sh.setColumnWidth(headerIndex_(def, h), def.widths[h]);
  });
}

/** Red where something is late or under target; amber where it needs a look. */
function applyConditional_(sh, def, key, span) {
  var rules = [];

  span = span || dataSpan_(sh);
  var at = function (h) {
    return sh.getRange(FIRST_ROW, headerIndex_(def, h), span, 1);
  };
  var textIs = function (h, txt, bg) {
    if (def.headers.indexOf(h) < 0) return;
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(txt).setBackground(bg).setRanges([at(h)]).build());
  };

  textIs('Overdue',          'LATE',    C.bad);
  textIs('Status',           'OVER SLA', C.bad);
  textIs('Status',           'Ready',   C.good);
  textIs('Touch SLA',        'LATE',    C.bad);
  textIs('Touch SLA',        'OK',      C.good);
  textIs('vs $25 target',    'under',   C.warn);
  textIs('vs $5k pending',   'under',   C.warn);
  textIs('vs 153 subs/day',  'under',   C.warn);
  textIs('Above $10k floor', 'BELOW',   C.bad);
  textIs('Above $10k floor', 'OK',      C.good);
  textIs('Tier',             'MAJOR',   C.flag);

  if (key === 'payments') {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($G' + FIRST_ROW + '="Due",$A' + FIRST_ROW + '<>"",$A' + FIRST_ROW + '<=TODAY())')
      .setBackground(C.bad)
      .setRanges([sh.getRange(FIRST_ROW, 1, DATA_ROWS, def.headers.length)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$G' + FIRST_ROW + '="Paid"')
      .setFontColor('#9aa0a6')
      .setRanges([sh.getRange(FIRST_ROW, 1, DATA_ROWS, def.headers.length)]).build());
  }

  if (key === 'captions') {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($L' + FIRST_ROW + '="Active",$I' + FIRST_ROW + '<>"",$I' + FIRST_ROW + '<7)')
      .setBackground(C.warn)
      .setRanges([sh.getRange(FIRST_ROW, 1, DATA_ROWS, def.headers.length)]).build());
  }

  if (key === 'flags') {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=AND($E' + FIRST_ROW + '="Blocker",$I' + FIRST_ROW + '<>"Done",$I' + FIRST_ROW + '<>"Dropped")')
      .setBackground(C.bad)
      .setRanges([sh.getRange(FIRST_ROW, 1, DATA_ROWS, def.headers.length)]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=OR($I' + FIRST_ROW + '="Done",$I' + FIRST_ROW + '="Dropped")')
      .setFontColor('#9aa0a6')
      .setRanges([sh.getRange(FIRST_ROW, 1, DATA_ROWS, def.headers.length)]).build());
  }

  if (key === 'links') {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('n/a').setBackground(C.warn)
      .setRanges([sh.getRange(FIRST_ROW, headerIndex_(def, 'Tracking link'), DATA_ROWS, 1)]).build());
  }

  if (key === 'onboarding') {
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .setGradientMaxpointWithValue(C.good, SpreadsheetApp.InterpolationType.NUMBER, '1')
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, '0')
      .setRanges([sh.getRange(FIRST_ROW, headerIndex_(def, 'Complete %'), DATA_ROWS, 1)]).build());
  }

  // Status columns colour themselves: yellow scheduled, green posted, red
  // expired, and so on. Rules rather than fills, so a rebuild rewrites them
  // and nothing painted by hand can be lost.
  Object.keys(def.lists || {}).forEach(function (h) {
    if (def.lists[h] !== 'postStatus') return;
    var rng = at(h);
    Object.keys(STATUS_COLOUR).forEach(function (word) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(word).setBackground(STATUS_COLOUR[word])
        .setRanges([rng]).build());
    });
  });

  // One colour per creator down the promoter column, so a hundred-row schedule
  // can be read by eye rather than by squinting at names.
  if (def.promoterCol && def.headers.indexOf(def.promoterCol) >= 0) {
    var names = rosterNames_();
    var pr = at(def.promoterCol);
    names.forEach(function (name, i) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(name)
        .setBackground(PROMOTER_PALETTE[i % PROMOTER_PALETTE.length])
        .setRanges([pr]).build());
    });
  }

  sh.setConditionalFormatRules(rules);
}

/** The roster as it stands right now, for colour assignment. */
function rosterNames_() {
  try {
    var sh = ss_().getSheetByName(TABS.creators.name);
    if (!sh || sh.getLastRow() < FIRST_ROW) return [];
    return sh.getRange(FIRST_ROW, 1, sh.getLastRow() - HEADER_ROW, 1).getValues()
      .map(function (r) { return String(r[0]).trim(); })
      .filter(function (v) { return v; });
  } catch (e) { return []; }
}

/** Tracking Links gets a two-dropdown lookup so nobody scrolls 90 rows. */
function buildLinkLookup_(sh, cols) {
  var c = cols + 2;                                        // right of the table, visible gutter
  sh.getRange(1, c, 1, 2).merge();
  sh.getRange(1, c).setValue('FIND A LINK').setFontWeight('bold');
  sh.getRange(2, c).setValue('Promoted');
  sh.getRange(3, c).setValue('Promoter');
  sh.getRange(4, c).setValue('Link');
  sh.getRange(2, c + 1, 2, 1).setBackground(C.input).setBorder(true, true, true, true, false, false);
  sh.getRange(4, c + 1).setFormula(
    '=IFERROR(INDEX($D$' + FIRST_ROW + ':$D,MATCH(1,($A$' + FIRST_ROW + ':$A=' +
    colA1_(c + 1) + '$2)*($B$' + FIRST_ROW + ':$B=' + colA1_(c + 1) + '$3),0)),' +
    '"— pick both —")').setBackground(C.calc);
  sh.setColumnWidth(c, 90);
  sh.setColumnWidth(c + 1, 300);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss_().getRangeByName('CRM_Roster'), true).setAllowInvalid(true).build();
  sh.getRange(2, c + 1, 2, 1).setDataValidation(rule);
  return c;
}

// ── Seeds ───────────────────────────────────────────────────────────────────

function seedTab_(key, sh, cols) {
  var def  = TABS[key];
  var rows = null;
  var today = new Date();

  if (key === 'creators') {
    rows = seedCreators_().map(function (s) {
      var r = new Array(cols).fill('');
      r[headerIndex_(def, 'Creator') - 1]     = s[0];
      r[headerIndex_(def, 'OF handle') - 1]   = s[1];
      r[headerIndex_(def, 'OF page') - 1]     = s[1] ? 'https://onlyfans.com/' + s[1] : '';
      r[headerIndex_(def, 'API tracked') - 1] = s[2];
      r[headerIndex_(def, 'Notes') - 1]       = s[3];
      // Leave every checkbox we did not set as FALSE, not blank.
      (def.checks || []).forEach(function (h) {
        var i = headerIndex_(def, h) - 1;
        if (r[i] === '') r[i] = false;
      });
      return r;
    });
  } else if (key === 'links')    { rows = seedLinks_(); }
  else if (key === 'external')   { rows = seedExternal_(); }
  else if (key === 'tests')      { rows = seedTests_(); }
  else if (key === 'flags')      {
    rows = seedFlags_().map(function (r) { r[0] = today; return r; });
  }

  if (!rows || !rows.length) return;
  if (rows.length > DATA_ROWS) rows = rows.slice(0, DATA_ROWS);
  sh.getRange(FIRST_ROW, 1, rows.length, cols).setValues(rows);
}

/** True when nothing has been typed below the header — the only time we seed. */
function isEmptyBelowHeader_(sh, cols) {
  var lastRow = sh.getLastRow();
  if (lastRow <= HEADER_ROW) return true;
  var vals = sh.getRange(FIRST_ROW, 1, lastRow - HEADER_ROW, cols).getValues();
  return !vals.some(function (row) {
    return row.some(function (v) { return v !== '' && v !== null && v !== false; });
  });
}

// ── Config ──────────────────────────────────────────────────────────────────

function buildConfig_() {
  var sh = sheet_(TABS.config.name);
  ensureSize_(sh, 80, 12);

  var existing = {};
  if (sh.getLastRow() >= FIRST_ROW) {
    sh.getRange(FIRST_ROW, 1, sh.getLastRow() - HEADER_ROW, 3).getValues()
      .forEach(function (r) { if (r[0]) existing[r[0]] = r[2]; });
  }

  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getRange(1, 1, 1, 4).merge().setValue('CONFIG — every number this file argues with')
    .setFontSize(16).setFontWeight('bold').setFontColor(C.brandTx).setBackground(C.brand);
  sh.setRowHeight(1, 28);
  sh.getRange('A2:D2').merge();
  sh.getRange('A2').setValue(
    'Edit the Value column only. Every formula elsewhere reads these by name ' +
    '(CFG_MANAGED_FLOOR, not Config!$C$14), so changing a number here changes ' +
    'the whole file. Values you have already changed are kept when this rebuilds.')
    .setFontSize(9).setFontColor(C.help).setWrap(true);
  sh.setRowHeight(2, 32);

  var defs = configDefaults_().map(function (d) {
    return [d[0], d[1], existing.hasOwnProperty(d[0]) && existing[d[0]] !== '' ? existing[d[0]] : d[2], d[3]];
  });

  sh.getRange(HEADER_ROW, 1, 1, 4).setValues([['Key', 'Setting', 'Value', 'Where it comes from']])
    .setFontWeight('bold').setBackground(C.head).setFontColor(C.headTxt);
  sh.getRange(FIRST_ROW, 1, defs.length, 4).setValues(defs);
  sh.getRange(FIRST_ROW, 3, defs.length, 1).setBackground(C.input)
    .setBorder(true, true, true, true, true, false);
  sh.getRange(FIRST_ROW, 1, defs.length, 1).setFontColor('#9aa0a6').setFontSize(8);

  ss_().getNamedRanges().forEach(function (nr) {
    if (nr.getName().indexOf('CFG_') === 0 || nr.getName().indexOf('CRM_') === 0) nr.remove();
  });
  defs.forEach(function (d, i) {
    ss_().setNamedRange('CFG_' + d[0], sh.getRange(FIRST_ROW + i, 3));
  });

  // The roster every "which creator" dropdown points at.
  var rosterCol = 6;
  sh.getRange(HEADER_ROW, rosterCol).setValue('Roster (drives every creator dropdown)')
    .setFontWeight('bold').setBackground(C.head).setFontColor(C.headTxt);
  sh.getRange(FIRST_ROW, rosterCol, 60, 1).setFormula('');
  sh.getRange(FIRST_ROW, rosterCol).setFormula(
    "=IFERROR(SORT(UNIQUE(FILTER(Creators!$A$" + FIRST_ROW + ":$A,Creators!$A$" + FIRST_ROW + ":$A<>\"\"))),\"\")");
  ss_().setNamedRange('CRM_Roster', sh.getRange(FIRST_ROW, rosterCol, 60, 1));

  // Traffic sources: every creator, plus the ad platforms and a generic
  // "Paid ad". A tracking link's source is not always another creator.
  //
  // This used to be written twice into the same cell under two different
  // headings, so the first list was overwritten by the second before anyone
  // could read it and CRM_Sources was declared at two different heights.
  var srcCol = rosterCol + 2;
  sh.getRange(HEADER_ROW, srcCol).setValue('Traffic source (for Tracking Links)')
    .setFontWeight('bold').setBackground(C.head).setFontColor(C.headTxt);
  sh.getRange(FIRST_ROW, srcCol).setFormula(
    '={"Paid ad";"Meta";"OnlyFinder";"OnlyGuider";"OnlySeeker";"OnlyTraffic";' +
    'IFERROR(SORT(UNIQUE(FILTER(Creators!$A$' + FIRST_ROW + ':$A,Creators!$A$' + FIRST_ROW +
    ':$A<>""))),"")}');
  ss_().setNamedRange('CRM_Sources', sh.getRange(FIRST_ROW, srcCol, 70, 1));
  sh.setColumnWidth(srcCol, 220);

  // Connection probes. The ad tabs read IMPORTRANGE from HIDDEN helper sheets,
  // and an unauthorised IMPORTRANGE shows its "Allow access" button on the cell
  // itself — which nobody can click on a sheet they cannot see. These two
  // visible cells are that button. Authorising here unblocks the helpers.
  var cRow = FIRST_ROW + defs.length + 2;
  sh.getRange(cRow, 1, 1, 4).merge().setValue('CONNECTIONS — click Allow access on any cell showing #REF!')
    .setFontWeight('bold').setFontColor(C.brandTx).setBackground(C.brand);
  var probes = [
    ['Ad sheet',            '=IMPORTRANGE(CFG_AD_SHEET_ID,"Data!A1")'],
    ['Internal promo report','=IMPORTRANGE(CFG_PROMO_REPORT_ID,"\'Weekly Report\'!A1")']
  ];
  probes.forEach(function (p, i) {
    sh.getRange(cRow + 1 + i, 1).setValue(p[0]);
    sh.getRange(cRow + 1 + i, 2).setFormula(p[1]).setBackground(C.calc);
    sh.getRange(cRow + 1 + i, 3).setFormula(
      '=IF(ISERROR($B$' + (cRow + 1 + i) + '),"needs Allow access","connected")')
      .setFontWeight('bold');
  });

  sh.setColumnWidth(1, 190); sh.setColumnWidth(2, 320);
  sh.setColumnWidth(3, 150); sh.setColumnWidth(4, 420); sh.setColumnWidth(rosterCol, 180);
  sh.setFrozenRows(HEADER_ROW);
  sh.setTabColor(SECTION.config);
}

// ── Dashboard ───────────────────────────────────────────────────────────────

function buildDashboard_() {
  var sh = sheet_(TABS.dash.name);
  ensureSize_(sh, 90, 8);
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.setHiddenGridlines(true);

  sh.getRange('A1:E1').merge().setValue('UNCVRD — SALARY CRM')
    .setFontSize(18).setFontWeight('bold').setFontColor(C.brandTx).setBackground(C.brand);
  sh.getRange('A2:E2').merge();
  sh.getRange('A2').setFormula(
    '="Everything outside chatting, on one page.   ·   " & TEXT(TODAY(),"ddd d mmm yyyy") & ' +
    '"   ·   " & (EOMONTH(TODAY(),0)-TODAY()) & " days left in the month"')
    .setFontSize(10).setFontColor(C.help);
  sh.setRowHeight(1, 32);

  sh.getRange(3, 1, 1, 5)
    .setValues([['', 'Now', 'Target', 'Status', 'What to do when it goes red']])
    .setFontWeight('bold').setFontSize(9).setFontColor(C.help);
  sh.getRange(3, 2, 1, 3).setHorizontalAlignment('right');

  var row = 4;
  DASH_BLOCKS_().forEach(function (block) {
    sh.getRange(row, 1, 1, 5).merge();
    sh.getRange(row, 1).setValue(block.title)
      .setFontWeight('bold').setFontSize(11).setFontColor(C.brandTx).setBackground(C.brand);
    sh.setRowHeight(row, 24);
    row++;

    var rows = block.rows.map(dashNorm_);
    var n = rows.length;
    sh.getRange(row, 1, n, 1).setValues(rows.map(function (r) { return [r[0]]; }));
    sh.getRange(row, 2, n, 1).setFormulas(rows.map(function (r) { return [r[1]]; }));
    sh.getRange(row, 3, n, 1).setFormulas(rows.map(function (r) { return [r[2] || '']; }));
    sh.getRange(row, 4, n, 1).setFormulas(rows.map(function (r, i) {
      return [dashStatus_(r[3], row + i)];
    }));
    sh.getRange(row, 5, n, 1).setValues(rows.map(function (r) { return [r[5] || '']; }))
      .setFontSize(9).setFontColor(C.help);
    rows.forEach(function (r, i) {
      sh.getRange(row + i, 2, 1, 2).setNumberFormat(r[4] || '#,##0');
    });
    sh.getRange(row, 2, n, 2).setHorizontalAlignment('right');
    sh.getRange(row, 4, n, 1).setHorizontalAlignment('center').setFontWeight('bold');
    row += n + 1;
  });

  sh.setColumnWidth(1, 330); sh.setColumnWidth(2, 110);
  sh.setColumnWidth(3, 110); sh.setColumnWidth(4, 90); sh.setColumnWidth(5, 460);
  sh.getRange(4, 1, row - 4, 5).setVerticalAlignment('middle');

  var body = sh.getRange(4, 4, row - 4, 1);
  sh.setConditionalFormatRules([
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('OK')
      .setBackground(C.good).setFontColor('#1e4620').setRanges([body]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ACTION')
      .setBackground(C.bad).setFontColor('#8c1d18').setRanges([body]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('BEHIND')
      .setBackground(C.bad).setFontColor('#8c1d18').setRanges([body]).build()
  ]);

  sh.setFrozenRows(3);
  sh.setTabColor(SECTION.control);
}

/**
 * A dashboard row is [label, value, target, statusKind, numberFormat, hint].
 * The number format is the only optional slot, so a five-element row is one
 * whose fifth entry is the hint. Number formats never contain three
 * consecutive letters; prose always does.
 */
function dashNorm_(r) {
  var out = r.slice();
  if (out.length === 5 && /[a-zA-Z]{3}/.test(String(out[4]))) out.splice(4, 0, '#,##0');
  while (out.length < 6) out.push('');
  return out;
}

/** '' = no status cell, 'zero' = anything above zero needs action, 'target' = must reach column C. */
function dashStatus_(kind, r) {
  if (kind === 'zero')   return '=IF(N(B' + r + ')=0,"OK","ACTION")';
  if (kind === 'target') return '=IF(N(B' + r + ')>=N(C' + r + '),"OK","BEHIND")';
  return '';
}

/** [label, valueFormula, targetFormula, statusKind, numberFormat] */
function DASH_BLOCKS_() {
  var mStart = 'EOMONTH(TODAY(),-1)+1';
  var mEnd   = 'EOMONTH(TODAY(),0)';
  var money  = '$#,##0';

  return [
    { title: 'THE MONTH — Luca\'s EOM targets', rows: [
      ['Revenue logged this month',
       '=SUMIFS(' + R_('revenue', 'Total earnings $') + ',' + R_('revenue', 'Week starting') +
       ',">="&' + mStart + ',' + R_('revenue', 'Week starting') + ',"<="&' + mEnd + ')',
       '=CFG_EOM_SALARY_REVENUE', 'target', money, 'Log each creator\'s week on Revenue & Targets. If it is genuinely behind, the gap is on Internal Promo Plan and the salary roster.'],
      ['New salaries signed this month',
       '=COUNTIFS(' + R_('creators', 'Signed') + ',">="&' + mStart + ',' +
       R_('creators', 'Signed') + ',"<="&' + mEnd + ')',
       '=CFG_NEW_SALARIES_TARGET', 'target', 'Set the Signed date on Creators as each one lands. Target is 3 a month.'],
      ['Salary creators live',
       '=COUNTIFS(' + R_('creators', 'Status') + ',"Live",' + R_('creators', 'Type') + ',"Salary")',
       '', '', 'Count of Status=Live and Type=Salary on Creators. Blank means those columns are not filled in yet.'],
      ['Weeks logged below the $10k/month pace (last 7 days)',
       '=COUNTIFS(' + R_('revenue', 'Above $10k floor') + ',"BELOW",' +
       R_('revenue', 'Week starting') + ',">="&TODAY()-7)', '', 'zero', 'Luca\'s floor: any managed account clears $10k. Below it, the account needs more promo slots or better scripts.'],
      ['Creators flagged for Luca',
       '=COUNTIF(' + R_('creators', 'Flag to Luca') + ',TRUE)', '', '', 'Tick \'Flag to Luca\' on Creators for anything not up to standard. He asked to be told early, not late.']
    ]},

    { title: 'MONEY — salaries owed', rows: [
      ['Due in the next 7 days ($)',
       '=SUMIFS(' + R_('payments', 'Amount $') + ',' + R_('payments', 'Status') + ',"Due",' +
       R_('payments', 'Pay date') + ',">="&TODAY(),' + R_('payments', 'Pay date') + ',"<="&TODAY()+7)',
       '', '', money, 'Cash you owe. UNCVRD CRM → Add this week\'s salary payments raises the rows.'],
      ['Payments due in the next 7 days',
       '=COUNTIFS(' + R_('payments', 'Status') + ',"Due",' + R_('payments', 'Pay date') +
       ',">="&TODAY(),' + R_('payments', 'Pay date') + ',"<="&TODAY()+7)', '', '', 'Pay Monday, or on content delivery if that is what she agreed.'],
      ['OVERDUE ($)',
       '=SUMIFS(' + R_('payments', 'Amount $') + ',' + R_('payments', 'Status') + ',"Due",' +
       R_('payments', 'Pay date') + ',"<"&TODAY())', '', '', money, 'Late money. Pay it or move the row to Held with a reason.'],
      ['Overdue payments',
       '=COUNTIFS(' + R_('payments', 'Status') + ',"Due",' + R_('payments', 'Pay date') +
       ',"<"&TODAY())', '', 'zero', 'Late money. Pay it or mark Held with a reason — a silent overdue salary is how models churn.'],
      ['Held — content not delivered',
       '=COUNTIF(' + R_('payments', 'Status') + ',"Held")', '', '', 'Chase the content, then release the payment.']
    ]},

    { title: 'ONBOARDING', rows: [
      ['In progress',      '=COUNTIF(' + R_('onboarding', 'Status') + ',"In progress")', '', '', 'Onboarding started. 22 boxes each on the Onboarding tab.'],
      ['Ready to go live', '=COUNTIF(' + R_('onboarding', 'Status') + ',"Ready")', '', '', 'All 22 boxes ticked — set Status=Live on Creators and add her to the promo rotation.'],
      ['Over the SLA',     '=COUNTIF(' + R_('onboarding', 'Status') + ',"OVER SLA")', '', 'zero', 'Past the onboarding SLA on Config. Open Onboarding and read the Blocker column.']
    ]},

    { title: 'CONTENT — shoots, QC, scripts', rows: [
      ['Shoots in the next 7 days',
       '=COUNTIFS(' + R_('shoots', 'Shoot date') + ',">="&TODAY(),' +
       R_('shoots', 'Shoot date') + ',"<="&TODAY()+7)', '', '', 'Confirm the location, send the content list, decide who is on set — you or Sophie.'],
      ['Filmed, content never arrived',
       '=COUNTIFS(' + R_('shoots', 'Shoot status') + ',"Filmed",' +
       R_('shoots', 'Content received') + ',"")', '', 'zero', 'She filmed and never sent it. Chase her, in DeepL if she needs it.'],
      ['Refilms outstanding',
       '=COUNTIF(' + R_('shoots', 'Refilm needed') + ',TRUE)', '', 'zero', 'Content that failed QC. If she does not refilm, we paid for nothing.'],
      ['Content awaiting your first QC',
       '=COUNTIF(' + R_('qc', 'Status') + ',"Awaiting QC")', '', 'zero', 'Check the scripts, tease and reels were filmed properly before anything goes to the editors.'],
      ['Sitting with editors beyond the SLA',
       '=COUNTIFS(' + R_('qc', 'Days in edit') + ',">"&CFG_QC_SLA_DAYS,' +
       R_('qc', 'Approved for use') + ',FALSE)', '', 'zero', 'Chase JAR and the editing team. Promos are waiting on this.'],
      ['Live scripts earning under $25 a send',
       '=COUNTIF(' + R_('scripts', 'vs $25 target') + ',"under")', '', 'zero', 'Reprice, add pics, or add teasers. Luca\'s benchmark is a $25 average.'],
      ['Scripts not rotated in 14 days',
       '=COUNTIF(' + R_('scripts', 'Days since rotated') + ',">14")', '', 'zero', 'Rotate them. Stale scripts on internally-swapped fans stop converting.'],
      ['Scripts still not personalised',
       '=COUNTIFS(' + R_('scripts', 'Creator') + ',"<>",' + R_('scripts', 'Personalised') + ',FALSE)',
       '', 'zero', 'These accounts get internally promoted, so they cannot run our stock proven scripts.']
    ]},

    { title: 'INTERNAL PROMO', rows: [
      ['Feed posts scheduled for today',
       '=' + ['1st Promote', '2nd Promote', '3rd Promote', '4th Promote'].map(function (h) {
         return 'COUNTIFS(' + R_('feed', 'Date') + ',TODAY(),' + R_('feed', h) + ',"<>")';
       }).join('+'),
       '=CFG_FEED_POSTS_PER_DAY*COUNTIF(' + R_('creators', 'Status') + ',"Live")', 'target', 'OnlyFans allows 3 posts a day; 2 of them are SFS. Posted 8h apart, that holds 3 live around the clock.'],
      ['Feed posts actually posted today',
       '=' + [1, 2, 3, 4].reduce(function (acc, n) {
         return acc.concat(POSTED_STATES.map(function (st) {
           return 'COUNTIFS(' + R_('feed', 'Date') + ',TODAY(),' +
                  R_('feed', 'Status ' + n) + ',"' + st + '")';
         }));
       }, []).join('+'),
       '=' + ['1st Promote', '2nd Promote', '3rd Promote', '4th Promote'].map(function (h) {
         return 'COUNTIFS(' + R_('feed', 'Date') + ',TODAY(),' + R_('feed', h) + ',"<>")';
       }).join('+'), 'target', 'Scheduled but not yet marked Posted. Set the Status as each one goes up.'],
      ['Promo story slots done today',
       '=COUNTIFS(' + R_('story', 'Date') + ',TODAY(),' + R_('story', 'Done 1') + ',TRUE)+' +
       'COUNTIFS(' + R_('story', 'Date') + ',TODAY(),' + R_('story', 'Done 2') + ',TRUE)',
       '=CFG_PROMO_STORIES_PER_DAY*COUNTIF(' + R_('creators', 'Status') + ',"Live")', 'target', '4 stories a day, 6h apart, so 4 are always live. 2 are SFS and 2 are her own content.'],
      ['MM promos scheduled for today',
       '=COUNTIFS(' + R_('mm', 'Date') + ',TODAY(),' + R_('mm', 'Promoted Creator') + ',"<>")',
       '=CFG_MM_PER_DAY*COUNTIF(' + R_('creators', 'Status') + ',"Live")', 'target', 'Three a day per account, one per shift. A shift with none is a gap in coverage, not a slow day.'],
      ['MM promos actually sent today',
       '=' + POSTED_STATES.map(function (st) {
         return 'COUNTIFS(' + R_('mm', 'Date') + ',TODAY(),' + R_('mm', 'Status') + ',"' + st + '")';
       }).join('+'),
       '=COUNTIF(' + R_('mm', 'Date') + ',TODAY())', 'target', 'Scheduled but not marked Posted. Set the Status as each one goes out.'],
      ['Scheduled promos with no tracking link',
       '=' + [['1st Promote', 'Link 1'], ['2nd Promote', 'Link 2'],
              ['3rd Promote', 'Link 3'], ['4th Promote', 'Link 4']].map(function (p) {
         return 'COUNTIFS(' + R_('feed', 'Date') + ',">="&TODAY(),' + R_('feed', p[0]) +
                ',"<>",' + R_('feed', p[1]) + ',"")';
       }).join('+') +
       '+COUNTIFS(' + R_('mm', 'Date') + ',">="&TODAY(),' + R_('mm', 'Promoted Creator') +
       ',"<>",' + R_('mm', 'Tracking Link') + ',"")',
       '', 'zero', 'The link auto-fills from Tracking Links. Blank means it was never created, so that promo will earn revenue nobody can attribute.'],
      ['Slots planned this week',
       '=SUMIFS(' + R_('promoPlan', 'Slots / day') + ',' + R_('promoPlan', 'Week starting') +
       ',">="&TODAY()-7)', '', '', 'Set on Internal Promo Plan, off last week\'s $/slot. Liz or Lance approve Monday or Tuesday.'],
      ['Creators planned for zero slots this week',
       '=COUNTIFS(' + R_('promoPlan', 'Week starting') + ',">="&TODAY()-7,' +
       R_('promoPlan', 'Slots / day') + ',0)', '', 'zero', 'Deliberate, or forgotten? Getting no promo at all is how an account quietly dies.'],
      ['Captions reused inside 7 days',
       '=COUNTIFS(' + R_('captions', 'Status') + ',"Active",' +
       R_('captions', 'Days since used') + ',"<7")', '', 'zero', 'Rotate them. Luca p.21 #7: never repeat the same stories or captions.'],
      ['Active captions in the bank',
       '=COUNTIF(' + R_('captions', 'Status') + ',"Active")', '=30', 'target', 'Keep adding. A thin bank forces repeats, and repeats look spammy.'],
      ['Pages promoted but not connected to the API',
       '=COUNTIFS(' + R_('creators', 'API tracked') + ',FALSE,' +
       R_('creators', 'Status') + ',"Live")', '', 'zero', 'These report $0 revenue no matter how they performed. Connect them at app.onlyfansapi.com — it is a wiring gap, not a result.']
    ]},

    { title: 'EXTERNAL SFS', rows: [
      ['Agreed but not yet posted',
       '=COUNTIFS(' + R_('external', 'Agreed') + ',"Agreed",' + R_('external', 'Our post date') + ',"")',
       '', '', 'A swap you agreed and never delivered. Post it or kill it.'],
      ['We posted, they did not reciprocate',
       '=COUNTIFS(' + R_('external', 'Our post date') + ',"<>",' +
       R_('external', 'Reciprocated') + ',FALSE)', '', 'zero', 'We gave traffic and got none back. Chase once, then mark the partner Dead.'],
      ['Tracking links still missing',
       '=COUNTIF(' + R_('links', 'Tracking link') + ',"n/a")', '', 'zero', 'Marked n/a on Tracking Links. Without a link the promo earns revenue nobody can attribute.']
    ]},

    { title: 'WHALES', rows: [
      ['Major whales ($3k+/month)', '=COUNTIF(' + R_('whales', 'Tier') + ',"MAJOR")', '', '', 'Luca p.8 #17: go above and beyond to hold these for a year or more.'],
      ['Outside the touchpoint SLA', '=COUNTIF(' + R_('whales', 'Touch SLA') + ',"LATE")', '', 'zero', 'Whales get a personalised message every morning plus non-sexual touchpoints. These have not had one.'],
      ['Transfers in progress',
       '=COUNTIF(' + R_('whales', 'Transfer status') + ',"Warming")+COUNTIF(' +
       R_('whales', 'Transfer status') + ',"Pitching")', '', '', 'Whales being warmed or pitched onto a salary account. The models are not told.'],
      ['Moved onto a salary account this month',
       '=COUNTIFS(' + R_('whales', 'Transferred on') + ',">="&' + mStart + ',' +
       R_('whales', 'Transferred on') + ',"<="&' + mEnd + ')', '', '', 'Luca p.2 #6. Check the 30-day spend after the move actually held up.']
    ]},

    { title: 'FLAGS — what Luca asked to hear about', rows: [
      ['Open blockers',
       '=COUNTIFS(' + R_('flags', 'Severity') + ',"Blocker",' + R_('flags', 'Status') + ',"Open")',
       '', 'zero', 'Nothing else on this dashboard matters more. Fix or escalate today.'],
      ['Open, high severity',
       '=COUNTIFS(' + R_('flags', 'Severity') + ',"High",' + R_('flags', 'Status') + ',"Open")+' +
       'COUNTIFS(' + R_('flags', 'Severity') + ',"High",' + R_('flags', 'Status') + ',"In progress")+' +
       'COUNTIFS(' + R_('flags', 'Severity') + ',"High",' + R_('flags', 'Status') + ',"Blocked")',
       '', '', 'Work these down weekly. Seeded from the August doc.'],
      ['Raised to Luca, still open',
       '=COUNTIFS(' + R_('flags', 'Flag to Luca') + ',TRUE,' + R_('flags', 'Status') + ',"Open")',
       '', '', 'You told him. Make sure it closes, or he will ask.'],
      ['Oldest open item (days)',
       '=IFERROR(MAX(FILTER(' + R_('flags', 'Days open') + ',' + R_('flags', 'Status') + '<>"Done",' +
       R_('flags', 'Status') + '<>"Dropped")),0)', '', '', 'If this keeps climbing, the list is a graveyard rather than a queue.'],
      ['Tests running',
       '=COUNTIF(' + R_('tests', 'Status') + ',"Running")', '=2', 'target', 'Luca p.18 lists seven things to test. Nothing running means nothing improving.']
    ]}
  ];
}

// ── Start Here ──────────────────────────────────────────────────────────────

function buildStartHere_() {
  var sh = sheet_(TABS.start.name);
  ensureSize_(sh, 80, 6);
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.setHiddenGridlines(true);

  var L = [];
  var h  = function (t) { L.push([t, '', 'H']); };
  var p  = function (t) { L.push([t, '', 'P']); };
  var kv = function (a, b) { L.push([a, b, 'KV']); };

  h('UNCVRD — Salary Creator CRM');
  p('Everything in your remit that is not chatting, in one file. Chat QA, chatter hiring and the twenty chatting rules are deliberately not here.');
  p('');

  h('First run — three things, once');
  kv('1', 'Open Weekly AD Stats and SFS Weekly Report. Each shows a #REF! with an "Allow access" button. Click it. Once per source file, forever.');
  kv('2', 'Open Creators and set Status, Type and Tier. Nothing in the source documents says who is on salary versus managed, so those are blank on purpose — the dashboard is wrong until you fill them.');
  kv('3', 'UNCVRD CRM → Install reminders. Monday 06:00 you get the salaries due; every morning 07:00 you get what is late.');
  p('');

  h('Daily');
  kv('Dashboard', 'Open it first. Anything red in the right-hand column is a decision you owe someone today.');
  kv('FEED Promo SFS Internal', 'Two posts a day per account, one-day expire — the same shape the team already fills in. Menu → Generate promo week lays out seven days and rotates the pairings so nobody promotes themselves twice.');
  kv('Story Promo Schedule', 'Two slots a day, up for 24 hours. Tick Done as they go up.');
  kv('MM Promo Schedule', 'One row per mass DM, by shift.');
  kv('Content QC', 'Content in, content out. Nothing reaches a promo unchecked.');
  kv('Whales', 'Touchpoint SLA and the transfers you are working.');
  p('');

  h('Weekly');
  kv('Internal Promo Plan', 'Set next week\'s slots off last week\'s $/slot. Liz and Lance approve Monday or Tuesday.');
  kv('Salary Payments', 'Monday. Or on content delivery, if that is what she agreed.');
  kv('Revenue & Targets', 'One row per creator per week. Everything on the dashboard\'s money block comes from here.');
  kv('Scripts', 'What is tired, what needs repricing, what is running on two accounts that share fans.');
  kv('Improvements & Flags', 'Anything still open and high goes to Luca. He asked, in capitals.');
  p('');

  h('As it happens');
  kv('Onboarding', 'Twenty-two boxes per new salary. Drive, content, banking, account, scripts.');
  kv('Shoots', 'Book it, decide who is on set, chase the content.');
  kv('Caption Bank', 'Add captions constantly. Amber means you used it too recently to use it again.');
  kv('Tests', 'One row per test, one winner, then roll it out.');
  kv('Market Research', 'What other pages do. Good ideas become tests.');
  kv('External SFS', 'Tom huzz, Dan, and the five swaps Luca asked to be set up.');
  kv('Tracking Links', 'The link lives on the PROMOTED creator\'s page; the code says who sent the traffic. Use the lookup on the right.');
  p('');

  h('Read-only');
  p('Weekly AD Stats, ADs Summary, SFS Weekly Report and SFS Summary mirror two other files. Edit the source, not the mirror.');
  p('');

  h('What updates itself, and what does not');
  kv('Every Monday 05:00', 'The ad window rolls to the week that just ended, the week\'s salary rows are raised, and next week\'s promo plan is opened. UNCVRD CRM → Roll everything to this week does it on demand.');
  kv('Ad tabs — yes', 'Weekly AD Stats and ADs Summary read the ad sheet\'s raw Data and Cohort tabs, which the server keeps current. These are genuinely live.');
  kv('SFS tabs — yes, now', 'Computed here from the OnlyFans API: every tracking link on each creator\'s page, this week being the cumulative total minus Monday\'s baseline. The generated export that used to feed them, and that nobody was updating, is out of the chain entirely.');
  kv('Unmapped revenue', 'A link the API returns that Tracking Links has no row for. It is shown in its own column rather than guessed into internal or paid — real money nobody can attribute yet. Add the link and it moves to the right column.');
  p('');

  h('Two things that are broken upstream, not here');
  kv('Promo schedule file — SOLVED', 'The schedules used to live in an uploaded .xlsx that no formula and no script could read. They now live in this file, on the three promo tabs. Copy any rows you still need out of the old one, then stop editing it — two copies of a schedule is worse than one.');
  kv('Untracked pages', 'Only 8 pages are connected in app.onlyfansapi.com. The rest report $0 promo revenue regardless of how they actually did. That is a wiring gap, not a result — the dashboard counts them for you.');
  p('');

  h('The onboarding boxes, in Luca\'s words');
  onboardingNotes_().forEach(function (n) { kv(n[0], n[1]); });
  p('');

  h('Rebuilding');
  p('UNCVRD CRM → Rebuild is safe. It rewrites headers, formats, dropdowns and formulas, and never touches a row you have typed into. Seed rows are only written into a tab that is completely empty.');

  var r = 1;
  L.forEach(function (line) {
    if (line[2] === 'H') {
      sh.getRange(r, 1, 1, 3).merge();
      sh.getRange(r, 1).setValue(line[0])
        .setFontSize(r === 1 ? 18 : 12).setFontWeight('bold')
        .setFontColor(r === 1 ? C.brandTx : C.brand);
      if (r === 1) sh.getRange(r, 1, 1, 3).setBackground(C.brand);
      sh.setRowHeight(r, r === 1 ? 34 : 26);
    } else if (line[2] === 'KV') {
      sh.getRange(r, 1).setValue(line[0]).setFontWeight('bold').setVerticalAlignment('top');
      sh.getRange(r, 2, 1, 2).merge();
      sh.getRange(r, 2).setValue(line[1]).setWrap(true).setVerticalAlignment('top');
    } else {
      sh.getRange(r, 1, 1, 3).merge();
      sh.getRange(r, 1).setValue(line[0]).setWrap(true).setFontColor(C.help);
    }
    r++;
  });

  sh.setColumnWidth(1, 220);
  sh.setColumnWidth(2, 620);
  sh.setColumnWidth(3, 40);
  sh.setTabColor(SECTION.control);
}

// ── Plumbing ────────────────────────────────────────────────────────────────

function ss_() { return SpreadsheetApp.getActive(); }

/**
 * Get or create. Matches on the trimmed name first, so the tab that shipped as
 * 'FEED Promo SFS Internal ' is adopted and renamed rather than duplicated.
 */
function sheet_(name) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  var want = name.trim().toLowerCase();
  var hit = ss.getSheets().filter(function (s) {
    return s.getName().trim().toLowerCase() === want;
  })[0];
  if (hit) { hit.setName(name); return hit; }
  return ss.insertSheet(name);
}

function headerIndex_(def, header) {
  var i = def.headers.indexOf(header);
  if (i < 0) throw new Error('No column "' + header + '" on ' + def.name);
  return i + 1;
}

/** An absolute A-column range for a tab, built from the header name. */
function R_(tabKey, header) {
  var def = TABS[tabKey];
  var c = colA1_(headerIndex_(def, header));
  return "'" + def.name + "'!$" + c + '$' + FIRST_ROW + ':$' + c;
}

function colA1_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
}

/**
 * Last row with actual content, judged by the first column.
 *
 * NOT getLastRow(). The builder writes calc formulas into all DATA_ROWS rows,
 * and a formula counts as content even when it evaluates to "" — so an empty
 * Caption Bank reports its last row as 253. Appending after that would leave a
 * 250-row hole and every count on the tab would read past it.
 */
function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last < FIRST_ROW) return HEADER_ROW;
  var vals = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() !== '') return FIRST_ROW + i;
  }
  return HEADER_ROW;
}

/**
 * How far down a tab's rules have to reach.
 *
 * DATA_ROWS is the floor, not the ceiling. A tab that already runs past it —
 * 252 captions, an append that landed low — needs its formats, dropdowns,
 * checkboxes, calculated columns and colours to follow the data, or those rows
 * hold real content while sitting outside every rule the build applies. The
 * extra 20 is headroom so the next few rows you type are already live.
 */
function dataSpan_(sh) {
  return Math.max(DATA_ROWS, lastDataRow_(sh) - HEADER_ROW + 20);
}

function ensureSize_(sh, rows, cols) {
  if (sh.getMaxRows()    < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  sh.showColumns(1, Math.min(cols, sh.getMaxColumns()));
}

/**
 * Every creator we know about must exist on Creators, because the promo
 * dropdowns are built from that column and a name missing there cannot be
 * scheduled at all. Append-only and logged — it never edits or removes a row.
 *
 * Deliberately the WHOLE roster, not just the salary five: feed, story and MM
 * promo run across everyone. Only the ad tabs are restricted to the accounts
 * the ad sheet carries, and those read a different list.
 */
function ensureRoster_() {
  var def = TABS.creators, sh = sheet_(def.name);
  var last = sh.getLastRow();
  var have = {};
  if (last >= FIRST_ROW) {
    // "Also known as" counts as having her. A renamed creator is missing under
    // her OLD name by definition, and matching on the Creator column alone made
    // a rebuild resurrect every name the seed still remembers — two ghosts back
    // on the roster, two extra plan rows, and a whole week generated for 25
    // accounts instead of 23.
    var aka = headerIndex_(def, 'Also known as');
    var wide = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, Math.max(1, aka)).getValues();
    wide.forEach(function (r) {
      [String(r[0] || ''), aka ? String(r[aka - 1] || '') : ''].forEach(function (v) {
        v.split(/\s*\/\s*|\s*,\s*/).forEach(function (part) {
          var n = part.trim().toLowerCase();
          if (n) have[n] = true;
        });
        var whole = v.trim().toLowerCase();
        if (whole) have[whole] = true;
      });
    });
  }

  var add = seedCreators_().filter(function (c) { return !have[c[0].toLowerCase()]; });
  if (!add.length) return;

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  var rows = add.map(function (c) {
    var row = new Array(def.headers.length).fill('');
    (def.checks || []).forEach(function (h) { row[headerIndex_(def, h) - 1] = false; });
    row[headerIndex_(def, 'Creator') - 1]     = c[0];
    row[headerIndex_(def, 'OF handle') - 1]   = c[1];
    row[headerIndex_(def, 'OF page') - 1]     = c[1] ? 'https://onlyfans.com/' + c[1] : '';
    row[headerIndex_(def, 'API tracked') - 1] = c[2];
    row[headerIndex_(def, 'Notes') - 1]       = c[3];
    return row;
  });
  if (at + rows.length > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), at + rows.length - sh.getMaxRows() + 20);
  }
  sh.getRange(at, 1, rows.length, def.headers.length).setValues(rows);
  (def.checks || []).forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).insertCheckboxes();
  });
  log_('ensureRoster', 'added ' + rows.length + ' missing creator(s): ' +
       add.map(function (c) { return c[0]; }).join(', '));
}

/**
 * Make the Creators tab agree with the salary roster Christos gave.
 *
 * Appends anyone missing, and fills Also known as / Ad sheet name / Type ONLY
 * where the cell is blank — so a correction typed here always beats the code.
 * Everything it does is logged.
 */
/**
 * Fill blank Status and Type on the roster.
 *
 * Status was the hole in this build: ensureRoster_ writes the name, handle and
 * API flag, ensureSalaryRoster_ adds Type — and NOTHING ever wrote Status. It
 * is required reading for liveCreators_, every promo target, the dashboard
 * counts and the caption generator, so a freshly built CRM looked completely
 * empty and the only clue was "no creator has Status = Live".
 *
 * Only ever fills blanks — anything a human has already set is left alone.
 *
 * Everyone on the roster goes Live. The first version gated that on API access
 * and it was wrong: only nine of fourteen accounts got a promo schedule, because
 * Christos's rule is that EVERY creator does feed and SFS promo and only the
 * ad and money features need an OnlyFans connection. Sophie, Maylee, Charlotte,
 * Emily and Macy all show up as promoters in the live tracking-link data — they
 * are as active as anyone, they just have no API key pointed at their page.
 *
 * Type is where the API flag actually belongs: Salary for the salary roster,
 * Managed for accounts we hold API access to, Partner for the rest.
 *
 * Returns {status: n, type: n, blank: [names]} so callers can report it.
 */
function fillRosterDefaults_() {
  var def = TABS.creators, sh = sheet_(def.name);
  var last = sh.getLastRow();
  if (last < FIRST_ROW) return { status: 0, type: 0, blank: [] };

  var vals = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();
  var iName = headerIndex_(def, 'Creator') - 1;
  var iStat = headerIndex_(def, 'Status') - 1;
  var iType = headerIndex_(def, 'Type') - 1;
  var iApi  = headerIndex_(def, 'API tracked') - 1;

  var salary = {};
  salaryRoster_().forEach(function (r) { salary[r[0].toLowerCase()] = 1; });

  var nStat = 0, nType = 0, blank = [];
  vals.forEach(function (row, i) {
    var name = String(row[iName] || '').trim();
    if (!name) return;
    var api = row[iApi] === true;

    if (String(row[iStat] || '').trim() === '') {
      sh.getRange(FIRST_ROW + i, iStat + 1).setValue('Live');
      nStat++;
      if (!api) blank.push(name);        // live, but nothing measurable on her
    }

    if (String(row[iType] || '').trim() === '') {
      var t = salary[name.toLowerCase()] ? 'Salary' : (api ? 'Managed' : 'Partner');
      sh.getRange(FIRST_ROW + i, iType + 1).setValue(t);
      nType++;
    }
  });

  log_('fillRosterDefaults', nStat + ' Status, ' + nType + ' Type filled; ' +
       blank.length + ' still blank');
  return { status: nStat, type: nType, blank: blank };
}

/** Menu version — says what it did and what a human still has to decide. */
function fillRosterDefaults() {
  var r = fillRosterDefaults_();
  alert_('Roster defaults',
    'Status set on ' + r.status + ' creator(s), Type set on ' + r.type + '.\n\n' +
    'Only blank cells were touched — anything you had already set is untouched.\n\n' +
    'Everyone on the roster is now Live, because every creator does feed and SFS ' +
    'promo — the OnlyFans connection only gates the ad and money features.\n\n' +
    (r.blank.length
      ? 'These are Live and will be scheduled, but have no OnlyFans page connected, ' +
        'so their revenue cannot be measured:\n• ' + r.blank.join('\n• ')
      : 'Every creator has a connected OnlyFans page.'));
  ss_().setActiveSheet(sheet_(TABS.creators.name));
}

function ensureSalaryRoster_() {
  var def = TABS.creators, sh = sheet_(def.name);
  var col = function (h) { return headerIndex_(def, h); };
  var last = sh.getLastRow();
  var rows = last >= FIRST_ROW
    ? sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues() : [];
  var indexOfName = function (name) {
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === name.toLowerCase()) return FIRST_ROW + i;
    }
    return 0;
  };

  var added = [], filled = [];
  salaryRoster_().forEach(function (sr) {
    var name = sr[0], aka = sr[1], adName = sr[2], api = sr[3], note = sr[4], handle = sr[5] || '';
    var r = indexOfName(name);

    if (!r) {
      r = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
      var row = new Array(def.headers.length).fill('');
      (def.checks || []).forEach(function (h) { row[col(h) - 1] = false; });
      row[0] = name;
      sh.getRange(r, 1, 1, def.headers.length).setValues([row]);
      (def.checks || []).forEach(function (h) {
        sh.getRange(r, col(h)).insertCheckboxes();
      });
      added.push(name);
      rows.push(row);
    }

    var set = function (header, value) {
      if (value === '' || value === null) return;
      var cell = sh.getRange(r, col(header));
      if (String(cell.getValue()).trim() !== '') return;      // never overwrite
      cell.setValue(value);
      filled.push(name + '.' + header);
    };
    set('Also known as', aka);
    set('Ad sheet name', adName);
    set('OF handle', handle);
    set('Type', 'Salary');
    set('Notes', note);
    if (api) {
      var t = sh.getRange(r, col('API tracked'));
      if (t.getValue() !== true) { t.setValue(true); filled.push(name + '.API tracked'); }
    }
  });

  if (added.length || filled.length) {
    log_('ensureSalaryRoster',
         (added.length ? 'added ' + added.join(', ') + '. ' : '') +
         (filled.length ? 'filled ' + filled.length + ' blank cell(s): ' + filled.join(', ') : ''));
  }
}

/**
 * Append any known tracking link the sheet does not have yet, keyed on
 * promoted + promoter. Append-only: it never edits or removes a row anyone has
 * touched, and it logs exactly what it added so nothing appears by magic.
 */
function ensureLinks_() {
  var def = TABS.links, sh = sheet_(def.name);
  var iP = headerIndex_(def, 'Promoted creator') - 1;
  var iR = headerIndex_(def, 'Promoter / source') - 1;
  var key = function (a, b) {
    return String(a).trim().toLowerCase() + '|' + String(b).trim().toLowerCase();
  };

  var iL = headerIndex_(def, 'Tracking link') - 1;
  var have = {}, urls = {};
  var last = sh.getLastRow();
  if (last >= FIRST_ROW) {
    sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues()
      .forEach(function (r) {
        if (r[iP]) have[key(r[iP], r[iR])] = true;
        var u = String(r[iL] || '').trim().toLowerCase();
        if (u && u !== 'n/a') urls[u] = true;      // a real URL is only ever added once
      });
  }

  var add = seedLinks_().filter(function (r) {
    var u = String(r[3] || '').trim().toLowerCase();
    if (u && u !== 'n/a' && urls[u]) return false;
    return !have[key(r[0], r[1])];
  });
  if (!add.length) return;

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  sh.getRange(at, 1, add.length, def.headers.length).setValues(add);
  sh.getRange(at, headerIndex_(def, 'Active'), add.length, 1).insertCheckboxes();
  log_('ensureLinks', 'added ' + add.length + ': ' +
       add.map(function (r) { return r[0] + ' ← ' + r[1]; }).join(', '));
}

/** Drop tabs we no longer build — but never silently drop someone's typing. */
function retireTabs_() {
  var ss = ss_();
  RETIRED_TABS.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var used = sh.getLastRow() > HEADER_ROW &&
      sh.getRange(FIRST_ROW, 1, sh.getLastRow() - HEADER_ROW, sh.getLastColumn())
        .getValues().some(function (row) {
          return row.some(function (v) { return v !== '' && v !== null && v !== false; });
        });
    if (used) {
      sh.hideSheet();
      sh.setTabColor('#9aa0a6');
      log_('retireTabs', name + ' has typed rows — hidden, not deleted');
    } else {
      ss.deleteSheet(sh);
      log_('retireTabs', name + ' was empty — deleted');
    }
  });
}

function orderTabs_() {
  var ss = ss_();
  TAB_ORDER.forEach(function (key, i) {
    var sh = ss.getSheetByName(TABS[key].name);
    if (!sh) return;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(i + 1);
  });
}

function ensureLog_() {
  var ss = ss_();
  var sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(LOG_SHEET);
    sh.getRange(1, 1, 1, 3).setValues([['When', 'What', 'Detail']]).setFontWeight('bold');
    sh.setColumnWidth(1, 160); sh.setColumnWidth(2, 160); sh.setColumnWidth(3, 600);
  }
  sh.hideSheet();
  return sh;
}

function log_(what, detail) {
  try {
    var sh = ensureLog_();
    sh.insertRowAfter(1);
    sh.getRange(2, 1, 1, 3).setValues([[new Date(), what, String(detail)]]);
    sh.getRange(2, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  } catch (e) { /* never let logging break a run */ }
}
