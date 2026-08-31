/**
 * UNCVRD Ad Tracker — Supabase.gs  (optional mirror)
 * ---------------------------------------------------------------------------
 * Mirrors Daily Log into Supabase so the data lives alongside the rest of the
 * creator-hub stack and is queryable by SQL / the main dashboard.
 *
 * SWITCHED OFF until both Script Properties exist:
 *   SUPABASE_URL                — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   — service-role key (bypasses RLS for writes)
 *
 * Target table + the metrics view ship as a migration in the parent repo:
 *   supabase/migrations/20260606130000_ad_tracker.sql
 * Upserts on (date, platform, variant) so re-running a day overwrites rather
 * than duplicating.
 * ---------------------------------------------------------------------------
 */

function supabaseConfigured() {
  return hasProp('SUPABASE_URL') && hasProp('SUPABASE_SERVICE_ROLE_KEY');
}

function pushToSupabase() {
  if (!supabaseConfigured()) {
    toast('Supabase mirror off — add SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.', 'pushToSupabase');
    return { skipped: true };
  }
  const url = getProp('SUPABASE_URL', { required: true }).replace(/\/$/, '');
  const key = getProp('SUPABASE_SERVICE_ROLE_KEY', { required: true });

  const s = sheet(TAB.LOG);
  const last = s.getLastRow();
  if (last < 2) return { pushed: 0 };
  const values = s.getRange(2, 1, last - 1, COL.REVENUE).getValues();

  const num = function (v) { return v === '' || v == null ? 0 : Number(v); };
  const rows = [];
  values.forEach(function (r) {
    const date = dateKey(r[COL.DATE - 1]);
    const variant = String(r[COL.VARIANT - 1] || '').trim();
    const campaign = String(r[COL.CAMPAIGN - 1] || '').trim();
    if (!date || !variant) return;            // need a key
    if (campaign.indexOf('EXAMPLE') === 0) return; // skip example rows
    rows.push({
      date: date,
      platform: String(r[COL.PLATFORM - 1] || '').trim(),
      creator: String(r[COL.CREATOR - 1] || '').trim(),
      campaign: campaign,
      test: String(r[COL.TEST - 1] || '').trim(),
      variant: variant,
      of_link: String(r[COL.LINK - 1] || '').trim(),
      spend: num(r[COL.SPEND - 1]),
      clicks: num(r[COL.CLICKS - 1]),
      new_fans: num(r[COL.NEW_FANS - 1]),
      revenue: num(r[COL.REVENUE - 1]),
    });
  });
  if (!rows.length) return { pushed: 0 };

  const endpoint = url + '/rest/v1/ad_daily_log?on_conflict=date,platform,variant';
  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    payload: JSON.stringify(rows),
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase ' + code + ': ' + res.getContentText().slice(0, 400));
  }
  toast('Supabase mirror: upserted ' + rows.length + ' row(s).', 'pushToSupabase');
  return { pushed: rows.length };
}
