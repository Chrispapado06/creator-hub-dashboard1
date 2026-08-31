/**
 * UNCVRD Ad Tracker — Triggers.gs
 * ---------------------------------------------------------------------------
 * The daily orchestrator + trigger management.
 *
 *   ▸ installDailyTrigger()  — run once: schedules dailyRefresh() ~6am daily.
 *   ▸ dailyRefresh()         — OF backend pull, then Meta + OnlyFinder (if on),
 *                              then the optional Supabase mirror. Each step is
 *                              isolated so one failure doesn't block the rest.
 *   ▸ removeTriggers()       — clears this project's triggers.
 * ---------------------------------------------------------------------------
 */

function installDailyTrigger() {
  removeTriggers();
  ScriptApp.newTrigger('dailyRefresh')
    .timeBased()
    .everyDays(1)
    .atHour(6) // ~6am in the script's timezone
    .create();
  toast('Daily refresh scheduled for ~6am. You can also run dailyRefresh() by hand.', 'Triggers');
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyRefresh') ScriptApp.deleteTrigger(t);
  });
}

function dailyRefresh() {
  const log = [];
  const step = function (label, fn) {
    try {
      const r = fn();
      log.push('✓ ' + label + ': ' + JSON.stringify(r));
    } catch (e) {
      log.push('✗ ' + label + ': ' + e.message);
      Logger.log(label + ' failed: ' + e.stack);
    }
  };

  step('OnlyFans pull', ofPull);                 // backend: new fans + revenue
  if (metaConfigured()) step('Meta refresh', metaRefresh);
  if (onlyFinderConfigured()) step('OnlyFinder refresh', onlyFinderRefresh);
  if (supabaseConfigured()) step('Supabase mirror', pushToSupabase);

  const summary = log.join('\n');
  toast(summary, 'dailyRefresh');
  Logger.log('dailyRefresh\n' + summary);
  return summary;
}
