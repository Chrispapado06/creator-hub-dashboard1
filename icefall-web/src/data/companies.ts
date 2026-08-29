import { EXPEDITIONS, IS_DEMO, type Expedition } from "./demo";

/**
 * Expedition company profiles.
 *
 * Three of these companies are INVENTED. Nothing about them belongs to
 * anybody, so a rating attached to one defames nobody.
 *
 * ONE OF THEM IS NOT. `elite-exped` is a real business, added as a worked
 * example, and every commercial figure on it — the rating, the review count,
 * the summit success rate, the reviews themselves — is an ICEFALL placeholder
 * that Elite Exped did not supply and has not agreed to. Publishing invented
 * commercial claims about an identifiable company is defamatory, so it carries
 * `realBusiness: true`, and the page it renders says so above everything else
 * rather than in a footnote.
 *
 * WHAT KEEPS IT SAFE is that `IS_DEMO` is `import.meta.env.DEV` and this array
 * is gated at its DEFINITION — `IS_DEMO ? [ … ] : []`. A production build does
 * not merely hide these records, it does not contain them: the strings are
 * dropped from the bundle by dead-code elimination. Gating the render instead
 * would leave every one of those claims sitting in `index-*.js` for anyone to
 * read, which is publication whether or not a component draws it. That exact
 * mistake was live in the phone app for a while. Verify with a grep over
 * `dist/assets` after building, never by looking at the page.
 *
 * No logo file ships for the real company either — it renders a monogram, so
 * its mark never sits on an ICEFALL server.
 */

export interface Review {
  id: string;
  author: string;
  stars: number;
  when: string;
  body: string;
  /** What they climbed with this operator — the line under the name. */
  climbed?: string;
  /**
   * A review left by someone whose booking the operator can match.
   *
   * NOT a badge this app grants: it is a claim the operator's own booking
   * record supports, carried on the demo data. Nothing computes it client-side.
   */
  verified?: boolean;
}

export interface Credential {
  /** The body's short form, set as a typographic mark rather than a logo. */
  mark: string;
  /** "Certified", "Member", "Bonded" — what the relationship actually is. */
  note: string;
  /** Spelled out, for the title attribute and for screen readers. */
  full: string;
}

export interface TeamMember {
  name: string;
  role: string;
  photo?: string;
}

export interface Company {
  id: string;
  name: string;
  /**
   * The company's own mark, with its own background.
   *
   * ONLY EVER SET FOR AN INVENTED COMPANY. These three marks were drawn for
   * ICEFALL and belong to nobody, so bundling them passes nothing off. A real
   * business's logo is its trademark and does not ship here at all — the real
   * listing renders a monogram instead, which is the same rule the phone app
   * enforces by keeping `public/img/operators` out of the deploy entirely.
   */
  logo?: string;
  /**
   * This listing names a company that actually exists.
   *
   * When true, every commercial figure below is an ICEFALL placeholder rather
   * than something the business published, and the UI must say so prominently.
   */
  realBusiness?: boolean;
  tagline: string;
  city: string;
  verifiedOn: string;
  yearsExperience: number;
  expeditionCount: number;
  summiteerCount: number;
  rating: number;
  reviewCount: number;
  /** Summit success across the operator's expeditions, as a percentage. */
  summitSuccessPct: number;
  /**
   * Accreditations.
   *
   * The bodies are REAL — IFMGA, the Nepal Mountaineering Association, the
   * Syndicat National des Guides de Montagne. The companies holding them here
   * are invented, and this whole file is `import.meta.env.DEV` only, so no
   * real operator is being credited or discredited with a membership. They are
   * rendered as wordmarks rather than reproduced logos, because reproducing an
   * accreditation body's logo for a company that does not exist is a different
   * and worse thing than naming it.
   */
  credentials: Credential[];
  team: TeamMember[];
  about: string;
  pillars: { label: string; detail: string }[];
  highlights: { label: string; detail: string }[];
  reviews: Review[];
  /** ICEFALL's own peak photography — no company has supplied images. */
  gallery: string[];
  faq: { q: string; a: string }[];
}

/** "Solukhumbu Expeditions" -> "solukhumbu-expeditions" */
export const companySlug = (name: string): string =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const COMPANIES: Company[] = IS_DEMO
  ? [
      {
        id: companySlug("Solukhumbu Expeditions"),
        name: "Solukhumbu Expeditions",
        logo: "/img/companies/solukhumbu-expeditions.svg",
        tagline: "Everest and the Khumbu, every season",
        city: "Kathmandu, Nepal",
        verifiedOn: "2 Mar 2026",
        yearsExperience: 25,
        expeditionCount: 500,
        summiteerCount: 1250,
        rating: 4.9,
        reviewCount: 128,
        summitSuccessPct: 92,
        credentials: [
          { mark: "IFMGA", note: "Certified", full: "International Federation of Mountain Guides Associations" },
          { mark: "NMA", note: "Member", full: "Nepal Mountaineering Association" },
          { mark: "TAAN", note: "Member", full: "Trekking Agencies' Association of Nepal" },
          { mark: "ATTA", note: "Member", full: "Adventure Travel Trade Association" },
        ],
        team: [
          { name: "Pemba Lama", role: "Expedition leader", photo: "/img/guides/guide-demo-lama.jpg" },
          { name: "Ingrid Halvorsen", role: "Western guide, 8,000 m", photo: "/img/guides/guide-demo-halvorsen.jpg" },
          { name: "Sara Kastrinaki", role: "Base Camp doctor", photo: "/img/guides/guide-demo-kastrinaki.jpg" },
          { name: "Declan Callaghan", role: "Logistics, Kathmandu", photo: "/img/guides/guide-demo-callaghan.jpg" },
        ],
        about:
          "A high-altitude operator working mainly on Everest and Ama Dablam, with guides, Sherpas and support staff who return to the same mountains season after season.",
        pillars: [
          { label: "Safety first", detail: "Our top priority" },
          { label: "Expert guides", detail: "IFMGA certified" },
          { label: "High success", detail: "92% summit rate" },
          { label: "Sustainable", detail: "Eco responsible" },
        ],
        highlights: [
          { label: "Everest specialists", detail: "150+ Everest expeditions run" },
          { label: "High altitude experts", detail: "All 8,000 m peaks covered" },
          { label: "Premium support", detail: "1:1 Sherpa ratio on the summit push" },
          { label: "Medical support", detail: "Doctor on call for the expedition" },
          { label: "Equipment included", detail: "Tents, oxygen and group gear" },
          { label: "Sustainability focused", detail: "Carry-out policy above base camp" },
        ],
        reviews: [
          { id: "r1", author: "Alex Martin", stars: 5, when: "2 weeks ago", climbed: "Everest — South Col", verified: true, body: "Incredible experience on our Everest expedition. The guides were exceptional and the whole team made us feel safe and supported every step of the way." },
          { id: "r2", author: "Sophie Renard", stars: 5, when: "1 month ago", climbed: "Everest — South Col", verified: true, body: "Rotations were well paced and nobody was rushed. The Sherpa team knew the route intimately." },
          { id: "r3", author: "Lucas Pereira", stars: 4, when: "2 months ago", climbed: "Ama Dablam — SW ridge", body: "Strong logistics and honest weather calls. Pre-trip communication could have been better." },
        ],
        gallery: ["/img/everest.jpg", "/img/matterhorn.jpg", "/img/denali.jpg", "/img/eiger.jpg", "/img/aconcagua.jpg"],
        faq: [
          { q: "What is included in the price?", a: "Permits, base camp accommodation, group equipment, oxygen and Sherpa support. International flights and personal kit are not." },
          { q: "What experience do I need?", a: "Previous experience above 7,000 m, and a season of glacier travel with crampons and axe." },
          { q: "What happens if I turn back?", a: "The guide's decision on the mountain is final. Ask before you pay what is refunded and what is not." },
        ],
      },
      {
        /*
         * REAL BUSINESS. See the note at the top of this file.
         *
         * Only these are facts: the name, that it runs high-altitude
         * expeditions, and that it is based in the United Kingdom. Everything
         * with a number on it is an ICEFALL placeholder for layout purposes and
         * is labelled as such wherever it renders. No logo is bundled.
         */
        id: companySlug("Elite Exped"),
        realBusiness: true,
        name: "Elite Exped",
        // No `logo`, deliberately: their mark is their trademark. Renders a monogram.
        tagline: "High-altitude expeditions, 8,000 m and above",
        city: "United Kingdom",
        verifiedOn: "",
        /*
         * ZERO MEANS "NOT PUBLISHED", and every one of these is zero on purpose.
         *
         * They were briefly filled with plausible placeholders — 4.7 from 64
         * reviews, an 88% summit rate — and the page then contradicted itself
         * inside one screen: the header claimed 64 reviews while the rail said
         * none had been published. That contradiction was the useful part. A
         * rating is the single most persuasive thing on this page, and there is
         * nothing behind this one, so it is not invented at all rather than
         * invented and disclaimed. The phone app reached the same rule the same
         * way: when a real operator signs, these fields get filled from real
         * reviews, and until then they stay empty.
         */
        yearsExperience: 0,
        expeditionCount: 0,
        summiteerCount: 0,
        rating: 0,
        reviewCount: 0,
        summitSuccessPct: 0,
        credentials: [
          { mark: "IFMGA", note: "Certified", full: "International Federation of Mountain Guides Associations" },
          { mark: "NMA", note: "Member", full: "Nepal Mountaineering Association" },
          { mark: "ATTA", note: "Member", full: "Adventure Travel Trade Association" },
        ],
        team: [
          { name: "Expedition leader", role: "Not published here", photo: undefined },
        ],
        about:
          "A high-altitude operator running expeditions on the 8,000 m peaks and on Everest, working from the United Kingdom with Nepal-based mountain teams.",
        pillars: [
          { label: "8,000 m focus", detail: "The big peaks" },
          { label: "Expert guides", detail: "Nepal-based teams" },
          { label: "Everest", detail: "South Col route" },
          { label: "Small teams", detail: "Fixed ratios" },
        ],
        highlights: [
          { label: "8,000 m specialists", detail: "Expeditions on the highest peaks" },
          { label: "Everest", detail: "South Col, with Sherpa support" },
          { label: "UK-based", detail: "Briefings and training in Britain" },
          { label: "Nepal mountain teams", detail: "The same crews season to season" },
          { label: "Small teams", detail: "Fixed guide-to-client ratios" },
        ],
        reviews: [],
        gallery: ["/img/everest.jpg", "/img/denali.jpg", "/img/matterhorn.jpg"],
        faq: [
          { q: "Is this listing from Elite Exped?", a: "No. ICEFALL has no partnership with Elite Exped. This page is a layout example built from public information, and the figures on it were not supplied by the company." },
          { q: "Can I book through ICEFALL?", a: "No. Contact the operator directly." },
        ],
      },
      {
        id: companySlug("Cordillera Ascents"),
        name: "Cordillera Ascents",
        logo: "/img/companies/cordillera-ascents.svg",
        tagline: "The Andes, end to end",
        city: "Mendoza, Argentina",
        verifiedOn: "18 Jan 2026",
        yearsExperience: 17,
        expeditionCount: 310,
        summiteerCount: 890,
        rating: 4.7,
        reviewCount: 64,
        summitSuccessPct: 78,
        credentials: [
          { mark: "IFMGA", note: "Certified", full: "International Federation of Mountain Guides Associations" },
          { mark: "AAGM", note: "Member", full: "Asociación Argentina de Guías de Montaña" },
          { mark: "ATTA", note: "Member", full: "Adventure Travel Trade Association" },
        ],
        team: [
          { name: "Tomás Zelenika", role: "Expedition leader", photo: "/img/guides/guide-demo-zelenika.jpg" },
          { name: "Ingrid Halvorsen", role: "High-camp guide", photo: "/img/guides/guide-demo-halvorsen.jpg" },
          { name: "Youssef Ait Benhaddou", role: "Base Camp manager", photo: "/img/guides/guide-demo-ait-benhaddou.jpg" },
        ],
        about:
          "An Andean operator running Aconcagua and the surrounding 6,000 m peaks, with a fixed guide-to-client ratio and its own high-camp logistics.",
        pillars: [
          { label: "Small groups", detail: "Fixed ratios" },
          { label: "Local guides", detail: "Andes based" },
          { label: "Own logistics", detail: "High camps stocked" },
          { label: "Acclimatised", detail: "No rushed schedules" },
        ],
        highlights: [
          { label: "Aconcagua specialists", detail: "The normal and Polish routes" },
          { label: "Own high camps", detail: "Stocked before you arrive" },
          { label: "Medical screening", detail: "Required before departure" },
          { label: "Weather routing", detail: "Summit day moved, not forced" },
        ],
        reviews: [
          { id: "r1", author: "Marta Ruiz", stars: 5, when: "3 weeks ago", climbed: "Aconcagua — Normal route", verified: true, body: "Ratios were exactly as advertised and the acclimatisation plan was sensible rather than rushed." },
          { id: "r2", author: "Nikolai Petrov", stars: 4, when: "2 months ago", climbed: "Aconcagua — Normal route", body: "Good value. Camps were where they said they would be." },
        ],
        gallery: ["/img/aconcagua.jpg", "/img/denali.jpg", "/img/mont-blanc.jpg"],
        faq: [
          { q: "What is the guide ratio?", a: "Stated per trip before booking and held to on the mountain." },
          { q: "Is porterage included?", a: "Between base camp and the high camps, yes. Personal kit is yours to carry." },
        ],
      },
      {
        id: companySlug("Chamonix Alpine Guides"),
        name: "Chamonix Alpine Guides",
        logo: "/img/companies/chamonix-alpine-guides.svg",
        tagline: "Mont Blanc and the Western Alps",
        city: "Chamonix, France",
        verifiedOn: "9 Feb 2026",
        yearsExperience: 34,
        expeditionCount: 1200,
        summiteerCount: 4100,
        rating: 4.8,
        reviewCount: 210,
        summitSuccessPct: 86,
        credentials: [
          { mark: "IFMGA", note: "Certified", full: "International Federation of Mountain Guides Associations" },
          { mark: "SNGM", note: "Member", full: "Syndicat National des Guides de Montagne" },
          { mark: "UIAA", note: "Member", full: "Union Internationale des Associations d'Alpinisme" },
        ],
        team: [
          { name: "Luc Wehrli", role: "Bureau des guides lead", photo: "/img/guides/guide-demo-wehrli.jpg" },
          { name: "Anke Falkenrath", role: "IFMGA guide", photo: "/img/guides/guide-demo-falkenrath.jpg" },
          { name: "Declan Callaghan", role: "IFMGA guide", photo: "/img/guides/guide-demo-callaghan.jpg" },
        ],
        about:
          "An alpine bureau running Mont Blanc, the Matterhorn and the classic Chamonix routes, with IFMGA guides working the ground they live on.",
        pillars: [
          { label: "IFMGA guides", detail: "Every guide certified" },
          { label: "Since 1992", detail: "34 years" },
          { label: "Local", detail: "Chamonix based" },
          { label: "Small ratios", detail: "1:2 on summit day" },
        ],
        highlights: [
          { label: "Mont Blanc specialists", detail: "Goûter and Trois Monts" },
          { label: "Hut bookings held", detail: "The bottleneck on this route" },
          { label: "Acclimatisation days", detail: "Built into every ascent" },
          { label: "Kit hire", detail: "Boots, axe and crampons available" },
        ],
        reviews: [
          { id: "r1", author: "Mira Halvorsen", stars: 5, when: "1 week ago", climbed: "Mont Blanc — Goûter route", verified: true, body: "The guide turned us back on weather and I respected the call. Rebooked for September." },
          { id: "r2", author: "Jonas Lindqvist", stars: 5, when: "6 weeks ago", climbed: "Mont Blanc — Goûter route", verified: true, body: "Huts were booked, timings were right, and the pace suited a mixed pair." },
        ],
        gallery: ["/img/mont-blanc.jpg", "/img/matterhorn.jpg", "/img/eiger.jpg", "/img/everest.jpg"],
        faq: [
          { q: "Do you hold hut places?", a: "Yes — the Goûter refuge is the bottleneck on Mont Blanc and we book it before confirming you." },
          { q: "Can I hire kit?", a: "Boots, axe, crampons and harness. Clothing is yours." },
        ],
      },
    ]
  : [];

export const companyById = (id: string): Company | undefined =>
  COMPANIES.find((c) => c.id === id);

/** The trips a company runs, from the shared expedition list. */
export const tripsFor = (name: string): Expedition[] =>
  EXPEDITIONS.filter((e) => e.company === name);
