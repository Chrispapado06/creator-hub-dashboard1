/**
 * UNCVRD — Salary Creator CRM : schema
 * ============================================================================
 * Every tab, every column, every dropdown is declared here once. Setup.gs
 * builds from this and Code.gs reads from it, so a column can be renamed or
 * moved in one place without hunting formulas — they are generated from the
 * header name, never from a hard-coded letter.
 *
 * Scope: everything in Christos's remit that is NOT chatting. Chat QA, chatter
 * hiring and the 20 chatting rules deliberately live elsewhere.
 */

var HEADER_ROW    = 3;   // row 1 = banner, row 2 = help text, row 3 = headers
var FIRST_ROW     = 4;
var DATA_ROWS     = 250; // rows of pre-formatted, pre-formulad space per tab
var LOG_SHEET     = '_Log';

/**
 * Lifted straight off the ad sheet Christos already likes
 * (1CZswouM2eXPTrU0prifEnwthbRFvO5hrr6a2BkgAQQ8). Same indigo banner, same
 * near-black header row, same yellow for "you type here", same pale grey for
 * "this is a formula". Do not re-theme this file without changing that one.
 */
var C = {
  brand:   '#5b43f5',   // banners and section bars
  brandTx: '#ffffff',
  ink:     '#111111',
  head:    '#1f2430',   // table header row
  headTxt: '#ffffff',
  help:    '#6b7280',
  input:   '#fff6cc',   // "you type here" — reserved for real control cells
  calc:    '#f1f2f7',   // "don't type here — formula"
  good:    '#c8e6c9',
  warn:    '#ffe0b2',
  bad:     '#f8d0cd',
  flag:    '#fce8b2'
};

/**
 * Status colours for the promo schedules, in the team's own vocabulary.
 * These are conditional-formatting RULES, not fills — so they are rewritten on
 * every rebuild and can never be lost, and a status typed tomorrow colours
 * itself without anyone painting a cell.
 */
/**
 * Statuses that mean the post ACTUALLY WENT OUT.
 *
 * "Expired" is not a failure — it is a post that ran and whose one-day expiry
 * passed, which is most of the rows in the team's own schedule the morning
 * after. Counting only "Posted" made yesterday's work vanish as soon as a VA
 * updated it. "Excluded" and "Declined" never went out and must not count.
 */
var POSTED_STATES = ['Posted', 'Expired'];

var STATUS_COLOUR = {
  'Scheduled':    '#ffe599',   // yellow — waiting to go out
  'Under Review': '#cfe2f3',   // blue — with Liz / Lance
  'Posted':       '#b6d7a8',   // green — live
  'Expired':      '#ea9999',   // red — ran its course
  'Excluded':     '#f4cccc',   // pink — pulled, same colour the old file used
  'Declined':     '#d9d2e9'    // grey-purple — the model said no
};

/**
 * One colour per creator on the promoter column, so a long schedule can be
 * read by eye. Cycles if the roster outgrows it; neighbours stay distinct.
 */
var PROMOTER_PALETTE = [
  '#d7e3fc', '#d4edda', '#fff3cd', '#fADBD8', '#e8daef', '#d1f2eb',
  '#fde2e4', '#e2ece9', '#dfe7fd', '#f9e0ae', '#cfe8ef', '#e4d8dc'
];

/** Section colours — the tab strip should read as five blocks, not 24 tabs. */
var SECTION = {
  control: '#1a73e8',
  roster:  '#188038',
  money:   '#e37400',
  content: '#8430ce',
  promo:   '#12b5cb',
  ads:     '#d93025',
  whale:   '#b06000',
  improve: '#5f6368',
  config:  '#9aa0a6'
};

// ── Dropdown vocabularies ───────────────────────────────────────────────────

var LIST = {
  creatorStatus: ['Prospect', 'Signed', 'Onboarding', 'Live', 'Paused', 'Churned'],
  creatorType:   ['Salary', 'Managed', 'Roster only', 'Partner'],
  tier:          ['A', 'B', 'C'],
  payMethod:     ['Skrill', 'Cosmo', 'Pagos247', 'Bank', 'Not set up'],
  weekday:       ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  yesNo:         ['Yes', 'No'],

  payStatus:     ['Due', 'Paid', 'Held', 'Skipped'],

  locationType:  ['Her address', 'Airbnb', 'Studio', 'Other'],
  shootStatus:   ['Planned', 'Booked', 'Filmed', 'Content received', 'Refilm needed', 'Cancelled'],

  contentType:   ['Script', 'Tease', 'Reel', 'Pics', 'Story batch', 'SFS asset'],
  contentSource: ['Salary shoot', 'Model upload', 'Old content', 'Editor'],
  qcVerdict:     ['Approve', 'Approve with edits', 'Refilm'],
  qcStatus:      ['Awaiting QC', 'In edit', 'Final QC', 'Approved', 'Refilm', 'Rejected'],

  scriptState:   ['Draft', 'Filmed', 'In edit', 'Live — testing', 'Proven', 'Tired', 'Retired'],
  scriptVerdict: ['Keep', 'Retest', 'Reprice', 'Add pics', 'Add teasers', 'Retire'],

  channel:       ['Feed', 'Story', 'MM', 'External SFS', 'Paid ad'],
  // Where paid traffic comes from. Anything NOT in here that appears as a
  // link's source is a creator, which by Christos's rule means the link is SFS.
  trafficSource: ['TrafficHaus', 'Meta', 'OnlyFinder', 'OnlyGuider', 'OnlySeeker',
                  'OnlyTraffic', 'Paid ad'],
  captionStatus: ['Active', 'Resting', 'Retired'],
  promoRec:      ['Increase allocation', 'Keep current', 'Reduce allocation', 'Pause', 'Not tracked'],
  feedType:      ['Model', 'SFS'],
  adRange:       ['Today', 'Yesterday', 'Last 7 days', 'Last 14 days', 'Last 30 days',
                  'This week so far', 'Last full week', 'This month', 'Custom'],
  // "Permanent" is not a step in the life of a post — it is the instruction
  // that this pairing stays up and is never reshuffled. Everything past
  // "Scheduled" is treated as work someone has done, so it survives a rebuild.
  postStatus:    ['Scheduled', 'Permanent', 'Own content', 'Under Review', 'Posted',
                  'Expired', 'Excluded', 'Declined'],
  permChannel:   ['Feed', 'Story', 'MM'],
  permPer:       ['day', 'week'],
  mmShift:       ['Day', 'Evening', 'Late Evening'],

  swapStatus:    ['Proposed', 'Agreed', 'Scheduled', 'Posted', 'Reciprocated', 'Dead'],

  whaleTransfer: ['Not started', 'Warming', 'Pitching', 'Moved', 'Refused', 'Lost'],

  testStatus:    ['Idea', 'Running', 'Concluded', 'Rolled out', 'Dropped'],
  area:          ['Salary', 'Onboarding', 'Content', 'Account', 'Scripts', 'Internal promo',
                  'External SFS', 'Ads', 'Whales', 'Payments', 'Other'],
  severity:      ['Blocker', 'High', 'Medium', 'Low'],
  flagStatus:    ['Open', 'In progress', 'Blocked', 'Done', 'Dropped'],
  researchCat:   ['Pictures', 'Captions', 'Pricing', 'Welcome message', 'Niche', 'Bio', 'Promo', 'Scripts']
};

// ── Tabs ────────────────────────────────────────────────────────────────────
//
// key      → used in code and in generated formulas
// name     → the literal tab name in the spreadsheet
// headers  → row 3, left to right
// checks   → headers rendered as checkboxes
// dates / money / pct / int → number formats
// lists    → header → LIST key
// calc     → header → formula template. `{r}` is replaced with the row number.
// seed     → rows written ONLY when the tab is empty

var TABS = {

  start: {
    name: 'Start Here', section: 'control', kind: 'doc'
  },

  dash: {
    name: 'Dashboard', section: 'control', kind: 'dash'
  },

  creators: {
    name: 'Creators', section: 'roster',
    title: 'CREATORS — the master record',
    help:  'One row per creator. Everything else in this file looks a name up here, so spell it the same way every time. Yellow = you type. Grey = calculated.',
    headers: ['Creator', 'Also known as', 'Same person as', 'Status', 'Type', 'Tier',
              'OF handle', 'OF page',
              'Ad sheet name', 'API tracked',
              '18yo account', 'Niche', 'Country', 'Language', 'DeepL needed',
              'Manager', 'Chatter team', 'First contact', 'Signed', 'Live', 'Days live',
              'Salary $/wk', 'Pay method', 'Pay day', 'Monthly target $',
              'Drive folder', 'IG organic', 'IG flash', 'IG babe', 'IG SFS', 'FB flash',
              'Account optimised', 'Scripts personalised', 'Permanent feed SFS',
              'Max promo slots/wk', 'Last review', 'Flag to Luca', 'Notes'],
    checks: ['API tracked', '18yo account', 'DeepL needed', 'Account optimised',
             'Scripts personalised', 'Permanent feed SFS', 'Flag to Luca'],
    dates:  ['First contact', 'Signed', 'Live', 'Last review'],
    money:  ['Salary $/wk', 'Monthly target $'],
    int:    ['Max promo slots/wk'],
    lists:  { 'Status': 'creatorStatus', 'Type': 'creatorType', 'Tier': 'tier',
              'Pay method': 'payMethod', 'Pay day': 'weekday' },
    // $T is "Live". It was $S until "Same person as" was inserted ahead of it —
    // every letter after column B moved one to the right. Anything here that
    // names a column by letter has to be re-checked whenever headers change.
    calc:   { 'Days live': '=IF(OR($A{r}="",$T{r}=""),"",TODAY()-$T{r})' },
    widths: { 'Creator': 150, 'Also known as': 130, 'Same person as': 130, 'OF page': 220,
              'Ad sheet name': 140, 'Niche': 160, 'Drive folder': 200, 'Notes': 320 },
    notes:  { 'Same person as': 'The same human, on a second account — Sandra and June are one person on two pages. Named here, the schedule will never have one promote the other: that is not a swap, it is her promoting herself, and it spends a slot that could have reached somebody else\'s audience.',
              'Also known as': 'The other name this creator goes by — her real first name, or the persona. Kept so nobody has to remember that Antonella is Lilly.',
              'Ad sheet name': 'EXACTLY how the ad sheet spells her, which is not how we do. Nicole is "Rose white" there. The Daily Report joins on this — get it wrong and she reports zero.',
              'API tracked': 'Tick only if the page is connected in app.onlyfansapi.com. Untracked pages report $0 revenue — that is a wiring gap, not a performance result.',
              'Permanent feed SFS': 'Luca p.21 #9 — which salary sits as a permanent feed post on which accounts.',
              'Flag to Luca': 'Luca p.7: urgently flag anything not up to standard so he can allocate time to it.' }
  },

  onboarding: {
    name: 'Onboarding', section: 'roster',
    title: 'ONBOARDING — the salary checklist',
    help:  'Luca p.15–17, one box per step. If no Airbnb is needed, still tick "Airbnb booked" — it means handled. Target: live within the SLA on Config.',
    headers: ['Creator', 'Signed', 'Target live', 'Days in onboarding', 'Banking method',
              'Airbnb needed', 'Complete %', 'Status', 'Blocker', 'Owner',
              'Drive set up', 'Old content uploaded', 'Week-1 content list sent',
              'Scripts sent', 'Marketing content sent', 'Filming location decided',
              'Airbnb booked', 'Payment account created', 'Email = Lucambra',
              'Phone login disabled', 'Proof of address', 'Banking verified',
              'Pics right', 'Bio right', 'Niche set', 'Name set', 'Banner done',
              'Proven scripts added', 'Scripts personalised', 'Welcome message set',
              'Tracking links created', 'Added to promo rotation'],
    checkBlock: ['Drive set up', 'Added to promo rotation'],   // inclusive range
    dates:  ['Signed', 'Target live'],
    pct:    ['Complete %'],
    lists:  { 'Banking method': 'payMethod', 'Airbnb needed': 'yesNo' },
    calc:   { 'Days in onboarding': '=IF(OR($A{r}="",$B{r}=""),"",TODAY()-$B{r})',
              'Complete %':         '=IF($A{r}="","",COUNTIF($K{r}:$AF{r},TRUE)/22)',
              'Status':             '=IF($A{r}="","",IF($G{r}=1,"Ready",IF(N($D{r})>CFG_ONBOARDING_SLA_DAYS,"OVER SLA","In progress")))' },
    widths: { 'Creator': 150, 'Blocker': 260 },
    notes:  { 'Email = Lucambra': 'Skrill must verify from the Lucambra email, never her phone number (Luca p.15).',
              'Proof of address': 'Must link to her ID, a parent, or someone at the same address. Needed for Skrill and Cosmo.' }
  },

  payments: {
    name: 'Salary Payments', section: 'money',
    title: 'SALARY PAYMENTS — paid Monday, or on content delivery',
    help:  'Luca p.16: "make sure salaries are paid on time, usually every Monday… it should also remind me if they need to be paid." The Monday reminder emails from this tab.',
    headers: ['Pay date', 'Creator', 'Amount $', 'Method', 'Week covered',
              'Content delivered', 'Status', 'Paid on', 'Reference', 'Days overdue', 'Notes'],
    checks: ['Content delivered'],
    dates:  ['Pay date', 'Week covered', 'Paid on'],
    money:  ['Amount $'],
    lists:  { 'Method': 'payMethod', 'Status': 'payStatus' },
    calc:   { 'Days overdue': '=IF(OR($A{r}="",$G{r}<>"Due"),"",MAX(0,TODAY()-$A{r}))' },
    widths: { 'Notes': 320 }
  },

  daily: {
    name: 'Daily Report', section: 'money', kind: 'daily'
  },

  earnings: {
    name: 'Daily Earnings', section: 'money',
    title: 'DAILY EARNINGS — total OnlyFans revenue, per creator, per day',
    help:  'The ad sheet only knows revenue it can attribute to a tracking link. TOTAL daily earnings — chatting, PPV, tips, everything — is not in any connected source, so it is logged here. Five numbers a morning; the Daily Report and the 09:00 email both read them.',
    headers: ['Date', 'Creator', 'Total earnings $', 'Pending $', 'New subs', 'Notes'],
    dates:  ['Date'],
    money:  ['Total earnings $', 'Pending $'],
    int:    ['New subs'],
    widths: { 'Creator': 150, 'Total earnings $': 140, 'Pending $': 120, 'Notes': 320 },
    notes:  { 'Total earnings $': 'Everything she earned that day, not just ad-attributed. This is the number Luca judges the salary on.',
              'Pending $': 'Luca p.18 — the benchmark is $5,000 pending per salary.' }
  },

  revenue: {
    name: 'Revenue & Targets', section: 'money',
    title: 'REVENUE & TARGETS — per creator, per week',
    help:  'The benchmarks are Luca\'s: $5,000 pending per salary at a $5 LTV ≈ 153 subs/day (p.18), and any managed account clears $10k/month (p.12). Change them on Config.',
    headers: ['Week starting', 'Creator', 'Type', 'OF pending $', 'Total earnings $',
              'Subs added', 'Subs/day', 'New free fans', 'Internal promo rev $', 'Ads rev $',
              'Scripts sent', 'Script revenue $', '$ / script', 'vs $25 target',
              'vs $5k pending', 'vs 153 subs/day', 'Monthly pace $', 'Above $10k floor', 'Notes'],
    dates:  ['Week starting'],
    money:  ['OF pending $', 'Total earnings $', 'Internal promo rev $', 'Ads rev $',
             'Script revenue $', '$ / script', 'Monthly pace $'],
    int:    ['Subs added', 'New free fans', 'Scripts sent'],
    lists:  { 'Type': 'creatorType' },
    calc:   { 'Subs/day':        '=IF($B{r}="","",N($F{r})/7)',
              '$ / script':      '=IF(OR($B{r}="",N($K{r})=0),"",N($L{r})/$K{r})',
              'vs $25 target':   '=IF($M{r}="","",IF($M{r}>=CFG_SCRIPT_TARGET_AVG,"OK","under"))',
              'vs $5k pending':  '=IF($B{r}="","",IF(N($D{r})*(30/7)>=CFG_PENDING_PER_SALARY,"OK","under"))',
              'vs 153 subs/day': '=IF($B{r}="","",IF(N($G{r})>=CFG_SUBS_PER_DAY,"OK","under"))',
              'Monthly pace $':  '=IF($B{r}="","",N($E{r})*(30/7))',
              'Above $10k floor':'=IF($B{r}="","",IF($Q{r}>=CFG_MANAGED_FLOOR,"OK","BELOW"))' },
    widths: { 'Notes': 300 }
  },

  shoots: {
    name: 'Shoots', section: 'content',
    title: 'CONTENT SHOOTS — booking, logistics, on-set QC',
    help:  'Luca p.16: if she films the scripts, tease and reels wrong, we paid for nothing. Decide before the shoot who is on set — you or Sophie.',
    headers: ['Shoot date', 'Creator', 'Location type', 'Address / Airbnb', 'Booked',
              'Booking cost $', 'Content list sent', 'Scripts to film', 'Teases to film',
              'Reels to film', 'Pics to shoot', 'On-set QC by', 'Shoot status',
              'Content received', 'Days to deliver', 'Refilm needed', 'Notes'],
    checks: ['Booked', 'Content list sent', 'Refilm needed'],
    dates:  ['Shoot date', 'Content received'],
    money:  ['Booking cost $'],
    int:    ['Scripts to film', 'Teases to film', 'Reels to film', 'Pics to shoot'],
    lists:  { 'Location type': 'locationType', 'Shoot status': 'shootStatus' },
    calc:   { 'Days to deliver': '=IF(OR($A{r}="",$N{r}=""),"",$N{r}-$A{r})' },
    widths: { 'Address / Airbnb': 240, 'Notes': 300 }
  },

  qc: {
    name: 'Content QC', section: 'content',
    title: 'CONTENT QC — model → you → editors → you → live',
    help:  'Nothing goes out unchecked. Editing vocabulary: FaceApp young2 / young3 / teen, tattoo removal, waist, AI background, nipple blur, pussy blur, GIF.',
    headers: ['Received', 'Creator', 'Batch / asset', 'Type', 'Source', 'QC1 by', 'QC1 verdict',
              'Refilm reason', 'Sent to editors', 'Editing needs', 'Edits received',
              'Days in edit', 'Final QC by', 'Final verdict', 'Approved for use',
              'Flagged to', 'Flag note', 'Status'],
    checks: ['Approved for use'],
    dates:  ['Received', 'Sent to editors', 'Edits received'],
    lists:  { 'Type': 'contentType', 'Source': 'contentSource',
              'QC1 verdict': 'qcVerdict', 'Final verdict': 'qcVerdict', 'Status': 'qcStatus' },
    calc:   { 'Days in edit': '=IF(OR($B{r}="",$I{r}=""),"",IF($K{r}="",TODAY()-$I{r},$K{r}-$I{r}))' },
    widths: { 'Batch / asset': 200, 'Editing needs': 240, 'Refilm reason': 220, 'Flag note': 260 },
    notes:  { 'Flagged to': 'Luca p.17: flag to Finn, to Luca, and to the model when content is not good enough — and say what to change.' }
  },

  scripts: {
    name: 'Scripts', section: 'content',
    title: 'SCRIPTS — one row per script, per account',
    help:  'Accounts that share internally-swapped fans must not run the same script (Luca p.8 #12). "Also live on" is what makes that visible.',
    headers: ['Creator', 'Script name', 'Filmed', 'State', 'Price $', 'Pics', 'Teasers',
              'Sends', 'Unlocks', 'Unlock %', 'Revenue $', '$ / send', 'vs $25 target',
              'Personalised', 'Also live on', 'Last rotated', 'Days since rotated',
              'Verdict', 'Notes'],
    checks: ['Personalised'],
    dates:  ['Filmed', 'Last rotated'],
    money:  ['Price $', 'Revenue $', '$ / send'],
    pct:    ['Unlock %'],
    int:    ['Pics', 'Teasers', 'Sends', 'Unlocks'],
    lists:  { 'State': 'scriptState', 'Verdict': 'scriptVerdict' },
    calc:   { 'Unlock %':          '=IF(OR($A{r}="",N($H{r})=0),"",N($I{r})/$H{r})',
              '$ / send':          '=IF(OR($A{r}="",N($H{r})=0),"",N($K{r})/$H{r})',
              'vs $25 target':     '=IF($L{r}="","",IF($L{r}>=CFG_SCRIPT_TARGET_AVG,"OK","under"))',
              'Days since rotated':'=IF(OR($A{r}="",$P{r}=""),"",TODAY()-$P{r})' },
    widths: { 'Script name': 200, 'Also live on': 200, 'Notes': 280 }
  },

  captions: {
    name: 'Caption Bank', section: 'content',
    title: 'CAPTION BANK — rotate, never repeat',
    help:  'Luca p.21 #5–7: new captions added and reviewed constantly, captions that play into the model\'s niche, and a batch to rotate so stories never repeat. Amber = used too recently to use again.',
    headers: ['Caption', 'Channel', 'Angle / niche', 'Fits creator', 'Added', 'Added by',
              'Times used', 'Last used', 'Days since used', 'Clicks', 'Subs', 'Status', 'Notes'],
    dates:  ['Added', 'Last used'],
    int:    ['Times used', 'Clicks', 'Subs'],
    lists:  { 'Channel': 'channel', 'Status': 'captionStatus' },
    calc:   { 'Days since used': '=IF(OR($A{r}="",$H{r}=""),"",TODAY()-$H{r})' },
    widths: { 'Caption': 420, 'Angle / niche': 180, 'Notes': 240 }
  },

  // Pairings that are a standing decision rather than a weekly allocation.
  // Luca, Internal Promo Plan C28:D32: salary SFS with each other stays up
  // permanently, and the named promoters keep 1–3 permanent salary posts.
  permanent: {
    name: 'Permanent SFS', section: 'promo',
    title: 'PERMANENT SFS — the pairings that stay up',
    help:  'A pairing here is placed every day and NEVER cleared or reshuffled by ' +
           '"Set up the whole week" — it shows as Permanent on the schedule. Promoted ' +
           'can be a creator, or the words "Any salary" when the rule is a count rather ' +
           'than a pairing ("1–3 salary SFS can stay permanently"). Untick Active to ' +
           'put those slots back into the weekly rotation.',
    headers: ['Promoter', 'Promoted', 'Channel', 'Slots', 'Per', 'Active',
              'Since', 'Review by', 'Notes'],
    lists:  { 'Channel': 'permChannel', 'Per': 'permPer' },
    checks: ['Active'],
    int:    ['Slots'],
    dates:  ['Since', 'Review by'],
    widths: { 'Promoter': 150, 'Promoted': 150, 'Channel': 90, 'Slots': 70,
              'Per': 70, 'Notes': 420 },
    notes:  { 'Slots': 'How many of this promoter\'s slots are held permanently. Her cadence is fixed — 4 feed, 2 story, 3 MM a day — so 4 in Feed means her whole feed is this rule and nothing else can be scheduled from her page.',
              'Per':   '"day" holds the slots every day. "week" holds them on the first N days only — which is how "1–3 permanent feed per week" is meant to read.',
              'Promoted': 'A creator name, or "Any salary" to let the rotation pick from the salary tier and move round it day to day.' }
  },

  promoPlan: {
    name: 'Internal Promo Plan', section: 'promo',
    title: 'INTERNAL PROMO PLAN — the weekly allocation decision',
    help:  'Admin schedules the week, Liz/Lance approve Monday/Tuesday (Luca p.13). ' +
           'Every number here is PER DAY — "6" in Feed means she is promoted on 6 feed ' +
           'posts every day of the week, 42 across the week. Each column has a fixed ' +
           'daily total to fill: Feed = 4 × live accounts, Story = 2 ×, MM = 3 ×. ' +
           'Generate promo week tells you whether your numbers add up to it.',
    headers: ['Week starting', 'Creator', 'Slots / day', 'Slots locked', 'Feed', 'Story', 'MM',
              'Permanent feed SFS', 'Live SFS $', 'Prev-week slots', 'Prev-week $ / slot',
              'Recommendation', 'Approved by', 'Approved on', 'Scheduled by', 'Notes'],
    // Renamed from "Slots this week" once it was clear the team allocates per
    // day, not per week. Mapped so the numbers already typed survive a rebuild.
    renames: { 'Slots this week': 'Slots / day', 'Max slots': 'Live SFS $' },
    checks: ['Permanent feed SFS', 'Slots locked'],
    dates:  ['Week starting', 'Approved on'],
    money:  ['Prev-week $ / slot', 'Live SFS $'],
    int:    ['Slots / day', 'Feed', 'Story', 'MM', 'Prev-week slots'],
    lists:  { 'Recommendation': 'promoRec' },
    // "Live SFS $" reads the OnlyFans pull directly, so it moves the moment
    // "Pull ALL money from OnlyFans now" runs — no weekly baseline needed. It
    // is every internal-SFS tracking link sitting on HER page, which is exactly
    // the money her promo slots brought in.
    //
    // The two "Prev-week" columns are the settled comparison and need Monday's
    // baseline before they say anything. $/slot reads column 4 of the SFS
    // Weekly Report; it used to read column 8, which is Paid subs — a count of
    // people, formatted as dollars, in a column labelled $ / slot.
    calc:   { 'Live SFS $':         '=IFERROR(IF($B{r}="","",SUMIFS(\'_LinkStats\'!$I$2:$I,\'_LinkStats\'!$B$2:$B,$B{r},\'_LinkStats\'!$E$2:$E,"Internal SFS")),"")',
              'Prev-week slots':    '=IFERROR(IF($B{r}="","",VLOOKUP($B{r},\'SFS Weekly Report\'!$A$4:$L$40,2,FALSE)),"")',
              'Prev-week $ / slot': '=IFERROR(IF($B{r}="","",VLOOKUP($B{r},\'SFS Weekly Report\'!$A$4:$L$40,4,FALSE)),"")' },
    widths: { 'Notes': 300, 'Slots locked': 90 },
    notes:  { 'Slots / day': 'How many promotions she RECEIVES a day. Feed, Story and MM are worked out from it, in the 4:2:3 ratio the accounts actually post at.',
              'Slots locked': 'Ticked = this number is yours and "Set up the whole week" will never overwrite it; it only recalculates Feed / Story / MM around it. It ticks itself the moment you type a number that disagrees with the three columns beside it. Untick to hand the creator back to the allocator.' }
  },

  // The three schedules, in the exact shape the team already fills in
  // (UNCVRD Cross-Promotion Schedule). Bringing them in here is the point:
  // they currently live in an uploaded .xlsx that no formula and no script can
  // read, which is what stops the SFS report updating itself.
  feed: {
    name: 'FEED Promo SFS Internal', section: 'promo',
    title: 'FEED PROMO — 4 posts per day, 1 day expire',
    help:  'One row per posting account per day, 4 promotions each. PASTE the tracking link into the Tracking Link cell — the "$ this week" beside it then reads that link\'s takings since Monday straight from the OnlyFans pull.',
    headers: ['Date', 'Day', 'Model (Promoter)', '1st Promote', 'Caption 1', 'Link 1',
              'Status 1', 'Revenue 1', '2nd Promote', 'Caption 2', 'Link 2',
              'Status 2', 'Revenue 2', '3rd Promote', 'Caption 3', 'Link 3',
              'Status 3', 'Revenue 3', '4th Promote', 'Caption 4', 'Link 4',
              'Status 4', 'Revenue 4'],
    display: ['Date', 'Day', 'Model (Promoter)', '1st Promote', 'Caption',
              'Tracking Link', 'Status', '$ this week', '2nd Promote', 'Caption',
              'Tracking Link', 'Status', '$ this week', '3rd Promote', 'Caption',
              'Tracking Link', 'Status', '$ this week', '4th Promote', 'Caption',
              'Tracking Link', 'Status', '$ this week'],
    // OnlyFans allows 3 feed posts a day, so POST 4 is deliberately unused — the
    // columns stay for the history already in them. The three that are used sit
    // 8 hours apart, which is what holds 3 live around the clock.
    groups: [{ from: '1st Promote', to: 'Revenue 1', label: 'POST 1 · 00:00 · SFS',      bg: '#c27ba0' },
             { from: '2nd Promote', to: 'Revenue 2', label: 'POST 2 · 08:00 · HER OWN',  bg: '#8e7f88' },
             { from: '3rd Promote', to: 'Revenue 3', label: 'POST 3 · 16:00 · SFS',      bg: '#a64d79' },
             { from: '4th Promote', to: 'Revenue 4', label: 'POST 4 · NOT USED (OF allows 3/day)', bg: '#6b6b6b' }],
    dates:  ['Date'],
    money:  ['Revenue 1', 'Revenue 2', 'Revenue 3', 'Revenue 4'],
    lists:  { 'Status 1': 'postStatus', 'Status 2': 'postStatus', 'Status 3': 'postStatus', 'Status 4': 'postStatus' },
    calc:   { 'Day': '=IF($A{r}="","",TEXT($A{r},"dddd"))',
    // Money this link has taken SINCE MONDAY: the live pull minus the Monday
    // baseline — never a lifetime total. If the baseline tab is empty the
    // subtraction would be "minus nothing" and every link would quietly report
    // everything it has ever earned, so that case says so out loud instead. OnlyFans attributes to the LINK, not the post, so all seven
    // days of a pairing share one figure — it is "what this pairing has earned
    // this week", not "what this post earned". Do not sum the column.
              'Revenue 1': '=IF($F{r}="","",IF(COUNTA(\'_LinkBase\'!$D$2:$D)=0,"— no baseline —",IFERROR(SUMIFS(\'_LinkStats\'!$I$2:$I,\'_LinkStats\'!$D$2:$D,$F{r}),0)-IFERROR(SUMIFS(\'_LinkBase\'!$I$2:$I,\'_LinkBase\'!$D$2:$D,$F{r}),0)))',
              'Revenue 2': '=IF($K{r}="","",IF(COUNTA(\'_LinkBase\'!$D$2:$D)=0,"— no baseline —",IFERROR(SUMIFS(\'_LinkStats\'!$I$2:$I,\'_LinkStats\'!$D$2:$D,$K{r}),0)-IFERROR(SUMIFS(\'_LinkBase\'!$I$2:$I,\'_LinkBase\'!$D$2:$D,$K{r}),0)))',
              'Revenue 3': '=IF($P{r}="","",IF(COUNTA(\'_LinkBase\'!$D$2:$D)=0,"— no baseline —",IFERROR(SUMIFS(\'_LinkStats\'!$I$2:$I,\'_LinkStats\'!$D$2:$D,$P{r}),0)-IFERROR(SUMIFS(\'_LinkBase\'!$I$2:$I,\'_LinkBase\'!$D$2:$D,$P{r}),0)))',
              'Revenue 4': '=IF($U{r}="","",IF(COUNTA(\'_LinkBase\'!$D$2:$D)=0,"— no baseline —",IFERROR(SUMIFS(\'_LinkStats\'!$I$2:$I,\'_LinkStats\'!$D$2:$D,$U{r}),0)-IFERROR(SUMIFS(\'_LinkBase\'!$I$2:$I,\'_LinkBase\'!$D$2:$D,$U{r}),0)))' },
    promoterCol: 'Model (Promoter)',
    widths: { '1st Promote': 125,
              'Caption 1': 300,
              'Link 1': 190,
              'Status 1': 115,
              'Revenue 1': 85,
              '2nd Promote': 125,
              'Caption 2': 300,
              'Link 2': 190,
              'Status 2': 115,
              'Revenue 2': 85,
              '3rd Promote': 125,
              'Caption 3': 300,
              'Link 3': 190,
              'Status 3': 115,
              'Revenue 3': 85,
              '4th Promote': 125,
              'Caption 4': 300,
              'Link 4': 190,
              'Status 4': 115,
              'Revenue 4': 85,
              'Model (Promoter)': 150 },
    notes:  { 'Link 1': 'Paste the tracking link here. "$ this week" next to it matches this URL against the OnlyFans pull and shows what it has taken since Monday, so the number appears on its own once the link is in.' }
  },

  story: {
    name: 'Story Promo Schedule', section: 'promo',
    title: 'STORY PROMO — 4 a day, 6 hours apart, so 4 are always live',
    help:  'A story lasts 24 hours. Four posted six hours apart means the moment one drops off, ' +
           'the next day\'s story in the same slot replaces it — the account never goes below ' +
           'four live. Two are HER OWN content and two are SFS, alternating, so her page never ' +
           'reads as nothing but other girls. Only the SFS columns are scheduled here; the ' +
           'HER OWN columns are hers to fill. Post at the time on the column, not all at once.',
    headers: ['Date', 'Promoter', '1st Promoting Model', 'Done 1', '2nd Promoting Model',
              'Done 2', '3rd Promoting Model', 'Done 3', '4th Promoting Model', 'Done 4', 'Note'],
    display: ['Date', 'Promoter', '00:00 · HER OWN', 'Up? ✓', '06:00 · SFS', 'Up? ✓',
              '12:00 · HER OWN', 'Up? ✓', '18:00 · SFS', 'Up? ✓', 'Note'],
    checks: ['Done 1', 'Done 2', 'Done 3', 'Done 4'],
    dates:  ['Date'],
    promoterCol: 'Promoter',
    widths: { 'Promoter': 150, '1st Promoting Model': 170, '2nd Promoting Model': 170,
              '3rd Promoting Model': 170, '4th Promoting Model': 170, 'Note': 260 },
    notes:  { 'Note': 'For the things a checkbox cannot say — "can\'t tag @blue" and so on.',
              '1st Promoting Model': 'Goes up at 00:00 and expires 00:00 tomorrow, when tomorrow\'s STORY 1 replaces it. Post it late and you leave a hole in the cover.',
              '4th Promoting Model': 'Goes up at 18:00. The four times are six hours apart on purpose — that is what keeps four live around the clock.' }
  },

  mm: {
    name: 'MM Promo Schedule', section: 'promo',
    title: 'MASS-DM PROMO — by shift',
    help:  'One row per mass DM. Paste the tracking link in yourself. Shift matches the chatting rota, so a gap in a shift is visible.',
    headers: ['Date', 'Promoting Creator', 'Promoted Creator', 'IP Tracker', 'Tracking Link',
              'Caption', 'Content', 'Open content', 'Status', 'Shift'],
    dates:  ['Date'],
    lists:  { 'Status': 'postStatus', 'Shift': 'mmShift' },
    // The file is chosen for you from the promoted creator's Drive folder, and
    // the link resolves from the name — so the VA opens one cell and sends what
    // is in it, instead of going looking for something of hers.
    calc:   { 'Open content':
              '=IF($G{r}="","",IFERROR(HYPERLINK(VLOOKUP($G{r},\'_DriveContent\'!$B:$D,3,FALSE),"open"),"— not indexed —"))' },
    promoterCol: 'Promoting Creator',
    widths: { 'Promoting Creator': 150, 'Promoted Creator': 150, 'Tracking Link': 220,
              'Caption': 380, 'Content': 240, 'Open content': 90, 'Shift': 120 },
    notes:  { 'Content': 'Filled in by "Attach content to this week\'s DMs" from the PROMOTED creator\'s Drive folder, rotating so the same file does not go out twice in a row. Type over it to choose something else.',
              'Open content': 'Opens the file in Drive. "— not indexed —" means the name in Content is not in the index: run "Index the content Drive" again.' }
  },

  // Both ad tabs are built by AdViews.gs, not mirrored. The raw Data and Cohort
  // tabs are imported into hidden helpers so the filters here are real.
  adStats:   { name: 'Weekly AD Stats', section: 'ads', kind: 'ad' },
  adSummary: { name: 'ADs Summary',     section: 'ads', kind: 'ad' },

  // Both SFS tabs are built by SfsViews.gs from hidden raw imports, same as
  // the ad tabs — not mirrored.
  sfsReport:  { name: 'SFS Weekly Report', section: 'promo', kind: 'sfs' },
  sfsSummary: { name: 'SFS Summary',       section: 'promo', kind: 'sfs' },

  external: {
    name: 'External SFS', section: 'promo',
    title: 'EXTERNAL SFS — swaps with pages outside the network',
    help:  'Luca p.5 named Tom huzz and Dan, and asked for swaps to be set up for Blue, Marissa, Emma, Antonella and Ella. Reciprocated = they actually posted ours.',
    headers: ['Partner', 'Contact', 'Their platform', 'Their size', 'Our creator',
              'Proposed date', 'Agreed', 'Our post date', 'Our post link',
              'Their post date', 'Their post link', 'Reciprocated', 'Clicks',
              'Subs gained', 'Revenue $', '$ / sub', 'Verdict', 'Next action', 'Notes'],
    checks: ['Reciprocated'],
    dates:  ['Proposed date', 'Our post date', 'Their post date'],
    money:  ['Revenue $', '$ / sub'],
    int:    ['Their size', 'Clicks', 'Subs gained'],
    lists:  { 'Agreed': 'swapStatus' },
    calc:   { '$ / sub': '=IF(OR($A{r}="",N($N{r})=0),"",N($O{r})/$N{r})' },
    widths: { 'Our post link': 220, 'Their post link': 220, 'Next action': 240, 'Notes': 260 }
  },

  links: {
    name: 'Tracking Links', section: 'promo',
    title: 'TRACKING LINKS — promoted creator × promoter',
    help:  'The link always lives on the PROMOTED creator\'s page; the code identifies the promoter who sent the traffic. Rows marked "n/a" still need creating. Use the lookup above — do not hunt.',
    headers: ['Promoted creator', 'Promoter / source', 'Source type', 'Tracking link',
              'Clicks', 'Subs', 'Revenue', 'Subs this week', '$ this week',
              'Created', 'Active', 'Notes'],
    display: ['Promoted creator', 'Promoter / source', 'Source type', 'Tracking link',
              'Clicks', 'Subs', 'Revenue', 'Subs this week', '$ this week',
              'Created', 'Active', 'Notes'],
    int:    ['Clicks', 'Subs', 'Subs this week'],
    money:  ['Revenue', '$ this week'],
    checks: ['Active'],
    dates:  ['Created'],
    sourceCol: 'Promoter / source',
    // Christos's rule, in one formula: a source that is a creator on the roster
    // means the link is internal SFS; anything else is a paid network.
    // Lifetime Clicks/Subs/Revenue are written by the nightly pull. These two
    // are (now − Monday's baseline): what this exact pairing did THIS week.
    calc:   { 'Source type':
              '=IF($B{r}="","",IF(COUNTIF(CRM_Roster,$B{r})>0,"Internal SFS","Paid ad"))',
              'Subs this week':
              '=IF($D{r}="","",IFERROR(SUMIFS(\'_LinkStats\'!$H:$H,\'_LinkStats\'!$D:$D,$D{r})' +
              '-SUMIFS(\'_LinkBase\'!$H:$H,\'_LinkBase\'!$D:$D,$D{r}),""))',
              '$ this week':
              '=IF($D{r}="","",IFERROR(SUMIFS(\'_LinkStats\'!$I:$I,\'_LinkStats\'!$D:$D,$D{r})' +
              '-SUMIFS(\'_LinkBase\'!$I:$I,\'_LinkBase\'!$D:$D,$D{r}),""))' },
    // There was a second `sourceCol: 'Promoter'` here. Later keys win in an
    // object literal, so it silently replaced the real one above — and no
    // column is called "Promoter", so the source dropdown was never applied to
    // anything. The promoter cell has been free text since.
    widths: { 'Promoter / source': 150, 'Source type': 110, 'Tracking link': 270,
              'Clicks': 80, 'Subs': 70, 'Revenue': 95, 'Subs this week': 105,
              '$ this week': 100, 'Notes': 220 },
    notes:  { '$ this week': 'Cumulative revenue now, minus Monday\'s baseline. This is what this promoted-by-promoter pairing earned THIS week — the number that should drive next week\'s slots.',
              'Clicks': 'Lifetime, straight from the OnlyFans API. Blank means the API has no link at that URL — usually a typo or a link that was never created.',
              'Promoter / source': 'A creator name means internal SFS. A network name — TrafficHaus, Meta, OnlyFinder — means paid. Source type works that out for you.' },
    lookup: true
  },

  whales: {
    name: 'Whales', section: 'whale',
    title: 'WHALES — coverage and transfers onto salary accounts',
    help:  'Sensitive. Luca p.21 #13: whales are moved internally without the models knowing — restrict this tab (Data → Protect sheet) before sharing the file. Chat quality is not tracked here; only coverage and transfer state.',
    headers: ['Fan alias', 'Fan ID', 'Current account', 'Home account (target)',
              'Monthly spend $', 'Lifetime spend $', 'Tier', 'Assigned chatter',
              'KYC — whiteknight', 'KYC — model', 'Last AM message', 'Last non-sexual touch',
              'Days since touch', 'Touch SLA', 'Transfer status', 'Transfer started',
              'Transferred on', 'Spend 30d after', 'Retained', 'Notes'],
    checks: ['KYC — whiteknight', 'KYC — model', 'Retained'],
    dates:  ['Last AM message', 'Last non-sexual touch', 'Transfer started', 'Transferred on'],
    money:  ['Monthly spend $', 'Lifetime spend $', 'Spend 30d after'],
    lists:  { 'Transfer status': 'whaleTransfer' },
    calc:   { 'Tier':             '=IF($A{r}="","",IF(N($E{r})>=CFG_WHALE_TIER_1,"MAJOR",IF(N($E{r})>=1000,"High",IF(N($E{r})>=500,"Mid","Low"))))',
              'Days since touch': '=IF(OR($A{r}="",$L{r}=""),"",TODAY()-$L{r})',
              'Touch SLA':        '=IF($M{r}="","",IF($M{r}<=CFG_WHALE_TOUCH_SLA_DAYS,"OK","LATE"))' },
    widths: { 'Notes': 300 }
  },

  tests: {
    name: 'Tests', section: 'improve',
    title: 'TESTS — everything Luca listed as needing testing',
    help:  'p.18: paid vs free welcome message, welcome message with a picture, pricing down to a $25 average per script, more pics, more teasers, niching. One row per test, one winner, then roll it out.',
    headers: ['Test', 'Area', 'Hypothesis', 'Accounts', 'Variant A', 'Variant B', 'Metric',
              'Start', 'End', 'Days', 'Result A', 'Result B', 'Winner', 'Rolled out to',
              'Owner', 'Status', 'Notes'],
    dates:  ['Start', 'End'],
    lists:  { 'Area': 'area', 'Status': 'testStatus' },
    calc:   { 'Days': '=IF(OR($A{r}="",$H{r}=""),"",IF($I{r}="",TODAY()-$H{r},$I{r}-$H{r}))' },
    widths: { 'Test': 240, 'Hypothesis': 300, 'Variant A': 200, 'Variant B': 200, 'Notes': 260 }
  },

  flags: {
    name: 'Improvements & Flags', section: 'improve',
    title: 'IMPROVEMENTS & FLAGS — the list Luca wants raised',
    help:  'Luca p.7, in capitals: urgently flag anything you are aware of that is not up to speed, so he can allocate his time to it. Seeded with every improvement named in the August doc.',
    headers: ['Raised', 'Area', 'Creator / account', 'Issue', 'Severity', 'Owner', 'Due',
              'Days open', 'Status', 'Flag to Luca', 'Flagged on', 'Resolution', 'Closed'],
    checks: ['Flag to Luca'],
    dates:  ['Raised', 'Due', 'Flagged on', 'Closed'],
    lists:  { 'Area': 'area', 'Severity': 'severity', 'Status': 'flagStatus' },
    calc:   { 'Days open': '=IF(OR($D{r}="",$A{r}=""),"",IF($M{r}="",TODAY()-$A{r},$M{r}-$A{r}))' },
    widths: { 'Issue': 420, 'Resolution': 300 }
  },

  research: {
    name: 'Market Research', section: 'improve',
    title: 'MARKET RESEARCH — what other pages are doing',
    help:  'Luca p.17: constant research on OF and the SEO sites — the pictures they use, the captions they use. Anything worth trying becomes a row on Tests.',
    headers: ['Date', 'Source', 'Page / competitor', 'Category', 'What they do',
              'Link / screenshot', 'Idea', 'Worth testing', 'Test created', 'Notes'],
    checks: ['Worth testing', 'Test created'],
    dates:  ['Date'],
    lists:  { 'Category': 'researchCat' },
    widths: { 'What they do': 360, 'Idea': 300, 'Link / screenshot': 220 }
  },

  config: {
    name: 'Config', section: 'config', kind: 'config'
  }
};

/**
 * Tabs that used to exist and should not any more. installCRM deletes one if
 * it is empty; if anyone has typed into it, it is hidden and reported instead,
 * because a rebuild should never be the thing that loses someone's work.
 */
var RETIRED_TABS = ['Pipeline'];

/** Tab order in the strip, left to right. */
var TAB_ORDER = ['start', 'dash', 'creators', 'onboarding', 'daily', 'earnings', 'payments',
                 'revenue', 'shoots', 'qc', 'scripts', 'captions', 'promoPlan', 'permanent',
                 'feed', 'story', 'mm',
                 'sfsReport', 'sfsSummary', 'external', 'links', 'adStats', 'adSummary',
                 'whales', 'tests', 'flags', 'research', 'config'];

// ── Config tab defaults ─────────────────────────────────────────────────────
//
// Each becomes a named range CFG_<key>, so formulas read CFG_MANAGED_FLOOR
// rather than Config!$C$14.

function configDefaults_() {
  return [
    ['AD_SHEET_ID', 'Ad sheet ID (Weekly Stats, Time to Profit)',
     '1CZswouM2eXPTrU0prifEnwthbRFvO5hrr6a2BkgAQQ8',
     'Native Google Sheet — the two ad mirrors read from it.'],
    ['PROMO_REPORT_ID', 'Internal promo weekly report ID',
     '1_9emlQH0sYiL5YvBeeO1l-iK_KQ45PBhrFVfcNeuKfI',
     'Native Google Sheet — the two SFS mirrors read from it.'],
    ['OLD_PROMO_SCHEDULE', 'The old promo schedule file (reference only)',
     'https://docs.google.com/spreadsheets/d/1NltnGDtsMKX5YkyIQA6AIaHlNCsd2XIO/edit',
     'An uploaded .xlsx, so nothing can read it automatically. The Feed, Story and MM schedules now live in THIS file instead — copy any rows you still need across, then stop editing that one.'],

    ['EOM_SALARY_REVENUE', 'EOM revenue generated from salaries ($)', 50000, 'Luca p.2.'],
    ['NEW_SALARIES_TARGET', 'New salaries signed this month', 3, 'Luca p.2.'],
    ['PENDING_PER_SALARY', 'Pending per salary, minimum ($)', 5000, 'Luca p.18.'],
    ['ASSUMED_LTV', 'Assumed LTV ($)', 5, 'Luca p.18.'],
    ['SUBS_PER_DAY', 'Subs/day needed for that pending', 153, 'Luca p.18.'],
    ['MANAGED_FLOOR', 'Any managed account must clear ($/month)', 10000, 'Luca p.12.'],

    ['PROMO_FANS_PER_DAY', 'Swapped fans per account per day', 30, 'Luca p.12.'],
    ['PROMO_ACCOUNTS', 'Accounts in the internal swap', 10, 'Luca p.12.'],
    ['PROMO_REV_TARGET', 'Additional revenue from internal promo, 30–45d ($)', 50000, 'Luca p.12.'],
    ['FEED_POSTS_PER_DAY', 'Feed posts per account per day (OnlyFans cap)', 3,
     'OnlyFans allows 3 a day. Posted 8h apart with a 1-day expire, that holds exactly 3 live around the clock — plus any permanent posts, which never expire and are the only way to hold more than 3.'],
    ['FEED_SFS_PER_DAY', 'How many of those feed posts are SFS', 2,
     'Christos, Aug 2026: 2 SFS and 1 of her own each day. Only the SFS ones are scheduled; the third is hers to fill.'],
    ['PROMO_STORIES_PER_DAY', 'Story slots per account per day', 4,
     'Christos, Aug 2026: 4 live at all times. A story lasts 24h, so 4 posted 6h apart holds 4 up continuously.'],
    ['STORY_SFS_PER_DAY', 'How many of those stories are SFS', 2,
     'Two SFS and two of her own, alternating, so her stories are never four other girls in a row.'],
    ['MM_PER_DAY', 'Mass-DM promos per account per day', 3, 'Set by us, Aug 2026 — one per shift: Day, Evening, Late Evening.'],
    ['STORIES_PER_DAY', 'TOTAL stories per account per day', 7, 'Luca p.21 #1, p.23 #3 said 5, of which 2 were promo. Promo is now 4, so 7 keeps the same 3 non-promo stories a day.'],
    ['FEED_EXPIRE_HOURS', 'Feed post expires after N hours', 24, 'One-day expire, per the schedule title.'],
    ['STORY_EXPIRE_HOURS', 'Story expires after N hours', 24, 'OnlyFans stories are up for 24h.'],
    ['PROMO_FIRST_POST_HOUR', 'Hour the day\'s first promo goes up (0–23)', 0,
     'The rest follow at even spacing across 24h — 4 a day means 6h apart. Spacing is what keeps cover continuous: post all four together and you have four live for a day and none the next morning.'],

    ['CONTENT_DRIVE', 'Drive folder holding the promo content', '',
     'Paste the folder share link. One subfolder per creator, named exactly as she is spelled on Creators. Leave blank and each creator\'s own "Drive folder" cell is used instead.'],

    ['SCRIPT_TARGET_AVG', 'Target average per script send ($)', 25, 'Luca p.18.'],
    ['WHALE_TIER_1', 'Counts as a major whale at ($/month)', 3000, 'Luca p.8 #17.'],
    ['WHALE_TOUCH_SLA_DAYS', 'Max days between whale touchpoints', 1, 'Luca p.8 #15 — every morning.'],
    ['ONBOARDING_SLA_DAYS', 'Days from signed to live', 14, 'Set by us, not by Luca. Change it if 14 is wrong.'],
    ['QC_SLA_DAYS', 'Days from content received to approved', 3, 'Set by us.'],
    ['PIPELINE_TOUCH_SLA_DAYS', 'Max days a prospect goes untouched', 4, 'Set by us.'],

    ['OF_EARNINGS_DAYS', 'Days of earnings to pull each night', 14,
     'One API call per creator covers the whole window — the endpoint returns a daily series. Widen it to backfill.'],
    ['PAY_DAY', 'Salary pay day', 'Monday', 'Luca p.16.'],
    ['REMINDER_EMAIL', 'Where reminders are sent', Session.getActiveUser().getEmail() || '',
     'Leave blank to disable the emails.'],
    ['ESCALATE_TO', 'Who unresolved flags go to', 'Luca', '']
  ];
}
