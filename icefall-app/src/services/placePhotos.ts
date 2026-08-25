import { PHOTOS_TIMEOUT_MS, withTimeout } from "@/lib/netTimeout";
import { haversine } from "@/tracking/filters";

/**
 * Photographs taken at a place, from Wikimedia Commons geosearch.
 *
 * `peakPhotos.ts` resolves a photograph OF a named subject — the lead image of
 * its article, or its Wikidata P18. A trail has neither: the Kaledonia Waterfall
 * Trail is not on Wikipedia and has no Wikidata item, and nor do most of the
 * small summits around Limassol.
 *
 * What Commons does have is a quarter of a billion files with coordinates. A
 * photograph geotagged 400 m from the trail is a real photograph of that ground,
 * and it is the honest thing to show — PROVIDED the caption says exactly that.
 * These are captioned "Photographed near X", never "X", because the camera was
 * there and that is all we know.
 *
 * The filtering matters more here than anywhere else in the app. Geosearch
 * around Chamonix returns the town hall, a drum band and the start line of a
 * trail race; around Bergen it returns a church altarpiece and a student
 * theatre. Indoors, people and civic buildings are all rejected outright.
 */

const COMMONS = "https://commons.wikimedia.org/w/api.php";

export interface PlacePhoto {
  src: string;
  credit: string;
  license: string;
  pageUrl: string;
  /** File name, for the subject filters and for debugging. */
  title: string;
}

/**
 * Settlements and built things.
 *
 * A hillside village photographs beautifully and is not a trail. Two different
 * Cypriot trails 5.5 km apart both ended up showing "Деревня Лазанья" — a photo
 * of the village of Lazanias — because it was simply the nearest geotagged file
 * to both of them. Villages, monasteries, dams and roads are all out.
 */
const NOT_A_TRAIL =
  /\b(village|деревня|villaggio|dorf|hamlet|town\b|city\b|houses?|building|street|road\b|highway|bridge|dam\b|monastery|monastir|convent|castle|ruins?|tower|windmill|port|harbour|marina|square\b|quarter)\b/i;

/** Not the outdoors. A photo of a church interior is not a photo of a trail. */
const NOT_OUTDOORS =
  /\b(town\s?hall|hôtel de ville|rathaus|church|chapel|cathedral|kyrkja|kirche|altar|altertavle|museum|hotel|restaurant|caf[ée]|bar\b|shop|market|school|university|theatre|theater|library|hospital|station\b|airport|parking|interior|indoor|inside|room\b|exhibition|festival|concert|band\b|orchestra|parade|wedding|portrait|selfie|statue|monument|memorial|plaque|sign\b|signpost|graffiti|mural|poster|logo|flag|coat.of.arms|stamp|coin|menu|fountain|cemetery|grave|tomb)\b/i;

/** People and events rather than ground. */
const NOT_LANDSCAPE =
  /\b(race|marathon|ultra-?trail|start(ing)? line|finish|competition|championship|team\b|crowd|spectators|award|ceremony|conference|debate|meeting|protest|demo\b)\b/i;

/**
 * Open ground. A file named for a gorge, a ridge or a forest is the terrain the
 * trail crosses; one named for a village is where you left the car.
 */
const IS_LANDSCAPE =
  /\b(trail|path|track|hike|hiking|walk|gorge|canyon|valley|vall[ée]e|ravine|waterfall|cascade|falls|forest|wood|pine|cedar|tree|river|stream|creek|lake|peak|summit|mount|mountain|ridge|cliff|crag|rock|viewpoint|panorama|landscape|scenery|nature|national park|reserve|meadow|pasture|alp|glacier|snow|hill|pass\b|col\b|saddle|plateau|spring|waterfall|flora|fauna)\b/i;

/** Files that are diagrams, maps or non-photographs. */
const NOT_A_PHOTO =
  /\b(map|karte|mapa|carte|topo|diagram|schema|sketch|profile|plan|chart|locator)\b|\.(svg|gif|tif|tiff|pdf|ogv|webm)$/i;

/* -------------------------------------------------------------------------- */
/**
 * How wide a photograph is fetched from Commons.
 *
 * Measured 2026-08-23 on one Tatras plate: asking for 1400 made Commons snap UP
 * to its next bucket and serve **1920px / 605 KB** — for a card 170px tall
 * inside a 430px-wide phone frame. The same file at 1280px is 300 KB and at
 * 500px is 45 KB. 800 covers the largest surface these photographs reach (the
 * 330px trail-detail hero, at 2x) with room to spare, and cuts roughly four
 * fifths off every image on the screen.
 */
const COMMONS_WIDTH = 800;

/* Cache                                                                      */
/* -------------------------------------------------------------------------- */

const CACHE_KEY = "icefall.place-photos.v2";
const CACHE_LIMIT = 400;

let cache: Record<string, PlacePhoto[]> = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PlacePhoto[]>) : {};
  } catch {
    return {};
  }
})();

function persist() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      cache = Object.fromEntries(keys.slice(-CACHE_LIMIT).map((k) => [k, cache[k]]));
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode */
  }
}

/** ~1 km buckets, so nearby callers share one lookup. */
const keyFor = (lat: number, lon: number, radiusM: number) =>
  `${lat.toFixed(2)},${lon.toFixed(2)}@${radiusM}`;

const inflight = new Map<string, Promise<PlacePhoto[]>>();

/* -------------------------------------------------------------------------- */
/* Fetch                                                                      */
/* -------------------------------------------------------------------------- */

interface CommonsPage {
  title: string;
  /** Present only when the file is geotagged — most are not. */
  coordinates?: { lat: number; lon: number }[];
  imageinfo?: {
    thumburl?: string;
    url?: string;
    mediatype?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

const strip = (html?: string) =>
  (html ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

/**
 * Photographs taken within `radiusM` of a point, best first.
 *
 * `radiusM` is capped at 10 km by the Commons API. A trail is longer than that,
 * so the caller passes the trail's centre and accepts that the photograph is
 * from somewhere along it — which is what "photographed near" means.
 */
export function photosNear(
  lat: number,
  lon: number,
  // 10 km is the Commons API's own ceiling. The first cut asked for 4 km, and
  // small trails in the Cypriot foothills came back with nothing at all — the
  // photographs exist, they are just not within four kilometres of a relation's
  // centre point.
  { radiusM = 10_000, limit = 6 }: { radiusM?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<PlacePhoto[]> {
  const key = keyFor(lat, lon, radiusM);
  if (key in cache) return Promise.resolve(cache[key].slice(0, limit));
  const existing = inflight.get(key);
  if (existing) return existing.then((r) => r.slice(0, limit));

  const promise = (async () => {
    // `list=geosearch` rather than `generator=geosearch`, because only the list
    // form returns `dist`. Without it the results come back unordered and a
    // village eight kilometres away outranks the gorge the trail runs through.
    const geo =
      `${COMMONS}?action=query&format=json&origin=*` +
      `&list=geosearch&gscoord=${lat}|${lon}&gsradius=${Math.min(radiusM, 10_000)}` +
      "&gslimit=60&gsnamespace=6";

    const res = await fetch(geo, { signal: withTimeout(PHOTOS_TIMEOUT_MS, signal) });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      query?: { geosearch?: { pageid: number; title: string; dist: number }[] };
    };

    const candidates = (json.query?.geosearch ?? [])
      .map((g) => ({ ...g, name: g.title.replace(/^File:/, "") }))
      .filter(
        (g) =>
          !NOT_A_PHOTO.test(g.name) &&
          !NOT_OUTDOORS.test(g.name) &&
          !NOT_LANDSCAPE.test(g.name) &&
          !NOT_A_TRAIL.test(g.name) &&
          // A POSITIVE match is required, not merely the absence of a negative
          // one. Ranking open ground first still let a village win whenever no
          // landscape photograph existed nearby — and "nothing, honestly
          // labelled" beats "a village, presented as your trail".
          IS_LANDSCAPE.test(g.name),
      )
      .sort((a, b) => a.dist - b.dist)
      // Enough alternatives that neighbouring trails can be given different
      // frames; see `assignUnique`.
      .slice(0, 10);

    if (candidates.length === 0) return [];

    const info =
      `${COMMONS}?action=query&format=json&origin=*` +
      `&pageids=${candidates.map((c) => c.pageid).join("|")}` +
      `&prop=imageinfo&iiprop=url|mediatype|extmetadata&iiurlwidth=${COMMONS_WIDTH}` +
      "&iiextmetadatafilter=Artist|LicenseShortName";

    const res2 = await fetch(info, { signal: withTimeout(PHOTOS_TIMEOUT_MS, signal) });
    if (!res2.ok) return [];
    const json2 = (await res2.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const byTitle = new Map(
      Object.values(json2.query?.pages ?? {}).map((p) => [p.title, p] as const),
    );

    const out: PlacePhoto[] = [];
    // Rebuild in the ranked order — the API returns pages keyed by id, which is
    // not the order they were asked for.
    for (const c of candidates) {
      const page = byTitle.get(c.title);
      const photo = page ? toPhoto(page) : null;
      if (photo) out.push(photo);
    }
    return out;
  })()
    .then((r) => {
      cache[key] = r;
      persist();
      return r;
    })
    .catch(() => [] as PlacePhoto[])
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise.then((r) => r.slice(0, limit));
}

/** Synchronous read for anything already resolved — avoids a render flash. */
export function cachedPhotosNear(lat: number, lon: number, radiusM = 10_000): PlacePhoto[] | undefined {
  return cache[keyFor(lat, lon, radiusM)];
}

/**
 * The caption. It says "near", because that is the claim the coordinates
 * support — the camera was there; nobody has told us where it was pointed.
 */
export function nearCaption(place: string, photo: PlacePhoto): string {
  return [`Photographed near ${place}`, photo.credit, photo.license, "Wikimedia Commons"]
    .filter(Boolean)
    .join(" · ");
}

/* -------------------------------------------------------------------------- */
/* Photographs OF a named trail                                               */
/* -------------------------------------------------------------------------- */

/**
 * Geosearch finds photographs taken NEAR a point. For a named trail there is
 * something much better available, and it took a measurement to find it.
 *
 * Around Limassol, geosearch at the trails' own centres returned Köppen climate
 * maps, photographs of the Earth taken from the ISS, and four views of a village
 * church. Searching Commons for the trail's NAME returned, for the same trails:
 *
 *   "Kyparissia Nature Trail"  →  Kyparissia Nature Trail 02…07.jpg
 *   "Artemis Nature Trail"     →  Troodos-artemis-nature-trail-a.jpg, +5
 *   "Kaledonia Trail"          →  Kaledonia Waterfall Trail, Cyprus …
 *
 * Photographs of the actual trail, named by the people who walked it.
 *
 * Two rules keep it honest. The name is searched as a QUOTED PHRASE, and every
 * hit must still carry the name's distinctive words in its own file name —
 * without that second check, a trail called "Akrotiri View Point" matches
 * photographs of Akrotiri on Santorini, 900 km away in another country. And
 * `nearcoord:` is deliberately NOT used: most of these files carry no
 * coordinates at all, so it filtered every true positive out.
 */

const STOPWORDS =
  /^(the|a|an|de|du|des|la|le|les|di|del|della|tis|tou|of|and|et|for|from|to|via|nature|trail|trails|path|paths|route|walk|walks|loop|circular|short|cut|shortcut|section|link|hiking|sentier|chemin|wanderweg)$/i;

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The words that actually identify this trail.
 *
 * Parentheticals go first: "ACW Circular Walk 12A (short-cut for C12)" is
 * really "ACW 12A", and the words inside the brackets are route bookkeeping
 * that matches everything and identifies nothing.
 */
function distinctiveWords(name: string): string[] {
  return norm(name.replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter((w) => w.length > 2 && !STOPWORDS.test(w));
}

/**
 * Is what remains specific enough to search on at all?
 *
 * ICEFALL showed a portrait of an American Civil War general on a footpath in
 * Buckinghamshire. The trail was "ACW Circular Walk 12"; strip the words every
 * trail shares and you are left with **acw**, three letters that mean the
 * American Civil War to Wikimedia's half-billion files and a walk around
 * Aylesbury to nobody but the mapper who drew it.
 *
 * So a name is only searchable when at least one surviving word is a real word:
 * five characters or more. "Kaledonia", "Xyliatos", "Madari" qualify. "ACW",
 * "E4", "C12", "GR20" do not — reference codes are precisely the strings that
 * collide across unrelated subjects.
 */
function isSpecificEnough(name: string): boolean {
  const words = distinctiveWords(name);
  return words.length > 0 && words.some((w) => w.length >= 5);
}

function fileMatchesName(fileName: string, name: string): boolean {
  const words = distinctiveWords(name);
  if (!isSpecificEnough(name)) return false;
  const file = norm(fileName);
  if (!words.every((w) => file.includes(w))) return false;

  /*
   * The subject filters, minus anything the trail is itself named after.
   *
   * "Xyliatos Dam Loop Trail" is a walk around a dam, so rejecting its
   * photographs for containing the word "dam" threw away the one file that was
   * genuinely of it. A word that appears in the trail's own name cannot be
   * evidence the photograph is about something else.
   */
  const ownWords = new Set(norm(name).split(" "));
  const suspicious = [NOT_A_PHOTO, NOT_OUTDOORS, NOT_LANDSCAPE, NOT_A_TRAIL].some((re) => {
    const hit = re.exec(fileName);
    return hit ? !ownWords.has(norm(hit[0])) : false;
  });
  return !suspicious;
}

/**
 * How far a geotagged photograph may sit from the trail and still be of it.
 *
 * Generous, because a trail is a LINE and these coordinates are its centre:
 * Laugavegur is 54 km end to end, so a legitimate photograph of its far end is
 * 27 km from the middle before anything is wrong.
 */
const SAME_PLACE_M = 50_000;

/**
 * Rejects a hit that is geotagged somewhere else — and ONLY then.
 *
 * The earlier attempt at this used Commons' `nearcoord:` operator and filtered
 * out every true positive, because most files carry no coordinates at all. The
 * test has to be asymmetric: no coordinates means no evidence, which is not the
 * same as evidence against. Iceland is why it is back. **Laugavegur** is both a
 * 54 km trek across the highlands and the main shopping street in Reykjavík, so
 * a name search returned a photograph of people walking past cafés and parked
 * cars, captioned as the trek. That file is geotagged, 140 km away.
 */
function geotaggedElsewhere(page: CommonsPage, near?: { lat: number; lon: number }): boolean {
  if (!near) return false;
  const at = page.coordinates?.[0];
  if (!at || typeof at.lat !== "number" || typeof at.lon !== "number") return false;
  return haversine(near, { lat: at.lat, lon: at.lon }) > SAME_PLACE_M;
}

async function commonsSearch(phrase: string, signal?: AbortSignal): Promise<CommonsPage[]> {
  const url =
    `${COMMONS}?action=query&format=json&origin=*` +
    `&generator=search&gsrnamespace=6&gsrlimit=20&gsrsearch=${encodeURIComponent(`"${phrase}"`)}` +
    `&prop=imageinfo|coordinates&iiprop=url|mediatype|extmetadata&iiurlwidth=${COMMONS_WIDTH}` +
    "&iiextmetadatafilter=Artist|LicenseShortName";

  const res = await fetch(url, { signal: withTimeout(PHOTOS_TIMEOUT_MS, signal) });
  if (!res.ok) return [];
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  return Object.values(json.query?.pages ?? {});
}

function toPhoto(page: CommonsPage): PlacePhoto | null {
  const info = page.imageinfo?.[0];
  const src = info?.thumburl ?? info?.url;
  const title = page.title.replace(/^File:/, "");
  if (!src || info?.mediatype !== "BITMAP" || NOT_A_PHOTO.test(title)) return null;
  const meta = info.extmetadata ?? {};
  return {
    src,
    credit: strip(meta.Artist?.value) || "Unknown photographer",
    license: strip(meta.LicenseShortName?.value) || "See Commons",
    pageUrl:
      info.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
    title,
  };
}

const namedCache = new Map<string, Promise<PlacePhoto[]>>();

/**
 * Photographs of a trail, by name. Empty when Commons holds none — which is the
 * correct answer for most small local paths, and better than a stand-in.
 *
 * `names` should be every name OSM knows it by: `name`, `official_name`,
 * `alt_name`. They are tried in order and the first that matches wins.
 *
 * Pass `near` — the trail's own position — wherever it is known. It is what
 * separates the Laugavegur trek from the Reykjavík street of the same name.
 */
export function photosOfNamed(
  names: string[],
  { near, signal }: { near?: { lat: number; lon: number }; signal?: AbortSignal } = {},
): Promise<PlacePhoto[]> {
  const key = [names.filter(Boolean).join("|"), near ? `@${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : ""].join("");
  if (!key) return Promise.resolve([]);
  const existing = namedCache.get(key);
  if (existing) return existing;

  const promise = (async () => {
    /*
     * Two passes per name. Trails are filed on Commons under the place, not the
     * paperwork: "Madari Circular Trail" finds nothing, while "Madari" finds
     * photographs of the ridge the trail runs along.
     *
     * The second pass is only safe because the verification step is unchanged —
     * every hit must still contain the distinctive word in its own file name, so
     * dropping "Circular Trail" from the query cannot pull in something
     * unrelated that merely mentions Madari in its description.
     */
    for (const name of names.filter(Boolean)) {
      // Nothing specific enough to search: no photograph beats a wrong one.
      if (!isSpecificEnough(name)) continue;
      const distinctive = distinctiveWords(name).join(" ");
      const queries =
        distinctive && distinctive !== norm(name) ? [name, distinctive] : [name];

      for (const query of queries) {
        try {
          const pages = await commonsSearch(query, signal);
          const photos = pages
            .filter((p) => !geotaggedElsewhere(p, near))
            .filter((p) => fileMatchesName(p.title.replace(/^File:/, ""), name))
            .map(toPhoto)
            .filter((p): p is PlacePhoto => p !== null);
          if (photos.length) return photos;
        } catch {
          // Offline or rate-limited: try the next query, then give up quietly.
        }
      }
    }
    return [];
  })();

  namedCache.set(key, promise);
  void promise.catch(() => namedCache.delete(key));
  return promise;
}

/** The caption for a photograph that IS of this trail, not merely near it. */
export function ofCaption(place: string, photo: PlacePhoto): string {
  return [place, photo.credit, photo.license, "Wikimedia Commons"].filter(Boolean).join(" · ");
}


/* -------------------------------------------------------------------------- */
/* One photograph each                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Give every subject a DIFFERENT photograph.
 *
 * Geosearch radii overlap. Two trails five kilometres apart share most of their
 * candidates, and both were independently picking the nearest one — so the list
 * showed the same picture twice under two different names, which reads as a bug
 * even when both photographs are legitimately "near" their trail.
 *
 * Greedy assignment in list order: each subject takes its own best candidate
 * that nobody above it has already taken. A subject whose every candidate is
 * spoken for gets `null` and falls back to labelled terrain, because showing a
 * duplicate would be worse.
 */
export function assignUnique<T extends { id: string }>(
  subjects: T[],
  candidatesFor: (subject: T) => PlacePhoto[],
): Map<string, PlacePhoto> {
  const taken = new Set<string>();
  const out = new Map<string, PlacePhoto>();

  for (const subject of subjects) {
    for (const photo of candidatesFor(subject)) {
      if (taken.has(photo.src)) continue;
      taken.add(photo.src);
      out.set(subject.id, photo);
      break;
    }
  }
  return out;
}
