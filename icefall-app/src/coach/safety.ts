/**
 * THE SYMPTOM SAFETY LAYER.
 *
 * Rule 3 of the coach roadmap, and it is absolute: SAFETY NEVER DEPENDS ON THE
 * MODEL. Everything in this file is plain code, runs before anything else, and
 * works with no network and no session.
 *
 * WHY IT IS A SEPARATE MODULE AND NOT A TENTH ENTRY IN THE RULE TABLE.
 * `RULES` in @/services/coach is consulted only when the model is skipped, and
 * `RULES.find` is first-match — so a symptom rule added at the end would be
 * beaten by the fatigue rule on "I cannot sleep, headache, vomiting at 4,200 m"
 * and answered with "fatigue after four sessions is a normal training
 * response". That sentence, to somebody with early HACE, is the worst thing
 * this app could say. A safety check has to sit ahead of BOTH coaches, not
 * inside one of them.
 *
 * WHY THERE ARE NO IMPORTS. Not tidiness — a guarantee. Nothing here can reach
 * `fetch`, Supabase, the model proxy or React state, so there is no build, no
 * tier, no signed-out session, no aeroplane mode and no dead endpoint in which
 * this file stops working. That is the whole point of it. If you find yourself
 * wanting the athlete's context in here, pass what you need in as an argument.
 *
 * WHAT IT IS NOT. It does not diagnose, it does not grade severity, and it
 * never gives training advice. Each category has ONE fixed message that says
 * what to do in its first sentence. A person reading this at 4,200 m with a
 * headache will not read a second paragraph before acting, so the instruction
 * goes first and the reasoning follows it.
 *
 * FALSE POSITIVES ARE A REAL FAILURE, NOT A SAFE DEFAULT. A layer that shouts
 * at everybody who says their legs are sore is a layer athletes learn to scroll
 * past, and then it is not there on the day it matters. "My legs are sore",
 * "I'm tired", "my knee aches after long descents" and "I was out of breath on
 * the climb" are training questions and must stay training questions. Weigh
 * every broadening of a pattern below against that.
 */

/* ---------------------------------------------------------------------------
 * Categories
 * ------------------------------------------------------------------------- */

export type SafetyCategory =
  | "stroke"
  | "chest-pain"
  | "breathing"
  | "bleeding"
  | "neurological"
  | "head-injury"
  | "altitude-severe"
  | "hypothermia"
  | "altitude-ams"
  | "fall-injury"
  | "frostbite";

/**
 * Priority order, most time-critical first. A message describing more than one
 * thing — and at altitude they usually do — gets the card for the most urgent
 * category, once. Two safety cards stacked on one question is noise at exactly
 * the moment noise is expensive.
 */
export const SAFETY_CATEGORIES: readonly SafetyCategory[] = [
  "stroke",
  "chest-pain",
  "breathing",
  "bleeding",
  "neurological",
  "head-injury",
  "altitude-severe",
  "hypothermia",
  "altitude-ams",
  "fall-injury",
  "frostbite",
];

export interface SafetyResponse {
  /** Which fixed message fired. For logging, and for the red team. */
  category: SafetyCategory;
  /** The fixed message. Never generated, never varied, never personalised. */
  body: string;
  /** Always set, so the caution strip renders on every safety answer. */
  disclaimer: string;
}

/* ---------------------------------------------------------------------------
 * The fixed messages
 *
 * House style: spare, direct, British English, no hedging, no exclamation
 * marks. First sentence is the instruction. The last line closes the training
 * conversation, because the one thing the coach must not do here is answer the
 * question that was actually asked.
 * ------------------------------------------------------------------------- */

export const SAFETY_DISCLAIMER =
  "ICEFALL is not a medical service and cannot assess you. This is fixed safety guidance, not a diagnosis. In an emergency call your local emergency number or mountain rescue.";

export const SAFETY_MESSAGES: Record<SafetyCategory, string> = {
  stroke:
    "Call emergency services now. A drooping face, a weak or dead arm, or speech that has gone slurred or muddled are stroke signs, and treatment is time-critical.\n\nNote the time the symptoms started and give that time to the operator. Keep the person sitting or lying down, give nothing to eat or drink, and do not wait to see whether it passes.\n\nICEFALL cannot help with this. Get them to a hospital.",

  "chest-pain":
    "Stop now and call emergency services. Chest pain, tightness or pressure — especially with breathlessness, sweating, nausea, or pain spreading into the arm, neck or jaw — is treated as a heart problem until a doctor says otherwise.\n\nSit down and stay still. Do not walk out, do not go higher, and do not let anyone talk you into finishing the day. In the mountains, call rescue and give them your position.\n\nICEFALL will not answer a training question while this is happening.",

  breathing:
    "Stop and call emergency services. Breathlessness at rest — gasping, unable to finish a sentence, or fighting for air while you are not moving — is an emergency at any altitude.\n\nSit upright, stay still, and get help moving before anything else. If you are high on a mountain, losing height is urgent, but make the call first.\n\nICEFALL will not answer a training question while this is happening.",

  bleeding:
    "Call emergency services and control the bleeding now. Press hard directly on the wound with whatever you have, hold the pressure without lifting to check, and add more dressing on top rather than replacing what is already there.\n\nKeep the person lying down and warm. Bleeding that is heavy, or that will not slow under firm pressure, is a rescue rather than a walk-out.\n\nICEFALL will not answer anything else until this is dealt with.",

  neurological:
    "Stop and get medical help now. Double vision or lost vision, a seizure, sudden confusion, numbness down one side, fainting or unresponsiveness are neurological emergencies wherever they happen.\n\nStay with the person, keep them still and warm, and call emergency services or mountain rescue. If you are high, descent matters, but make the call first.\n\nThere is no version of this where you push on. ICEFALL will not advise you further until a doctor has assessed it.",

  "head-injury":
    "Stop and get this assessed today. A blow to the head followed by loss of consciousness, confusion, repeated vomiting, a worsening headache, or a patchy memory of what happened needs a doctor.\n\nDo not keep climbing, do not descend alone, and do not sleep it off unwatched. Call emergency services or mountain rescue if the person is drowsy, confused, or getting worse rather than better.\n\nThere is no training question here.",

  "altitude-severe":
    "Go down now, and get medical help. Stumbling or loss of balance, confusion, a headache that will not lift, breathlessness at rest, or a cough bringing up froth or pink spit are signs of high-altitude cerebral or pulmonary oedema. Both kill quickly, and both are treated by losing height.\n\nDescend immediately — several hundred metres, tonight, not in the morning. Nobody descends alone. Call mountain rescue, and give oxygen if you are carrying it.\n\nNo training advice applies here. Descent and a doctor are the answer.",

  hypothermia:
    "Get them out of the wind and get help coming. Violent shivering, clumsiness, slurred speech, confusion, or shivering that has stopped while the person is still cold are hypothermia, and that last one is the serious one.\n\nShelter them, insulate them from the ground, replace wet layers, and handle them gently and horizontally. Warm sweet drinks only if they are fully awake and can swallow. Call mountain rescue if they are confused, drowsy, or not improving.\n\nDo not put them back on the move to warm up. That is not the fix here.",

  "altitude-ams":
    "Stop going up. A headache at altitude with nausea, vomiting, dizziness or broken sleep is acute mountain sickness until proven otherwise, and gaining more height is what turns it dangerous.\n\nRest where you are and gain no more height, including sleeping height. If it does not clear, or if any of these appear — a headache that will not lift, vomiting you cannot stay on top of, unsteadiness on your feet, breathlessness at rest, confusion — go down straight away and get medical help.\n\nTell whoever you are with. Do not take a painkiller and carry on alone.",

  "fall-injury":
    "Stop and take the weight off it. A fall followed by pain, deformity, or an inability to stand or bear weight is treated as a fracture until an X-ray says otherwise.\n\nSupport or splint it as it lies, keep the person warm, and call mountain rescue or emergency services if they cannot get out safely on their own. Moving a suspected fracture badly makes the injury worse.\n\nICEFALL will not build training around this. It needs a doctor first.",

  frostbite:
    "Stop and protect the area now. Skin that has gone white, grey, waxy or hard, or fingers and toes with no feeling left in them, is freezing tissue and it needs a doctor.\n\nGet out of the cold and the wind. Do not rub it, do not use direct heat, and do not thaw it if there is any chance of it freezing again before you are off the hill — refreezing does more damage than staying frozen. Rewarming is done in water at body temperature, under medical supervision wherever that is possible.\n\nICEFALL will not advise you on training or on going higher with this.",
};

/* ---------------------------------------------------------------------------
 * Normalisation
 *
 * Everything below matches against one flattened form of the question, so a
 * pattern only has to be written once. Accents, curly quotes, casing,
 * punctuation and stretched letters are removed here rather than being spelled
 * out eleven times in the patterns.
 * ------------------------------------------------------------------------- */

/**
 * Flatten a question into the form the patterns are written against.
 *
 * Exported because the next phase red-teams this file: when a phrasing slips
 * through, the first useful thing to see is what the matcher actually read.
 */
/**
 * Letters NFKD does not take apart. The accent strip handles é and ü; it does
 * nothing for a stroke through a letter or a ligature, and the old "keep a-z
 * only" rule then deleted them — which turned the Polish "głowa" into the
 * unmatchable "g owa". One list, applied before anything reads the text.
 */
const UNDECOMPOSED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\u0142/g, "l"], // ł
  [/\u00f8/g, "o"], // ø
  [/\u00df/g, "ss"], // ß
  [/\u0111/g, "d"], // đ
  [/\u00e6/g, "ae"], // æ
  [/\u0153/g, "oe"], // œ
  [/\u00fe/g, "th"], // þ
  [/\u00f0/g, "d"], // ð
  [/\u0131/g, "i"], // ı
  [/\u03c2/g, "\u03c3"], // Greek final sigma, so ...ος and ...οσ are one string
];

export function normaliseSymptomText(raw: string): string {
  // Decompose accents, then drop the combining marks: "vómito" and "vomito"
  // must be one string, or half the Spanish patterns never fire.
  let out = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [from, to] of UNDECOMPOSED) out = out.replace(from, to);

  return (
    out
      // Curly and typewriter apostrophes, then no apostrophes at all: "can't",
      // "can’t" and "cant" all become "cant", so patterns are written once.
      .replace(/['\u2018\u2019\u02bc\u0060\u00b4]/g, "")
      // Thousands separators INSIDE a number, before punctuation becomes space
      // — otherwise "4,200 m" reads as the two numbers 4 and 200 and the
      // altitude check never sees 4200.
      //
      // A SPACE IS ONE OF THEM. French and Polish write the height as "4 800 m"
      // and so does anyone typing on a French keyboard layout, and the separator
      // list here only knew about the full stop and the comma — so "je vomis à
      // 4 800 m d'altitude" read as the numbers 4 and 800, found no height, and
      // returned nothing at all. Narrow on purpose: it only joins a digit to a
      // group of EXACTLY three that no fourth digit follows, which is what a
      // thousands separator is and what "4 400s repeats" is not.
      .replace(/(\d)[.,\u00a0\u202f ](?=\d{3}(?!\d))/g, "$1")
      // Everything that is not a LETTER IN ANY SCRIPT, a digit or a space
      // becomes a space. This used to be /[^a-z0-9\s]/, which did not skip
      // Greek and Cyrillic — it deleted them, so a Greek sentence normalised to
      // the empty string and `checkSafety` returned null before a single
      // detector ran. Greek is one of this app's own languages. Silent total
      // erasure is the worst failure mode a safety layer has.
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      // "heeeeadache" -> "heeadache". Stretched letters are how a phrasing
      // slips past a literal match for no reason at all.
      .replace(/([a-z])\1{2,}/g, "$1$1")
      // "cannot" and "cant" are the same word, and people who are being careful
      // — or dictating — type the long one. Written once here rather than
      // spelled twice in thirty patterns.
      .replace(/\bcan ?not\b/g, "cant")
      .replace(/\bwill not\b/g, "wont")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Words that carry no meaning for a symptom but break every pattern that needs
 * two words to touch. "my chest feels A BIT tight" matched nothing while "my
 * chest feels tight" fired — one adverb, and the commonest one a person
 * minimising their own symptoms reaches for. Rather than opening an optional
 * slot inside thirty patterns, the gate runs a second time over the text with
 * these removed. It can only ever ADD a match, never remove one.
 */
const FILLER =
  /\b(?:really|very|quite|rather|fairly|pretty|somewhat|slightly|mildly|mild|slight|small|little|tiny|minor|light|a bit of a|a bit|bit of a|bit of|a little|little bit|kind of|kinda|sort of|sorta|just|actually|literally|proper|properly|all|only|even|maybe|probably|definitely|honestly|basically|absolutely|totally|completely|super|so|too|now|then|roughly)\b/g;

/**
 * Auxiliaries and relatives, removed for the same second pass. "my chest HAS
 * BEEN tight" and "a face THAT HAS dropped" both escaped while "my chest is
 * tight" and "her face has dropped" fired — the patterns allow one auxiliary
 * shape and people use another. Flattening them is cheaper and more complete
 * than listing every tense.
 */
const AUXILIARY = /\b(?:has|have|had|is|are|was|were|been|being|be|that|which|does|did|do)\b/g;

function reduceFillers(text: string): string {
  return text.replace(FILLER, " ").replace(AUXILIARY, " ").replace(/\s+/g, " ").trim();
}

/**
 * Repair adjacent-letter transpositions in the few phrases where missing the
 * message is worst. "chset pian" is "chest pain" with two letters swapped, and
 * that is what cold hands on a phone produce. Sorting a word's letters makes
 * every transposition of it identical, so this catches the whole class rather
 * than the two spellings the red team happened to try.
 *
 * DELIBERATELY A SHORT LIST. Sorted letters collide and nothing here checks a
 * dictionary, so this is only worth its false-positive risk on the phrases
 * that mean somebody is having a heart attack or cannot breathe. Everything
 * repaired here still goes through the normal detectors, negation strip and
 * false-positive guards — it is a spelling repair, not a bypass.
 */
const TRANSPOSE_CRITICAL = [
  "chest pain",
  "chest tight",
  "chest pressure",
  "cant breathe",
  "heart attack",
];

function sortLetters(word: string): string {
  return word.split("").sort().join("");
}

function repairTranspositions(text: string): string {
  const words = text.split(" ");
  for (const phrase of TRANSPOSE_CRITICAL) {
    const parts = phrase.split(" ");
    const signature = parts.map(sortLetters);
    for (let i = 0; i + parts.length <= words.length; i += 1) {
      let hit = true;
      for (let j = 0; j < parts.length; j += 1) {
        if (sortLetters(words[i + j]) !== signature[j]) {
          hit = false;
          break;
        }
      }
      if (hit) for (let j = 0; j < parts.length; j += 1) words[i + j] = parts[j];
    }
  }
  return words.join(" ");
}

/* ---------------------------------------------------------------------------
 * Negation
 *
 * "No chest pain, just sore legs" must not fire. But some of the most serious
 * things a person can report are PHRASED as negatives — "he is not breathing",
 * "she has stopped shivering", "I cannot feel my toes" — so a blunt negation
 * strip is itself a safety bug. The protected phrases are lifted out and held
 * while the strip runs, then put back.
 * ------------------------------------------------------------------------- */

/** Negatives that ARE the emergency. Never stripped. */
const PROTECTED =
  /\b(?:not breathing|not able to breathe|unable to breathe|cant breathe|cannot breathe|not responding|not responsive|unresponsive|not waking|wont wake|cant wake|not making (?:any )?sense|no pulse|no feeling|no sensation|no memory of|no recollection|lost all feeling|cant feel (?:my|his|her|their|the)|stopped shivering|no longer shivering|not shivering|cant stop shivering|cant stop the bleeding|wont stop bleeding|cant stop bleeding|cant walk|cant stand|cant weight bear|cant put weight|cant speak|cant get (?:his|her|my|their) words out|cant see|cant catch|cant get (?:my|his|her|their) breath|cant remember|cant stay awake|cant keep (?:(?:any|much|a|my|the|even|so much as)(?: a)?(?: single| bit of| drop of| sip of| mouthful of| bite of| scrap of)?\s+)?(?:anything|water|food|fluids?|liquids?|drink|drinks|it|a thing) down|not himself|not herself|not themselves|not with it|not answering|isnt answering|wont answer|not talking|not reacting|not slowing|not stopping|not clotting|wont slow|not letting up|not right in the head|not breathing properly|stopped breathing|isnt breathing|not moving|not even moving|no puedo respirar|no puedo moverme|nao consigo respirar|non riesco a respirare|je ne peux plus respirer|no siento (?:las|los|mis)?)\b/g;

/**
 * "I have never felt this breathless" is an intensifier, not a denial — the
 * lookahead keeps the negator from swallowing it.
 */
const NEGATOR =
  "(?:no|not|dont|didnt|doesnt|havent|hasnt|hadnt|isnt|arent|wasnt|werent|never|without|denies|denied|nothing|neither|none)";
const NEG_STOP =
  "(?:but|and|or|though|although|however|yet|so|because|while|when|then|if|until|since|just)";
/**
 * Head nouns for the things this file exists to catch. The negation window is
 * allowed to eat these while they sit right after the negator — "no chest
 * pain" is a denial — but not once it has already run past three other words.
 * "I dont want it again — chest pain, still" used to lose the word "chest" to
 * a window that started five words earlier, and that is the sentence somebody
 * types on the SECOND ask, after they have already been shown one safety card.
 */
const SYMPTOM_NOUN =
  "(?:chest|pain|blood|bleeding|breath|breathe|breathing|headache|head|numb|frostbite|seizure|stroke|face|arm|vomiting|dizzy|confused|unconscious|collapsed|fracture|broken|shivering|frozen)";
const NEGATION = new RegExp(
  // A negator plus three free words, then up to two more that must be neither a
  // conjunction nor a symptom — so "no headache but at 4,800" loses the
  // headache and keeps the altitude, while a symptom five words downstream of
  // an unrelated negative survives.
  `\\b${NEGATOR}\\b(?!\\s+(?:been|felt|seen)\\b)` +
    `(?:\\s+(?!${NEG_STOP}\\b|zzkeep)[a-z0-9]+){0,3}` +
    `(?:\\s+(?!${NEG_STOP}\\b|${SYMPTOM_NOUN}\\b|zzkeep)[a-z0-9]+){0,2}`,
  "g",
);

function stripNegations(text: string): string {
  const held: string[] = [];
  const guarded = text.replace(PROTECTED, (m) => {
    held.push(m);
    return ` zzkeep${held.length - 1}zz `;
  });
  return guarded
    .replace(NEGATION, " ")
    .replace(/zzkeep(\d+)zz/g, (_, i: string) => held[Number(i)] ?? " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------------------------------------------------------------------
 * Altitude context
 *
 * Several symptoms are only emergencies high up. A headache is a headache; a
 * headache at 4,800 m is the first sign of the thing that kills people on
 * expeditions. So this has to be generous about how somebody says where they
 * are — a number, a number in words, a camp, a named peak, or just "up high" —
 * while refusing to read a training distance as an altitude.
 * ------------------------------------------------------------------------- */

/** Phrases that carry a height without a number. */
const ALTITUDE_WORDS =
  /\b(?:altitude|acclimatis\w*|acclimatiz\w*|acclimation|elevation|above sea level|masl|base camp|campamento base|campo base|camp de base|basislager|oboz\w* bazow\w*|abc|high camp|camp (?:one|two|three|four|1|2|3|4|i|ii|iii|iv)|advanced base|up high|higher up|high up|at height|high altitude|extreme altitude|death zone|thin air|hypox\w*|the summit|summit day|summit push|on the mountain|bivi|bivvy|the col|south col|north col|the balcony|hillary step|lhotse face|western cwm|the bottleneck|the icefall|khumbu icefall|the hut|refuge|glacier|8000er|eight thousander|seven thousander|altura|altitud|daltitude|daltitud|dalt\u00e8re|hauteur)\b/;

/** Peaks people actually say. Not a database — a shortlist of common context. */
const ALTITUDE_PLACES =
  /\b(?:everest|lhotse|nuptse|makalu|cho oyu|manaslu|annapurna|dhaulagiri|kangchenjunga|ama dablam|island peak|mera peak|lobuche|pumori|baruntse|gokyo|ebc|khumbu|namche|lukla|thorong la|k2|broad peak|gasherbrum|nanga parbat|denali|aconcagua|kilimanjaro|kili|elbrus|vinson|carstensz|mont blanc|matterhorn|monte rosa|gran paradiso|weisshorn|eiger|jungfrau|rainier|whitney|orizaba|cotopaxi|chimborazo|huayna potosi|illimani|ojos del salado|stok kangri|toubkal|damavand|ararat|kazbek|khan tengri|pik lenin|muztagh|mustagh|kang yatse)\b/;

/**
 * A trip being PLANNED, not stood on. "Everest", "high camp" and "the hut" were
 * being matched anywhere in the sentence with nothing asking whether the
 * speaker was there — so a permit coming through, a booking, or nerves about a
 * 5am start all read as 4,800 m. A named place is only altitude context when
 * nothing in the sentence says the trip is still ahead. A NUMBER is never
 * discounted this way: if somebody types a height, they are at one.
 */
const PLAN_FRAME =
  /\b(?:permit|booked|booking|deposit|itinerary|applied|planning|plan for|planning to|thinking (?:about|of)|the thought of|the idea of|next (?:year|season|spring|summer|autumn|winter|month)|training for|train for|prep for|prepping for|ahead of|before (?:we|i) (?:go|leave|fly)|when (?:we|i) (?:go|get there)|the trip|this trip|our trip|hoping to|dreaming|excited about|nervous about|dreading|looking forward)\b/;

/**
 * A desk, an office, a sofa, a gym. Ordinary places at ordinary heights, where
 * "freezing" means the heating is off and "the hut" is next weekend's plan.
 */
const MUNDANE_SETTING =
  /\b(?:at (?:my|the) desk|in the office|at work|on the sofa|on the couch|at home|in the house|in the flat|in the car|in the van|on the (?:train|bus)|in the pub|at my computer|in the gym|at the gym|in the pool|on the drive|the whole drive)\b/;

/**
 * Training distances that would otherwise read as heights. "5,000 m repeats"
 * and "1,200 m of ascent" are not places anybody is standing.
 */
const DISTANCE_NOISE =
  /\b(?:ran|run|running|runs|rowed|row|rowing|swam|swim|swimming|cycled|cycling|rode|jogged|jogging|walked|hiked|covered|did|repeats?|reps?|intervals?|splits?|erg)\b[^a-z0-9]{0,4}(?:a |an |about |around |some |my |the )?\d{3,5}\s?(?:m|km|k|metres|meters|mile\w*)\b/g;
const ASCENT_NOISE =
  /\b\d{3,5}\s?(?:m|metres|meters|ft|feet)\s?(?:of )?(?:ascent|gain|vert|vertical|climbing|descent|elevation gain|down)\b/g;
const REPEATS_NOISE = /\b\d{3,5}\s?(?:m|metres|meters)\s?(?:repeats?|reps?|intervals?|splits?)\b/g;

/** Words for thousands, so "fourteen thousand feet" reads as a height. */
const WORD_THOUSANDS =
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty ?five|thirty)[ -]?thousand\b/;

/** Words that legitimately precede a bare number that IS a height. */
const HEIGHT_LEAD =
  /(?:at|to|above|around|about|near|nearly|over|past|up to|hit|reached|reaching|camped|camping|sleeping|slept|sat|stuck|altitude|elevation|height|were|are|im|hes|shes|theyre)$/;

function hasAltitudeContext(text: string): boolean {
  // A place name is weaker evidence than a number, and it is the only kind a
  // planning sentence produces. Discount it there; keep every number.
  const placeOnlyDiscounted = PLAN_FRAME.test(text) || MUNDANE_SETTING.test(text);
  if (!placeOnlyDiscounted && (ALTITUDE_WORDS.test(text) || ALTITUDE_PLACES.test(text)))
    return true;
  if (WORD_THOUSANDS.test(text)) return true;

  const cleaned = text
    .replace(DISTANCE_NOISE, " ")
    .replace(ASCENT_NOISE, " ")
    .replace(REPEATS_NOISE, " ");

  // 2,500 m is where acute mountain sickness starts being expected; 8,000 ft is
  // the same line in the units North American climbers use.
  // Unit names in the app's other languages too, and a lookahead rather than
  // \b so a Greek unit is not read as the end of a word. Longest first, so
  // "metres" is not matched as a bare "m" with "etres" left over.
  const numbers =
    /(\d{3,5})\s?(metres|meters|metros|metrow|metrach|\u03bc\u03b5\u03c4\u03c1\u03b1|masl|asl|feet|foot|ft|m)?(?![\p{L}\p{N}])/gu;
  for (let m = numbers.exec(cleaned); m !== null; m = numbers.exec(cleaned)) {
    const value = Number(m[1]);
    const unit = m[2];
    if (unit === "ft" || unit === "feet" || unit === "foot") {
      if (value >= 8000 && value <= 30000) return true;
      continue;
    }
    if (unit) {
      if (value >= 2500 && value <= 9000) return true;
      continue;
    }
    // A bare number only counts when something in front of it says it is a
    // place rather than a distance, a heart rate or a calorie count.
    const before = cleaned.slice(0, m.index).trimEnd();
    if (value >= 2500 && value <= 9000 && HEIGHT_LEAD.test(before)) return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 * Symptom vocabulary
 *
 * Written for how people actually type mid-expedition: understated, misspelled,
 * third-person, and split across a sentence. Each constant is one idea.
 * ------------------------------------------------------------------------- */

/**
 * "Sore head" and "my head is killing me" are the two commonest ways a British
 * hillwalker says this and neither was here, next to nine spellings of
 * "headache". The lexicon was written from the author's phrasing rather than
 * an athlete's; that is the shape of most of the gaps below.
 *
 * The non-English entries are written WITHOUT accents on purpose — the
 * normaliser has already removed them by the time a pattern reads the text.
 */
const HEADACHE =
  /\b(?:he{0,2}a?d ?a[ck]h?e\w*|head ?ache\w*|headach\w*|head ?ake\w*|hedache\w*|headace\w*|migraine\w*|head (?:hurts|is pounding|is splitting|is banging|is thumping|is sore|is killing me|is banging|is thumping)|heads? (?:been )?sore|sore head|head killing me|splitting head|banging head|pounding head|pressure in (?:my|his|her|their) head|tete qui explose|jai mal a la tete|dolor de cabeza|mal a la tete|mal de tete|maux de tete|kopfschmerz\w*|mal di testa|dor de cabeca|boli mnie glowa|bol glowy|bolu glowy|glowa mnie boli)\b|\u03c0\u03bf\u03bd\u03bf\u03ba\u03b5\u03c6\u03b1\u03bb/;

const HEADACHE_SEVERE =
  /\b(?:worst headache|headache of (?:my|his|her|their) life|blinding headache|headache (?:that )?(?:wont|will not) (?:go|shift|lift|budge|clear)|headache (?:is )?getting worse|headache nothing touches|thunderclap|head is going to (?:explode|split))\b/;

const VOMIT =
  /\b(?:vom[a-z]*|(?:throw\w*|threw|thrown) up(?! (?:a |an |the |some |our |my |his |her |their )?(?:bivvy|bivi|tent|shelter|tarp|wall|fence|barrier|screen|hut|hands?|arms?|line|ladder|rope)\b)|puk(?:e|ed|ing)|barf\w*|retch\w*|dry heav\w*|chunder\w*|chuck(?:ed|ing)? up|spew\w*|hurl(?:ed|ing)?|boak\w*|sicked up|been sick|being sick|was sick|brought it back up|cant keep (?:(?:any|much|a|my|the|even|so much as)(?: a)?(?: single| bit of| drop of| sip of| mouthful of| bite of| scrap of)?\s+)?(?:anything|water|food|fluids?|liquids?|drink|drinks|it|a thing) down|erbrechen|vomissement\w*|wymiot\w*|zwymiotowa\w*)\b|\u03b5\u03bc\u03b5\u03c4\u03bf|\u03be\u03b5\u03c1\u03bd/;

const NAUSEA =
  /\b(?:nause\w*|queasy|sick as a dog|sick to (?:my|his|her|their) stomach|stomach is turning|churning stomach|ubelkeit|mareo\w*)\b/;

const DIZZY =
  /\b(?:dizz\w*|light ?headed\w*|head is spinning|room is spinning|everything is spinning|vertigo|woozy|vertige\w*|schwindel\w*|zawroty glowy)\b|\u03b6\u03b1\u03bb\u03b1\u03b4|\u03b6\u03b1\u03bb\u03b9\u03c3/;

/** Dizziness attached to an emotion is a figure of speech, not a symptom. */
const DIZZY_FALSE =
  /\b(?:dizzy with (?:excitement|joy|relief|happiness)|head (?:is )?spinning (?:with|from) (?:excitement|joy|it all|the news)|dizzying)\b/;

const ATAXIA =
  /\b(?:atax\w*|stagger\w*|lurch\w*|off balance|balance (?:has gone|is off|is going|went)|no balance|unsteady|(?:gone|went|going) wobbly|wobbly on (?:my|his|her|their) feet|cant walk (?:straight|in a line|properly)|cannot walk straight|walking like (?:a drunk|hes drunk|shes drunk|im drunk)|drunk walk|keeps falling over|cant stand up straight|heel to toe|legs (?:arent|are not) working|veering)\b/;

const STUMBLING = /\b(?:stumbl\w*|tripping over (?:my|his|her|their) (?:own )?feet|falling over)\b/;

const CONFUSION =
  /\b(?:confused|confusion|disorient\w*|delirious|incoherent|not making (?:any )?sense|making no sense|makes no sense|not making sense|talking (?:nonsense|gibberish|rubbish|rot)|doesnt know where|dont know where i am|cant remember (?:where|what|how|the)|acting (?:strange|strangely|weird|weirdly|oddly)|out of it|away with it|not with it|not himself|not herself|not themselves|foggy|muzzy|muddled|vague|woolly|switched off|vacant|away with the fairies)\b/;

/** "Confused about my training plan" is not a symptom. */
/**
 * "Confused about my training plan" is not a symptom — and neither is "not
 * himself ABOUT the Mont Blanc trip", which is the same idiom with a different
 * verb and used to return "go down now" to somebody whose mate was sulking
 * about a booking. The guard follows the preposition, not the word.
 */
const CONFUSION_FALSE =
  /\b(?:confus(?:ed|ion|ing) (?:about|by|over|as to|with|regarding)|confusing|not (?:himself|herself|themselves) about|foggy about|vague about|out of it about)\b/;

const SLURRED =
  /\b(?:slurr\w*|mumbl\w*|words are (?:coming out wrong|mushy|mush|jumbled|mumbled|slurred)|cant get (?:my|his|her|their) words out|cant string a sentence together|speech is (?:off|wrong|weird|strange|going|mumbly|mushy)|speech (?:has )?gone (?:funny|odd|strange|mumbly|mushy|mush|weird|wrong|thick)|cant speak properly|jumbled words|talking funny)\b/;

const BREATHLESS =
  /\b(?:breathless\w*|short of breath|shortness of breath|struggling to breathe|struggling for breath|gasping|fighting for (?:air|breath)|air hunger|suffocating|cant get enough air|cant catch (?:my|his|her|their) breath|cant get (?:my|his|her|their) breath|dyspno?e\w*|dyspnoea|dyspnea|essouffl\w*|atemnot|kann nicht (?:mehr )?atmen|nicht atmen|keine luft|nie moge oddychac|duszno|falta de aire|no puedo respirar|nao consigo respirar|non riesco a respirare|je ne peux plus respirer)\b|\u03b4\u03c5\u03c3\u03c0\u03bd\u03bf\u03b9\u03b1/;

/**
 * The phrases that are breathlessness ONLY when the person is not moving. "Out
 * of breath" is the commonest way to say this in English and it was left out
 * deliberately, because "I was out of breath on the climb" is a training
 * question — right, but the rest clause already exists to separate those two,
 * and it never got consulted because the vocabulary never matched. Kept apart
 * from BREATHLESS_ABSOLUTE so exertional breathlessness can never fire alone.
 *
 * SOB is what a medic types, and this app has plenty of them. It is also the
 * word for crying, which is why it lives here behind the rest clause and not
 * in the absolute list.
 */
const BREATHLESS_SOFT =
  /\b(?:out of breath|sob|puffed out|winded|cant get (?:my|his|her|their) wind|cant finish a sentence|cant talk in (?:full )?sentences|cant get a sentence out|struggling for air|laboured breathing|labored breathing)\b/;

const BREATHLESS_ABSOLUTE =
  /\b(?:cant breathe?|not able to breathe|unable to breathe|not breathing|isnt breathing|stopped breathing|not breathing properly|suffocating|fighting for (?:air|breath)|air hunger|no puedo respirar|nao consigo respirar|non riesco a respirare|kann nicht (?:mehr )?(?:richtig )?atmen|nie moge oddychac|atemnot|choking)\b|\u03b4\u03b5\u03bd \u03bc\u03c0\u03bf\u03c1\u03c9 \u03bd\u03b1 \u03b1\u03bd\u03b1\u03c0\u03bd\u03b5\u03c5\u03c3\u03c9/;

const AT_REST =
  /\b(?:at rest|resting|while resting|even (?:at rest|when resting|when im not moving|sitting|lying)|sitting (?:down|still|up|here)|lying (?:down|in|here|still)|in (?:my|his|her|the) (?:tent|sleeping bag|bag|bunk|bed)|doing nothing|not (?:even )?moving|standing still|when im not moving|without moving|just sitting|sat (?:here|there|in|down)|sitze|overnight|in the night|woke up (?:gasping|fighting|unable))\b/;

const HAPE_SIGN =
  /\b(?:froth\w*|pink (?:spit|sputum|phlegm|froth|foam|stuff)|coughing up (?:froth|foam|pink|blood|rust|red)|bubbling in (?:my|his|her|the) chest|gurgl\w*|crackl\w* in (?:my|his|her|the) (?:chest|lungs)|rattling (?:chest|breath\w*)|blue lips|lips (?:are|have gone|going) blue|going blue|blue around the (?:mouth|lips)|cyanotic|espuma rosada)\b/;

const CHEST_PAIN =
  /\b(?:chest (?:pain\w*|tight\w*|pressure|hurts|hurting|ache\w*|aching|discomfort|heaviness|heavy|sore|crushing|squeezing|burning|band)|chest (?:feels|felt|is|was|went|has gone|going) (?:tight\w*|heavy|painful|sore|crushing|odd|funny|weird|strange|wrong|off|not right)|pain in (?:my|his|her|their) chest|tight(?:ness)? in (?:my|his|her|their) chest|(?:crushing|tight|heavy|squeezing|burning|band) (?:feeling|sensation|pressure) in (?:my|his|her|their) chest|elephant on (?:my|his|her) chest|weight on (?:my|his|her) chest|heart attack|angina|cardiac|dolor (?:de|en el) pecho|douleur (?:thoracique|dans la poitrine)|brustschmerz\w*|dolore al petto|dor no peito|aperto no peito|bol w klatce)\b|\u03c3\u03c4\u03bf \u03c3\u03c4\u03b7\u03b8\u03bf\u03c3/;

const CHEST_FALSE =
  /\b(?:chest (?:strap|press|presses|day|rig|harness|pocket|freezer|infection|cold|congestion|hair)|bench press|chesty cough)\b|\bin (?:this|my|the) (?:jacket|harness|rucksack|pack|baselayer|base layer|top|shirt|suit|vest|straps?)\b/;

const RADIATING = /\bpain (?:radiating|spreading|shooting|going) (?:to|down|into|through)\b/;

/**
 * The two halves of the one chest judgement call in this file.
 *
 * Chest TIGHTNESS while working hard in cold air is what winter endurance
 * feels like, and firing on it refuses to answer a perfectly ordinary training
 * question. Chest PAIN, pressure, crushing, sweating, or anything spreading
 * into the jaw or arm is not that, whatever frame it arrives in — exertional
 * angina is real and it presents exactly like a hard rep.
 *
 * So the exemption is deliberately narrow: tightness ONLY, no hard sign
 * anywhere in the message, and an explicit effort or cold-air frame. Everything
 * else still fires. This is the one place below where the trade is a judgement
 * rather than a bug fix, and it is written out so the next person can move it.
 */
const CHEST_HARD_SIGN =
  /\b(?:pain\w*|pressure|crushing|squeez\w*|heavy|heaviness|elephant|weight on|jaw|arm|neck|sweat\w*|clammy|heart attack|angina|cardiac|radiat\w*|band)\b/;

const EXERTION_FRAME =
  /\b(?:cold air|the cold|last rep|reps|interval|intervals|the session|hard session|sprint\w*|threshold|zone 2|effort|breathing in|running hard|climbing hard|erg|treadmill|hill reps)\b/;

/**
 * NOBODY SAYS "ONE SIDE" ABOUT THEMSELVES. They say "my left side", "his right
 * arm". Three detectors were written only in the clinical form, so a plain
 * report of the textbook presentation walked past all three. One alternation,
 * reused.
 */
const SIDE =
  "(?:one|the left|the right|my left|my right|his left|his right|her left|her right|their left|their right)";

const STROKE_SIGN = new RegExp(
  `\\b(?:a stroke|stroke symptoms|signs of a stroke|having a stroke|mini stroke|tia|` +
    `face (?:has |had |is |looks |looking |seems |went |gone )?(?:dropped|drooped|drooping|droopy|lopsided|wonky|slack|not right)|` +
    `${SIDE} side of (?:his|her|my|their) face|face is (?:numb|frozen|dead) on ${SIDE} side|` +
    `mouth (?:is )?(?:pulling|dragging|drooping)|` +
    `cant lift (?:his|her|my|their) (?:left |right )?arm|` +
    `weakness down ${SIDE} side|numb down ${SIDE} side|numb on ${SIDE} side|` +
    `paralys\\w*|paralyz\\w*|drooping (?:mouth|eye|face))\\b`,
);

/**
 * A dead or numb arm on a named side. Held apart from the signs above because
 * of what it sits next to: an arm going numb WITH chest pain is the heart
 * referring pain down it, and `chest-pain` — which sits one place below stroke
 * in the priority list — is the message that person needs.
 */
const STROKE_ARM = new RegExp(
  `\\b(?:${SIDE} arm (?:has gone|is|went|feels) (?:weak|dead|numb|limp|useless)|` +
    `arm (?:has gone|is|went) (?:dead|limp) on ${SIDE} side)\\b`,
);

const BLEEDING_ACTIVE =
  /\b(?:bleeding (?:heavily|badly|a lot|everywhere|out)|heavy bleeding|wont stop bleeding|cant stop the bleeding|cant stop bleeding|still bleeding|not slowing|wont slow|hasnt slowed|not stopping|blood (?:everywhere|pouring|pumping|spurting|gushing)|pouring blood|(?:a lot|lots|loads|plenty) of blood|haemorrhag\w*|hemorrhag\w*|arterial|open fracture|bone (?:sticking out|through the skin|is out)|severed|tourniquet|lost a lot of blood|sangrado|hemorragia|saignement|blutung)\b/;

/**
 * A wound rather than a bleed. It fires only while nothing says it has already
 * been dealt with — "a deep cut, cleaned and taped" was getting "call emergency
 * services and control the bleeding now", which is the cry-wolf failure this
 * file's own header warns about.
 */
const BLEEDING_WOUND = /\bdeep (?:cut|gash|laceration|wound)\b/;

const BLEEDING_MANAGED =
  /\b(?:cleaned|taped|dressed|bandaged|stitched|glued|steri ?strip\w*|butterfly|scabbed|healing|healed|stopped bleeding|its stopped|has stopped|under control)\b/;

const BLEEDING_FALSE =
  /\b(?:blood (?:sugar|pressure|test|tests|work|lactate|oxygen|glucose|count|donation|donor)|bloody hell|blood orange)\b/;

/**
 * Somebody downplaying a head injury never says "I struck my head". They say
 * they took a knock, caught it, clipped it — the impact becomes a noun and the
 * verb goes passive. The whole shape was missing.
 */
const HEAD_STRUCK =
  /\b(?:hit (?:my|his|her|their|the side of my) head|banged (?:my|his|her|their) head|knocked (?:my|his|her|their) head|struck (?:my|his|her|their) head|smacked (?:my|his|her|their) head|caught (?:my|his|her|their) head|clipped (?:my|his|her|their) head|(?:took|had|caught|copped|got) (?:a |an )?(?:knock|bang|bump|whack|smack|clip|crack|blow|belt) (?:on|to) the head|(?:knock|bang|bump|whack|blow) (?:on|to) (?:my|his|her|their|the) head|took a rock (?:to|on) the (?:head|helmet)|rock ?fall (?:hit|caught)|head (?:injury|trauma|knock|wound)|cracked (?:my|his|her|their) head|helmet (?:cracked|split|took))\b/;

/**
 * A van door, a kitchen cupboard, a low beam. The everyday head-bump, and it
 * comes with an everyday headache. That pairing alone is not worth a card —
 * anything else (vomiting, confusion, amnesia, drowsiness) still is, and so is
 * the same bump on a hill, because nothing here names an object.
 */
const HEAD_STRUCK_MUNDANE =
  /\bhead (?:on|against) (?:the |my |a )?(?:van|car|door|doorframe|door frame|cupboard|shelf|beam|ceiling|locker|bunk|hatch|worktop|table|desk|wall|roof of)\b/;

/** Amnesia for the event. Its own constant because a fall can produce it with nobody having seen the head hit anything. */
const AMNESIA =
  /\b(?:cant remember (?:what happened|the fall|anything|it|any of it)|no memory of|doesnt remember|dont remember (?:the|what|it|any)|memory of it is|blank about)\b/;

/** Vomiting more than once. One is a bad stomach; three is a head injury. */
const REPEATED_VOMIT =
  /\b(?:been sick (?:\w+ )?(?:times|again)|(?:sick|vomited|thrown up|threw up) (?:two|three|four|five|several|multiple|a few|\d+) times|repeated vomiting|keeps being sick|kept being sick|throw\w* up again|cant keep (?:(?:any|much|a|my|the|even|so much as)(?: a)?(?: single| bit of| drop of| sip of| mouthful of| bite of| scrap of)?\s+)?(?:anything|water|food|fluids?|liquids?|drink|drinks|it|a thing) down)\b/;

const HEAD_NAMED =
  /\b(?:concuss\w*|knocked out|knocked unconscious|cracked (?:my|his|her|their) head|head (?:injury|trauma))\b/;

const HEAD_RED_FLAG =
  /\b(?:concuss\w*|knocked out|knocked unconscious|blacked out|passed out|out cold|lost consciousness|unconscious|cant remember (?:what happened|the fall|anything|it|any of it)|pupils|one pupil|seeing stars|repeated vomiting|keeps being sick|kept being sick|drowsy|very sleepy|hard to wake)\b/;

const NEURO_ABSOLUTE =
  /\b(?:seizure\w*|convulsi\w*|had a fit|having a fit|took a fit|unresponsive|not responding|not responsive|wont wake|cant wake (?:him|her|them)|unconscious|lost consciousness|knocked unconscious|fainted|passed out|blacked out|collapsed|gone floppy|gone limp|floppy and|limp and|double vision|seeing double|vision (?:has gone|is going|went|loss)|lost (?:my|his|her|their) (?:vision|sight)|going blind|blind in one eye|cant see (?:properly|out of|anything)|tunnel vision|numb down (?:one|my left|my right|his left|his right|her left|her right|the left|the right) side|pins and needles down (?:one|my left|my right|his left|his right|her left|her right|the left|the right) side|(?:one|my left|my right|his left|his right|her left|her right) side (?:has )?gone (?:numb|dead|weak)|neurological)\b/;

/**
 * "Passed out" is in the absolute list because a faint at 6,000 m is one. It is
 * also the most ordinary phrase in English for falling asleep on the sofa after
 * a long run, and telling that person there is no version of this where they
 * push on is how a safety layer teaches people to scroll past it. The guard is
 * the furniture and the sleep, not the phrase.
 */
const NEURO_FALSE =
  /\b(?:tent|shelter|roof|snow bridge|cornice|serac|bridge) collapsed\b|\b(?:passed out|crashed|crashed out|flaked out|zonked out|conked out) (?:on|in) (?:the |my |a )?(?:sofa|couch|bed|floor|armchair|hotel)\b|\b(?:passed out|crashed out|flaked out) (?:and )?(?:slept|snoring)\b/;

const FRACTURE =
  /\b(?:fractur\w*|dislocat\w*|broken (?:my |his |her |their |the )?(?:ankle|leg|arm|wrist|collar ?bone|clavicle|rib|ribs|femur|tibia|fibula|hip|pelvis|finger|nose|bone|foot|hand)|broke (?:my|his|her|their) (?:ankle|leg|arm|wrist|collar ?bone|clavicle|rib|ribs|femur|tibia|fibula|hip|pelvis|bone|finger|foot|hand)|snapped (?:my|his|her|their) (?:ankle|leg|achilles|wrist)|bone (?:sticking out|through the skin)|compound fracture|popped out of (?:its|the) socket|out of its socket|frattura|fraktur)\b/;

const FRACTURE_FALSE =
  /\b(?:broken (?:sleep|record|in|ground|down)|broke (?:my )?(?:pb|pr|record)|broken a sweat|breaking in)\b/;

const FALL =
  /\b(?:fell|had a fall|took a (?:fall|tumble|slide|whipper)|slipped and|came off|went for a ride|took a ride|got spat off|peeled off|(?:since|after|from) (?:the|his|her|that) fall|crevasse fall|fell into a crevasse|went down hard|hit the deck|sturz)\b/;

const CANT_BEAR =
  /\b(?:cant (?:walk|stand|weight ?bear|bear weight|put (?:any )?weight|move it)|cannot (?:walk|stand|bear weight)|unable to (?:walk|stand|weight ?bear)|no weight on it|wont take (?:any )?weight|cant put (?:any )?weight|leg (?:wont|will not) take|deformed|at (?:a|an) (?:strange|funny|odd|weird|wrong|horrible|nasty|unnatural) angle|pointing the wrong way|in agony)\b/;

const FALL_HEIGHT = /\bfell (?:about |around |roughly )?\d{1,3} ?(?:m|metres|meters|ft|feet)\b/;

const HYPOTHERMIA =
  /\b(?:hypotherm\w*|hipotermia|unterkuhl\w*|ipotermia|core temp\w*(?: is)? (?:low|dropping|down)|stopped shivering|shivering has stopped|no longer shivering|not shivering (?:any ?more|now)|cant stop shivering|shivering (?:uncontrollably|violently|badly|like mad)|violent shiver\w*|umbles)\b/;

const COLD_STATE =
  /\b(?:freezing|so cold|really cold|cant get warm|soaked (?:through|to the skin)|soaking wet|drenched|wet through|frozen through|chilled to the bone)\b/;

/** Shivering as a plain observation, not yet the clinical picture. */
const SHIVERING = /\b(?:shiver\w*|shivery|shakes|teeth chattering|chattering teeth)\b/;

/**
 * Indoors, where "freezing" means the heating is off. The hypothermia gate
 * fires on ordinary cold words plus clumsiness, and "dropping things in the
 * gym, it's freezing in there" is a sentence somebody types every winter.
 */
const INDOOR =
  /\b(?:in the gym|at the gym|in the office|in here|in there|at (?:my|the) desk|at home|in the house|in the flat|in the pool|at the wall|indoors|the car)\b/;

const COLD_IMPAIRED =
  /\b(?:drowsy|very sleepy|cant think|clumsy|fumbling|dropping (?:things|stuff|everything|her|his|their|the)|slow to answer|slow to respond|stopped talking|gone quiet|gone silent|apathetic|not making sense)\b/;

const FROSTBITE =
  /\b(?:frost ?bite\w*|frost ?bitten|frost ?nip\w*|congelacion|erfrierung\w*|gelure\w*|congelamento)\b/;

const COLD_PART = /\b(?:fingers?|thumbs?|toes?|feet|foot|hands?|nose|ears?|cheeks?|face)\b/;

const FROZEN_UNMISTAKABLE =
  /\b(?:waxy|wooden|marble|frozen solid|no feeling|no sensation|lost (?:all |the )?feeling|cant feel (?:my|his|her|their|the))\b/;

/** Bare numbness. Never enough on its own — it needs a colour or a texture. */
const NUMB = /\bnumb\w*\b/;

const FROZEN_LOOK = /\b(?:white|grey|gray|black|pale|waxy)\b/;

/**
 * How frozen tissue FEELS. "Hard" is the word people reach for and it was not
 * here; the lookahead keeps it away from the fifty ordinary uses of "hard" a
 * training app sees in a week.
 */
const FROZEN_TEXTURE =
  /\b(?:hard(?! (?:going|work|day|days|session|sessions|effort|climb|climbing|route|move|graft|to (?:say|tell|know|get)))|solid|stiff|rigid|like (?:wood|marble|stone))\b/;

const COLD_CONTEXT =
  /\b(?:cold|freezing|frozen|frost|ice|icy|snow|wind|wind ?chill|minus \d|below zero|sub zero|bivi|bivvy)\b/;

/**
 * Cold, numb extremities that are not freezing tissue. Raynaud's, boot
 * pressure and a foot that has gone to sleep are all common, all benign, and
 * all used to get "this is freezing tissue and it needs a doctor". Note what
 * is NOT here: a plain mention of boots. "His toes have gone numb and hard
 * inside his boots" is frostbite, and only the tight-boot phrasings are
 * excluded.
 */
const FROSTBITE_FALSE =
  /\b(?:ski boots|boots (?:are )?too tight|tight boots|new boots|went to sleep|gone to sleep|slept on|sat on|raynaud\w*|chilblain\w*|circulation problem|at (?:my|the) desk|in the gym|in the pool|playing guitar)\b/;

const NUMB_EXTREMITY =
  /\b(?:cant feel (?:my|his|her|their) (?:fingers?|toes?|feet|hands?|nose|ears?)|no feeling in (?:my|his|her|their|the) (?:fingers?|toes?|feet|hands?|nose|ears?))\b/;

const ALTITUDE_ILLNESS_NAMED =
  /\b(?:hace|hape|high altitude (?:cerebral|pulmonary)|cerebral o?edema|pulmonary o?edema|edema (?:pulmonar|cerebral)|hohenkrankheit)\b/;

/**
 * Naming the two illnesses is not the same as having one. "What's the
 * difference between HACE and HAPE" was returning "go down now" to somebody
 * reading up at their kitchen table. Only the definition shapes are excluded,
 * and only while no height is involved — at 5,000 m, somebody asking the
 * difference gets the card anyway.
 */
const ILLNESS_ACADEMIC =
  /\b(?:difference between|what (?:is|are)|whats|which is|stands for|versus|vs|mean|means|meaning of|read up|reading about)\b/;

const ALTITUDE_SICKNESS_NAMED =
  /\b(?:altitude sickness|mountain sickness|acute mountain sickness|soroche|mal de altura|mal de montagne|mal di montagna|choroba wysokosciowa)\b/;

/**
 * AMS is also the airport code for Amsterdam Schiphol — the likeliest European
 * departure airport for the people this app is for. A bare "ams" was returning
 * the full acute-mountain-sickness card to somebody sitting in a departure
 * lounge on a day nothing was wrong, which is precisely how an athlete learns
 * the layer is broken. The abbreviation now needs somebody to HAVE it.
 */
const AMS_ABBREVIATION =
  /\b(?:got|have|has|had|hes got|shes got|with|getting|mild|bad|severe|suspected|signs of|symptoms of) ams\b|\bams (?:symptoms|kicked|hit|set in|again|is|has)\b/;

const SLEEPLESS =
  /\b(?:cant sleep|couldnt sleep|no sleep|broken sleep|waking up gasping|periodic breathing)\b/;

const DROWSY =
  /\b(?:cant stay awake|hard to wake|wont wake up|very drowsy|drifting off|semi conscious)\b/;

/* ---------------------------------------------------------------------------
 * Informational and historical framings
 *
 * "What are the symptoms of HACE?" is a question about the world. "I have a
 * headache at 4,800" is a report about a person. Only the second needs a fixed
 * message. The distinction is deliberately narrow: any present-tense marker
 * anywhere in the sentence and it is treated as a report, because a question
 * framed as a training question — "should I push on if I am seeing double?" —
 * is exactly the phrasing this layer exists to catch.
 * ------------------------------------------------------------------------- */

/**
 * ONE WORD MUST NOT BE ABLE TO DISABLE ELEVEN CATEGORIES. "Explain" and "tell
 * me about" were bare triggers here, and this whole block is a kill switch —
 * so "Explain: crushing chest pain" returned nothing while "Crushing chest
 * pain" fired. That is also the shape every roleplay preamble naturally takes,
 * which is why an angle aimed at overrides kept hitting it by accident. Both
 * now have to be followed by a topic rather than a person.
 */
const INFORMATIONAL =
  /\b(?:what (?:are|is) the (?:signs|symptoms|warning signs)|what (?:are|is) (?:hace|hape|ams)|how do (?:i|you) (?:prevent|avoid|reduce|spot|recognise|recognize|treat|manage)|how (?:can|do) (?:i|you) tell if|tell me about (?:hace|hape|ams|altitude|acclimatis\w*|acclimatiz\w*|the symptoms|the signs|frostbite|hypothermia)|explain (?:hace|hape|ams|altitude|acclimatis\w*|acclimatiz\w*|the (?:symptoms|signs|difference)|how (?:altitude|acclimatis))|what causes|whats the difference between|is it true that|out of interest)\b/;

/**
 * The guide writing a trip brief. A hypothetical alone is NOT enough to
 * suppress — somebody describing a real casualty often dresses it as one — so
 * this asks for the paperwork words instead: a protocol, a briefing, a course.
 */
const DOCUMENTATION =
  /\b(?:protocol|trip brief|briefing|course notes|risk assessment|policy|sop|syllabus|teaching notes|for (?:our|the) (?:brief|docs|manual|handbook|notes)|writing (?:a|the) (?:guide|brief|plan|course)|for a talk|revision|first aid course)\b/;

const HISTORICAL =
  /\b(?:last (?:year|time|season|trip|week|month|summer|winter|expedition)|in 20\d\d|used to (?:get|have|suffer)|history of|runs? in (?:my|the|our) family|prone to|i suffer from|always get|tend to get|every winter|previously|years ago|months ago|back then|on my last|when i was (?:younger|a kid|on|in))\b/;

/**
 * WHAT IS NOT HERE ANY MORE: "my partner", "my mate", "my client", "my
 * brother", "my sister", "my wife", "my husband". Those are role nouns, not
 * tense markers, and their presence cancelled the historical exemption
 * whatever the tense — so "last year MY CLIENT had chest pain, how should I
 * structure this season?" got an emergency card while the same sentence with
 * "a client" did not. Every guide asking a legitimate planning question about
 * a past incident involving somebody they name by relationship was being
 * shouted at.
 *
 * WHAT IS NEW: the present perfect ("has gone", "has been"), and locative
 * deixis. "Here", "up here", "at camp" mean the speaker is standing somewhere
 * as they type, which is a report however the sentence is dressed.
 */
const PRESENT =
  /\b(?:now|right now|currently|today|tonight|this (?:morning|afternoon|evening)|at the moment|im|i am|ive|i have|i feel|i felt|i hit|hes|shes|theyre|were|we are|weve|he is|she is|they are|has been|have been|has gone|have gone|has just|since (?:this|last|we|i|he|she|they|it|the)|here|up here|down here|at camp|in the tent|for the last|minutes now|hours now|getting worse|still|keeps|kept|cant|cannot|wont|just (?:started|now|been|got))\b/;

/* ---------------------------------------------------------------------------
 * The detectors
 * ------------------------------------------------------------------------- */

interface Scan {
  /**
   * ONE READING of the question, with negations removed and protected
   * negatives kept. What the SYMPTOM patterns match against — a detector is
   * run once per reading and fires if any of them matches.
   */
  text: string;
  /**
   * EVERY reading, joined. What the FALSE-POSITIVE GUARDS match against, and
   * the two must not be swapped.
   *
   * The guards have exactly the same adjacency problem the symptoms had, in
   * the opposite direction: "the tent collapsed" is excluded from the
   * neurological category, and "the tent JUST collapsed" was not — one adverb,
   * and somebody whose shelter blew down got told to call mountain rescue for
   * a neurological emergency. Since a symptom fires if ANY reading shows it, a
   * guard must exculpate if ANY reading shows it, or the loosest reading
   * always wins. The readings are joined with a separator so no phrase can be
   * matched across the seam.
   */
  all: string;
  /** Whether the question puts the person high enough for altitude illness. */
  altitude: boolean;
  /**
   * Whether any reading mentions the chest. Computed once across all of them,
   * because the one place a detector has to defer to another category must
   * not depend on which reading it happens to be looking at.
   */
  chest: boolean;
}

type Detector = (s: Scan) => boolean;

const DETECTORS: Record<SafetyCategory, Detector> = {
  stroke: ({ text, all, altitude, chest }) =>
    STROKE_SIGN.test(text) ||
    // An arm gone dead on one side, with no chest involved. With the chest
    // involved it is the heart referring pain and the next detector owns it.
    (STROKE_ARM.test(text) && !chest) ||
    // Speech gone slurred, with nothing in the message to explain it, is the
    // textbook single-sign stroke and it fired NOTHING before: SLURRED was
    // never a trigger on its own and this pattern did not contain it, even
    // though the stroke message's own text names slurred speech as a sign.
    // Cold and altitude both produce it too and both have their own card
    // lower down, so they are excluded here rather than outranked.
    (SLURRED.test(text) &&
      !altitude &&
      !COLD_CONTEXT.test(all) &&
      !SHIVERING.test(all) &&
      !HYPOTHERMIA.test(all) &&
      !HEAD_STRUCK.test(all) &&
      !BREATHLESS_SOFT.test(all)),

  "chest-pain": ({ text, all }) =>
    !CHEST_FALSE.test(all) &&
    (CHEST_PAIN.test(text) || RADIATING.test(text)) &&
    !(EXERTION_FRAME.test(all) && !CHEST_HARD_SIGN.test(all)),

  // "Out of breath on the climb" is training. Breathlessness while NOT moving
  // is not, at any height — which is why the rest clause is load-bearing.
  breathing: ({ text, all, altitude }) =>
    BREATHLESS_ABSOLUTE.test(text) ||
    HAPE_SIGN.test(text) ||
    ((BREATHLESS.test(text) || BREATHLESS_SOFT.test(text)) &&
      AT_REST.test(text) &&
      // Breathless at a desk the day after a hard block is a training
      // question. Breathless at rest with height involved is the HAPE picture
      // and the setting never rescues it.
      (altitude || !MUNDANE_SETTING.test(all))),

  bleeding: ({ text, all }) =>
    !BLEEDING_FALSE.test(all) &&
    (BLEEDING_ACTIVE.test(text) || (BLEEDING_WOUND.test(text) && !BLEEDING_MANAGED.test(all))),

  neurological: ({ text, all, altitude }) =>
    (NEURO_ABSOLUTE.test(text) && !NEURO_FALSE.test(all)) ||
    // A stumble on its own is a rock. A stumble with confusion or slurred
    // speech is not, at any height. High up it is the oedema picture, and
    // `altitude-severe` owns it — its message says to lose height, which this
    // one does not.
    (!altitude &&
      (ATAXIA.test(text) || STUMBLING.test(text)) &&
      ((CONFUSION.test(text) && !CONFUSION_FALSE.test(all)) || SLURRED.test(text))) ||
    (!altitude && HEADACHE_SEVERE.test(text)),

  "head-injury": ({ text, all }) =>
    HEAD_NAMED.test(text) ||
    (HEAD_STRUCK.test(text) &&
      (HEAD_RED_FLAG.test(text) ||
        VOMIT.test(text) ||
        (CONFUSION.test(text) && !CONFUSION_FALSE.test(all)) ||
        (DIZZY.test(text) && !DIZZY_FALSE.test(all)) ||
        // A bump plus a headache is the everyday pairing, and on a van door it
        // is not a card. Anywhere else, or with anything worse alongside, it
        // still is.
        (HEADACHE.test(text) && !HEAD_STRUCK_MUNDANE.test(all)))) ||
    // A fall with amnesia for it, or repeated vomiting after it, is a head
    // injury whether or not anybody says a head was hit. People rarely know
    // that it was, and requiring them to say so lost the textbook case.
    (FALL.test(text) && (AMNESIA.test(text) || REPEATED_VOMIT.test(text))),

  "altitude-severe": (s) => {
    if (ALTITUDE_ILLNESS_NAMED.test(s.text) && (s.altitude || !ILLNESS_ACADEMIC.test(s.all)))
      return true;
    if (!s.altitude) return false;
    return (
      ATAXIA.test(s.text) ||
      STUMBLING.test(s.text) ||
      (CONFUSION.test(s.text) && !CONFUSION_FALSE.test(s.all)) ||
      SLURRED.test(s.text) ||
      HAPE_SIGN.test(s.text) ||
      HEADACHE_SEVERE.test(s.text) ||
      DROWSY.test(s.text) ||
      (BREATHLESS.test(s.text) && AT_REST.test(s.text))
    );
  },

  hypothermia: ({ text, all }) =>
    HYPOTHERMIA.test(text) ||
    // The gate used to need "freezing" or "so cold" — the UN-minimised forms —
    // so "she's a bit shivery and slow to answer, probably just cold" fired
    // nothing. Plain "cold" now counts when somebody is shivering with it.
    ((COLD_STATE.test(text) || (COLD_CONTEXT.test(text) && SHIVERING.test(text))) &&
      !INDOOR.test(all) &&
      (COLD_IMPAIRED.test(text) ||
        SLURRED.test(text) ||
        (CONFUSION.test(text) && !CONFUSION_FALSE.test(all)))),

  "altitude-ams": (s) => {
    if (ALTITUDE_SICKNESS_NAMED.test(s.text) || AMS_ABBREVIATION.test(s.text)) return true;
    if (!s.altitude) return false;
    return (
      HEADACHE.test(s.text) ||
      VOMIT.test(s.text) ||
      NAUSEA.test(s.text) ||
      (DIZZY.test(s.text) && !DIZZY_FALSE.test(s.all)) ||
      (SLEEPLESS.test(s.text) && (HEADACHE.test(s.text) || NAUSEA.test(s.text)))
    );
  },

  "fall-injury": ({ text }) =>
    (FRACTURE.test(text) && !FRACTURE_FALSE.test(text)) ||
    FALL_HEIGHT.test(text) ||
    (FALL.test(text) && CANT_BEAR.test(text)),

  frostbite: ({ text, all, altitude }) =>
    !FROSTBITE_FALSE.test(all) &&
    (FROSTBITE.test(text) ||
      NUMB_EXTREMITY.test(text) ||
      (COLD_PART.test(text) &&
        (FROZEN_UNMISTAKABLE.test(text) ||
          // Numb AND discoloured, or numb AND hard, is the presentation — and
          // neither needs somebody to have mentioned the cold. They are
          // standing on a mountain; they know it is cold. Requiring a cold word
          // lost "numb white fingers" and "gone numb and hard in his boots".
          (NUMB.test(text) && (FROZEN_LOOK.test(text) || FROZEN_TEXTURE.test(text))) ||
          (FROZEN_LOOK.test(text) && FROZEN_TEXTURE.test(text)) ||
          (FROZEN_LOOK.test(text) && (COLD_CONTEXT.test(text) || altitude))))),
};

/* ---------------------------------------------------------------------------
 * The gate
 * ------------------------------------------------------------------------- */

/**
 * Does this question describe an emergency? Returns the fixed message if so,
 * `null` if it is an ordinary question and the coach should answer it.
 *
 * Call this BEFORE anything else: before the model, before the rule table,
 * before the free-tier counter, before the deliberate "Thinking…" delay. It
 * costs nothing, it cannot fail, and its answer replaces every other answer.
 */
export function checkSafety(question: string): SafetyResponse | null {
  if (!question || !question.trim()) return null;

  const normalised = normaliseSymptomText(question);
  if (!normalised) return null;

  // A question ABOUT symptoms, with nobody currently having them, is one the
  // coach may answer normally — its house rules already defer anything medical.
  // A report, however it is dressed up, is not.
  if (
    (INFORMATIONAL.test(normalised) ||
      HISTORICAL.test(normalised) ||
      DOCUMENTATION.test(normalised)) &&
    !PRESENT.test(normalised)
  ) {
    return null;
  }

  const altitude = hasAltitudeContext(normalised);

  // THREE READINGS OF THE SAME SENTENCE, and every detector sees all three.
  //
  // The first is what this file always read. The second has the hedges and
  // auxiliaries taken out, because "my chest feels A BIT tight" and "my chest
  // HAS BEEN tight" are the same report as "my chest feels tight" and only the
  // last one matched anything. The third repairs a transposed spelling of the
  // few phrases that must never be lost to a typo.
  //
  // Every reading is additive: a detector fires if ANY of them matches, so no
  // phrasing that worked before can stop working. The loop is categories on the
  // outside so the priority order still decides which single card is shown.
  const readings = [
    stripNegations(normalised),
    stripNegations(reduceFillers(normalised)),
    repairTranspositions(stripNegations(normalised)),
  ];
  const chest = readings.some((text) => CHEST_PAIN.test(text) || RADIATING.test(text));
  // " | " is a separator no normalised message can contain, so a guard cannot
  // match a phrase that spans two readings.
  const all = readings.join(" | ");
  const scans: Scan[] = [...new Set(readings)].map((text) => ({ text, all, altitude, chest }));

  for (const category of SAFETY_CATEGORIES) {
    for (const scan of scans) {
      if (DETECTORS[category](scan)) {
        return { category, body: SAFETY_MESSAGES[category], disclaimer: SAFETY_DISCLAIMER };
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Free text on its way into the system prompt
 * ------------------------------------------------------------------------- */

/** Control codes. Separate from the invisibles so the lint rule can be waived once. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
/** Zero-width and bidirectional characters — text that renders as one thing and reads as another. */
const INVISIBLE_CHARS = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/**
 * Make athlete-typed free text safe to interpolate into a system prompt.
 *
 * THE PROBLEM. The limitations note goes into the prompt inside quotes, as the
 * last thing the model reads — the strongest position in the block. A note
 * containing a quote mark and a newline closes that quoted section, and
 * everything after it reads as prose from ICEFALL rather than from the athlete.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT. It removes the characters
 * that break the container — invisible and bidirectional control codes, and the
 * line breaks and quote marks that end a quoted span — and it leaves every word
 * the athlete wrote. Double quotes become apostrophes rather than vanishing, so
 * "my 'good' knee" still reads as theirs. Nothing is dropped for looking
 * suspicious: an athlete describing their own body must not have a sentence
 * silently deleted because it contained the word "ignore".
 *
 * The other half of the defence is not here — it is the delimiter and the
 * "this is data, not instructions" line around the block in @/coach/context.
 * Escaping alone never stops prompt injection; escaping plus a boundary the
 * text cannot close is what does.
 */
export function sanitiseForPrompt(text: string | null | undefined, maxChars = 300): string {
  if (!text) return "";

  const flattened = text
    .normalize("NFC")
    .replace(CONTROL_CHARS, "")
    .replace(INVISIBLE_CHARS, "")
    // Anything that would close the quoted span it sits in.
    .replace(/["\u201c\u201d\u201e\u201f\u2033\u00ab\u00bb]/g, "'")
    // Backticks and angle brackets, so a note cannot forge a code fence or a
    // tag that looks like part of the prompt's own structure.
    .replace(/[`<>]/g, "'")
    // Every newline, tab and run of spaces becomes one space: a single line
    // cannot break out of a single-line container.
    .replace(/\s+/g, " ")
    .trim();

  if (flattened.length <= maxChars) return flattened;

  // Cut on a word boundary and mark that it was cut, rather than ending the
  // athlete's sentence somewhere that changes what it means.
  const cut = flattened.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
