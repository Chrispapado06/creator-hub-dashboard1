import { EXPEDITIONS, IS_DEMO, type Expedition } from "./demo";
import { eur, type Cents } from "@/money/model";
import { peakByName, PEAKS, SUMMIT_M } from "./peaks";

/**
 * The detail behind one expedition listing.
 *
 * `Expedition` carries what a CARD needs — objective, country, duration, a
 * from-price. A trip page needs roughly thirty times that, and the phone app
 * learned the expensive way what happens when it is not there: ten of its
 * eleven listings opened onto a page whose Overview, Itinerary, Inclusions and
 * Reviews tabs were all empty, because the tabs existed and the data did not.
 *
 * So this is authored per expedition rather than generated from a template.
 * There are four of them; four hand-written itineraries are better than four
 * derived ones that all say "Day 3 — acclimatisation" because a loop produced
 * them.
 *
 * DEMO ONLY, and demo in the strong sense the web app uses: `IS_DEMO` is
 * `import.meta.env.DEV`, and the companies these belong to are INVENTED. No
 * real operator is being quoted a price, given a summit rate, or reviewed here.
 */

export interface Departure {
  id: string;
  startISO: string;
  endISO: string;
  days: number;
  /*
   * THERE IS DELIBERATELY NO `spotsLeft` HERE.
   *
   * A departure used to carry one, rendered as "4 left" on 55 pages. It was
   * gated on IS_DEMO and labelled once beneath the list, and the argument for
   * keeping it was that the label made it honest.
   *
   * That argument lost, twice over. `DashboardShell.tsx` had already written
   * the rule down — "No countdown, no '3 spots left', no strike-through price.
   * Pressure tactics belong to products people buy on impulse, and this one is
   * bought by someone planning a year of training" — so the codebase held two
   * contradictory rules and this was the wrong one. And the honesty doctrine
   * has no "labelled demo" exit for a figure that changes a decision: a number
   * that makes someone hurry a deposit is exactly that.
   *
   * Removed at the definition rather than hidden at render, so no future page
   * can print it by reaching for a field that is still there. If an operator
   * ever reports genuine remaining places, that is a new feature built on real
   * data — not this one un-deleted.
   */
}

export interface Camp {
  name: string;
  /** Metres. Published figures for the standard route on this peak. */
  altitudeM: number;
}

export interface ItineraryDay {
  span: string;
  title: string;
  detail: string;
}

export interface TripDetail {
  id: string;
  company: string;
  verifiedOn: string;
  objective: string;
  /** Just the mountain — "Everest" out of "Everest — South Col". */
  peak: string;
  /** The route half, where the listing names one. */
  route: string | null;
  country: string;
  heroPeak: string;
  /**
   * Whether `heroPeak` is a photograph of THIS mountain.
   *
   * `e-ama` is an Ama Dablam expedition carrying `heroPeak: "everest"` because
   * there is no Ama Dablam photograph in `public/img`. Illustrating one
   * mountain with a photograph of a different one is the exact failure the
   * phone app's `TrailPlate` was written to end, so the page captions the hero
   * with what it is actually showing instead of letting it pass as the peak in
   * the title.
   */
  heroIsThisPeak: boolean;
  summitM: number;
  durationDays: number;
  difficulty: "Hard" | "Very hard" | "Extreme";
  fromEur: Cents;
  depositEur: Cents;
  months: string;
  requires: string;
  about: string;
  highlights: string[];
  camps: Camp[];
  departures: Departure[];
  itinerary: ItineraryDay[];
  includes: string[];
  excludes: string[];
  equipment: { group: string; items: string[] }[];
  faq: { q: string; a: string }[];
  /**
   * A YouTube id, where the operator has published something.
   *
   * An ID rather than a URL, so nothing downstream has to parse a share link —
   * the ones people paste carry an `si=` tracking parameter that has no
   * business being embedded.
   */
  videoId: string | null;
}

/*
 * Summit altitudes come from the peak catalogue, not from a second copy.
 *
 * There WAS a second copy here, and it disagreed: this file said Ama Dablam was
 * 6,812 m while the catalogue said 6,814 m, so a card and the page it opened
 * would have printed different altitudes for the same mountain. That is the
 * same failure the four copies of the departure date produced before `trip.ts`.
 */

/**
 * The standard camps on each route, with their published altitudes.
 *
 * THE SUMMIT IS NOT IN HERE. It is appended in `tripDetailFor` from the peak
 * catalogue, because it was in here as a literal and had already drifted: this
 * list ended Everest at 8,848 m and Mont Blanc at 4,808 m while the catalogue
 * said 8,849 m and 4,806 m, so the last point of the ascent profile disagreed
 * with the altitude printed in the header above it.
 *
 * These drive the elevation profile on the page. The profile is therefore a
 * chart of real numbers rather than a decorative mountain shape with dots on
 * it — which is the difference between a diagram and a picture pretending to
 * be one. The horizontal axis is camp order, not distance: no distance figures
 * are claimed, and the axis is unlabelled for that reason.
 */
const CAMPS: Record<string, Camp[]> = {
  "Everest — Base Camp trek": [
    { name: "Lukla", altitudeM: 2860 },
    { name: "Namche Bazaar", altitudeM: 3440 },
    { name: "Tengboche", altitudeM: 3867 },
    { name: "Dingboche", altitudeM: 4410 },
    { name: "Lobuche", altitudeM: 4940 },
    { name: "Gorak Shep", altitudeM: 5164 },
    { name: "Everest Base Camp", altitudeM: 5364 },
  ],
  Everest: [
    { name: "Base Camp", altitudeM: 5364 },
    { name: "Camp I", altitudeM: 6065 },
    { name: "Camp II", altitudeM: 6400 },
    { name: "Camp III", altitudeM: 7200 },
    { name: "South Col", altitudeM: 7950 },
  ],
  "Ama Dablam": [
    { name: "Base Camp", altitudeM: 4600 },
    { name: "Camp I", altitudeM: 5700 },
    { name: "Camp II", altitudeM: 5900 },
    { name: "Camp III", altitudeM: 6300 },
  ],
  Aconcagua: [
    { name: "Plaza de Mulas", altitudeM: 4370 },
    { name: "Canadá", altitudeM: 5050 },
    { name: "Nido de Cóndores", altitudeM: 5570 },
    { name: "Cólera", altitudeM: 6000 },
  ],
  "Mont Blanc": [
    { name: "Nid d'Aigle", altitudeM: 2372 },
    { name: "Tête Rousse", altitudeM: 3167 },
    { name: "Goûter", altitudeM: 3835 },
  ],
};

/**
 * Difficulty for a peak nobody has graded by hand.
 *
 * THE DEFAULT USED TO BE "Hard", AND THAT PUT "Hard" ON K2 — an 8,611 m peak
 * with a summit-to-death ratio that makes it one of the most dangerous climbs
 * on earth. It is the same failure the phone app had when a missing elevation
 * made Mont Blanc default to "guided walking on a waymarked route": an absent
 * value silently became a reassuring one. Where difficulty is unknown, altitude
 * is the floor, and the floor is never comforting.
 */
function difficultyFor(m: number): TripDetail["difficulty"] {
  if (m >= 7500) return "Extreme";
  if (m >= 6000) return "Very hard";
  return "Hard";
}

/**
 * Published expedition films, by peak.
 *
 * Embedded from youtube-nocookie.com and only after a click — see the player in
 * `TripDetail.tsx`. Nothing is requested from Google until the reader asks for
 * the video, which keeps a third party out of the page for everyone who does
 * not press play.
 */
const VIDEOS: Record<string, string> = {
  // Keyed the same way as every other content map: full objective where a
  // route has its own film, peak name where the film is about the mountain.
  "Annapurna I": "9RcbguG0AME",
  "Everest — Base Camp trek": "fTgKKanHYLA",
  "Lobuche East": "mbW_xK04ydM",
  Manaslu: "XLJ7T5eb0BA",
  "Ama Dablam": "2FaZVBaDGpM",
  K2: "jLGGoq1kP6o",
};

/**
 * Content for a listing, by full objective first and peak second.
 *
 * Two trips can share a mountain and share nothing else. "Everest — South Col"
 * is two months and supplementary oxygen; "Everest — Base Camp trek" is a
 * fortnight of walking that never leaves the valley floor by Himalayan
 * standards. Keying only on the peak would have given the trek the summit's
 * itinerary, its kit list and its prerequisites.
 */
function at<T>(map: Record<string, T>, objective: string, peak: string): T | undefined {
  return map[objective] ?? map[peak];
}

const DIFFICULTY: Record<string, TripDetail["difficulty"]> = {
  /*
   * "Hard" is the mildest word this app has, and it is the right one.
   * Nothing on this trek is technical — but 5,364 m is high enough that
   * altitude sickness is the reason people go home, and grading it any softer
   * would be the Mont Blanc "guided walking on a waymarked route" mistake in a
   * different pair of boots.
   */
  "Everest — Base Camp trek": "Hard",
  Everest: "Extreme",
  "Ama Dablam": "Very hard",
  Aconcagua: "Hard",
  "Mont Blanc": "Hard",
};

const ABOUT: Record<string, string> = {
  "Everest — Base Camp trek":
    "Fourteen days of walking, and the whole plan is built around going up slowly enough that your body keeps up. Lukla to Namche, rest, Tengboche, Dingboche, rest, and on up the Khumbu glacier to the tents at 5,364 m. No ropes, no crampons, no climbing — just altitude, distance and weather.",
  Everest:
    "Two months on the mountain, and most of it spent going up and coming back down again — Base Camp to Camp II and back, then higher, until your body has made the red cells the summit push needs. The climbing itself is not technical by Himalayan standards. The altitude is the whole problem.",
  "Ama Dablam":
    "The most photographed mountain in the Khumbu, and a real climb rather than a walk at altitude. The south-west ridge is steep rock, then steep ice, on fixed lines almost the whole way. Four weeks, most of it acclimatising and waiting for the ridge to be in condition.",
  Aconcagua:
    "The highest mountain outside Asia, by a route that asks for no technical climbing at all. What it asks for instead is that you keep walking uphill at 6,000 m in wind that regularly ends attempts. Nineteen days, built around the weather rather than a schedule.",
  "Mont Blanc":
    "Four days: two to get your legs and your head at altitude, one for the Goûter hut, one for the summit and the whole way down. Short, and routinely underestimated — the Grand Couloir crossing and the descent are where the accidents happen, not the top.",
};

const HIGHLIGHTS: Record<string, string[]> = {
  "Everest — Base Camp trek": [
    "Everest Base Camp at 5,364 m",
    "Kala Patthar at first light for the Everest view",
    "Two acclimatisation days built in, at Namche and Dingboche",
    "Tea-house lodging the whole way — no camping",
    "No technical climbing at any point",
    "Pulse oximetry twice daily above Namche",
  ],
  Everest: [
    "The world's highest peak, 8,849 m",
    "The classic South Col route",
    "1:1 client-to-Sherpa ratio above Base Camp",
    "Supplementary oxygen from Camp III",
    "Full rotation schedule built around your acclimatisation, not a fixed timetable",
    "Every logistic from Kathmandu arrival to Kathmandu departure",
  ],
  "Ama Dablam": [
    "6,814 m by the south-west ridge",
    "Sustained steep rock and ice, fixed throughout",
    "Small teams — six climbers maximum",
    "Khumbu acclimatisation trek included",
    "Base Camp cook and full camp support",
  ],
  Aconcagua: [
    "6,961 m — the highest summit outside the Himalaya",
    "Normal route, no technical climbing",
    "Mule transport to Plaza de Mulas",
    "Nineteen days, weather-driven rather than fixed",
    "Guides who work this mountain every season",
  ],
  "Mont Blanc": [
    "4,806 m — the highest summit in the Alps",
    "The Goûter route, the standard line",
    "Two acclimatisation days before the attempt",
    "Goûter hut booked and confirmed",
    "Maximum two climbers per guide",
  ],
};

const ITINERARY: Record<string, ItineraryDay[]> = {
  "Everest — Base Camp trek": [
    { span: "Days 1–2", title: "Kathmandu", detail: "Arrival, permits, and a kit check. Anything missing is bought in Thamel, not in the Khumbu." },
    { span: "Day 3", title: "Fly to Lukla, walk to Phakding", detail: "The flight goes when the weather allows. A short afternoon downhill to settle in." },
    { span: "Days 4–5", title: "Namche Bazaar", detail: "The long climb to 3,440 m, then a full rest day. Walk high, sleep low." },
    { span: "Days 6–7", title: "Tengboche and Dingboche", detail: "Past the monastery and up the valley. Ama Dablam fills the sky the whole way." },
    { span: "Day 8", title: "Acclimatisation at Dingboche", detail: "A slow half-day to Nangkartshang and back down to sleep." },
    { span: "Days 9–10", title: "Lobuche and Gorak Shep", detail: "Onto the moraine, past the memorials at Thukla, and up the glacier." },
    { span: "Day 11", title: "Base Camp, and Kala Patthar at dawn", detail: "The tents at 5,364 m, then an early start for the 5,545 m viewpoint." },
    { span: "Days 12–14", title: "Down and out", detail: "Back to Lukla in two long days, and the flight to Kathmandu." },
  ],
  Everest: [
    { span: "Days 1–2", title: "Kathmandu", detail: "Arrival, gear check, permits and briefings. Anything missing gets bought here, not at Base Camp." },
    { span: "Days 3–9", title: "Lukla to Base Camp", detail: "The walk in through Namche and Dingboche, deliberately slow. Two rest days built in." },
    { span: "Days 10–16", title: "Base Camp", detail: "Icefall training, ladder work and rope drills. Puja before anyone goes through the Icefall." },
    { span: "Days 17–40", title: "Rotations", detail: "Three cycles up to Camp II and Camp III and back down. This is where the expedition is actually won." },
    { span: "Days 41–52", title: "Rest at lower altitude", detail: "Down to Dingboche or lower to recover while the ropes go in above the Col." },
    { span: "Days 53–58", title: "Summit push", detail: "Base Camp to Camp II, III, the South Col, and the summit — on the weather window, not the calendar." },
    { span: "Days 59–62", title: "Out", detail: "Base Camp cleared, walk to Lukla, fly to Kathmandu." },
  ],
  "Ama Dablam": [
    { span: "Days 1–2", title: "Kathmandu", detail: "Permits, gear check, briefing." },
    { span: "Days 3–8", title: "Khumbu approach", detail: "Lukla to Namche to Pangboche, with acclimatisation days." },
    { span: "Days 9–12", title: "Base Camp", detail: "Fixed-line technique, jumar and abseil practice on the lower slabs." },
    { span: "Days 13–20", title: "Rotations", detail: "Up to Camp I and Camp II and back, twice, as the ridge is fixed above." },
    { span: "Days 21–25", title: "Summit push", detail: "Camp I, Camp II, and the summit day up the ridge to the Dablam." },
    { span: "Days 26–28", title: "Out", detail: "Down to Lukla and out to Kathmandu." },
  ],
  Aconcagua: [
    { span: "Days 1–2", title: "Mendoza", detail: "Permits, gear check, and the drive to Penitentes." },
    { span: "Days 3–5", title: "Approach", detail: "Confluencia and the walk in to Plaza de Mulas with mule support." },
    { span: "Days 6–9", title: "Plaza de Mulas", detail: "Acclimatisation carries toward Canadá, sleeping low." },
    { span: "Days 10–15", title: "High camps", detail: "Canadá, Nido de Cóndores and Cólera, moving as the weather allows." },
    { span: "Days 16–17", title: "Summit day", detail: "The Canaleta and the summit ridge. Long, cold, and entirely about pace." },
    { span: "Days 18–19", title: "Out", detail: "Descent to Plaza de Mulas and out to Mendoza." },
  ],
  "Mont Blanc": [
    { span: "Day 1", title: "Chamonix", detail: "Gear check, crampon and rope work, and the plan for the week." },
    { span: "Day 2", title: "Acclimatisation", detail: "A 3,500 m day — Aiguille du Midi or the Gran Paradiso approach, depending on conditions." },
    { span: "Day 3", title: "Goûter hut", detail: "Nid d'Aigle, Tête Rousse, the Grand Couloir crossing, and the hut at 3,835 m." },
    { span: "Day 4", title: "Summit and down", detail: "An alpine start for the Bosses ridge, the summit, and all the way back to the valley." },
  ],
};

/** Everything a listing at this price is expected to cover. */
const INCLUDES: Record<string, string[]> = {
  "Everest — Base Camp trek": [
    "Airport transfers in Kathmandu",
    "Domestic flights (Kathmandu – Lukla – Kathmandu)",
    "Sagarmatha National Park and Khumbu permits",
    "Tea-house accommodation on the trek",
    "All meals from Lukla to Lukla",
    "Guide and porters",
    "Medical kit and pulse oximeter",
  ],
  Everest: [
    "Airport pickup and drop-off in Kathmandu",
    "Domestic flights (Kathmandu – Lukla – Kathmandu)",
    "Permits and national park fees",
    "All accommodation during the expedition",
    "All meals on the mountain",
    "Expedition tents and sleeping equipment",
    "Supplementary oxygen and masks for the summit push",
    "Sherpa guides, porters and support staff",
    "Base Camp communications",
    "Medical kit and pulse oximeter",
    "Waste management and environmental fees",
  ],
  "Ama Dablam": [
    "Airport transfers in Kathmandu",
    "Domestic flights (Kathmandu – Lukla – Kathmandu)",
    "Climbing permit and park fees",
    "Accommodation on trek and at Base Camp",
    "All meals from Lukla onward",
    "Base Camp and high-camp tents",
    "Fixed rope on the route",
    "Climbing Sherpas and Base Camp staff",
    "Medical kit and pulse oximeter",
  ],
  Aconcagua: [
    "Transfers from Mendoza",
    "Climbing permit",
    "Hotel in Mendoza either side of the climb",
    "Mule transport of group and personal loads",
    "All meals on the mountain",
    "Group tents and cooking equipment",
    "Guides and Base Camp staff",
    "Medical kit and pulse oximeter",
  ],
  "Mont Blanc": [
    "IFMGA guide for four days",
    "Goûter hut, half board",
    "Tramway du Mont-Blanc and lift passes",
    "Technical group equipment — rope, rack",
    "Acclimatisation day",
  ],
};

const EXCLUDES: Record<string, string[]> = {
  "Everest — Base Camp trek": [
    "International flights",
    "Nepal visa",
    "Travel and evacuation insurance (mandatory)",
    "Personal trekking equipment",
    "Hot showers, charging and wifi in the lodges",
    "Staff tips",
  ],
  Everest: [
    "International flights",
    "Nepal visa",
    "Travel and rescue insurance (mandatory)",
    "Personal climbing equipment",
    "Summit bonus and staff tips",
  ],
  "Ama Dablam": [
    "International flights",
    "Nepal visa",
    "Travel and rescue insurance (mandatory)",
    "Personal climbing equipment",
    "Staff tips",
  ],
  Aconcagua: [
    "International flights",
    "Travel and rescue insurance (mandatory)",
    "Personal climbing equipment",
    "Meals in Mendoza",
    "Guide gratuities",
  ],
  "Mont Blanc": [
    "Travel to Chamonix",
    "Travel and rescue insurance (mandatory)",
    "Personal equipment hire",
    "Meals in the valley",
  ],
};

const EQUIPMENT: Record<string, { group: string; items: string[] }[]> = {
  "Everest — Base Camp trek": [
    { group: "On your feet", items: ["Broken-in trekking boots", "Liner and trekking socks", "Camp shoes"] },
    { group: "Layers", items: ["Down jacket for the evenings", "Softshell and hardshell", "Base layers, three sets"] },
    { group: "Sleeping", items: ["−10 °C sleeping bag", "Liner"] },
    { group: "Carried", items: ["30 L day pack", "Trekking poles", "Category 4 sunglasses", "Headtorch"] },
  ],
  Everest: [
    { group: "On your feet", items: ["8,000 m double boots", "Crampons, fitted before you fly", "Gaiters", "Liner, mid and expedition socks"] },
    { group: "Layers", items: ["Down suit rated to −40 °C", "Insulated jacket", "Softshell and hardshell", "Base layers, four sets"] },
    { group: "Technical", items: ["Harness", "Jumar and belay device", "Two locking and two snap carabiners", "Ice axe", "Helmet"] },
    { group: "Sleeping", items: ["−30 °C sleeping bag", "Closed-cell and inflatable mats"] },
    { group: "Eyes and hands", items: ["Category 4 glacier glasses", "Goggles", "Liner, insulated and expedition mitts"] },
  ],
  "Ama Dablam": [
    { group: "On your feet", items: ["6,000 m double boots", "Technical crampons", "Gaiters"] },
    { group: "Layers", items: ["Down jacket", "Softshell and hardshell", "Base layers"] },
    { group: "Technical", items: ["Harness", "Jumar and abseil device", "Ice axe", "Helmet", "Slings and carabiners"] },
    { group: "Sleeping", items: ["−20 °C sleeping bag", "Inflatable mat"] },
  ],
  Aconcagua: [
    { group: "On your feet", items: ["Double boots", "Crampons", "Gaiters"] },
    { group: "Layers", items: ["Down jacket", "Hardshell", "Wind layer", "Base layers"] },
    { group: "Technical", items: ["Ice axe", "Trekking poles", "Harness"] },
    { group: "Sleeping", items: ["−20 °C sleeping bag", "Two mats"] },
  ],
  "Mont Blanc": [
    { group: "On your feet", items: ["B2 or B3 mountaineering boots", "Crampons", "Gaiters"] },
    { group: "Layers", items: ["Insulated jacket", "Hardshell", "Base layers"] },
    { group: "Technical", items: ["Harness", "Ice axe", "Helmet", "Two locking carabiners"] },
  ],
};

const FAQ: Record<string, { q: string; a: string }[]> = {
  "Everest — Base Camp trek": [
    { q: "Do I need climbing experience?", a: "None. If you can walk six hours a day for two weeks, the trek is within reach. Altitude decides the rest." },
    { q: "How likely is altitude sickness?", a: "Mild symptoms are common above Namche and expected. The itinerary has two rest days for that reason, and the guide will turn anyone around who is not improving." },
    { q: "Do you reach the summit of Everest?", a: "No. This trek reaches Base Camp at 5,364 m. The summit is 8,849 m and a different undertaking entirely." },
    { q: "What happens if the Lukla flight is cancelled?", a: "It happens often. The itinerary carries spare days, and a helicopter transfer is arranged at cost when it does not." },
  ],
  Everest: [
    { q: "What does it take to be accepted?", a: "A previous 7,000 m summit, and enough time on fixed lines that jumaring at altitude is automatic. The operator interviews every applicant." },
    { q: "What is the client-to-Sherpa ratio?", a: "One to one above Base Camp." },
    { q: "How much oxygen is carried?", a: "Enough for the summit push from Camp III, with reserve bottles cached at the South Col." },
    { q: "What happens if I turn back?", a: "You descend with a Sherpa. The expedition continues. There is no refund for an unused portion — this is why the insurance is mandatory." },
  ],
  "Ama Dablam": [
    { q: "How technical is it really?", a: "Steep, sustained, and fixed. You need to be able to jumar and abseil competently while tired, in boots and gloves." },
    { q: "Is supplementary oxygen used?", a: "No. 6,814 m is climbed without it on this route." },
    { q: "How big are the teams?", a: "Six climbers maximum." },
  ],
  Aconcagua: [
    { q: "Do I need technical skills?", a: "No climbing skill is required on the Normal route. Fitness and altitude tolerance decide it." },
    { q: "What is the success rate driven by?", a: "Weather, almost entirely. The itinerary keeps spare days for exactly that reason." },
    { q: "How cold does it get?", a: "Summit day regularly runs to −30 °C with wind." },
  ],
  "Mont Blanc": [
    { q: "Do I need previous alpine experience?", a: "Some. You should be comfortable in crampons on steep snow and moving roped on a glacier." },
    { q: "What if the hut is full or the weather closes?", a: "The guide reschedules within the week where possible. The Goûter is booked in advance as part of the price." },
    { q: "Is the Grand Couloir as dangerous as it sounds?", a: "It is the most objectively dangerous part of the route. It is crossed early, quickly, and one at a time." },
  ],
};

/** "Everest — South Col" -> ["Everest", "South Col"] */
function splitObjective(objective: string): [string, string | null] {
  const [peak, ...rest] = objective.split(" — ");
  return [peak.trim(), rest.length ? rest.join(" — ").trim() : null];
}

/**
 * Departure windows for a listing.
 *
 * Derived from the season the listing already publishes (`months`) rather than
 * invented separately, so the dates on this page and the season on the card
 * cannot drift apart the way the four copies of the departure date did before
 * `trip.ts` existed.
 */
function departuresFor(e: Expedition, peak: string): Departure[] {
  const MONTH: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  };
  const first = MONTH[e.months.split(" – ")[0]] ?? 3;
  // Southern-hemisphere seasons run across the new year; everything else sits
  // in the season after next, which is the earliest a booking taken now could
  // realistically join.
  const year = peak === "Aconcagua" ? 2027 : 2027;
  const starts = [0, 18, 37];
  return starts.map((offset, i) => {
    const start = new Date(Date.UTC(year, first, 6 + offset));
    const end = new Date(start.getTime() + e.durationDays * 86_400_000);
    return {
      id: `${e.id}-d${i}`,
      startISO: start.toISOString().slice(0, 10),
      endISO: end.toISOString().slice(0, 10),
      days: e.durationDays,
    };
  });
}

/**
 * What can honestly be said about a peak nobody has written up.
 *
 * Six of the fifty-one listings are hand-written. The rest are derived, and
 * their pages must not be blank — but nor may they be padded with a paragraph
 * that reads as first-hand knowledge of a mountain. So this says only what the
 * catalogue actually knows: how high it is, where it is, and what that altitude
 * implies. Everything the operator has not published is labelled as such on the
 * page rather than invented to fill a tab.
 */
function derivedAbout(peakName: string): string {
  const p = PEAKS.find(
    (x) => x.name === peakName || x.name.replace(/^Mount\s+/, "").split(" / ")[0] === peakName,
  );
  if (!p) return "";
  const m = p.elevationM;
  const altitude =
    m >= 8000
      ? "Above 8,000 m, so time in the death zone and supplementary oxygen are the whole shape of the trip."
      : m >= 7000
        ? "Above 7,000 m, which means weeks of acclimatisation rotations before any summit attempt."
        : m >= 6000
          ? "A 6,000 m objective — high enough that altitude, not technique, usually decides it."
          : m >= 5000
            ? "A 5,000 m objective, reached on foot by most parties who acclimatise properly."
            : m >= 4000
              ? "A 4,000 m objective on glaciated ground, with an alpine start on summit day."
              : "A mountain day rather than an expedition, and still one that wants crampons and a rope.";
  return `${p.name} stands at ${m.toLocaleString("en-GB")} m in the ${p.range}, ${p.country}. ${altitude}`;
}

export function tripDetailFor(e: Expedition): TripDetail {
  const [peak, route] = splitObjective(e.objective);
  /*
   * The highest point THIS TRIP reaches.
   *
   * The summit, unless the listing says otherwise — a Base Camp trek tops out
   * at 5,364 m on a mountain that is 8,849 m high, and the difficulty, the
   * "max altitude" figure and the prerequisites all follow from the number the
   * walker actually stands on.
   */
  const summitM = e.maxAltitudeM ?? SUMMIT_M[peak] ?? 0;
  return {
    id: e.id,
    company: e.company,
    verifiedOn: e.verifiedOn,
    objective: e.objective,
    peak,
    route,
    country: e.country,
    heroPeak: e.heroPeak,
    /*
     * Asked of the CATALOGUE, not of a slugified name.
     *
     * This used to lower-case the objective's peak and swap spaces for dashes,
     * which works right up until a peak's name is not its id: "Annapurna I"
     * became "annapurna-i", the photograph is filed under "annapurna", and the
     * page warned "Photograph: Annapurna, not Annapurna I" about a photograph
     * that is, in fact, of Annapurna I. A false warning is worse than none —
     * it teaches the reader to ignore the true ones.
     */
    heroIsThisPeak: peakByName(peak)?.id === e.heroPeak,
    summitM,
    durationDays: e.durationDays,
    difficulty: at(DIFFICULTY, e.objective, peak) ?? difficultyFor(summitM),
    fromEur: e.fromEur,
    depositEur: eur(Math.round((e.fromEur / 100) * 0.1)),
    months: e.months,
    requires: e.requires,
    about: at(ABOUT, e.objective, peak) ?? derivedAbout(peak),
    highlights: at(HIGHLIGHTS, e.objective, peak) ?? [],
    camps: (() => {
      const staged = at(CAMPS, e.objective, peak);
      if (!staged) return [];
      // A trek's profile already ends where the trek ends; only an ascent needs
      // its summit appended.
      const tops = staged[staged.length - 1]?.altitudeM ?? 0;
      return summitM > tops ? [...staged, { name: "Summit", altitudeM: summitM }] : staged;
    })(),
    departures: departuresFor(e, peak),
    itinerary: at(ITINERARY, e.objective, peak) ?? [],
    includes: at(INCLUDES, e.objective, peak) ?? [],
    excludes: at(EXCLUDES, e.objective, peak) ?? [],
    equipment: at(EQUIPMENT, e.objective, peak) ?? [],
    faq: at(FAQ, e.objective, peak) ?? [],
    videoId: at(VIDEOS, e.objective, peak) ?? null,
  };
}

export const TRIPS: TripDetail[] = IS_DEMO ? EXPEDITIONS.map(tripDetailFor) : [];

export const tripById = (id: string): TripDetail | undefined =>
  TRIPS.find((t) => t.id === id);
