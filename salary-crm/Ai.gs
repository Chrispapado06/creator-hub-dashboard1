/**
 * UNCVRD — Salary Creator CRM : Claude (captions only)
 * ============================================================================
 * The ONLY place in this file an AI touches anything.
 *
 * Nothing here reads, writes, or estimates a number. Revenue, subs, slots,
 * pace and allocation stay arithmetic against the OnlyFans API and the promo
 * plan, because those are exact and checkable and a language model would turn
 * them into "probably right". This file writes English into one tab.
 *
 * What it does
 *   generateCaptions()      — fills Caption Bank with drafts, per creator,
 *                             per channel, in her niche and her language.
 *   findDuplicateCaptions() — flags captions that are different strings but
 *                             the same caption. The sheet's own reuse check is
 *                             exact-match, so "come see what I posted" and
 *                             "come look at what I just posted" both sail past.
 *   testAiConnection()      — one cheap call, says yes or says why not.
 *
 * Nothing here auto-posts. Every caption lands as Resting — out of rotation
 * until a human moves it to Active.
 *
 * Model: Haiku. Captions are short-form writing, not reasoning, and this is
 * ~1,300 of them a week (4 feed + 2 story + 3 MM per account per day). Haiku
 * is a couple of dollars a month at that volume. Note the request shape below
 * is Haiku-specific: it predates adaptive thinking, so `thinking` and
 * `output_config.effort` are BOTH rejected on this model. Sending either is a
 * 400. If you ever move to a newer model, that is the line to revisit.
 *
 * Auth: Script Properties → ANTHROPIC_API_KEY. Never in this file, never in
 * the sheet, never in git.
 */

var AI_MODEL      = 'claude-haiku-4-5';
var AI_BASE       = 'https://api.anthropic.com/v1/messages';
var AI_VERSION    = '2023-06-01';
var AI_CHUNK      = 6;      // creators per parallel batch — keeps us inside 6 minutes
var AI_EXAMPLES   = 12;     // how many of your real captions to show the model
var AI_MAX_TOKENS = 4096;

// ── HTTP ────────────────────────────────────────────────────────────────────

function aiKey_() {
  var k = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!k) {
    throw new Error('ANTHROPIC_API_KEY is not set. Apps Script → Project Settings → ' +
                    'Script Properties → add ANTHROPIC_API_KEY with your console.anthropic.com key.');
  }
  return k;
}

/**
 * A fetchAll-shaped request. Structured outputs, so the reply is schema-valid
 * JSON or the API refuses to send it — no prose to parse, no half-written tab
 * when the model decides to be chatty.
 */
function aiRequest_(system, user, schema) {
  return {
    url: AI_BASE,
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': aiKey_(), 'anthropic-version': AI_VERSION },
    payload: JSON.stringify({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      system: system,
      output_config: { format: { type: 'json_schema', schema: schema } },
      messages: [{ role: 'user', content: user }]
    })
  };
}

/**
 * Turn one HTTPResponse into an object, or throw with something you can act on.
 * Never index content[0] blindly — a refusal comes back HTTP 200 with an empty
 * content array, and a thinking-capable model would put a block in front.
 */
function aiParse_(res) {
  var code = res.getResponseCode();
  var body = res.getContentText() || '';

  if (code === 401 || code === 403) {
    throw new Error('Anthropic rejected the key (' + code + '). Check ANTHROPIC_API_KEY.');
  }
  if (code === 429) throw new Error('Anthropic rate limit. Try again in a minute.');
  if (code < 200 || code >= 300) {
    var msg = body;
    try { msg = JSON.parse(body).error.message; } catch (e) { /* keep raw */ }
    throw new Error('Anthropic ' + code + ' — ' + String(msg).slice(0, 300));
  }

  var j = JSON.parse(body || '{}');
  if (j.stop_reason === 'refusal') {
    throw new Error('Claude declined this one' +
      (j.stop_details && j.stop_details.category ? ' (' + j.stop_details.category + ')' : '') +
      '. Soften the niche wording on the Creators tab and re-run.');
  }
  if (j.stop_reason === 'max_tokens') {
    throw new Error('Reply hit the token cap — ask for fewer captions per run.');
  }

  var text = '';
  (j.content || []).forEach(function (b) { if (b.type === 'text') text += b.text; });
  if (!text) throw new Error('Claude returned nothing usable (stop_reason: ' + j.stop_reason + ').');
  return JSON.parse(text);
}

// ── What the model is told ──────────────────────────────────────────────────

var CAPTION_ITEM_ = {
  type: 'object',
  properties: {
    text:  { type: 'string' },
    angle: { type: 'string' }
  },
  required: ['text', 'angle'],
  additionalProperties: false
};

var CAPTION_SCHEMA_ = {
  type: 'object',
  properties: {
    feed:  { type: 'array', items: CAPTION_ITEM_ },
    story: { type: 'array', items: CAPTION_ITEM_ },
    mm:    { type: 'array', items: CAPTION_ITEM_ }
  },
  required: ['feed', 'story', 'mm'],
  additionalProperties: false
};

var CAPTION_SYSTEM_ =
  'You write SFS promo captions for an OnlyFans management agency.\n\n' +
  'THE ONE THING TO GET RIGHT: a creator is promoting a DIFFERENT girl to her own\n' +
  'audience. She is not promoting herself. You are writing in the voice of the\n' +
  'promoter, introducing another girl to people who already follow the promoter.\n' +
  'Think "let me put you onto my friend", never "come see what I posted". A caption\n' +
  'written as self-promo is unusable — that is the single most common way to get\n' +
  'this wrong.\n\n' +
  'The promoted girl is always written as the literal token [name]. Never invent a\n' +
  'name and never write a real one; the scheduler swaps [name] for whoever is being\n' +
  'promoted that day. Aim for roughly one caption in three to use [name] — the rest\n' +
  'just say "her" or "she". Both kinds earn their place: naming her feels personal,\n' +
  'and the unnamed ones can be reused for any girl.\n\n' +
  'Three channels:\n' +
  '  feed  — a post on the promoter\'s own page. The main SFS format.\n' +
  '  story — a 24-hour story. The shortest and most throwaway of the three.\n' +
  '  mm    — a mass message to the promoter\'s paying subscribers. These people pay\n' +
  '          her already, so it reads as a personal tip-off to a friend.\n\n' +
  'House style, taken from captions that work. Match it closely:\n' +
  '- SHORT. Four to twelve words. One line. Almost never two sentences.\n' +
  '- Casual lowercase — do not capitalise the first word unless it is "I" or [name].\n' +
  '- One or two emoji, usually at the end, occasionally mid-line. The palette is soft\n' +
  '  and cute: 🤭 🤍 💕 🌸 ❤️‍🔥 👀 💗 🥹 😏 🌷 🤫 💘. Swap one out for something that suits\n' +
  '  her niche where it clearly fits. Never crude emoji (no 🍑 🍆 💦).\n' +
  '- Warm and hyping, not sexual. These are far tamer than people expect — the job is\n' +
  '  curiosity and a click, not arousal. Nothing explicit, nothing anatomical.\n' +
  '- She is a person the promoter likes and is vouching for. Never write about her as\n' +
  '  a product or a body — no "fresh meat", "new drop", "next one up", "prize",\n' +
  '  "delivery", nothing that treats her as a thing on offer. If a line would read\n' +
  '  badly with her sitting next to you, it is the wrong line.\n' +
  '- Plain words. Use the vocabulary you see in the examples and no more. Skip current\n' +
  '  internet slang — no "no cap", "hits different", "giving X", "immaculate", "iykyk",\n' +
  '  "ate", "slay". It dates fast and it is not how this team writes.\n' +
  '- Small deliberate imperfections read as human and are welcome: "loveee",\n' +
  '  "I meann..", "damn", a trailing "...".\n' +
  '- Never a URL, never a hashtag, never a price. The scheduler adds the link.\n\n' +
  'Vary hard across the batch. Different openings, different hooks, different\n' +
  'lengths. Do not start more than one caption in a batch with the same word, and do\n' +
  'not lean on one angle. If two captions could be swapped for each other without\n' +
  'anyone noticing, one of them is wasted.\n\n' +
  '"angle" is a two-or-three-word tag for the hook, reused across captions so the\n' +
  'team can filter the bank: "introduction", "curiosity gap", "early access",\n' +
  '"personal endorsement", "confident prediction", "challenge", "just turned 18".\n' +
  'Prefer these existing tags over inventing new ones.';

/**
 * The best captions already in the bank become the style reference.
 *
 * Ranked by what converted, not by what someone liked: Subs first, then Clicks,
 * then times used. That means the moment the tracking-link numbers start
 * flowing in, this prompt is being taught by the winners automatically — and
 * it keeps getting better without anyone editing this file.
 *
 * Prefers her own captions, then falls back to the same channel across the
 * roster, so a brand-new creator still gets a house voice rather than nothing.
 */
function bankExamples_(rows, channel, creatorName, allowAge18) {
  var score = function (r) {
    return (Number(r['Subs']) || 0) * 1000 +
           (Number(r['Clicks']) || 0) * 10 +
           (Number(r['Times used']) || 0);
  };
  var byScore = function (a, b) { return score(b) - score(a); };

  var usable = rows.filter(function (r) {
    if (!String(r['Caption'] || '').trim()) return false;
    if (r['Status'] === 'Retired') return false;
    // Never show an "18" caption as a style example for a non-salary creator —
    // the model copies what it is shown, and that angle is salary-only.
    if (!allowAge18 && /just turned 18|18/.test(String(r['Angle / niche'] || ''))) return false;
    return true;
  });

  var here  = function (r) { return r['Channel'] === channel; };
  var hers  = function (r) { return String(r['Fits creator'] || '').trim() === creatorName; };

  // Tiered: her captions on this channel, then anyone's on this channel, then
  // anything at all. Because captions are [name]-templated they carry across
  // creators and channels fine — and without the last tier a bank tagged only
  // Feed would leave Story and MM with no examples at all.
  var tiers = [
    usable.filter(function (r) { return here(r) && hers(r); }).sort(byScore),
    usable.filter(function (r) { return here(r) && !hers(r); }).sort(byScore),
    usable.filter(function (r) { return !here(r); }).sort(byScore)
  ];

  var out = [], seen = {};
  tiers.forEach(function (t) {
    t.forEach(function (r) {
      var txt = String(r['Caption']).trim();
      if (out.length >= AI_EXAMPLES || seen[txt]) return;
      seen[txt] = 1; out.push(txt);
    });
  });
  return out;
}

/**
 * Everything already in the bank, so the model does not hand back a copy.
 *
 * Deliberately NOT filtered to one creator. Captions are [name]-templated, so
 * every one of them is reusable for any girl — a caption that exists under
 * another name is still a duplicate, and filtering by creator meant the house
 * captions (tagged for nobody) were never declared as existing at all. That is
 * how the first run came back with eleven of eighteen copied verbatim.
 */
function bankExisting_(rows) {
  return rows.map(function (r) { return String(r['Caption'] || '').trim(); })
             .filter(function (t) { return t; });
}

/**
 * Phrasing that never ships, checked in code because the prompt cannot be
 * relied on to hold the line — told in plain words not to write "hits
 * different", the model wrote it three times across two test batches.
 *
 * Two kinds. Dated internet slang, which ages badly and appears nowhere in the
 * team's own captions; and language that treats the promoted girl as a product
 * rather than a person, which is a brand problem, not a taste one.
 *
 * Edit this list freely — it is a plain regex, and anything matching it is
 * dropped before it reaches the sheet.
 */
var CAPTION_BANNED_ = new RegExp([
  'no cap', 'hits different', 'rent free', 'iykyk', 'understood the assignment',
  'main character', 'it girl', 'giving [a-z]+, giving', 'ate that', 'slay',
  'fresh meat', 'new drop', 'next one up', 'on the menu', 'prize'
].join('|'), 'i');

/**
 * Comparison key for "is this the same caption". Case, punctuation and emoji
 * are noise — "don't blame me if you like her🤍" and "Dont blame me if you like
 * her 💕" are one caption. Letters and digits in any script survive, so this
 * works for the Spanish and Czech accounts too.
 */
function capKey_(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ')
         .replace(/\s+/g, ' ').trim();
}

function captionPrompt_(creator, rows, perChannel) {
  // Only salary creators are promoted on the "she just turned 18" angle. It is
  // the launch hook for the girls we sign and build, and it would be a lie on
  // an established account — so the gate is a hard instruction, and the example
  // set is filtered to match (see bankExamples_).
  var allow18 = creator.type === 'Salary';

  var lines = [];
  lines.push('The girl being promoted: ' + creator.name +
             ' — write her as [name], never as "' + creator.name + '".');
  lines.push('Her niche: ' + (creator.niche || '(not recorded — keep the hooks general)'));
  lines.push('Language: ' + (creator.language || 'English') +
             (creator.language && !/^english$/i.test(creator.language)
               ? ' — write natively in that language, do not write English and translate it.'
               : ''));
  lines.push('Account type: ' + (creator.type || 'unknown'));
  lines.push('');
  lines.push(allow18
    ? 'She is a salary creator, so the "she just turned 18" angle IS available — but it ' +
      'is a garnish, not the pitch. Use it on EXACTLY 2 or 3 captions in this batch, no ' +
      'more and no fewer. Every other caption must sell her on something else: her niche, ' +
      'her personality, your own endorsement. A batch that leans on 18 has only one idea.'
    : 'She is NOT a salary creator. Do NOT reference her age, turning 18, being new, or ' +
      'just starting out — none of that is true of this account.');
  lines.push('');
  lines.push('Write ' + perChannel + ' captions for each of feed, story and mm. Remember the ' +
             'voice is the PROMOTER telling her own subscribers about [name].');

  ['Feed', 'Story', 'MM'].forEach(function (ch) {
    var ex = bankExamples_(rows, ch, creator.name, allow18);
    if (!ex.length) return;
    lines.push('');
    lines.push('Our real ' + ch.toLowerCase() + ' captions. Study the rhythm, length and ' +
               'emoji use — then write different ones:');
    ex.forEach(function (c) { lines.push('  • ' + c); });
  });

  var have = bankExisting_(rows);
  if (have.length) {
    lines.push('');
    lines.push('EVERY caption below is ALREADY in our bank, including the examples above. ' +
               'Writing one of these again is worthless to us — we already have it. Each ' +
               'caption you write must be a new line nobody has posted yet. Reuse the ' +
               'hooks and the voice; do not reuse the wording:');
    have.slice(0, 120).forEach(function (c) { lines.push('  • ' + c); });
  }
  return lines.join('\n');
}

// ── House captions ──────────────────────────────────────────────────────────

/**
 * Put Christos's real captions into the bank, so the generator has a style to
 * copy on its very first run instead of inventing one.
 *
 * Safe to run any number of times — it appends only what is missing, matched on
 * exact text. Everything lands Active, because unlike the AI drafts these are
 * proven and already in use.
 *
 * Channel is set to Feed for all of them. That is a guess: they read as feed and
 * story copy, and the team never recorded which was which. Re-tag any that are
 * really Story or MM — bankExamples_ prefers same-channel examples, so correct
 * tags directly improve what gets generated.
 */
function loadHouseCaptions() {
  var def  = TABS.captions;
  var have = {};
  tabRows_(def).forEach(function (r) {
    var t = String(r['Caption'] || '').trim();
    if (t) have[t] = 1;
  });

  var rows = [];
  houseCaptions_().forEach(function (h) {
    if (have[h[0]]) return;
    var row = new Array(def.headers.length).fill('');
    row[headerIndex_(def, 'Caption') - 1]       = h[0];
    row[headerIndex_(def, 'Channel') - 1]       = 'Feed';
    row[headerIndex_(def, 'Angle / niche') - 1] = h[1];
    row[headerIndex_(def, 'Added') - 1]         = new Date();
    row[headerIndex_(def, 'Added by') - 1]      = 'House';
    row[headerIndex_(def, 'Times used') - 1]    = 0;
    row[headerIndex_(def, 'Status') - 1]        = 'Active';
    row[headerIndex_(def, 'Notes') - 1]         = h[2]
      ? 'Real caption in use. Salary creators only — leans on "just turned 18".'
      : 'Real caption in use. Style reference for the generator.';
    rows.push(row);
  });

  if (rows.length) appendRows_(def, rows);
  log_('loadHouseCaptions', rows.length + ' added');
  alert_('House captions loaded',
    rows.length
      ? rows.length + ' caption(s) added to Caption Bank as Active.\n\n' +
        'They are tagged Channel = Feed because we never recorded which channel each ' +
        'one ran on. Re-tag any that are really Story or MM — the generator prefers ' +
        'same-channel examples, so that directly improves what it writes.\n\n' +
        '[name] is the swap token for whichever girl is being promoted.'
      : 'Nothing to add — all of them are already in the bank.');
  ss_().setActiveSheet(sheet_(def.name));
}

// ── Generate ────────────────────────────────────────────────────────────────

/**
 * Draft captions into Caption Bank for every Live creator.
 *
 * Lands as Resting, not Active: out of rotation until a human reads it. The
 * team's own reuse rules run off Status, so an unreviewed caption can never be
 * scheduled by accident.
 */
function generateCaptions() {
  var t0 = new Date();
  var ui = ui_();
  var perChannel = 8;

  if (ui) {
    var ask = ui.prompt('Draft captions',
      'How many per channel, per creator?\n\n' +
      'Feed, Story and MM each get this many. 8 across the Live roster is about ' +
      'a week of rotation. They arrive as Resting — nothing goes live until you say so.',
      ui.ButtonSet.OK_CANCEL);
    if (ask.getSelectedButton() !== ui.Button.OK) return;
    perChannel = Math.max(1, Math.min(20, Number(ask.getResponseText()) || 8));
  }

  var all = creatorRows_();
  var creators = all.filter(function (c) { return c.status === 'Live'; });

  // Don't dead-end on a roster problem. The first version just said "nobody is
  // Live" — true, useless, and it did not mention that the builder never wrote
  // Status in the first place. Show what is actually on the tab, then offer to
  // carry on anyway, because wanting captions and having a tidy roster are two
  // different jobs and only one of them is today's.
  if (!creators.length) {
    var byStatus = {};
    all.forEach(function (c) {
      var s = String(c.status || '').trim() || '(blank)';
      byStatus[s] = (byStatus[s] || 0) + 1;
    });
    var lines = Object.keys(byStatus).sort().map(function (s) {
      return '   ' + s + ': ' + byStatus[s];
    });

    if (!all.length) {
      alert_('The Creators tab is empty',
        'There are no creators at all, so there is nothing to write captions for.\n\n' +
        'Run Rebuild / repair tabs to put the roster back.');
      return;
    }

    var msg = 'No creator has Status = Live.\n\n' +
      all.length + ' creator(s) on the tab:\n' + lines.join('\n') + '\n\n' +
      'Status is not something the builder used to fill in, so on most sheets it is ' +
      'simply blank. "Fill in missing Status / Type" on the menu sets it from who is ' +
      'connected to the OnlyFans API.\n\n' +
      'Draft captions for all ' + all.length + ' creator(s) anyway?';

    if (!ui) { alert_('Nothing to write for', msg); return; }
    if (ui.alert('No Live creators', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    creators = all;
  }

  // Niche and language live on Creators but creatorRows_ does not carry them.
  var extra = {};
  tabRows_(TABS.creators).forEach(function (r) {
    if (r['Creator']) {
      extra[String(r['Creator']).trim()] = {
        niche:    String(r['Niche'] || '').trim(),
        language: String(r['Language'] || '').trim()
      };
    }
  });
  creators.forEach(function (c) {
    var e = extra[c.name] || {};
    c.niche = e.niche; c.language = e.language;
  });

  var def  = TABS.captions;
  var rows = tabRows_(def);
  var out = [], failed = [], dropped = 0, banned = 0;

  // Never trust the prompt to enforce this. Told "do not copy the examples", the
  // model still returned eleven of eighteen verbatim on the first real run — so
  // uniqueness is enforced here, where it cannot be talked out of it. Seeded
  // with the whole bank, and grown as the run goes so one batch cannot repeat
  // itself either.
  var seen = {};
  bankExisting_(rows).forEach(function (t) { seen[capKey_(t)] = 1; });

  for (var i = 0; i < creators.length; i += AI_CHUNK) {
    if ((new Date() - t0) / 1000 > 300) {
      failed.push('Stopped at ' + creators[i].name + ' — six-minute limit. Re-run to finish the rest.');
      break;
    }

    var slice = creators.slice(i, i + AI_CHUNK);
    var reqs  = slice.map(function (c) {
      return aiRequest_(CAPTION_SYSTEM_, captionPrompt_(c, rows, perChannel), CAPTION_SCHEMA_);
    });

    var responses;
    try {
      responses = UrlFetchApp.fetchAll(reqs);
    } catch (e) {
      failed.push(slice.map(function (c) { return c.name; }).join(', ') + ' — ' + e.message);
      continue;
    }

    responses.forEach(function (res, k) {
      var c = slice[k];
      var data;
      try { data = aiParse_(res); }
      catch (e) { failed.push(c.name + ' — ' + e.message); return; }

      [['feed', 'Feed'], ['story', 'Story'], ['mm', 'MM']].forEach(function (pair) {
        (data[pair[0]] || []).slice(0, perChannel).forEach(function (item) {
          var text = String(item && item.text || '').trim();
          if (!text) return;

          var key = capKey_(text);
          if (!key || seen[key]) { dropped++; return; }
          if (CAPTION_BANNED_.test(text)) { banned++; return; }
          seen[key] = 1;

          var row = new Array(def.headers.length).fill('');
          row[headerIndex_(def, 'Caption') - 1]       = text;
          row[headerIndex_(def, 'Channel') - 1]       = pair[1];
          row[headerIndex_(def, 'Angle / niche') - 1] = String(item.angle || '').trim();
          row[headerIndex_(def, 'Fits creator') - 1]  = c.name;
          row[headerIndex_(def, 'Added') - 1]         = new Date();
          row[headerIndex_(def, 'Added by') - 1]      = 'Claude (unreviewed)';
          row[headerIndex_(def, 'Times used') - 1]    = 0;
          row[headerIndex_(def, 'Status') - 1]        = 'Resting';
          row[headerIndex_(def, 'Notes') - 1]         = 'AI draft — read it before it goes Active';
          out.push(row);
        });
      });
    });
  }

  if (out.length) appendRows_(def, out);

  log_('generateCaptions', out.length + ' drafted, ' + dropped + ' dup, ' + banned +
       ' banned, ' + failed.length + ' failure(s)');
  alert_('Captions drafted',
    out.length + ' caption(s) written to Caption Bank as Resting.\n\n' +
    'Read them, fix the ones that are nearly right, and set Status = Active on the ' +
    'keepers. Anything still Resting stays out of rotation.' +
    (dropped ? '\n\n' + dropped + ' dropped as a repeat of something already in the bank.' : '') +
    (banned ? '\n' + banned + ' dropped for dated slang or product-y phrasing.' : '') +
    (failed.length ? '\n\nDid not run:\n• ' + failed.join('\n• ') : ''));
  if (out.length) ss_().setActiveSheet(sheet_(def.name));
}

/**
 * Append, then extend the dropdowns and calc formulas over exactly the rows
 * added — applyLists_ / applyCalc_ only ever cover the first DATA_ROWS rows,
 * so a bank that grows past 250 would otherwise lose "Days since used" and its
 * Status dropdown from there on.
 */
function appendRows_(def, rows) {
  var sh = sheet_(def.name);
  var at = lastDataRow_(sh) + 1;
  if (at < FIRST_ROW) at = FIRST_ROW;

  if (at + rows.length - 1 > sh.getMaxRows()) {
    sh.insertRowsAfter(sh.getMaxRows(), at + rows.length - 1 - sh.getMaxRows() + 50);
  }
  sh.getRange(at, 1, rows.length, def.headers.length).setValues(rows);
  sh.getRange(at, headerIndex_(def, 'Added'), rows.length, 1).setNumberFormat('yyyy-mm-dd');

  Object.keys(def.lists || {}).forEach(function (h) {
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(LIST[def.lists[h]], true).setAllowInvalid(false).build());
  });

  if (def.headers.indexOf('Fits creator') >= 0) {
    sh.getRange(at, headerIndex_(def, 'Fits creator'), rows.length, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInRange(ss_().getRangeByName('CRM_Roster'), true)
        .setAllowInvalid(true).build());
  }

  Object.keys(def.calc || {}).forEach(function (h) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push([def.calc[h].replace(/\{r\}/g, String(at + i))]);
    }
    sh.getRange(at, headerIndex_(def, h), rows.length, 1).setFormulas(out);
  });
}

// ── Near-duplicate check ────────────────────────────────────────────────────

var DUPE_SCHEMA_ = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ids:    { type: 'array', items: { type: 'integer' } },
          reason: { type: 'string' }
        },
        required: ['ids', 'reason'],
        additionalProperties: false
      }
    }
  },
  required: ['groups'],
  additionalProperties: false
};

/**
 * Find captions that are the same caption wearing different words.
 *
 * The bank's "Days since used" guard is exact-match, so two captions that say
 * the identical thing in different words both pass it, and the same post goes
 * out twice in a week looking fresh. This is the one comparison a formula
 * genuinely cannot make.
 *
 * Writes into Notes. Changes no Status — the call to retire one is yours.
 */
function findDuplicateCaptions() {
  var def = TABS.captions;
  var sh  = sheet_(def.name);
  var end = lastDataRow_(sh);
  if (end < FIRST_ROW) { alert_('Nothing to compare', 'The Caption Bank is empty.'); return; }

  // Read the range directly, NOT via tabRows_ — that helper drops blank rows,
  // so its array index stops matching the sheet row and every flag below would
  // land on the wrong caption.
  var iCap = headerIndex_(def, 'Caption') - 1;
  var iCh  = headerIndex_(def, 'Channel') - 1;
  var iSt  = headerIndex_(def, 'Status') - 1;
  var vals = sh.getRange(FIRST_ROW, 1, end - HEADER_ROW, def.headers.length).getValues();

  var live = [];
  vals.forEach(function (r, i) {
    var t = String(r[iCap] || '').trim();
    if (t && r[iSt] !== 'Retired') live.push({ row: FIRST_ROW + i, text: t, ch: r[iCh] });
  });

  if (live.length < 2) { alert_('Nothing to compare', 'Fewer than two live captions in the bank.'); return; }
  if (live.length > 400) live = live.slice(0, 400);

  var listing = live.map(function (c, i) {
    return i + '. [' + (c.ch || '?') + '] ' + c.text;
  }).join('\n');

  var system =
    'You are de-duplicating a library of OnlyFans promo captions.\n\n' +
    'Group captions that would read as the same caption to the same person seeing ' +
    'both in one week — same hook, same promise, same call to action, only the ' +
    'wording differs. Different wording is not enough on its own; the caption has ' +
    'to be doing the same job.\n\n' +
    'Do NOT group captions that merely share a theme or a channel. Two different ' +
    'teases about the same shoot are fine. Return only genuine collisions, and ' +
    'return an empty list if there are none — a false positive costs the team a ' +
    'good caption.';

  var user = 'Captions, numbered:\n\n' + listing +
             '\n\nReturn groups of two or more numbers that collide, with a short reason.';

  var data;
  try { data = aiParse_(UrlFetchApp.fetchAll([aiRequest_(system, user, DUPE_SCHEMA_)])[0]); }
  catch (e) { alert_('Duplicate check failed', e.message); log_('findDuplicateCaptions FAILED', e.message); return; }

  var col = headerIndex_(def, 'Notes'), marked = 0;
  (data.groups || []).forEach(function (g, n) {
    var ids = (g.ids || []).filter(function (x) { return live[x]; });
    if (ids.length < 2) return;
    ids.forEach(function (x) {
      var cell = sh.getRange(live[x].row, col);
      var was  = String(cell.getValue() || '');
      cell.setValue(('Overlaps #' + (n + 1) + ' — ' + (g.reason || 'same caption, different words') +
                     (was ? ' | ' + was : '')).slice(0, 480));
      marked++;
    });
  });

  log_('findDuplicateCaptions', marked + ' caption(s) in ' + (data.groups || []).length + ' group(s)');
  alert_('Duplicate check done',
    marked
      ? marked + ' caption(s) across ' + data.groups.length + ' overlapping group(s) are ' +
        'flagged in Notes on Caption Bank.\n\nNothing was retired — keep the stronger one ' +
        'of each pair and set the other to Retired yourself.'
      : 'No overlapping captions found across ' + live.length + ' checked.');
  ss_().setActiveSheet(sh);
}

// ── Check ───────────────────────────────────────────────────────────────────

/** One tiny call. Says the key works, or says exactly what is wrong. */
function testAiConnection() {
  var schema = {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
    required: ['ok'], additionalProperties: false
  };
  try {
    var d = aiParse_(UrlFetchApp.fetchAll([
      aiRequest_('Reply with ok true.', 'Are you there?', schema)
    ])[0]);
    alert_('Claude check',
      '✓ Key works. Model: ' + AI_MODEL + '\n\nReply: ' + JSON.stringify(d) +
      '\n\nCaption Bank rows used as style examples: ' +
      tabRows_(TABS.captions).filter(function (r) { return String(r['Caption'] || '').trim(); }).length +
      '\n\nThe more real captions in that tab, the less generic the drafts.');
  } catch (e) {
    alert_('Claude check failed', '✗ ' + e.message);
  }
  log_('testAiConnection', 'ran');
}
