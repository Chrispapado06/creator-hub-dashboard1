/**
 * UNCVRD — Salary Creator CRM : the ad section
 * ============================================================================
 * A faithful rebuild of the ad sheet Christos already works in
 * (1CZswouM2eXPTrU0prifEnwthbRFvO5hrr6a2BkgAQQ8) — same layout, same column
 * names, same colours, same conditional-formatting thresholds, same formulas.
 *
 * The difference is that this one is LIVE here. The original's filter row was
 * mirrored text; these cells actually drive the numbers, because the ad
 * sheet's raw Data and Cohort tabs are imported into two hidden helpers and
 * every figure is computed locally.
 *
 * Everything in AD_STYLE was measured off that file, not invented. If you
 * re-theme this, re-theme that sheet too or they stop looking related.
 */

var AD_DATA   = '_AdData';      // Date | Creator | Platform | Clicks | Fans | Spend | Revenue
var AD_COHORT = '_AdCohort';    // Creator | Platform | Subs | Clicks | 48h | 7d | 14d | 21d | 30d | All

var PLATFORMS = ['Meta', 'OnlyFinder', 'OnlyGuider', 'OnlySeeker', 'OnlyTraffic'];
var DAYS      = 14;             // the original runs rows 14–97: fourteen day blocks

var AD_STYLE = {
  banner:   '#5b43f5',          // banner, section bars, and the day label cell
  bannerTx: '#ffffff',
  head:     '#1f2430',          // table header row
  headTx:   '#ffffff',
  dayTint:  '#ede7fb',          // the day subtotal row
  calc:     '#f1f2f7',          // derived cell
  input:    '#fff6cc',          // type here
  ink:      '#111111',
  muted:    '#6b7280',
  green:    '#4cd964',
  amber:    '#ffaa33',
  red:      '#ff6b6b',
  softGrn:  '#e6f7ec',
  softRed:  '#fceaea'
};

var FMT = { int: '#,##0', money: '$#,##0.00', pct: '0.0%', roas: '0.00"x"', day: 'ddd, mmm d' };

// ── Hidden helpers ──────────────────────────────────────────────────────────

function buildAdHelpers_() {
  var d = sheet_(AD_DATA);
  d.clear();
  ensureSize_(d, 1100, 14);
  d.getRange('A1').setFormula('=IMPORTRANGE(CFG_AD_SHEET_ID,"Data!A1:G1000")');
  d.getRange('L1').setValue('All');
  d.getRange('L2').setFormula(
    '=IFERROR(SORT(UNIQUE(FILTER($B$2:$B,$B$2:$B<>"",$B$2:$B<>"Creator"))),"")');
  setNamed_('CRM_AdCreators', d.getRange('L1:L50'));
  d.hideSheet();

  var c = sheet_(AD_COHORT);
  c.clear();
  ensureSize_(c, 60, 12);
  c.getRange('A1').setFormula('=IMPORTRANGE(CFG_AD_SHEET_ID,"Cohort!A1:J40")');
  c.hideSheet();
}

/** Whole-column refs, exactly as the original writes them. */
function dataCol_(c)   { return "'" + AD_DATA + "'!$" + c + ':$' + c; }
function cohortCol_(c) { return "'" + AD_COHORT + "'!$" + c + ':$' + c; }
function crit_(cell)   { return 'IF(' + cell + '="All","*",' + cell + ')'; }

// ── Weekly AD Stats ─────────────────────────────────────────────────────────

function buildAdStats_() {
  var sh = sheet_(TABS.adStats.name);
  var lastRow = 13 + DAYS * 6;
  // These tabs are rebuilt from scratch every time, so anything typed into
  // them has to be carried across by hand: the real cost per click, the
  // filters, and the Relevance scores on the day rows.
  var kept = keepCells_(sh, ['B2', 'D2', 'F2', 'H2', 'F5:F9', 'L14:L' + lastRow]);
  resetTab_(sh, lastRow + 6, 15);

  var f = crit_('$F$2');
  var win = dataCol_('A') + ',">="&$B$2,' + dataCol_('A') + ',"<="&$D$2';

  adBanner_(sh, 14, 'UNCVRD — WEEKLY STATS');

  // ── row 2: the controls, and unlike the original these are real ──
  // Ads run every day, so the default window has to END TODAY. Pick a named
  // range and the dates fill in; type a date yourself and the range flips to
  // Custom so the nightly job stops moving it under you.
  var w = adRange_('Last 7 days');
  adLabel_(sh, 'A2', 'From ▸');    adInput_(sh, 'B2', w.from, 'yyyy-mm-dd');
  adLabel_(sh, 'C2', 'To ▸');      adInput_(sh, 'D2', w.to,   'yyyy-mm-dd');
  adLabel_(sh, 'E2', 'Creator ▸'); adInput_(sh, 'F2', 'All');
  sh.getRange('F2').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss_().getRangeByName('CRM_AdCreators'), true)
    .setAllowInvalid(true).build());

  adLabel_(sh, 'G2', 'Range ▸');   adInput_(sh, 'H2', 'Last 7 days');
  sh.getRange('H2').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(LIST.adRange, true).setAllowInvalid(false).build());

  sh.getRange('J2').setFormula(
    '=TEXT($B$2,"mmm d")&" → "&TEXT($D$2,"mmm d")&"   ("&($D$2-$B$2+1)&" days' +
    ', refreshed nightly unless Range is Custom)"')
    .setFontColor(AD_STYLE.muted).setFontSize(10);

  sh.getRange('A3').setValue('Spend ▸').setFontSize(10).setFontColor(AD_STYLE.muted)
    .setHorizontalAlignment('right');
  sh.getRange('B3').setValue(
    'Spend = Clicks × the CPC you type per platform (the yellow cells in the CPC column). ' +
    'Change a date, the creator, or a CPC and every number below moves.')
    .setFontSize(10).setFontColor(AD_STYLE.muted);

  // ── row 4: the summary table ──
  adHeader_(sh, 4, ['Metrics i need to know', 'Clicks', 'Fans', 'Spend', 'CAC', 'CPC', 'CVR',
                    'Attributed Revenue', 'Total LTV 48h', 'Total LTV 7d', 'Total LTV 14d',
                    'Total LTV 30d', 'ROAS', 'Agency Profit']);

  var perPlat = function (col, plat) {
    return 'SUMIFS(' + dataCol_(col) + ',' + win + ',' + dataCol_('C') + ',"' + plat +
           '",' + dataCol_('B') + ',' + f + ')';
  };
  var ltv = function (revCol, plat, r) {
    var by = plat ? cohortCol_('B') + ',"' + plat + '",' : '';
    return '=IFERROR(SUMIFS(' + cohortCol_(revCol) + ',' + by + cohortCol_('A') + ',' + f +
           ')/SUMIFS(' + cohortCol_('C') + ',' + by + cohortCol_('A') + ',' + f + '),"")';
  };

  var allPlat = function (col) {
    return 'SUMIFS(' + dataCol_(col) + ',' + win + ',' + dataCol_('B') + ',' + f + ')';
  };

  // Built as a grid and written in two calls. Doing it cell by cell was ~75
  // round-trips here and ~840 in the day blocks below — together the bulk of
  // the six-minute timeout.
  var top = PLATFORMS.concat([null]).map(function (plat, i) {
    var r = 5 + i, row = new Array(14).fill('');
    row[0]  = plat || 'TOTAL';
    row[1]  = '=' + (plat ? perPlat('D', plat) : allPlat('D'));
    row[2]  = '=' + (plat ? perPlat('E', plat) : allPlat('E'));
    row[3]  = plat ? '=B' + r + '*F' + r : '=SUM(D5:D9)';
    row[4]  = '=IFERROR(D' + r + '/C' + r + ',"")';
    row[6]  = '=IFERROR(C' + r + '/B' + r + ',"")';
    row[7]  = '=' + (plat ? perPlat('G', plat) : allPlat('G'));
    row[8]  = ltv('E', plat, r);
    row[9]  = ltv('F', plat, r);
    row[10] = ltv('G', plat, r);
    row[11] = ltv('I', plat, r);
    row[12] = '=IFERROR(H' + r + '/D' + r + ',"")';
    row[13] = '=H' + r + '-D' + r;
    return row;
  });
  // Column F is the typed CPC on rows 5-9 — kept out of the bulk write so it
  // cannot be clobbered; only the TOTAL row derives it.
  sh.getRange(5, 1, 6, 5).setValues(top.map(function (r) { return r.slice(0, 5); }));
  sh.getRange(5, 7, 6, 8).setValues(top.map(function (r) { return r.slice(6); }));
  sh.getRange(10, 6).setFormula('=IFERROR(D10/B10,"")');
  sh.getRange(10, 1, 1, 14).setFontWeight('bold');

  // The CPC column is the only thing you type here.
  sh.getRange('F5:F9').setValue(0.75).setBackground(AD_STYLE.input)
    .setBorder(true, true, true, true, true, false);
  sh.getRange(5, 5, 6, 1).setBackground(AD_STYLE.calc);     // CAC is derived
  sh.getRange(5, 4, 5, 1).setBackground(AD_STYLE.calc);     // so is Spend, above TOTAL

  // ── row 12: day by day ──
  adSection_(sh, 12, 12,
    'DAY BY DAY  (each day in the window above, broken down by platform)');
  adHeader_(sh, 13, ['Day / Platform', 'Clicks', 'Fans', 'Spend', 'Cost Per Fan', 'CPC', 'CVR',
                     'Attributed Revenue', 'Total Link LTV', 'ROAS', 'Agency Profit', 'Relevance']);

  var dayAll  = function (col, dr) {
    return 'SUMIFS(' + dataCol_(col) + ',' + dataCol_('A') + ',$A' + dr + ',' +
           dataCol_('B') + ',' + f + ')';
  };
  var dayPlat = function (col, plat, dr) {
    return 'SUMIFS(' + dataCol_(col) + ',' + dataCol_('A') + ',$A' + dr + ',' +
           dataCol_('C') + ',"' + plat + '",' + dataCol_('B') + ',' + f + ')';
  };
  // Cells 1..10 of a row (columns B..K), as an array rather than ten writes.
  var metricsInto = function (row, r, sums) {
    row[1]  = '=' + sums('D');
    row[2]  = '=' + sums('E');
    row[3]  = '=' + sums('F');
    row[4]  = '=IFERROR(D' + r + '/C' + r + ',"")';
    row[5]  = '=IFERROR(D' + r + '/B' + r + ',"")';
    row[6]  = '=IFERROR(C' + r + '/B' + r + ',"")';
    row[7]  = '=' + sums('G');
    row[8]  = '=IFERROR(H' + r + '/C' + r + ',"")';
    row[9]  = '=IFERROR(H' + r + '/D' + r + ',"")';
    row[10] = '=H' + r + '-D' + r;
  };

  // The whole day-by-day block: one grid, one write, instead of ~840 calls.
  var grid = [], dayCells = [], tintCells = [], calcCells = [], relCells = [];
  for (var d = 0; d < DAYS; d++) {
    var dr = 14 + d * 6;
    var dayRow = new Array(12).fill('');
    dayRow[0] = '=IF($B$2+' + d + '>$D$2,"",$B$2+' + d + ')';
    metricsInto(dayRow, dr, (function (row) {
      return function (col) { return dayAll(col, row); };
    })(dr));
    grid.push(dayRow);

    PLATFORMS.forEach(function (plat, i) {
      var pr = dr + 1 + i;
      var row = new Array(12).fill('');
      row[0] = '    ' + plat;                 // four spaces, like the original
      metricsInto(row, pr, (function (pl, dRow) {
        return function (col) { return dayPlat(col, pl, dRow); };
      })(plat, dr));
      grid.push(row);
    });

    dayCells.push('A' + dr);
    tintCells.push('B' + dr + ':L' + dr);
    calcCells.push('E' + (dr + 1) + ':F' + (dr + 5));
    relCells.push('L' + dr + ':L' + (dr + 5));
  }
  sh.getRange(14, 1, grid.length, 12).setValues(grid);

  // Formatting in four RangeList calls rather than four per day.
  sh.getRangeList(dayCells).setBackground(AD_STYLE.banner)
    .setFontColor(AD_STYLE.bannerTx).setFontWeight('bold');
  sh.getRangeList(tintCells).setBackground(AD_STYLE.dayTint).setFontWeight('bold');
  sh.getRangeList(calcCells).setBackground(AD_STYLE.calc);
  sh.getRangeList(relCells).setBackground(AD_STYLE.input);


  adFormats_(sh, lastRow);
  adRules_(sh, lastRow);

  addChart_(sh, {
    type: Charts.ChartType.COLUMN, row: lastRow + 3, col: 1,
    title: 'By platform — what we spent against what came back',
    ranges: [sh.getRange(4, 1, 6, 1), sh.getRange(4, 4, 6, 1), sh.getRange(4, 8, 6, 1)],
    options: { vAxis: { title: '$' }, colors: ['#ff6b6b', '#4cd964'] }
  });

  sh.setColumnWidth(1, 190);
  [2, 3].forEach(function (c) { sh.setColumnWidth(c, 82); });
  [4, 5, 6, 7].forEach(function (c) { sh.setColumnWidth(c, 100); });
  sh.setColumnWidth(8, 140);
  [9, 10, 11, 12].forEach(function (c) { sh.setColumnWidth(c, 112); });
  sh.setColumnWidth(13, 86); sh.setColumnWidth(14, 118);
  restoreCells_(sh, kept);
  // Restoring put the OLD From/To back, which is right for a Custom range and
  // wrong for every other one — a "Last 7 days" report would stay pinned to
  // whatever fortnight it was last built with. The named range wins.
  if (String(sh.getRange('H2').getValue()).trim() !== 'Custom') applyAdRange_(sh);

  sh.setFrozenRows(4);
  sh.setTabColor(SECTION.ads);
  hideBeyond_(sh, 14);
}

function adFormats_(sh, lastRow) {
  var col = function (c, r1, n, fmt) {
    sh.getRange(r1, c, n, 1).setNumberFormat(fmt).setHorizontalAlignment('center');
  };
  // summary block
  col(2, 5, 6, FMT.int);  col(3, 5, 6, FMT.int);
  [4, 5, 6, 8, 9, 10, 11, 12, 14].forEach(function (c) { col(c, 5, 6, FMT.money); });
  col(7, 5, 6, FMT.pct);  col(13, 5, 6, FMT.roas);
  // day block
  var n = lastRow - 13;
  col(2, 14, n, FMT.int); col(3, 14, n, FMT.int);
  [4, 5, 6, 8, 9, 11].forEach(function (c) { col(c, 14, n, FMT.money); });
  col(7, 14, n, FMT.pct);  col(10, 14, n, FMT.roas);
  sh.getRange(14, 1, n, 1).setNumberFormat(FMT.day).setHorizontalAlignment('left');
  sh.getRange(5, 1, 6, 1).setHorizontalAlignment('left');
}

/** The original's thresholds, to the number. */
function adRules_(sh, lastRow) {
  var rules = [];
  var band = function (a1, steps) {
    var rng = sh.getRange(a1);
    steps.forEach(function (s) {
      var b = SpreadsheetApp.newConditionalFormatRule();
      b = s.op === '>=' ? b.whenNumberGreaterThanOrEqualTo(s.v)
        : s.op === '>'  ? b.whenNumberGreaterThan(s.v)
        :                 b.whenNumberLessThan(s.v);
      rules.push(b.setBackground(s.bg).setRanges([rng]).build());
    });
  };
  var S = AD_STYLE;
  var tri = function (a1, hi, mid) {
    band(a1, [{op:'>=', v:hi,  bg:S.green},
              {op:'>=', v:mid, bg:S.amber},
              {op:'<',  v:mid, bg:S.red}]);
  };

  band('G5:G10',  [{op:'>=', v:0.25, bg:S.softGrn}, {op:'<', v:0.25, bg:S.softRed}]);
  band('F5:F10',  [{op:'>',  v:0.7,  bg:S.red}]);
  tri('I5:I10', 4, 3);  tri('J5:J10', 6, 4);
  tri('K5:K10', 8, 6);  tri('L5:L10', 14, 10);

  band('G14:G' + lastRow, [{op:'>=', v:0.25, bg:S.softGrn}, {op:'<', v:0.25, bg:S.softRed}]);
  band('F14:F' + lastRow, [{op:'>',  v:0.7,  bg:S.red}]);
  tri('I14:I' + lastRow, 4, 3);

  // A window shorter than 14 days leaves empty day blocks. Without this they
  // still render as indigo and lavender bars, which reads as broken rather
  // than as "no more days".
  for (var d = 0; d < DAYS; d++) {
    var dr = 14 + d * 6;
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$A$' + dr + '=""')
      .setBackground('#ffffff').setFontColor('#ffffff')
      .setRanges([sh.getRange(dr, 1, 6, 12)]).build());
  }

  sh.setConditionalFormatRules(rules);
}

// ── ADs Summary (their "Time to Profit", rebuilt live) ──────────────────────

function buildAdSummary_() {
  var sh = sheet_(TABS.adSummary.name);
  var kept = keepCells_(sh, ['B2', 'D5:D9']);
  resetTab_(sh, 30, 14);
  var f = crit_('$B$2');

  adBanner_(sh, 13, 'UNCVRD — TIME TO PROFIT  /  BREAK-EVEN');

  adLabel_(sh, 'A2', 'Creator ▸'); adInput_(sh, 'B2', 'All');
  sh.getRange('B2').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInRange(ss_().getRangeByName('CRM_AdCreators'), true)
    .setAllowInvalid(true).build());
  sh.getRange('D2').setValue(
    'Set each platform\'s real Cost / Click in the yellow column.')
    .setFontColor(AD_STYLE.muted).setFontSize(10);
  sh.getRange('A3').setValue(
    'ARPS = revenue each subscriber that platform sent has spent by that point. ' +
    'Every subscriber ever acquired, not just the window on Weekly AD Stats.')
    .setFontColor(AD_STYLE.muted).setFontSize(10);

  adHeader_(sh, 4, ['Platform', 'Subscribers', 'Clicks', 'Cost / Click', 'Cost / Promo',
                    'Cost / Sub', 'ARPS 48h', 'ARPS 7d', 'ARPS 14d', 'ARPS 30d',
                    'ARPS All (Rev/Sub)', 'Margin / Sub', 'Break-even by']);

  var sums = function (c, plat) {
    var by = plat ? cohortCol_('B') + ',"' + plat + '",' : '';
    return 'SUMIFS(' + cohortCol_(c) + ',' + by + cohortCol_('A') + ',' + f + ')';
  };
  var arps = function (c, plat, r) {
    return '=IFERROR(' + sums(c, plat) + '/$B' + r + ',"")';
  };

  // One grid, two writes. Column D is the typed Cost / Click on rows 5-9 and is
  // kept out of the bulk write so a rebuild cannot clobber it.
  var body = PLATFORMS.concat([null]).map(function (plat, i) {
    var r = 5 + i;
    return [plat || 'TOTAL',
      '=' + sums('C', plat),
      '=' + sums('D', plat),
      plat ? '=C' + r + '*D' + r : '=SUM(E5:E9)',
      '=IFERROR(E' + r + '/B' + r + ',"")',
      arps('E', plat, r), arps('F', plat, r), arps('G', plat, r),
      arps('I', plat, r), arps('J', plat, r),
      '=IFERROR($K' + r + '-$F' + r + ',"")',
      '=IF(N($F' + r + ')=0,"",' +
      'IF(N($G' + r + ')>=$F' + r + ',"48 hours",' +
      'IF(N($H' + r + ')>=$F' + r + ',"7 days",' +
      'IF(N($I' + r + ')>=$F' + r + ',"14 days",' +
      'IF(N($J' + r + ')>=$F' + r + ',"30 days",' +
      'IF(N($K' + r + ')>=$F' + r + ',"eventually","not yet"))))))'];
  });
  sh.getRange(5, 1, 6, 3).setValues(body.map(function (r) { return r.slice(0, 3); }));
  sh.getRange(5, 5, 6, 9).setValues(body.map(function (r) { return r.slice(3); }));
  sh.getRange(10, 4).setFormula('=IFERROR(E10/C10,"")');

  sh.getRange('D5:D9').setValue(0.75).setBackground(AD_STYLE.input)
    .setBorder(true, true, true, true, true, false);
  sh.getRange(10, 1, 1, 13).setFontWeight('bold');
  sh.getRange(5, 5, 6, 2).setBackground(AD_STYLE.calc);

  // ── the one-line answer, in the same visual language ──
  adSection_(sh, 12, 13, 'THE ANSWER');
  var answer = [
    ['Total spent on ads',            '=$E$10',                       FMT.money],
    ['Total earned from those subs',  '=' + sums('J', null),          FMT.money],
    ['Profit / loss',                 '=$B$14-$B$13',                 FMT.money],
    ['Earned per $1 spent',           '=IFERROR($B$14/$B$13,"")',     FMT.roas]
  ];
  answer.forEach(function (a, i) {
    var r = 13 + i;
    sh.getRange(r, 1).setValue(a[0]).setFontWeight(i >= 2 ? 'bold' : 'normal');
    sh.getRange(r, 2).setFormula(a[1]).setNumberFormat(a[2])
      .setHorizontalAlignment('center').setFontWeight(i >= 2 ? 'bold' : 'normal')
      .setBackground(AD_STYLE.calc);
  });
  sh.getRange(17, 1).setValue('So?').setFontWeight('bold');
  sh.getRange(17, 2, 1, 11).merge();
  sh.getRange(17, 2).setFormula(
    '=IF(N($B$13)=0,"Put a Cost / Click in the yellow column above.",' +
    'IF($B$15>0,"Profitable. Every $1 spent is bringing back $"&TEXT($B$16,"0.00")&".",' +
    '"Losing money — "&TEXT(-$B$15,"$#,##0")&" down. Look at the Margin / Sub column."))')
    .setFontWeight('bold').setFontColor(AD_STYLE.banner);

  var col = function (c, fmt) {
    sh.getRange(5, c, 6, 1).setNumberFormat(fmt).setHorizontalAlignment('center');
  };
  col(2, FMT.int); col(3, FMT.int);
  [4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (c) { col(c, FMT.money); });
  sh.getRange(5, 1, 6, 1).setHorizontalAlignment('left');
  sh.getRange(5, 13, 6, 1).setHorizontalAlignment('center');

  var S = AD_STYLE, rules = [];
  var tri = function (a1, hi, mid) {
    var rng = sh.getRange(a1);
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(hi)
      .setBackground(S.green).setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(mid)
      .setBackground(S.amber).setRanges([rng]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(mid)
      .setBackground(S.red).setRanges([rng]).build());
  };
  tri('G5:G10', 4, 3); tri('H5:H10', 6, 4); tri('I5:I10', 8, 6); tri('J5:J10', 14, 10);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
    .setBackground(S.softGrn).setRanges([sh.getRange('L5:L10')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
    .setBackground(S.softRed).setRanges([sh.getRange('L5:L10')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('not yet')
    .setBackground(S.softRed).setRanges([sh.getRange('M5:M10')]).build());
  sh.setConditionalFormatRules(rules);

  addChart_(sh, {
    type: Charts.ChartType.COLUMN, row: 33, col: 1,
    title: 'How fast the money comes back — earned per subscriber over time',
    ranges: [sh.getRange(25, 1, 6, 1), sh.getRange(25, 3, 6, 5), sh.getRange(25, 2, 6, 1)],
    width: 900, height: 340,
    options: {
      vAxis: { title: '$ per subscriber' },
      colors: ['#c5cae9', '#9fa8da', '#7986cb', '#5b43f5', '#ff6b6b'],
      series: { 4: { type: 'line', lineWidth: 3, color: '#ff6b6b' } }
    }
  });

  sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 100); sh.setColumnWidth(3, 90);
  [4, 5, 6].forEach(function (c) { sh.setColumnWidth(c, 105); });
  [7, 8, 9, 10].forEach(function (c) { sh.setColumnWidth(c, 95); });
  sh.setColumnWidth(11, 150); sh.setColumnWidth(12, 110); sh.setColumnWidth(13, 120);
  restoreCells_(sh, kept);
  sh.setFrozenRows(4);
  sh.setTabColor(SECTION.ads);
  hideBeyond_(sh, 13);
}

// ── Shared chrome ───────────────────────────────────────────────────────────

/**
 * Charts survive sh.clear(), so a rebuild would stack a fresh copy on top of
 * the old one every single time. They have to be removed explicitly.
 */
function clearCharts_(sh) {
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });
}

/** One chart, positioned and themed like everything else. */
function addChart_(sh, o) {
  var b = sh.newChart().setChartType(o.type)
    .setPosition(o.row, o.col || 1, 0, 0)
    .setOption('title', o.title)
    .setOption('width', o.width || 820)
    .setOption('height', o.height || 320)
    .setOption('titleTextStyle', { fontSize: 14, bold: true, color: AD_STYLE.ink })
    .setOption('legend', { position: 'bottom' })
    .setOption('backgroundColor', '#ffffff')
    .setOption('colors', o.colors || [AD_STYLE.banner, '#4cd964', '#ffaa33']);
  (o.ranges || []).forEach(function (r) { b.addRange(r); });
  Object.keys(o.options || {}).forEach(function (k) { b.setOption(k, o.options[k]); });
  sh.insertChart(b.build());
}

function resetTab_(sh, rows, cols) {
  clearCharts_(sh);
  ensureSize_(sh, rows, cols);
  try { sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart(); } catch (e) {}
  sh.clear();
  sh.clearConditionalFormatRules();
  sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) { p.remove(); });
  sh.setFrozenRows(0);
  sh.setHiddenGridlines(false);
}

function adBanner_(sh, cols, title) {
  sh.getRange(1, 1, 1, cols).merge().setValue(title)
    .setFontSize(18).setFontWeight('bold')
    .setFontColor(AD_STYLE.bannerTx).setBackground(AD_STYLE.banner)
    .setVerticalAlignment('middle');
  sh.setRowHeight(1, 34);
}

function adSection_(sh, row, cols, text) {
  sh.getRange(row, 1, 1, cols).merge().setValue(text)
    .setFontSize(11).setFontWeight('bold')
    .setFontColor(AD_STYLE.bannerTx).setBackground(AD_STYLE.banner);
  sh.setRowHeight(row, 22);
}

function adHeader_(sh, row, headers) {
  sh.getRange(row, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground(AD_STYLE.head).setFontColor(AD_STYLE.headTx)
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(row, 30);
}

function adLabel_(sh, a1, text) {
  sh.getRange(a1).setValue(text).setFontWeight('bold').setFontColor(AD_STYLE.ink)
    .setHorizontalAlignment('right');
}

function adInput_(sh, a1, value, fmt) {
  var r = sh.getRange(a1).setValue(value).setBackground(AD_STYLE.input).setFontWeight('bold')
    .setBorder(true, true, true, true, false, false).setHorizontalAlignment('center');
  if (fmt) r.setNumberFormat(fmt);
  return r;
}

/** Column widths, left to right. */
function widths_(sh, ws) {
  ws.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
}

function hideBeyond_(sh, cols) {
  if (sh.getMaxColumns() > cols) sh.hideColumns(cols + 1, sh.getMaxColumns() - cols);
}

/**
 * Read cells that the user owns on a generated tab, so a rebuild can put them
 * back. Only non-empty values are restored, so a first build still gets its
 * defaults.
 */
function keepCells_(sh, a1s) {
  var out = {};
  a1s.forEach(function (a1) {
    try { out[a1] = sh.getRange(a1).getValues(); } catch (e) { /* tab is new */ }
  });
  return out;
}

function restoreCells_(sh, kept) {
  Object.keys(kept || {}).forEach(function (a1) {
    var vals = kept[a1];
    if (!vals || !vals.some(function (r) {
          return r.some(function (v) { return v !== '' && v !== null; });
        })) return;
    try {
      var rng = sh.getRange(a1);
      if (rng.getNumRows() === vals.length && rng.getNumColumns() === vals[0].length) {
        rng.setValues(vals);
      }
    } catch (e) { log_('restoreCells', a1 + ': ' + e.message); }
  });
}

function setNamed_(name, range) {
  ss_().getNamedRanges().forEach(function (nr) { if (nr.getName() === name) nr.remove(); });
  ss_().setNamedRange(name, range);
}
