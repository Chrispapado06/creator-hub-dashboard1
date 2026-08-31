/**
 * UNCVRD Ad Tracker — Meta.gs  (ad side: spend + paid clicks)
 * ---------------------------------------------------------------------------
 * Pulls per-ad spend + link clicks from the Meta Marketing API and writes them
 * into Daily Log, matched on ad name == Variant name (col F) / OF Link (col G).
 *
 * SWITCHED OFF until both Script Properties exist:
 *   META_TOKEN     — long-lived access token with ads_read on the account
 *   META_AD_ACCT   — ad account id WITHOUT the "act_" prefix (e.g. 1234567890)
 *
 * Note: when Meta is on it OVERWRITES the Clicks column for matched rows with
 * the platform's paid link clicks.
 * ---------------------------------------------------------------------------
 */

const META_API_VERSION = 'v19.0';

function metaConfigured() {
  return hasProp('META_TOKEN') && hasProp('META_AD_ACCT');
}

/** Pull today's ad-level insights, following pagination. */
function metaInsights_(dateStr) {
  const token = getProp('META_TOKEN', { required: true });
  const acct = getProp('META_AD_ACCT', { required: true });
  const timeRange = encodeURIComponent(JSON.stringify({ since: dateStr, until: dateStr }));
  let url = 'https://graph.facebook.com/' + META_API_VERSION + '/act_' + acct + '/insights' +
    '?level=ad&fields=ad_name,spend,inline_link_clicks,clicks' +
    '&time_range=' + timeRange + '&limit=200&access_token=' + encodeURIComponent(token);

  const rows = [];
  let guard = 0;
  while (url && guard++ < 25) {
    const res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true });
    const code = res.getResponseCode();
    const body = JSON.parse(res.getContentText());
    if (code < 200 || code >= 300) {
      const msg = body && body.error ? body.error.message : res.getContentText().slice(0, 300);
      throw new Error('Meta API ' + code + ': ' + msg);
    }
    (body.data || []).forEach(function (d) {
      rows.push({
        name: d.ad_name || '',
        spend: Number(d.spend || 0),
        // Prefer the link-click metric; fall back to all clicks.
        clicks: Number(d.inline_link_clicks != null ? d.inline_link_clicks : d.clicks || 0),
      });
    });
    url = body.paging && body.paging.next ? body.paging.next : null;
  }
  return rows;
}

/**
 * metaRefresh() — fill Spend + Clicks on today's Daily Log rows from Meta.
 * Matches ad name to the Variant, then the OF Link. Sets Platform = "Meta" on
 * matched rows whose platform cell is blank.
 */
function metaRefresh() {
  if (!metaConfigured()) {
    toast('Meta is off — add META_TOKEN + META_AD_ACCT to turn it on.', 'metaRefresh');
    return { skipped: true };
  }
  const today = todayStr();
  const insights = metaInsights_(today);
  const byName = {};
  insights.forEach(function (r) { byName[nameKey(r.name)] = r; });

  const written = writeAdSide_(today, byName, 'Meta');
  toast('Meta: wrote spend/clicks to ' + written + ' row(s) for ' + today, 'metaRefresh');
  return { written: written, ads: insights.length };
}

/**
 * Shared writer for the ad-side pulls (Meta + OnlyFinder). For each of today's
 * rows, look up ad data by Variant then OF Link; write Spend + overwrite Clicks.
 * Stamps a blank Platform cell with `platform`.
 */
function writeAdSide_(today, byName, platform) {
  const s = sheet(TAB.LOG);
  const last = s.getLastRow();
  if (last < 2) return 0;
  const range = s.getRange(2, 1, last - 1, LOG_LAST_COL);
  const values = range.getValues();
  let written = 0;
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    if (dateKey(row[COL.DATE - 1]) !== today) continue;
    const ad = byName[nameKey(row[COL.VARIANT - 1])] || byName[nameKey(row[COL.LINK - 1])];
    if (!ad) continue;
    // Only apply a platform's numbers to rows of that platform (or blank ones).
    const rowPlat = String(row[COL.PLATFORM - 1] || '').trim();
    if (rowPlat && rowPlat.toLowerCase() !== platform.toLowerCase()) continue;
    if (!rowPlat) row[COL.PLATFORM - 1] = platform;
    row[COL.SPEND - 1] = ad.spend;
    row[COL.CLICKS - 1] = ad.clicks; // overwrite with paid clicks
    written++;
  }
  range.setValues(values);
  return written;
}
