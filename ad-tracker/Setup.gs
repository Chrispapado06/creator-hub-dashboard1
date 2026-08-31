/**
 * UNCVRD Ad Tracker — Setup.gs
 * ---------------------------------------------------------------------------
 * Builds the whole tracker from scratch: every tab, header, formula and
 * conditional-format rule. Idempotent — safe to re-run; it rebuilds each tab.
 *
 *   ▸ Run buildTracker() once to scaffold the Sheet.
 *
 * The discipline that makes the join work: name each OF tracking link EXACTLY
 * the same as the Variant you log (Daily Log col F == col G).
 * ---------------------------------------------------------------------------
 */

function buildTracker() {
  const book = ss();
  buildSettings_(book);
  buildDailyLog_(book);
  buildSplitTests_(book);
  buildCreatorDashboard_(book);
  buildPlatformSummary_(book);
  ensureSnapshotTab_();
  reorderTabs_(book);
  // Drop the default empty "Sheet1" a brand-new spreadsheet ships with.
  const leftover = book.getSheetByName('Sheet1');
  if (leftover && leftover.getLastRow() === 0) book.deleteSheet(leftover);
  toast('Tracker built. Next: set OFAPI_KEY, run listLinks(), then installDailyTrigger().', 'Setup');
}

// ── Settings ───────────────────────────────────────────────────────────────
function buildSettings_(book) {
  const s = resetSheet_(book, TAB.SETTINGS);
  s.getRange('A1').setValue('SETTINGS — edit the yellow cells').setFontWeight('bold').setFontSize(12);

  const rows = [
    ['Target ROAS (revenue ÷ spend)', 2.5],
    ['Target CAC ($ per new fan)', 15],
    ['Target LTV ($ per new fan)', 40],
    ['', ''],
    ['SCALE when ROAS ≥', 2.0],
    ['CUT when ROAS <', 1.0],
    ['(KEEP is everything in between)', ''],
  ];
  s.getRange(2, 1, rows.length, 2).setValues(rows);
  // Yellow input cells: B2:B4, B6:B7
  s.getRangeList(['B2:B4', 'B6:B7']).setBackground('#fff2cc').setFontWeight('bold');
  s.getRange('B2:B4').setNumberFormat('0.0');
  s.getRange('B6:B7').setNumberFormat('0.0');

  // Named thresholds the other tabs reference — keep cell refs stable:
  //   B5 unused, B6 = SCALE threshold, B7 = CUT threshold.
  // (Verdict formulas use Settings!$B$6 / $B$7.)

  // Per-creator monthly salary table (drives Creator Dashboard net profit).
  s.getRange('D1').setValue('CREATOR SALARIES').setFontWeight('bold');
  s.getRange('D2:E2').setValues([['Creator', 'Salary ($/mo)']]).setFontWeight('bold');
  const salaries = [
    ['Marissa', 2000],
    ['Emma', 2000],
    ['Maylee', 2000],
  ];
  s.getRange(3, 4, salaries.length, 2).setValues(salaries);
  s.getRange('D3:E50').setBackground('#fff2cc');
  s.getRange('E3:E50').setNumberFormat('$#,##0');

  s.setColumnWidth(1, 240);
  s.setColumnWidth(4, 160);
  s.getRange('A1:E1').setFontColor('#1f1f1f');
  s.setFrozenRows(1);
}

// ── Daily Log ────────────────────────────────────────────────────────────
function buildDailyLog_(book) {
  const s = resetSheet_(book, TAB.LOG);
  s.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
    .setFontWeight('bold').setBackground('#1a1a1a').setFontColor('#ffffff');
  s.setFrozenRows(1);

  // Computed columns L–R: one ARRAYFORMULA each in row 2; they spill down the
  // whole column and recompute as the OF/Meta pulls fill H–K. Guarded on Date
  // so empty rows stay blank.
  // IFERROR wraps every division so zero/blank rows stay blank instead of
  // leaking #DIV/0! through ARRAYFORMULA's both-branch evaluation.
  const A = "$A$2:$A", H = "$H$2:$H", I = "$I$2:$I",
        J = "$J$2:$J", K = "$K$2:$K";
  const ROAS_EXPR = 'IFERROR(' + K + '/' + H + ',0)';
  const af = {
    CPC: '=ARRAYFORMULA(IF(' + A + '="","",IFERROR(' + H + '/' + I + ',"")))',
    CAC: '=ARRAYFORMULA(IF(' + A + '="","",IFERROR(' + H + '/' + J + ',"")))',
    CLICK_SUB: '=ARRAYFORMULA(IF(' + A + '="","",IFERROR(' + J + '/' + I + ',"")))',
    LTV: '=ARRAYFORMULA(IF(' + A + '="","",IFERROR(' + K + '/' + J + ',"")))',
    ROAS: '=ARRAYFORMULA(IF(' + A + '="","",IF(' + H + '>0,' + ROAS_EXPR + ',"")))',
    PROFIT: '=ARRAYFORMULA(IF(' + A + '="","",' + K + '-' + H + '))',
    VERDICT: '=ARRAYFORMULA(IF(' + A + '="","",IF(' + H + '=0,"",' +
             'IF(' + ROAS_EXPR + '>=Settings!$B$6,"SCALE",' +
             'IF(' + ROAS_EXPR + '<Settings!$B$7,"CUT","KEEP")))))',
  };
  s.getRange(2, COL.CPC).setFormula(af.CPC);
  s.getRange(2, COL.CAC).setFormula(af.CAC);
  s.getRange(2, COL.CLICK_SUB).setFormula(af.CLICK_SUB);
  s.getRange(2, COL.LTV).setFormula(af.LTV);
  s.getRange(2, COL.ROAS).setFormula(af.ROAS);
  s.getRange(2, COL.PROFIT).setFormula(af.PROFIT);
  s.getRange(2, COL.VERDICT).setFormula(af.VERDICT);

  // Number formats on the value + computed columns.
  s.getRange(2, COL.SPEND, s.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  s.getRange(2, COL.REVENUE, s.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  s.getRange(2, COL.CPC, s.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  s.getRange(2, COL.CAC, s.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  s.getRange(2, COL.LTV, s.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  s.getRange(2, COL.PROFIT, s.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  s.getRange(2, COL.CLICK_SUB, s.getMaxRows() - 1, 1).setNumberFormat('0.0%');
  s.getRange(2, COL.ROAS, s.getMaxRows() - 1, 1).setNumberFormat('0.00"x"');
  s.getRange(2, COL.DATE, s.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');

  // Platform dropdown on col B.
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(PLATFORMS, true).setAllowInvalid(true).build();
  s.getRange(2, COL.PLATFORM, s.getMaxRows() - 1, 1).setDataValidation(rule);

  // Verdict colour coding.
  addVerdictFormatting_(s, COL.VERDICT);

  // Three EXAMPLE rows (delete before going live — marked in Campaign col).
  const today = todayStr();
  const examples = [
    [today, 'OnlyFinder', 'Marissa', 'EXAMPLE — delete', 'profile pic A', 'marissa-pic-a', 'marissa-pic-a', 40, 120, 9, 110],
    [today, 'Meta',       'Emma',    'EXAMPLE — delete', 'hook: shy',     'emma-hook-shy', 'emma-hook-shy', 60, 80,  6, 70],
    [today, 'OnlyFinder', 'Maylee',  'EXAMPLE — delete', 'keyword: gym',  'maylee-gym',    'maylee-gym',    25, 90,  11, 150],
  ];
  s.getRange(2, 1, examples.length, examples[0].length).setValues(examples)
    .setBackground('#fde9e7'); // pink tint = example

  // Column widths
  s.setColumnWidth(COL.CAMPAIGN, 150);
  s.setColumnWidth(COL.TEST, 150);
  s.setColumnWidth(COL.VARIANT, 140);
  s.setColumnWidth(COL.LINK, 140);
}

// ── Split Tests ──────────────────────────────────────────────────────────
function buildSplitTests_(book) {
  const s = resetSheet_(book, TAB.SPLIT);
  s.getRange('A1').setValue('SPLIT TESTS').setFontWeight('bold').setFontSize(12);

  // Single-variant lookup box.
  s.getRange('A3').setValue('Type a variant name →').setFontWeight('bold');
  s.getRange('B3').setBackground('#fff2cc').setFontWeight('bold'); // input
  const L = "'" + TAB.LOG + "'!";
  const pairs = [
    ['Spend',        '=SUMIF(' + L + '$F:$F,$B$3,' + L + '$H:$H)'],
    ['Clicks',       '=SUMIF(' + L + '$F:$F,$B$3,' + L + '$I:$I)'],
    ['New Fans',     '=SUMIF(' + L + '$F:$F,$B$3,' + L + '$J:$J)'],
    ['Revenue',      '=SUMIF(' + L + '$F:$F,$B$3,' + L + '$K:$K)'],
    ['CPC',          '=IF(B5>0,B4/B5,"")'],
    ['CAC',          '=IF(B6>0,B4/B6,"")'],
    ['Click→Sub %',  '=IF(B5>0,B6/B5,"")'],
    ['LTV',          '=IF(B6>0,B7/B6,"")'],
    ['ROAS',         '=IF(B4>0,B7/B4,"")'],
    ['Profit',       '=B7-B4'],
    ['Verdict',      '=IF(B4=0,"no data for that variant",IF(B7/B4>=Settings!$B$6,"SCALE — more of this",IF(B7/B4<Settings!$B$7,"CUT — less of this","KEEP")))'],
  ];
  for (let i = 0; i < pairs.length; i++) {
    const r = 4 + i;
    s.getRange(r, 1).setValue(pairs[i][0]).setFontWeight('bold');
    s.getRange(r, 2).setFormula(pairs[i][1]);
  }
  s.getRange('B4').setNumberFormat('$#,##0.00');    // Spend
  s.getRange('B7').setNumberFormat('$#,##0.00');    // Revenue
  s.getRange('B8:B9').setNumberFormat('$#,##0.00'); // CPC / CAC
  s.getRange('B10').setNumberFormat('0.0%');        // Click→Sub %
  s.getRange('B11').setNumberFormat('$#,##0.00');   // LTV
  s.getRange('B13').setNumberFormat('$#,##0.00');   // Profit
  s.getRange('B12').setNumberFormat('0.00"x"');     // ROAS

  // Auto table: every variant in the log, aggregated, with a verdict.
  s.getRange('D3').setValue('ALL VARIANTS').setFontWeight('bold');
  const headers = ['Variant', 'Creator', 'Spend', 'Clicks', 'New Fans', 'Revenue', 'CAC', 'ROAS', 'Profit', 'Verdict'];
  s.getRange(4, 4, 1, headers.length).setValues([headers]).setFontWeight('bold')
    .setBackground('#1a1a1a').setFontColor('#ffffff');

  // D5 spills the distinct variant list; the metric columns array-fill beside it.
  const VAR = "'" + TAB.LOG + "'!$F$2:$F";
  s.getRange('D5').setFormula(
    '=IFERROR(SORT(UNIQUE(FILTER(' + VAR + ',' + VAR + '<>""))),"")');
  const D = '$D$5:$D'; // variant list
  const sumif = function (col) {
    return 'SUMIF(' + L + '$F:$F,' + D + ',' + L + '$' + col + ':$' + col + ')';
  };
  // Creator: first creator seen for that variant.
  s.getRange('E5').setFormula(
    '=ARRAYFORMULA(IF(' + D + '="","",IFERROR(VLOOKUP(' + D + ',{' + VAR + ',' + L + '$C$2:$C},2,FALSE),"")))');
  s.getRange('F5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",' + sumif('H') + '))'); // Spend
  s.getRange('G5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",' + sumif('I') + '))'); // Clicks
  s.getRange('H5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",' + sumif('J') + '))'); // New Fans
  s.getRange('I5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",' + sumif('K') + '))'); // Revenue
  s.getRange('J5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",IFERROR(F5:F/H5:H,"")))'); // CAC
  s.getRange('K5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",IF(F5:F>0,IFERROR(I5:I/F5:F,0),"")))'); // ROAS
  s.getRange('L5').setFormula('=ARRAYFORMULA(IF(' + D + '="","",I5:I-F5:F))'); // Profit
  s.getRange('M5').setFormula(
    '=ARRAYFORMULA(IF(' + D + '="","",IF(F5:F=0,"",' +
    'IF(IFERROR(I5:I/F5:F,0)>=Settings!$B$6,"SCALE",IF(IFERROR(I5:I/F5:F,0)<Settings!$B$7,"CUT","KEEP")))))');

  s.getRange('F5:F').setNumberFormat('$#,##0.00');
  s.getRange('I5:I').setNumberFormat('$#,##0.00');
  s.getRange('J5:J').setNumberFormat('$#,##0.00');
  s.getRange('L5:L').setNumberFormat('$#,##0.00');
  s.getRange('K5:K').setNumberFormat('0.00"x"');
  addVerdictFormatting_(s, 13); // col M
  s.setColumnWidth(1, 130);
  s.setColumnWidth(4, 140);
}

// ── Creator Dashboard ─────────────────────────────────────────────────────
function buildCreatorDashboard_(book) {
  const s = resetSheet_(book, TAB.CREATORS);
  s.getRange('A1').setValue('CREATOR DASHBOARD').setFontWeight('bold').setFontSize(12);
  const headers = ['Creator', 'Spend', 'New Fans', 'Revenue', 'CAC', 'LTV', 'ROAS', 'Ad Profit', 'Salary', 'Net Profit'];
  s.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
    .setBackground('#1a1a1a').setFontColor('#ffffff');
  s.setFrozenRows(2);

  const L = "'" + TAB.LOG + "'!";
  const C = "'" + TAB.LOG + "'!$C$2:$C";
  // A3 spills the distinct creator list from the log.
  s.getRange('A3').setFormula(
    '=IFERROR(SORT(UNIQUE(FILTER(' + C + ',' + C + '<>""))),"")');
  const A = '$A$3:$A';
  const sumif = function (col) {
    return 'SUMIF(' + L + '$C:$C,' + A + ',' + L + '$' + col + ':$' + col + ')';
  };
  s.getRange('B3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",' + sumif('H') + '))'); // Spend
  s.getRange('C3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",' + sumif('J') + '))'); // New Fans
  s.getRange('D3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",' + sumif('K') + '))'); // Revenue
  s.getRange('E3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",IFERROR(B3:B/C3:C,"")))'); // CAC
  s.getRange('F3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",IFERROR(D3:D/C3:C,"")))'); // LTV
  s.getRange('G3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",IF(B3:B>0,IFERROR(D3:D/B3:B,0),"")))'); // ROAS
  s.getRange('H3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",D3:D-B3:B))'); // Ad Profit
  s.getRange('I3').setFormula(
    '=ARRAYFORMULA(IF(' + A + '="","",IFERROR(VLOOKUP(' + A + ',Settings!$D:$E,2,FALSE),0)))'); // Salary
  s.getRange('J3').setFormula('=ARRAYFORMULA(IF(' + A + '="","",H3:H-I3:I))'); // Net Profit

  s.getRangeList(['B3:D', 'E3:F', 'H3:J']).setNumberFormat('$#,##0.00');
  s.getRange('G3:G').setNumberFormat('0.00"x"');
  s.setColumnWidth(1, 130);
}

// ── Platform Summary ──────────────────────────────────────────────────────
function buildPlatformSummary_(book) {
  const s = resetSheet_(book, TAB.PLATFORM);
  s.getRange('A1').setValue('PLATFORM SUMMARY').setFontWeight('bold').setFontSize(12);
  const headers = ['Platform', 'Spend', 'Clicks', 'New Fans', 'Revenue', 'CPC', 'CAC', 'ROAS'];
  s.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold')
    .setBackground('#1a1a1a').setFontColor('#ffffff');
  s.getRange(3, 1, PLATFORMS.length, 1).setValues(PLATFORMS.map(function (p) { return [p]; }));

  const L = "'" + TAB.LOG + "'!";
  const last = 2 + PLATFORMS.length; // row 4
  for (let r = 3; r <= last; r++) {
    const A = '$A' + r;
    s.getRange(r, 2).setFormula('=SUMIF(' + L + '$B:$B,' + A + ',' + L + '$H:$H)'); // Spend
    s.getRange(r, 3).setFormula('=SUMIF(' + L + '$B:$B,' + A + ',' + L + '$I:$I)'); // Clicks
    s.getRange(r, 4).setFormula('=SUMIF(' + L + '$B:$B,' + A + ',' + L + '$J:$J)'); // New Fans
    s.getRange(r, 5).setFormula('=SUMIF(' + L + '$B:$B,' + A + ',' + L + '$K:$K)'); // Revenue
    s.getRange(r, 6).setFormula('=IF(C' + r + '>0,B' + r + '/C' + r + ',"")'); // CPC
    s.getRange(r, 7).setFormula('=IF(D' + r + '>0,B' + r + '/D' + r + ',"")'); // CAC
    s.getRange(r, 8).setFormula('=IF(B' + r + '>0,E' + r + '/B' + r + ',"")'); // ROAS
  }
  s.getRange(3, 2, PLATFORMS.length, 1).setNumberFormat('$#,##0.00');
  s.getRange(3, 5, PLATFORMS.length, 3).setNumberFormat('$#,##0.00');
  s.getRange(3, 8, PLATFORMS.length, 1).setNumberFormat('0.00"x"');
  s.setColumnWidth(1, 120);
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Delete + recreate a tab so rebuilds start clean. */
function resetSheet_(book, name) {
  const existing = book.getSheetByName(name);
  if (existing) book.deleteSheet(existing);
  return book.insertSheet(name);
}

function ensureSnapshotTab_() {
  const book = ss();
  let s = book.getSheetByName(TAB.SNAP);
  if (!s) {
    s = book.insertSheet(TAB.SNAP);
    // base* = cumulative totals at the START of baseDate; last* = most recent
    // cumulative seen. Today's delta = current − base*, so same-day re-runs are
    // idempotent and day boundaries roll the base forward correctly.
    s.getRange(1, 1, 1, SNAP_HEADERS.length).setValues([SNAP_HEADERS]);
  }
  s.hideSheet();
  return s;
}

/** SCALE = green, KEEP = amber, CUT = red on the given 1-based column. */
function addVerdictFormatting_(s, col) {
  const rng = s.getRange(2, col, s.getMaxRows() - 1, 1);
  const mk = function (text, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains(text).setBackground(bg).setFontColor(fg).setRanges([rng]).build();
  };
  const rules = s.getConditionalFormatRules();
  rules.push(mk('SCALE', '#b7e1cd', '#0b5d3b'));
  rules.push(mk('KEEP', '#fce8b2', '#7a5900'));
  rules.push(mk('CUT', '#f4c7c3', '#8b1a10'));
  s.setConditionalFormatRules(rules);
}

function reorderTabs_(book) {
  const order = [TAB.SETTINGS, TAB.LOG, TAB.SPLIT, TAB.CREATORS, TAB.PLATFORM, TAB.OFLINKS];
  let pos = 1;
  order.forEach(function (name) {
    const sh = book.getSheetByName(name);
    if (sh) { book.setActiveSheet(sh); book.moveActiveSheet(pos++); }
  });
}

/** Delete the three pink EXAMPLE rows once you're ready to go live. */
function deleteExampleRows() {
  const s = sheet(TAB.LOG);
  const last = s.getLastRow();
  if (last < 2) return;
  const campaigns = s.getRange(2, COL.CAMPAIGN, last - 1, 1).getValues();
  // Walk bottom-up so deletes don't shift the rows we haven't checked yet.
  let removed = 0;
  for (let i = campaigns.length - 1; i >= 0; i--) {
    if (String(campaigns[i][0]).indexOf('EXAMPLE') === 0) {
      s.deleteRow(2 + i);
      removed++;
    }
  }
  toast('Deleted ' + removed + ' example row(s).', 'Setup');
}
