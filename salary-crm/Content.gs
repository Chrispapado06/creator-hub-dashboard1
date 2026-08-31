/**
 * UNCVRD — content from Drive, attached to the mass DMs
 * ============================================================================
 * The VA should not be hunting a folder for something to send. The schedule
 * already knows which creator is being promoted in each DM, so it can name the
 * asset too — and then the job is "open the link, send it", not "find something
 * of hers and hope it has not gone out twice this week".
 *
 * Two steps, deliberately separate:
 *
 *   indexDriveContent()   walks the Drive once and writes a flat index of every
 *                         image and clip it can see, per creator. Slow, so it is
 *                         a thing you run, not something the week generator does.
 *   attachMmContent()     fills the Content column on this week's DMs from that
 *                         index, rotating so the same file is not sent twice in
 *                         a row. Fast, and safe to run again.
 *
 * Nothing here ever writes to Drive. The scope is read-only and the index holds
 * links, not copies.
 */

var CONTENT_TAB  = '_DriveContent';
var CONTENT_COLS = ['Creator', 'File', 'Type', 'URL', 'Modified', 'Folder'];
var CONTENT_MAX  = 300;      // per creator — a folder of thousands is a mistake, not a plan

/** Anything a DM can carry. Everything else in the folder is ignored. */
function contentKind_(mime) {
  if (!mime) return '';
  if (mime === 'image/gif') return 'GIF';
  if (mime.indexOf('image/') === 0) return 'Image';
  if (mime.indexOf('video/') === 0) return 'Video';
  return '';
}

/** A Drive folder id out of whatever someone pasted — URL, id, or /folders/ link. */
function folderId_(v) {
  var s = String(v || '').trim();
  if (!s) return '';
  var m = s.match(/[-\w]{25,}/);
  return m ? m[0] : '';
}

/**
 * Walk the content Drive and write one row per usable file.
 *
 * Two ways a creator's folder is found, and both are honoured: a folder link in
 * her own "Drive folder" cell on Creators, or a subfolder of the root whose name
 * matches her name or her "Also known as". The root is the normal case — one
 * Drive, a folder per girl.
 */
function indexDriveContent() {
  var rootId = folderId_(cfg_('CONTENT_DRIVE'));
  var rows   = creatorRows_();
  var known  = {}, canonical = {};
  rows.forEach(function (c) {
    var name = String(c.name || '').trim();
    if (!name) return;
    canonical[name.toLowerCase()] = name;
    known[name.toLowerCase()] = name;
    String(c.aka || '').split(/\s*[,/]\s*/).forEach(function (a) {
      if (a.trim()) known[a.trim().toLowerCase()] = name;
    });
  });

  var out = [], skipped = [], seenFolders = 0;

  var readFolder = function (folder, creator) {
    var files = folder.getFiles(), n = 0;
    while (files.hasNext() && n < CONTENT_MAX) {
      var f = files.next();
      var kind = contentKind_(f.getMimeType());
      if (!kind) continue;
      out.push([creator, f.getName(), kind, f.getUrl(), f.getLastUpdated(), folder.getName()]);
      n++;
    }
    seenFolders++;
    return n;
  };

  // Her own folder link wins — it is the explicit answer to "where is her stuff".
  rows.forEach(function (c) {
    var id = folderId_(c.driveFolder);
    if (!id) return;
    try { readFolder(DriveApp.getFolderById(id), String(c.name).trim()); }
    catch (e) { skipped.push(c.name + ' — folder link will not open: ' + e.message); }
  });

  if (rootId) {
    try {
      var root = DriveApp.getFolderById(rootId);
      var subs = root.getFolders();
      while (subs.hasNext()) {
        var sub = subs.next();
        var who = known[sub.getName().trim().toLowerCase()];
        if (!who) { skipped.push('folder "' + sub.getName() + '" — no creator by that name'); continue; }
        readFolder(sub, who);
      }
    } catch (e) {
      alert_('Cannot open the content Drive',
        'CONTENT_DRIVE on the Config tab does not open: ' + e.message + '\n\n' +
        'Paste the folder\'s share link into that Value cell, and make sure this ' +
        'account can see the folder.');
      return;
    }
  }

  if (!out.length) {
    alert_('Nothing indexed',
      (rootId ? 'The Drive opened but nothing in it matched a creator.\n\n'
              : 'No content Drive is set.\n\n') +
      'Either put the folder\'s share link in CONTENT_DRIVE on the Config tab — with ' +
      'a subfolder per creator, named exactly as she is spelled on Creators — or put a ' +
      'folder link in her own "Drive folder" cell.' +
      (skipped.length ? '\n\nSkipped:\n   ' + skipped.slice(0, 8).join('\n   ') : ''));
    return;
  }

  writeContentIndex_(out);

  var per = {};
  out.forEach(function (r) { per[r[0]] = (per[r[0]] || 0) + 1; });
  var missing = Object.keys(canonical).map(function (k) { return canonical[k]; })
                      .filter(function (n) { return !per[n]; });

  log_('indexDriveContent', out.length + ' files across ' + Object.keys(per).length + ' creators');
  alert_('Content indexed',
    out.length + ' file(s) across ' + Object.keys(per).length + ' creator(s), from ' +
    seenFolders + ' folder(s).\n\n' +
    Object.keys(per).sort().map(function (n) { return '   ' + n + ' — ' + per[n]; }).join('\n') +
    (missing.length ? '\n\nNO CONTENT FOUND FOR:\n   ' + missing.join(', ') +
       '\nTheir DMs will be scheduled with the Content cell left blank.' : '') +
    (skipped.length ? '\n\nSkipped:\n   ' + skipped.slice(0, 8).join('\n   ') : '') +
    '\n\nNow run "Attach content to this week\'s DMs".');
}

function writeContentIndex_(rows) {
  var ss = ss_();
  var sh = ss.getSheetByName(CONTENT_TAB);
  if (!sh) { sh = ss.insertSheet(CONTENT_TAB); sh.hideSheet(); }

  // One atomic write over a cleared block, sized to the new data. The index is
  // derived — nothing here is anyone's typing, so replacing it wholesale is safe.
  sh.clear();
  sh.getRange(1, 1, 1, CONTENT_COLS.length).setValues([CONTENT_COLS]).setFontWeight('bold');
  sh.getRange(2, 1, rows.length, CONTENT_COLS.length).setValues(rows);
  sh.getRange(2, 5, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  sh.setFrozenRows(1);

  ss.getNamedRanges().forEach(function (nr) { if (nr.getName() === 'CRM_Content') nr.remove(); });
  ss.setNamedRange('CRM_Content', sh.getRange(2, 2, Math.max(rows.length, 1), 1));
}

/** Everything indexed for one creator, newest first. */
function contentFor_(creator) {
  var sh = ss_().getSheetByName(CONTENT_TAB);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, CONTENT_COLS.length).getValues();
  var want = String(creator || '').trim().toLowerCase();
  return vals.filter(function (r) { return String(r[0]).trim().toLowerCase() === want; })
             .sort(function (a, b) { return (b[4] || 0) - (a[4] || 0); });
}

/**
 * Put a file against every mass DM for the week that has not got one.
 *
 * Rotates through each creator's folder rather than always reaching for the
 * newest, so a week does not go out as the same picture twenty times. A cell
 * someone has already filled in is never touched.
 */
function attachMmContent() {
  var ui = ui_();
  var start = nextMonday_();
  if (ui) {
    var ask = ui.prompt('Attach content to the DMs',
      'Which week? yyyy-mm-dd, blank = ' + dayKey_(start) + '.\n\n' +
      'Fills the Content column on every mass DM for that week that is still empty, ' +
      'using the promoted creator\'s folder. Anything already filled in is left alone.',
      ui.ButtonSet.OK_CANCEL);
    if (ask.getSelectedButton() !== ui.Button.OK) return;
    var txt = ask.getResponseText().trim();
    if (txt) {
      var p = parseWeekCell_(txt);
      if (!p) { ui.alert('That is not a date. Use yyyy-mm-dd.'); return; }
      start = p;
    }
  }

  var def = TABS.mm, sh = sheet_(def.name);
  if (def.headers.indexOf('Content') < 0) {
    alert_('No Content column', 'Run "Rebuild / repair tabs" first — the MM schedule needs ' +
           'the Content column before anything can be attached to it.');
    return;
  }

  var last = sh.getLastRow();
  if (last < FIRST_ROW) { alert_('Nothing to do', 'The MM schedule is empty.'); return; }

  var iDate = headerIndex_(def, 'Date') - 1;
  var iWho  = headerIndex_(def, 'Promoted Creator') - 1;
  var cCont = headerIndex_(def, 'Content');
  var want  = weekKey_(start);
  var vals  = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues();

  var pools = {}, turn = {}, filled = 0, already = 0, noContent = {};
  var col = [];
  for (var i = 0; i < vals.length; i++) col.push([vals[i][cCont - 1]]);

  vals.forEach(function (r, i) {
    if (weekKey_(r[iDate]) !== want) return;
    var who = String(r[iWho] || '').trim();
    if (!who) return;
    if (String(r[cCont - 1] || '').trim()) { already++; return; }

    var key = who.toLowerCase();
    if (!pools[key]) { pools[key] = contentFor_(who); turn[key] = 0; }
    var pool = pools[key];
    if (!pool.length) { noContent[who] = true; return; }

    var pick = pool[turn[key] % pool.length];
    turn[key]++;
    col[i][0] = pick[1];
    filled++;
  });

  if (filled) sh.getRange(FIRST_ROW, cCont, col.length, 1).setValues(col);

  var gaps = Object.keys(noContent);
  log_('attachMmContent', want + ': ' + filled + ' filled, ' + already + ' already set');
  alert_('Content attached',
    filled + ' DM(s) given a file for the week of ' + want + '.' +
    (already ? '\n' + already + ' already had one and were left alone.' : '') +
    (gaps.length ? '\n\nNOTHING INDEXED FOR:\n   ' + gaps.join(', ') +
       '\nTheir DMs are scheduled but have no file against them. Add a folder for them ' +
       'and run "Index the content Drive" again.' : '') +
    '\n\nThe link beside each name opens the file — that is what the VA sends.');
}
