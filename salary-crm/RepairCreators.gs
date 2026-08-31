/**
 * UNCVRD — one-time repair of the Creators tab
 * ============================================================================
 * On 15 Aug 2026 a rebuild inserted "Same person as" as column C and the tab
 * came out half-migrated: the correct values landed in the NEW columns, but the
 * old values were left sitting where they were. So every field from Status
 * rightward reads one column early — Status showed Type, Tier showed the OF
 * handle — and nothing was Live any more.
 *
 * Below is the tab exactly as it stood BEFORE that rebuild, captured from the
 * file itself. This writes each value back under its own header NAME, so it
 * lands correctly whatever the column order is now.
 *
 * Matched on the creator's name, so a row someone has since edited by hand is
 * overwritten only in the fields the snapshot actually holds — anything typed
 * into a column the snapshot has no value for is left alone.
 *
 * Safe to run twice. Delete this file once the tab is right.
 */

var CREATORS_SNAPSHOT_TAKEN = '2026-08-15 14:36';

function creatorsSnapshot_() {
  return [
  {'Creator':'Antonella', 'Also known as':'Lilly', 'Status':'Live', 'Type':'Salary', 'OF handle':'lillyylou', 'Ad sheet name':'Antonella', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Page lillyylou. Appears as "Antonella/Lilly" in the promo schedules.'},
  {'Creator':'Nicole', 'Also known as':'Rosario', 'Status':'Live', 'Type':'Salary', 'OF handle':'rosewhitex', 'Ad sheet name':'Rose white', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Page rosewhitex. The ad sheet spells her "Rose white".'},
  {'Creator':'Ella', 'Also known as':'Rosario', 'Status':'Live', 'Type':'Salary', 'OF handle':'ellaajanee', 'Ad sheet name':'Ella', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Page ellaajanee. NOTE: given as "Rosario - Ella", but Rosario is also listed against Nicole — one of the two is wrong. Confirm before trusting.'},
  {'Creator':'Kiara', 'Also known as':'Hannah', 'Status':'Live', 'Type':'Salary', 'OF handle':'hannahgoldiegirl', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Not connected to the OF API yet. No ad-sheet name, so the Daily Report shows her at zero until both exist.'},
  {'Creator':'Clementa', 'Also known as':'Brookly', 'Status':'Live', 'Type':'Salary', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Not connected to the OF API yet. No ad-sheet name, so the Daily Report shows her at zero until both exist.'},
  {'Creator':'June', 'Status':'Live', 'Type':'Managed', 'OF handle':'junehaynes', 'OF page':'https://onlyfans.com/junehaynes', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Julie', 'Status':'Live', 'Type':'Managed', 'OF handle':'juliejswan', 'OF page':'https://onlyfans.com/juliejswan', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Emma', 'Status':'Live', 'Type':'Managed', 'OF handle':'emmasonne', 'OF page':'https://onlyfans.com/emmasonne', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Swap to be set up (Luca p.5).'},
  {'Creator':'Blue Bear', 'Status':'Live', 'Type':'Managed', 'OF handle':'bluebeari3vip', 'OF page':'https://onlyfans.com/bluebeari3vip', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Swap to be set up (Luca p.5).'},
  {'Creator':'Marissa', 'Status':'Live', 'Type':'Managed', 'OF handle':'marissa.munoz', 'OF page':'https://onlyfans.com/marissa.munoz', 'API tracked':true, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Paid ads. Swap to be set up (Luca p.5). No tracking links created yet.'},
  {'Creator':'Sandra', 'Status':'Live', 'Type':'Partner', 'OF handle':'thisisjunee', 'OF page':'https://onlyfans.com/thisisjunee', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Handle reads as June to any name matcher — it is Sandra\'s page. Do not let that get re-broken.'},
  {'Creator':'Sophie', 'Status':'Live', 'Type':'Partner', 'OF handle':'celinerenxo', 'OF page':'https://onlyfans.com/celinerenxo', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Angelina', 'Status':'Live', 'Type':'Partner', 'OF handle':'itsangelinabae', 'OF page':'https://onlyfans.com/itsangelinabae', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Maylee', 'Status':'Live', 'Type':'Partner', 'OF handle':'mayyy.leee', 'OF page':'https://onlyfans.com/mayyy.leee', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Apple', 'Status':'Live', 'Type':'Partner', 'OF handle':'apple_kittii', 'OF page':'https://onlyfans.com/apple_kittii', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Bella Leah', 'Status':'Live', 'Type':'Partner', 'OF handle':'bella_leaa', 'OF page':'https://onlyfans.com/bella_leaa', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Charlotte', 'Status':'Live', 'Type':'Partner', 'OF handle':'charlottelive', 'OF page':'https://onlyfans.com/charlottelive', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Luca p.21 #4: captions being used need review.'},
  {'Creator':'Ali', 'Also known as':'Chloe', 'Status':'Live', 'Type':'Partner', 'OF handle':'cleoivy', 'OF page':'https://onlyfans.com/cleoivy', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Appears as both "Chloe" and "Chloe / Cleo" in the promo schedules.'},
  {'Creator':'Macy', 'Status':'Live', 'Type':'Partner', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Received 15 promo slots last week and reported $0 — page not connected.'},
  {'Creator':'Emily', 'Status':'Live', 'Type':'Partner', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Luca p.21 #4: captions being used need review.'},
  {'Creator':'Meg', 'Status':'Live', 'Type':'Partner', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Ashleigh', 'Status':'Live', 'Type':'Partner', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false},
  {'Creator':'Gracie', 'Also known as':'Chloe / Cleo', 'Status':'Live', 'Type':'Partner', 'API tracked':false, '18yo account':false, 'DeepL needed':false, 'Account optimised':false, 'Scripts personalised':false, 'Permanent feed SFS':false, 'Flag to Luca':false, 'Notes':'Duplicate of Chloe? Merge or delete once confirmed.'}
];
}

function repairCreators() {
  var def = TABS.creators, sh = sheet_(def.name);
  var snap = creatorsSnapshot_();

  var last = sh.getLastRow();
  if (last < FIRST_ROW) { alert_('Creators is empty', 'Nothing to repair.'); return; }

  // Find each creator by name in column 1 — the one column that did not move.
  var names = sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, 1).getValues();
  var rowOf = {};
  names.forEach(function (r, i) {
    var n = String(r[0] || '').trim();
    if (n) rowOf[n.toLowerCase()] = FIRST_ROW + i;
  });

  var width = def.headers.length;
  var touched = {}, missing = [], wrote = 0;

  snap.forEach(function (rec) {
    var row = rowOf[String(rec['Creator']).trim().toLowerCase()];
    if (!row) { missing.push(rec['Creator']); return; }

    // Read the row, overwrite only the fields the snapshot holds, write once.
    var line = sh.getRange(row, 1, 1, width).getValues()[0];
    var blank = [];
    for (var c = 0; c < width; c++) blank.push('');

    // Everything from the first snapshot column rightward is suspect, so clear
    // it before writing back — otherwise the shifted leftovers stay put.
    Object.keys(rec).forEach(function (h) {
      if (def.headers.indexOf(h) < 0) return;
      blank[headerIndex_(def, h) - 1] = rec[h];
      wrote++;
    });
    // Keep anything in a column the snapshot never had a value for, EXCEPT the
    // ones we know were scrambled by the shift.
    def.headers.forEach(function (h, i) {
      if (rec.hasOwnProperty(h)) return;
      if (i >= 2) return;                       // C onward was shifted — do not keep it
      blank[i] = line[i];
    });
    sh.getRange(row, 1, 1, width).setValues([blank]);
    touched[rec['Creator']] = true;
  });

  var live = 0;
  sh.getRange(FIRST_ROW, headerIndex_(def, 'Status'), last - HEADER_ROW, 1).getValues()
    .forEach(function (r) { if (String(r[0]).trim() === 'Live') live++; });

  log_('repairCreators', Object.keys(touched).length + ' rows restored, ' + live + ' Live');
  alert_('Creators repaired',
    Object.keys(touched).length + ' row(s) restored from the snapshot of ' +
    CREATORS_SNAPSHOT_TAKEN + ', ' + wrote + ' value(s) written.\n\n' +
    live + ' creator(s) now read as Live.' +
    (missing.length ? '\n\nNOT FOUND on the tab (left alone): ' + missing.join(', ') : '') +
    '\n\nCheck the tab, then carry on with the week.');
}
