/**
 * UNCVRD — Internal Promo Weekly Report : sheet + formula builder
 * ============================================================================
 * `setup()` is idempotent. Run it whenever you want the tabs rebuilt; it only
 * ever rewrites Config / Weekly Report / Summary, never the source schedules.
 *
 * Everything the manager reads is a formula written here — the data-pull
 * script in Code.gs never writes a reported number.
 */

// ── Seed data ───────────────────────────────────────────────────────────────

/**
 * Name variants observed across the four schedule tabs, mapped to one
 * canonical name. Left column is matched loosely (case, punctuation and
 * spacing are ignored), so "Antonella/Lilly" arrives here as "antonella lilly".
 */
function seedAliases_() {
  return [
    ['Blue',            'Blue Bear'],
    ['Bluebear',        'Blue Bear'],
    ['Blue Bear',       'Blue Bear'],
    ['Soph',            'Sophie'],
    ['Sophie',          'Sophie'],
    ['Ash',             'Ashleigh'],
    ['Ashleigh',        'Ashleigh'],
    ['Ellla',           'Ella'],
    ['Ella',            'Ella'],
    ['Antonella',       'Antonella'],
    ['Antonella/Lilly', 'Antonella'],
    ['Lilly',           'Antonella'],
    ['Lily',            'Antonella'],
    ['Bella Leah',      'Bella Leah'],
    ['Marissa',         'Marissa'],
    ['Maylee',          'Maylee'],
    ['Emma',            'Emma'],
    ['Julie',           'Julie'],
    ['June',            'June'],
    ['Sandra',          'Sandra'],
    ['Angelina',        'Angelina'],
    ['Apple',           'Apple'],
    ['Meg',             'Meg'],
    ['Nicole',          'Nicole']
  ];
}

/**
 * OF page handle → the creator who owns that page.
 *
 * This map is deliberately explicit rather than inferred. Sandra's page is
 * `thisisjunee`, which any name-similarity heuristic reads as June — that
 * exact mistake is already live in the MM tab (row 16 logs a June promo
 * against a Sandra link). Guessing here would bake the error into the report.
 */
function seedHandles_() {
  return [
    ['ellaajanee',     'Ella'],
    ['lillyylou',      'Antonella'],
    ['juliejswan',     'Julie'],
    ['bluebeari3vip',  'Blue Bear'],
    ['celinerenxo',    'Sophie'],
    ['emmasonne',      'Emma'],
    ['marissa.munoz',  'Marissa'],
    ['junehaynes',     'June'],
    ['itsangelinabae', 'Angelina'],
    ['mayyy.leee',     'Maylee'],
    ['rosewhitex',     'Nicole'],
    ['thisisjunee',    'Sandra'],
    ['apple_kittii',   'Apple'],
    ['bella_leaa',     'Bella Leah']
  ];
}

/**
 * The full roster. Creators listed here appear in the report even in a week
 * where they received no promo at all — which is the point, since "who is
 * getting nothing?" is one of the questions being asked.
 */
function seedRoster_() {
  return ['Angelina', 'Antonella', 'Apple', 'Ashleigh', 'Bella Leah', 'Blue Bear',
          'Ella', 'Emma', 'Julie', 'June', 'Marissa', 'Maylee', 'Meg', 'Nicole',
          'Sandra', 'Sophie'];
}

// ── Setup ───────────────────────────────────────────────────────────────────

function setup() {
  buildConfig_();
  buildReport_();
  buildSummary_();
  sheet_(SH_SLOTS); sheet_(SH_REVENUE);
  ss_().setActiveSheet(ss_().getSheetByName(SH_REPORT));
  SpreadsheetApp.getUi().alert(
    'Sheets built.\n\n' +
    'Next: Project Settings → Script Properties → add ONLYFANSAPI_KEY,\n' +
    'then Promo → Refresh now.');
}

// ── Config ──────────────────────────────────────────────────────────────────

function buildConfig_() {
  var sh = sheet_(SH_CONFIG);
  sh.clear();
  var defs = configDefaults_();

  sh.getRange('A1').setValue('CONFIG — every tunable lives here')
    .setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setValue(
    'Edit the Value column only. Nothing in the report needs editing — the ' +
    'formulas all point at these cells by name.').setFontStyle('italic');

  sh.getRange(3, 1, 1, 4).setValues([['Key', 'Setting', 'Value', 'Notes']])
    .setFontWeight('bold').setBackground('#f1f3f4');
  sh.getRange(4, 1, defs.length, 4).setValues(defs);
  sh.getRange(4, 3, defs.length, 1).setBackground('#fff8e1');   // the editable column

  // Named ranges: formulas say CFG_MinSlots, not Config!$C$12.
  defs.forEach(function (d, i) {
    ss_().setNamedRange('CFG_' + d[0], sh.getRange(4 + i, 3));
  });

  // Lookup blocks, side by side so adding rows never shifts the settings.
  writeBlock_(sh, 'F', ['Alias (as typed)', 'Canonical Creator'], seedAliases_(), 200);
  writeBlock_(sh, 'I', ['OF Handle', 'Creator'], seedHandles_(), 100);
  writeBlock_(sh, 'L', ['Full Roster'],
              seedRoster_().map(function (r) { return [r]; }), 100);

  ss_().setNamedRange('CFG_Aliases', sh.getRange('F4:G200'));
  ss_().setNamedRange('CFG_Handles', sh.getRange('I4:J100'));
  ss_().setNamedRange('CFG_Roster',  sh.getRange('L4:L100'));

  sh.setColumnWidth(2, 300); sh.setColumnWidth(4, 380);
  sh.setFrozenRows(3);
}

function writeBlock_(sh, col, headers, rows, height) {
  var c = sh.getRange(col + '3').getColumn();
  sh.getRange(3, c, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#f1f3f4');
  if (rows.length) sh.getRange(4, c, rows.length, headers.length).setValues(rows);
}

// ── Weekly Report ───────────────────────────────────────────────────────────

function buildReport_() {
  var sh = sheet_(SH_REPORT);
  sh.clear();

  sh.getRange('A1').setValue('WEEKLY REPORT — internal promo allocation')
    .setFontSize(14).setFontWeight('bold');

  sh.getRange('A2').setValue('Week of').setFontWeight('bold');
  // Last COMPLETE week by default. On a Monday that is the week just finished,
  // which is what the manager is deciding about. CFG_WeekOverride freezes it.
  sh.getRange('C2').setFormula(
    '=IF(CFG_WeekOverride<>"", CFG_WeekOverride, ' +
    'TODAY()-MOD(WEEKDAY(TODAY(),2)-CFG_WeekStartDay+7,7)-7)');
  sh.getRange('D2').setValue('to');
  sh.getRange('E2').setFormula('=C2+6');
  sh.getRange('F2').setValue('Last refreshed').setFontWeight('bold');
  sh.getRange('C2:E2').setNumberFormat('ddd d mmm yyyy');
  sh.getRange('G2').setNumberFormat('ddd d mmm yyyy HH:mm');

  sh.getRange('A3').setValue('Roster average revenue per slot').setFontWeight('bold');
  sh.getRange('C3').setFormula('=IFERROR(SUM($C$5:$C)/SUM($B$5:$B),0)');
  ss_().setNamedRange('CALC_AvgRPS', sh.getRange('C3'));

  var headers = ['Creator', 'Weekly Slots', 'Weekly Revenue', 'Revenue per Slot',
                 'Previous Week Revenue', 'Change vs Previous Week', 'Recommendation'];
  sh.getRange(4, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#e8eaed');

  // A — every creator we know about: promoted this week, earned this week, or
  // on the roster. The roster term is what makes "getting nothing" visible.
  sh.getRange('A5').setFormula(
    '=SORT(UNIQUE(TOCOL({' +
      "'" + SH_SLOTS + "'!$E$2:$E; " +
      "'" + SH_REVENUE + "'!$C$2:$C; " +
      'CFG_Roster}, 1)))');

  // Week Start in the raw tabs is 'yyyy-MM-dd' TEXT (timezone-proof — see
  // ssTz_ in Code.gs), so match it with TEXT($C$2,…), not the date serial.
  var WK = 'TEXT($C$2,"yyyy-mm-dd")';
  var WKPREV = 'TEXT($C$2-7,"yyyy-mm-dd")';

  sh.getRange('B5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,SUMIFS(' +
      "'" + SH_SLOTS + "'!$G$2:$G," +
      "'" + SH_SLOTS + "'!$E$2:$E,$A$5:$A," +
      "'" + SH_SLOTS + "'!$B$2:$B," + WK + ')))');

  sh.getRange('C5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,SUMIFS(' +
      "'" + SH_REVENUE + "'!$D$2:$D," +
      "'" + SH_REVENUE + "'!$C$2:$C,$A$5:$A," +
      "'" + SH_REVENUE + "'!$B$2:$B," + WK + ')))');

  // Blank rather than 0 when there were no slots — dividing by zero slots is
  // undefined, and showing 0 would rank a creator who got nothing as "worst".
  sh.getRange('D5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,IF($B$5:$B=0,"",$C$5:$C/$B$5:$B)))');

  sh.getRange('E5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,SUMIFS(' +
      "'" + SH_REVENUE + "'!$D$2:$D," +
      "'" + SH_REVENUE + "'!$C$2:$C,$A$5:$A," +
      "'" + SH_REVENUE + "'!$B$2:$B," + WKPREV + ')))');

  // Hidden helper H — is this creator TRACKED this week? A creator with a
  // connected OF account gets a Raw Revenue row every week (even a $0 one), so
  // COUNTIFS>0 means "we have data". Zero means the page isn't wired to the API
  // — which must read as "Not Tracked", never as a real $0 that triggers a cut.
  sh.getRange('H5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,COUNTIFS(' +
      "'" + SH_REVENUE + "'!$C$2:$C,$A$5:$A," +
      "'" + SH_REVENUE + "'!$B$2:$B," + WK + ')))');

  // "New" where there is nothing to compare against, rather than a fake +100%.
  sh.getRange('F5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,' +
      'IF($E$5:$E=0,IF($C$5:$C>0,"New",""),($C$5:$C-$E$5:$E)/$E$5:$E)))');

  // Recommendation. Order matters — the first true branch wins.
  //   1 no slots, no revenue        → No Data
  //   2 got slots but page NOT wired to the API → Not Tracked   ← guards a
  //     data gap from reading as poor performance. A connected page gets a
  //     Raw Revenue row every week (even a $0 one), so H5=0 means "no account".
  //     Verified live 2026-08-03: 6 of 14 roster pages (Sophie, Angelina,
  //     Maylee, Sandra, Apple, Bella Leah) are not on the current token, so
  //     without this branch a promoted-but-untracked creator would be told to
  //     "Reduce" every week for a connection gap, not a real result.
  //   3 revenue with no slots       → Increase  (earning without promo)
  //   4 many slots, low revenue     → Reduce    (the boss's "poor results" case)
  //   5 beats the roster average and clears the absolute floor → Increase
  //   6 well under the average      → Reduce    (only when the roster average is
  //     itself > 0 — otherwise an all-$0 week would flag the whole roster)
  //   7 otherwise                   → Keep Current
  // MinSlots/MaxSlots act as guard rails so nobody is pushed past the agreed
  // range. Rows where slots = 0 are caught by branches 1 & 3, so the ""
  // in column D never reaches a numeric comparison.
  sh.getRange('G5').setFormula(
    '=ARRAYFORMULA(IF($A$5:$A="",,' +
    'IF(($B$5:$B=0)*($C$5:$C=0),"No Data",' +
    'IF(($H$5:$H=0)*($B$5:$B>0),"Not Tracked",' +
    'IF(($B$5:$B=0)*($C$5:$C>0),"Increase Allocation",' +
    'IF(($B$5:$B>=CFG_HighSlots)*($C$5:$C<CFG_LowRevenue),"Reduce Allocation",' +
    'IF(($D$5:$D>=CALC_AvgRPS*CFG_IncreaseFactor)*($C$5:$C>=CFG_MinRevIncrease)' +
      '*($B$5:$B<CFG_MaxSlots),"Increase Allocation",' +
    'IF(($D$5:$D<=CALC_AvgRPS*CFG_ReduceFactor)*($B$5:$B>CFG_MinSlots)*(CALC_AvgRPS>0),' +
      '"Reduce Allocation",' +
    '"Keep Current")))))))) ');

  sh.getRange('C5:C').setNumberFormat('$#,##0.00');
  sh.getRange('D5:D').setNumberFormat('$#,##0.00');
  sh.getRange('E5:E').setNumberFormat('$#,##0.00');
  sh.getRange('F5:F').setNumberFormat('+0.0%;-0.0%;0.0%');
  sh.setFrozenRows(4);
  sh.setColumnWidth(1, 150);
  for (var i = 2; i <= 7; i++) sh.setColumnWidth(i, 165);
  sh.hideColumns(8);                       // H is the "tracked?" helper for G5
  colourRecommendations_(sh);
}

/** Green / amber / red on the recommendation column so it reads at a glance. */
function colourRecommendations_(sh) {
  var rng = sh.getRange('A5:G1000');
  var rule = function (text, bg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=$G5="' + text + '"')
      .setBackground(bg).setRanges([rng]).build();
  };
  sh.setConditionalFormatRules([
    rule('Increase Allocation', '#d9ead3'),
    rule('Reduce Allocation',   '#f4cccc'),
    rule('Not Tracked',         '#cfe2f3'),   // blue — a data gap, NOT a result
    rule('No Data',             '#efefef')
  ]);
}

// ── Summary ─────────────────────────────────────────────────────────────────

function buildSummary_() {
  var sh = sheet_(SH_SUMMARY);
  sh.clear();
  var R = "'" + SH_REPORT + "'!";

  sh.getRange('A1').setValue('SUMMARY — week at a glance')
    .setFontSize(14).setFontWeight('bold');
  sh.getRange('A2').setFormula(
    '="Week of "&TEXT(' + R + 'C2,"d mmm yyyy")&" – "&TEXT(' + R + 'E2,"d mmm yyyy")')
    .setFontStyle('italic');

  var kpis = [
    ['Total Creators Promoted', '=COUNTIFS(' + R + 'B5:B,">0")'],
    ['Total Slots Given',       '=SUM(' + R + 'B5:B)'],
    ['Total Weekly Revenue',    '=SUM(' + R + 'C5:C)'],
    ['Average Revenue per Slot','=IFERROR(SUM(' + R + 'C5:C)/SUM(' + R + 'B5:B),0)'],
    ['Highest Performing Creator',
     '=IFERROR(INDEX(' + R + 'A5:A,MATCH(MAX(' + R + 'C5:C),' + R + 'C5:C,0)),"—")'],
    // Lowest is scoped to creators who ACTUALLY got slots — otherwise it just
    // returns whoever happens to be first alphabetically among the untouched.
    ['Lowest Performing Creator',
     '=IFERROR(INDEX(SORT(FILTER({' + R + 'A5:A,' + R + 'C5:C},' + R + 'B5:B>0),2,TRUE),1,1),"—")']
  ];
  sh.getRange(4, 1, 1, 2).setValues([['KPI', 'Value']])
    .setFontWeight('bold').setBackground('#e8eaed');
  kpis.forEach(function (k, i) {
    sh.getRange(5 + i, 1).setValue(k[0]);
    sh.getRange(5 + i, 2).setFormula(k[1]);
  });
  sh.getRange('B7').setNumberFormat('$#,##0.00');
  sh.getRange('B8').setNumberFormat('$#,##0.00');

  var lists = [
    ['Top Performing Creators',
     '=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER({' + R + 'A5:A,' + R + 'C5:C,' + R + 'B5:B},' +
       R + 'B5:B>0),2,FALSE),CFG_TopN,3),"—")'],
    ['Lowest Performing Creators (received slots)',
     '=IFERROR(ARRAY_CONSTRAIN(SORT(FILTER({' + R + 'A5:A,' + R + 'C5:C,' + R + 'B5:B},' +
       R + 'B5:B>0),2,TRUE),CFG_TopN,3),"—")'],
    ['Zero Revenue (but promoted)',
     '=IFERROR(FILTER({' + R + 'A5:A,' + R + 'C5:C,' + R + 'B5:B},' +
       R + 'B5:B>0,' + R + 'C5:C=0),"None 🎉")'],
    ['Many Slots, Low Revenue',
     '=IFERROR(FILTER({' + R + 'A5:A,' + R + 'C5:C,' + R + 'B5:B},' +
       R + 'B5:B>=CFG_HighSlots,' + R + 'C5:C<CFG_LowRevenue),"None")'],
    ['High Revenue, Few Slots',
     '=IFERROR(FILTER({' + R + 'A5:A,' + R + 'C5:C,' + R + 'B5:B},' +
       R + 'C5:C>=CFG_MinRevIncrease,' + R + 'B5:B<=CFG_MinSlots),"None")'],
    ['Receiving No Promo At All',
     '=IFERROR(FILTER(' + R + 'A5:A,' + R + 'B5:B=0),"None")']
  ];

  var row = 13;
  lists.forEach(function (l) {
    sh.getRange(row, 1).setValue(l[0]).setFontWeight('bold').setFontSize(11);
    sh.getRange(row + 1, 1, 1, 3).setValues([['Creator', 'Revenue', 'Slots']])
      .setFontWeight('bold').setBackground('#f1f3f4');
    sh.getRange(row + 2, 1).setFormula(l[1]);
    sh.getRange(row + 2, 2, 10, 1).setNumberFormat('$#,##0.00');
    row += 14;
  });

  sh.setColumnWidth(1, 260); sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 100);
  sh.setFrozenRows(3);
}
