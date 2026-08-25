import type { Expedition, IcefallEvent } from "@/types";
import { daysAgo, daysAhead, monthsAhead } from "./clock";

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export const EVENTS: IcefallEvent[] = [
  {
    id: "ev-glacier",
    title: "Glacier Skills Intensive",
    kind: "training",
    location: "Chamonix",
    country: "France",
    date: daysAhead(18),
    durationLabel: "2 days",
    difficulty: 3,
    capacity: 12,
    spotsLeft: 3,
    priceEur: 540,
    requirements: [
      "Comfortable on steep snow",
      "Own boots and harness",
      "Basic fitness for 6 h days",
    ],
    summary:
      "Roped glacier travel, crevasse rescue and self-arrest, run with certified mountain guides on the Mer de Glace.",
    photo: "/img/community-b.jpg",
    privateOnly: false,
  },
  {
    id: "ev-ice",
    title: "Ice Climbing Workshop",
    kind: "workshop",
    location: "Cogne",
    country: "Italy",
    date: daysAhead(46),
    durationLabel: "3 days",
    difficulty: 4,
    capacity: 8,
    spotsLeft: 5,
    priceEur: 780,
    requirements: [
      "Prior climbing experience",
      "Winter clothing system",
      "Own technical axes preferred",
    ],
    summary:
      "Water-ice technique from grade WI3 to WI5 across the Cogne valley, with a focus on efficiency and protection.",
    photo: "/img/event-b.jpg",
    privateOnly: false,
  },
  {
    id: "ev-talk",
    title: "Athlete Evening — High Altitude",
    kind: "talk",
    location: "Zermatt",
    country: "Switzerland",
    date: daysAhead(9),
    durationLabel: "One evening",
    difficulty: 1,
    capacity: 120,
    spotsLeft: 41,
    priceEur: null,
    requirements: [],
    summary:
      "An evening with ICEFALL athletes on altitude preparation, decision-making and turning around.",
    photo: "/img/matterhorn.jpg",
    privateOnly: false,
  },
  {
    id: "ev-weekend",
    title: "Alpine Training Weekend",
    kind: "training",
    location: "Grindelwald",
    country: "Switzerland",
    date: daysAhead(31),
    durationLabel: "3 days",
    difficulty: 3,
    capacity: 16,
    spotsLeft: 7,
    priceEur: 690,
    requirements: ["Regular hill fitness", "Comfortable with exposure"],
    summary:
      "Three days of movement efficiency, rope work and long ascents beneath the north faces of the Bernese Oberland.",
    photo: "/img/eiger.jpg",
    privateOnly: false,
  },
  {
    id: "ev-private",
    title: "ICEFALL Private — Founders' Ascent",
    kind: "private",
    location: "Undisclosed",
    country: "Switzerland",
    date: daysAhead(74),
    durationLabel: "3 days",
    difficulty: 4,
    capacity: 8,
    spotsLeft: 2,
    priceEur: null,
    requirements: ["By invitation", "Prior alpine summit above 3,500 m"],
    summary:
      "An invitation-only ascent with the ICEFALL founders and two guides. Location shared with confirmed guests.",
    photo: "/img/private-hero.jpg",
    privateOnly: true,
  },
];

export const eventById = (id: string) => EVENTS.find((e) => e.id === id);

/* -------------------------------------------------------------------------- */
/* Expeditions — ICEFALL is the discovery layer, never the operator           */
/* -------------------------------------------------------------------------- */

export const EXPEDITIONS: Expedition[] = [
  {
    id: "exp-everest",
    mountainId: "everest",
    name: "Everest — South Col",
    elevationM: 8849,
    durationLabel: "50–60 days",
    difficulty: 5,
    difficultyLabel: "Extreme",
    requiredExperience:
      "Prior 8,000 m or multiple 7,000 m summits with a documented high-altitude record.",
    priceFromEur: 62000,
    seasons: ["April – May"],
    operators: [
      { name: "Himalayan Ascent Collective", certification: "IFMGA-led, Nepal-registered" },
      { name: "Cho Oyu Expeditions", certification: "IFMGA-led, UIAA affiliated" },
    ],
    prerequisites: [
      "Medical clearance from a physician experienced in altitude",
      "Documented 7,000 m ascent within 24 months",
      "Fixed-line ascent and descent proficiency",
    ],
    photo: "/img/everest.jpg",
    summary:
      "The standard commercial line from Nepal, run with staged acclimatisation rotations and supplementary oxygen.",
  },
  {
    id: "exp-aconcagua",
    mountainId: "aconcagua",
    name: "Aconcagua — Normal Route",
    elevationM: 6961,
    durationLabel: "18–21 days",
    difficulty: 4,
    difficultyLabel: "High altitude",
    requiredExperience: "Strong hill fitness and prior experience above 4,500 m.",
    priceFromEur: 5400,
    seasons: ["December – February"],
    operators: [
      { name: "Andes Vertical", certification: "AAGM certified, Mendoza-permitted" },
      { name: "Cordillera Guides", certification: "IFMGA-led" },
    ],
    prerequisites: ["Prior multi-day expedition", "Ability to carry 18 kg", "Medical clearance"],
    photo: "/img/aconcagua.jpg",
    summary:
      "The highest summit outside Asia and the conventional proving ground before attempting an 8,000 m peak.",
  },
  {
    id: "exp-denali",
    mountainId: "denali",
    name: "Denali — West Buttress",
    elevationM: 6190,
    durationLabel: "17–21 days",
    difficulty: 5,
    difficultyLabel: "Extreme cold",
    requiredExperience: "Glacier travel, crevasse rescue and demonstrated cold-weather competence.",
    priceFromEur: 11500,
    seasons: ["May – June"],
    operators: [{ name: "Alaska Range Alpine", certification: "NPS-authorised concessionaire" }],
    prerequisites: [
      "Sled-hauling and heavy-load experience",
      "Winter camping proficiency",
      "Crevasse rescue certification",
    ],
    photo: "/img/denali.jpg",
    summary:
      "Fully self-supported through five camps from the Kahiltna Glacier. A logistics and cold-tolerance test as much as a climb.",
  },
];

export const expeditionById = (id: string) => EXPEDITIONS.find((e) => e.id === id);
