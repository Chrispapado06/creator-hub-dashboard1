import type { Mountain } from "@/types";

/**
 * Real mountains, real elevations. The app is a discovery layer for serious
 * objectives — inventing peaks or softening the requirements would undermine
 * the one thing a mountaineering app has to get right.
 */
export const MOUNTAINS: Mountain[] = [
  {
    id: "mont-blanc",
    coords: { lat: 45.8326, lon: 6.8652 },
    name: "Mont Blanc",
    range: "Graian Alps",
    country: "France / Italy",
    elevationM: 4806,
    difficulty: 4,
    difficultyLabel: "Serious alpine",
    bestSeasons: ["summer"],
    typicalDurationLabel: "2–3 days",
    technicalRequirements: [
      "Crampon and ice-axe proficiency on 35–40° snow",
      "Roped glacier travel and crevasse rescue",
      "Sustained movement above 4,000 m",
    ],
    requiredExperience:
      "Prior alpine summits above 3,500 m and confident self-arrest. Not a first mountaineering objective.",
    trainingRequirements: [
      "8–10 h aerobic volume per week for 4+ months",
      "Repeated 1,200 m+ ascent days back to back",
      "Loaded pack carries at 12–15 kg",
    ],
    recommendedGearIds: [
      "shell-summit",
      "insul-alpine",
      "mid-grid",
      "base-merino",
      "pant-alpine",
      "pack-alpine-35",
    ],
    routes: [
      {
        name: "Goûter Route",
        difficulty: 4,
        gradeLabel: "PD",
        durationLabel: "2 days",
        distanceKm: 19.4,
        elevationGainM: 2400,
        description:
          "The standard line via Tête Rousse and the Goûter hut. Objective rockfall danger in the Grand Couloir makes early timing non-negotiable.",
      },
      {
        name: "Trois Monts",
        difficulty: 5,
        gradeLabel: "AD",
        durationLabel: "1–2 days",
        distanceKm: 13.8,
        elevationGainM: 1600,
        description:
          "From the Aiguille du Midi over Mont Blanc du Tacul and Mont Maudit. Shorter but steeper, with serac exposure and a committing traverse.",
      },
    ],
    conditions: {
      tempC: -9,
      windKph: 34,
      summary: "Clear, high wind on the summit ridge",
      icon: "wind",
      visibilityKm: 40,
    },
    photo: "/img/mont-blanc.jpg",
    summary:
      "The highest summit in the Alps and the classic European alpine objective. Straightforward in grade, serious in altitude, weather and commitment.",
    requiresProfessionalSupport: true,
  },
  {
    id: "matterhorn",
    coords: { lat: 45.9766, lon: 7.6585 },
    name: "Matterhorn",
    range: "Pennine Alps",
    country: "Switzerland / Italy",
    elevationM: 4478,
    difficulty: 5,
    difficultyLabel: "Technical alpine",
    bestSeasons: ["summer"],
    typicalDurationLabel: "2 days",
    technicalRequirements: [
      "Sustained scrambling and grade III rock in boots",
      "Fast, efficient movement on mixed ground",
      "Rappel and short-roping competence",
    ],
    requiredExperience:
      "Multiple AD alpine routes, comfort on exposed terrain, and the fitness to move continuously for 10–12 hours.",
    trainingRequirements: [
      "1,400 m ascent in under 3 hours",
      "Technical rock days in mountain boots",
      "Descent-specific leg conditioning",
    ],
    recommendedGearIds: [
      "shell-summit",
      "mid-grid",
      "base-merino",
      "pant-alpine",
      "pack-alpine-35",
    ],
    routes: [
      {
        name: "Hörnli Ridge",
        difficulty: 5,
        gradeLabel: "AD",
        durationLabel: "1 long day",
        distanceKm: 9.2,
        elevationGainM: 1220,
        description:
          "The 1865 first-ascent line. Continuous route-finding on loose rock with fixed ropes on the upper shoulder. Turnaround times are strictly enforced.",
      },
    ],
    conditions: {
      tempC: -6,
      windKph: 22,
      summary: "Stable, cold overnight refreeze",
      icon: "clear",
      visibilityKm: 60,
    },
    photo: "/img/matterhorn.jpg",
    summary:
      "The most recognisable peak in the Alps. A committing rock ridge where speed is the primary safety margin.",
    requiresProfessionalSupport: true,
  },
  {
    id: "everest",
    coords: { lat: 27.9881, lon: 86.925 },
    name: "Everest",
    range: "Mahalangur Himal",
    country: "Nepal / China",
    elevationM: 8849,
    difficulty: 5,
    difficultyLabel: "Extreme",
    bestSeasons: ["spring"],
    typicalDurationLabel: "50–60 days",
    technicalRequirements: [
      "Fixed-line ascension and descent at extreme altitude",
      "Supplementary oxygen systems",
      "Ladder crossings through the Khumbu Icefall",
    ],
    requiredExperience:
      "Prior 8,000 m or multiple 7,000 m summits, plus a documented high-altitude record. Undertaken with a professional expedition operator.",
    trainingRequirements: [
      "12+ months structured periodised training",
      "Repeated multi-week altitude exposure",
      "Load carries at 20 kg+ over consecutive days",
    ],
    recommendedGearIds: ["insul-expedition", "shell-summit", "base-merino", "pack-expedition-65"],
    routes: [
      {
        name: "South Col",
        difficulty: 5,
        gradeLabel: "Expedition",
        durationLabel: "50–60 days",
        distanceKm: 62,
        elevationGainM: 3500,
        description:
          "From Nepal via the Khumbu Icefall, Western Cwm and South Col. The standard commercial line, run on fixed ropes with staged acclimatisation rotations.",
      },
      {
        name: "North Ridge",
        difficulty: 5,
        gradeLabel: "Expedition",
        durationLabel: "50–60 days",
        distanceKm: 55,
        elevationGainM: 3300,
        description:
          "From Tibet via the North Col and three high camps. Colder and windier, with a long exposed summit ridge and the Second Step.",
      },
    ],
    conditions: {
      tempC: -27,
      windKph: 62,
      summary: "Jet stream aloft — outside the summit window",
      icon: "storm",
      visibilityKm: 25,
    },
    photo: "/img/everest.jpg",
    summary:
      "The highest point on Earth. An expedition undertaking measured in months, not days, and only through professional operators.",
    requiresProfessionalSupport: true,
  },
  {
    id: "mount-olympus",
    coords: { lat: 40.0885, lon: 22.3586 },
    name: "Mount Olympus",
    range: "Olympus Massif",
    country: "Greece",
    elevationM: 2918,
    difficulty: 3,
    difficultyLabel: "Demanding hike / scramble",
    bestSeasons: ["summer", "autumn"],
    typicalDurationLabel: "2 days",
    technicalRequirements: [
      "Exposed grade I–II scrambling to Mytikas",
      "Helmet for rockfall in the Kaki Skala couloir",
      "A confident head for heights",
    ],
    requiredExperience:
      "Strong hill fitness and prior scrambling. The walk-in is non-technical; the final summit block is not.",
    trainingRequirements: [
      "Consecutive 1,000 m ascent days",
      "Scrambling practice on rock",
      "6–8 h sustained hiking",
    ],
    recommendedGearIds: ["shell-summit", "mid-grid", "base-merino", "pack-alpine-35"],
    routes: [
      {
        name: "Prionia → Spilios Agapitos → Mytikas",
        difficulty: 3,
        gradeLabel: "Scramble",
        durationLabel: "2 days",
        distanceKm: 18.6,
        elevationGainM: 1900,
        description:
          "The classic approach through beech forest to the refuge, then the Kaki Skala traverse to the summit of Mytikas.",
      },
    ],
    conditions: {
      tempC: 14,
      windKph: 18,
      summary: "Warm and clear, afternoon cloud build-up",
      icon: "cloud",
      visibilityKm: 45,
    },
    photo: "/img/mount-olympus.jpg",
    summary:
      "The mythological home of the gods and an outstanding first serious objective — real exposure without technical glacier travel.",
    requiresProfessionalSupport: false,
  },
  {
    id: "gran-paradiso",
    coords: { lat: 45.5175, lon: 7.2675 },
    name: "Gran Paradiso",
    range: "Graian Alps",
    country: "Italy",
    elevationM: 4061,
    difficulty: 3,
    difficultyLabel: "Introductory alpine",
    bestSeasons: ["summer"],
    typicalDurationLabel: "2 days",
    technicalRequirements: [
      "Roped glacier travel",
      "Crampon technique on moderate snow",
      "A short exposed rock step below the summit Madonna",
    ],
    requiredExperience: "The standard first 4,000 m peak. Suitable after a glacier skills course.",
    trainingRequirements: [
      "6–8 h aerobic volume per week",
      "1,000 m ascent days with a pack",
      "One prior glacier travel course",
    ],
    recommendedGearIds: [
      "shell-summit",
      "mid-grid",
      "base-merino",
      "pant-alpine",
      "pack-alpine-35",
    ],
    routes: [
      {
        name: "Chabod / Vittorio Emanuele Normal",
        difficulty: 3,
        gradeLabel: "F+",
        durationLabel: "2 days",
        distanceKm: 16.2,
        elevationGainM: 2100,
        description:
          "Hut approach, then a long glacier plod to a brief rocky summit scramble. The most forgiving genuine 4,000er in the Alps.",
      },
    ],
    conditions: {
      tempC: -3,
      windKph: 15,
      summary: "Settled, good refreeze overnight",
      icon: "clear",
      visibilityKm: 50,
    },
    photo: "/img/gran-paradiso.jpg",
    summary:
      "The highest peak entirely within Italy, and the conventional stepping stone to Mont Blanc.",
    requiresProfessionalSupport: false,
  },
  {
    id: "eiger",
    coords: { lat: 46.5775, lon: 8.0053 },
    name: "Eiger",
    range: "Bernese Alps",
    country: "Switzerland",
    elevationM: 3967,
    difficulty: 5,
    difficultyLabel: "Technical alpine",
    bestSeasons: ["summer", "winter"],
    typicalDurationLabel: "1–3 days",
    technicalRequirements: [
      "Mixed climbing to Scottish IV on the north face",
      "Efficient multi-pitch systems",
      "Objective-hazard judgement",
    ],
    requiredExperience:
      "Extensive technical alpine background. The Mittellegi ridge is the accessible line; the north face is for experienced alpinists only.",
    trainingRequirements: [
      "Year-round technical climbing",
      "Winter mixed and ice mileage",
      "Sustained multi-day output",
    ],
    recommendedGearIds: [
      "shell-summit",
      "insul-alpine",
      "mid-grid",
      "pant-alpine",
      "pack-alpine-35",
    ],
    routes: [
      {
        name: "Mittellegi Ridge",
        difficulty: 5,
        gradeLabel: "AD+",
        durationLabel: "2 days",
        distanceKm: 11.4,
        elevationGainM: 1600,
        description:
          "A spectacular, heavily exposed rock ridge with fixed ropes, approached from the Mittellegi hut.",
      },
      {
        name: "North Face (Heckmair)",
        difficulty: 5,
        gradeLabel: "ED2",
        durationLabel: "1–3 days",
        distanceKm: 9.1,
        elevationGainM: 1800,
        description:
          "The Nordwand. Serious, committing and historically significant — attempted only with deep mixed-climbing experience.",
      },
    ],
    conditions: {
      tempC: -11,
      windKph: 28,
      summary: "Cold and dry — good north face conditions",
      icon: "snow",
      visibilityKm: 35,
    },
    photo: "/img/eiger.jpg",
    summary:
      "The most storied face in alpinism. Two very different mountains depending on which side you choose.",
    requiresProfessionalSupport: true,
  },
  {
    id: "triglav",
    coords: { lat: 46.3785, lon: 13.8368 },
    name: "Triglav",
    range: "Julian Alps",
    country: "Slovenia",
    elevationM: 2864,
    difficulty: 3,
    difficultyLabel: "Via ferrata / scramble",
    bestSeasons: ["summer", "autumn"],
    typicalDurationLabel: "2 days",
    technicalRequirements: [
      "Via ferrata set and helmet",
      "Sustained exposure on cabled sections",
      "Solid footwork on limestone",
    ],
    requiredExperience: "Good hill fitness and comfort with exposure. No glacier travel required.",
    trainingRequirements: [
      "1,500 m ascent capability",
      "Via ferrata familiarity",
      "Two consecutive long days",
    ],
    recommendedGearIds: ["shell-summit", "mid-grid", "base-merino", "pack-alpine-35"],
    routes: [
      {
        name: "Krma Valley → Kredarica → Summit",
        difficulty: 3,
        gradeLabel: "Ferrata",
        durationLabel: "2 days",
        distanceKm: 21.5,
        elevationGainM: 2000,
        description:
          "The gentlest approach, with the cabled summit ridge providing the sting in the tail.",
      },
    ],
    conditions: {
      tempC: 9,
      windKph: 20,
      summary: "Clear morning, storms forecast after 14:00",
      icon: "storm",
      visibilityKm: 40,
    },
    photo: "/img/triglav.jpg",
    summary: "Slovenia's national symbol and one of Europe's finest via ferrata summits.",
    requiresProfessionalSupport: false,
  },
  {
    id: "toubkal",
    coords: { lat: 31.0605, lon: -7.9153 },
    name: "Toubkal",
    range: "High Atlas",
    country: "Morocco",
    elevationM: 4167,
    difficulty: 2,
    difficultyLabel: "High-altitude trek",
    bestSeasons: ["spring", "autumn", "winter"],
    typicalDurationLabel: "2–3 days",
    technicalRequirements: [
      "Winter ascents need crampons and an axe",
      "Loose scree management",
      "Altitude tolerance to 4,200 m",
    ],
    requiredExperience:
      "Accessible to fit hikers in summer. A genuine winter mountaineering objective from December to March.",
    trainingRequirements: [
      "Regular 800–1,000 m hill days",
      "Pack carries at 10 kg",
      "Altitude familiarisation if possible",
    ],
    recommendedGearIds: ["shell-summit", "mid-grid", "base-merino", "pack-alpine-35"],
    routes: [
      {
        name: "Imlil → Refuge du Toubkal → Summit",
        difficulty: 2,
        gradeLabel: "Trek",
        durationLabel: "2 days",
        distanceKm: 22.4,
        elevationGainM: 2400,
        description:
          "A mule-supported valley walk to the refuge, then a long scree ascent to the highest point in North Africa.",
      },
    ],
    conditions: {
      tempC: 3,
      windKph: 26,
      summary: "Dry and clear, cold at the refuge",
      icon: "clear",
      visibilityKm: 70,
    },
    photo: "/img/toubkal.jpg",
    summary:
      "North Africa's highest summit. Excellent altitude preparation with a short approach from Marrakech.",
    requiresProfessionalSupport: false,
  },
  {
    id: "denali",
    coords: { lat: 63.0695, lon: -151.0074 },
    name: "Denali",
    range: "Alaska Range",
    country: "United States",
    elevationM: 6190,
    difficulty: 5,
    difficultyLabel: "Extreme cold expedition",
    bestSeasons: ["spring", "summer"],
    typicalDurationLabel: "17–21 days",
    technicalRequirements: [
      "Sled hauling and full self-sufficiency",
      "Glacier travel and crevasse rescue",
      "Cold-injury prevention below −40 °C",
    ],
    requiredExperience:
      "Prior expedition experience and demonstrated cold-weather competence. Undertaken with an authorised operator or a highly experienced team.",
    trainingRequirements: [
      "Sled-drag and heavy-pack conditioning",
      "Consecutive multi-hour load carries",
      "Winter camping proficiency",
    ],
    recommendedGearIds: ["insul-expedition", "shell-summit", "base-merino", "pack-expedition-65"],
    routes: [
      {
        name: "West Buttress",
        difficulty: 5,
        gradeLabel: "Expedition",
        durationLabel: "17–21 days",
        distanceKm: 43,
        elevationGainM: 4000,
        description:
          "From the Kahiltna Glacier landing strip through five camps. Non-technical in grade but brutally cold and fully self-supported.",
      },
    ],
    conditions: {
      tempC: -31,
      windKph: 45,
      summary: "Severe cold, high wind at 5,200 m camp",
      icon: "storm",
      visibilityKm: 15,
    },
    photo: "/img/denali.jpg",
    summary:
      "The coldest big mountain on Earth relative to its altitude. A logistics and endurance test as much as a climb.",
    requiresProfessionalSupport: true,
  },
  {
    id: "aconcagua",
    coords: { lat: -32.6532, lon: -70.0109 },
    name: "Aconcagua",
    range: "Andes",
    country: "Argentina",
    elevationM: 6961,
    difficulty: 4,
    difficultyLabel: "High-altitude expedition",
    bestSeasons: ["summer"],
    typicalDurationLabel: "18–21 days",
    technicalRequirements: [
      "Sustained effort above 6,000 m",
      "Crampon use on the Canaleta in poor conditions",
      "High-wind camp craft",
    ],
    requiredExperience:
      "The highest peak outside Asia and the standard proving ground before 8,000 m. Non-technical but genuinely high.",
    trainingRequirements: [
      "6–9 months periodised endurance",
      "Back-to-back 1,500 m days",
      "Altitude rotations where possible",
    ],
    recommendedGearIds: ["insul-expedition", "shell-summit", "base-merino", "pack-expedition-65"],
    routes: [
      {
        name: "Normal Route (Horcones)",
        difficulty: 4,
        gradeLabel: "Expedition",
        durationLabel: "18–21 days",
        distanceKm: 58,
        elevationGainM: 4200,
        description:
          "Via Plaza de Mulas and three high camps. Walkable throughout, with the Canaleta scree the crux of summit day.",
      },
    ],
    conditions: {
      tempC: -18,
      windKph: 55,
      summary: "Viento blanco risk — check the forecast window",
      icon: "wind",
      visibilityKm: 30,
    },
    photo: "/img/aconcagua.jpg",
    summary:
      "The highest summit in the Americas. No technical climbing, but altitude and wind defeat most attempts.",
    requiresProfessionalSupport: true,
  },
];

export const mountainById = (id: string) => MOUNTAINS.find((m) => m.id === id);
