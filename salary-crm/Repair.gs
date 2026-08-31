/**
 * Repairs for the two ways this file quietly goes wrong, plus a caption net.
 *
 * 1. RENAME. A creator's name is the join key for the entire file — the promo
 *    schedules, the tracking links, the caption bank and the plan all look her
 *    up by the exact string on Creators. Editing that one cell by hand orphans
 *    every row that still says the old name, and nothing warns you.
 *
 * 2. STRAY ROWS. Formats, dropdowns, checkboxes and calculated columns are
 *    written over rows FIRST_ROW..FIRST_ROW+DATA_ROWS-1. An append that landed
 *    below that block — which is what getLastRow() used to cause — leaves rows
 *    that hold data but sit outside every rule: no dropdown, no colour, no
 *    formula, and 230 rows below anything anyone scrolls to. They read as
 *    missing. Closing the gap puts them back inside the machine.
 *
 * 3. CAPTIONS. The bank is the only tab whose content cannot be regenerated
 *    from the API or from another sheet. It gets an append-only archive.
 */

/** The log is a record of what happened. Rewriting it to match a rename would
 *  make it a record of what we wish had happened. */
var RENAME_SKIP = { '_Log': 1 };

/** Blank rows on the three promo schedules are the day separators. Closing the
 *  gaps there would eat them and run the whole week together. */
var COMPACT_SKIP = { feed: 1, story: 1, mm: 1 };

var CAP_ARCHIVE = '_CaptionArchive';

// ── Rename a creator ────────────────────────────────────────────────────────

function renameCreator() {
  var ui = ui_();
  if (!ui) throw new Error('Run this from the UNCVRD CRM menu.');

  var a = ui.prompt('Rename a creator — 1 of 2',
    'The name as it is spelled TODAY, exactly as it appears on Creators:',
    ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var from = String(a.getResponseText() || '').trim();
  if (!from) return;

  var roster = creatorRows_().map(function (c) { return String(c.name).toLowerCase(); });
  if (roster.indexOf(from.toLowerCase()) < 0) {
    alert_('No creator called "' + from + '"',
      'Nothing on Creators is spelled that way, so a rename would leave the old ' +
      'rows orphaned instead of moving them. Copy the name out of column A and try again.');
    return;
  }

  var b = ui.prompt('Rename a creator — 2 of 2',
    'New name for "' + from + '":', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var to = String(b.getResponseText() || '').trim();
  if (!to || to === from) return;

  if (roster.indexOf(to.toLowerCase()) >= 0) {
    var ok = ui.alert('"' + to + '" already exists',
      'There is already a creator called "' + to + '". Renaming "' + from + '" into it ' +
      'merges the two everywhere and leaves you two rows on Creators to reconcile.\n\n' +
      'Carry on?', ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
  }

  var res = renameCreatorEverywhere_(from, to);
  alert_('Renamed "' + from + '" → "' + to + '"', renameReport_(res));
}

/**
 * Whole-cell matches only, and never over a formula.
 *
 * Substring replacement is the obvious implementation and it is wrong here:
 * "Chloe" is a substring of "Chloe / Cleo", so a find-and-replace turns the
 * second creator into "Ali / Cleo" on its way past. Cells that merely mention
 * the name come back in the report for you to read, not edited.
 */
function renameCreatorEverywhere_(from, to) {
  var want = String(from).trim().toLowerCase();
  var out = { from: from, to: to, total: 0, tabs: [], mentions: [], aka: '' };

  ss_().getSheets().forEach(function (sh) {
    var name = sh.getName();
    if (RENAME_SKIP[name]) return;
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    if (last < FIRST_ROW || cols < 1) return;

    var rng  = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, cols);
    var vals = rng.getValues();
    var fml  = rng.getFormulas();
    var cells = [];

    for (var r = 0; r < vals.length; r++) {
      for (var c = 0; c < cols; c++) {
        if (fml[r][c]) continue;                       // a formula owns its own value
        var v = vals[r][c];
        if (typeof v !== 'string') continue;
        var t = v.trim();
        if (!t) continue;
        var lower = t.toLowerCase();
        if (lower === want) {
          cells.push(colA1_(c + 1) + (FIRST_ROW + r));
        } else if (lower.indexOf(want) >= 0) {
          out.mentions.push(name + '!' + colA1_(c + 1) + (FIRST_ROW + r) + ' — ' +
                            (t.length > 70 ? t.slice(0, 70) + '…' : t));
        }
      }
    }

    if (!cells.length) return;
    // Written cell by cell through a range list. Reading the grid back and
    // setValues()-ing the whole thing would flatten every formula on the tab
    // into the number it happened to be showing.
    for (var i = 0; i < cells.length; i += 200) {
      sh.getRangeList(cells.slice(i, i + 200)).setValue(to);
    }
    out.tabs.push(name + ' — ' + cells.length);
    out.total += cells.length;
  });

  out.aka = keepOldSpelling_(from, to);
  log_('renameCreator', from + ' → ' + to + ': ' + out.total + ' cell(s) across ' +
       out.tabs.length + ' tab(s)');
  return out;
}

/**
 * Last week's promo sheets, the ad sheet and everyone's memory still say the
 * old name. Parking it in "Also known as" keeps her findable without keeping
 * a second row alive.
 */
function keepOldSpelling_(from, to) {
  var def = TABS.creators, sh = ss_().getSheetByName(def.name);
  if (!sh) return '';
  var nameCol = headerIndex_(def, 'Creator'), akaCol = headerIndex_(def, 'Also known as');
  var last = lastDataRow_(sh);
  if (last < FIRST_ROW || !akaCol) return '';

  var names = sh.getRange(FIRST_ROW, nameCol, last - HEADER_ROW, 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim().toLowerCase() !== String(to).trim().toLowerCase()) continue;
    var cell = sh.getRange(FIRST_ROW + i, akaCol);
    if (String(cell.getValue() || '').trim()) return '';        // she already has one
    cell.setValue(from);
    return from;
  }
  return '';
}

function renameReport_(res) {
  var lines = [];
  lines.push(res.total + ' cell(s) changed across ' + res.tabs.length + ' tab(s).');
  lines.push('');
  res.tabs.forEach(function (t) { lines.push('  ' + t); });
  if (res.aka) {
    lines.push('');
    lines.push('"' + res.aka + '" kept on the Creators row under "Also known as", ' +
               'so the old spelling is still searchable.');
  }
  if (res.mentions.length) {
    lines.push('');
    lines.push('NOT changed — these mention the old name inside a longer sentence, ' +
               'so a blind replace would have mangled them. Read and fix by hand:');
    res.mentions.slice(0, 12).forEach(function (m) { lines.push('  ' + m); });
    if (res.mentions.length > 12) lines.push('  …and ' + (res.mentions.length - 12) + ' more.');
  }
  return lines.join('\n');
}

// ── Take a creator off the sheet ────────────────────────────────────────────

function removeCreator() {
  var ui = ui_();
  if (!ui) throw new Error('Run this from the UNCVRD CRM menu.');

  var a = ui.prompt('Remove a creator',
    'Name to take off the sheet, exactly as it appears on Creators.\n\n' +
    'Use this for a row that should not exist — a duplicate, or a name a rename ' +
    'left behind. To rename someone, use "Rename a creator" instead: that keeps ' +
    'her history, this does not.',
    ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var name = String(a.getResponseText() || '').trim();
  if (!name) return;

  var res = removeCreatorEverywhere_(name);
  if (!res.total) {
    alert_('Nothing called "' + name + '"', 'No row anywhere is spelled that way.');
    return;
  }
  alert_('Removed "' + name + '"',
    res.detail.join('\n') +
    (res.locked ? '\n\nLEFT ALONE: ' + res.locked + ' slot(s) that already had a tracking ' +
       'link, a caption or a status. Those are somebody\'s work, so they are still there — ' +
       'delete them by hand if you really want them gone.' : '') +
    '\n\nRun "Set up the whole week" to re-deal the slots this freed up.');
}

/**
 * Delete her rows on Creators and the plan; clear her out of the schedules.
 *
 * Never touches a locked slot. Somebody made that tracking link on OnlyFans by
 * hand, and "this creator should not be on the roster" is not a good enough
 * reason to throw it away without being asked.
 */
function removeCreatorEverywhere_(name) {
  var want = String(name).trim().toLowerCase();
  var out = { total: 0, locked: 0, detail: [] };

  [TABS.creators, TABS.promoPlan].forEach(function (def) {
    var sh = ss_().getSheetByName(def.name);
    if (!sh) return;
    var col = headerIndex_(def, 'Creator');
    var last = sh.getLastRow();
    if (!col || last < FIRST_ROW) return;

    var vals = sh.getRange(FIRST_ROW, col, last - HEADER_ROW, 1).getValues();
    var del = [];
    vals.forEach(function (r, i) {
      if (String(r[0] || '').trim().toLowerCase() === want) del.push(FIRST_ROW + i);
    });
    if (!del.length) return;
    deleteRowsBatched_(sh, del);
    out.total += del.length;
    out.detail.push('   ' + def.name + ': ' + del.length + ' row(s) deleted');
  });

  ['feed', 'story', 'mm'].forEach(function (key) {
    var spec = PROMO_SLOTS[key], def = TABS[key];
    var sh = ss_().getSheetByName(def.name);
    if (!sh) return;
    var last = sh.getLastRow();
    if (last < FIRST_ROW) return;

    var vals  = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();
    var iAcct = headerIndex_(def, spec.promoter) - 1;
    var del = [], blanks = [];

    vals.forEach(function (r, i) {
      var row = FIRST_ROW + i;
      if (String(r[iAcct] || '').trim().toLowerCase() === want) {
        if (spec.slots.some(function (s) { return slotLocked_(def, r, s); })) { out.locked++; return; }
        del.push(row);
        return;
      }
      spec.slots.forEach(function (s, si) {
        if (String(r[headerIndex_(def, s.name) - 1] || '').trim().toLowerCase() !== want) return;
        if (slotLocked_(def, r, s)) { out.locked++; return; }
        blanks.push({ row: row, slot: si });
      });
    });

    // Blank before deleting: a delete shifts every row below it.
    blankSlots_(sh, def, spec, blanks);
    deleteRowsBatched_(sh, del);

    if (!del.length && !blanks.length) return;
    out.total += del.length + blanks.length;
    out.detail.push('   ' + def.name + ': ' + del.length + ' row(s) where she was posting, ' +
                    blanks.length + ' slot(s) where she was being promoted');
  });

  if (out.total) log_('removeCreator', name + ': ' + out.total + ' change(s), ' + out.locked + ' left alone');
  return out;
}

// ── Close the gaps ──────────────────────────────────────────────────────────

function compactTabs() {
  var kept = archiveCaptions_();
  var moved = [], rebuilt = [];

  TAB_ORDER.forEach(function (key) {
    var def = TABS[key];
    if (!def || !def.headers || def.kind || COMPACT_SKIP[key]) return;
    var res = compactTab_(key);
    if (!res || !res.closed) return;
    moved.push(def.name + ' — ' + res.rows + ' row(s) now start at row ' + FIRST_ROW +
               ', ' + res.closed + ' blank row(s) closed');
    rebuilt.push(key);
  });

  // Formats, dropdowns, checkboxes and calculated columns are written over the
  // block, not over wherever the rows happened to be. Moving the rows without
  // this leaves them tidy and still inert.
  SpreadsheetApp.flush();
  rebuilt.forEach(function (key) {
    try { buildDataTab_(key); }
    catch (e) { moved.push('! ' + TABS[key].name + ' moved but would not rebuild: ' + e.message); }
  });

  if (!moved.length) {
    alert_('Nothing to close up', 'Every tab already starts at row ' + FIRST_ROW +
           ' with no gaps.' + (kept ? '\n\n' + kept + ' new caption(s) archived.' : ''));
    return;
  }
  log_('compactTabs', moved.join(' | '));
  alert_('Rows closed up', moved.join('\n') +
         '\n\nEach one was rebuilt afterwards, so the dropdowns, colours and ' +
         'calculated columns now cover them.' +
         (kept ? '\n\n' + kept + ' new caption(s) archived first.' : ''));
}

/**
 * Pull every populated row up against the header, keeping order, and blank the
 * rows they came from. Returns {rows, closed} or null when there was nothing
 * to do.
 */
function compactTab_(key) {
  var def = TABS[key];
  var sh  = ss_().getSheetByName(def.name);
  if (!sh) return null;

  var cols = def.headers.length;
  var last = sh.getLastRow();
  if (last <= FIRST_ROW) return null;

  var rows = last - HEADER_ROW;
  var rng  = sh.getRange(FIRST_ROW, 1, rows, cols);
  var vals = rng.getValues();
  var fml  = rng.getFormulas();

  var isCalc = {};
  Object.keys(def.calc || {}).forEach(function (h) {
    var i = headerIndex_(def, h);
    if (i) isCalc[i - 1] = true;
  });

  // A row is real if anything OUTSIDE the calculated columns is filled. Empty
  // checkbox cells read back as false, which is not content, and a calculated
  // column returns a value on every row in the block whether the row exists
  // or not — counting either would say the tab is full to row 253.
  var real = function (row) {
    for (var c = 0; c < cols; c++) {
      if (isCalc[c]) continue;
      var v = row[c];
      if (v !== '' && v !== null && v !== false) return true;
    }
    return false;
  };

  var keep = [], lastReal = -1;
  for (var r = 0; r < rows; r++) if (real(vals[r])) { keep.push(r); lastReal = r; }
  if (!keep.length) return null;
  if (lastReal === keep.length - 1) return null;             // already tight

  var out = [];
  keep.forEach(function (r) {
    var line = [];
    for (var c = 0; c < cols; c++) {
      // Calculated columns are rewritten row by row by the rebuild. Carrying
      // the old text across would freeze each one at what its ORIGINAL row
      // said — a formula that reads $B270 landing on row 12.
      if (isCalc[c]) line.push('');
      else line.push(fml[r][c] ? fml[r][c] : vals[r][c]);
    }
    out.push(line);
  });
  var blank = [];
  for (var c2 = 0; c2 < cols; c2++) blank.push('');
  while (out.length < rows) out.push(blank.slice());

  // ONE write. clearContent() then setValues() is two operations and the
  // six-minute kill can land between them, which is how a rebuild once wiped
  // the rows it was moving.
  rng.setValues(out);

  return { rows: keep.length, closed: lastReal + 1 - keep.length };
}

// ── Caption safety net ──────────────────────────────────────────────────────

/**
 * Append-only. Every caption that has ever been on the bank stays here under
 * its normalised key, so a bad sort, a stray delete or a rebuild that goes
 * wrong costs nothing that cannot be put back.
 */
function archiveCaptions_() {
  var def = TABS.captions;
  var sh  = ss_().getSheetByName(def.name);
  if (!sh) return 0;

  var rows = tabRows_(def).filter(function (r) { return String(r['Caption'] || '').trim(); });
  if (!rows.length) return 0;

  var arc = ss_().getSheetByName(CAP_ARCHIVE);
  if (!arc) {
    arc = ss_().insertSheet(CAP_ARCHIVE);
    arc.getRange(1, 1, 1, 6)
       .setValues([['Caption', 'Channel', 'Angle / niche', 'Fits creator', 'First archived', 'Key']])
       .setFontWeight('bold');
    arc.setFrozenRows(1);
    arc.setColumnWidth(1, 420);
    arc.hideSheet();
  }

  var have = {}, lastA = arc.getLastRow();
  if (lastA > 1) {
    arc.getRange(2, 6, lastA - 1, 1).getValues()
       .forEach(function (r) { have[String(r[0])] = true; });
  }

  var add = [], now = new Date();
  rows.forEach(function (r) {
    var k = capKey_(r['Caption']);
    if (!k || have[k]) return;
    have[k] = true;
    add.push([r['Caption'], r['Channel'] || '', r['Angle / niche'] || '',
              r['Fits creator'] || '', now, k]);
  });
  if (add.length) arc.getRange(arc.getLastRow() + 1, 1, add.length, 6).setValues(add);
  return add.length;
}

function backupCaptions() {
  var added = archiveCaptions_();
  var arc = ss_().getSheetByName(CAP_ARCHIVE);
  var held = arc ? Math.max(0, arc.getLastRow() - 1) : 0;
  alert_('Caption backup',
    held + ' caption(s) held in the archive' + (added ? ', ' + added + ' new this run' : '') +
    '.\n\nIt is a hidden tab called ' + CAP_ARCHIVE + ' and it is append-only — nothing ' +
    'is ever removed from it, including captions you delete from the bank on purpose.\n\n' +
    '"Restore missing captions" puts back anything that has left the bank.');
}

/**
 * Put back every archived caption that is no longer on the bank. They come
 * back Resting, never Active — a caption that vanished may have been retired
 * deliberately, and this should not put it into rotation behind your back.
 */
function restoreCaptions() {
  archiveCaptions_();                                        // never restore over an unsaved bank

  var def = TABS.captions;
  var arc = ss_().getSheetByName(CAP_ARCHIVE);
  if (!arc || arc.getLastRow() < 2) { alert_('Nothing archived yet', 'Run "Back up the caption bank" first.'); return; }

  var live = {};
  tabRows_(def).forEach(function (r) {
    var k = capKey_(r['Caption']);
    if (k) live[k] = true;
  });

  var arch = arc.getRange(2, 1, arc.getLastRow() - 1, 6).getValues();
  var back = [], today = new Date();
  arch.forEach(function (a) {
    if (live[String(a[5])]) return;
    live[String(a[5])] = true;
    var row = def.headers.map(function (h) {
      switch (h) {
        case 'Caption':       return a[0];
        case 'Channel':       return a[1];
        case 'Angle / niche': return a[2];
        case 'Fits creator':  return a[3];
        case 'Added':         return today;
        case 'Times used':    return 0;
        case 'Status':        return 'Resting';
        case 'Notes':         return 'Restored from the archive — check before it goes Active.';
        default:              return '';
      }
    });
    back.push(row);
  });

  if (!back.length) { alert_('Nothing missing', 'Every archived caption is still on the bank.'); return; }
  appendRows_(def, back);
  log_('restoreCaptions', back.length + ' caption(s) restored');
  alert_('Captions restored', back.length + ' caption(s) put back on the bank, all Resting. ' +
         'Read them before you switch any to Active.');
}
