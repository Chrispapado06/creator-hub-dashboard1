/**
 * UNCVRD — Salary Creator CRM : menu, generators and reminders
 * ============================================================================
 * Two things run on their own:
 *   Monday 06:00 — the salaries due this week, because Luca asked to be
 *                  reminded rather than to remember (p.16).
 *   Daily  07:00 — what is late: overdue payments, onboarding past the SLA,
 *                  content stuck with editors, whales outside the touch SLA,
 *                  blockers nobody has closed.
 *
 * Everything else is a menu item you press.
 */

/**
 * Six items and five submenus, not twenty-seven items.
 *
 * A flat menu this long runs off the bottom of a laptop screen, and Sheets
 * scrolls it silently — no arrow, no clipped row, just a list that appears to
 * start at whatever item happens to be in view. Someone looking for the seventh
 * entry sees the fourteenth and concludes the code never shipped.
 *
 * Only the things done routinely stay at the top level.
 */
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  var week = ui.createMenu('Promo week')
    .addItem('Generate promo week (feed + story)…','generatePromoWeek')
    .addItem('Clear a promo week (redo it)…',      'clearPromoWeek')
    .addItem('Roll promo plan forward a week',     'rollPromoPlan')
    .addSeparator()
    .addItem('Set up permanent SFS from the notes','seedPermanentSfs')
    .addItem('Move stray notes into the Notes column','tidyPlanNotes');

  var money = ui.createMenu('Money & OnlyFans')
    .addItem('Pull ALL money from OnlyFans now','pullMoneyNow')
    .addItem('Pull earnings only',              'pullEarningsNow')
    .addItem('Re-baseline this week',           'weeklyMoneyBaseline')
    .addSeparator()
    .addItem('Add this week\'s salary payments','generatePayments')
    .addItem('Refresh ad data now',             'dailyAdRefreshNow')
    .addItem('Roll everything to this week',    'weeklyRefreshNow')
    .addSeparator()
    .addItem('Test the OnlyFans connection',    'testOfConnection');

  var content = ui.createMenu('Content & DMs')
    .addItem('Index the content Drive',           'indexDriveContent')
    .addItem('Attach content to this week\'s DMs','attachMmContent');

  var captions = ui.createMenu('Captions')
    .addItem('Load our house captions',        'loadHouseCaptions')
    .addItem('Draft captions with Claude…',    'generateCaptions')
    .addItem('Find near-duplicate captions',   'findDuplicateCaptions')
    .addSeparator()
    .addItem('Back up the caption bank',       'backupCaptions')
    .addItem('Restore missing captions',       'restoreCaptions')
    .addSeparator()
    .addItem('Test the Claude connection',     'testAiConnection');

  var send = ui.createMenu('Send now')
    .addItem('The payment reminder',   'paymentReminder')
    .addItem('The daily digest',       'dailyDigest')
    .addItem('The daily subs report',  'dailySubsEmail')
    .addSeparator()
    .addItem('Install reminders',      'installTriggers')
    .addItem('Remove reminders',       'removeTriggers');

  var fix = ui.createMenu('Fix & repair')
    .addItem('Put Creators back (15 Aug snapshot)','repairCreators')
    .addSeparator()
    .addItem('Rename a creator (everywhere)…', 'renameCreator')
    .addItem('Remove a creator…',              'removeCreator')
    .addItem('Close the gaps (stray rows)',    'compactTabs')
    .addItem('Fill in missing Status / Type',  'fillRosterDefaults')
    .addSeparator()
    .addItem('Rebuild / repair tabs',          'installCRM');

  ui.createMenu('UNCVRD CRM')
    .addItem('Open the dashboard', 'gotoDashboard')
    .addSeparator()
    .addItem('⚡ Set up the whole week (one click)…','setUpWeek')
    .addSubMenu(week)
    .addSeparator()
    .addSubMenu(money)
    .addSubMenu(captions)
    .addSubMenu(content)
    .addSubMenu(send)
    .addSeparator()
    .addSubMenu(fix)
    .addItem('Health check', 'healthCheck')
    .addToUi();
}

function gotoDashboard() { ss_().setActiveSheet(sheet_(TABS.dash.name)); }

/** The nightly ad refresh, on demand — for when you want today's numbers now. */
function dailyAdRefreshNow() {
  dailyAdRefresh();
  var sh = ss_().getSheetByName(TABS.adStats.name);
  ss_().setActiveSheet(sh);
  alert_('Ad data refreshed',
    'Window: ' + sh.getRange('B2').getDisplayValue() + ' → ' + sh.getRange('D2').getDisplayValue() +
    '  (Range: ' + sh.getRange('H2').getDisplayValue() + ')\n\n' +
    'Imports re-pulled. If a number still looks stale, the ad sheet itself has ' +
    'not been written to yet — check the source.');
}

/** The Monday job, on demand. */
function weeklyRefreshNow() {
  var notes = weeklyRefresh();
  alert_('Rolled to this week', notes.join('\n'));
}

// ── Generators ──────────────────────────────────────────────────────────────

/**
 * Lays out a week of Feed and Story promo in the shape the team already fills
 * in: one row per posting account per day, promoting two other creators.
 *
 * The pairings rotate by day, so over a week every account promotes a
 * different pair each day and nobody promotes themselves — which is the part
 * that goes wrong when a week is written out by hand.
 *
 * Appends only. A day already laid out for an account is left alone, so
 * pressing this twice cannot double-book anyone.
 */
function generatePromoWeek() {
  var ui = ui_();
  if (!ui) {
    throw new Error('Run this from the sheet: UNCVRD CRM → Generate promo week. ' +
                    'It needs to ask you for a start date.');
  }
  var res = ui.prompt('Generate promo week',
    'Start date (yyyy-mm-dd). Blank = next Monday.\n\n' +
    'Writes 7 days for every creator whose Status is Live: feed posts, story ' +
    'slots and one mass DM per shift. Counts come from Config.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var txt   = res.getResponseText().trim();
  var start = txt ? new Date(txt + 'T00:00:00') : nextMonday_();
  if (isNaN(start.getTime())) { ui.alert('That is not a date. Use yyyy-mm-dd.'); return; }

  // The SFS cadence, not the platform cap. Three feed posts a day of which two
  // are cross-promo means two slots to place — reading the cap here asked for
  // three and left every third slot unfillable.
  var cad     = promoCadence_();
  var posts   = cad.feed, stories = cad.story, mmCount = cad.mm;
  var ORD     = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
  var need    = Math.max(posts, stories, mmCount) + 1;

  var roster = liveCreators_();
  if (!roster.length) {
    ui.alert('No creator on the Creators tab has Status = Live, so there are no accounts to post from.');
    return;
  }

  var pools     = promoPools_(start, posts, stories, mmCount);
  var pool      = pools.feed.concat(pools.story, pools.mm);
  var allocated = pool.length;
  if (!pool.length) {
    // Say what is actually on the tab. "No slots set" while the slots are
    // visibly on screen sends you hunting for a problem that is not there —
    // the real cause is nearly always a week that does not match, or slots
    // typed on a row with no creator.
    var want = weekKey_(start), weeks = {}, slotted = 0, noName = 0;
    tabRows_(TABS.promoPlan).forEach(function (r) {
      var k = weekKey_(r['Week starting']);
      var label = k || ('unreadable: "' + String(r['Week starting'] || '(blank)') + '"');
      var n = Number(r['Slots / day']) || 0;
      if (!weeks[label]) weeks[label] = { rows: 0, slots: 0 };
      weeks[label].rows++; weeks[label].slots += n;
      if (n > 0) { slotted++; if (!String(r['Creator'] || '').trim()) noName++; }
    });

    var found = Object.keys(weeks).sort().map(function (k) {
      return '   ' + k + ' — ' + weeks[k].rows + ' row(s), ' + weeks[k].slots + ' slot(s)';
    });

    var why = !slotted
      ? 'Nothing on the tab has a slot count above 0 yet.'
      : (noName
          ? noName + ' row(s) have slots but no creator name, so they cannot be used.'
          : 'Slots are set, but on a different week to the one you asked for.');

    var go = ui.alert('No allocation for that week',
      'Nothing usable for the week starting ' + want + '.\n\n' + why + '\n\n' +
      'What is on Internal Promo Plan:\n' + (found.length ? found.join('\n') : '   (tab is empty)') +
      '\n\nWrite the schedule with the promote cells EMPTY, for you to fill in?',
      ui.ButtonSet.YES_NO);
    if (go !== ui.Button.YES) return;
  }

  // A creator is never promoted twice by the same account on the same day, so
  // filling 4 feed slots needs 4 different creators available. Allocate one
  // creator and you get one promo and three blanks per day, with the sheet
  // reporting a cheerful success — which is exactly what happened on the first
  // real run: 8 slots to Antonella became 168 cells and everything else empty.
  // Each channel has a fixed number of cells to fill every day and the
  // allocation has to add up to it. Allocate under and cells sit blank;
  // allocate over and the surplus cannot be placed. Neither is visible from
  // the plan itself, so it gets checked here, per channel, before anything is
  // written — the first real run was 20 feed cells a day short while story and
  // MM were both over, and nothing said so.
  var room = { feed: roster.length * posts, story: roster.length * stories,
               mm: roster.length * mmCount };
  var want = { feed: 0, story: 0, mm: 0 };
  (pools.rows || []).forEach(function (p) {
    want.feed += p.perDay.feed; want.story += p.perDay.story; want.mm += p.perDay.mm;
  });

  var off = ['feed', 'story', 'mm'].filter(function (c) { return want[c] !== room[c]; });
  if (pool.length && off.length) {
    var line = function (c, label) {
      var d = want[c] - room[c];
      return '   ' + label + ': you allocated ' + want[c] + ' a day, there is room for ' +
             room[c] + (d === 0 ? '   ✓' : (d > 0 ? '   ' + d + ' too many' : '   ' + (-d) + ' short'));
    };
    var go2 = ui.alert('The allocation does not add up',
      'Every one of the ' + roster.length + ' live accounts posts ' + posts + ' feed, ' +
      stories + ' story and ' + mmCount + ' MM every day. That fixes how many promo ' +
      'cells exist, and the plan has to fill exactly that many.\n\n' +
      line('feed', 'Feed ') + '\n' + line('story', 'Story') + '\n' + line('mm', 'MM   ') + '\n\n' +
      'Short means blank cells. Too many means the surplus is never placed.\n\n' +
      'Generate anyway?',
      ui.ButtonSet.YES_NO);
    if (go2 !== ui.Button.YES) { ss_().setActiveSheet(sheet_(TABS.promoPlan.name)); return; }
  }

  var distinct = {};
  pool.forEach(function (n) { distinct[n] = 1; });
  var nDistinct = Object.keys(distinct).length;

  if (pool.length && nDistinct < need) {
    var keep = ui.alert('Only ' + nDistinct + ' creator(s) allocated',
      'Each account posts ' + posts + ' feed, ' + stories + ' story and ' + mmCount +
      ' MM promos a day, and never promotes the same creator twice in one day. That ' +
      'needs at least ' + need + ' creators with slots — you have ' + nDistinct + '.\n\n' +
      'Carry on and roughly ' + Math.round((1 - nDistinct / need) * 100) + '% of the ' +
      'promote cells will be left blank.\n\n' +
      'Go back and set slots on more creators instead?',
      ui.ButtonSet.YES_NO);
    if (keep === ui.Button.YES) { ss_().setActiveSheet(sheet_(TABS.promoPlan.name)); return; }
  }

  var w        = writeWeek_(start, roster, pools);
  var feed = w.feed, story = w.story, mm = w.mm;
  var placed   = w.placed;
  var unplaced = allocated - placed;
  var capacity = roster.length * 7 * (posts + stories + mmCount);

  log_('generatePromoWeek',
    feed + ' feed, ' + story + ' story, ' + mm + ' MM rows from ' + dayKey_(start) +
    '; ' + placed + '/' + allocated + ' slots placed, capacity ' + capacity);

  // Nothing written is not a success. Measured in SLOTS placed, not rows added:
  // the writer now fills the gaps inside rows that already exist, so a run that
  // scheduled 300 promotions into existing rows adds no rows at all and would
  // have reported itself a failure.
  if (placed === 0) {
    ui.alert('Nothing was written',
      'Every slot for the week starting ' + dayKey_(start) + ' is already filled or ' +
      'locked, so there was nothing to place.\n\n' +
      'A slot is locked once it has a tracking link, a caption, or a status past ' +
      '"Scheduled" — that is deliberate, so a regenerate never throws away work.\n\n' +
      'Run "Clear a promo week (redo it)" for ' + dayKey_(start) + ' first if you ' +
      'want the untouched slots re-dealt.',
      ui.ButtonSet.OK);
    return;
  }

  ui.alert('Promo week written',
    feed + ' feed rows, ' + story + ' story rows and ' + mm + ' MM rows added for ' +
    roster.length + ' accounts, starting ' + dayKey_(start) + '.\n\n' +
    (allocated
      ? 'Slots allocated: ' + allocated + '\n' +
        'Actually placed:  ' + placed +
        (unplaced ? '   (' + unplaced + ' could not be placed)' : '   (all of them)') + '\n' +
        'Room in the week: ' + capacity + '\n\n' +
        (unplaced
          ? 'A slot goes unplaced when there is nowhere left that can take it — she ' +
            'cannot promote herself, and cannot appear twice for one account on one ' +
            'day. Spread the allocation across more creators to place them all.\n\n'
          : '') +
        (capacity - placed > 0
          ? (capacity - placed) + ' promote cell(s) are blank because nothing was ' +
            'allocated to them. Allocate more slots if you want a fuller week.\n\n'
          : '')
      : 'Promote cells left EMPTY: no allocation was set for that week.\n\n') +
    'Tracking links fill themselves in once you pick who is promoted. ' +
    'Captions are yours to write — check the Caption Bank for one that has rested.',
    ui.ButtonSet.OK);
}

/**
 * Who gets promoted, and how often, comes from the Internal Promo Plan for
 * that week — NOT from a rotation.
 *
 * An even round-robin is the wrong default: some creators are worth more slots
 * than others, and deciding that is the weekly job (Luca p.23 #2). This builds
 * a pool where each creator appears once per slot allocated to her, interleaved
 * so a heavily-promoted creator is spread across the week instead of bunched.
 *
 * Returns [] when the week has no plan — in which case the schedule is written
 * with the promote cells EMPTY, for someone to fill in deliberately.
 */
/**
 * Read a "Week starting" cell the way a person means it.
 *
 * The original demanded a real Date object and silently skipped anything else,
 * so a row reading "August 10-17" — which is how the team actually writes a
 * week — produced an empty pool and a dialog claiming no slots were set, while
 * the slots sat right there on screen. Text is now understood, including the
 * day-range form, and a date anywhere inside the week counts as that week.
 *
 * Returns null when there is genuinely nothing date-like to read.
 */
var MONTHS_ = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6,
                aug:7, sep:8, oct:9, nov:10, dec:11 };

function parseWeekCell_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  var s = String(v || '').trim();
  if (!s) return null;

  // Parsed by hand, deliberately. new Date(string) is far too lenient to trust
  // on free text: it reads "August 10-17" as August 10th *2017*, turns
  // "August 10" into the year 2001, and even gives "not a week" a date. Every
  // one of those is a silent wrong answer, which is worse than no answer.

  var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);          // 2026-08-10
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);

  var mon = null;
  (s.match(/[A-Za-z]{3,}/g) || []).forEach(function (w) {      // "Week of August 10"
    if (mon !== null) return;
    var k = w.slice(0, 3).toLowerCase();
    if (MONTHS_.hasOwnProperty(k)) mon = MONTHS_[k];
  });
  if (mon === null) return null;

  var y   = s.match(/\b(\d{4})\b/);
  var day = s.replace(/\b\d{4}\b/g, ' ').match(/\b(\d{1,2})\b/);   // "10" of "10-17"
  if (!day) return null;
  var dd = +day[1];
  if (dd < 1 || dd > 31) return null;

  return new Date(y ? +y[1] : new Date().getFullYear(), mon, dd);
}

/** The Monday of whatever week a date falls in, as yyyy-MM-dd. */
function weekKey_(v) {
  var d = parseWeekCell_(v);
  if (!d) return '';
  var m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));   // Sun=0 → back 6, Mon=1 → back 0
  return dayKey_(m);
}

/**
 * Delete a week's rows from the three promo schedules so it can be generated
 * again.
 *
 * Needed because addPromoRows_ skips any date+account it has already written.
 * Without this, a week generated from a bad allocation is permanent: re-running
 * leaves the wrong rows exactly where they are and only bolts new accounts on
 * the end, which is worse than either version on its own.
 *
 * NEVER deletes work already done. Any row a VA has touched — a feed or MM
 * status that is no longer "Scheduled", a story ticked Done — is left alone and
 * counted back to you. Only untouched, still-Scheduled rows go.
 */

/**
 * Remove a week's untouched rows from the three schedules. Anything the team
 * has already worked — a status past "Scheduled", a story ticked Done — stays.
 */
function clearPromoWeek() {
  var ui = ui_();
  var start = nextMonday_();
  if (ui) {
    var ask = ui.prompt('Clear a promo week',
      'Delete the generated rows for which week? Blank = ' + dayKey_(start) + '.\n\n' +
      'Rows the team has already worked — anything not still "Scheduled", and any ' +
      'story ticked Done — are kept. Only untouched rows are removed, so you can ' +
      'safely regenerate the week.',
      ui.ButtonSet.OK_CANCEL);
    if (ask.getSelectedButton() !== ui.Button.OK) return;
    var txt = ask.getResponseText().trim();
    if (txt) {
      var p = parseWeekCell_(txt);
      if (!p) { ui.alert('That is not a date. Use yyyy-mm-dd.'); return; }
      start = p;
    }
  }
  var want = weekKey_(start);
  var res = clearWeek_(start);
  var removed = res.removed, kept = res.kept, detail = res.detail;

  log_('clearPromoWeek', want + ' — ' + removed + ' removed, ' + kept + ' kept');
  alert_('Promo week cleared',
    removed + ' row(s) removed for the week of ' + want + '.\n\n' + detail.join('\n') +
    (kept ? '\n\n' + kept + ' row(s) were kept because they had already been worked. ' +
            'Delete those by hand if you really want the week wiped.' : '') +
    '\n\nSet your slots on Internal Promo Plan, then Generate promo week again.');
}

/**
 * Read one week's allocation into three pools — one per channel.
 *
 * Three, not one, because the schedules are written in order: feed, then story,
 * then MM. A single shared pool of real quotas would be drained entirely by
 * feed, leaving story and MM blank no matter what you allocated.
 *
 * The Feed / Story / MM columns are the per-channel quota and are used as typed.
 * Fill in only "Slots / day" and it is split across the three in the ratio
 * the accounts actually post at (4 feed : 2 story : 3 MM), with the rounding
 * remainder going to MM so the three always add back to the total you wrote.
 */
var PROMO_DAYS = 7;   // a promo week is seven days; the plan is filled in per day

function promoPools_(weekStart, posts, stories, mmCount) {
  var key = weekKey_(weekStart), per = [];
  var w = posts + stories + mmCount;

  tabRows_(TABS.promoPlan).forEach(function (r) {
    if (weekKey_(r['Week starting']) !== key) return;
    var n = String(r['Creator'] || '').trim();
    if (!n) return;

    var f = Number(r['Feed']) || 0,
        s = Number(r['Story']) || 0,
        m = Number(r['MM']) || 0;

    if (f + s + m === 0) {
      var total = Number(r['Slots / day']) || 0;
      if (total <= 0) return;
      f = Math.round(total * posts / w);
      s = Math.round(total * stories / w);
      m = total - f - s;                      // remainder here, so f+s+m === total
      if (m < 0) { m = 0; }
    }

    // The tab is filled in PER DAY — the numbers the team types sum to one
    // day's posting, not one week's. Read as weekly totals they came out at
    // about a ninth of what was meant, and the feed rows were mostly blank.
    per.push({ name: n, feed: f * PROMO_DAYS, story: s * PROMO_DAYS, mm: m * PROMO_DAYS,
               perDay: { feed: f, story: s, mm: m } });
  });

  var pick = function (ch) {
    return smoothPool_(per.map(function (p) { return { name: p.name, slots: p[ch] }; })
                          .filter(function (p) { return p.slots > 0; }));
  };
  return { feed: pick('feed'), story: pick('story'), mm: pick('mm'), rows: per };
}

function smoothPool_(byCreator) {
  if (!byCreator.length) return [];

  // Smooth proportional spread, not a round-robin deal. A plain deal empties
  // the small allocations first and leaves the back half of the week as one
  // creator over and over; this keeps everyone at their share throughout, so
  // a creator on 30 slots appears steadily rather than in a block.
  var total = byCreator.reduce(function (n, c) { return n + c.slots; }, 0);
  var left = byCreator.map(function (c) { return c.slots; });
  var credit = byCreator.map(function () { return 0; });
  var pool = [];

  for (var pos = 0; pos < total; pos++) {
    var best = -1, bestCredit = -Infinity;
    for (var i = 0; i < byCreator.length; i++) {
      if (left[i] <= 0) continue;
      credit[i] += byCreator[i].slots / total;
      if (credit[i] > bestCredit) { bestCredit = credit[i]; best = i; }
    }
    if (best < 0) break;
    pool.push(byCreator[best].name);
    credit[best] -= 1;
    left[best]--;
  }
  return pool;
}

/**
 * Take the next `k` from the allocation pool, skipping the account itself and
 * anything already used in this row. Returns blanks once the pool is spent —
 * a creator's slots run out, and the schedule should show that rather than
 * quietly giving her more.
 */
/**
 * Take k promotions off the pool, consuming them.
 *
 * The pool is a QUOTA, not a weighting. Allocate Antonella 10 slots and her
 * name is in the pool exactly ten times; once those ten are dealt she stops
 * appearing, and 10 slots this week against 5 next week means exactly what it
 * says on the tin.
 *
 * It used to read the pool cyclically — pool[i % length] — which meant it never
 * ran out and the numbers you typed only ever set proportions. Allocating 8
 * slots produced 168 actual placements, so "8" and "4" were a ratio wearing a
 * count's clothing, and week-on-week $/slot could not be compared.
 *
 * Entries are skipped, never consumed, when they cannot be used here: nobody
 * promotes herself, and nobody appears twice for one account on one day. So a
 * skipped slot stays in the pool for the next account rather than evaporating.
 */
/**
 * Spread a shortfall evenly instead of letting the early rows eat it all.
 *
 * The schedules are written day by day, account by account, and each row takes
 * what it needs off the front of the pool. If the allocation is smaller than
 * the week's capacity that is fine in aggregate but brutal in detail: the first
 * rows fill completely and the last ones get nothing at all. On a real run that
 * left four accounts with zero feed posts for the entire week while the rest
 * had their full four a day.
 *
 * Returns a function that answers "how many should THIS row get", carrying the
 * fractional remainder so the totals still land exactly on the pool size.
 */
function takeFromPool_(pool, promoter, k, exclude, pairUse) {
  // Take from the FRONT of the pool, never "whoever has most left".
  //
  // smoothPool_ has already interleaved the pool so each creator's entries are
  // spread evenly through it; walking it in order is what turns that into an
  // even spread across the seven days. Picking the largest remaining balance
  // instead — which I did briefly, to squeeze out the last few unplaced slots —
  // front-loads the week catastrophically: every big allocation is spent on
  // Monday and Friday gets the leftovers. On a real run that put one creator on
  // ten Monday feed posts against a quota of four.
  //
  // The cost of ordering it this way is a handful of slots stranded at the very
  // end of the week, when the only names left belong to the account being
  // dealt. A few unplaced beats a wrecked distribution.
  // Matched case-insensitively. The exclusion set is built from names read off
  // the schedule, the pool from names read off the plan; the same creator
  // spelled with a different capital in one of the two would slip past and be
  // promoted twice by the same account on the same day.
  var out = [], seen = exclude || {}, self = String(promoter).toLowerCase();
  var use = pairUse || {};

  while (out.length < k) {
    // Take the FRONT-MOST candidate this account has used LEAST this week.
    //
    // Front-most on its own is what spreads a creator evenly across the seven
    // days, and it is why the pool is smoothed — but on its own it also handed
    // the same account the same girl every single day: 82% of slots ran on a
    // pairing that appeared more than once, Antonella promoting Kiara seven
    // times in a week. Least-used first, front-most as the tie-break, keeps the
    // day-spread and stops the schedule reading like a copy-paste.
    var idx = -1, best = Infinity;
    for (var i = 0; i < pool.length; i++) {
      var lower = String(pool[i]).toLowerCase();
      if (lower === self || seen[lower]) continue;
      var n = use[self + '|' + lower] || 0;
      if (n < best) { best = n; idx = i; if (!n) break; }   // unused — take it now
    }
    if (idx < 0) break;                        // nothing left this row can use

    var name = pool.splice(idx, 1)[0];
    var key  = self + '|' + String(name).toLowerCase();
    use[key] = (use[key] || 0) + 1;
    seen[String(name).toLowerCase()] = true;
    out.push(name);
  }
  while (out.length < k) out.push('');
  return out;
}

/** One Internal Promo Plan row per Live creator for next week, carrying last week's numbers. */
function rollPromoPlan() {
  var def  = TABS.promoPlan;
  var sh   = sheet_(def.name);
  var week = nextMonday_();
  var live = liveCreators_();
  if (!live.length) {
    alert_('No creator has Status = Live on the Creators tab.');
    return;
  }

  var iWeek  = headerIndex_(def, 'Week starting') - 1;
  var iCrea  = headerIndex_(def, 'Creator') - 1;
  var iSlots = headerIndex_(def, 'Slots / day') - 1;
  var iLock  = headerIndex_(def, 'Slots locked') - 1;
  var iPerm  = headerIndex_(def, 'Permanent feed SFS') - 1;

  // The most recent EARLIER week each creator has a row for. This function used
  // to write blank rows while its own comment claimed it carried the numbers
  // forward, so every roll quietly handed the allocation back to the tier
  // weights and the owner's decision vanished a week after he made it.
  var have = {}, prev = {};
  var want = weekKey_(week);
  var last = sh.getLastRow();
  if (last >= FIRST_ROW) {
    sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues()
      .forEach(function (r) {
        var name = String(r[iCrea] || '').trim();
        if (!name || !r[iWeek]) return;
        var k = weekKey_(r[iWeek]);
        have[k + '|' + name] = true;
        if (k >= want) return;                                  // this week or later
        if (!prev[name] || k > prev[name].week) {
          prev[name] = { week: k, slots: r[iSlots], locked: r[iLock] === true };
        }
      });
  }

  var carried = 0;
  var rows = live.filter(function (c) { return !have[want + '|' + c]; })
                 .map(function (c) {
    var r = new Array(def.headers.length).fill('');
    r[iWeek] = new Date(week.getTime());
    r[iCrea] = c;
    r[iPerm] = false;
    r[iLock] = false;
    var p = prev[c];
    if (p && p.slots !== '' && p.slots !== null && !isNaN(Number(p.slots))) {
      r[iSlots] = Number(p.slots);
      // Carried numbers stay hers: locked, so "Set up the whole week" plans
      // around them instead of redistributing by tier.
      r[iLock]  = true;
      carried++;
    }
    return r;
  });

  if (!rows.length) {
    alert_('Week of ' + dayKey_(week) + ' is already planned for every Live creator.');
    return;
  }

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  sh.getRange(at, 1, rows.length, def.headers.length).setValues(rows);
  sh.getRange(at, headerIndex_(def, 'Week starting'), rows.length, 1).setNumberFormat('yyyy-mm-dd');
  ['Permanent feed SFS', 'Slots locked'].forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).insertCheckboxes();
  });
  // The two prev-week columns are formulas; copy them down onto the new rows.
  ['Prev-week slots', 'Prev-week $ / slot'].forEach(function (h) {
    var tpl = def.calc[h];
    var out = [];
    for (var i = 0; i < rows.length; i++) out.push([tpl.replace(/\{r\}/g, String(at + i))]);
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).setFormulas(out)
      .setBackground(C.calc);
  });

  log_('rollPromoPlan', rows.length + ' creators for week of ' + dayKey_(week));
  ss_().setActiveSheet(sh);
  alert_(
    rows.length + ' rows added for the week of ' + dayKey_(week) + '.\n\n' +
    (carried ? carried + ' of them carry last week\'s "Slots / day" forward, ticked as locked ' +
       'so the allocator plans around them rather than redistributing by tier. Change any ' +
       'number and it stays changed.\n\n'
     : 'None had an earlier week to copy from, so the slot counts are blank and will be ' +
       'worked out by tier when you set up the week.\n\n') +
    'Last week\'s slots and $/slot fill in from the SFS Weekly Report. ' +
    'Adjust the numbers, then get Liz or Lance to approve.');
}

/** A Salary Payments row for every Live salary creator, dated the next pay day. */
function generatePayments() {
  var def = TABS.payments;
  var sh  = sheet_(def.name);
  var pay = nextWeekday_(String(cfg_('PAY_DAY') || 'Monday'));

  var creators = creatorRows_().filter(function (c) {
    return c.status === 'Live' && c.type === 'Salary' && Number(c.salary) > 0;
  });
  if (!creators.length) {
    alert_(
      'No rows added.\n\nA creator only appears here when, on the Creators tab, ' +
      'Status = Live, Type = Salary and Salary $/wk is filled in.');
    return;
  }

  var iDate = headerIndex_(def, 'Pay date') - 1;
  var iName = headerIndex_(def, 'Creator') - 1;
  var have  = {};
  var last  = sh.getLastRow();
  if (last >= FIRST_ROW) {
    sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues()
      .forEach(function (r) {
        if (r[iName] && r[iDate]) have[dayKey_(r[iDate]) + '|' + r[iName]] = true;
      });
  }

  var rows = creators.filter(function (c) { return !have[dayKey_(pay) + '|' + c.name]; })
                     .map(function (c) {
    var r = new Array(def.headers.length).fill('');
    r[iDate] = new Date(pay.getTime());
    r[iName] = c.name;
    r[headerIndex_(def, 'Amount $') - 1]          = Number(c.salary);
    r[headerIndex_(def, 'Method') - 1]            = c.method || '';
    r[headerIndex_(def, 'Content delivered') - 1] = false;
    r[headerIndex_(def, 'Status') - 1]            = 'Due';
    return r;
  });

  if (!rows.length) {
    alert_(dayKey_(pay) + ' is already raised for everyone.');
    return;
  }

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  sh.getRange(at, 1, rows.length, def.headers.length).setValues(rows);
  sh.getRange(at, headerIndex_(def, 'Pay date'), rows.length, 1).setNumberFormat('yyyy-mm-dd');
  sh.getRange(at, headerIndex_(def, 'Amount $'), rows.length, 1).setNumberFormat('$#,##0.00');
  sh.getRange(at, headerIndex_(def, 'Content delivered'), rows.length, 1).insertCheckboxes();

  log_('generatePayments', rows.length + ' payments for ' + dayKey_(pay));
  ss_().setActiveSheet(sh);
  alert_(rows.length + ' payments raised for ' + dayKey_(pay) + '.');
}

// ── Reminders ───────────────────────────────────────────────────────────────

function paymentReminder() {
  var def  = TABS.payments;
  var rows = tabRows_(def);
  var soon = new Date(); soon.setDate(soon.getDate() + 7);

  var due = rows.filter(function (r) {
    var d = r['Pay date'];
    return r['Status'] === 'Due' && d instanceof Date && d <= soon;
  }).sort(function (a, b) { return a['Pay date'] - b['Pay date']; });

  if (!due.length) { notify_('Salaries — nothing due', '<p>Nothing due in the next 7 days.</p>'); return; }

  var total = due.reduce(function (s, r) { return s + (Number(r['Amount $']) || 0); }, 0);
  var late  = due.filter(function (r) { return r['Pay date'] < new Date(new Date().toDateString()); });

  var html = '<p><b>' + due.length + '</b> payments, <b>' + fmtMoney_(total) + '</b> total.' +
             (late.length ? ' <span style="color:#b3261e"><b>' + late.length + ' already overdue.</b></span>' : '') +
             '</p>' + table_(
    ['Pay date', 'Creator', 'Amount', 'Method', 'Content in?'],
    due.map(function (r) {
      return [dayKey_(r['Pay date']), r['Creator'], fmtMoney_(r['Amount $']),
              r['Method'] || '—', r['Content delivered'] === true ? 'yes' : 'no'];
    }));

  notify_('Salaries due this week — ' + fmtMoney_(total), html);
}

function dailyDigest() {
  var today = new Date(new Date().toDateString());
  var parts = [];

  var pay = tabRows_(TABS.payments).filter(function (r) {
    return r['Status'] === 'Due' && r['Pay date'] instanceof Date && r['Pay date'] < today;
  });
  if (pay.length) parts.push(section_('Overdue salaries', ['Creator', 'Was due', 'Amount'],
    pay.map(function (r) { return [r['Creator'], dayKey_(r['Pay date']), fmtMoney_(r['Amount $'])]; })));

  var onb = tabRows_(TABS.onboarding).filter(function (r) { return r['Status'] === 'OVER SLA'; });
  if (onb.length) parts.push(section_('Onboarding past the SLA', ['Creator', 'Days', 'Blocker'],
    onb.map(function (r) { return [r['Creator'], r['Days in onboarding'], r['Blocker'] || '—']; })));

  var sla = Number(cfg_('QC_SLA_DAYS')) || 3;
  var qc  = tabRows_(TABS.qc).filter(function (r) {
    return r['Approved for use'] !== true && Number(r['Days in edit']) > sla;
  });
  if (qc.length) parts.push(section_('Content stuck with editors', ['Creator', 'Batch', 'Days in edit'],
    qc.map(function (r) { return [r['Creator'], r['Batch / asset'], r['Days in edit']]; })));

  var shoot = tabRows_(TABS.shoots).filter(function (r) {
    return r['Shoot status'] === 'Filmed' && !(r['Content received'] instanceof Date);
  });
  if (shoot.length) parts.push(section_('Filmed, content never arrived', ['Creator', 'Shoot date'],
    shoot.map(function (r) { return [r['Creator'], dayKey_(r['Shoot date'])]; })));

  var whale = tabRows_(TABS.whales).filter(function (r) { return r['Touch SLA'] === 'LATE'; });
  if (whale.length) parts.push(section_('Whales outside the touchpoint SLA',
    ['Fan', 'Account', 'Monthly spend', 'Days since touch'],
    whale.map(function (r) {
      return [r['Fan alias'], r['Current account'], fmtMoney_(r['Monthly spend $']), r['Days since touch']];
    })));

  var flags = tabRows_(TABS.flags).filter(function (r) {
    return r['Severity'] === 'Blocker' && r['Status'] !== 'Done' && r['Status'] !== 'Dropped';
  });
  if (flags.length) parts.push(section_('Open blockers', ['Area', 'Who', 'Issue', 'Days open'],
    flags.map(function (r) {
      return [r['Area'], r['Creator / account'] || '—', r['Issue'], r['Days open']];
    })));

  if (!parts.length) {
    notify_('Salary CRM — nothing late', '<p>Nothing is overdue. Open the dashboard anyway.</p>');
    return;
  }
  notify_('Salary CRM — ' + parts.length + ' things are late', parts.join(''));
}

function notify_(subject, bodyHtml) {
  var to = String(cfg_('REMINDER_EMAIL') || '').trim();
  var url = ss_().getUrl();
  var html =
    '<div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#202124;max-width:680px">' +
    '<h2 style="font-size:16px;margin:0 0 12px">' + esc_(subject) + '</h2>' + bodyHtml +
    '<p style="margin-top:20px"><a href="' + url + '">Open the CRM</a></p></div>';
  if (!to) { log_('notify', 'skipped — no REMINDER_EMAIL on Config'); return; }
  MailApp.sendEmail({ to: to, subject: 'UNCVRD · ' + subject, htmlBody: html });
  log_('notify', subject + ' → ' + to);
}

function section_(title, headers, rows) {
  return '<h3 style="font-size:13px;margin:18px 0 6px;color:#b3261e">' + esc_(title) +
         ' (' + rows.length + ')</h3>' + table_(headers, rows);
}

function table_(headers, rows) {
  var th = headers.map(function (h) {
    return '<th style="text-align:left;padding:5px 10px 5px 0;border-bottom:1px solid #dadce0;' +
           'font-weight:600">' + esc_(h) + '</th>';
  }).join('');
  var tr = rows.map(function (r) {
    return '<tr>' + r.map(function (c) {
      return '<td style="padding:5px 10px 5px 0;border-bottom:1px solid #f1f3f4">' +
             esc_(c === '' || c === null || c === undefined ? '—' : c) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<table style="border-collapse:collapse;font-size:13px;width:100%"><tr>' +
         th + '</tr>' + tr + '</table>';
}

function esc_(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Health check ────────────────────────────────────────────────────────────

/** What is wired wrong, as opposed to what is behind. */
function healthCheck() {
  var out = [];

  ['adStats', 'sfsReport'].forEach(function (k) {
    var sh = ss_().getSheetByName(TABS[k].name);
    var v  = sh ? String(sh.getRange(4, 1).getDisplayValue()) : '';
    if (!sh)                     out.push('✗ ' + TABS[k].name + ' is missing. Rebuild.');
    else if (v.indexOf('#REF') >= 0)
      out.push('✗ ' + TABS[k].name + ' — open it, click cell A4, then Allow access.');
    else if (v.indexOf('#') === 0) out.push('✗ ' + TABS[k].name + ' — ' + v + '. Check the ID on Config.');
    else if (!v)                 out.push('✗ ' + TABS[k].name + ' imported nothing. Check the ID on Config.');
    else                         out.push('✓ ' + TABS[k].name + ' is importing.');
  });

  var cs = creatorRows_();
  var noStatus  = cs.filter(function (c) { return !c.status; }).length;
  var noType    = cs.filter(function (c) { return !c.type; }).length;
  var untracked = cs.filter(function (c) { return c.status === 'Live' && !c.tracked; }).length;
  out.push((noStatus ? '✗ ' : '✓ ') + noStatus + ' creators have no Status set.');
  out.push((noType   ? '✗ ' : '✓ ') + noType   + ' creators have no Type set — salary payments and targets need it.');
  out.push((untracked ? '! ' : '✓ ') + untracked +
           ' live pages are not connected to the API. Those report $0 promo revenue whatever they actually earn.');

  var roster = rosterNames_();
  out.push((roster.length >= 15 ? '✓ ' : '! ') + roster.length +
           ' creators on the roster — that is exactly what the feed, story and MM ' +
           'dropdowns will offer. If a name is missing from a promo dropdown, it is ' +
           'missing from the Creators tab.');
  if (roster.length) out.push('    ' + roster.join(', '));

  var adOnly = 0;
  try {
    var adSh = ss_().getSheetByName(AD_DATA);
    if (adSh && adSh.getLastRow() > 1) {
      var seen = {};
      adSh.getRange(2, 2, adSh.getLastRow() - 1, 1).getValues().forEach(function (r) {
        var v = String(r[0] || '').trim(); if (v) seen[v] = true;
      });
      adOnly = Object.keys(seen).length;
    }
  } catch (e) {}
  out.push('✓ ' + adOnly + ' creators in the ad data — only these appear in the AD tab filter, ' +
           'which is correct: ads are per connected account, promo is everyone.');

  var missing = tabRows_(TABS.links).filter(function (r) { return r['Tracking link'] === 'n/a'; }).length;
  out.push((missing ? '! ' : '✓ ') + missing + ' tracking links still need creating.');

  // The week's money is a delta against Monday's snapshot. No snapshot, or a
  // stale one, and every "$ this week" is really "$ ever" — the one failure
  // here that looks like a great week rather than a broken sheet.
  var _base = ss_().getSheetByName(LINK_BASE);
  var _baseRows = _base ? Math.max(0, _base.getLastRow() - 1) : 0;
  if (!_baseRows) {
    out.push('\u2717 0 links baselined \u2014 "$ this week" has no starting point to ' +
             'subtract, so it would read all-time. Run "Re-baseline this week".');
  } else {
    var _stamp = _base.getRange(2, LINK_COLS.length).getValue();
    var _age = (_stamp instanceof Date) ? Math.floor((new Date() - _stamp) / 86400000) : null;
    out.push((_age !== null && _age > 7 ? '! ' : '\u2713 ') + _baseRows + ' links baselined' +
             (_age !== null ? ', ' + _age + ' day(s) ago' : '') +
             (_age !== null && _age > 7 ? ' \u2014 older than a week, re-baseline.' : '.'));
  }

  // The schedules live in this file now, so the question is whether anyone is
  // actually filling them in here rather than in the old .xlsx.
  var feedRows = tabRows_(TABS.feed).length;
  out.push(feedRows
    ? '✓ Feed schedule has ' + feedRows + ' rows in this file.'
    : '! Feed schedule is empty. UNCVRD CRM → Generate promo week, or copy rows across ' +
      'from the old .xlsx — while it is empty the promo dashboard reads zero.');

  out.push(ScriptApp.getProjectTriggers().length
    ? '✓ Reminders are installed.'
    : '! Reminders are not installed — UNCVRD CRM → Install reminders.');

  log_('healthCheck', out.join(' | '));
  alert_('Health check', out.join('\n\n'));
}

// ── Triggers ────────────────────────────────────────────────────────────────

function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('dailyAdRefresh').timeBased().everyDays(1).atHour(6).create();
  ScriptApp.newTrigger('pullMoney').timeBased().everyDays(1).atHour(5).create();
  ScriptApp.newTrigger('weeklyMoneyBaseline').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
  ScriptApp.newTrigger('dailySubsEmail').timeBased().everyDays(1).atHour(9).create();
  ScriptApp.newTrigger('onAdRangeEdit').forSpreadsheet(ss_()).onEdit().create();
  ScriptApp.newTrigger('weeklyRefresh').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(5).create();
  ScriptApp.newTrigger('paymentReminder').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  ScriptApp.newTrigger('dailyDigest').timeBased().everyDays(1).atHour(7).create();
  log_('installTriggers', 'daily 06:00 ad refresh + onEdit, Mon 05:00 weekly, Mon 06:00 payments, daily 07:00 digest');
  alert_('Reminders installed',
    'Monday 04:00 — baseline every tracking link, so the week can be a delta.\n' +
    'Every day 05:00 — pull earnings, link stats and the weekly rollup.\n' +
    'Every day 06:00 — roll the ad window on to today and re-pull the imports.\n' +
    'Every day 09:00 — yesterday\'s subs and revenue, per salary creator.\n' +
    'Monday 05:00 — roll the stats to the new week.\n' +
    'Monday 06:00 — salaries due.\n' +
    'Every day 07:00 — what is late.\n\n' +
    'Emails go to REMINDER_EMAIL on Config. Clear that cell to switch them off.');
}

/**
 * Monday morning: move every window on to the week that just ended, raise the
 * week's salary rows, and open next week's promo plan.
 *
 * The imports underneath refresh themselves — IMPORTRANGE re-reads on its own.
 * What does NOT move on its own is the date window on Weekly AD Stats, so a
 * report left alone would keep showing whatever fortnight was set at build
 * time. That is what this fixes.
 */
function weeklyRefresh() {
  var notes = [];

  var moved = applyAdRange_();
  if (moved) notes.push('ad window → ' + moved);

  try { generatePayments(); notes.push('salary rows raised'); }
  catch (e) { notes.push('payments: ' + e.message); }
  try { rollPromoPlan();   notes.push('promo plan rolled'); }
  catch (e) { notes.push('promo plan: ' + e.message); }

  // If the SFS source has not regenerated, say so rather than let a stale
  // week masquerade as this one.
  var stale = sfsSourceAgeDays_();
  if (stale !== null && stale > 10) {
    notes.push('SFS source has not updated in ' + stale + ' days');
  }

  SpreadsheetApp.flush();
  log_('weeklyRefresh', notes.join(' | '));
  return notes;
}

/**
 * Move the ad window to whatever the Range cell asks for. Returns a
 * description, or '' when the range is Custom and the dates are the user's.
 */
function applyAdRange_(sh) {
  sh = sh || ss_().getSheetByName(TABS.adStats.name);
  if (!sh) return '';
  var r = adRange_(sh.getRange('H2').getValue());
  if (!r) return '';                                  // Custom
  sh.getRange('B2').setValue(r.from);
  sh.getRange('D2').setValue(r.to);
  return dayKey_(r.from) + ' to ' + dayKey_(r.to);
}

/**
 * IMPORTRANGE caches, and a cached range can sit on yesterday's numbers for
 * hours. Blanking the formula and putting it straight back forces a re-fetch.
 */
function refreshImports_() {
  var done = 0;
  [AD_DATA, AD_COHORT, SFS_WEEK, SFS_SLOTS].forEach(function (name) {
    var sh = ss_().getSheetByName(name);
    if (!sh) return;
    var cell = sh.getRange('A1');
    var f = cell.getFormula();
    if (!f) return;
    cell.setFormula('');
    SpreadsheetApp.flush();
    cell.setFormula(f);
    done++;
  });
  SpreadsheetApp.flush();
  return done;
}

/** Every morning: roll the window on to today and pull the numbers again. */
function dailyAdRefresh() {
  var moved = applyAdRange_();
  var n = refreshImports_();
  log_('dailyAdRefresh', (moved || 'range is Custom, dates left alone') +
       ' | ' + n + ' imports refreshed');
}

/**
 * Installed edit handler. Changing Range fills the dates in; typing a date
 * yourself flips Range to Custom so the nightly job stops moving it.
 */
function onAdRangeEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getName() !== TABS.adStats.name) return;
    var a1 = e.range.getA1Notation();
    if (a1 === 'H2') { applyAdRange_(sh); return; }
    if (a1 === 'B2' || a1 === 'D2') {
      if (String(sh.getRange('H2').getValue()) !== 'Custom') sh.getRange('H2').setValue('Custom');
    }
  } catch (err) { log_('onAdRangeEdit', err.message); }
}

/** Days since the newest promo slot in the imported source, or null. */
function sfsSourceAgeDays_() {
  var sh = ss_().getSheetByName(SFS_SLOTS);
  if (!sh) return null;
  var vals = sh.getRange('C1:C400').getValues();
  var newest = null;
  vals.forEach(function (r) {
    if (r[0] instanceof Date && (!newest || r[0] > newest)) newest = r[0];
  });
  if (!newest) return null;
  return Math.floor((new Date() - newest) / 86400000);
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

// ── Reading the sheets ──────────────────────────────────────────────────────

/** Every populated row of a tab as {header: value}. */
/**
 * Refuse to read a tab whose columns are not where this code thinks they are.
 *
 * Everything here reads by POSITION, from def.headers. Add a column in the
 * middle and, until the tab is rebuilt, every read is one to the right: Status
 * returns Type, and "no creator has Status = Live" is reported against a tab
 * where all 23 plainly say Live. The real answer — "the sheet has not been
 * migrated yet" — was nowhere in the message, and the same shift would have
 * been writing to the wrong column a moment later.
 */
function assertLayout_(def, sh) {
  var want = def.display || def.headers;
  var got  = sh.getRange(HEADER_ROW, 1, 1, want.length).getValues()[0]
               .map(function (v) { return String(v || '').trim(); });
  if (!got.some(function (v) { return v; })) return;          // never built — nothing to compare
  var at = -1;
  for (var i = 0; i < want.length; i++) {
    if (got[i] !== String(want[i]).trim()) { at = i; break; }
  }
  if (at >= 0) {
    throw new Error(
      def.name + ' is still on the old column layout, so nothing can be read from it safely.\n\n' +
      'Column ' + colA1_(at + 1) + ' should be "' + want[at] + '" but says "' +
      (got[at] || '(blank)') + '".\n\n' +
      'Run UNCVRD CRM → Fix & repair → Rebuild / repair tabs first. That moves every ' +
      'value to its new column by name — nothing is lost — and then this will work.');
  }

  // Headers can be right while the DATA is still a column out — that is what a
  // half-finished migration looks like, and it is the dangerous one, because
  // every check above passes. So sample a column whose values are supposed to
  // come from a fixed list: if not one value in it belongs, the rows underneath
  // did not move with the headers.
  Object.keys(def.lists || {}).forEach(function (h) {
    var allowed = LIST[def.lists[h]];
    if (!allowed || !allowed.length) return;
    var last = sh.getLastRow();
    if (last < FIRST_ROW) return;
    var vals = sh.getRange(FIRST_ROW, headerIndex_(def, h), last - HEADER_ROW, 1).getValues()
                 .map(function (r) { return String(r[0] || '').trim(); })
                 .filter(function (v) { return v; });
    if (vals.length < 3) return;                       // too few to judge
    var good = vals.filter(function (v) { return allowed.indexOf(v) >= 0; }).length;
    if (good) return;
    throw new Error(
      def.name + ' has the right headers but the rows underneath did not move with them.\n\n' +
      'Every value in "' + h + '" is something that column cannot hold — it reads "' +
      vals[0] + '", which belongs to the column beside it.\n\n' +
      (def.name === TABS.creators.name
        ? 'Run UNCVRD CRM → Fix & repair → Put Creators back (15 Aug snapshot).'
        : 'The columns are one out. Do not run anything that writes until it is fixed.'));
  });
}

function tabRows_(def) {
  var sh = ss_().getSheetByName(def.name);
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < FIRST_ROW) return [];
  assertLayout_(def, sh);
  var vals = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();
  var out = [];
  vals.forEach(function (row) {
    if (!row.some(function (v) { return v !== '' && v !== null && v !== false; })) return;
    var o = {};
    def.headers.forEach(function (h, i) { o[h] = row[i]; });
    out.push(o);
  });
  return out;
}

function creatorRows_() {
  return tabRows_(TABS.creators).filter(function (r) { return r['Creator']; })
    .map(function (r) {
      return { name: String(r['Creator']).trim(), status: r['Status'], type: r['Type'],
               tier: r['Tier'], salary: r['Salary $/wk'], method: r['Pay method'],
               aka: r['Also known as'], samePerson: r['Same person as'],
               driveFolder: r['Drive folder'],
               adName: String(r['Ad sheet name'] || '').trim(),
               handle: String(r['OF handle'] || '').trim(),
               tracked: r['API tracked'] === true };
    });
}

function liveCreators_() {
  return creatorRows_().filter(function (c) { return c.status === 'Live'; })
                       .map(function (c) { return c.name; });
}

function cfg_(key) {
  var r = ss_().getRangeByName('CFG_' + key);
  return r ? r.getValue() : '';
}

// ── Dates and formatting ────────────────────────────────────────────────────

function dayKey_(d) {
  if (!(d instanceof Date)) return String(d || '');
  return Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

function nextMonday_() { return nextWeekday_('Monday'); }

/**
 * A named reporting window. Everything except "Last full week" ends TODAY,
 * because the ads are running today — a report that stops on Sunday is a
 * post-mortem, not a control.
 *
 * Returns null for "Custom", which is the signal to leave the dates alone.
 */
function adRange_(name) {
  var today = new Date(new Date().toDateString());
  var d = function (n) { var x = new Date(today.getTime()); x.setDate(x.getDate() + n); return x; };
  switch (String(name || '').trim()) {
    case 'Today':            return { from: today,  to: today };
    case 'Yesterday':        return { from: d(-1),  to: d(-1) };
    case 'Last 7 days':      return { from: d(-6),  to: today };
    case 'Last 14 days':     return { from: d(-13), to: today };
    case 'Last 30 days':     return { from: d(-29), to: today };
    case 'This week so far':
      var m = new Date(today.getTime());
      m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
      return { from: m, to: today };
    case 'Last full week':   return lastFullWeek_();
    case 'This month':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    default:                 return null;                 // Custom — hands off
  }
}

/**
 * The last complete Monday–Sunday. On a Wednesday that is the week before,
 * not "the last seven days" — a weekly report should cover a whole week, and
 * a half-finished one always reads as a collapse.
 */
function lastFullWeek_() {
  var mon = new Date(new Date().toDateString());
  mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));   // this week's Monday
  var to   = new Date(mon.getTime()); to.setDate(to.getDate() - 1);
  var from = new Date(to.getTime());  from.setDate(from.getDate() - 6);
  return { from: from, to: to };
}

/** The next occurrence of a weekday, today included. */
function nextWeekday_(name) {
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var want = days.indexOf(String(name).trim());
  if (want < 0) want = 1;
  var d = new Date(new Date().toDateString());
  d.setDate(d.getDate() + ((want - d.getDay() + 7) % 7));
  return d;
}

function fmtMoney_(v) {
  var n = Number(v) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
