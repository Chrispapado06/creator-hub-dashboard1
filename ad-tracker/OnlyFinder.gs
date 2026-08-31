/**
 * UNCVRD Ad Tracker — OnlyFinder.gs  (ad side: spend + clicks)
 * ---------------------------------------------------------------------------
 * OnlyFinder does not publish a documented public API. Two modes:
 *
 *   • MANUAL (default): you paste Spend + Clicks into Daily Log for OnlyFinder
 *     rows. onlyFinderRefresh() just reminds you — nothing to pull.
 *
 *   • API (optional): if you have an OnlyFinder insights endpoint, set
 *       ONLYFINDER_ENDPOINT — a URL returning JSON [{name|ad_name, spend, clicks}]
 *                             for a given day (use {date} as a placeholder)
 *       ONLYFINDER_KEY      — sent as Authorization: Bearer <key>
 *     and onlyFinderRefresh() will fill Spend + Clicks the same way Meta does.
 * ---------------------------------------------------------------------------
 */

function onlyFinderConfigured() {
  return hasProp('ONLYFINDER_ENDPOINT');
}

function onlyFinderRefresh() {
  if (!onlyFinderConfigured()) {
    toast('OnlyFinder is manual — paste Spend + Clicks into Daily Log rows.', 'onlyFinderRefresh');
    return { manual: true };
  }
  const today = todayStr();
  const endpoint = getProp('ONLYFINDER_ENDPOINT', { required: true })
    .replace('{date}', today);
  const headers = { Accept: 'application/json' };
  const key = getProp('ONLYFINDER_KEY');
  if (key) headers.Authorization = 'Bearer ' + key;

  const res = UrlFetchApp.fetch(endpoint, { method: 'get', muteHttpExceptions: true, headers: headers });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('OnlyFinder API ' + code + ': ' + res.getContentText().slice(0, 300));
  }
  let json = JSON.parse(res.getContentText());
  if (!Array.isArray(json)) json = json.data || [];

  const byName = {};
  json.forEach(function (r) {
    byName[nameKey(r.name || r.ad_name)] = {
      spend: Number(r.spend || 0),
      clicks: Number(r.clicks || r.link_clicks || 0),
    };
  });
  const written = writeAdSide_(today, byName, 'OnlyFinder');
  toast('OnlyFinder: wrote spend/clicks to ' + written + ' row(s) for ' + today, 'onlyFinderRefresh');
  return { written: written, ads: json.length };
}
