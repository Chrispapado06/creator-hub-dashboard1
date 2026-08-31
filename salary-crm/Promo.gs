/**
 * UNCVRD — the promo week engine
 * ============================================================================
 * Regenerating a week used to be all-or-nothing: a row was either untouched
 * (delete it) or worked (keep the whole thing). That is too coarse. A feed row
 * holds four independent promotions, and by the time anyone presses the button
 * the VA has pasted tracking links into some of them. Deleting the row to
 * reshuffle the other three threw those links away, and a tracking link is not
 * regenerable — it is a URL created by hand on the promoted creator's page.
 *
 * So the unit of work here is the SLOT, not the row:
 *
 *   LOCKED   status moved on from Scheduled, a story ticked Done, a tracking
 *            link pasted, or a caption written. Never cleared, never
 *            reshuffled, and it still counts against that creator's quota.
 *   FREE     everything else. Cleared and re-dealt on every run.
 *
 * That is what makes "keep what we typed AND change the allocation" possible in
 * the same press: the locked slots stay exactly where they are, and the new
 * numbers are satisfied using the slots around them.
 */

/**
 * Where the promotions live on each schedule, and — just as important — which
 * of them are ours to fill.
 *
 * OnlyFans allows three feed posts a day. Two are cross-promo, the third is the
 * creator's own content, and the fourth column is over the cap entirely. Stories
 * alternate hers and ours. So every slot carries a ROLE:
 *
 *   sfs    the engine allocates a creator into it
 *   own    hers — stamped "Own content" and never scheduled over
 *   over   past the platform cap — stamped so nobody posts a fourth
 *
 * Roles are what stop the allocator quietly filling a creator's whole page with
 * other girls, and they are why SFS capacity is 2 a day per account, not 4.
 * `at` is the posting time: three posts 8 hours apart hold 3 live around the
 * clock, four stories 6 hours apart hold 4.
 */
var PROMO_SLOTS = {
  feed: {
    promoter: 'Model (Promoter)', date: 'Date',
    slots: [{ name: '1st Promote', caption: 'Caption 1', link: 'Link 1', status: 'Status 1', role: 'sfs',  at: '00:00' },
            { name: '2nd Promote', caption: 'Caption 2', link: 'Link 2', status: 'Status 2', role: 'own',  at: '08:00' },
            { name: '3rd Promote', caption: 'Caption 3', link: 'Link 3', status: 'Status 3', role: 'sfs',  at: '16:00' },
            { name: '4th Promote', caption: 'Caption 4', link: 'Link 4', status: 'Status 4', role: 'over', at: '' }]
  },
  story: {
    promoter: 'Promoter', date: 'Date',
    slots: [{ name: '1st Promoting Model', done: 'Done 1', role: 'own', at: '00:00' },
            { name: '2nd Promoting Model', done: 'Done 2', role: 'sfs', at: '06:00' },
            { name: '3rd Promoting Model', done: 'Done 3', role: 'own', at: '12:00' },
            { name: '4th Promoting Model', done: 'Done 4', role: 'sfs', at: '18:00' }]
  },
  // One mass DM per row, one row per shift. The slot count per account-day is
  // therefore a ROW count, not a column count — handled by rowPerSlot.
  mm: {
    promoter: 'Promoting Creator', date: 'Date', rowPerSlot: true,
    slots: [{ name: 'Promoted Creator', caption: 'Caption', link: 'Tracking Link', status: 'Status', role: 'sfs' }]
  }
};

/** The status that means "this pairing stays up and is never reshuffled". */
var PERMANENT   = 'Permanent';
var OWN_CONTENT = 'Own content';
var OVER_CAP    = 'Excluded';

function slotRole_(s) { return s.role || 'sfs'; }

/** The slot indices the engine is allowed to schedule into. */
function sfsSlots_(spec) {
  var out = [];
  spec.slots.forEach(function (s, i) { if (slotRole_(s) === 'sfs') out.push(i); });
  return out;
}

/**
 * Two rows on Creators that are the same human — Sandra and June are one person
 * on two pages. Returns {name: [otherNameLower, …]}.
 *
 * Her promoting her own second account is not a swap. It spends a slot that
 * could have reached somebody else's audience and it reaches an audience that
 * already knows her, so the schedule treats it exactly like self-promotion.
 */
function samePersonMap_() {
  var map = {};
  var link = function (a, b) {
    if (!a || !b || a === b) return;
    (map[a] = map[a] || []).push(b);
    (map[b] = map[b] || []).push(a);
  };
  creatorRows_().forEach(function (c) {
    var me = String(c.name || '').trim().toLowerCase();
    String(c.samePerson || '').split(/\s*[,/]\s*/).forEach(function (other) {
      link(me, String(other).trim().toLowerCase());
    });
  });
  return map;
}

/**
 * How many slots a day the ENGINE fills — the SFS ones only.
 *
 * Not the same as posts per day. Three feed posts a day of which two are SFS
 * means the allocator has two slots to place, and the plan's Feed column tops
 * out at 2 x accounts. Reading the platform cap here instead was what made the
 * columns ask for twice the promos the page has room for.
 */
function promoCadence_() {
  return {
    feed:  Number(cfg_('FEED_SFS_PER_DAY'))   || sfsSlots_(PROMO_SLOTS.feed).length,
    story: Number(cfg_('STORY_SFS_PER_DAY'))  || sfsSlots_(PROMO_SLOTS.story).length,
    mm:    Number(cfg_('MM_PER_DAY'))         || 3
  };
}

/** Posts per day on the platform, cross-promo or not — what the cap counts. */
function postCadence_() {
  return {
    feed:  Number(cfg_('FEED_POSTS_PER_DAY'))    || 3,
    story: Number(cfg_('PROMO_STORIES_PER_DAY')) || 4,
    mm:    Number(cfg_('MM_PER_DAY'))            || 3
  };
}

/**
 * Is this slot someone's work?
 *
 * Deliberately generous. A false positive costs one slot that could have been
 * reshuffled; a false negative throws away a tracking link somebody made by
 * hand on OnlyFans and cannot get back.
 */
function slotLocked_(def, row, s) {
  var at = function (h) {
    return h && def.headers.indexOf(h) >= 0 ? row[headerIndex_(def, h) - 1] : '';
  };
  if (at(s.done) === true) return true;                          // story ticked Done
  var st = String(at(s.status) || '').trim();
  if (st && st !== 'Scheduled') return true;                     // Posted, Permanent, Declined…
  if (String(at(s.link) || '').trim()) return true;              // a tracking link was pasted
  if (String(at(s.caption) || '').trim()) return true;           // someone wrote a caption
  return false;
}

/**
 * Read one week of one schedule, slot by slot.
 *
 * Returns the week's row span (so the writer can put a whole column back in one
 * call), which account-days exist, which of their slots are free, and how many
 * promotions each creator has already banked in locked slots.
 */
function scanChannel_(key, start) {
  var spec = PROMO_SLOTS[key], def = TABS[key], sh = sheet_(def.name);
  var want = weekKey_(start);
  var out = { key: key, def: def, spec: spec, sh: sh, groups: {}, byRow: {},
              placed: {}, placedByDay: {}, free: 0, locked: 0, rows: 0,
              from: 0, to: 0, vals: null };

  var last = sh.getLastRow();
  if (last < FIRST_ROW) return out;

  var iDate = headerIndex_(def, spec.date) - 1;
  var iAcct = headerIndex_(def, spec.promoter) - 1;
  var vals  = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();
  out.vals = vals;

  vals.forEach(function (r, i) {
    if (weekKey_(r[iDate]) !== want) return;
    var acct = String(r[iAcct] || '').trim();
    if (!acct) return;

    var sheetRow = FIRST_ROW + i;
    out.rows++;
    out.from = out.from ? Math.min(out.from, sheetRow) : sheetRow;
    out.to   = Math.max(out.to, sheetRow);

    var k = dayKey_(r[iDate]) + '|' + acct;
    var g = out.groups[k] || (out.groups[k] = { day: dayKey_(r[iDate]), acct: acct,
                                                rows: [], free: [], taken: {}, shifts: {} });
    g.rows.push(sheetRow);
    if (def.headers.indexOf('Shift') >= 0) {
      g.shifts[String(r[headerIndex_(def, 'Shift') - 1] || '')] = true;
    }

    var info = out.byRow[sheetRow] = { locked: 0, free: [], reserved: [] };
    spec.slots.forEach(function (s, si) {
      var nm = String(r[headerIndex_(def, s.name) - 1] || '').trim();

      // Her own content, or a slot past the platform cap. Not ours to fill and
      // not a gap either — it needs stamping, not scheduling.
      //
      // Only where there is somewhere to stamp: a story slot is a name and a
      // tick, with no status column at all, so its role lives in the column
      // heading instead. Reading a status that does not exist threw and took
      // the whole clear-and-regenerate down with it.
      if (slotRole_(s) !== 'sfs') {
        if (!s.status || def.headers.indexOf(s.status) < 0) return;
        var st = String(r[headerIndex_(def, s.status) - 1] || '').trim();
        if (!nm && !st) info.reserved.push(si);
        return;
      }

      if (slotLocked_(def, r, s)) {
        out.locked++; info.locked++;
        if (nm) {
          var lk = nm.toLowerCase();
          g.taken[lk] = true;
          out.placed[lk] = (out.placed[lk] || 0) + 1;
          // Per DAY as well as per week. A day where most slots are already
          // locked owes far less than the plan says, and only a per-day count
          // can tell you how much less.
          var pd = out.placedByDay[g.day] || (out.placedByDay[g.day] = {});
          pd[lk] = (pd[lk] || 0) + 1;
        }
      } else {
        out.free++; info.free.push(si);
        g.free.push({ row: sheetRow, slot: si });
      }
    });
  });
  return out;
}

/**
 * Empty the free slots and delete the rows that are entirely free.
 *
 * A row with even one locked slot survives — otherwise a single pasted link
 * would pin three stale pairings beside it for the rest of the week.
 */
function clearWeek_(start) {
  var removed = 0, kept = 0, freed = 0, locked = 0, detail = [];

  ['feed', 'story', 'mm'].forEach(function (key) {
    var scan = scanChannel_(key, start);
    if (!scan.rows) { detail.push('   ' + TABS[key].name + ': nothing for that week'); return; }

    var def = scan.def, sh = scan.sh, spec = scan.spec;
    var del = [], blanks = [], keptRows = 0;

    Object.keys(scan.byRow).forEach(function (rowStr) {
      var row = Number(rowStr), info = scan.byRow[row];
      if (!info.locked) { del.push(row); return; }
      keptRows++;
      info.free.forEach(function (si) { blanks.push({ row: row, slot: si }); });
    });

    // Blank BEFORE deleting: a delete shifts every row below it, and the blank
    // list is addressed by absolute row number.
    blankSlots_(sh, def, spec, blanks);
    deleteRowsBatched_(sh, del);

    removed += del.length; kept += keptRows; freed += blanks.length; locked += scan.locked;
    detail.push('   ' + def.name + ': ' + del.length + ' row(s) removed, ' + keptRows +
                ' kept, ' + scan.locked + ' slot(s) locked' +
                (blanks.length ? ', ' + blanks.length + ' free slot(s) emptied beside them' : ''));
  });

  return { removed: removed, kept: kept, freed: freed, locked: locked, detail: detail };
}

/**
 * Empty a list of slots in as few writes as the sheet allows.
 *
 * One cell at a time is five round trips per slot, and a week has a couple of
 * hundred slots to clear — a thousand calls to the Sheets service, which is
 * most of the six-minute budget spent before a single row is written. Grouped
 * by column it is one write per column instead, whatever the slot count.
 *
 * Only ever touches name / caption / link / status / done. None of those is a
 * calculated column, so reading the column back and writing it whole cannot
 * flatten a formula.
 */
function blankSlots_(sh, def, spec, cells) {
  if (!cells || !cells.length) return 0;

  var from = cells[0].row, to = cells[0].row;
  cells.forEach(function (c) { from = Math.min(from, c.row); to = Math.max(to, c.row); });
  var height = to - from + 1;

  var cols = {};
  var col = function (h) {
    if (!h || def.headers.indexOf(h) < 0) return null;
    var c = headerIndex_(def, h);
    if (!cols[c]) cols[c] = sh.getRange(from, c, height, 1).getValues();
    return cols[c];
  };

  cells.forEach(function (b) {
    var s = spec.slots[b.slot], at = b.row - from;
    [s.name, s.caption, s.link, s.status].forEach(function (h) {
      var v = col(h); if (v) v[at][0] = '';
    });
    var d = col(s.done); if (d) d[at][0] = false;
  });

  Object.keys(cols).forEach(function (c) {
    sh.getRange(from, Number(c), height, 1).setValues(cols[c]);
  });
  return cells.length;
}

/** One slot — kept for the odd single call; the batch version is the fast path. */
function blankSlot_(sh, def, s, row) {
  var spec = { slots: [s] };
  blankSlots_(sh, def, spec, [{ row: row, slot: 0 }]);
}

/**
 * Delete rows in runs, not one at a time.
 *
 * Clearing a week removes six hundred rows, and deleteRow() is a round trip
 * each — six hundred calls before anything is written. They are nearly always
 * consecutive, so deleting them as blocks turns that into a handful.
 *
 * Bottom-up, so removing a block never shifts one still to be removed.
 */
function deleteRowsBatched_(sh, rows) {
  if (!rows || !rows.length) return 0;
  var sorted = rows.slice().sort(function (a, b) { return b - a; });

  var deleted = 0, end = sorted[0], run = 1;
  for (var i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === sorted[i - 1] - 1) { run++; continue; }
    sh.deleteRows(end - run + 1, run);
    deleted += run;
    if (i < sorted.length) { end = sorted[i]; run = 1; }
  }
  return deleted;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/**
 * Deal the pools into the three schedules, filling the gaps around whatever is
 * already locked.
 *
 * `pools` is consumed as it is dealt, so whatever remains afterwards is what
 * could not be placed.
 */
function writeWeek_(start, roster, pools) {
  var cad = promoCadence_();
  var perm = permanentPlan_(start, roster);

  // The plan's per-day numbers, keyed by lowercase name. These are what each
  // day is dealt from — the weekly pools on `pools` are only used to report
  // what the allocation asked for.
  var quota = { feed: {}, story: {}, mm: {} };
  (pools.rows || []).forEach(function (r) {
    var lower = String(r.name).toLowerCase();
    ['feed', 'story', 'mm'].forEach(function (ch) {
      quota[ch][lower] = { name: r.name, n: (r.perDay && r.perDay[ch]) || 0 };
    });
  });

  // ONE "already promoted by this account today" set, shared by all three
  // channels and seeded from every locked slot before any dealing starts.
  //
  // Dealt per channel, feed / story / MM happily land the same girl on the same
  // account on the same day — 200 of them on a real week, some pushed all three
  // ways at once. Her subscribers see the same face three times in a day, which
  // is the opposite of what rotating promo is for. Nine slots a day against 22
  // other creators, so distinctness costs nothing.
  var usedToday = {};
  var useSet = function (day, acct) {
    var k = day + '|' + acct;
    return (usedToday[k] = usedToday[k] || {});
  };

  // How many times each account has already been given each creator this week,
  // counted across feed, story and MM together. Shared, because "Antonella
  // keeps promoting Kiara" is just as true whether it happens on the feed three
  // times or once on each channel.
  var pairUse = {};
  ['feed', 'story', 'mm'].forEach(function (key) {
    var s = scanChannel_(key, start);
    Object.keys(s.groups).forEach(function (k) {
      var g = s.groups[k];
      Object.keys(g.taken).forEach(function (n) {
        var pk = g.acct.toLowerCase() + '|' + n;
        pairUse[pk] = (pairUse[pk] || 0) + 1;
      });
    });
  });

  var scans = {};
  ['feed', 'story', 'mm'].forEach(function (key) {
    scans[key] = scanChannel_(key, start);
    Object.keys(scans[key].groups).forEach(function (k) {
      var g = scans[key].groups[k], set = useSet(g.day, g.acct);
      Object.keys(g.taken).forEach(function (n) { set[n] = true; });
    });
  });

  var res = {}, owed = 0, done = 0;
  ['feed', 'story', 'mm'].forEach(function (key) {
    res[key] = fillChannel_(key, start, roster, quota[key], cad[key], perm[key] || {},
                            scans[key], useSet, pairUse);
    owed += res[key].owed; done += res[key].placed;
  });

  // Day order and the separators, once everything is written.
  SpreadsheetApp.flush();
  var sorted = 0;
  ['feed', 'story', 'mm'].forEach(function (key) {
    try { sorted += tidySchedule_(key, start) ? 1 : 0; }
    catch (e) { log_('tidySchedule FAILED', key + ': ' + e.message); }
  });

  return { sorted: sorted,
           feed: res.feed.rows, story: res.story.rows, mm: res.mm.rows,
           kept: res.feed.kept + res.story.kept + res.mm.kept,
           permanent: res.feed.permanent + res.story.permanent + res.mm.permanent,
           allocated: owed, placed: done };
}

/**
 * One channel, one week.
 *
 * Order matters: permanent pairings are placed first (they are a standing
 * decision, not an allocation), then the pool fills whatever is left. Existing
 * rows are filled in place before any new row is appended, so a row carrying a
 * locked slot keeps its position in the day rather than being re-created below
 * everything else.
 */
function fillChannel_(key, start, roster, quota, perDay, permByDay, scan, useSet, pairUse) {
  var spec = PROMO_SLOTS[key], def = TABS[key], sh = sheet_(def.name);
  scan = scan || scanChannel_(key, start);

  // Only the SFS slots are ours. A feed row has four columns but two of them
  // are schedulable, so "room" is counted in SFS slots, never in columns.
  var perRowSfs   = spec.rowPerSlot ? 1 : sfsSlots_(spec).length;
  var shifts      = LIST.mmShift.slice(0, perDay);
  var twins       = samePersonMap_();

  var edits = [], appended = [], permCount = 0, placed = 0, owed = 0;
  var n = roster.length;

  for (var d = 0; d < PROMO_DAYS; d++) {
    var date = addDays_(start, d), day = dayKey_(date);

    // ONE POOL PER DAY, not one per week.
    //
    // A weekly pool only knows the seven-day total, so it satisfies it wherever
    // there happens to be room. On a Monday with 73 of 92 slots already locked
    // it can place almost nothing, and the whole correction lands on Wednesday
    // — a creator on a flat 9 a day comes out 3, 13, 14, 9, 8, 6, 8. Right for
    // the week, useless as a schedule.
    //
    // Rebuilding the pool each morning from "her daily number minus what today
    // already has locked" makes every day right on its own terms.
    var already = scan.placedByDay[day] || {};
    var dayPool = smoothPool_(Object.keys(quota).map(function (lower) {
      return { name: quota[lower].name,
               slots: Math.max(0, quota[lower].n - (already[lower] || 0)) };
    }).filter(function (x) { return x.slots > 0; }));
    owed += dayPool.length;

    for (var i = 0; i < n; i++) {
      // Rotate who goes first each day, so the rounding remainder moves round
      // the roster instead of always landing on the same accounts.
      var acct = roster[(i + d) % n];
      var g = scan.groups[day + '|' + acct];
      // The exclusion set spans all three channels, so a name already given to
      // this account today cannot come back through another one.
      var taken = useSet ? useSet(day, acct) : (g ? g.taken : {});

      // Her other account counts as herself. Sandra promoting June reaches an
      // audience that already knows her and spends a slot that could have
      // reached somebody new.
      (twins[acct.toLowerCase()] || []).forEach(function (t) { taken[t] = true; });

      // Permanent pairings for this account today, minus any already sitting in
      // a locked slot — otherwise a re-run stacks a second copy beside the first.
      var want = (permByDay[day] && permByDay[day][acct.toLowerCase()]) || [];
      var need = want.filter(function (nm) { return !taken[nm.toLowerCase()]; });

      // How many SFS slots this account can still take today. Feed and story
      // hold theirs across one row, so an existing row offers exactly its free
      // ones; MM is a row per DM, so a group short of rows can still take more.
      var free = g ? g.free.slice() : [];
      var room = !g ? (spec.rowPerSlot ? perDay : perRowSfs)
                    : free.length + (spec.rowPerSlot ? Math.max(0, perDay - g.rows.length) : 0);
      if (room <= 0) continue;

      var picks = [];
      need.slice(0, room).forEach(function (nm) {
        picks.push({ name: nm, perm: true });
        if (pairUse) {
          var pk = acct.toLowerCase() + '|' + nm.toLowerCase();
          pairUse[pk] = (pairUse[pk] || 0) + 1;
        }
        // A permanent placement spends her quota for the day like any other.
        for (var q = 0; q < dayPool.length; q++) {
          if (String(dayPool[q]).toLowerCase() === nm.toLowerCase()) { dayPool.splice(q, 1); break; }
        }
      });

      var take = room - picks.length;
      if (take > 0) {
        takeFromPool_(dayPool, acct, take, taken, pairUse).forEach(function (nm) {
          if (nm) picks.push({ name: nm, perm: false });
        });
      }
      if (!picks.length) continue;
      placed += picks.length;

      // Existing free slots first, then new rows.
      picks.forEach(function (p) {
        if (free.length) {
          var cell = free.shift();
          edits.push({ row: cell.row, slot: cell.slot, name: p.name, perm: p.perm });
        } else {
          appended.push({ date: date, acct: acct, name: p.name, perm: p.perm,
                          shift: shifts[(g ? g.rows.length : 0) + appended.length % perDay] });
        }
        if (p.perm) permCount++;
        taken[p.name.toLowerCase()] = true;
      });
    }
  }

  // Rows that already existed get their non-SFS slots labelled too, so the tab
  // reads the same whether a row was written today or three runs ago.
  Object.keys(scan.byRow).forEach(function (rowStr) {
    (scan.byRow[rowStr].reserved || []).forEach(function (si) {
      var s = spec.slots[si];
      if (!s.status || def.headers.indexOf(s.status) < 0) return;
      edits.push({ row: Number(rowStr), slot: si, name: '',
                   stamp: slotRole_(s) === 'own' ? OWN_CONTENT : OVER_CAP });
    });
  });

  applyEdits_(sh, def, spec, edits);
  var written = appendSlots_(sh, def, spec, appended, perDay, shifts, scan);
  return { rows: written, kept: scan.rows, permanent: permCount,
           owed: owed, placed: placed };
}

/**
 * Write the in-place edits one COLUMN at a time.
 *
 * Cell by cell is 600+ round trips on a full week and times the script out.
 * A whole-row write is worse: it would flatten the "$ this week" formulas
 * sitting between the slots. Per column over the week's row span is one call
 * per column and touches nothing else.
 */
function applyEdits_(sh, def, spec, edits) {
  if (!edits.length) return;
  var from = edits[0].row, to = edits[0].row;
  edits.forEach(function (e) { from = Math.min(from, e.row); to = Math.max(to, e.row); });
  var height = to - from + 1;

  var cols = {};
  var want = function (h) {
    if (!h || def.headers.indexOf(h) < 0) return null;
    var c = headerIndex_(def, h);
    if (!cols[c]) cols[c] = sh.getRange(from, c, height, 1).getValues();
    return cols[c];
  };

  edits.forEach(function (e) {
    var s = spec.slots[e.slot], at = e.row - from;
    var col = want(s.name);    if (col) col[at][0] = e.name;
    var cst = want(s.status);
    if (cst) cst[at][0] = e.stamp ? e.stamp : (e.perm ? PERMANENT : 'Scheduled');
  });

  Object.keys(cols).forEach(function (c) {
    sh.getRange(from, Number(c), height, 1).setValues(cols[c]);
  });
}

/** New rows for the account-days that had none, appended in one block. */
function appendSlots_(sh, def, spec, appended, perDay, shifts, scan) {
  if (!appended.length) return 0;

  var iDate = headerIndex_(def, spec.date) - 1;
  var iAcct = headerIndex_(def, spec.promoter) - 1;
  var rows = [], index = {}, order = [];

  appended.forEach(function (a) {
    var k = dayKey_(a.date) + '|' + a.acct;
    if (spec.rowPerSlot) {                                  // MM: one row per promotion
      var row = new Array(def.headers.length).fill('');
      row[iDate] = new Date(a.date.getTime());
      row[iAcct] = a.acct;
      row[headerIndex_(def, spec.slots[0].name) - 1] = a.name;
      row[headerIndex_(def, spec.slots[0].status) - 1] = a.perm ? PERMANENT : 'Scheduled';
      if (def.headers.indexOf('IP Tracker') >= 0) row[headerIndex_(def, 'IP Tracker') - 1] = 'MM';
      if (def.headers.indexOf('Shift') >= 0) {
        var used = (index[k] = (index[k] || 0)) + ((scan.groups[k] || {}).rows || []).length;
        row[headerIndex_(def, 'Shift') - 1] = shifts[used % shifts.length];
        index[k]++;
      }
      rows.push(row);
      return;
    }
    // Feed and story: one row per account-day, several slots across it.
    var at = index[k];
    if (at === undefined) {
      at = index[k] = rows.length;
      order.push(k);
      var fresh = new Array(def.headers.length).fill('');
      fresh[iDate] = new Date(a.date.getTime());
      fresh[iAcct] = a.acct;
      (def.checks || []).forEach(function (h) { fresh[headerIndex_(def, h) - 1] = false; });
      // Stamp the slots that are not ours, so a brand-new row already says what
      // the creator owns and what is past the platform cap.
      spec.slots.forEach(function (s) {
        var role = slotRole_(s);
        if (role === 'sfs' || !s.status || def.headers.indexOf(s.status) < 0) return;
        fresh[headerIndex_(def, s.status) - 1] = role === 'own' ? OWN_CONTENT : OVER_CAP;
      });
      rows.push(fresh);
    }
    // Only into a slot the engine owns — never over her own content.
    var line = rows[at], put = -1, sfs = sfsSlots_(spec);
    for (var q = 0; q < sfs.length; q++) {
      if (!line[headerIndex_(def, spec.slots[sfs[q]].name) - 1]) { put = sfs[q]; break; }
    }
    if (put < 0) return;
    var s = spec.slots[put];
    line[headerIndex_(def, s.name) - 1] = a.name;
    if (s.status && def.headers.indexOf(s.status) >= 0) {
      line[headerIndex_(def, s.status) - 1] = a.perm ? PERMANENT : 'Scheduled';
    }
  });

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  if (at + rows.length > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), at + rows.length - sh.getMaxRows() + 30);
  }
  sh.getRange(at, 1, rows.length, def.headers.length).setValues(rows);
  sh.getRange(at, iDate + 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  (def.checks || []).forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).insertCheckboxes();
  });

  // Dropdowns and colours for the rows just written. The builder styles the
  // block once, and deleting rows shrinks that range — without this, every
  // appended row after a cleared week comes out plain.
  Object.keys(def.lists || {}).forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(LIST[def.lists[h]], true).setAllowInvalid(false).build());
  });
  ['Model (Promoter)', 'Promoter', 'Promoting Creator', 'Promoted Creator',
   '1st Promote', '2nd Promote', '3rd Promote', '4th Promote',
   '1st Promoting Model', '2nd Promoting Model'].forEach(function (h) {
    if (def.headers.indexOf(h) < 0) return;
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(ss_().getRangeByName('CRM_Roster'), true)
        .setAllowInvalid(true).build());
  });
  applyConditional_(sh, def, null);

  // A line under each day, so Tuesday visibly starts where Monday stops.
  //
  // Worked out from the rows themselves, not from a running count of the
  // promotions that produced them: four feed picks collapse into one row, so a
  // pick-based index drew the line four rows past where the day ended, or off
  // the end of the block entirely.
  var iDay = iDate;
  for (var b = 0; b < rows.length; b++) {
    var isLast = (b === rows.length - 1) ||
                 dayKey_(rows[b][iDay]) !== dayKey_(rows[b + 1][iDay]);
    if (!isLast) continue;
    sh.getRange(at + b, 1, 1, def.headers.length)
      .setBorder(null, null, true, null, null, null,
                 C.head, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }

  Object.keys(def.calc || {}).forEach(function (h) {
    var out = [];
    for (var i = 0; i < rows.length; i++) out.push([def.calc[h].replace(/\{r\}/g, String(at + i))]);
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).setFormulas(out).setBackground(C.calc);
  });
  return rows.length;
}

function addDays_(d, n) {
  var x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Put a week back into day order and rule a line under each day.
 *
 * The writer appends new rows at the bottom, and rows carrying locked work stay
 * where they are — so a regenerate leaves the tab reading Monday…Sunday, then
 * Monday…Sunday again. Two Mondays 60 rows apart is not a schedule anybody can
 * work from.
 *
 * The separators are drawn here rather than at append time for the same reason:
 * a day whose slots were all filled inside rows that already existed adds no
 * rows at all, so an append-time border draws nothing under it.
 */
function tidySchedule_(key, start) {
  var spec = PROMO_SLOTS[key], def = TABS[key], sh = sheet_(def.name);
  var scan = scanChannel_(key, start);
  if (scan.rows < 2) return 0;

  var cols   = def.headers.length;
  var from   = scan.from, height = scan.to - from + 1;
  var iDate  = headerIndex_(def, spec.date) - 1;
  var iAcct  = headerIndex_(def, spec.promoter) - 1;
  var want   = weekKey_(start);

  var rng  = sh.getRange(from, 1, height, cols);
  var vals = rng.getValues();
  var fml  = rng.getFormulas();

  // Another week's rows sitting inside this span would be dragged around by the
  // sort. Leave the tab alone rather than reorder someone else's week.
  for (var g = 0; g < height; g++) {
    var d = vals[g][iDate];
    if (d === '' || d === null) continue;
    if (weekKey_(d) !== want) return 0;
  }

  var isCalc = {};
  Object.keys(def.calc || {}).forEach(function (h) {
    var at = headerIndex_(def, h);
    if (at) isCalc[at - 1] = true;
  });

  var lines = [];
  for (var r = 0; r < height; r++) {
    var line = [];
    for (var c = 0; c < cols; c++) {
      // Calculated columns are rewritten below. Carrying the old formula across
      // would leave a row that moved pointing at the row it used to be.
      line.push(isCalc[c] ? '' : (fml[r][c] ? fml[r][c] : vals[r][c]));
    }
    lines.push({ day: dayKey_(vals[r][iDate]),
                 acct: String(vals[r][iAcct] || ''),
                 at: r, row: line });
  }

  var order = lines.slice().sort(function (a, b) {
    if (!a.day !== !b.day) return a.day ? -1 : 1;         // blank rows sink
    if (a.day !== b.day)   return a.day < b.day ? -1 : 1;
    if (a.acct !== b.acct) return a.acct < b.acct ? -1 : 1;
    return a.at - b.at;                                   // stable otherwise
  });
  var already = order.every(function (l, i) { return l.at === i; });

  if (!already) {
    rng.setValues(order.map(function (l) { return l.row; }));
    sh.getRange(from, iDate + 1, height, 1).setNumberFormat('yyyy-mm-dd');
    Object.keys(def.calc || {}).forEach(function (h) {
      var out = [];
      for (var i = 0; i < height; i++) out.push([def.calc[h].replace(/\{r\}/g, String(from + i))]);
      sh.getRange(from, headerIndex_(def, h), height, 1).setFormulas(out).setBackground(C.calc);
    });
  }

  // One line under the last row of each day, and none anywhere else in the
  // block — otherwise yesterday's separators stay where the rows used to be.
  //
  // The sixth argument is what does the work. setBorder(top, left, bottom,
  // right, vertical, HORIZONTAL) treats "bottom" as the outer edge of the whole
  // range, so clearing with bottom=false wipes one line at the very end and
  // leaves every interior separator exactly where it was. Rows move on every
  // run, so those strand mid-day and accumulate — four lines through a Thursday.
  rng.setBorder(null, null, false, null, null, false);
  for (var b = 0; b < height; b++) {
    var day = order[b].day;
    if (!day) break;
    var last = (b === height - 1) || order[b + 1].day !== day;
    if (!last) continue;
    sh.getRange(from + b, 1, 1, cols)
      .setBorder(null, null, true, null, null, null,
                 C.head, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
  return already ? 0 : height;
}

// ── Notes typed into the wrong column ───────────────────────────────────────

/**
 * Sweep prose out of the Internal Promo Plan's number columns and into Notes.
 *
 * Luca wrote four rules into C28:D32 — the Slots and Feed columns — which is
 * the obvious place to write when you are looking at the numbers they describe.
 * They are invisible to a CSV export (a text value in a numeric column comes
 * back blank) and they sit exactly where the allocator writes, so the next run
 * would have overwritten them. Nothing is deleted: each line is moved to the
 * Notes column of its own row and the original cell is emptied.
 */
function tidyPlanNotes() {
  var def = TABS.promoPlan, sh = sheet_(def.name);
  var iNotes = headerIndex_(def, 'Notes');
  var iCrea  = headerIndex_(def, 'Creator');
  var iWeek  = headerIndex_(def, 'Week starting');
  var numeric = ['Slots / day', 'Feed', 'Story', 'MM', 'Prev-week slots']
                  .filter(function (h) { return def.headers.indexOf(h) >= 0; })
                  .map(function (h) { return headerIndex_(def, h); });

  // getLastRow, not lastDataRow_. Notes are written BELOW the last creator, in
  // rows with no "Week starting" — and lastDataRow_ scans column A, so it stops
  // above them and the sweep would find nothing at all.
  var last = sh.getLastRow();
  if (last < FIRST_ROW) { alert_('Nothing to move', 'The plan is empty.'); return; }
  var vals = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();

  var moved = [], clears = [];
  vals.forEach(function (r, i) {
    var row = FIRST_ROW + i, found = [];
    numeric.forEach(function (c) {
      var v = r[c - 1];
      if (typeof v !== 'string') return;
      var t = v.trim();
      if (!t || !isNaN(Number(t))) return;              // a number typed as text is a number
      found.push(t);
      clears.push({ row: row, col: c });
    });
    if (!found.length) return;

    var existing = String(r[iNotes - 1] || '').trim();
    var merged = (existing ? existing + '\n' : '') + found.join('\n');
    sh.getRange(row, iNotes).setValue(merged).setWrap(true);
    moved.push('row ' + row + ': ' + found.length + ' line(s)');

    // The word "notes" typed into the Creator column is a label for the block
    // below it, not a creator — and the dropdown has been flagging it red.
    if (/^notes?$/i.test(String(r[iCrea - 1] || '').trim()) && !r[iWeek - 1]) {
      sh.getRange(row, iCrea).setValue('');
    }
  });

  clears.forEach(function (c) { sh.getRange(c.row, c.col).setValue(''); });

  if (!moved.length) { alert_('Nothing to move', 'No prose in the number columns.'); return; }
  log_('tidyPlanNotes', moved.join(' | '));
  alert_('Notes moved', moved.join('\n') + '\n\n' +
    'They are now in the Notes column of the same row, where the allocator will not ' +
    'write over them. Nothing was deleted.');
}

// ── Permanent SFS ───────────────────────────────────────────────────────────

/**
 * Turn the Permanent SFS tab into "on this day, this account promotes these
 * names", which is the only shape the writer can use.
 *
 * "Any salary" is a real value, not a placeholder: Luca's rule is "1–3 salary
 * SFS can stay permanently", which names a COUNT and a tier, not a pairing.
 * Spelling it as a wildcard means nobody has to invent which three, and the
 * rotation still moves round the tier day to day.
 */
function permanentPlan_(start, roster) {
  var def = TABS.permanent;
  var sh  = ss_().getSheetByName(def.name);
  var out = { feed: {}, story: {}, mm: {} };
  if (!sh) return out;

  var live = {};
  roster.forEach(function (c) { live[c.toLowerCase()] = c; });

  var tier = {};
  creatorRows_().forEach(function (c) {
    tier[String(c.name).toLowerCase()] = String(c.type || '').toLowerCase();
  });
  var salary = roster.filter(function (c) { return tier[c.toLowerCase()] === 'salary'; });

  var rules = tabRows_(def).filter(function (r) {
    return String(r['Promoter'] || '').trim() && r['Active'] !== false;
  });
  if (!rules.length) return out;

  var chKey = { 'feed': 'feed', 'story': 'story', 'mm': 'mm' };
  var spin = 0;

  rules.forEach(function (r) {
    var promoter = String(r['Promoter']).trim();
    if (!live[promoter.toLowerCase()]) return;                       // not posting this week
    var ch = chKey[String(r['Channel'] || '').trim().toLowerCase()];
    if (!ch) return;

    var count = Number(r['Slots']) || 0;
    if (count <= 0) return;
    var weekly = String(r['Per'] || 'day').trim().toLowerCase() === 'week';

    var target = String(r['Promoted'] || '').trim();
    var pool = /^any salary$/i.test(target)
             ? salary.filter(function (c) { return c.toLowerCase() !== promoter.toLowerCase(); })
             : (live[target.toLowerCase()] && target.toLowerCase() !== promoter.toLowerCase()
                ? [live[target.toLowerCase()]] : []);
    if (!pool.length) return;

    // A weekly rule lands on the first `count` days, one a day, rather than all
    // at once — "1–3 permanent feed per week" is a cadence, not a burst.
    for (var d = 0; d < PROMO_DAYS; d++) {
      var per = weekly ? (d < count ? 1 : 0) : count;
      if (!per) continue;
      var day = dayKey_(addDays_(start, d));
      var bucket = out[ch][day] || (out[ch][day] = {});
      var list = bucket[promoter.toLowerCase()] || (bucket[promoter.toLowerCase()] = []);
      for (var k = 0; k < per; k++) {
        var pick = pool[(d + k + spin) % pool.length];
        if (list.indexOf(pick) < 0) list.push(pick);
      }
    }
    spin++;
  });
  return out;
}

/**
 * Write Luca's rules onto the Permanent SFS tab.
 *
 * Append-only and idempotent on (promoter, promoted, channel) — running it
 * twice does not double anything, and it never overwrites a row someone has
 * edited by hand. The numbers are his midpoints; the tab is meant to be edited.
 */
function seedPermanentSfs() {
  var def = TABS.permanent, sh = sheet_(def.name);

  var tier = {};
  creatorRows_().forEach(function (c) {
    tier[String(c.name).trim()] = String(c.type || '').trim();
  });
  var salary = Object.keys(tier).filter(function (n) { return tier[n] === 'Salary'; });
  if (!salary.length) {
    alert_('No salary creators', 'Nobody on Creators has Type = Salary, so there is no ' +
           '"any salary" for the rules to point at.');
    return;
  }

  var named = function (list) {
    return list.filter(function (n) { return tier.hasOwnProperty(n); });
  };
  // Luca, Internal Promo Plan C28:D32.
  var rules = [];
  salary.forEach(function (n) {
    rules.push([n, 'Any salary', 'Feed', 4, 'day',
                'Salary SFS with each other — feed posts stay up permanently.']);
    rules.push([n, 'Any salary', 'MM',   2, 'day',
                'Salary MMs stay permanently across each other. 2 of 3 so one MM a day is not SFS.']);
  });
  named(['Marissa', 'Angelina', 'Maylee', 'Sophie']).forEach(function (n) {
    rules.push([n, 'Any salary', 'Feed', 2, 'day', 'Luca: 1–3 can stay permanently.']);
  });
  named(['Blue Bear', 'Emma', 'Julie', 'Charlotte', 'Emily']).forEach(function (n) {
    rules.push([n, 'Any salary', 'Feed', 2, 'week',
                'Luca: 1–3 permanent feed a week, reviewed end of week. Regular model ' +
                'feed posts in between so it does not read as spam.']);
    rules.push([n, 'Any salary', 'MM',   1, 'day',
                'Luca: 1 permanent MM a day. Keep a non-SFS MM as well.']);
  });

  var have = {};
  tabRows_(def).forEach(function (r) {
    have[[String(r['Promoter']).trim().toLowerCase(),
          String(r['Promoted']).trim().toLowerCase(),
          String(r['Channel']).trim().toLowerCase()].join('|')] = true;
  });

  var today = new Date(), add = [];
  rules.forEach(function (x) {
    if (have[[x[0].toLowerCase(), x[1].toLowerCase(), x[2].toLowerCase()].join('|')]) return;
    var row = def.headers.map(function (h) {
      switch (h) {
        case 'Promoter':  return x[0];
        case 'Promoted':  return x[1];
        case 'Channel':   return x[2];
        case 'Slots':     return x[3];
        case 'Per':       return x[4];
        case 'Active':    return true;
        case 'Since':     return today;
        case 'Review by': return x[4] === 'week' ? addDays_(today, 7) : '';
        case 'Notes':     return x[5];
        default:          return '';
      }
    });
    add.push(row);
  });

  if (!add.length) {
    alert_('Already seeded', 'Every rule from Luca\'s note is already on ' + def.name +
           '. Edit the numbers there — nothing here overwrites a row you have changed.');
    return;
  }

  var at = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
  if (at + add.length > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), at + add.length - sh.getMaxRows() + 20);
  }
  sh.getRange(at, 1, add.length, def.headers.length).setValues(add);
  sh.getRange(at, headerIndex_(def, 'Active'), add.length, 1).insertCheckboxes();
  ['Since', 'Review by'].forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), add.length, 1).setNumberFormat('yyyy-mm-dd');
  });

  log_('seedPermanentSfs', add.length + ' rule(s) written');
  alert_('Permanent SFS seeded', add.length + ' rule(s) written to ' + def.name + '.\n\n' +
    'These are Luca\'s note turned into numbers, and they are his midpoints where he ' +
    'gave a range — "1–3" is written as 2. Change them on that tab, then run ' +
    '"Set up the whole week" and the schedule follows.\n\n' +
    'Anything placed from here is marked "' + PERMANENT + '" on the schedule, which ' +
    'means it is never cleared or reshuffled again.');
  ss_().setActiveSheet(sh);
}
