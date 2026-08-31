/**
 * UNCVRD — Salary Creator CRM : the SFS section
 * ============================================================================
 * Same treatment as the ad tabs: the internal promo report's raw tabs are
 * imported into hidden helpers and the two visible tabs are rebuilt here, in
 * the same visual language as the ad sheet (AD_STYLE lives in AdViews.gs).
 *
 * The creator table is ONE array formula rather than 21 rows of lookups, so a
 * creator joining or leaving the roster needs no rebuild, and a row moving in
 * the source cannot silently shift a column.
 *
 * Staleness is shown, not hidden. The source is a generated export; if nothing
 * has regenerated it the tab says so in row 2 rather than quietly presenting
 * three-week-old numbers as this week's.
 */

var SFS_WEEK  = '_SfsWeek';    // Weekly Report, as-is
var SFS_SLOTS = '_SfsSlots';   // Raw Slots — only used to date-stamp the source

// ── Hidden helpers ──────────────────────────────────────────────────────────

function buildSfsHelpers_() {
  // Nothing to import any more. The SFS tabs are computed from _LinkStats and
  // _LinkBase (OnlyFans API) plus this file's own promo schedules, so the dead
  // export is no longer in the chain. Kept as a no-op so the build order and
  // any old references stay valid.
  [SFS_WEEK, SFS_SLOTS].forEach(function (n) {
    var sh = ss_().getSheetByName(n);
    if (sh) ss_().deleteSheet(sh);
  });
}

// ── SFS Weekly Report ───────────────────────────────────────────────────────

function buildSfsReport_() {
  var sh = sheet_(TABS.sfsReport.name);
  resetTab_(sh, 60, 14);

  var N = "'" + LINK_NOW + "'!", B = "'" + LINK_BASE + "'!";
  // (now − base) for one creator's links of a given source type. Link revenue
  // from the API is cumulative, so a week only exists as a difference.
  var delta = function (col, creatorCell, type) {
    var w = function (t) {
      return 'SUMIFS(' + t + '$' + col + '$2:$' + col + ',' + t + '$B$2:$B,' + creatorCell +
             ',' + t + '$E$2:$E,"' + type + '")';
    };
    return '(' + w(N) + '-' + w(B) + ')';
  };
  var slots = function (creatorCell) {
    var f = [];
    ['1st Promote', '2nd Promote', '3rd Promote', '4th Promote'].forEach(function (h) {
      f.push('COUNTIFS(' + R_('feed', h) + ',' + creatorCell + ',' + R_('feed', 'Date') + ',">="&$B$2)');
    });
    ['1st Promoting Model', '2nd Promoting Model'].forEach(function (h) {
      f.push('COUNTIFS(' + R_('story', h) + ',' + creatorCell + ',' + R_('story', 'Date') + ',">="&$B$2)');
    });
    f.push('COUNTIFS(' + R_('mm', 'Promoted Creator') + ',' + creatorCell + ',' +
           R_('mm', 'Date') + ',">="&$B$2)');
    return f.join('+');
  };

  adBanner_(sh, 11, 'UNCVRD — SFS WEEKLY REPORT');
  sh.getRange('A2').setValue('Week from ▸').setFontWeight('bold').setHorizontalAlignment('right');
  adInput_(sh, 'B2', lastFullWeek_().from, 'yyyy-mm-dd');
  sh.getRange('D2').setFormula(
    '="internal " & TEXT(SUM($C$5:$C$40),"$#,##0") & "   ·   paid " & ' +
    'TEXT(SUM($G$5:$G$40),"$#,##0") & "   ·   " & SUM($B$5:$B$40) & " slots given"')
    .setFontWeight('bold').setFontColor(AD_STYLE.banner);
  sh.getRange('A3').setValue(
    'Computed here from the OnlyFans API — every tracking link on each creator\'s page, ' +
    'this week\'s figure being the cumulative total minus Monday\'s baseline. Internal SFS means the ' +
    'link\'s promoter is another creator; Paid means a network. No import, nothing to keep up to date.')
    .setFontSize(10).setFontColor(AD_STYLE.muted);

  adHeader_(sh, 4, ['Creator', 'Slots given', 'Internal revenue', '$ / slot', 'Internal subs',
                    'Internal clicks', 'Paid revenue', 'Paid subs', 'Unmapped revenue',
                    'Total link revenue', 'Recommendation']);

  sh.getRange('A5').setFormula(
    '=IFERROR(SORT(FILTER(CRM_Roster,CRM_Roster<>"")),"")');
  var grid = [];
  for (var i = 0; i < 36; i++) {
    var r = 5 + i, a = '$A' + r, blank = a + '=""';
    grid.push([
      '=IF(' + blank + ',"",' + slots(a) + ')',
      '=IF(' + blank + ',"",' + delta('I', a, 'Internal SFS') + ')',
      '=IF(OR(' + blank + ',N($B' + r + ')=0),"",$C' + r + '/$B' + r + ')',
      '=IF(' + blank + ',"",' + delta('H', a, 'Internal SFS') + ')',
      '=IF(' + blank + ',"",' + delta('G', a, 'Internal SFS') + ')',
      '=IF(' + blank + ',"",' + delta('I', a, 'Paid ad') + ')',
      '=IF(' + blank + ',"",' + delta('H', a, 'Paid ad') + ')',
      '=IF(' + blank + ',"",' + delta('I', a, 'Unmapped') + ')',
      '=IF(' + blank + ',"",$C' + r + '+$G' + r + '+$I' + r + ')',
      '=IF(' + blank + ',"",IF(N($B' + r + ')=0,"No promo given",' +
        'IF($D' + r + '>=30,"Increase Allocation",IF($D' + r + '>=10,"Keep Current","Reduce Allocation"))))'
    ]);
  }
  sh.getRange(5, 2, grid.length, 10).setValues(grid);

  [2, 5, 6, 8].forEach(function (c) {
    sh.getRange(5, c, 36, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  });
  [3, 4, 7, 9, 10].forEach(function (c) {
    sh.getRange(5, c, 36, 1).setNumberFormat('$#,##0.00').setHorizontalAlignment('center');
  });
  sh.getRange(5, 4, 36, 1).setBackground(AD_STYLE.calc);

  var S = AD_STYLE, rules = [];
  var eq = function (a1, t, bg) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(t)
      .setBackground(bg).setRanges([sh.getRange(a1)]).build());
  };
  eq('K5:K40', 'Increase Allocation', S.green);
  eq('K5:K40', 'Keep Current',        S.softGrn);
  eq('K5:K40', 'Reduce Allocation',   S.red);
  eq('K5:K40', 'No promo given',      S.amber);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
    .setBackground(S.softRed).setRanges([sh.getRange('I5:I40')]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$A5=""').setBackground('#ffffff')
    .setRanges([sh.getRange(5, 1, 36, 11)]).build());
  sh.setConditionalFormatRules(rules);

  sh.getRange(4, 9).setNote('Revenue on links this file has no row for. Not counted as internal ' +
    'or paid, because guessing which would put a wrong number on the allocation decision. ' +
    'Add the link to Tracking Links and it moves into the right column.');

  addChart_(sh, {
    type: Charts.ChartType.BAR, row: 43, col: 1,
    title: 'Internal-promo revenue this week, per creator',
    ranges: [sh.getRange(4, 1, 37, 1), sh.getRange(4, 3, 37, 1)],
    width: 900, height: 420,
    options: { hAxis: { title: '$ this week' }, legend: { position: 'none' },
               colors: ['#5b43f5'] }
  });
  addChart_(sh, {
    type: Charts.ChartType.SCATTER, row: 43, col: 12,
    title: 'Slots given against revenue back — anything low-right is over-promoted',
    ranges: [sh.getRange(4, 2, 37, 2)],
    width: 620, height: 420,
    options: { hAxis: { title: 'Slots given' }, vAxis: { title: 'Internal revenue ($)' },
               legend: { position: 'none' }, colors: ['#5b43f5'],
               pointSize: 9 }
  });

  widths_(sh, [150, 95, 130, 90, 110, 110, 115, 90, 130, 130, 150]);
  sh.setFrozenRows(4);
  sh.setTabColor(SECTION.promo);
  hideBeyond_(sh, 11);
}

// ── SFS Summary ─────────────────────────────────────────────────────────────

function buildSfsSummary_() {
  var sh = sheet_(TABS.sfsSummary.name);
  resetTab_(sh, 60, 10);

  var W = "'" + TABS.sfsReport.name + "'!";
  var col = function (c) { return W + '$' + c + '$5:$' + c + '$40'; };
  var body = 'FILTER(' + W + '$A$5:$K$40,' + W + '$A$5:$A$40<>"")';

  adBanner_(sh, 7, 'UNCVRD — SFS SUMMARY');
  sh.getRange('A2').setFormula('="Week from " & TEXT(' + W + '$B$2,"d mmm")')
    .setFontWeight('bold');
  sh.getRange('A3').setValue(
    'Everything here reads the SFS Weekly Report, which is computed from the OnlyFans API. ' +
    'Change the week on that tab and this follows.')
    .setFontSize(10).setFontColor(AD_STYLE.muted);

  adSection_(sh, 5, 7, 'THIS WEEK AT A GLANCE');
  var kpis = [
    ['Creators given promo',        '=COUNTIF(' + col('B') + ',">0")', '#,##0'],
    ['Slots given',                 '=SUM(' + col('B') + ')',          '#,##0'],
    ['Internal-promo revenue',      '=SUM(' + col('C') + ')',          '$#,##0.00'],
    ['Average revenue per slot',
     '=IFERROR(SUM(' + col('C') + ')/SUM(' + col('B') + '),"")',       '$#,##0.00'],
    ['Paid-traffic revenue',        '=SUM(' + col('G') + ')',          '$#,##0.00'],
    ['Revenue on unmapped links',   '=SUM(' + col('I') + ')',          '$#,##0.00'],
    ['Getting no promo at all',     '=COUNTIF(' + col('B') + ',0)',    '#,##0']
  ];
  sh.getRange(6, 1, kpis.length, 2).setValues(kpis.map(function (k) { return [k[0], k[1]]; }));
  kpis.forEach(function (k, i) {
    sh.getRange(6 + i, 2).setNumberFormat(k[2]).setHorizontalAlignment('center')
      .setFontWeight('bold').setBackground(AD_STYLE.calc);
  });
  sh.getRange(11, 3).setNote('Revenue on links Tracking Links has no row for. Map them and it ' +
    'moves into internal or paid — until then it is real money nobody can attribute.');

  var block = function (row, title, where, order, limit) {
    adSection_(sh, row, 7, title);
    adHeader_(sh, row + 1, ['Creator', 'Slots', 'Internal revenue', '$ / slot',
                            'Recommendation', '', '']);
    sh.getRange(row + 2, 1).setFormula(
      '=IFERROR(QUERY({' + body + '},"select Col1,Col2,Col3,Col4,Col11 where ' + where +
      ' ' + order + ' limit ' + limit + '",0),"— none —")');
    sh.getRange(row + 2, 2, limit, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
    sh.getRange(row + 2, 3, limit, 2).setNumberFormat('$#,##0.00').setHorizontalAlignment('center');
    return row + 2 + limit + 1;
  };

  var r = 15;
  r = block(r, 'WORKING — most internal-promo revenue', 'Col3 > 0', 'order by Col3 desc', 6);
  r = block(r, 'MANY SLOTS, LITTLE BACK — review the allocation',
            'Col2 >= 7 and Col4 < 10', 'order by Col4 asc', 6);
  r = block(r, 'GIVEN NO PROMO AT ALL', 'Col2 = 0', 'order by Col1 asc', 8);

  var S = AD_STYLE, rules = [];
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
    .setBackground(S.softRed).setRanges([sh.getRange('B11')]).build());
  sh.setConditionalFormatRules(rules);

  sh.setColumnWidth(1, 240); sh.setColumnWidth(2, 110); sh.setColumnWidth(3, 140);
  sh.setColumnWidth(4, 100); sh.setColumnWidth(5, 160);
  sh.setFrozenRows(4);
  sh.setTabColor(SECTION.promo);
  hideBeyond_(sh, 7);
}
