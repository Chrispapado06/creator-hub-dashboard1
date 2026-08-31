/**
 * UNCVRD — Salary Creator CRM : one button for the whole week
 * ============================================================================
 * setUpWeek() replaces six fiddly steps with one. It fills the roster gaps,
 * makes sure every live creator has a plan row, WORKS OUT THE ALLOCATION
 * ITSELF, clears whatever the week already had, and writes the three schedules.
 *
 * The allocation is the part worth automating. Every column has a fixed number
 * of cells a day — accounts x 4 feed, x 2 story, x 3 MM — and the numbers on
 * the plan have to add up to exactly that or cells come out blank. Doing that
 * by hand means redoing the arithmetic every time an account goes live, which
 * is precisely how a week ends up 20 feed short and nobody notices.
 *
 * Nothing here is new machinery. It calls the same allocation, dealing and
 * writing code the menu items use, in the right order, with the numbers
 * computed rather than typed.
 */

var WEEK_MAX_PER_DAY = 15;   // ceiling on one creator's promos in a day

/**
 * The shape of a day, per tier. Christos's numbers.
 *
 * GIVING and RECEIVING are different numbers, and only one of them is fixed.
 *
 * Giving is the cadence: every live account posts 9 promos a day — 4 feed, 2
 * story, 3 MM. That is the supply and it is not negotiable; N accounts produce
 * exactly 9N promotion slots a day.
 *
 * Receiving is the decision this file makes: how many of those 9N slots get
 * pointed at each creator. It does NOT have to be 9. Salary creators are the
 * investment, so they take more and the rest take less.
 *
 * Below are Christos's numbers: salary receive 15 a day (7 feed, 2 story, 6
 * MM), everyone else 7. They are apportionment WEIGHTS, so the columns still
 * total exactly the slots available at any roster size — weight one tier up and
 * the other drops to pay for it, because the day cannot grow.
 */
var WEEK_SHAPE = {
  salary: { feed: 7, story: 2, mm: 6 },   // received: 15 a day
  other:  { feed: 3, story: 2, mm: 2 }    // received:  7 a day
};

/**
 * Split `total` across `weights` so the parts are whole numbers that still add
 * up to exactly `total`.
 *
 * Largest-remainder: floor everyone's exact share, then hand the leftover units
 * to whoever was rounded down hardest. Rounding each share independently would
 * miss the total by a few either way, and a few either way is the difference
 * between a full schedule and blank cells.
 */
function apportion_(total, weights) {
  var sum = weights.reduce(function (a, b) { return a + b; }, 0);
  if (!sum || total <= 0) return weights.map(function () { return 0; });

  var exact = weights.map(function (w) { return total * w / sum; });
  var out   = exact.map(function (x) { return Math.floor(x); });
  var left  = total - out.reduce(function (a, b) { return a + b; }, 0);

  var order = exact.map(function (x, i) { return { i: i, frac: x - Math.floor(x) }; })
                   .sort(function (a, b) { return b.frac - a.frac; });
  for (var k = 0; k < left; k++) out[order[k % order.length].i]++;
  return out;
}

/**
 * Work out this week's numbers and write them onto Internal Promo Plan.
 *
 * Salary creators get double weight, then anyone over WEEK_MAX_PER_DAY has the
 * excess moved to whoever is carrying least. Moves are always within the same
 * column, so the column totals stay exactly equal to the cells available.
 */
function autoAllocate_(weekStart, roster) {
  var def   = TABS.promoPlan;
  var sh    = sheet_(def.name);
  var want  = weekKey_(weekStart);
  var last  = lastDataRow_(sh);
  if (last < FIRST_ROW) return null;

  var iWeek  = headerIndex_(def, 'Week starting') - 1;
  var iName  = headerIndex_(def, 'Creator') - 1;
  var iSlots = headerIndex_(def, 'Slots / day') - 1;
  var iLock  = headerIndex_(def, 'Slots locked') - 1;
  var iFeed  = headerIndex_(def, 'Feed') - 1;
  var iStory = headerIndex_(def, 'Story') - 1;
  var iMM    = headerIndex_(def, 'MM') - 1;
  var vals   = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();

  var salary = {};
  creatorRows_().forEach(function (c) { if (c.type === 'Salary') salary[c.name.toLowerCase()] = 1; });

  var rows = [];
  vals.forEach(function (r, i) {
    var n = String(r[iName] || '').trim();
    if (!n || weekKey_(r[iWeek]) !== want) return;

    var typed = r[iSlots];
    var slots = (typed === '' || typed === null) ? null : Number(typed);
    if (slots !== null && isNaN(slots)) slots = null;
    var sum = (Number(r[iFeed]) || 0) + (Number(r[iStory]) || 0) + (Number(r[iMM]) || 0);

    rows.push({ row: FIRST_ROW + i, name: n, salary: !!salary[n.toLowerCase()],
                slots: slots, disagrees: slots !== null && slots !== sum,
                locked: r[iLock] === true, wasLocked: r[iLock] === true });
  });
  if (!rows.length) return null;

  // Who owns this column?
  //
  // The allocator always leaves Slots / day equal to Feed + Story + MM. So one
  // row where they disagree means a person has been in the column — and once
  // that is true, EVERY number in it is theirs, not just the ones that happen
  // to differ. Judging row by row would quietly re-allocate the creator whose
  // hand-typed 7 coincided with the 7 the machine last wrote, which is the one
  // case where being wrong is invisible.
  if (rows.some(function (r) { return r.disagrees; })) {
    rows.forEach(function (r) { if (r.slots !== null) r.locked = true; });
  }
  rows.forEach(function (r) { if (r.slots === null) r.locked = false; });

  // The SFS cadence, not the platform cadence: three feed posts a day of which
  // two are cross-promo means two schedulable slots, so the Feed column tops out
  // at 2 x accounts. Reading the post cap here asked for twice the promos the
  // page has room for and left half the allocation unplaceable.
  var cadence = promoCadence_();
  var cap = { feed:  roster.length * cadence.feed,
              story: roster.length * cadence.story,
              mm:    roster.length * cadence.mm };
  var room = cap.feed + cap.story + cap.mm;

  // Locked rows spend their slots first. Whatever is left is shared out by tier
  // among the rows nobody has decided yet — which is usually all of them on a
  // fresh week, and none of them once an owner has been through the column.
  var held = 0;
  rows.forEach(function (r) { if (r.locked) held += Math.max(0, r.slots); });

  // Hand-set numbers that ask for more than the accounts can produce get scaled
  // back proportionally rather than silently overflowing. Everyone keeps their
  // share of the decision; the schedule stays fillable. Reported, and undone by
  // simply retyping the numbers you want.
  var scaled = null;
  if (held > room) {
    var lockedRows = rows.filter(function (r) { return r.locked; });
    // NOT `want` — that is the week key three lines up, and `var` is function
    // scoped, so reusing the name silently reassigns it.
    var shares = lockedRows.map(function (r) { return Math.max(0, r.slots); });
    var fit    = apportion_(room, shares);
    scaled = { from: held, to: room, moved: 0 };
    lockedRows.forEach(function (r, i) {
      if (r.slots !== fit[i]) scaled.moved++;
      r.slots = fit[i];
    });
    held = room;
  }
  var free = room - held;

  var open = rows.filter(function (r) { return !r.locked; });
  if (open.length && free > 0) {
    var w = open.map(function (r) {
      var s = r.salary ? WEEK_SHAPE.salary : WEEK_SHAPE.other;
      return s.feed + s.story + s.mm;
    });
    apportion_(free, w).forEach(function (n, i) { open[i].slots = n; });
  } else {
    open.forEach(function (r) { r.slots = 0; });
  }

  // Ceiling only applies where the machine chose the number. A locked row is
  // somebody's decision and is not ours to trim.
  for (var guard = 0; guard < 500 && open.length > 1; guard++) {
    var over = -1;
    for (var i = 0; i < open.length; i++) if (open[i].slots > WEEK_MAX_PER_DAY) { over = i; break; }
    if (over < 0) break;
    var to = -1;
    for (var j = 0; j < open.length; j++) {
      if (j === over || open[j].slots >= WEEK_MAX_PER_DAY) continue;
      if (to < 0 || open[j].slots < open[to].slots) to = j;
    }
    if (to < 0) break;
    open[over].slots--; open[to].slots++;
  }

  var per = splitChannels_(rows.map(function (r) { return Math.max(0, r.slots || 0); }), cap, cadence);

  var writes = { slots: [], lock: [], feed: [], story: [], mm: [] };
  rows.forEach(function (r, i) {
    writes.slots.push([r.locked ? r.slots : (per.feed[i] + per.story[i] + per.mm[i])]);
    writes.lock.push([r.locked]);
    writes.feed.push([per.feed[i]]);
    writes.story.push([per.story[i]]);
    writes.mm.push([per.mm[i]]);
  });

  // Contiguous block, one write per column. The plan's rows for a week are
  // written together, so this is a single range even after a tidy.
  var from = rows[0].row, height = rows[rows.length - 1].row - from + 1;
  if (height === rows.length) {
    sh.getRange(from, iSlots + 1, height, 1).setValues(writes.slots);
    sh.getRange(from, iLock  + 1, height, 1).setValues(writes.lock);
    sh.getRange(from, iFeed  + 1, height, 1).setValues(writes.feed);
    sh.getRange(from, iStory + 1, height, 1).setValues(writes.story);
    sh.getRange(from, iMM    + 1, height, 1).setValues(writes.mm);
  } else {
    rows.forEach(function (r, i) {
      sh.getRange(r.row, iSlots + 1).setValue(writes.slots[i][0]);
      sh.getRange(r.row, iLock  + 1).setValue(writes.lock[i][0]);
      sh.getRange(r.row, iFeed  + 1).setValue(writes.feed[i][0]);
      sh.getRange(r.row, iStory + 1).setValue(writes.story[i][0]);
      sh.getRange(r.row, iMM    + 1).setValue(writes.mm[i][0]);
    });
  }

  var tot = function (c) { return per[c].reduce(function (a, b) { return a + b; }, 0); };
  var lockedCount = rows.filter(function (r) { return r.locked; }).length;
  log_('autoAllocate', rows.length + ' creators (' + lockedCount + ' locked); feed ' +
       tot('feed') + ', story ' + tot('story') + ', mm ' + tot('mm'));

  return {
    creators: rows.length, locked: lockedCount, scaled: scaled,
    newlyLocked: rows.filter(function (r) { return r.locked && !r.wasLocked; }).length,
    held: held, room: room, over: 0,
    feed: tot('feed'), story: tot('story'), mm: tot('mm'),
    room3: cap,
    top: rows.map(function (r, i) {
      return { name: r.name, day: per.feed[i] + per.story[i] + per.mm[i], locked: r.locked };
    }).sort(function (a, b) { return b.day - a.day; })
  };
}

/**
 * Split each creator's daily slots across the three channels.
 *
 * Two totals have to hold at once: every ROW must add back to the number that
 * creator was given, and every COLUMN must equal the cells the accounts
 * actually produce that day. Rounding each row on its own satisfies the first
 * and misses the second by a few, and a few either way is the difference
 * between a full schedule and blank cells.
 *
 * So: floor the exact 4:2:3 share, hand each row its own remainder to the
 * channel that was rounded down hardest and still has column headroom, then
 * settle the columns by swapping units WITHIN a row — which cannot disturb the
 * row totals, because it moves a unit from one of that row's channels to
 * another.
 */
function splitChannels_(slots, cap, cadence) {
  var CH = ['feed', 'story', 'mm'];
  var w = CH.map(function (c) { return cadence[c]; });
  var wsum = w[0] + w[1] + w[2];

  var grid = [], frac = [];
  slots.forEach(function (s) {
    var ideal = w.map(function (x) { return s * x / wsum; });
    grid.push(ideal.map(function (x) { return Math.floor(x); }));
    frac.push(ideal.map(function (x) { return x - Math.floor(x); }));
  });

  var colsum = function (j) {
    return grid.reduce(function (a, g) { return a + g[j]; }, 0);
  };
  var rowsum = function (i) { return grid[i][0] + grid[i][1] + grid[i][2]; };
  var capOf  = function (j) { return cap[CH[j]]; };

  for (var i = 0; i < grid.length; i++) {
    var spin = 0;
    while (rowsum(i) < slots[i] && spin++ < 64) {
      var order = [0, 1, 2].sort(function (a, b) {
        return (frac[i][b] - frac[i][a]) || ((capOf(b) - colsum(b)) - (capOf(a) - colsum(a)));
      });
      var put = -1;
      for (var q = 0; q < 3; q++) if (colsum(order[q]) < capOf(order[q])) { put = order[q]; break; }
      if (put < 0) put = order[0];                       // over capacity anyway — keep the row honest
      grid[i][put]++; frac[i][put] -= 1;
    }
  }

  for (var j = 0; j < 3; j++) {
    var loops = 0;
    while (colsum(j) < capOf(j) && loops++ < 4096) {
      var best = null;
      for (var r = 0; r < grid.length; r++) {
        for (var k = 0; k < 3; k++) {
          if (k === j || grid[r][k] === 0 || colsum(k) <= capOf(k)) continue;
          var score = frac[r][j] - frac[r][k];
          if (!best || score > best.score) best = { score: score, r: r, k: k };
        }
      }
      if (!best) break;
      grid[best.r][best.k]--; grid[best.r][j]++;
    }
  }

  return { feed:  grid.map(function (g) { return g[0]; }),
           story: grid.map(function (g) { return g[1]; }),
           mm:    grid.map(function (g) { return g[2]; }) };
}


/**
 * Make the week's plan rows sane before anything reads them.
 *
 * Two things go wrong on a tab that has been rebuilt and re-rolled:
 *   - rows lose their "Week starting" (blank), so nothing recognises them and
 *     a fresh set gets appended alongside;
 *   - the creator then appears twice for the same week, and the allocator
 *     splits her share across both rows, halving what she actually receives.
 *
 * That is exactly how the plan ended up 42 rows long with every number half
 * what it should be. So: adopt a blank-week row if that creator has no dated
 * row yet, and delete the genuine duplicates. Deleting is limited to rows for
 * THIS week that duplicate a creator already counted — never a row for another
 * week, never the only row a creator has.
 */
function tidyPlanRows_(weekStart) {
  var def = TABS.promoPlan, sh = sheet_(def.name);
  var last = lastDataRow_(sh);
  if (last < FIRST_ROW) return { stamped: 0, removed: 0 };

  var iWeek = headerIndex_(def, 'Week starting') - 1;
  var iCrea = headerIndex_(def, 'Creator') - 1;
  var want  = weekKey_(weekStart);
  var vals  = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();

  var seen = {}, stamp = [], drop = [];
  vals.forEach(function (r, i) {
    var n = String(r[iCrea] || '').trim();
    if (!n) return;
    var k = weekKey_(r[iWeek]);
    if (k && k !== want) return;                 // another week — leave alone
    if (seen[n]) { drop.push(FIRST_ROW + i); return; }
    seen[n] = true;
    if (!k) stamp.push(FIRST_ROW + i);           // blank week, and the only row — adopt it
  });

  stamp.forEach(function (row) {
    sh.getRange(row, iWeek + 1).setValue(new Date(weekStart.getTime()))
      .setNumberFormat('yyyy-mm-dd');
  });
  deleteRowsBatched_(sh, drop);

  if (stamp.length || drop.length) {
    log_('tidyPlanRows', want + ': stamped ' + stamp.length + ', removed ' + drop.length + ' duplicate(s)');
  }
  return { stamped: stamp.length, removed: drop.length };
}

/** Every live creator has a row for this week. Adds only what is missing. */
function ensurePlanRows_(weekStart, roster) {
  var def = TABS.promoPlan, sh = sheet_(def.name);
  var iWeek = headerIndex_(def, 'Week starting') - 1;
  var iCrea = headerIndex_(def, 'Creator') - 1;
  var want = weekKey_(weekStart);

  var have = {}, last = lastDataRow_(sh);
  if (last >= FIRST_ROW) {
    sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues()
      .forEach(function (r) {
        if (r[iCrea] && weekKey_(r[iWeek]) === want) have[String(r[iCrea]).trim()] = true;
      });
  }

  var add = roster.filter(function (c) { return !have[c]; }).map(function (c) {
    var r = new Array(def.headers.length).fill('');
    r[iWeek] = new Date(weekStart.getTime());
    r[iCrea] = c;
    r[headerIndex_(def, 'Permanent feed SFS') - 1] = false;
    r[headerIndex_(def, 'Slots locked') - 1] = false;
    return r;
  });
  if (!add.length) return 0;

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  if (at + add.length - 1 > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), at + add.length - 1 - sh.getMaxRows() + 20);
  }
  sh.getRange(at, 1, add.length, def.headers.length).setValues(add);
  sh.getRange(at, headerIndex_(def, 'Week starting'), add.length, 1).setNumberFormat('yyyy-mm-dd');
  ['Permanent feed SFS', 'Slots locked'].forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), add.length, 1).insertCheckboxes();
  });
  ['Prev-week slots', 'Prev-week $ / slot'].forEach(function (h) {
    var out = [];
    for (var i = 0; i < add.length; i++) out.push([def.calc[h].replace(/\{r\}/g, String(at + i))]);
    sh.getRange(at, headerIndex_(def, h), add.length, 1).setFormulas(out);
  });
  return add.length;
}

/**
 * Everything, in order, from one press.
 *
 * Deliberately re-runnable: clearing before writing means pressing it twice
 * rebuilds the week rather than doubling it, and only untouched rows are ever
 * removed, so work the team has already done survives.
 */
function setUpWeek() {
  var ui = ui_();
  var start = nextMonday_();

  if (ui) {
    var ask = ui.prompt('Set up the week',
      'Week starting (yyyy-mm-dd). Blank = ' + dayKey_(start) + '.\n\n' +
      'This does the lot:\n' +
      '  • fills any missing Status / Type on Creators\n' +
      '  • gives every live creator a row on Internal Promo Plan\n' +
      '  • works out the slot numbers so the columns add up exactly\n' +
      '  • clears anything already scheduled for the week (keeps posted work)\n' +
      '  • writes the Feed, Story and MM schedules\n\n' +
      'Safe to run again — it rebuilds the week rather than doubling it.',
      ui.ButtonSet.OK_CANCEL);
    if (ask.getSelectedButton() !== ui.Button.OK) return;
    var txt = ask.getResponseText().trim();
    if (txt) {
      var p = parseWeekCell_(txt);
      if (!p) { ui.alert('That is not a date. Use yyyy-mm-dd.'); return; }
      start = p;
    }
  }

  // Each step named and caught. A stack trace in the Apps Script log is no use
  // to someone looking at a spreadsheet — the dialog has to say which step
  // failed and what it said, or the only way to debug is to guess.
  var note = [], step = '';
  var run = function (name, fn) {
    step = name;
    try { return fn(); }
    catch (e) {
      log_('setUpWeek FAILED', name + ': ' + e.message);
      alert_('Stopped at: ' + name,
        e.message + '\n\n' +
        'Nothing after this step ran. Send me this message and I can fix it ' +
        'straight away — the step name plus the text above is all I need.');
      throw e;
    }
  };

  var fill;
  try { fill = run('Roster defaults', fillRosterDefaults_); }
  catch (e) { return; }
  if (fill.status || fill.type) {
    note.push('Roster: Status set on ' + fill.status + ', Type on ' + fill.type + '.');
  }

  // Apps Script does not reliably surface cells written moments ago in the same
  // execution. fillRosterDefaults_ had just set twelve creators Live and this
  // read still saw the old values, so the whole week was allocated for 11
  // accounts instead of 23 — every number came out roughly half.
  SpreadsheetApp.flush();

  var roster;
  try { roster = run('Reading the live roster', liveCreators_); }
  catch (e) { return; }
  if (!roster.length) {
    alert_('Nobody is live',
      'No creator on the Creators tab has Status = Live, so there are no accounts ' +
      'to post from and nobody to promote.');
    return;
  }

  var added, alloc, cleared, w;
  try {
    var tidied = run('Tidying the plan rows', function () { return tidyPlanRows_(start); });
    if (tidied.removed) note.push('Plan: removed ' + tidied.removed + ' duplicate row(s).');
    if (tidied.stamped) note.push('Plan: dated ' + tidied.stamped + ' row(s) that had no week.');
    SpreadsheetApp.flush();

    added = run('Adding missing plan rows', function () { return ensurePlanRows_(start, roster); });
    if (added) note.push('Plan: added ' + added + ' missing creator row(s).');

    SpreadsheetApp.flush();
    alloc = run('Working out the slot numbers', function () { return autoAllocate_(start, roster); });
    if (!alloc) {
      alert_('Could not allocate', 'No plan rows for the week of ' + dayKey_(start) + '.');
      return;
    }

    cleared = run('Clearing the old week', function () { return clearWeek_(start); });
    if (cleared.removed) note.push('Cleared ' + cleared.removed + ' untouched row(s).');
    if (cleared.locked) {
      note.push('KEPT ' + cleared.locked + ' slot(s) that already had a tracking link, a ' +
                'caption or a status — across ' + cleared.kept + ' row(s). Nothing typed was lost.');
    }

    var pools = run('Building the promo pools', function () {
      var cad = promoCadence_();
      return promoPools_(start, cad.feed, cad.story, cad.mm);
    });
    w = run('Writing the three schedules', function () { return writeWeek_(start, roster, pools); });
  } catch (e) { return; }

  var head = alloc.top.slice(0, 3).map(function (t) { return t.name + ' ' + t.day; }).join(', ');
  var tail = alloc.top.length ? alloc.top[alloc.top.length - 1] : null;

  log_('setUpWeek', dayKey_(start) + ': ' + w.feed + '/' + w.story + '/' + w.mm +
       ' rows, ' + w.placed + '/' + w.allocated + ' slots placed');

  alert_('Week of ' + dayKey_(start) + ' is ready',
    (note.length ? note.join('\n') + '\n\n' : '') +
    roster.length + ' accounts posting, ' + alloc.creators + ' creators being promoted' +
    (alloc.locked ? ' (' + alloc.locked + ' on hand-set slot numbers' +
      (alloc.newlyLocked ? ', ' + alloc.newlyLocked + ' newly locked' : '') + ')' : '') + '.\n\n' +
    'Written: ' + w.feed + ' feed rows, ' + w.story + ' story, ' + w.mm + ' MM.\n' +
    (w.permanent ? 'Permanent pairings placed: ' + w.permanent + '.\n' : '') +
    'Slots placed: ' + w.placed + ' of ' + w.allocated +
      (w.placed === w.allocated ? '  (all of them)' : '  (' + (w.allocated - w.placed) + ' could not be placed)') + '\n\n' +
    'Per day the columns now total Feed ' + alloc.feed + ', Story ' + alloc.story +
    ', MM ' + alloc.mm + ' — against the ' + alloc.room3.feed + ' / ' + alloc.room3.story +
    ' / ' + alloc.room3.mm + ' cells your accounts produce.\n\n' +
    (alloc.scaled ? 'SCALED TO FIT: the hand-set numbers asked for ' + alloc.scaled.from +
       ' promotions a day, but ' + roster.length + ' accounts only produce ' + alloc.scaled.to +
       ' — OnlyFans allows 3 feed posts a day and only 2 of them are SFS. Every locked ' +
       'number was reduced in proportion (' + alloc.scaled.moved + ' changed), so the shares ' +
       'are the ones Luca set. Retype any number to override it.\n\n' : '') +
    'Most promoted: ' + head + ' a day.' +
    (tail ? '  Least: ' + tail.name + ' ' + tail.day + '.' : '') +
    '\n\nChange any number on Internal Promo Plan and run this again to redo the week. ' +
    'Anything with a tracking link, a caption or a status stays exactly where it is.');

  ss_().setActiveSheet(sheet_(TABS.feed.name));
}
