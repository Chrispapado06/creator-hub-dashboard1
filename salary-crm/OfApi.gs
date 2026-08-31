/**
 * UNCVRD — Salary Creator CRM : OnlyFans API
 * ============================================================================
 * Fills the Daily Earnings tab automatically, so nobody types five numbers a
 * morning and so "total earnings" means the same thing every day.
 *
 * Two endpoints, both verified against docs.onlyfansapi.com (Aug 2026):
 *
 *   GET /{acct}/statistics/statements/earnings
 *       ?start_date=YYYY-MM-DD 00:00:00&end_date=YYYY-MM-DD 23:59:59&type=total
 *       → data.total.total   (net for the range)
 *         data.total.gross   (gross)
 *         data.total.chartAmount[] = [{date, count}]   ← the per-day series
 *
 *   GET /{acct}/subscribers/statistics
 *       ?start_date=…&end_date=…&type=new
 *       → data.subscribes[]  = [{date, count}]         ← new subs per day
 *
 * One call per creator per endpoint covers a whole fortnight, because both
 * return a daily array. Pulling day-by-day would burn 14× the credits for the
 * same numbers.
 *
 * Auth: Bearer, key in Script Properties as ONLYFANSAPI_KEY — the same
 * property name the internal promo report uses, so one key serves both.
 */

var OF_BASE = 'https://app.onlyfansapi.com/api';

// ── HTTP ────────────────────────────────────────────────────────────────────

function ofKey_() {
  var k = PropertiesService.getScriptProperties().getProperty('ONLYFANSAPI_KEY');
  if (!k) {
    throw new Error('ONLYFANSAPI_KEY is not set. Apps Script → Project Settings → ' +
                    'Script Properties → add ONLYFANSAPI_KEY with your app.onlyfansapi.com key.');
  }
  return k;
}

function ofGet_(path) {
  var res = UrlFetchApp.fetch(OF_BASE + path, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ofKey_(), Accept: 'application/json' }
  });
  var code = res.getResponseCode();
  var body = res.getContentText() || '';
  if (code === 401 || code === 403) {
    throw new Error('OnlyFans API rejected the key (' + code + '). Check ONLYFANSAPI_KEY.');
  }
  if (code === 429) {
    throw new Error('OnlyFans API rate limit hit. Try again in a minute.');
  }
  if (code < 200 || code >= 300) {
    throw new Error('OnlyFans API ' + code + ' on ' + path + ' — ' + body.slice(0, 200));
  }
  return JSON.parse(body || '{}');
}

/** Accounts this key can see: [{id, username}]. */
function ofAccounts_() {
  var j = ofGet_('/accounts');
  var list = Array.isArray(j) ? j
           : (j && Array.isArray(j.data)) ? j.data
           : (j && j.data && Array.isArray(j.data.list)) ? j.data.list : [];
  return list.map(function (a) {
    return { id: a.id, username: String(a.onlyfans_username || a.username || '').toLowerCase() };
  }).filter(function (a) { return a.id; });
}

function ofStamp_(d, endOfDay) {
  return Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd') +
         (endOfDay ? ' 23:59:59' : ' 00:00:00');
}

/** {'yyyy-MM-dd': amount} from a [{date, count}] series. */
function ofSeries_(arr) {
  var out = {};
  (arr || []).forEach(function (p) {
    if (!p || !p.date) return;
    var d = new Date(p.date);
    if (isNaN(d.getTime())) return;
    var k = Utilities.formatDate(d, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    out[k] = (out[k] || 0) + (Number(p.count) || 0);
  });
  return out;
}

// ── The pull ────────────────────────────────────────────────────────────────

/**
 * Write real daily earnings into Daily Earnings for every salary creator whose
 * OF handle matches a connected account.
 *
 * Upsert, not append: a day already logged is UPDATED, never duplicated, and
 * anything typed in Notes survives. A creator the key cannot see is reported,
 * not skipped silently.
 */
function pullEarnings(days) {
  days = Number(days) || Number(cfg_('OF_EARNINGS_DAYS')) || 14;
  var today = new Date(new Date().toDateString());
  var from  = new Date(today.getTime()); from.setDate(from.getDate() - (days - 1));

  var salary = creatorRows_().filter(function (c) { return c.type === 'Salary'; });
  if (!salary.length) throw new Error('No creator on the Creators tab has Type = Salary.');

  var accounts = ofAccounts_();
  var byHandle = {};
  accounts.forEach(function (a) { byHandle[a.username] = a.id; });

  var def = TABS.earnings, sh = sheet_(def.name);
  var iDate = headerIndex_(def, 'Date') - 1;
  var iName = headerIndex_(def, 'Creator') - 1;
  var iEarn = headerIndex_(def, 'Total earnings $') - 1;
  var iSubs = headerIndex_(def, 'New subs') - 1;

  var last = sh.getLastRow();
  var existing = last >= FIRST_ROW
    ? sh.getRange(FIRST_ROW, 1, last - HEADER_ROW, def.headers.length).getValues() : [];
  var rowOf = {};
  existing.forEach(function (r, i) {
    if (r[iName] && r[iDate] instanceof Date) {
      rowOf[dayKey_(r[iDate]) + '|' + String(r[iName]).trim()] = FIRST_ROW + i;
    }
  });

  var updated = 0, added = 0, missing = [], done = [];
  var newRows = [];

  salary.forEach(function (c) {
    var handle = String(c.handle || '').toLowerCase().replace(/^@/, '');
    var acct = handle && byHandle[handle];
    if (!acct) { missing.push(c.name + (handle ? ' (@' + handle + ')' : ' (no OF handle set)')); return; }

    var qs = '?start_date=' + encodeURIComponent(ofStamp_(from, false)) +
             '&end_date='   + encodeURIComponent(ofStamp_(today, true));

    var earn = {};
    try {
      var e = ofGet_('/' + acct + '/statistics/statements/earnings' + qs + '&type=total');
      earn = ofSeries_(e && e.data && e.data.total && e.data.total.chartAmount);
    } catch (err) { missing.push(c.name + ' — earnings: ' + err.message); return; }

    var subs = {};
    try {
      var s = ofGet_('/' + acct + '/subscribers/statistics' + qs + '&type=new');
      subs = ofSeries_(s && s.data && s.data.subscribes);
    } catch (err) { /* subs are a bonus; earnings already landed */ }

    for (var d = 0; d < days; d++) {
      var day = new Date(from.getTime()); day.setDate(day.getDate() + d);
      var key = dayKey_(day);
      if (!earn.hasOwnProperty(key) && !subs.hasOwnProperty(key)) continue;

      var at = rowOf[key + '|' + c.name];
      if (at) {
        if (earn.hasOwnProperty(key)) sh.getRange(at, iEarn + 1).setValue(earn[key]);
        if (subs.hasOwnProperty(key)) sh.getRange(at, iSubs + 1).setValue(subs[key]);
        updated++;
      } else {
        var row = new Array(def.headers.length).fill('');
        row[iDate] = new Date(day.getTime());
        row[iName] = c.name;
        row[iEarn] = earn.hasOwnProperty(key) ? earn[key] : '';
        row[iSubs] = subs.hasOwnProperty(key) ? subs[key] : '';
        newRows.push(row);
        added++;
      }
    }
    done.push(c.name);
  });

  if (newRows.length) {
    var at2 = Math.max(lastDataRow_(sh) + 1, FIRST_ROW);
    if (at2 + newRows.length > sh.getMaxRows()) {
      sh.insertRowsAfter(sh.getMaxRows(), at2 + newRows.length - sh.getMaxRows() + 30);
    }
    sh.getRange(at2, 1, newRows.length, def.headers.length).setValues(newRows);
    sh.getRange(at2, iDate + 1, newRows.length, 1).setNumberFormat('yyyy-mm-dd');
    sh.getRange(at2, iEarn + 1, newRows.length, 1).setNumberFormat('$#,##0.00');
  }

  var note = added + ' added, ' + updated + ' updated, ' + days + 'd window, ' +
             'pulled for ' + (done.join(', ') || 'nobody') +
             (missing.length ? ' | NOT pulled: ' + missing.join('; ') : '');
  log_('pullEarnings', note);
  return { added: added, updated: updated, done: done, missing: missing };
}

/** Menu version. */
function pullEarningsNow() {
  try {
    var r = pullEarnings();
    alert_('Earnings pulled',
      r.added + ' day-rows added, ' + r.updated + ' updated.\n\n' +
      'Pulled for: ' + (r.done.join(', ') || 'nobody') +
      (r.missing.length
        ? '\n\nNOT pulled:\n• ' + r.missing.join('\n• ') +
          '\n\nA creator is skipped when her OF handle on Creators does not match ' +
          'an account this API key can see.'
        : ''));
    ss_().setActiveSheet(sheet_(TABS.earnings.name));
  } catch (e) {
    alert_('Earnings pull failed', e.message);
    log_('pullEarnings FAILED', e.message);
  }
}

/**
 * Say exactly what the key can and cannot see, without writing anything.
 * Run this first — it turns "the numbers are wrong" into "these two handles
 * do not match".
 */
function testOfConnection() {
  var out = [];
  try {
    var accounts = ofAccounts_();
    out.push('✓ Key works. ' + accounts.length + ' account(s) visible:');
    accounts.forEach(function (a) { out.push('    @' + a.username + '  ' + a.id); });

    var byHandle = {};
    accounts.forEach(function (a) { byHandle[a.username] = a.id; });

    out.push('');
    out.push('Salary creators → account match:');
    creatorRows_().filter(function (c) { return c.type === 'Salary'; }).forEach(function (c) {
      var h = String(c.handle || '').toLowerCase().replace(/^@/, '');
      out.push('  ' + (h && byHandle[h] ? '✓' : '✗') + ' ' + c.name +
               (h ? '  @' + h : '  (no OF handle on Creators)') +
               (h && !byHandle[h] ? '  — no account with that username' : ''));
    });
  } catch (e) {
    out.push('✗ ' + e.message);
  }
  alert_('OnlyFans API check', out.join('\n'));
  log_('testOfConnection', out.join(' | '));
}
