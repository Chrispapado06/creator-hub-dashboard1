/**
 * UNCVRD — Salary Creator CRM : seed data
 * ============================================================================
 * Written ONLY into a tab that is completely empty. Re-running setup never
 * touches a row anyone has typed into, so this file is safe to keep around.
 *
 * Everything here is transcribed from a source, not invented:
 *   Luca x Christos (August 2026)      — targets, checklists, improvements, tests
 *   Internal promo weekly report       — the roster and which pages the API sees
 *   Internal promo tracking sheet      — the promoted × promoter tracking links
 *   Ad sheet                           — which creators are on paid traffic
 */

// ── Creators ────────────────────────────────────────────────────────────────

/**
 * [name, handle, apiTracked, notes]
 *
 * `apiTracked` is the eight pages connected in app.onlyfansapi.com — the only
 * ones whose promo revenue is real rather than zero-by-default. Status, Type
 * and Tier are deliberately left blank: nothing in any source states who is on
 * salary versus managed, and guessing would put a wrong number on the
 * dashboard on day one.
 */
function seedCreators_() {
  return [
    ['Antonella',  'lillyylou',      true,  'Paid ads + heaviest internal promo. Luca p.25: more stories, better posts; future — add campus besties to bio.'],
    ['Ella',       'ellaajanee',     true,  'Paid ads. Luca p.25: more stories, better quality (all need editing), more SFS slots during the day. Swap to be set up (p.5).'],
    ['June',       'junehaynes',     true,  ''],
    ['Nicole',     'rosewhitex',     true,  'The ad sheet calls this page "Rose white". Luca p.20: needs an optimised banner. p.25: more stories, better quality, more SFS slots.'],
    ['Julie',      'juliejswan',     true,  ''],
    ['Emma',       'emmasonne',      true,  'Swap to be set up (Luca p.5).'],
    ['Blue Bear',  'bluebeari3vip',  true,  'Swap to be set up (Luca p.5).'],
    ['Marissa',    'marissa.munoz',  true,  'Paid ads. Swap to be set up (Luca p.5). No tracking links created yet.'],
    ['Sandra',     'thisisjunee',    false, 'Handle reads as June to any name matcher — it is Sandra\'s page. Do not let that get re-broken.'],
    ['Sophie',     'celinerenxo',    false, ''],
    ['Angelina',   'itsangelinabae', false, ''],
    ['Maylee',     'mayyy.leee',     false, ''],
    ['Apple',      'apple_kittii',   false, ''],
    ['Bella Leah', 'bella_leaa',     false, ''],
    ['Charlotte',  'charlottelive',  false, 'Luca p.21 #4: captions being used need review.'],
    ['Ali',        'cleoivy',        false, 'Was on the sheet as "Chloe" until 2026-08. Page cleoivy.'],
    ['Macy',       '',               false, 'Received 15 promo slots last week and reported $0 — page not connected.'],
    ['Emily',      '',               false, 'Luca p.21 #4: captions being used need review.'],
    ['Meg',        '',               false, ''],
    ['Ashleigh',   '',               false, ''],
    ['Gracie',     '',               false, 'Was on the sheet as "Chloe / Cleo" until 2026-08.'],
    ['Kiara',       '',               false, 'Salary creator. Page not connected to the API yet — reports $0 until it is.'],
    ['Clementa',    '',               false, 'Salary creator. Page not connected to the API yet — reports $0 until it is.']
  ];
}

/**
 * The salary roster as Christos gave it on 8 Aug 2026, with the second name
 * each one goes by and the spelling the ad sheet uses.
 *
 * `adName` is the join key for the Daily Report and it is NOT our spelling —
 * the ad sheet calls Nicole "Rose white". Getting it wrong makes a creator
 * silently report zero, which is the worst failure mode here.
 *
 * [creator, alsoKnownAs, adSheetName, apiConnected, note]
 */
function salaryRoster_() {
  return [
    ['Nicole',    'Rose',     'Rose white', true,  'Page @rosewhitex. The ad sheet spells her "Rose white".', 'rosewhitex'],
    ['Antonella', 'Lilly',    'Antonella',  true,  'Page @lillyylou.', 'lillyylou'],
    ['Ella',      'Rosario',  'Ella',       true,  'Page @ellaajanee. Confirmed 9 Aug 2026: Rosario is Ella, not Nicole.', 'ellaajanee'],
    ['Kiara',     'Hannah',   '',           true,  'Page @hannahgoldiegirl, live on the OF API. No ad-sheet name yet, so her LINK columns stay blank — total earnings and new subs still work.', 'hannahgoldiegirl'],
    ['Clementa',  'Brooklyn', '',           false, 'Not on the OF API — no account visible to the key (checked 9 Aug 2026). Reports nothing until her page is connected.', '']
  ];
}


// ── Tracking links ──────────────────────────────────────────────────────────

/**
 * [promotedCreator, promoter, link]
 *
 * The source tab labels its first column "Promoting Creator". It is not — the
 * link sits on the promoted creator's own page and the code identifies who
 * sent the traffic. Verified against Raw Slots: Blue Bear / June / c19 and
 * Antonella / Julie / c27 both match this reading and not the labelled one.
 * "n/a" rows are carried over on purpose: they are the links still missing.
 */
function seedLinks_() {
  var rows = [];
  function block(promoted, pairs) {
    pairs.forEach(function (p) { rows.push([promoted, p[0], p[1]]); });
  }

  block('Antonella', [
    ['Blue Bear', 'https://onlyfans.com/lillyylou/c28'],
    ['Emma',      'https://onlyfans.com/lillyylou/c30'],
    ['Julie',     'https://onlyfans.com/lillyylou/c27'],
    ['Marissa',   'https://onlyfans.com/lillyylou/c26'],
    ['Angelina',  'https://onlyfans.com/lillyylou/c38'],
    ['Apple',     'https://onlyfans.com/lillyylou/c35'],
    ['June',      'https://onlyfans.com/lillyylou/c43'],
    ['Sandra',    'https://onlyfans.com/lillyylou/c34'],
    ['Sophie',    'https://onlyfans.com/lillyylou/c36']]);

  block('Ella', [
    ['Blue Bear', 'https://onlyfans.com/ellaajanee/c4'],
    ['Emma',      'https://onlyfans.com/ellaajanee/c5'],
    ['Julie',     'https://onlyfans.com/ellaajanee/c6'],
    ['Marissa',   'https://onlyfans.com/ellaajanee/c12'],
    ['Angelina',  'https://onlyfans.com/ellaajanee/c7'],
    ['Apple',     'https://onlyfans.com/ellaajanee/c8'],
    ['June',      'https://onlyfans.com/ellaajanee/c9'],
    ['Sandra',    'https://onlyfans.com/ellaajanee/c10'],
    ['Sophie',    'https://onlyfans.com/ellaajanee/c11']]);

  block('Blue Bear', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Emma',      'https://onlyfans.com/bluebeari3vip/c7'],
    ['Julie',     'https://onlyfans.com/bluebeari3vip/c17'],
    ['Angelina',  'https://onlyfans.com/bluebeari3vip/c16'],
    ['Apple',     'https://onlyfans.com/bluebeari3vip/c14'],
    ['June',      'https://onlyfans.com/bluebeari3vip/c19'],
    ['Sandra',    'https://onlyfans.com/bluebeari3vip/c10'],
    ['Sophie',    'https://onlyfans.com/bluebeari3vip/c18']]);

  block('Emma', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/emmasonne/c21'],
    ['Julie',     'https://onlyfans.com/emmasonne/c34'],
    ['Angelina',  'https://onlyfans.com/emmasonne/c26'],
    ['Apple',     'https://onlyfans.com/emmasonne/c28'],
    ['June',      'https://onlyfans.com/emmasonne/c36'],
    ['Sandra',    'https://onlyfans.com/emmasonne/c23'],
    ['Sophie',    'https://onlyfans.com/emmasonne/c37']]);

  block('Julie', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/juliejswan/c4'],
    ['Emma',      'https://onlyfans.com/juliejswan/c5'],
    ['Angelina',  'https://onlyfans.com/juliejswan/c6'],
    ['Apple',     'https://onlyfans.com/juliejswan/c7'],
    ['June',      'https://onlyfans.com/juliejswan/c8'],
    ['Sandra',    'https://onlyfans.com/juliejswan/c9'],
    ['Sophie',    'https://onlyfans.com/juliejswan/c10']]);

  block('Angelina', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/itsangelinabae/c78'],
    ['Emma',      'https://onlyfans.com/itsangelinabae/c79'],
    ['Julie',     'https://onlyfans.com/itsangelinabae/c88'],
    ['Apple',     'https://onlyfans.com/itsangelinabae/c86'],
    ['June',      'https://onlyfans.com/itsangelinabae/c89'],
    ['Sandra',    'https://onlyfans.com/itsangelinabae/c82'],
    ['Sophie',    'https://onlyfans.com/itsangelinabae/c90']]);

  block('Apple', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/apple_kittii/c15'],
    ['Emma',      'https://onlyfans.com/apple_kittii/c16'],
    ['Julie',     'https://onlyfans.com/apple_kittii/c29'],
    ['Angelina',  'https://onlyfans.com/apple_kittii/c22'],
    ['June',      'https://onlyfans.com/apple_kittii/c27'],
    ['Sandra',    'https://onlyfans.com/apple_kittii/c19'],
    ['Sophie',    'https://onlyfans.com/apple_kittii/c28']]);

  block('June', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/junehaynes/c38'],
    ['Emma',      'https://onlyfans.com/junehaynes/c39'],
    ['Julie',     'https://onlyfans.com/junehaynes/c40'],
    ['Angelina',  'https://onlyfans.com/junehaynes/c41'],
    ['Apple',     'https://onlyfans.com/junehaynes/c42'],
    ['Sandra',    'https://onlyfans.com/junehaynes/c43'],
    ['Sophie',    'https://onlyfans.com/junehaynes/c44']]);

  block('Sandra', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/thisisjunee/c8'],
    ['Emma',      'https://onlyfans.com/thisisjunee/c9'],
    ['Julie',     'https://onlyfans.com/thisisjunee/c21'],
    ['Angelina',  'https://onlyfans.com/thisisjunee/c14'],
    ['Apple',     'https://onlyfans.com/thisisjunee/c16'],
    ['June',      'https://onlyfans.com/thisisjunee/c22'],
    ['Sophie',    'https://onlyfans.com/thisisjunee/c23']]);

  block('Sophie', [
    ['Antonella', 'n/a'], ['Ella', 'n/a'],
    ['Blue Bear', 'https://onlyfans.com/celinerenxo/c22'],
    ['Emma',      'https://onlyfans.com/celinerenxo/c23'],
    ['Julie',     'https://onlyfans.com/celinerenxo/c24'],
    ['Angelina',  'https://onlyfans.com/celinerenxo/c25'],
    ['Apple',     'https://onlyfans.com/celinerenxo/c26'],
    ['June',      'https://onlyfans.com/celinerenxo/c27'],
    ['Sandra',    'https://onlyfans.com/celinerenxo/c28']]);

  // Named on the source tab under "To add" — no links exist for them at all.
  ['Marissa', 'Meg', 'Ashleigh', 'Bella Leah'].forEach(function (c) {
    rows.push([c, '(all promoters)', 'n/a']);
  });

  // Columns: promoted | promoter | source type | url | clicks | subs | revenue |
  // created | active | notes. Source type is a formula and the three stat
  // columns come from the nightly API pull, so they are left empty here.
  var out = rows.map(function (r) {
    var ok = r[2] !== 'n/a';
    return [r[0], r[1], '', r[2], '', '', '', '', '', '', ok,
            ok ? '' : 'Link does not exist yet — create it.'];
  });

  // Paid-ad links. Different animal from the internal ones: the traffic source
  // is a platform, not another creator, so the promoter column holds "Paid ad".
  // If a creator runs a different link per platform, split this into one row
  // per platform — the lookup keys on promoted + promoter, so they can coexist.
  [['Antonella', 'https://onlyfans.com/lillyylou/c77'],
   ['Nicole',    'https://onlyfans.com/rosewhitex/c255']].forEach(function (r) {
    out.push([r[0], 'TrafficHaus', '', r[1], '', '', '', '', '', '', true,
              'TrafficHaus paid-ad link, confirmed 8 Aug 2026.']);
  });

  return out;
}

// ── External SFS ────────────────────────────────────────────────────────────

function seedExternal_() {
  var rows = [
    ['Tom huzz', '', '', '', '', '', 'Proposed', '', '', '', '', false, '', '', '', '',
     '', 'Open the conversation — named by Luca p.5.', 'Luca p.5: people to swap with.'],
    ['Dan', '', '', '', '', '', 'Proposed', '', '', '', '', false, '', '', '', '',
     '', 'Open the conversation — named by Luca p.5.', 'Luca p.5: people to swap with.']
  ];
  ['Blue Bear', 'Marissa', 'Emma', 'Antonella', 'Ella'].forEach(function (c) {
    rows.push(['(partner TBC)', '', '', '', c, '', 'Proposed', '', '', '', '', false,
               '', '', '', '', '', 'Find a partner and set the swap up.',
               'Luca p.5: "Set up Swaps for" — ' + c + '.']);
  });
  return rows;
}

// ── Tests ───────────────────────────────────────────────────────────────────

function seedTests_() {
  var t = function (test, area, hyp, a, b, metric) {
    return [test, area, hyp, '', a, b, metric, '', '', '', '', '', '', '', '', 'Idea', ''];
  };
  return [
    t('Paid welcome message', 'Scripts',
      'A paid welcome message earns more per new sub than it costs in reply rate.',
      'Free welcome message', 'Paid welcome message', '$ per new sub, first 48h'),
    t('Welcome message with a picture', 'Scripts',
      'Luca p.18: touchpoints need really good pictures of the model — that is what makes a guy want to talk and spend.',
      'Text only', 'Text + strong picture', 'Reply rate, then $ per new sub'),
    t('Lower script pricing', 'Scripts',
      'Dropping the price raises unlock rate enough to lift the average toward $25 a send.',
      'Current price', 'Lower price', '$ per send'),
    t('More pictures in the script', 'Scripts',
      'Adding pictures raises unlock rate without touching the price.',
      'Current pic count', 'More pics', 'Unlock %, $ per send'),
    t('More teasers in the script', 'Scripts',
      'Adding teasers raises unlock rate without touching the price.',
      'Current teaser count', 'More teasers', 'Unlock %, $ per send'),
    t('Niche test per model', 'Account',
      'Luca p.17: niching has to be tested per model — the winner is not the same for everyone.',
      'Current niche', 'Alternative niche', 'Subs/day, $ per sub'),
    t('Expiring feed post every 2 hours', 'Internal promo',
      'Luca p.25 + p.12: high volume stays non-spammy if posts expire. More slots, no drop in per-slot revenue.',
      'Current cadence', 'Model → SFS → model, every 2h', '$ per slot, subs per slot'),
    t('5 stories a day per account', 'Internal promo',
      'Luca p.21 #1 and p.23 #3. Five good stories a day beats the current volume without burning the audience.',
      'Current story volume', '5 per day, rotated batch', 'Story clicks, subs gained'),
    t('Permanent feed SFS on selected accounts', 'Internal promo',
      'Luca p.21 #9: a salary sitting permanently in the feed of certain accounts outperforms rotating everyone equally.',
      'Rotating slots only', 'Permanent slot on selected accounts', '$ per slot')
  ];
}

// ── Improvements & flags ────────────────────────────────────────────────────

/** Every improvement named in the August doc, with its page. [area, who, issue, severity] */
function seedFlags_() {
  return [
    ['Internal promo', '', 'Push certain accounts to 5 stories a day, with good pictures of the model — weak pics removed. (p.21 #1)', 'High'],
    ['Content',   'Antonella', 'Pictures need quality checking. (p.21 #2)', 'High'],
    ['Content',   'Nicole',    'Quality. (p.21 #3)', 'High'],
    ['Internal promo', 'Emily / Charlotte', 'The captions being used need reviewing. (p.21 #4)', 'Medium'],
    ['Internal promo', '', 'Christos to constantly add new captions and review the ones in use. (p.21 #5)', 'Medium'],
    ['Internal promo', '', 'Captions must play into the niche of the model. (p.21 #6)', 'Medium'],
    ['Internal promo', '', 'Stop repeating the same stories — hold a batch to rotate through. (p.21 #7)', 'Medium'],
    ['Account',   '', 'Optimise all accounts. Make sure Chris knows what an optimised OF page is — starting with better feed posts. (p.21 #8)', 'High'],
    ['Internal promo', '', 'Decide which salary is the permanent feed-post SFS on which accounts. (p.21 #9)', 'Medium'],
    ['Internal promo', '', 'Maximise the promo slots on our own salaries. (p.21 #10)', 'Medium'],
    ['Internal promo', '', 'Track promo performance and allocate more slots to the models it works for. (p.21 #11)', 'High'],
    ['Content',   '', 'Rotate tease-content examples for the models to copy, pulled from other OF accounts. (p.21 #12)', 'Medium'],
    ['Whales',    '', 'Internally transfer whales onto specific accounts, without the models knowing. (p.21 #13)', 'High'],
    ['Account',   'Nicole', 'Needs an optimised banner. (p.20 — listed as "rose")', 'Medium'],
    ['Internal promo', '', 'One of the live internal promo captions does not make sense. Find it and replace it. (p.20)', 'Low'],
    ['Account',   'Antonella', 'More stories needed, better quality posts and stories. Future: add campus besties to the bio. (p.25)', 'High'],
    ['Account',   'Nicole', 'More stories, better quality posts and stories — all need editing. More SFS promotional slots during the day. (p.25)', 'High'],
    ['Account',   'Ella', 'More stories, better quality posts and stories — all need editing. More SFS promotional slots during the day. (p.25)', 'High'],
    ['Internal promo', '', 'Every creator needs expiring feed posts every 2 hours: model → SFS → model, on repeat. (p.25)', 'High'],
    ['Internal promo', '', 'Quality-assure every SFS post: good caption, good content, correct model, correct formatting. (p.23 #1)', 'Blocker'],
    ['Internal promo', '', 'Produce a clear list — who gets more slots, who can run permanent SFS, who cannot, and what rotation of content, captions and models we use. (p.23 #2)', 'High'],
    ['Content',   '', 'All model content edited properly ahead of the upcoming promos. (p.23 #4)', 'High'],
    ['Onboarding', '', 'Finn to send an updated week-one content list — the Notion is not working any more. (p.15)', 'High'],
    ['Salary',    '', 'Sophie to arrange and sort the logistics for salary filming QC. (p.2)', 'Medium'],
    ['Ads',       '', 'Meta ads: tracking, iterating, making improvements. (p.2 #3)', 'High'],
    ['Salary',    '', 'Salary social channels to run: Facebook flash, Instagram flash, Instagram organic, Instagram babe, Instagram SFS. (p.2 #4)', 'Medium'],
    ['Other',     '', 'The promo schedule file is still an uploaded .xlsx, so nothing can read it automatically. File → Save as Google Sheets, then put the new ID on Config.', 'High']
  ].map(function (r) {
    return ['', r[0], r[1], r[2], r[3], '', '', '', 'Open', false, '', '', ''];
  });
}

// ── Onboarding checklist reference ──────────────────────────────────────────

/** Shown on Start Here so the checklist reads as instructions, not 22 bare boxes. */
function onboardingNotes_() {
  return [
    ['Drive set up',            'A Google Drive in glydel, linked to our other Drive, so all her old content can be uploaded. (p.15)'],
    ['Week-1 content list sent','Our week-one content: the scripts and the marketing content for the marketing list. (p.15)'],
    ['Filming location decided','Can she film at her current address? How does the apartment and the background look? If not, book an Airbnb on a day she is free. (p.15)'],
    ['Payment account created', 'Skrill, Cosmo or Pagos247. Skrill is easiest and fine to start on, Cosmo needs a proof of address, Pagos is safest. (p.15)'],
    ['Email = Lucambra',        'The account can use her number, but it is verified from our Lucambra email — and locked so she cannot log in or verify from the number. (p.15)'],
    ['Proof of address',        'Must link to her ID card, a parent, or someone else at the same address. Needed for Skrill. (p.15)'],
    ['Scripts personalised',    'These accounts get internally promoted, so they cannot run our stock proven scripts. Personalise them. (p.17)'],
    ['Welcome message set',     'Paid or free, with or without a picture — that is a live test, see the Tests tab. (p.18)']
  ];
}

/**
 * The house captions — Christos's real, in-use SFS promo captions (Aug 2026).
 *
 * These are the style reference the caption generator learns from, so they are
 * kept VERBATIM. Two edits only, both structural:
 *   - real creator names → [name], so any caption works for any girl and the
 *     scheduler swaps one token
 *   - each tagged with the hook it uses, which becomes the angle vocabulary
 *
 * Note the shape they all share: the PROMOTER is talking to her own subscribers
 * about ANOTHER girl. That is what internal promo is — nobody here is promoting
 * herself. Get that wrong and every generated caption is unusable.
 *
 * `age18: true` marks the ones that lean on "she just turned 18". That angle is
 * only ever used for salary creators, so the generator gates it on Type.
 *
 * [caption, angle, age18]
 */
function houseCaptions_() {
  return [
    ['finally showing you hottie 🤭❤️‍🔥',                                  'introduction',        false],
    ['thought I\'d put you onto someone cute today 💗',                     'introduction',        false],
    ['thought I\'d bring someone new your way 🤍',                          'introduction',        false],
    ['consider this your little introduction to her 🌸',                    'introduction',        false],
    ['bringing you someone who definitely deserves a little attention 👀',  'introduction',        false],
    ['I couldn\'t wait to show off [name]🤍',                               'introduction',        false],

    ['I wouldn\'t be surprised if you came back for her tomorrow 💘',       'confident prediction', false],
    ['I\'m pretty sure you\'re gonna want to know her 🤍',                  'confident prediction', false],
    ['I bet she has a way of getting your attention 💕',                    'confident prediction', false],
    ['don\'t blame me if you like her🤍',                                   'confident prediction', false],

    ['this one might be your kind of trouble 😏',                           'curiosity gap',       false],
    ['you need to see this girl I\'ve been hyping up 🤭',                   'curiosity gap',       false],
    ['wait, you need to see her🤫',                                         'curiosity gap',       false],
    ['I wasn\'t expecting this at all 👀',                                  'curiosity gap',       false],

    ['you found [name] nice and early 🤭',                                  'early access',        false],
    ['you came across her early💕',                                         'early access',        false],
    ['perfect timing... [name]\'s right here 🌷',                           'early access',        false],
    ['She\'s off to a cute start 💕',                                       'early access',        false],

    ['I could stare at [name] all day 💕',                                  'personal endorsement', false],
    ['damn, I love [name]\'s confidence!❤️‍🔥',                              'personal endorsement', false],
    ['I love everything about [name]😭💕',                                  'personal endorsement', false],
    ['she\'s got that cheeky smile🤭',                                      'personal endorsement', false],
    ['she\'s making today a little hotter ❤️‍🔥',                            'personal endorsement', false],

    ['Can you scroll past her? I meann..🤭',                                'challenge',           false],

    ['18 already? time really flies 🥹💕',                                  'just turned 18',      true],
    ['My best friend just turned 18 🌸 show her some loveee',               'just turned 18',      true],
    ['she just turned 18, say hello to this sweet face 🌸',                 'just turned 18',      true],
    ['18 looks so good on her 🥹',                                          'just turned 18',      true]
  ];
}
