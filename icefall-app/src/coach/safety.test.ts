/**
 * TEST SET v1 FOR THE SYMPTOM SAFETY LAYER.
 *
 * `npm run test:safety` — see package.json. It bundles with esbuild and runs on
 * node, like every other suite in this repo, because @/coach/safety has no
 * imports and needs no browser.
 *
 * WHY IT EXISTS. The roadmap's Phase 0 has two done-when criteria and the first
 * is "a message about vomiting at altitude gets the safety response EVERY
 * time". A claim with "every" in it is not settled by reading the regexes; it
 * is settled by running them, and by running them again before every release,
 * because the patterns in safety.ts are one dense alternation and a broadening
 * written for one category silently narrows another.
 *
 * FOUR SUITES, AND THE SECOND AND THIRD ARE THE ONES THAT MEAN ANYTHING.
 *
 *   1. VOMITING AT ALTITUDE — the criterion itself, written every way a person
 *      types it: understated, third person, mistyped, framed as a training
 *      question, and in each of the languages this app's athletes use.
 *   2. HELD OUT — written from the failure CLASSES the first suite exposed,
 *      never from its strings. A corpus you tuned against proves nothing on its
 *      own; this is the half that does.
 *   3. NOISE — ordinary coach traffic, where the correct answer is SILENCE. The
 *      header of safety.ts says false positives are a real failure and not a
 *      safe default, and this is where that is enforced. A layer that shouts at
 *      everybody who did 3 x 400 m repeats is a layer athletes scroll past,
 *      and then it is not there on the day it matters.
 *   4. CATEGORY REGRESSION — one live case per category plus the documented
 *      false-positive guards, because the constants are shared: widening the
 *      vomiting vocabulary reaches the head-injury detector, and touching the
 *      normaliser reaches all eleven.
 *
 * WHAT THIS FILE DOES NOT PROVE. That the card reaches the screen. That is
 * `CoachChat.send` calling `checkSafety` before the counter, the limit and the
 * "Thinking…" floor, and `askCoach` calling it again for every future caller —
 * two call sites, verified by reading them, not by anything below.
 */
import { checkSafety, normaliseSymptomText, type SafetyCategory } from "@/coach/safety";

const proc = (globalThis as { process?: { exitCode?: number } }).process;
const failures: string[] = [];
let passCount = 0;

function ok(condition: boolean, label: string) {
  if (condition) passCount += 1;
  else failures.push(label);
}

/* -------------------------------------------------------------------------- */
/* 1. The criterion: vomiting at altitude                                      */
/* -------------------------------------------------------------------------- */

const VOMITING_AT_ALTITUDE: string[] = [
  // The roadmap's own string, and the red team's.
  "Headache and vomiting at 4,200 m",
  "I cannot sleep, headache, vomiting at 4,200 m",
  "throwing up at 5100m, should I keep going to camp 3?",
  // Plain.
  "I've been vomiting since we got to 4,800 m",
  "I threw up twice at high camp last night",
  "Been sick at base camp, headache too",
  "I keep puking up here on Aconcagua",
  "Vomiting at altitude, what do I do",
  "Just chundered at 4500m",
  "I've spewed twice on the way up to the col",
  "Retching all morning at 5,000 metres",
  "Dry heaving at high camp",
  "I can't keep any water down at 4,900 m",
  // Understated — how somebody minimising their own symptoms types.
  "bit of nausea and I was sick once, we're at 4,300m, probably just the food",
  "only threw up a little at camp two, nothing major",
  "slightly queasy, brought it back up, we're up at 4,600 — fine to carry on?",
  "I was sick this morning at fourteen thousand feet but I feel okay now",
  // Third person — the guide, the partner, the client.
  "My client has been sick twice at 4,700 m",
  "She's throwing up at high camp and won't eat",
  "He's vomiting up here, we're at the Khumbu icefall",
  "One of the group is being sick at base camp with a headache",
  // Dressed as a training question, which is the phrasing this layer exists for.
  "Should I do the acclimatisation rotation tomorrow if I vomited tonight at 5,200 m?",
  "Does throwing up at 4,800 m mean I should drop the summit push session?",
  "How do I train through the nausea and vomiting I get above 4,000 m right now?",
  "I'm at high camp and I've been sick — is it ok to push on to the summit today?",
  // Cold hands on a phone.
  "vomting at 4200m",
  "throwign up at high camp",
  "im being sick at 4,800m and my heeeead hurts",
  "puked at 4500 m cant stop",
  "sik at base camp, keep vomitting",
  // The languages the red team wrote in.
  "Estoy vomitando a 4.800 m de altitud",
  "Vómitos y dolor de cabeza en el campamento base",
  "Je vomis à 4 800 m d'altitude",
  "J'ai vomi au camp de base, j'ai mal à la tête",
  "Erbrechen auf 4800 m, Kopfschmerzen",
  "Vomito a 4.800 m di altitudine",
  "Vomitando a 4800 m, dor de cabeça",
  "Wymioty na 4800 m, boli mnie głowa",
  "Εμετός στα 4800 μέτρα και πονοκέφαλος",
  "Ξερνάω στο base camp",
  // Height said without a number, which is how most people say it.
  "Throwing up at high camp",
  "Vomiting in the tent on summit day",
  "I've been sick twice since we got above 4,000 metres above sea level",
  "Puking at the death zone camp",
  "Been sick on Everest at 5,300",
  "vomiting up here on Kilimanjaro",
  "I was sick at 16,000 ft",
  "Sick as a dog at the hut, we're at 3,200 m",
];

/* -------------------------------------------------------------------------- */
/* 2. Held out                                                                 */
/*                                                                             */
/* Written from the classes the first suite exposed on 11 September 2026 — a    */
/* determiner inside "can't keep X down"; deletion and transposition typos of   */
/* "vomiting" and "throwing up"; base camp named in another language; a space   */
/* used as a thousands separator; the French elision in "d'altitude"; and the   */
/* British idiom for being ill. None of these strings was used to tune.         */
/* -------------------------------------------------------------------------- */

const HELD_OUT: string[] = [
  "I cant keep a drop of water down and were at 4600m",
  "she cant keep much food down up at high camp",
  "cant keep the water down at 4,700 m",
  "vomitng at 4800m",
  "vomitting at base camp all night",
  "voming at 5000 m",
  "throwign up again at camp 3",
  "throwng up at 4,600 m",
  "he keeps throwin up at high camp",
  "Vómito y náuseas en el campamento base",
  "Vomitó dos veces en el campo base",
  "Il a vomi au camp de base, il a mal à la tête",
  "Elle vomit à 5 200 m",
  "Nous sommes à 4 600 m d'altitude et je vomis",
  "Wymiotuję w obozie bazowym",
  "Erbrechen im Basislager seit gestern Abend",
  "Ho vomitato al campo base",
  "sick as a dog at 4,500 m",
  "feeling sick as a dog at high camp",
  "I'm at 5 100 m and I've thrown up twice",
  "puking at 4 200 m",
  "been sick at 3 900 m, head is banging",
  "cant keep anything down at the south col",
  "my partner cant keep any fluids down at 4,800 m",
  "threw up at 15,000 feet this morning",
];

/* -------------------------------------------------------------------------- */
/* 3. Noise — the correct answer is nothing                                    */
/* -------------------------------------------------------------------------- */

const NOISE: string[] = [
  "What should I train today?",
  "Am I ready for Mont Blanc next June?",
  "My legs are sore after Sunday's long day",
  // Set-and-rep numbers written with a space, which the normaliser now joins.
  "I did 3 400 m repeats on the track this morning",
  "8 x 400 m off 90 seconds, how hard should they feel?",
  "I ran 5 000 m on the treadmill",
  "1 200 m of ascent on Saturday, is that enough?",
  "I burned about 3 500 calories yesterday",
  "I did 2 500 m of vert this week",
  // "Throw up" also means to erect something in a hurry, and a ridge reads as height.
  "We threw up a bivvy on the ridge and slept fine",
  // Illness with no height anywhere.
  "I had a stomach bug last week and was sick a lot, back training now",
  "Been sick with a cold all week, should I train?",
  // "Can't keep X down" said about things that are not food.
  "I can't keep my heart rate down on the climbs",
  "I can't keep the pace down on easy days",
  "I can't keep my weight down in winter",
  // Ordinary traffic.
  "How much carbohydrate per hour on a long day?",
  "What boots do you recommend for the Matterhorn?",
  "I'm tired and my sleep has been broken",
  "My knee aches after long descents",
  "I was out of breath on the climb yesterday",
  "How do I prevent altitude sickness?",
  "What is the difference between HACE and HAPE?",
  "Flying into AMS on Tuesday then on to Kathmandu",
  "Last year I got a headache at 4,200 m — how should I acclimatise this time?",
  "Planning Everest next spring, where do I start?",
  "Zone 2 for 90 minutes, right?",
  "It's a rest day, what should I eat?",
];

/* -------------------------------------------------------------------------- */
/* 4. Category regression                                                      */
/* -------------------------------------------------------------------------- */

const LIVE: Array<[SafetyCategory, string]> = [
  ["stroke", "his face has dropped on one side and he's slurring"],
  ["stroke", "I can't lift my left arm and my mouth is pulling"],
  ["stroke", "her speech has gone mushy, she's making no sense"],
  // Pins and needles down one side IS the stroke card, not the neurological
  // one. The expectation here was wrong first and the code was right.
  ["stroke", "pins and needles down his right side and he's slurring"],
  ["chest-pain", "crushing chest pain spreading into my jaw"],
  ["chest-pain", "chset pian and I'm sweating"],
  ["chest-pain", "my chest has been really tight and heavy, feels like an elephant on it"],
  ["breathing", "I can't breathe"],
  ["breathing", "gasping for air sitting still in the tent"],
  ["breathing", "coughing up pink froth at high camp"],
  ["bleeding", "deep gash on his leg, blood everywhere, won't stop bleeding"],
  ["bleeding", "bleeding heavily from the head wound"],
  ["neurological", "he had a seizure and won't wake up"],
  ["neurological", "seeing double since this afternoon"],
  ["head-injury", "took a rock to the helmet and now he can't remember the fall"],
  ["head-injury", "banged my head and I've been sick three times"],
  ["head-injury", "knocked out for a minute after the slip"],
  ["altitude-severe", "he's staggering and confused at 5,400 m"],
  ["altitude-severe", "worst headache of my life at high camp, nothing touches it"],
  ["altitude-severe", "suspected HAPE at camp 3"],
  ["hypothermia", "she's stopped shivering and she's slurring her words"],
  ["hypothermia", "he's freezing, clumsy and slow to answer on the ridge"],
  ["altitude-ams", "headache and nausea at 4,200 m"],
  ["altitude-ams", "he's got AMS at base camp"],
  ["fall-injury", "he fell and can't put any weight on it"],
  ["fall-injury", "I think I've broken my ankle"],
  ["frostbite", "his toes have gone numb and hard inside his boots"],
  ["frostbite", "fingers are white and waxy, no feeling left"],
];

/** The guards this file's own comments promise. Each must stay silent. */
const GUARDS: string[] = [
  "No chest pain, just sore legs",
  "a deep cut, cleaned and taped",
  "I passed out on the sofa after the long run",
  "the tent just collapsed in the wind",
  "confused about my training plan",
  "my ski boots are too tight and my toes go numb",
  "what are the symptoms of HACE?",
  "chest day at the gym tomorrow?",
  "I need to get my blood pressure checked before the trip",
  "broken sleep all week",
  "dizzy with excitement about the permit coming through",
  "nervous about Everest next spring",
  "my chest feels a bit tight on the last rep in cold air",
];

function main() {
  for (const m of VOMITING_AT_ALTITUDE) {
    const r = checkSafety(m);
    ok(r !== null, `silent on vomiting at altitude: "${m}" → "${normaliseSymptomText(m)}"`);
  }
  for (const m of HELD_OUT) {
    const r = checkSafety(m);
    ok(r !== null, `held-out miss: "${m}" → "${normaliseSymptomText(m)}"`);
  }
  for (const m of NOISE) {
    const r = checkSafety(m);
    ok(r === null, `false fire [${r?.category}] on ordinary traffic: "${m}"`);
  }
  for (const [want, m] of LIVE) {
    const r = checkSafety(m);
    ok(r?.category === want, `wanted ${want}, got ${r?.category ?? "nothing"}: "${m}"`);
  }
  for (const m of GUARDS) {
    const r = checkSafety(m);
    ok(r === null, `guard broke, fired [${r?.category}]: "${m}"`);
  }

  // It runs ahead of everything, on every message, so its cost is a property
  // worth asserting rather than assuming.
  const start = Date.now();
  for (let i = 0; i < 2000; i += 1)
    checkSafety(VOMITING_AT_ALTITUDE[i % VOMITING_AT_ALTITUDE.length]);
  const ms = Date.now() - start;
  ok(ms < 1000, `2000 calls took ${ms} ms, which is too slow to run before every reply`);

  const total =
    VOMITING_AT_ALTITUDE.length + HELD_OUT.length + NOISE.length + LIVE.length + GUARDS.length;
  console.log(
    `\n\x1b[1m${passCount} passed, ${failures.length} failed\x1b[0m  (${total} messages, 2000 calls in ${ms} ms)`,
  );
  if (failures.length) {
    console.log("\n\x1b[31mFailures\x1b[0m");
    for (const f of failures) console.log(`  - ${f}`);
    if (proc) proc.exitCode = 1;
  }
}

main();

export {};
