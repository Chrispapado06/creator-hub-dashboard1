/**
 * UNCVRD — Salary Creator CRM : the daily report
 * ============================================================================
 * One page, one day. Everything Christos is answerable for on a given day,
 * with the standard it is measured against sitting next to it.
 *
 * Division of labour with the Dashboard, so the two do not drift into being
 * the same page:
 *   Dashboard    — the month and the open items. State.
 *   Daily Report — what happened on ONE day, and what still has to happen.
 *
 * Every target traces to the August doc or to Config, never to a number
 * invented here. Where a figure cannot be known — a creator the ad sheet does
 * not carry — it says so rather than showing a nought.
 */

var DAILY_ROWS = 12;    // salary creators on the money block
var ACCT_ROWS  = 24;    // live accounts on the coverage block
var TREND_DAYS = 14;

function buildDailyReport_() {
  var sh = sheet_(TABS.daily.name);
  var kept = keepCells_(sh, ['B2', 'D2']);
  resetTab_(sh, 130, 13);

  var D  = "'" + AD_DATA + "'!";
  var dt = D + '$A$2:$A', cr = D + '$B$2:$B',
      ck = D + '$D$2:$D', fn = D + '$E$2:$E', rv = D + '$G$2:$G';
  var CRE = "'" + TABS.creators.name + "'!";
  var live = 'COUNTIF(' + R_('creators', 'Status') + ',"Live")';

  adBanner_(sh, 10, 'UNCVRD — DAILY REPORT');
  sh.getRange('A2').setValue('Day ▸').setFontWeight('bold').setHorizontalAlignment('right');
  var yday = new Date(new Date().toDateString()); yday.setDate(yday.getDate() - 1);
  adInput_(sh, 'B2', yday, 'yyyy-mm-dd');
  sh.getRange('C2').setValue('Cost / click ▸').setFontWeight('bold').setHorizontalAlignment('right');
  adInput_(sh, 'D2', 0.75, '$#,##0.00');
  sh.getRange('F2').setFormula('=TEXT($B$2,"dddd d mmmm")')
    .setFontWeight('bold').setFontColor(AD_STYLE.banner);
  sh.getRange('A3').setValue(
    'One day, top to bottom. Targets come from the August doc via Config — change them there, not here. ' +
    'A creator with no "Ad sheet name" on Creators reports zero: that is a wiring gap, not a bad day.')
    .setFontSize(10).setFontColor(AD_STYLE.muted);

  // ── 1. the headline ────────────────────────────────────────────────────
  adSection_(sh, 5, 10, 'THE DAY IN ONE LINE');
  adHeader_(sh, 6, ['NEW SUBS', 'TOTAL earnings', 'of which via links', 'Ad spend', '$ / sub',
                    'Promo done', 'Promo target', 'Coverage', 'Needs action', '']);
  var money = 11, moneyEnd = money + DAILY_ROWS, promo = moneyEnd + 3;
  sh.getRange(7, 1).setFormula('=$G$' + moneyEnd);
  sh.getRange(7, 2).setFormula('=IF(N($H$' + moneyEnd + ')=0,"— not logged —",$H$' + moneyEnd + ')');
  sh.getRange(7, 3).setFormula('=$F$' + moneyEnd);
  sh.getRange(7, 4).setFormula('=$J$' + moneyEnd);
  sh.getRange(7, 5).setFormula('=IFERROR($B$7/$A$7,"")');
  sh.getRange(7, 6).setFormula('=$C$' + (promo + 5));
  sh.getRange(7, 7).setFormula('=$D$' + (promo + 5));
  sh.getRange(7, 8).setFormula('=IFERROR($F$7/$G$7,"")');
  sh.getRange(7, 9).setFormula('=COUNTIF($D$1:$D$200,"ACTION")');
  sh.getRange(7, 1, 1, 9).setFontSize(13).setFontWeight('bold')
    .setHorizontalAlignment('center').setBackground(AD_STYLE.dayTint);
  sh.setRowHeight(7, 30);

  // ── 2. the money, per salary creator ───────────────────────────────────
  adSection_(sh, 9, 12, 'THE MONEY   —   per salary creator, by tracking link');
  adHeader_(sh, 10, ['Creator', 'Ad sheet name', 'Ad-linked', 'Clicks', 'Subs (links)',
                     'Revenue (links)', 'NEW SUBS (all)', 'TOTAL earnings', '$ / sub',
                     'Ad spend', 'Profit (links)', 'vs 153/day']);
  sh.getRange(money, 1).setFormula(
    '=IFERROR(SORT(FILTER(' + CRE + '$A$4:$A,' + CRE + '$D$4:$D="Salary")),"")');

  // Grid, then one write. Column A is left alone — it holds the spilling
  // FILTER of salary creators and writing into it would block the spill.
  var E = function (h) { return R_('earnings', h); };
  var logged = function (r, col) {
    return 'IFERROR(IF(COUNTIFS(' + E('Date') + ',$B$2,' + E('Creator') + ',$A' + r +
           ')=0,"",SUMIFS(' + E(col) + ',' + E('Date') + ',$B$2,' + E('Creator') + ',$A' + r + ')),"")';
  };

  // Grid, then one write. Column A is left alone — it holds the spilling
  // FILTER of salary creators and writing into it would block the spill.
  var mGrid = [];
  for (var i = 0; i < DAILY_ROWS; i++) {
    var r = money + i, blank = '$A' + r + '=""', unwired = 'OR($A' + r + '="",$B' + r + '="")';
    var sums = function (rng) {
      return 'SUMIFS(' + rng + ',' + dt + ',$B$2,' + cr + ',$B' + r + ')';
    };
    mGrid.push([
      '=IF(' + blank + ',"",IFERROR(INDEX(' + CRE + '$H$4:$H,MATCH($A' + r + ',' + CRE + '$A$4:$A,0)),""))',
      '=IF(' + blank + ',"",IF($B' + r + '="","no ad-sheet name","yes"))',
      '=IF(' + unwired + ',"",' + sums(ck) + ')',
      '=IF(' + unwired + ',"",' + sums(fn) + ')',
      '=IF(' + unwired + ',"",' + sums(rv) + ')',
      // Total new subs and total earnings come from the OF API via Daily
      // Earnings. Link-attributed subs are a small slice of these — judging
      // pace on the slice made every creator read 0% when they were not.
      '=IF(' + blank + ',"",' + logged(r, 'New subs') + ')',
      '=IF(' + blank + ',"",' + logged(r, 'Total earnings $') + ')',
      '=IF(N($G' + r + ')=0,"",$H' + r + '/$G' + r + ')',
      '=IF($D' + r + '="","",$D' + r + '*$D$2)',
      '=IF($F' + r + '="","",$F' + r + '-N($J' + r + '))',
      '=IF($G' + r + '="","",IF($G' + r + '>=CFG_SUBS_PER_DAY,"on pace",' +
        'TEXT($G' + r + '/CFG_SUBS_PER_DAY,"0%")&" of pace"))'
    ]);
  }
  sh.getRange(money, 2, DAILY_ROWS, 11).setValues(mGrid);

  sh.getRange(moneyEnd, 1).setValue('TOTAL');
  [4, 5, 6, 7, 8, 10, 11].forEach(function (c) {
    sh.getRange(moneyEnd, c).setFormula(
      '=SUM(' + colA1_(c) + money + ':' + colA1_(c) + (moneyEnd - 1) + ')');
  });
  sh.getRange(moneyEnd, 9).setFormula('=IFERROR($H$' + moneyEnd + '/$G$' + moneyEnd + ',"")');
  sh.getRange(moneyEnd, 1, 1, 12).setFontWeight('bold');

  // ── 3. promo put out ───────────────────────────────────────────────────
  var F = function (h) { return R_('feed',  h); },
      S = function (h) { return R_('story', h); },
      M = function (h) { return R_('mm',    h); };
  var onDay = function (rng) { return rng + ',$B$2'; };

  adSection_(sh, promo, 10, 'PROMO PUT OUT   —   against the daily standard');
  adHeader_(sh, promo + 1, ['Channel', 'Scheduled', 'Done', 'Target', 'Coverage', 'Short by',
                            'Where it comes from', '', '', '']);

  // A post that has since expired still went out. Count every "did go out"
  // status, not just the one the VA happens to have left it on.
  var feedDone = [];
  [1, 2, 3, 4].forEach(function (n) {
    POSTED_STATES.forEach(function (st) {
      feedDone.push('COUNTIFS(' + onDay(F('Date')) + ',' + F('Status ' + n) + ',"' + st + '")');
    });
  });
  feedDone = feedDone.join('+');
  var chans = [
    ['Feed posts',
     '=' + ['1st Promote', '2nd Promote', '3rd Promote', '4th Promote'].map(function (h) {
       return 'COUNTIFS(' + onDay(F('Date')) + ',' + F(h) + ',"<>")';
     }).join('+'),
     '=' + feedDone,
     '=CFG_FEED_POSTS_PER_DAY*' + live,
     'p.25 — a new expiring post every few hours, model → SFS → model'],
    ['Story slots',
     '=' + ['1st Promoting Model', '2nd Promoting Model'].map(function (h) {
       return 'COUNTIFS(' + onDay(S('Date')) + ',' + S(h) + ',"<>")';
     }).join('+'),
     '=COUNTIFS(' + onDay(S('Date')) + ',' + S('Done 1') + ',TRUE)+' +
     'COUNTIFS(' + onDay(S('Date')) + ',' + S('Done 2') + ',TRUE)',
     '=CFG_PROMO_STORIES_PER_DAY*' + live,
     'p.21 #1 / p.23 #3 — promo slots only; her own stories are on top'],
    ['Mass DMs',
     '=COUNTIFS(' + onDay(M('Date')) + ',' + M('Promoted Creator') + ',"<>")',
     '=' + POSTED_STATES.map(function (st) {
       return 'COUNTIFS(' + onDay(M('Date')) + ',' + M('Status') + ',"' + st + '")';
     }).join('+'),
     '=CFG_MM_PER_DAY*' + live,
     'one per shift — Day, Evening, Late Evening']
  ];
  // No per-row merge for the note: G..J are empty, so it simply overflows and
  // the block writes in one call instead of eight.
  sh.getRange(promo + 2, 1, chans.length, 7).setValues(chans.map(function (c, i) {
    var r = promo + 2 + i;
    return [c[0], c[1], c[2], c[3],
            '=IFERROR($C' + r + '/$D' + r + ',"")',
            '=MAX(0,$D' + r + '-$C' + r + ')', c[4]];
  }));
  sh.getRange(promo + 2, 7, chans.length, 1).setFontSize(9).setFontColor(AD_STYLE.muted);
  var pTot = promo + 5;
  sh.getRange(pTot, 1).setValue('TOTAL');
  [2, 3, 4, 6].forEach(function (c) {
    sh.getRange(pTot, c).setFormula(
      '=SUM(' + colA1_(c) + (promo + 2) + ':' + colA1_(c) + (pTot - 1) + ')');
  });
  sh.getRange(pTot, 5).setFormula('=IFERROR($C' + pTot + '/$D' + pTot + ',"")');
  sh.getRange(pTot, 1, 1, 6).setFontWeight('bold');

  // ── 4. who actually posted ─────────────────────────────────────────────
  var acct = pTot + 2;
  adSection_(sh, acct, 10, 'WHO POSTED   —   every live account, this day');
  // The target belongs in the header, once — not repeated down every row in a
  // column called "of". Every account has the same target, so 24 rows of "4"
  // was 24 rows of noise on the page that is supposed to be the quickest read
  // in the file. These are live formulas, so they follow Config on their own.
  adHeader_(sh, acct + 1, ['Account',
    '="Feed  (of " & CFG_FEED_POSTS_PER_DAY & ")"',
    '="Story  (of " & CFG_PROMO_STORIES_PER_DAY & ")"',
    '="Mass DM  (of " & CFG_MM_PER_DAY & ")"',
    'Complete', 'Status', '', '', '', '']);
  var a0 = acct + 2;
  sh.getRange(a0, 1).setFormula(
    '=IFERROR(SORT(FILTER(' + CRE + '$A$4:$A,' + CRE + '$C$4:$C="Live")),"")');
  var aGrid = [];
  for (var j = 0; j < ACCT_ROWS; j++) {
    var ar = a0 + j, ab = '$A' + ar + '=""';
    var parts = [];
    [1, 2, 3, 4].forEach(function (n) {
      POSTED_STATES.forEach(function (st) {
        parts.push('COUNTIFS(' + onDay(F('Date')) + ',' + F('Model (Promoter)') + ',$A' + ar +
                   ',' + F('Status ' + n) + ',"' + st + '")');
      });
    });
    var fd = parts.join('+');
    var stCount = 'COUNTIFS(' + onDay(S('Date')) + ',' + S('Promoter') + ',$A' + ar +
                  ',' + S('Done 1') + ',TRUE)+COUNTIFS(' + onDay(S('Date')) + ',' +
                  S('Promoter') + ',$A' + ar + ',' + S('Done 2') + ',TRUE)';
    var mmCount = POSTED_STATES.map(function (st) {
      return 'COUNTIFS(' + onDay(M('Date')) + ',' + M('Promoting Creator') + ',$A' + ar +
             ',' + M('Status') + ',"' + st + '")';
    }).join('+');

    aGrid.push([
      '=IF(' + ab + ',"",' + fd + ')',
      '=IF(' + ab + ',"",' + stCount + ')',
      '=IF(' + ab + ',"",' + mmCount + ')',
      '=IF(' + ab + ',"",IFERROR(($B' + ar + '+$C' + ar + '+$D' + ar + ')/' +
        '(CFG_FEED_POSTS_PER_DAY+CFG_PROMO_STORIES_PER_DAY+CFG_MM_PER_DAY),""))',
      '=IF(' + ab + ',"",IF($E' + ar + '>=1,"full",IF($E' + ar + '=0,"nothing posted","short")))'
    ]);
  }
  sh.getRange(a0, 2, ACCT_ROWS, 5).setValues(aGrid);

  // ── 5–7. the operational blocks ────────────────────────────────────────
  var next = dailyMetrics_(sh, a0 + ACCT_ROWS + 1,
    'CONTENT & QC   —   nothing reaches a promo unchecked', [
    ['Shoots today', '=COUNTIF(' + R_('shoots', 'Shoot date') + ',$B$2)', '', '',
     'Confirm the location and who is on set — you or Sophie (p.16).'],
    ['Content received today', '=COUNTIF(' + R_('qc', 'Received') + ',$B$2)', '', '',
     'Every batch in gets a first QC before it goes near an editor.'],
    ['Awaiting your first QC', '=COUNTIF(' + R_('qc', 'Status') + ',"Awaiting QC")', '=0', 'zero',
     'p.16 — if she filmed the scripts wrong we paid for nothing.'],
    ['With editors past the SLA',
     '=COUNTIFS(' + R_('qc', 'Days in edit') + ',">"&CFG_QC_SLA_DAYS,' +
     R_('qc', 'Approved for use') + ',FALSE)', '=0', 'zero',
     'Chase JAR and the editing team — promos are waiting on this.'],
    ['Refilms outstanding', '=COUNTIF(' + R_('shoots', 'Refilm needed') + ',TRUE)', '=0', 'zero',
     'Content that failed QC and has not been reshot.'],
    ['Filmed, content never arrived',
     '=COUNTIFS(' + R_('shoots', 'Shoot status') + ',"Filmed",' +
     R_('shoots', 'Content received') + ',"")', '=0', 'zero',
     'She filmed and never sent it. Chase, in DeepL if needed (p.16).']
  ]);

  next = dailyMetrics_(sh, next, 'WHALES   —   the ones worth a year of spend', [
    ['Major whales ($3k+/month)', '=COUNTIF(' + R_('whales', 'Tier') + ',"MAJOR")', '', '',
     'p.8 #17 — go above and beyond to hold these.'],
    ['Outside the touchpoint SLA', '=COUNTIF(' + R_('whales', 'Touch SLA') + ',"LATE")', '=0', 'zero',
     'p.8 #15 — a personalised message every morning, plus non-sexual touchpoints.'],
    ['Touched today',
     '=COUNTIF(' + R_('whales', 'Last non-sexual touch') + ',$B$2)', '', '',
     'Counts against the register, not against anyone\'s memory.'],
    ['Transfers in progress',
     '=COUNTIF(' + R_('whales', 'Transfer status') + ',"Warming")+COUNTIF(' +
     R_('whales', 'Transfer status') + ',"Pitching")', '', '',
     'p.2 #6 — moving whales onto the salary accounts.']
  ]);

  next = dailyMetrics_(sh, next, 'MONEY OUT, GAPS & FLAGS', [
    ['Salaries due in the next 7 days',
     '=SUMIFS(' + R_('payments', 'Amount $') + ',' + R_('payments', 'Status') + ',"Due",' +
     R_('payments', 'Pay date') + ',"<="&$B$2+7)', '', '', 'p.16 — paid Monday, or on delivery.', '$#,##0'],
    ['OVERDUE salaries',
     '=SUMIFS(' + R_('payments', 'Amount $') + ',' + R_('payments', 'Status') + ',"Due",' +
     R_('payments', 'Pay date') + ',"<"&$B$2)', '=0', 'zero',
     'A silent overdue salary is how a creator churns.', '$#,##0'],
    ['Onboarding past the SLA', '=COUNTIF(' + R_('onboarding', 'Status') + ',"OVER SLA")', '=0', 'zero',
     'Open Onboarding and read the Blocker column.'],
    ['Scheduled promos with no tracking link',
     '=' + [['1st Promote', 'Link 1'], ['2nd Promote', 'Link 2'],
            ['3rd Promote', 'Link 3'], ['4th Promote', 'Link 4']].map(function (pp) {
       return 'COUNTIFS(' + F('Date') + ',">="&$B$2,' + F(pp[0]) + ',"<>",' + F(pp[1]) + ',"")';
     }).join('+'), '=0', 'zero',
     'Revenue nobody can attribute. The link auto-fills — blank means it was never created.'],
    ['Live pages not connected to the API',
     '=COUNTIFS(' + R_('creators', 'API tracked') + ',FALSE,' +
     R_('creators', 'Status') + ',"Live")', '=0', 'zero',
     'These report $0 no matter how they performed.'],
    ['Captions reused inside 7 days',
     '=COUNTIFS(' + R_('captions', 'Status') + ',"Active",' +
     R_('captions', 'Days since used') + ',"<7")', '=0', 'zero',
     'p.12 — volume only stays non-spammy if captions rotate.'],
    ['Open blockers',
     '=COUNTIFS(' + R_('flags', 'Severity') + ',"Blocker",' + R_('flags', 'Status') + ',"Open")',
     '=0', 'zero', 'p.7 — Luca asked to hear about these early, in capitals.'],
    ['Raised to Luca, still open',
     '=COUNTIFS(' + R_('flags', 'Flag to Luca') + ',TRUE,' + R_('flags', 'Status') + ',"Open")',
     '', '', 'You told him. Make sure it closes.']
  ]);

  // ── 8. the fortnight behind it ─────────────────────────────────────────
  adSection_(sh, next, 10, 'LAST ' + TREND_DAYS + ' DAYS   —   salary creators only');
  adHeader_(sh, next + 1, ['Day', '', '', 'Clicks', 'Subs', 'Revenue', '$ / sub', 'Spend',
                           'Profit', '']);
  var first = next + 2;
  var tGrid = [];
  for (var d = 0; d < TREND_DAYS; d++) {
    var rr = first + d;
    // Array criterion over the ad-sheet names resolved above: salary only.
    var day = function (rng) {
      return 'SUMPRODUCT(SUMIFS(' + rng + ',' + dt + ',$A' + rr + ',' + cr +
             ',$B$' + money + ':$B$' + (moneyEnd - 1) + '))';
    };
    // Totals come from Daily Earnings (the API); the link columns from the ad
    // sheet. Charting the link columns alone would draw a flat line and imply
    // the accounts were doing nothing.
    tGrid.push(['=$B$2-' + (TREND_DAYS - 1 - d),
      '=SUMIFS(' + R_('earnings', 'New subs') + ',' + R_('earnings', 'Date') + ',$A' + rr + ')',
      '=SUMIFS(' + R_('earnings', 'Total earnings $') + ',' + R_('earnings', 'Date') + ',$A' + rr + ')',
      '=' + day(ck), '=' + day(fn), '=' + day(rv),
      '=IF(N($B' + rr + ')=0,"",$C' + rr + '/$B' + rr + ')',
      '=$D' + rr + '*$D$2', '=$C' + rr + '-$H' + rr]);
  }
  sh.getRange(first, 1, TREND_DAYS, 9).setValues(tGrid);

  var trendEnd = first + TREND_DAYS - 1;
  clearCharts_(sh);
  addChart_(sh, {
    type: Charts.ChartType.COMBO, row: trendEnd + 2, col: 1,
    title: 'Last ' + TREND_DAYS + ' days — total earnings and new subs',
    ranges: [sh.getRange(first - 1, 1, TREND_DAYS + 1, 3)],
    width: 900, height: 340,
    options: {
      series: { 0: { type: 'bars', targetAxisIndex: 0, color: '#5b43f5' },
                1: { type: 'line',  targetAxisIndex: 1, color: '#4cd964', lineWidth: 3 } },
      vAxes: { 0: { title: 'New subs' }, 1: { title: 'Earnings ($)' } },
      hAxis: { slantedText: true, slantedTextAngle: 45 }
    }
  });

  dailyFormats_(sh, money, moneyEnd, promo, pTot, a0, first);
  dailyRules_(sh, money, moneyEnd, promo, pTot, a0, first, next);

  widths_(sh, [200, 125, 100, 75, 95, 110, 115, 120, 90, 95, 105, 110]);
  restoreCells_(sh, kept);
  sh.setFrozenRows(3);
  sh.setTabColor(SECTION.money);
  hideBeyond_(sh, 12);
}

/** label | now | target | status | why it matters. Returns the next free row. */
function dailyMetrics_(sh, row, title, rows) {
  adSection_(sh, row, 10, title);
  adHeader_(sh, row + 1, ['What', 'Now', 'Target', '', 'Why it matters', '', '', '', '', '']);
  sh.getRange(row + 2, 1, rows.length, 5).setValues(rows.map(function (m, i) {
    var r = row + 2 + i;
    return [m[0], m[1], m[2] || '',
            m[3] === 'zero' ? '=IF(N($B' + r + ')=0,"ok","ACTION")' : '',
            m[4]];
  }));
  sh.getRange(row + 2, 2, rows.length, 3).setHorizontalAlignment('center');
  sh.getRange(row + 2, 2, rows.length, 1).setFontWeight('bold');
  sh.getRange(row + 2, 4, rows.length, 1).setFontWeight('bold');
  sh.getRange(row + 2, 5, rows.length, 1).setFontSize(9).setFontColor(AD_STYLE.muted);
  rows.forEach(function (m, i) {
    if (m[5]) sh.getRange(row + 2 + i, 2, 1, 2).setNumberFormat(m[5]);
  });
  return row + 2 + rows.length + 1;
}

function dailyFormats_(sh, money, moneyEnd, promo, pTot, a0, first) {
  var n = moneyEnd - money + 1;
  [4, 5, 7].forEach(function (c) {
    sh.getRange(money, c, n, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
    sh.getRange(first, c, TREND_DAYS, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  });
  [6, 8, 9, 10, 11].forEach(function (c) {
    sh.getRange(money, c, n, 1).setNumberFormat('$#,##0.00').setHorizontalAlignment('center');
  });
  [3, 6, 7, 8, 9].forEach(function (c) {
    sh.getRange(first, c, TREND_DAYS, 1).setNumberFormat('$#,##0.00').setHorizontalAlignment('center');
  });
  sh.getRange(money, 7, n, 2).setBackground(AD_STYLE.input);   // from the API, not the ad sheet
  sh.getRange(first, 1, TREND_DAYS, 1).setNumberFormat('ddd, mmm d');
  sh.getRange(money, 10, n, 1).setBackground(AD_STYLE.calc);
  sh.getRange(first, 8, TREND_DAYS, 1).setBackground(AD_STYLE.calc);

  sh.getRange(7, 1).setNumberFormat('#,##0');
  sh.getRange(7, 2, 1, 3).setNumberFormat('$#,##0');
  sh.getRange(7, 5).setNumberFormat('$#,##0.00');
  sh.getRange(7, 6, 1, 2).setNumberFormat('#,##0');
  sh.getRange(7, 8).setNumberFormat('0%');
  sh.getRange(7, 9).setNumberFormat('#,##0');

  sh.getRange(promo + 2, 2, 4, 3).setNumberFormat('#,##0').setHorizontalAlignment('center');
  sh.getRange(promo + 2, 5, 4, 1).setNumberFormat('0%').setHorizontalAlignment('center');
  sh.getRange(promo + 2, 6, 4, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  sh.getRange(a0, 2, ACCT_ROWS, 3).setNumberFormat('#,##0').setHorizontalAlignment('center');
  sh.getRange(a0, 5, ACCT_ROWS, 1).setNumberFormat('0%').setHorizontalAlignment('center');
}

function dailyRules_(sh, money, moneyEnd, promo, pTot, a0, first, lastSection) {
  var S = AD_STYLE, rules = [];
  var R = function (a1) { return sh.getRange(a1); };
  var eq = function (a1, txt, bg) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(txt)
      .setBackground(bg).setRanges([R(a1)]).build());
  };

  eq('C' + money + ':C' + (moneyEnd - 1), 'no ad-sheet name', S.amber);
  eq('L' + money + ':L' + (moneyEnd - 1), 'on pace', S.softGrn);
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextContains('of pace')
    .setBackground(S.softRed).setRanges([R('L' + money + ':L' + (moneyEnd - 1))]).build());

  eq('F' + a0 + ':F' + (a0 + ACCT_ROWS - 1), 'full', S.softGrn);
  eq('F' + a0 + ':F' + (a0 + ACCT_ROWS - 1), 'short', S.amber);
  eq('F' + a0 + ':F' + (a0 + ACCT_ROWS - 1), 'nothing posted', S.red);

  // Every metric block's status column, wherever they landed.
  eq('D1:D' + lastSection, 'ok', S.softGrn);
  eq('D1:D' + lastSection, 'ACTION', S.red);

  [['K' + money + ':K' + moneyEnd], ['I' + first + ':I' + (first + TREND_DAYS - 1)]]
    .forEach(function (a) {
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
      .setFontColor('#137333').setRanges([R(a[0])]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberLessThan(0)
      .setFontColor('#c5221f').setBackground(S.softRed).setRanges([R(a[0])]).build());
  });

  // Coverage bars: green at target, amber part-way, red at nothing.
  [['E' + (promo + 2) + ':E' + pTot], ['E' + a0 + ':E' + (a0 + ACCT_ROWS - 1)], ['H7']]
    .forEach(function (a) {
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(1)
        .setBackground(S.softGrn).setRanges([R(a[0])]).build());
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThan(0)
        .setBackground(S.amber).setRanges([R(a[0])]).build());
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenNumberEqualTo(0)
        .setBackground(S.red).setRanges([R(a[0])]).build());
    });

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($A' + first + '<>"",$B' + first + '=0)')
    .setBackground(S.softRed)
    .setRanges([sh.getRange(first, 1, TREND_DAYS, 9)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$A' + money + '=""')
    .setBackground('#ffffff')
    .setRanges([sh.getRange(money, 1, DAILY_ROWS, 12)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$A' + a0 + '=""')
    .setBackground('#ffffff')
    .setRanges([sh.getRange(a0, 1, ACCT_ROWS, 10)]).build());

  sh.setConditionalFormatRules(rules);
}

// ── the 09:00 email ─────────────────────────────────────────────────────────

/**
 * Yesterday in one message: the money, the promo actually put out, and
 * whatever is late. Sent every morning whether the news is good or not — a
 * silent inbox is indistinguishable from a broken job.
 */
function dailySubsEmail() {
  var day = new Date(new Date().toDateString());
  day.setDate(day.getDate() - 1);
  var rows = dailyByCreator_(day);
  var promo = promoOnDay_(day);

  var earn = earningsOnDay_(day);
  var subs = rows.reduce(function (s, r) { return s + r.subs; }, 0);
  var rev  = rows.reduce(function (s, r) { return s + r.rev;  }, 0);
  var total = rows.reduce(function (s, r) { return s + (earn[r.name] || 0); }, 0);
  var logged = rows.filter(function (r) { return earn.hasOwnProperty(r.name); }).length;
  var unwired = rows.filter(function (r) { return !r.adName; });

  var html =
    '<p style="font-size:15px">' +
    (logged ? '<b>' + fmtMoney_(total) + ' earned</b> · ' : '') +
    '<b>' + subs + ' subs</b> · ' + fmtMoney_(rev) + ' from links' +
    '  ·  promo ' + promo.done + '/' + promo.target + '</p>';

  if (rows.length) {
    html += '<h3 style="font-size:13px;margin:16px 0 6px">The money</h3>' +
      table_(['Creator', 'Total earned', 'Subs', 'From links', '$ / sub', 'Clicks'],
        rows.map(function (r) {
          return [r.name + (r.adName ? '' : '  ⚠ not wired up'),
                  earn.hasOwnProperty(r.name) ? fmtMoney_(earn[r.name]) : 'not logged',
                  r.adName ? r.subs : '—',
                  r.adName ? fmtMoney_(r.rev) : '—',
                  r.adName && r.subs ? fmtMoney_(r.rev / r.subs) : '—',
                  r.adName ? r.clicks : '—'];
        }));
    if (logged < rows.length) {
      html += '<p style="color:#b3261e">' + (rows.length - logged) +
              ' creator(s) have no total earnings logged for that day — add them on ' +
              '<b>Daily Earnings</b>. The ad sheet only sees revenue it can attribute to a link.</p>';
    }
  }

  html += '<h3 style="font-size:13px;margin:16px 0 6px">Promo put out</h3>' +
    table_(['Channel', 'Done', 'Target', 'Short by'],
      promo.lines.map(function (l) {
        return [l.name, l.done, l.target, Math.max(0, l.target - l.done) || '—'];
      }));

  if (promo.silent.length) {
    html += '<p style="color:#b3261e"><b>' + promo.silent.length +
            ' account(s) posted nothing at all:</b> ' +
            promo.silent.map(esc_).join(', ') + '</p>';
  }
  if (unwired.length) {
    html += '<p style="color:#b3261e"><b>' + unwired.length + ' creator(s) report nothing</b> — ' +
            'no <b>Ad sheet name</b> on Creators, or the page is not connected yet: ' +
            unwired.map(function (r) { return esc_(r.name); }).join(', ') + '.</p>';
  }

  notify_(dayKey_(day) + ' — ' + (logged ? fmtMoney_(total) + ', ' : '') +
          subs + ' subs, promo ' + promo.done + '/' + promo.target, html);
  log_('dailySubsEmail', dayKey_(day) + ': ' + fmtMoney_(total) + ' total, ' + subs +
       ' subs, ' + fmtMoney_(rev) + ' links, promo ' + promo.done + '/' + promo.target);
}

/** What actually went out on a day, per channel, plus who posted nothing. */
function promoOnDay_(day) {
  var key = dayKey_(day);
  var liveNames = liveCreators_();
  var perAcct = {};
  liveNames.forEach(function (n) { perAcct[n] = 0; });

  var count = function (def, dateCol, acctCol, isDone) {
    var out = 0;
    tabRows_(def).forEach(function (r) {
      if (!(r[dateCol] instanceof Date) || dayKey_(r[dateCol]) !== key) return;
      var n = isDone(r);
      out += n;
      var a = String(r[acctCol] || '').trim();
      if (a && perAcct.hasOwnProperty(a)) perAcct[a] += n;
    });
    return out;
  };

  var wentOut = function (v) { return POSTED_STATES.indexOf(String(v)) >= 0; };
  var feed = count(TABS.feed, 'Date', 'Model (Promoter)', function (r) {
    return [1, 2, 3, 4].filter(function (n) { return wentOut(r['Status ' + n]); }).length;
  });
  var story = count(TABS.story, 'Date', 'Promoter', function (r) {
    return (r['Done 1'] === true ? 1 : 0) + (r['Done 2'] === true ? 1 : 0);
  });
  var mm = count(TABS.mm, 'Date', 'Promoting Creator', function (r) {
    return wentOut(r['Status']) ? 1 : 0;
  });

  var n = liveNames.length;
  var lines = [
    { name: 'Feed posts',  done: feed,  target: (Number(cfg_('FEED_POSTS_PER_DAY'))    || 4) * n },
    { name: 'Story slots', done: story, target: (Number(cfg_('PROMO_STORIES_PER_DAY')) || 2) * n },
    { name: 'Mass DMs',    done: mm,    target: (Number(cfg_('MM_PER_DAY'))            || 3) * n }
  ];
  return {
    lines: lines,
    done:   lines.reduce(function (s, l) { return s + l.done;   }, 0),
    target: lines.reduce(function (s, l) { return s + l.target; }, 0),
    silent: liveNames.filter(function (a) { return perAcct[a] === 0; })
  };
}

/** Total earnings logged for a day, keyed by creator. Absent means not logged. */
function earningsOnDay_(day) {
  var key = dayKey_(day), out = {};
  tabRows_(TABS.earnings).forEach(function (r) {
    if (!(r['Date'] instanceof Date) || dayKey_(r['Date']) !== key) return;
    var n = String(r['Creator'] || '').trim();
    if (!n) return;
    out[n] = (out[n] || 0) + (Number(r['Total earnings $']) || 0);
  });
  return out;
}

/** One entry per salary creator for a given day, read off the imported ad data. */
function dailyByCreator_(day) {
  var salary = creatorRows_().filter(function (c) { return c.type === 'Salary'; });
  if (!salary.length) return [];

  var sh = ss_().getSheetByName(AD_DATA);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];

  var key = dayKey_(day);
  var tally = {};
  sh.getRange(2, 1, last - 1, 7).getValues().forEach(function (r) {
    if (!(r[0] instanceof Date) || dayKey_(r[0]) !== key) return;
    var name = String(r[1]).trim();
    if (!name) return;
    if (!tally[name]) tally[name] = { clicks: 0, subs: 0, rev: 0 };
    tally[name].clicks += Number(r[3]) || 0;
    tally[name].subs   += Number(r[4]) || 0;
    tally[name].rev    += Number(r[6]) || 0;
  });

  return salary.map(function (c) {
    var t = (c.adName && tally[c.adName]) || { clicks: 0, subs: 0, rev: 0 };
    return { name: c.name, adName: c.adName, clicks: t.clicks, subs: t.subs, rev: t.rev };
  });
}
